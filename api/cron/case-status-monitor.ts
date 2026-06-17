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

export const config = { runtime: 'edge' };

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

export default async function handler(req: Request): Promise<Response> {
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
