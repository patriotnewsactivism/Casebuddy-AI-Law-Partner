/**
 * Consolidated Cron Handler
 * Routes all scheduled tasks via ?action= parameter
 * Replaces: daily-briefing, case-status-monitor, intake-processor,
 *           send-pending-emails, weekly-client-updates, health
 */
export const config = { runtime: 'edge' };

const jsonResponse = (body: object, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });


// ── daily-briefing ──────────────────────────────────────────────
/**
 * Vercel Cron — Daily Agent Briefing
 * Schedule: every day at 08:00 America/Chicago (14:00 UTC)
 *
 * Agents that run automatically every morning:
 *   Sol  — scans all deadlines, fires SMS + email for anything ≤7 days out
 *   Maya — generates a daily firm status summary
 *   Lex  — fetches relevant case law for flagged cases
 *   Sierra — sends pending client update emails
 *
 * Required env vars:
 *   GEMINI_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
 *   SENDGRID_API_KEY, TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER,
 *   FIRM_OWNER_EMAIL, FIRM_OWNER_PHONE (optional), COURTLISTENER_API_KEY (optional)
 */


/* ── helpers ─────────────────────────────────────────────────────────────── */

const ok = (body: object) =>
  new Response(JSON.stringify(body), {
    headers: { 'Content-Type': 'application/json' },
  });

const deepseek = async (apiKey: string, prompt: string, temp = 0.5): Promise<string> => {
  // Migrated from DeepSeek (credits exhausted) to Gemini — matches the
  // client-side deepseek.ts shim that already routes through Gemini.
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

const sbFetch = async (supabaseUrl: string, serviceKey: string, table: string, params = '') => {
  const r = await fetch(`${supabaseUrl}/rest/v1/${table}?${params}`, {
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
    },
  });
  if (!r.ok) throw new Error(`Supabase ${table}: ${r.status}`);
  return r.json();
};

const sbInsert = async (supabaseUrl: string, serviceKey: string, table: string, row: object) => {
  await fetch(`${supabaseUrl}/rest/v1/${table}`, {
    method: 'POST',
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify(row),
  });
};

const sendEmail = async (apiKey: string, to: string, subject: string, html: string) => {
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

const sendSms = async (
  accountSid: string, authToken: string, from: string, to: string, body: string
) => {
  if (!accountSid || !authToken || !from || !to) return;
  await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
    {
      method: 'POST',
      headers: {
        Authorization: `Basic ${btoa(`${accountSid}:${authToken}`)}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ To: to, From: from, Body: body }).toString(),
    }
  );
};

/* ── main ────────────────────────────────────────────────────────────────── */

async function handle_dailyBriefing(req: Request): Promise<Response> {
  // Vercel cron sends a GET with a CRON_SECRET header for security
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = req.headers.get('authorization');
    if (auth !== `Bearer ${cronSecret}`) {
      return new Response('Unauthorized', { status: 401 });
    }
  }

  const GEMINI_KEY  = process.env.GEMINI_API_KEY ?? '';
  const SB_URL      = process.env.SUPABASE_URL ?? '';
  const SB_KEY      = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
  const SG_KEY      = process.env.SENDGRID_API_KEY ?? '';
  const TW_SID      = process.env.TWILIO_ACCOUNT_SID ?? '';
  const TW_TOKEN    = process.env.TWILIO_AUTH_TOKEN ?? '';
  const TW_FROM     = process.env.TWILIO_FROM_NUMBER ?? '';
  const OWNER_EMAIL = process.env.FIRM_OWNER_EMAIL ?? '';
  const OWNER_PHONE = process.env.FIRM_OWNER_PHONE ?? '';
  const CL_KEY      = process.env.COURTLISTENER_API_KEY ?? '';

  const log: string[] = [];
  const now = new Date();
  const today = now.toISOString().split('T')[0];

  /* ── 1. Load all cases from Supabase ────────────────────────────────────── */
  let cases: any[] = [];
  try {
    if (SB_URL && SB_KEY) {
      const rows = await sbFetch(SB_URL, SB_KEY, 'cases', 'select=id,name,case_type,client_name,status,next_court_date,next_deadline,opposing_counsel,judge,trial_date,case_theory&order=created_at.desc');
      cases = (rows as any[]).filter(Boolean);
      log.push(`✅ Loaded ${cases.length} cases from Supabase`);
    } else {
      log.push('⚠️  Supabase not configured — skipping case load');
    }
  } catch (e: any) {
    log.push(`❌ Case load failed: ${e.message}`);
  }

  /* ── 2. Load deadlines from Supabase agent_deadlines table ─────────────── */
  let deadlines: any[] = [];
  try {
    if (SB_URL && SB_KEY) {
      const rows = await sbFetch(SB_URL, SB_KEY, 'agent_deadlines',
        'select=*&completed=eq.false&order=due_date.asc');
      deadlines = rows as any[];
      log.push(`✅ Loaded ${deadlines.length} active deadlines`);
    }
  } catch (e: any) {
    log.push(`⚠️  agent_deadlines table not found — skipping (run migration)`);
  }

  /* ── 3. SOL — deadline alerting ─────────────────────────────────────────── */
  const alertsSent: string[] = [];
  for (const d of deadlines) {
    const daysLeft = Math.ceil(
      (new Date(d.due_date).getTime() - now.getTime()) / 86400000
    );
    if (daysLeft < 0 || daysLeft > 7) continue;

    const urgency = daysLeft <= 0 ? '🚨 OVERDUE' : daysLeft <= 3 ? '⚠️ URGENT' : '📅 DUE SOON';
    const msg = `${urgency}: ${d.label || d.case_title} — ${daysLeft <= 0 ? 'was due' : `due in ${daysLeft} day${daysLeft === 1 ? '' : 's'}`} (${d.due_date}). — Sol @ CaseBuddy`;

    // SMS to firm owner
    if (OWNER_PHONE) {
      await sendSms(TW_SID, TW_TOKEN, TW_FROM, OWNER_PHONE, msg);
      alertsSent.push(`SMS: ${d.label}`);
    }

    // Email to firm owner
    if (OWNER_EMAIL) {
      await sendEmail(SG_KEY, OWNER_EMAIL, `${urgency} Deadline — ${d.label || d.case_title}`,
        `<p style="font-family:sans-serif">${msg.replace(/\n/g, '<br>')}</p>
         <p style="font-family:sans-serif;color:#666">Log in to <a href="https://casebuddy.live/app/deadlines">CaseBuddy</a> to manage deadlines.</p>`
      );
      alertsSent.push(`Email: ${d.label}`);
    }
  }
  log.push(alertsSent.length > 0
    ? `✅ Sol sent ${alertsSent.length} deadline alerts`
    : 'ℹ️  Sol: No urgent deadlines today');

  /* ── 4. Maya — daily firm status briefing ────────────────────────────────── */
  let firmBriefing = '';
  if (GEMINI_KEY && cases.length > 0 && OWNER_EMAIL) {
    try {
      const caseList = cases.slice(0, 10).map((c: any) =>
        `• ${c.name} (${c.status}) — Client: ${c.client_name} | Next court date: ${c.next_court_date || c.trial_date || 'TBD'}`
      ).join('\n');

      firmBriefing = await deepseek(GEMINI_KEY,
        `You are Maya, intake specialist at CaseBuddy AI Law Firm. Today is ${today}.
Write a concise daily briefing for the firm owner. Cover:
1. Active caseload summary (${cases.length} total cases)
2. Any cases in Trial or with imminent court dates
3. Top 3 recommended priorities for today
4. One risk flag if anything looks overdue or missing

Cases:
${caseList}

Format as clean HTML for an email. Keep it under 300 words. Be direct and actionable.`
      );

      await sendEmail(SG_KEY, OWNER_EMAIL,
        `📋 Daily Firm Briefing — ${today}`,
        `<div style="font-family:sans-serif;max-width:600px;margin:0 auto">
          <h2 style="color:#1e293b">🏛️ CaseBuddy Daily Briefing</h2>
          <p style="color:#64748b;font-size:13px">${today} · Generated by Maya</p>
          <hr style="border:1px solid #e2e8f0">
          ${firmBriefing}
          <hr style="border:1px solid #e2e8f0">
          <p style="color:#94a3b8;font-size:12px">
            <a href="https://casebuddy.live/app">Open CaseBuddy</a> · 
            <a href="https://casebuddy.live/app/deadlines">View Deadlines</a> · 
            <a href="https://casebuddy.live/app/war-room">War Room</a>
          </p>
        </div>`
      );
      log.push('✅ Maya: daily briefing email sent');
    } catch (e: any) {
      log.push(`❌ Maya briefing failed: ${e.message}`);
    }
  } else {
    log.push('ℹ️  Maya: skipped (no cases or no email configured)');
  }

  /* ── 5. Lex — overnight case law fetch for flagged cases ─────────────────── */
  if (CL_KEY && SB_URL && SB_KEY) {
    try {
      const flagged = await sbFetch(SB_URL, SB_KEY, 'agent_research_flags',
        'select=*&researched=eq.false&limit=5');
      for (const flag of flagged as any[]) {
        const res = await fetch(
          `https://www.courtlistener.com/api/rest/v3/search/?q=${encodeURIComponent(flag.query)}&type=o&format=json&page_size=3`,
          { headers: { Authorization: `Token ${CL_KEY}` } }
        );
        if (res.ok) {
          const data = await res.json() as any;
          const results = (data.results || []).map((r: any) =>
            `• ${r.caseName} (${r.court}) — ${r.dateFiled}`
          ).join('\n');
          // Save results back to Supabase
          await fetch(`${SB_URL}/rest/v1/agent_research_flags?id=eq.${flag.id}`, {
            method: 'PATCH',
            headers: {
              apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`,
              'Content-Type': 'application/json', Prefer: 'return=minimal',
            },
            body: JSON.stringify({ researched: true, results, updated_at: now.toISOString() }),
          });
        }
      }
      log.push(`✅ Lex: processed ${(flagged as any[]).length} research flags`);
    } catch {
      log.push('ℹ️  Lex: research_flags table not found — skipping');
    }
  }

  /* ── 6. Write run log to Supabase ────────────────────────────────────────── */
  if (SB_URL && SB_KEY) {
    try {
      await sbInsert(SB_URL, SB_KEY, 'agent_cron_logs', {
        ran_at: now.toISOString(),
        job: 'daily-briefing',
        log: log.join('\n'),
        cases_loaded: cases.length,
        deadlines_checked: deadlines.length,
        alerts_sent: alertsSent.length,
      });
    } catch { /* log table may not exist yet */ }
  }

  return ok({ ok: true, ranAt: now.toISOString(), log });
}


// ── case-status-monitor ──────────────────────────────────────────────
/**
 * Vercel Cron — Rex + Sol: Case Status Monitor
 * Schedule: every hour
 *
 * - Flags cases in Trial status with court dates today → SMS alert
 * - Flags cases with no activity in 30+ days → email nudge to attorney
 * - Flags Discovery cases approaching 90-day discovery deadline
 *
 * Required env vars:
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SENDGRID_API_KEY,
 *   TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER,
 *   FIRM_OWNER_EMAIL, FIRM_OWNER_PHONE
 */


const sendSms = async (sid: string, token: string, from: string, to: string, body: string) => {
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

const sendEmail = async (apiKey: string, to: string, subject: string, html: string) => {
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

async function handle_caseStatusMonitor(req: Request): Promise<Response> {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && req.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  const SB_URL      = process.env.SUPABASE_URL ?? '';
  const SB_KEY      = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
  const SG_KEY      = process.env.SENDGRID_API_KEY ?? '';
  const TW_SID      = process.env.TWILIO_ACCOUNT_SID ?? '';
  const TW_TOKEN    = process.env.TWILIO_AUTH_TOKEN ?? '';
  const TW_FROM     = process.env.TWILIO_FROM_NUMBER ?? '';
  const OWNER_EMAIL = process.env.FIRM_OWNER_EMAIL ?? '';
  const OWNER_PHONE = process.env.FIRM_OWNER_PHONE ?? '';

  if (!SB_URL || !SB_KEY) {
    return new Response(JSON.stringify({ ok: false, error: 'Supabase not configured' }), { status: 503 });
  }

  const now = new Date();
  const today = now.toISOString().split('T')[0];
  const alerts: string[] = [];

  const casesRes = await fetch(`${SB_URL}/rest/v1/cases?select=id,name,status,client_name,opposing_counsel,judge,next_court_date,trial_date,updated_at`, {
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
  });
  const caseRows: any[] = await casesRes.json();
  const cases = caseRows.filter(Boolean);

  for (const c of cases) {
    // ── Court date TODAY → urgent SMS ──────────────────────────────────────
    if (c.next_court_date && c.next_court_date !== 'TBD' && c.next_court_date === today) {
      const msg = `🚨 COURT TODAY: ${c.name} (${c.status}) — ${c.client_name} vs ${c.opposing_counsel}. Log in to CaseBuddy War Room now.`;
      await sendSms(TW_SID, TW_TOKEN, TW_FROM, OWNER_PHONE, msg);
      await sendEmail(SG_KEY, OWNER_EMAIL, `🚨 Court Date TODAY — ${c.name}`,
        `<div style="font-family:sans-serif"><h2 style="color:#dc2626">🚨 Court Date Today</h2>
         <p><strong>${c.name}</strong> — ${c.client_name}</p>
         <p>Status: ${c.status} | Opposing: ${c.opposing_counsel} | Judge: ${c.judge}</p>
         <a href="https://casebuddy.live/app/war-room" style="background:#dc2626;color:white;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:bold">Open War Room →</a>
         </div>`);
      alerts.push(`Court today: ${c.name}`);
    }

    // ── Court date TOMORROW → SMS reminder ─────────────────────────────────
    const tomorrow = new Date(now.getTime() + 86400000).toISOString().split('T')[0];
    if (c.next_court_date === tomorrow) {
      const msg = `⏰ COURT TOMORROW: ${c.name} — prep in the War Room now. casebuddy.live/app/war-room`;
      await sendSms(TW_SID, TW_TOKEN, TW_FROM, OWNER_PHONE, msg);
      alerts.push(`Court tomorrow: ${c.name}`);
    }

    // ── Stale case (no update in 30 days) ──────────────────────────────────
    const updatedAt = c.updatedAt || c.createdAt || c.id;
    if (updatedAt) {
      const daysSinceUpdate = Math.floor(
        (now.getTime() - new Date(parseInt(c.id) || updatedAt).getTime()) / 86400000
      );
      if (daysSinceUpdate >= 30 && ['active', 'discovery', 'pre-trial', 'pre_trial'].includes(c.status?.toLowerCase())) {
        await sendEmail(SG_KEY, OWNER_EMAIL, `⚠️ Stale Case — ${c.name} (${daysSinceUpdate}d inactive)`,
          `<div style="font-family:sans-serif">
           <h3>⚠️ Case May Need Attention</h3>
           <p><strong>${c.name}</strong> (${c.status}) has had no recorded updates in ${daysSinceUpdate} days.</p>
           <p>Client: ${c.client_name} | Opposing: ${c.opposing_counsel}</p>
           <a href="https://casebuddy.live/app/cases" style="background:#f59e0b;color:#0f172a;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:bold">Review Case →</a>
           </div>`);
        alerts.push(`Stale: ${c.name} (${daysSinceUpdate}d)`);
      }
    }
  }

  return new Response(JSON.stringify({ ok: true, alerts, casesChecked: cases.length }), {
    headers: { 'Content-Type': 'application/json' },
  });
}


// ── intake-processor ──────────────────────────────────────────────
/**
 * Vercel Cron — Maya: Intake Processor
 * Schedule: every 15 minutes
 *
 * Maya monitors new unprocessed intake submissions, runs AI scoring,
 * routes to the right specialist, and emails the firm owner immediately.
 *
 * Required env vars:
 *   GEMINI_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
 *   SENDGRID_API_KEY, FIRM_OWNER_EMAIL
 */


const gemini = async (apiKey: string, prompt: string): Promise<string> => {
  // Migrated from DeepSeek (credits exhausted) to Gemini — matches the
  // client-side deepseek.ts shim that already routes through Gemini.
  const r = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.3, maxOutputTokens: 1024 },
      }),
    }
  );
  const d = await r.json() as any;
  return (d.candidates?.[0]?.content?.parts?.[0]?.text || '').trim();
};

const sendEmail = async (apiKey: string, to: string, subject: string, html: string) => {
  if (!apiKey || !to) return;
  await fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: to }] }],
      from: { email: 'maya@casebuddy.live', name: 'Maya @ CaseBuddy' },
      subject,
      content: [{ type: 'text/html', value: html }],
    }),
  });
};

const sbFetch = (url: string, key: string, path: string) =>
  fetch(`${url}/rest/v1/${path}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  }).then(r => r.json());

const sbPatch = (url: string, key: string, table: string, id: string, data: object) =>
  fetch(`${url}/rest/v1/${table}?id=eq.${id}`, {
    method: 'PATCH',
    headers: {
      apikey: key, Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json', Prefer: 'return=minimal',
    },
    body: JSON.stringify(data),
  });

async function handle_intakeProcessor(req: Request): Promise<Response> {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && req.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  const GEMINI_KEY  = process.env.GEMINI_API_KEY ?? '';
  const SB_URL      = process.env.SUPABASE_URL ?? '';
  const SB_KEY      = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
  const SG_KEY      = process.env.SENDGRID_API_KEY ?? '';
  const OWNER_EMAIL = process.env.FIRM_OWNER_EMAIL ?? '';

  if (!GEMINI_KEY || !SB_URL || !SB_KEY) {
    return new Response(JSON.stringify({ ok: false, error: 'Missing env vars' }), { status: 503 });
  }

  // Fetch unprocessed intakes
  const rows: any[] = await sbFetch(SB_URL, SB_KEY,
    'intake_cases?select=*&status=eq.new&order=created_at.asc&limit=10');

  if (!rows.length) {
    return new Response(JSON.stringify({ ok: true, processed: 0 }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  let processed = 0;
  for (const intake of rows) {
    try {
      // Mark as processing immediately to avoid double-processing
      await sbPatch(SB_URL, SB_KEY, 'intake_cases', intake.id, { status: 'processing' });

      const analysis = await gemini(GEMINI_KEY,
        `You are Maya, intake specialist at CaseBuddy AI Law Firm. Analyze this potential client intake.

Name: ${intake.full_name}
Contact: ${intake.contact}
Matter Type: ${intake.matter_type}
Jurisdiction: ${intake.jurisdiction}
Summary: ${intake.summary}

Respond in JSON with these exact fields:
{
  "score": <0-100 integer — case viability>,
  "urgency": "<low|medium|high|critical>",
  "disposition": "<accepted|review|denied>",
  "recommended_specialist": "<tort|criminal|family|corporate|immigration|employment|estate|ip|real_estate|civil_rights|bankruptcy|tax>",
  "recommended_agent_id": "<maya|lex|sol|rex|sierra|doc|jules|max>",
  "flags": ["<concern1>", "<concern2>"],
  "assessment": "<2-3 sentence plain English assessment of the case>",
  "action": "<what the firm should do next>"
}`
      );

      let parsed: any = {};
      try {
        const match = analysis.match(/\{[\s\S]*\}/);
        if (match) parsed = JSON.parse(match[0]);
      } catch { /* use defaults */ }

      const score = typeof parsed.score === 'number' ? parsed.score : 50;
      const disposition = ['accepted', 'review', 'denied'].includes(parsed.disposition)
        ? parsed.disposition : 'review';

      // Update Supabase row with AI assessment
      await sbPatch(SB_URL, SB_KEY, 'intake_cases', intake.id, {
        status: disposition === 'accepted' ? 'accepted' : 'review',
        disposition,
        score,
        urgency: parsed.urgency || 'medium',
        recommended_department: parsed.recommended_specialist || '',
        recommended_agent_id: parsed.recommended_agent_id || 'maya',
        score_detail: parsed,
        processed_at: new Date().toISOString(),
      });

      // Email firm owner with new lead alert
      if (OWNER_EMAIL) {
        const badge = disposition === 'accepted' ? '✅ ACCEPT' : disposition === 'denied' ? '❌ DENY' : '👀 REVIEW';
        const urgencyEmoji = { critical: '🚨', high: '⚠️', medium: '📋', low: 'ℹ️' }[parsed.urgency as string] || '📋';
        await sendEmail(SG_KEY, OWNER_EMAIL,
          `${urgencyEmoji} New Intake: ${intake.full_name} — ${intake.matter_type} [${badge}]`,
          `<div style="font-family:sans-serif;max-width:600px;margin:0 auto">
            <h2 style="color:#1e293b">🏛️ New Intake — Maya's Assessment</h2>
            <table style="width:100%;border-collapse:collapse;font-size:14px">
              <tr><td style="padding:6px;color:#64748b">Client</td><td style="padding:6px;font-weight:bold">${intake.full_name}</td></tr>
              <tr style="background:#f8fafc"><td style="padding:6px;color:#64748b">Contact</td><td style="padding:6px">${intake.contact}</td></tr>
              <tr><td style="padding:6px;color:#64748b">Matter</td><td style="padding:6px">${intake.matter_type}</td></tr>
              <tr style="background:#f8fafc"><td style="padding:6px;color:#64748b">Jurisdiction</td><td style="padding:6px">${intake.jurisdiction || 'Not specified'}</td></tr>
              <tr><td style="padding:6px;color:#64748b">Viability Score</td><td style="padding:6px;font-weight:bold;font-size:18px">${score}/100</td></tr>
              <tr style="background:#f8fafc"><td style="padding:6px;color:#64748b">Disposition</td><td style="padding:6px;font-weight:bold">${badge}</td></tr>
              <tr><td style="padding:6px;color:#64748b">Urgency</td><td style="padding:6px">${urgencyEmoji} ${parsed.urgency || 'medium'}</td></tr>
              <tr style="background:#f8fafc"><td style="padding:6px;color:#64748b">Recommended Specialist</td><td style="padding:6px">${parsed.recommended_specialist || 'General'}</td></tr>
            </table>
            <div style="background:#f0f9ff;border-left:4px solid #3b82f6;padding:12px;margin:16px 0;border-radius:4px">
              <p style="margin:0;font-style:italic">"${parsed.assessment || intake.summary}"</p>
            </div>
            <p><strong>Maya's recommended action:</strong> ${parsed.action || 'Review and schedule consultation'}</p>
            <a href="https://casebuddy.live/app/intake-inbox" style="display:inline-block;background:#d4af37;color:#0f172a;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:bold;margin-top:8px">
              Open Intake Inbox →
            </a>
          </div>`
        );
      }

      processed++;
    } catch (e: any) {
      // Reset status on error
      await sbPatch(SB_URL, SB_KEY, 'intake_cases', intake.id, { status: 'new' });
    }
  }

  return new Response(JSON.stringify({ ok: true, processed }), {
    headers: { 'Content-Type': 'application/json' },
  });
}


// ── send-pending-emails ──────────────────────────────────────────────
import type { VercelRequest, VercelResponse } from '@vercel/node';

const SG_KEY  = process.env.SENDGRID_API_KEY          || '';
const SB_URL  = process.env.SUPABASE_URL              || '';
const SB_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const CRON_SECRET = process.env.CRON_SECRET           || '';

const AGENTS: Record<string, { name: string; role: string }> = {
  maya:   { name: 'Maya',   role: 'Case Intake Specialist' },
  sol:    { name: 'Sol',    role: 'Deadline & Calendar Manager' },
  lex:    { name: 'Lex',    role: 'Legal Researcher' },
  rex:    { name: 'Rex',    role: 'Trial Strategist' },
  sierra: { name: 'Sierra', role: 'Client Relations' },
  doc:    { name: 'Doc',    role: 'Legal Drafter' },
};

async function sbFetch(path: string, opts: RequestInit = {}) {
  return fetch(`${SB_URL}/rest/v1/${path}`, {
    ...opts,
    headers: {
      apikey: SB_KEY,
      Authorization: `Bearer ${SB_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      ...(opts.headers || {}),
    },
  });
}

async function sendViaSendGrid(to: string, toName: string, agentId: string, subject: string, body: string) {
  if (!SG_KEY) { console.warn('[sendgrid] no key'); return false; }
  const agent = AGENTS[agentId] || AGENTS['maya'];
  const htmlBody = body
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\n/g, '<br>');

  const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${SG_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      personalizations: [{ to: [toName ? { email: to, name: toName } : { email: to }] }],
      from: { email: `${agentId}@casebuddy.live`, name: `${agent.name} · CaseBuddy` },
      reply_to: { email: `${agentId}@casebuddy.live`, name: agent.name },
      subject,
      content: [
        { type: 'text/plain', value: body },
        {
          type: 'text/html',
          value: `<div style="font-family:Arial,sans-serif;max-width:600px;line-height:1.7;color:#1e293b">
            <div style="background:#0f172a;padding:16px 24px;border-radius:8px 8px 0 0">
              <span style="color:#f59e0b;font-size:18px">⚖️</span>
              <span style="color:#f8fafc;font-weight:600;font-size:15px;margin-left:8px">CaseBuddy AI Law</span>
            </div>
            <div style="padding:24px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 8px 8px">
              ${htmlBody}
              <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0">
              <p style="color:#94a3b8;font-size:12px;margin:0">
                <strong style="color:#64748b">${agent.name}</strong> · ${agent.role} · CaseBuddy AI Law<br>
                Reply directly to this email — ${agent.name} will read and respond.
              </p>
            </div>
          </div>`,
        },
      ],
    }),
  });

  if (!res.ok) {
    console.error('[sendgrid] failed:', await res.text());
    return false;
  }
  return true;
}

async function handle_sendPendingEmails(req: VercelRequest, res: VercelResponse) {
  // Allow Vercel cron (no auth header) or manual call with secret
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader !== `Bearer ${CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (!SB_URL || !SB_KEY) return res.status(503).json({ error: 'Supabase not configured' });

  try {
    const now = new Date().toISOString();

    // Fetch all pending outbound emails where send_at <= now
    const fetchRes = await sbFetch(
      `firm_emails?direction=eq.outbound&metadata->>status=eq.pending&metadata->>send_at=lte.${now}&limit=20`
    );

    if (!fetchRes.ok) {
      const err = await fetchRes.text();
      console.error('[send-pending] fetch failed:', err);
      return res.status(502).json({ error: err });
    }

    const pending: any[] = await fetchRes.json();
    console.log(`[send-pending] Found ${pending.length} pending email(s)`);

    const results = [];
    for (const email of pending) {
      const meta = email.metadata || {};
      const toName = meta.to_name || '';

      // Mark as sending first (prevent double-send)
      await sbFetch(`firm_emails?id=eq.${email.id}`, {
        method: 'PATCH',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({ metadata: { ...meta, status: 'sending' } }),
      });

      const sent = await sendViaSendGrid(
        email.to_address,
        toName,
        email.agent_id,
        email.subject,
        email.body
      );

      // Mark as sent or failed
      await sbFetch(`firm_emails?id=eq.${email.id}`, {
        method: 'PATCH',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({
          metadata: { ...meta, status: sent ? 'sent' : 'failed', sent_at: new Date().toISOString() },
        }),
      });

      results.push({ id: email.id, to: email.to_address, agent: email.agent_id, sent });
      console.log(`[send-pending] ${sent ? '✅' : '❌'} ${email.agent_id} → ${email.to_address}`);
    }

    return res.status(200).json({ ok: true, processed: results.length, results });
  } catch (err: any) {
    console.error('[send-pending]', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
}


// ── weekly-client-updates ──────────────────────────────────────────────
/**
 * Vercel Cron — Sierra: Weekly Client Update Emails
 * Schedule: every Friday at 09:00 America/Chicago (15:00 UTC)
 *
 * Sierra reviews every active case and sends a personalized status update
 * email to each client whose email is on file.
 *
 * Required env vars:
 *   GEMINI_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SENDGRID_API_KEY
 */


const gemini = async (apiKey: string, prompt: string): Promise<string> => {
  const r = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.7 },
      }),
    }
  );
  const d = await r.json() as any;
  return (d.candidates?.[0]?.content?.parts?.[0]?.text || '').trim();
};

const sendEmail = async (apiKey: string, to: string, subject: string, html: string, fromName = 'Sierra @ CaseBuddy') => {
  if (!apiKey || !to) return false;
  const r = await fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: to }] }],
      from: { email: 'sierra@casebuddy.live', name: fromName },
      subject,
      content: [{ type: 'text/html', value: html }],
    }),
  });
  return r.ok;
};

async function handle_weeklyClientUpdates(req: Request): Promise<Response> {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && req.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  const GEMINI_KEY = process.env.GEMINI_API_KEY ?? '';
  const SB_URL     = process.env.SUPABASE_URL ?? '';
  const SB_KEY     = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
  const SG_KEY     = process.env.SENDGRID_API_KEY ?? '';

  if (!GEMINI_KEY || !SB_URL || !SB_KEY || !SG_KEY) {
    return new Response(JSON.stringify({ ok: false, error: 'Missing required env vars' }), { status: 503 });
  }

  const today = new Date().toISOString().split('T')[0];
  const log: string[] = [];

  // Load active cases
  const casesRes = await fetch(`${SB_URL}/rest/v1/cases?select=id,name,case_type,client_name,status,next_court_date,trial_date,opposing_counsel,judge,case_theory,metadata`, {
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
  });
  const caseRows: any[] = await casesRes.json();
  const activeCases = caseRows
    .filter((c: any) => c && ['active', 'discovery', 'pre-trial', 'pre_trial', 'trial'].includes(c.status?.toLowerCase()));

  log.push(`Loaded ${activeCases.length} active cases`);

  let sent = 0;
  for (const c of activeCases) {
    // Only send if we have a client email
    const clientEmail = c.metadata?.clientEmail || c.metadata?.contact || c.metadata?.email;
    if (!clientEmail || !clientEmail.includes('@')) continue;

    try {
      const letter = await gemini(GEMINI_KEY,
        `You are Sierra, a warm and professional client relations specialist at CaseBuddy AI Law Firm.
Write a brief weekly status update email to ${c.client_name} about their case.

Case: ${c.name}
Case Type: ${c.case_type || 'General'}
Status: ${c.status}
Case Theory: ${c.case_theory || 'No summary available'}
Next court date: ${c.next_court_date || c.trial_date || 'TBD'}
Opposing counsel: ${c.opposing_counsel || 'Unknown'}

Guidelines:
- Warm, professional tone — not cold or robotic
- 3-4 short paragraphs: current status, what the team is working on, next steps, and a closing
- Mention the next court date if known
- End with your direct line or an invitation to call
- Format as clean HTML paragraphs (no markdown)
- Sign as "Sierra, Client Relations · CaseBuddy AI Law Firm"
- Do NOT fabricate specific legal developments — stay factual based on the case data above`
      );

      const emailHtml = `
        <div style="font-family:Georgia,serif;max-width:600px;margin:0 auto;color:#1e293b">
          <div style="border-bottom:2px solid #d4af37;padding-bottom:12px;margin-bottom:24px">
            <h2 style="margin:0;color:#0f172a">⚖️ CaseBuddy Law Firm</h2>
            <p style="margin:4px 0 0;color:#64748b;font-size:13px">Weekly Case Update · ${today}</p>
          </div>
          ${letter}
          <div style="border-top:1px solid #e2e8f0;margin-top:24px;padding-top:16px;font-size:12px;color:#94a3b8">
            <p>This update was prepared by Sierra, your AI Client Relations specialist at CaseBuddy.</p>
            <p><a href="https://casebuddy.live" style="color:#d4af37">casebuddy.live</a></p>
          </div>
        </div>`;

      const success = await sendEmail(SG_KEY, clientEmail,
        `Weekly Update: ${c.name} — ${today}`, emailHtml);

      if (success) {
        sent++;
        log.push(`✅ Sierra sent update to ${clientEmail} for "${c.title}"`);
      }
    } catch (e: any) {
      log.push(`❌ Failed for "${c.title}": ${e.message}`);
    }
  }

  return new Response(JSON.stringify({ ok: true, sent, log }), {
    headers: { 'Content-Type': 'application/json' },
  });
}


// ── health ──────────────────────────────────────────────
/**
 * Vercel Cron — Health Check
 * Schedule: every 15 minutes
 *
 * Validates that critical env vars are set and Supabase is reachable.
 * Returns structured JSON so external monitors (UptimeRobot, Better Uptime,
 * etc.) can alert when things break.
 *
 * GET /api/cron/health
 */


interface CheckResult {
  name: string;
  ok: boolean;
  detail?: string;
}

const json = (body: object, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

async function handle_health(req: Request): Promise<Response> {
  if (req.method !== 'GET') return json({ error: 'Method not allowed' }, 405);

  const checks: CheckResult[] = [];

  // 1. Required env vars
  const required = [
    'GEMINI_API_KEY',
    'SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
  ];
  for (const key of required) {
    checks.push({
      name: `env:${key}`,
      ok: !!process.env[key],
      detail: process.env[key] ? 'set' : 'MISSING',
    });
  }

  // 2. Optional but important env vars
  const optional = [
    'CRON_SECRET',
    'RESEND_API_KEY',
    'FIRM_OWNER_EMAIL',
    'DEEPGRAM_API_KEY',
  ];
  for (const key of optional) {
    checks.push({
      name: `env:${key}`,
      ok: !!process.env[key],
      detail: process.env[key] ? 'set' : 'not set (optional)',
    });
  }

  // 3. Supabase connectivity
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (supabaseUrl && supabaseKey) {
    try {
      const resp = await fetch(`${supabaseUrl}/rest/v1/intake_cases?select=id&limit=1`, {
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
        },
      });
      checks.push({
        name: 'supabase:intake_cases',
        ok: resp.ok,
        detail: resp.ok ? `reachable (${resp.status})` : `error (${resp.status})`,
      });
    } catch (err: any) {
      checks.push({
        name: 'supabase:intake_cases',
        ok: false,
        detail: `unreachable: ${err?.message}`,
      });
    }
  }

  // 4. Gemini API reachability
  const geminiKey = process.env.GEMINI_API_KEY;
  if (geminiKey) {
    try {
      const resp = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${geminiKey}`,
      );
      checks.push({
        name: 'gemini:api',
        ok: resp.ok,
        detail: resp.ok ? 'reachable' : `error (${resp.status})`,
      });
    } catch (err: any) {
      checks.push({
        name: 'gemini:api',
        ok: false,
        detail: `unreachable: ${err?.message}`,
      });
    }
  }

  const allOk = checks.every(c => c.ok || c.detail?.includes('optional'));
  const criticalFail = checks.filter(c => !c.ok && !c.detail?.includes('optional'));

  return json(
    {
      status: allOk ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      checks,
      ...(criticalFail.length > 0 && {
        critical_failures: criticalFail.map(c => c.name),
      }),
    },
    allOk ? 200 : 503,
  );
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
    default: return jsonResponse({ error: `Unknown action: ${action}` }, 404);
  }
}
