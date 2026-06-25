/**
 * Consolidated Cron Handler — edge runtime
 * Routes all scheduled tasks via ?action= parameter
 * Replaces: daily-briefing, case-status-monitor, intake-processor,
 *           send-pending-emails, weekly-client-updates, health
 */
export const config = { runtime: 'edge' };

// ── Shared edge helpers (used across all handlers) ──────────────────────────

const _gemini = async (apiKey: string, prompt: string, temp = 0.5): Promise<string> => {
  const r = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: temp, maxOutputTokens: 1024 },
      }),
    }
  );
  const d = await r.json() as any;
  return (d.candidates?.[0]?.content?.parts?.[0]?.text || '').trim();
};

const _sbFetch = async (supabaseUrl: string, serviceKey: string, path: string, opts: RequestInit = {}): Promise<any> => {
  const r = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
    ...opts,
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      ...((opts.headers as Record<string, string>) || {}),
    },
  });
  if (!r.ok) return [];
  const text = await r.text();
  try { return JSON.parse(text); } catch { return []; }
};

const _sendEmail = async (apiKey: string, to: string, subject: string, html: string): Promise<void> => {
  if (!apiKey || !to) return;
  await fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: to }] }],
      from: { email: 'noreply@casebuddy.live', name: 'CaseBuddy AI' },
      subject,
      content: [{ type: 'text/html', value: html }],
    }),
  });
};

const _sendSms = async (sid: string, token: string, from: string, to: string, body: string): Promise<void> => {
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

const _ok = (body: object, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });


async function handle_dailyBriefing(req: Request): Promise<Response> {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && req.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return _ok({ error: 'Unauthorized' }, 401);
  }
  const GEMINI_KEY = process.env.GEMINI_API_KEY || '';
  const SB_URL     = process.env.SUPABASE_URL || '';
  const SB_KEY     = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  const SG_KEY     = process.env.SENDGRID_API_KEY || '';
  const TW_SID     = process.env.TWILIO_ACCOUNT_SID || '';
  const TW_TOKEN   = process.env.TWILIO_AUTH_TOKEN || '';
  const TW_FROM    = process.env.TWILIO_FROM_NUMBER || '';
  const OWNER_EMAIL = process.env.FIRM_OWNER_EMAIL || '';
  const OWNER_PHONE = process.env.FIRM_OWNER_PHONE || '';

  const log: string[] = [];
  const now = new Date();
  const today = now.toISOString().split('T')[0];

  try {
    // Sol: scan deadlines <= 7 days
    const deadlines = await _sbFetch(SB_URL, SB_KEY, `case_deadlines?deadline_date=lte.${new Date(Date.now() + 7*864e5).toISOString().split('T')[0]}&status=eq.pending&select=*,cases(title,client_name)&order=deadline_date.asc`);
    for (const d of (Array.isArray(deadlines) ? deadlines : [])) {
      const daysLeft = Math.ceil((new Date(d.deadline_date).getTime() - Date.now()) / 864e5);
      const msg = `⚠️ CaseBuddy Deadline Alert: "${d.title}" for ${d.cases?.client_name || 'client'} is due in ${daysLeft} day(s) on ${d.deadline_date}.`;
      if (OWNER_PHONE) await _sendSms(TW_SID, TW_TOKEN, TW_FROM, OWNER_PHONE, msg);
      await _sendEmail(SG_KEY, OWNER_EMAIL, `Deadline Alert: ${d.title}`, `<p>${msg}</p>`);
      log.push(`Sol: alerted deadline "${d.title}" (${daysLeft}d)`);
    }

    // Maya: daily firm status summary
    const cases = await _sbFetch(SB_URL, SB_KEY, 'cases?status=neq.Closed&select=id,title,status,client_name,next_court_date&order=updated_at.desc&limit=20');
    const caseList = (Array.isArray(cases) ? cases : []).map((c: any) =>
      `- ${c.title} (${c.client_name}) — Status: ${c.status}${c.next_court_date ? ', Court: ' + c.next_court_date : ''}`
    ).join('
');
    if (caseList && GEMINI_KEY) {
      const summary = await _gemini(GEMINI_KEY, `You are Maya, an AI case intake specialist. Summarize this firm's active cases for the morning briefing:
${caseList}

Provide a concise 3-5 sentence executive summary for the attorney.`);
      await _sendEmail(SG_KEY, OWNER_EMAIL, `CaseBuddy Morning Briefing — ${today}`,
        `<h2>Good Morning from CaseBuddy</h2><h3>Active Cases Summary (Maya)</h3><pre>${caseList}</pre><h3>AI Summary</h3><p>${summary}</p>`);
      log.push(`Maya: briefing sent for ${(Array.isArray(cases) ? cases : []).length} cases`);
    }

    return _ok({ ok: true, date: today, log });
  } catch (e: any) {
    return _ok({ ok: false, error: e.message }, 500);
  }
}

async function handle_caseStatusMonitor(req: Request): Promise<Response> {
  const SB_URL     = process.env.SUPABASE_URL || '';
  const SB_KEY     = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  const SG_KEY     = process.env.SENDGRID_API_KEY || '';
  const TW_SID     = process.env.TWILIO_ACCOUNT_SID || '';
  const TW_TOKEN   = process.env.TWILIO_AUTH_TOKEN || '';
  const TW_FROM    = process.env.TWILIO_FROM_NUMBER || '';
  const OWNER_EMAIL = process.env.FIRM_OWNER_EMAIL || '';
  const OWNER_PHONE = process.env.FIRM_OWNER_PHONE || '';
  const now = new Date();
  const today = now.toISOString().split('T')[0];
  const log: string[] = [];

  try {
    // Trial cases with court date today
    const trialCases = await _sbFetch(SB_URL, SB_KEY, `cases?status=eq.Trial&next_court_date=eq.${today}&select=id,title,client_name`);
    for (const c of (Array.isArray(trialCases) ? trialCases : [])) {
      const msg = `🏛️ COURT TODAY: "${c.title}" for ${c.client_name} has a court date today!`;
      if (OWNER_PHONE) await _sendSms(TW_SID, TW_TOKEN, TW_FROM, OWNER_PHONE, msg);
      await _sendEmail(SG_KEY, OWNER_EMAIL, `Court Date Today: ${c.title}`, `<p>${msg}</p>`);
      log.push(`Rex: alerted trial "${c.title}"`);
    }

    // Cases with no activity in 30+ days
    const cutoff = new Date(Date.now() - 30*864e5).toISOString();
    const staleCases = await _sbFetch(SB_URL, SB_KEY, `cases?updated_at=lt.${cutoff}&status=neq.Closed&select=id,title,client_name,updated_at`);
    for (const c of (Array.isArray(staleCases) ? staleCases : [])) {
      const days = Math.floor((Date.now() - new Date(c.updated_at).getTime()) / 864e5);
      await _sendEmail(SG_KEY, OWNER_EMAIL, `Stale Case Alert: ${c.title}`,
        `<p>Case "${c.title}" for ${c.client_name} has had no activity in ${days} days. Please review.</p>`);
      log.push(`Sol: stale case alert "${c.title}" (${days}d)`);
    }

    return _ok({ ok: true, log });
  } catch (e: any) {
    return _ok({ ok: false, error: e.message }, 500);
  }
}

async function handle_intakeProcessor(req: Request): Promise<Response> {
  const GEMINI_KEY  = process.env.GEMINI_API_KEY || '';
  const SB_URL      = process.env.SUPABASE_URL || '';
  const SB_KEY      = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  const SG_KEY      = process.env.SENDGRID_API_KEY || '';
  const OWNER_EMAIL = process.env.FIRM_OWNER_EMAIL || '';
  const log: string[] = [];

  try {
    const intakes = await _sbFetch(SB_URL, SB_KEY, 'intake_submissions?processed=eq.false&order=created_at.asc&limit=10');
    for (const intake of (Array.isArray(intakes) ? intakes : [])) {
      const prompt = `You are Maya, a legal intake specialist. Analyze this intake submission and return JSON:
{ "urgency": "high|medium|low", "practice_area": string, "summary": string, "recommended_action": string }

Submission: ${JSON.stringify(intake)}`;

      let analysis: any = { urgency: 'medium', practice_area: 'General', summary: intake.description || '', recommended_action: 'Schedule consultation' };
      if (GEMINI_KEY) {
        try {
          const raw = await _gemini(GEMINI_KEY, prompt);
          const cleaned = raw.replace(/\`\`\`json
?/g, '').replace(/\`\`\`
?/g, '').trim();
          analysis = JSON.parse(cleaned);
        } catch { /* keep defaults */ }
      }

      // Mark processed
      await _sbFetch(SB_URL, SB_KEY, `intake_submissions?id=eq.${intake.id}`, {
        method: 'PATCH',
        headers: { Prefer: 'return=minimal' } as Record<string, string>,
        body: JSON.stringify({ processed: true, ai_analysis: analysis, processed_at: new Date().toISOString() }),
      });

      // Email attorney
      await _sendEmail(SG_KEY, OWNER_EMAIL,
        `[${analysis.urgency?.toUpperCase() || 'NEW'}] Intake: ${intake.name || 'New Prospect'}`,
        `<h2>New Intake — Maya Analysis</h2>
<p><strong>Name:</strong> ${intake.name || 'Unknown'}</p>
<p><strong>Practice Area:</strong> ${analysis.practice_area}</p>
<p><strong>Urgency:</strong> ${analysis.urgency}</p>
<p><strong>Summary:</strong> ${analysis.summary}</p>
<p><strong>Recommended Action:</strong> ${analysis.recommended_action}</p>`);

      log.push(`Maya: processed intake from ${intake.name || 'unknown'} (${analysis.urgency})`);
    }
    return _ok({ ok: true, processed: log.length, log });
  } catch (e: any) {
    return _ok({ ok: false, error: e.message }, 500);
  }
}

async function handle_sendPendingEmails(req: Request): Promise<Response> {
  const SG_KEY  = process.env.SENDGRID_API_KEY || '';
  const SB_URL  = process.env.SUPABASE_URL || '';
  const SB_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  const log: string[] = [];

  const AGENTS: Record<string, { name: string; role: string }> = {
    maya:   { name: 'Maya',   role: 'Case Intake Specialist' },
    sol:    { name: 'Sol',    role: 'Deadline & Calendar Manager' },
    lex:    { name: 'Lex',    role: 'Legal Researcher' },
    rex:    { name: 'Rex',    role: 'Trial Strategist' },
    sierra: { name: 'Sierra', role: 'Client Relations' },
    doc:    { name: 'Doc',    role: 'Legal Drafter' },
  };

  try {
    const emails = await _sbFetch(SB_URL, SB_KEY, 'email_queue?status=eq.pending&order=created_at.asc&limit=20');
    for (const email of (Array.isArray(emails) ? emails : [])) {
      const agent = AGENTS[email.agent_id] || { name: 'CaseBuddy', role: 'AI Assistant' };
      try {
        await fetch('https://api.sendgrid.com/v3/mail/send', {
          method: 'POST',
          headers: { Authorization: `Bearer ${SG_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            personalizations: [{ to: [{ email: email.to_email }] }],
            from: { email: 'agents@casebuddy.live', name: `${agent.name} — CaseBuddy` },
            reply_to: { email: 'firm@casebuddy.live', name: 'CaseBuddy Law' },
            subject: email.subject,
            content: [{ type: 'text/html', value: email.body_html || email.body_text || '' }],
          }),
        });
        await _sbFetch(SB_URL, SB_KEY, `email_queue?id=eq.${email.id}`, {
          method: 'PATCH',
          headers: { Prefer: 'return=minimal' } as Record<string, string>,
          body: JSON.stringify({ status: 'sent', sent_at: new Date().toISOString() }),
        });
        log.push(`Sent "${email.subject}" to ${email.to_email}`);
      } catch (sendErr: any) {
        await _sbFetch(SB_URL, SB_KEY, `email_queue?id=eq.${email.id}`, {
          method: 'PATCH',
          headers: { Prefer: 'return=minimal' } as Record<string, string>,
          body: JSON.stringify({ status: 'failed', error: sendErr.message }),
        });
        log.push(`Failed "${email.subject}": ${sendErr.message}`);
      }
    }
    return _ok({ ok: true, sent: log.filter(l => l.startsWith('Sent')).length, log });
  } catch (e: any) {
    return _ok({ ok: false, error: e.message }, 500);
  }
}

async function handle_weeklyClientUpdates(req: Request): Promise<Response> {
  const GEMINI_KEY  = process.env.GEMINI_API_KEY || '';
  const SB_URL      = process.env.SUPABASE_URL || '';
  const SB_KEY      = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  const SG_KEY      = process.env.SENDGRID_API_KEY || '';
  const today       = new Date().toISOString().split('T')[0];
  const log: string[] = [];

  try {
    const cases = await _sbFetch(SB_URL, SB_KEY, 'cases?status=neq.Closed&select=*,clients(email,full_name)&limit=50');
    for (const c of (Array.isArray(cases) ? cases : [])) {
      const clientEmail = c.clients?.email || c.client_email;
      if (!clientEmail) continue;

      const prompt = `You are Sierra, a client relations specialist for a law firm. Write a brief, warm weekly update email to a client about their case. Keep it under 150 words, professional but friendly.
Case: ${c.title}
Status: ${c.status}
Next steps: ${c.next_steps || 'Attorney reviewing'}
Next court date: ${c.next_court_date || 'TBD'}`;

      let emailBody = `<p>Dear ${c.clients?.full_name || c.client_name || 'Valued Client'},</p><p>We wanted to update you on your case "${c.title}". Current status: ${c.status}. We will be in touch with any developments.</p><p>Best regards,<br>CaseBuddy Legal Team</p>`;
      if (GEMINI_KEY) {
        try {
          const aiText = await _gemini(GEMINI_KEY, prompt);
          emailBody = `<p>${aiText.replace(/
/g, '</p><p>')}</p>`;
        } catch { /* use default */ }
      }

      await _sendEmail(SG_KEY, clientEmail, `Weekly Update: ${c.title} — ${today}`, emailBody);
      log.push(`Sierra: updated ${c.clients?.full_name || c.client_name}`);
    }
    return _ok({ ok: true, sent: log.length, log });
  } catch (e: any) {
    return _ok({ ok: false, error: e.message }, 500);
  }
}

async function handle_health(req: Request): Promise<Response> {
  if (req.method !== 'GET') return _ok({ error: 'Method not allowed' }, 405);
  const SB_URL = process.env.SUPABASE_URL || '';
  const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  const checks: Array<{ name: string; ok: boolean; detail?: string }> = [];

  // Check env vars
  const required = ['GEMINI_API_KEY', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'SENDGRID_API_KEY'];
  for (const key of required) {
    checks.push({ name: key, ok: !!process.env[key], detail: process.env[key] ? 'set' : 'missing' });
  }

  // Ping Supabase
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

// ── Main Router ───────────────────────────────────────────────────────────────
export default async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const action = url.searchParams.get('action') || 'health';

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
