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

export const config = { runtime: 'edge' };

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

export default async function handler(req: Request): Promise<Response> {
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
