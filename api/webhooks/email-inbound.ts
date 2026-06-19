import type { VercelRequest, VercelResponse } from '@vercel/node';

const SG_KEY     = process.env.SENDGRID_API_KEY          || '';
const SB_URL     = process.env.SUPABASE_URL              || '';
const SB_KEY     = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const GEMINI_KEY = process.env.GEMINI_API_KEY            || '';
const FIRM_EMAIL = process.env.FIRM_OWNER_EMAIL          || '';
const REPLY_DELAY_MS = 3 * 60 * 1000; // 3 minutes

// ── Agent definitions ─────────────────────────────────────────────────────────
const AGENTS: Record<string, { name: string; role: string; personality: string }> = {
  maya:   { name: 'Maya',   role: 'Case Intake Specialist',      personality: 'Warm, efficient, direct. Gets the key facts quickly. Short, actionable responses. Never wastes words.' },
  sol:    { name: 'Sol',    role: 'Deadline & Calendar Manager', personality: 'Precise, urgent when needed. Always gives specific dates and actions. No fluff.' },
  lex:    { name: 'Lex',    role: 'Legal Researcher',            personality: 'Analytical, confident. Cites specific statutes and cases. Explains complexity clearly.' },
  rex:    { name: 'Rex',    role: 'Trial Strategist',            personality: 'Bold, direct, strategic. Thinks about outcomes. Cuts to what matters.' },
  sierra: { name: 'Sierra', role: 'Client Relations',            personality: 'Warm, empathetic, reassuring. Makes clients feel heard and cared for.' },
  doc:    { name: 'Doc',    role: 'Legal Drafter',               personality: 'Methodical, precise, thorough. Asks clarifying questions before drafting.' },
};

// ── Routing ───────────────────────────────────────────────────────────────────
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
  if (/intake|new case|representation|help|injured|fired|arrested|accident/.test(t)) return 'intake';
  return 'general';
}

// ── Supabase helpers ──────────────────────────────────────────────────────────
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

// ── Gemini ────────────────────────────────────────────────────────────────────
async function generateReply(
  agentId: string, fromName: string, fromEmail: string,
  subject: string, body: string, intent: string,
  history: Array<{ role: 'user' | 'agent'; content: string }>
): Promise<string> {
  const agent = AGENTS[agentId];
  if (!GEMINI_KEY) return `Thank you for reaching out. We'll get back to you shortly.\n\n— ${agent.name}`;

  const historyContext = history.length > 0
    ? `\n\nPREVIOUS CONVERSATION with ${fromName} (oldest first):\n` +
      history.map((h, i) => `[${i + 1}] ${h.role === 'user' ? fromName : agent.name}: ${h.content.slice(0, 400)}`).join('\n\n') +
      '\n--- END HISTORY ---\n'
    : '';

  const systemPrompt = `You are ${agent.name}, ${agent.role} at CaseBuddy AI Law Firm.
Personality: ${agent.personality}
${history.length > 0
  ? `This is a RETURNING contact. You remember ${fromName}. Reference history naturally. Do NOT re-introduce yourself.`
  : `This is a NEW contact. Introduce yourself briefly (one sentence max).`
}
${historyContext}
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
    `Thank you for your message. We'll follow up shortly.\n\n— ${agent.name}`;
}

// ── Main handler ──────────────────────────────────────────────────────────────
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

    // Save inbound email
    await saveEmail({
      direction: 'inbound',
      from_address: fromEmail, from_name: fromName,
      to_address: `${agentId}@casebuddy.live`, agent_id: agentId,
      subject, body: text.slice(0, 5000), intent,
    });

    // Generate reply immediately (fast — stays within Vercel timeout)
    const replyBody    = await generateReply(agentId, fromName, fromEmail, subject, text, intent, history);
    const replySubject = subject.startsWith('Re:') ? subject : `Re: ${subject}`;
    const sendAt       = new Date(Date.now() + REPLY_DELAY_MS).toISOString();

    // Save outbound as PENDING — cron will pick it up and send in 3 minutes
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

    // Also queue a firm owner CC copy
    if (FIRM_EMAIL) {
      await saveEmail({
        direction: 'outbound',
        from_address: `${agentId}@casebuddy.live`, from_name: AGENTS[agentId].name,
        to_address: FIRM_EMAIL, agent_id: agentId,
        subject: `📬 ${history.length > 0 ? '[Returning]' : '[New]'} ${AGENTS[agentId].name} replied to ${fromName}`,
        body: `Agent: ${AGENTS[agentId].name}\nFrom: ${fromName} <${fromEmail}>\nSubject: ${subject}\nIntent: ${intent}\n\n--- REPLY QUEUED (sends in 3 min) ---\n${replyBody}`,
        intent,
        metadata: {
          status: 'pending',
          send_at: sendAt,
          to_name: 'Firm',
          is_firm_copy: true,
        },
      });
    }

    // Acknowledge immediately — cron handles delivery
    return res.status(200).json({
      ok: true,
      agent: agentId,
      intent,
      queued: true,
      send_at: sendAt,
      threadLength: history.length + 1,
    });
  } catch (err: any) {
    console.error('[email-inbound]', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
}
