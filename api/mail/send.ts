import type { VercelRequest, VercelResponse } from '@vercel/node';

const SG_KEY = process.env.SENDGRID_API_KEY || '';
const SB_URL = process.env.SUPABASE_URL     || '';
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const AGENTS: Record<string, { name: string; role: string }> = {
  maya:   { name: 'Maya',   role: 'Case Intake Specialist' },
  sol:    { name: 'Sol',    role: 'Deadline & Calendar' },
  lex:    { name: 'Lex',    role: 'Legal Researcher' },
  rex:    { name: 'Rex',    role: 'Trial Strategist' },
  sierra: { name: 'Sierra', role: 'Client Relations' },
  doc:    { name: 'Doc',    role: 'Legal Drafter' },
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).end();

  const { from, to, subject, body } = req.body as {
    from: string; to: string; subject: string; body: string;
  };

  if (!from || !to || !subject || !body) {
    return res.status(400).json({ ok: false, error: 'Missing fields' });
  }

  const agent = AGENTS[from] || AGENTS['maya'];
  const htmlBody = body.replace(/\n/g, '<br>');

  if (!SG_KEY) {
    return res.status(503).json({ ok: false, error: 'SendGrid not configured — add SENDGRID_API_KEY to Vercel env vars' });
  }

  try {
    const sgRes = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${SG_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: to }] }],
        from: { email: `${from}@casebuddy.live`, name: `${agent.name} · CaseBuddy` },
        reply_to: { email: `${from}@casebuddy.live`, name: agent.name },
        subject,
        content: [
          { type: 'text/plain', value: body },
          {
            type: 'text/html',
            value: `<div style="font-family:Arial,sans-serif;max-width:600px;line-height:1.7;color:#1e293b">
              <div style="background:#0f172a;padding:16px 24px;border-radius:8px 8px 0 0">
                <span style="color:#f59e0b;font-weight:bold;font-size:16px">⚖️ CaseBuddy AI Law</span>
              </div>
              <div style="padding:24px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 8px 8px">
                ${htmlBody}
                <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0">
                <p style="color:#94a3b8;font-size:12px;margin:0">
                  ${agent.name} · ${agent.role} · CaseBuddy AI Law<br>
                  Reply to this email and ${agent.name} will respond automatically.
                </p>
              </div>
            </div>`,
          },
        ],
      }),
    });

    if (!sgRes.ok) {
      const err = await sgRes.text();
      return res.status(502).json({ ok: false, error: `SendGrid error: ${err}` });
    }

    // Save to Supabase
    if (SB_URL && SB_KEY) {
      await fetch(`${SB_URL}/rest/v1/firm_emails`, {
        method: 'POST',
        headers: {
          apikey: SB_KEY,
          Authorization: `Bearer ${SB_KEY}`,
          'Content-Type': 'application/json',
          Prefer: 'return=minimal',
        },
        body: JSON.stringify({
          direction: 'outbound',
          from_address: `${from}@casebuddy.live`,
          from_name: agent.name,
          to_address: to,
          agent_id: from,
          subject,
          body,
          intent: 'general',
          received_at: new Date().toISOString(),
        }),
      });
    }

    return res.status(200).json({ ok: true, sent: true });
  } catch (err: any) {
    return res.status(500).json({ ok: false, error: err.message });
  }
}
