/**
 * Consolidated Cron Handler — edge runtime
 * Routes all scheduled tasks via ?action= parameter
 */
export const config = { runtime: 'edge' };

// ── Shared helpers ────────────────────────────────────────────────────────────

const _ok = (body: object, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const _gemini = async (apiKey: string, prompt: string): Promise<string> => {
  const r = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
    }
  );
  const d = await r.json() as any;
  return (d.candidates?.[0]?.content?.parts?.[0]?.text || '').trim();
};

const _sb = async (url: string, key: string, path: string, opts: RequestInit = {}): Promise<any> => {
  const r = await fetch(`${url}/rest/v1/${path}`, {
    ...opts,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      ...((opts.headers as Record<string, string>) || {}),
    },
  });
  const text = await r.text();
  try { return JSON.parse(text); } catch { return []; }
};

const _email = async (sgKey: string, to: string, subject: string, html: string): Promise<void> => {
  if (!sgKey || !to) return;
  await fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: { Authorization: `Bearer ${sgKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: to }] }],
      from: { email: 'noreply@casebuddy.live', name: 'CaseBuddy AI' },
      subject,
      content: [{ type: 'text/html', value: html }],
    }),
  });
};

const _sms = async (sid: string, token: string, from: string, to: string, body: string): Promise<void> => {
  if (!sid || !token || !from || !to) return;
  await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${btoa(`${sid}:${token}`)}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ To: to, From: from, Body: body }).toString(),
  });
};

// ── daily-briefing ────────────────────────────────────────────────────────────

async function handle_dailyBriefing(req: Request): Promise<Response> {
  const GEMINI   = process.env.GEMINI_API_KEY || '';
  const SB_URL   = process.env.SUPABASE_URL || '';
  const SB_KEY   = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  const SG_KEY   = process.env.SENDGRID_API_KEY || '';
  const TW_SID   = process.env.TWILIO_ACCOUNT_SID || '';
  const TW_TOKEN = process.env.TWILIO_AUTH_TOKEN || '';
  const TW_FROM  = process.env.TWILIO_FROM_NUMBER || '';
  const OWNER_EMAIL = process.env.FIRM_OWNER_EMAIL || '';
  const OWNER_PHONE = process.env.FIRM_OWNER_PHONE || '';
  const today    = new Date().toISOString().split('T')[0];
  const log: string[] = [];

  try {
    const sevenDays = new Date(Date.now() + 7 * 864e5).toISOString().split('T')[0];
    const deadlines = await _sb(SB_URL, SB_KEY,
      `deadlines?deadline_date=lte.${sevenDays}&status=eq.pending&order=deadline_date.asc`);
    for (const d of (Array.isArray(deadlines) ? deadlines : [])) {
      const daysLeft = Math.ceil((new Date(d.deadline_date).getTime() - Date.now()) / 864e5);
      const msg = `CaseBuddy Deadline Alert: "${d.title || d.description || 'Deadline'}" is due in ${daysLeft} day(s) on ${d.deadline_date}.`;
      if (OWNER_PHONE) await _sms(TW_SID, TW_TOKEN, TW_FROM, OWNER_PHONE, msg);
      await _email(SG_KEY, OWNER_EMAIL, `Deadline Alert: ${d.title}`, `<p>${msg}</p>`);
      log.push(`Sol: alerted deadline "${d.title}" (${daysLeft}d)`);
    }

    const cases = await _sb(SB_URL, SB_KEY,
      'cases?select=id,data&order=updated_at.desc&limit=20');
    const activeCases = (Array.isArray(cases) ? cases : []).filter((c: any) => c.data?.status !== 'Closed');
    const caseList = activeCases.map((c: any) => {
      const d = c.data || {};
      return `- ${d.title || 'Untitled'} (${d.clientName || d.client_name || 'Unknown'}) - Status: ${d.status || 'Unknown'}${d.next_court_date ? ', Court: ' + d.next_court_date : ''}`;
    }).join('\n');

    if (caseList && GEMINI) {
      const summary = await _gemini(GEMINI,
        `You are Maya, an AI case intake specialist. Summarize this firm's active cases for the morning briefing:\n${caseList}\n\nProvide a concise 3-5 sentence executive summary for the attorney.`);
      await _email(SG_KEY, OWNER_EMAIL,
        `CaseBuddy Morning Briefing - ${today}`,
        `<h2>Good Morning from CaseBuddy</h2><h3>Active Cases (Maya)</h3><pre>${caseList}</pre><h3>AI Summary</h3><p>${summary}</p>`);
      log.push(`Maya: briefing sent for ${(Array.isArray(cases) ? cases : []).length} cases`);
    }
    return _ok({ ok: true, date: today, log });
  } catch (e: any) {
    return _ok({ ok: false, error: e.message }, 500);
  }
}

// ── case-status-monitor ───────────────────────────────────────────────────────

async function handle_caseStatusMonitor(_req: Request): Promise<Response> {
  const SB_URL   = process.env.SUPABASE_URL || '';
  const SB_KEY   = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  const SG_KEY   = process.env.SENDGRID_API_KEY || '';
  const TW_SID   = process.env.TWILIO_ACCOUNT_SID || '';
  const TW_TOKEN = process.env.TWILIO_AUTH_TOKEN || '';
  const TW_FROM  = process.env.TWILIO_FROM_NUMBER || '';
  const OWNER_EMAIL = process.env.FIRM_OWNER_EMAIL || '';
  const OWNER_PHONE = process.env.FIRM_OWNER_PHONE || '';
  const today    = new Date().toISOString().split('T')[0];
  const log: string[] = [];

  try {
    const allCases = await _sb(SB_URL, SB_KEY, 'cases?select=id,data&limit=100');
    const trialCases = (Array.isArray(allCases) ? allCases : []).filter((c: any) =>
      c.data?.status === 'Trial' && c.data?.next_court_date === today);
    for (const c of trialCases) {
      const d = c.data || {};
      const msg = `COURT TODAY: "${d.title}" for ${d.clientName || d.client_name || 'client'} has a court date today!`;
      if (OWNER_PHONE) await _sms(TW_SID, TW_TOKEN, TW_FROM, OWNER_PHONE, msg);
      await _email(SG_KEY, OWNER_EMAIL, `Court Date Today: ${d.title}`, `<p>${msg}</p>`);
      log.push(`Rex: alerted trial "${d.title}"`);
    }

    const cutoff = new Date(Date.now() - 30 * 864e5).toISOString();
    const staleCases = await _sb(SB_URL, SB_KEY,
      `cases?updated_at=lt.${cutoff}&select=id,data,updated_at`);
    for (const c of (Array.isArray(staleCases) ? staleCases : []).filter((c: any) => c.data?.status !== 'Closed')) {
      const d = c.data || {};
      const days = Math.floor((Date.now() - new Date(c.updated_at).getTime()) / 864e5);
      await _email(SG_KEY, OWNER_EMAIL,
        `Stale Case Alert: ${d.title || 'Untitled'}`,
        `<p>Case "${d.title || 'Untitled'}" for ${d.clientName || d.client_name || 'client'} has had no activity in ${days} days.</p>`);
      log.push(`Sol: stale alert "${d.title || 'Untitled'}" (${days}d)`);
    }
    return _ok({ ok: true, log });
  } catch (e: any) {
    return _ok({ ok: false, error: e.message }, 500);
  }
}

// ── intake-processor ──────────────────────────────────────────────────────────

async function handle_intakeProcessor(_req: Request): Promise<Response> {
  const GEMINI  = process.env.GEMINI_API_KEY || '';
  const SB_URL  = process.env.SUPABASE_URL || '';
  const SB_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  const SG_KEY  = process.env.SENDGRID_API_KEY || '';
  const OWNER_EMAIL = process.env.FIRM_OWNER_EMAIL || '';
  const log: string[] = [];

  try {
    const intakes = await _sb(SB_URL, SB_KEY,
      'intake_cases?processed=eq.false&order=created_at.asc&limit=10');
    for (const intake of (Array.isArray(intakes) ? intakes : [])) {
      let analysis: any = {
        urgency: 'medium',
        practice_area: 'General',
        summary: intake.description || '',
        recommended_action: 'Schedule consultation',
      };

      if (GEMINI) {
        try {
          const raw = await _gemini(GEMINI,
            `You are Maya, a legal intake specialist. Analyze this intake and return JSON only: { "urgency": "high|medium|low", "practice_area": string, "summary": string, "recommended_action": string }\n\nIntake: ${JSON.stringify(intake)}`);
          const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
          analysis = JSON.parse(cleaned);
        } catch { /* keep defaults */ }
      }

      await _sb(SB_URL, SB_KEY, `intake_cases?id=eq.${intake.id}`, {
        method: 'PATCH',
        headers: { Prefer: 'return=minimal' } as Record<string, string>,
        body: JSON.stringify({ processed: true, ai_analysis: analysis, processed_at: new Date().toISOString() }),
      });

      await _email(SG_KEY, OWNER_EMAIL,
        `[${(analysis.urgency || 'new').toUpperCase()}] Intake: ${intake.name || 'New Prospect'}`,
        `<h2>New Intake - Maya Analysis</h2>` +
        `<p><strong>Name:</strong> ${intake.name || 'Unknown'}</p>` +
        `<p><strong>Practice Area:</strong> ${analysis.practice_area}</p>` +
        `<p><strong>Urgency:</strong> ${analysis.urgency}</p>` +
        `<p><strong>Summary:</strong> ${analysis.summary}</p>` +
        `<p><strong>Action:</strong> ${analysis.recommended_action}</p>`);

      log.push(`Maya: processed intake from ${intake.name || 'unknown'} (${analysis.urgency})`);
    }
    return _ok({ ok: true, processed: log.length, log });
  } catch (e: any) {
    return _ok({ ok: false, error: e.message }, 500);
  }
}

// ── send-pending-emails ───────────────────────────────────────────────────────

async function handle_sendPendingEmails(_req: Request): Promise<Response> {
  const SG_KEY = process.env.SENDGRID_API_KEY || '';
  const SB_URL = process.env.SUPABASE_URL || '';
  const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  const log: string[] = [];

  const AGENTS: Record<string, { name: string }> = {
    maya: { name: 'Maya' }, sol: { name: 'Sol' }, lex: { name: 'Lex' },
    rex: { name: 'Rex' }, sierra: { name: 'Sierra' }, doc: { name: 'Doc' },
  };

  try {
    const emails = await _sb(SB_URL, SB_KEY,
      'email_queue?status=eq.pending&order=created_at.asc&limit=20');
    for (const em of (Array.isArray(emails) ? emails : [])) {
      const agentName = (AGENTS[em.agent_id] || { name: 'CaseBuddy' }).name;
      try {
        await fetch('https://api.sendgrid.com/v3/mail/send', {
          method: 'POST',
          headers: { Authorization: `Bearer ${SG_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            personalizations: [{ to: [{ email: em.to_email }] }],
            from: { email: 'agents@casebuddy.live', name: `${agentName} - CaseBuddy` },
            reply_to: { email: 'firm@casebuddy.live', name: 'CaseBuddy Law' },
            subject: em.subject,
            content: [{ type: 'text/html', value: em.body_html || em.body_text || '' }],
          }),
        });
        await _sb(SB_URL, SB_KEY, `email_queue?id=eq.${em.id}`, {
          method: 'PATCH',
          headers: { Prefer: 'return=minimal' } as Record<string, string>,
          body: JSON.stringify({ status: 'sent', sent_at: new Date().toISOString() }),
        });
        log.push(`Sent "${em.subject}" to ${em.to_email}`);
      } catch (err: any) {
        await _sb(SB_URL, SB_KEY, `email_queue?id=eq.${em.id}`, {
          method: 'PATCH',
          headers: { Prefer: 'return=minimal' } as Record<string, string>,
          body: JSON.stringify({ status: 'failed', error: err.message }),
        });
        log.push(`Failed "${em.subject}": ${err.message}`);
      }
    }
    return _ok({ ok: true, sent: log.filter(l => l.startsWith('Sent')).length, log });
  } catch (e: any) {
    return _ok({ ok: false, error: e.message }, 500);
  }
}

// ── weekly-client-updates ─────────────────────────────────────────────────────

async function handle_weeklyClientUpdates(_req: Request): Promise<Response> {
  const GEMINI = process.env.GEMINI_API_KEY || '';
  const SB_URL = process.env.SUPABASE_URL || '';
  const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  const SG_KEY = process.env.SENDGRID_API_KEY || '';
  const today  = new Date().toISOString().split('T')[0];
  const log: string[] = [];

  try {
    const cases = await _sb(SB_URL, SB_KEY,
      'cases?select=id,data,firm_id&limit=50');
    for (const c of (Array.isArray(cases) ? cases : [])) {
      // Case data lives inside the JSONB `data` column
      const d = c.data || {};
      if (d.status === 'Closed') continue;
      const clientEmail = d.clientEmail || d.client_email;
      if (!clientEmail) continue;

      let emailBody = `<p>Dear ${d.clientName || d.client_name || 'Valued Client'},</p>` +
        `<p>We wanted to update you on your case "${d.title}". Current status: ${d.status}. ` +
        `We will be in touch with any developments.</p>` +
        `<p>Best regards,<br>CaseBuddy Legal Team</p>`;

      if (GEMINI) {
        try {
          const aiText = await _gemini(GEMINI,
            `You are Sierra, a client relations specialist for a law firm. Write a brief, warm weekly update email to a client about their case. Under 150 words, professional but friendly.\nCase: ${d.title}\nStatus: ${d.status}\nNext steps: ${d.next_steps || 'Attorney reviewing'}\nNext court date: ${d.next_court_date || 'TBD'}`);
          emailBody = `<p>${aiText.split('\n').join('</p><p>')}</p>`;
        } catch { /* use default */ }
      }

      await _email(SG_KEY, clientEmail,
        `Weekly Update: ${d.title} - ${today}`, emailBody);
      log.push(`Sierra: updated ${d.clientName || d.client_name}`);
    }
    return _ok({ ok: true, sent: log.length, log });
  } catch (e: any) {
    return _ok({ ok: false, error: e.message }, 500);
  }
}

// ── health ────────────────────────────────────────────────────────────────────

async function handle_health(_req: Request): Promise<Response> {
  const SB_URL = process.env.SUPABASE_URL || '';
  const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  const checks: Array<{ name: string; ok: boolean; detail?: string }> = [];

  for (const key of ['GEMINI_API_KEY', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'SENDGRID_API_KEY']) {
    checks.push({ name: key, ok: !!process.env[key], detail: process.env[key] ? 'set' : 'missing' });
  }

  if (SB_URL && SB_KEY) {
    try {
      const r = await fetch(`${SB_URL}/rest/v1/cases?limit=1`, {
        headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
      });
      checks.push({ name: 'supabase', ok: r.ok, detail: `HTTP ${r.status}` });
    } catch (e: any) {
      checks.push({ name: 'supabase', ok: false, detail: e.message });
    }
  }

  const allOk = checks.every(c => c.ok);
  return _ok({ ok: allOk, checks, timestamp: new Date().toISOString() }, allOk ? 200 : 503);
}

// ── Router ────────────────────────────────────────────────────────────────────

export default async function handler(req: Request): Promise<Response> {
  const url    = new URL(req.url);
  const action = url.searchParams.get('action') || 'health';

  // ── Authenticate cron requests (skip health checks) ─────────────────────
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && action !== 'health') {
    const auth = req.headers.get('authorization');
    if (auth !== `Bearer ${cronSecret}`) {
      return _ok({ error: 'Unauthorized' }, 401);
    }
  }

  switch (action) {
    case 'daily-briefing':        return handle_dailyBriefing(req);
    case 'case-status-monitor':   return handle_caseStatusMonitor(req);
    case 'intake-processor':      return handle_intakeProcessor(req);
    case 'send-pending-emails':   return handle_sendPendingEmails(req);
    case 'weekly-client-updates': return handle_weeklyClientUpdates(req);
    case 'health':                return handle_health(req);
    default: return _ok({ error: `Unknown action: ${action}` }, 404);
  }
}
// redeploy trigger 2026-07-03T02:46:11Z — investigating site-wide API 404/405 routing issue
