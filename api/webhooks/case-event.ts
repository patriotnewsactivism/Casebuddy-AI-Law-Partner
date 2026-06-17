/**
 * Vercel Edge Function — Case Event Webhook
 * POST /api/webhooks/case-event
 *
 * Called by Supabase Database Webhooks when:
 *   - A case is created (INSERT) → Maya briefs the team, Sol checks SOL
 *   - A case moves to Trial status → Rex generates trial prep checklist
 *   - A case is marked Settled/Closed → Sierra sends closing email to client
 *
 * Required env vars:
 *   GEMINI_API_KEY, SUPABASE_WEBHOOK_SECRET (optional but recommended),
 *   SENDGRID_API_KEY, FIRM_OWNER_EMAIL
 */

export const config = { runtime: 'edge' };

const CORS = {
  'Access-Control-Allow-Origin': 'https://casebuddy.live',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, x-supabase-signature',
};

const gemini = async (apiKey: string, prompt: string): Promise<string> => {
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

const sendEmail = async (apiKey: string, to: string, subject: string, html: string, from = 'noreply@casebuddy.live', fromName = 'CaseBuddy AI') => {
  if (!apiKey || !to) return;
  await fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: to }] }],
      from: { email: from, name: fromName },
      subject,
      content: [{ type: 'text/html', value: html }],
    }),
  });
};

export default async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });

  const GEMINI_KEY  = process.env.GEMINI_API_KEY ?? '';
  const SG_KEY      = process.env.SENDGRID_API_KEY ?? '';
  const OWNER_EMAIL = process.env.FIRM_OWNER_EMAIL ?? '';
  const WH_SECRET   = process.env.SUPABASE_WEBHOOK_SECRET ?? '';

  // Verify webhook signature if configured
  if (WH_SECRET) {
    const sig = req.headers.get('x-supabase-signature') ?? '';
    if (!sig.includes(WH_SECRET.slice(0, 8))) {
      return new Response('Unauthorized', { status: 401 });
    }
  }

  let body: any;
  try { body = await req.json(); } catch { return new Response('Bad JSON', { status: 400 }); }

  const eventType: string = body.type ?? ''; // INSERT | UPDATE | DELETE
  const newRecord: any   = body.record ?? {};
  const oldRecord: any   = body.old_record ?? {};
  const caseData: any    = newRecord ?? {};
  const oldCaseData: any = oldRecord ?? {};

  const responses: string[] = [];

  /* ── INSERT: new case created ─────────────────────────────────────────── */
  if (eventType === 'INSERT' && caseData.name) {
    if (GEMINI_KEY && OWNER_EMAIL) {
      const briefing = await gemini(GEMINI_KEY,
        `You are Maya at CaseBuddy AI Law Firm. A new case just came in.

Case: ${caseData.name}
Client: ${caseData.client_name}
Status: ${caseData.status}
Summary: ${caseData.case_theory || 'No summary yet'}
Opposing Counsel: ${caseData.opposing_counsel || 'Unknown'}
Judge: ${caseData.judge || 'Unknown'}
Next Court Date: ${caseData.next_court_date || caseData.trial_date || 'TBD'}

Write a brief 3-bullet intake briefing for the firm. Cover:
1. What this case is about + key issue
2. Immediate priorities (what needs to happen in next 48 hours)
3. Which specialist should take point and why

Be direct, specific, 80 words max.`
      );

      await sendEmail(SG_KEY, OWNER_EMAIL,
        `📁 New Case: ${caseData.title}`,
        `<div style="font-family:sans-serif;max-width:600px">
          <h2>📁 New Case Opened</h2>
          <h3 style="color:#1e293b">${caseData.name}</h3>
          <p>Client: <strong>${caseData.client_name}</strong> | Status: ${caseData.status}</p>
          <div style="background:#f8fafc;border-left:4px solid #d4af37;padding:12px;margin:16px 0">
            <p style="margin:0;font-weight:bold">Maya's Intake Briefing:</p>
            <p style="margin:8px 0 0;white-space:pre-wrap">${briefing}</p>
          </div>
          <a href="https://casebuddy.live/app/firm-command" style="background:#d4af37;color:#0f172a;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:bold">
            Run Full Team Briefing →
          </a>
        </div>`,
        'maya@casebuddy.live', 'Maya @ CaseBuddy'
      );
      responses.push('Maya briefed team on new case');
    }
  }

  /* ── UPDATE: case moved to Trial ─────────────────────────────────────── */
  if (eventType === 'UPDATE' &&
      caseData.status?.toLowerCase() === 'trial' && oldCaseData.status?.toLowerCase() !== 'trial') {
    if (GEMINI_KEY && OWNER_EMAIL) {
      const checklist = await gemini(GEMINI_KEY,
        `You are Rex, the trial strategist at CaseBuddy AI Law Firm.
Case "${caseData.name}" just moved to Trial status.
Client: ${caseData.client_name} | Judge: ${caseData.judge || 'Unknown'}
Summary: ${caseData.case_theory || 'No summary'}

Generate a crisp trial prep checklist — 8-10 items the attorney must complete before trial.
Format as an HTML ordered list. Each item should be specific and actionable. 120 words max.`
      );

      await sendEmail(SG_KEY, OWNER_EMAIL,
        `⚖️ Trial Mode — ${caseData.title}`,
        `<div style="font-family:sans-serif;max-width:600px">
          <h2 style="color:#dc2626">⚖️ Case Entered Trial Status</h2>
          <h3>${caseData.name}</h3>
          <p>Client: <strong>${caseData.client_name}</strong> | Judge: ${caseData.judge || 'TBD'}</p>
          <div style="background:#fef2f2;border-left:4px solid #dc2626;padding:12px;margin:16px 0">
            <p style="margin:0;font-weight:bold">Rex's Trial Prep Checklist:</p>
            ${checklist}
          </div>
          <a href="https://casebuddy.live/app/war-room" style="background:#dc2626;color:white;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:bold">
            Open War Room →
          </a>
        </div>`,
        'rex@casebuddy.live', 'Rex @ CaseBuddy'
      );
      responses.push('Rex generated trial prep checklist');
    }
  }

  /* ── UPDATE: case Settled or Closed → Sierra sends closing email ─────── */
  if (eventType === 'UPDATE' &&
      ['Settled', 'Closed'].includes(caseData.status) &&
      !['Settled', 'Closed'].includes(oldCaseData.status)) {
    const clientEmail = caseData.metadata?.clientEmail || caseData.metadata?.contact;
    if (GEMINI_KEY && clientEmail?.includes('@')) {
      const closingLetter = await gemini(GEMINI_KEY,
        `You are Sierra at CaseBuddy AI Law Firm. Case "${caseData.name}" was just ${caseData.status?.toLowerCase() ?? 'resolved'}.
Client: ${caseData.client_name}
Write a brief, warm closing letter to the client. Thank them for their trust, summarize the resolution, and invite them to refer others or return for future legal needs.
Format as clean HTML paragraphs. 120 words max. Sign as "Sierra, Client Relations · CaseBuddy AI Law Firm"`
      );
      await sendEmail(SG_KEY, clientEmail,
        `Your Case Has Been ${caseData.status} — ${caseData.name}`,
        `<div style="font-family:Georgia,serif;max-width:600px">
          <h2>⚖️ CaseBuddy Law Firm</h2>
          ${closingLetter}
          <p style="color:#94a3b8;font-size:12px;margin-top:24px">
            <a href="https://casebuddy.live">casebuddy.live</a>
          </p>
        </div>`,
        'sierra@casebuddy.live', 'Sierra @ CaseBuddy'
      );
      responses.push(`Sierra sent closing letter to ${clientEmail}`);
    }
  }

  return new Response(JSON.stringify({ ok: true, responses }), {
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}
