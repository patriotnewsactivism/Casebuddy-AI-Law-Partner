/**
 * Consolidated Webhooks Handler
 * Routes via ?action= parameter
 * Replaces: webhooks/case-event, webhooks/email-inbound
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';

// ── case-event ────────────────────────────────────────────────────────────────
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

// ── Environment variables (module-level for edge functions) ─────────────────
const GEMINI_KEY  = process.env.GEMINI_API_KEY        ?? '';
const SG_KEY      = process.env.SENDGRID_API_KEY      ?? '';
const OWNER_EMAIL = process.env.FIRM_OWNER_EMAIL       ?? '';
const WH_SECRET   = process.env.SUPABASE_WEBHOOK_SECRET ?? '';
const SB_URL      = process.env.SUPABASE_URL           ?? '';
const SB_KEY      = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';


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

async function handleCaseEvent(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });

  // env vars declared at module level above

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


// ── email-inbound ─────────────────────────────────────────────────────────────

const FIRM_EMAIL = OWNER_EMAIL;
const REPLY_DELAY_MS = 3 * 60 * 1000; // 3 minutes

const AGENTS: Record<string, { name: string; role: string; personality: string }> = {
  maya:   { name: 'Maya',   role: 'Case Intake Specialist',      personality: 'Warm, efficient, direct. Gets the key facts quickly. Short, actionable responses. Never wastes words.' },
  sol:    { name: 'Sol',    role: 'Deadline & Calendar Manager', personality: 'Precise, urgent when needed. Always gives specific dates and actions. No fluff.' },
  lex:    { name: 'Lex',    role: 'Legal Researcher',            personality: 'Analytical, confident. Cites specific statutes and cases. Explains complexity clearly.' },
  rex:    { name: 'Rex',    role: 'Trial Strategist',            personality: 'Bold, direct, strategic. Thinks about outcomes. Cuts to what matters.' },
  sierra: { name: 'Sierra', role: 'Client Relations',            personality: 'Warm, empathetic, reassuring. Makes clients feel heard and cared for.' },
  doc:    { name: 'Doc',    role: 'Legal Drafter',               personality: 'Methodical, precise, thorough. Asks clarifying questions before drafting.' },
};

// ── Intake fields we need from every new contact ──────────────────────────────
const INTAKE_FIELDS = [
  'full name',
  'best phone number to reach you',
  'best time / timezone to call',
  'brief description of your legal matter',
];

function missingIntakeFields(body: string, fromName: string): string[] {
  const lower = body.toLowerCase();
  const missing: string[] = [];
  // Check name — if fromName is just an email address, ask for name
  if (!fromName || fromName.includes('@') || fromName.length < 3) missing.push('full name');
  // Check phone
  if (!/\d{3}[\s.\-]\d{3}[\s.\-]\d{4}|\(\d{3}\)[\s.\-]?\d{3}[\s.\-]\d{4}|\+1\s?\d{10}/.test(body)) missing.push('best phone number');
  // Check time preference
  if (!/best time|call me|reach me|available|timezone|morning|afternoon|evening|am|pm/.test(lower)) missing.push('best time to call');
  return missing;
}

function detectAgent(toField: string): string {
  const lower = toField.toLowerCase();
  for (const id of Object.keys(AGENTS)) {
    if (lower.includes(id + '@')) return id;
  }
  return 'maya';
}

function classifyIntent(subject: string, body: string): string {
  const t = (subject + ' ' + body).toLowerCase();
  if (/deadline|court date|filing|due date|statute of limitations/.test(t)) return 'deadline';
  if (/research|case law|statute|precedent|citation/.test(t))               return 'research';
  if (/trial|witness|cross.exam|opening|closing|strategy/.test(t))          return 'trial';
  if (/draft|contract|motion|agreement|letter|document/.test(t))            return 'drafting';
  if (/client|update|status|how is my case/.test(t))                        return 'client-update';
  return 'intake';
}

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

async function getThreadHistory(fromEmail: string, agentId: string, limit = 8): Promise<Array<{ role: 'user' | 'agent'; content: string }>> {
  try {
    const res = await sbFetch(
      `firm_emails?from_address=eq.${encodeURIComponent(fromEmail)}&agent_id=eq.${agentId}&order=received_at.asc&limit=${limit}`
    );
    if (!res.ok) return [];
    const rows: any[] = await res.json();
    return rows.map(r => ({
      role: r.direction === 'inbound' ? 'user' : 'agent',
      content: r.body?.slice(0, 800) || '',
    }));
  } catch { return []; }
}

async function saveEmail(record: {
  direction: 'inbound' | 'outbound';
  from_address: string; from_name: string;
  to_address: string; agent_id: string;
  subject: string; body: string; intent: string;
  metadata?: object;
}) {
  if (!SB_URL || !SB_KEY) return null;
  try {
    const res = await sbFetch('firm_emails', {
      method: 'POST',
      body: JSON.stringify({ ...record, received_at: new Date().toISOString() }),
    });
    const rows = await res.json() as any[];
    return rows?.[0]?.id || null;
  } catch { return null; }
}

async function generateReply(
  agentId: string, fromName: string, fromEmail: string,
  subject: string, body: string, intent: string,
  history: Array<{ role: 'user' | 'agent'; content: string }>,
  isNewContact: boolean,
  missingFields: string[]
): Promise<string> {
  const agent = AGENTS[agentId];
  if (!GEMINI_KEY) return `Thank you for reaching out to CaseBuddy AI Law. To connect you with one of our attorneys, I need a few quick details:\n\n1. Your full name\n2. Best phone number to reach you\n3. Best time and timezone to call\n4. Brief description of your legal matter\n\nPlease reply with these and I'll get an attorney in touch with you right away.\n\n— ${agent.name} · CaseBuddy AI Law`;

  const historyContext = history.length > 0
    ? `\n\nPREVIOUS CONVERSATION with ${fromName} (oldest first):\n` +
      history.map((h, i) => `[${i + 1}] ${h.role === 'user' ? fromName : agent.name}: ${h.content.slice(0, 400)}`).join('\n\n') +
      '\n--- END HISTORY ---\n'
    : '';

  // Build intake instructions only for new contacts or when fields are still missing
  const intakeInstruction = (isNewContact || missingFields.length > 0) ? `
CRITICAL INTAKE RULE — you MUST follow this before anything else:
Before discussing legal advice, strategy, or case specifics, you MUST collect ALL of the following from the person if not already provided:
  1. Their full name
  2. Best phone number to reach them
  3. Best day/time and timezone for an attorney callback
  4. A brief description of their legal matter (1-2 sentences is fine)

${missingFields.length > 0
  ? `The following are STILL MISSING from this contact: ${missingFields.join(', ')}. Ask for ONLY what is missing — do not re-ask for things they already provided.`
  : 'All intake fields have been collected. Acknowledge their info, confirm an attorney will reach out, and briefly address their question.'}

Format your ask naturally and warmly — NOT as a numbered list. Weave it into your opening as a friendly, professional intake specialist would.
Once all four fields are collected, close by saying an attorney from our firm will review their matter and reach out within 1 business day.
` : `All intake info has been collected for this returning contact. Focus on their current question/request.`;

  const systemPrompt = `You are ${agent.name}, ${agent.role} at CaseBuddy AI Law Firm.
Personality: ${agent.personality}
${isNewContact
  ? `This is a NEW contact. Introduce yourself in one warm sentence, then follow the intake rule below.`
  : `This is a RETURNING contact. You remember ${fromName}. Reference history naturally. Do NOT re-introduce yourself.`
}
${historyContext}
${intakeInstruction}
RULES:
- Write only the email body. No subject line. No markdown headers.
- 3–5 short paragraphs. Be concise and direct.
- No filler openers ("I hope this email finds you well", etc.)
- Sign off as: "${agent.name} · CaseBuddy AI Law"
- Stay in character as ${agent.name} at all times.`;

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents: [{ role: 'user', parts: [{ text: `Email from ${fromName} <${fromEmail}>\nSubject: ${subject}\nIntent: ${intent}\n\n${body.slice(0, 2000)}` }] }],
        generationConfig: { temperature: 0.75, maxOutputTokens: 2000 },
      }),
    }
  );
  const data = await res.json() as any;
  return (data.candidates?.[0]?.content?.parts?.[0]?.text || '').trim() ||
    `Thank you for reaching out. To get you connected with one of our attorneys, I just need your full name, best phone number, preferred callback time, and a brief description of your matter. Please reply with those details and we'll be in touch within 1 business day.\n\n— ${agent.name} · CaseBuddy AI Law`;
}

async function handleEmailInbound(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'GET') return res.status(200).json({ ok: true, message: 'Email inbound webhook active' });
  if (req.method !== 'POST') return res.status(405).end();

  try {
    const body      = req.body as any;
    const from      = body.from      || '';
    const to        = body.to        || '';
    const subject   = body.subject   || '(no subject)';
    const text      = body.text      || body.html || '';
    const fromEmail = (from.match(/<(.+?)>/) || [, from])[1]?.trim() || from;
    const fromName  = from.replace(/<.+?>/, '').trim().replace(/^"|"$/g, '') || fromEmail;

    if (!fromEmail) return res.status(400).json({ error: 'No sender' });

    const agentId = detectAgent(to);
    const intent  = classifyIntent(subject, text);
    const history = await getThreadHistory(fromEmail, agentId, 8);
    const isNewContact = history.length === 0;
    const missing = isNewContact ? missingIntakeFields(text, fromName) : [];

    await saveEmail({
      direction: 'inbound',
      from_address: fromEmail, from_name: fromName,
      to_address: `${agentId}@casebuddy.live`, agent_id: agentId,
      subject, body: text.slice(0, 5000), intent,
    });

    const replyBody    = await generateReply(agentId, fromName, fromEmail, subject, text, intent, history, isNewContact, missing);
    const replySubject = subject.startsWith('Re:') ? subject : `Re: ${subject}`;
    const sendAt       = new Date(Date.now() + REPLY_DELAY_MS).toISOString();

    await saveEmail({
      direction: 'outbound',
      from_address: `${agentId}@casebuddy.live`, from_name: AGENTS[agentId].name,
      to_address: fromEmail, agent_id: agentId,
      subject: replySubject, body: replyBody, intent,
      metadata: {
        status: 'pending',
        send_at: sendAt,
        to_name: fromName,
        is_firm_copy: false,
      },
    });

    if (FIRM_EMAIL) {
      await saveEmail({
        direction: 'outbound',
        from_address: `${agentId}@casebuddy.live`, from_name: AGENTS[agentId].name,
        to_address: FIRM_EMAIL, agent_id: agentId,
        subject: `📬 ${isNewContact ? '[New Intake]' : '[Returning]'} ${AGENTS[agentId].name} replied to ${fromName}`,
        body: `Agent: ${AGENTS[agentId].name}\nFrom: ${fromName} <${fromEmail}>\nSubject: ${subject}\nIntent: ${intent}\nNew Contact: ${isNewContact}\nMissing Fields: ${missing.join(', ') || 'none'}\n\n--- REPLY QUEUED (sends in 3 min) ---\n${replyBody}`,
        intent,
        metadata: {
          status: 'pending',
          send_at: sendAt,
          to_name: 'Firm',
          is_firm_copy: true,
        },
      });
    }

    return res.status(200).json({
      ok: true,
      agent: agentId,
      intent,
      queued: true,
      send_at: sendAt,
      isNewContact,
      missingFields: missing,
      threadLength: history.length + 1,
    });
  } catch (err: any) {
    console.error('[email-inbound]', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
}


// ── Router ────────────────────────────────────────────────────────────────────
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const action = String(req.query.action || 'case-event');
  switch (action) {
    case 'case-event':    return handleCaseEvent(req as any) as any;
    case 'email-inbound': return handleEmailInbound(req, res);
    default: res.status(404).json({ error: `Unknown action: ${action}` }); return;
  }
}
