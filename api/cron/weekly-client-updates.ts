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

export const config = { runtime: 'edge' };

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

export default async function handler(req: Request): Promise<Response> {
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
  const casesRes = await fetch(`${SB_URL}/rest/v1/cases?select=data,firm_id`, {
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
  });
  const caseRows: any[] = await casesRes.json();
  const activeCases = caseRows
    .map((r: any) => r.data)
    .filter((c: any) => c && ['Active', 'Discovery', 'Pre-Trial', 'Trial'].includes(c.status));

  log.push(`Loaded ${activeCases.length} active cases`);

  let sent = 0;
  for (const c of activeCases) {
    // Only send if we have a client email
    const clientEmail = c.clientEmail || c.contact;
    if (!clientEmail || !clientEmail.includes('@')) continue;

    try {
      const letter = await gemini(GEMINI_KEY,
        `You are Sierra, a warm and professional client relations specialist at CaseBuddy AI Law Firm.
Write a brief weekly status update email to ${c.client} about their case.

Case: ${c.title}
Status: ${c.status}
Summary: ${c.summary || 'No summary available'}
Next court date: ${c.nextCourtDate || 'TBD'}
Opposing counsel: ${c.opposingCounsel || 'Unknown'}

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
        `Weekly Update: ${c.title} — ${today}`, emailHtml);

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
