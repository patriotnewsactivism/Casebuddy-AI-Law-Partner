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

export default async function handler(req: VercelRequest, res: VercelResponse) {
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
