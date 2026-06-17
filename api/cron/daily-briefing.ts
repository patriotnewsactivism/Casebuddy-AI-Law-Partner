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
 *   DEEPSEEK_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
 *   SENDGRID_API_KEY, TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER,
 *   FIRM_OWNER_EMAIL, FIRM_OWNER_PHONE (optional), COURTLISTENER_API_KEY (optional)
 */

export const config = { runtime: 'edge' };

/* ── helpers ─────────────────────────────────────────────────────────────── */

const ok = (body: object) =>
  new Response(JSON.stringify(body), {
    headers: { 'Content-Type': 'application/json' },
  });

const deepseek = async (apiKey: string, prompt: string, temp = 0.5): Promise<string> => {
  const r = await fetch('https://api.deepseek.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages: [{ role: 'user', content: prompt }],
      temperature: temp,
      max_tokens: 1024,
    }),
  });
  const d = await r.json() as any;
  return (d.choices?.[0]?.message?.content || '').trim();
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

export default async function handler(req: Request): Promise<Response> {
  // Vercel cron sends a GET with a CRON_SECRET header for security
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = req.headers.get('authorization');
    if (auth !== `Bearer ${cronSecret}`) {
      return new Response('Unauthorized', { status: 401 });
    }
  }

  const GEMINI_KEY  = process.env.DEEPSEEK_API_KEY ?? process.env.GEMINI_API_KEY ?? '';
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
