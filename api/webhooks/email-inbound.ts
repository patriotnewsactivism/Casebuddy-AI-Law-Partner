import type { VercelRequest, VercelResponse } from '@vercel/node';

const SG_KEY     = process.env.SENDGRID_API_KEY          || '';
const SB_URL     = process.env.SUPABASE_URL              || '';
const SB_KEY     = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const GEMINI_KEY = process.env.GEMINI_API_KEY            || '';
const FIRM_EMAIL = process.env.FIRM_OWNER_EMAIL          || '';
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

export default async function handler(req: VercelRequest, res: VercelResponse) {
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
