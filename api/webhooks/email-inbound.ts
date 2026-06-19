import type { VercelRequest, VercelResponse } from '@vercel/node';

const SG_KEY    = process.env.SENDGRID_API_KEY   || '';
const SB_URL    = process.env.SUPABASE_URL        || '';
const SB_KEY    = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const GEMINI_KEY = process.env.GEMINI_API_KEY     || '';
const FIRM_EMAIL = process.env.FIRM_OWNER_EMAIL   || '';

// ── Agent routing ─────────────────────────────────────────────────────────────
const AGENT_ADDRESSES: Record<string, { name: string; role: string; personality: string }> = {
  'maya':   { name: 'Maya',   role: 'Case Intake Specialist',  personality: 'Warm, efficient, direct. Gets to the point. Short responses.' },
  'sol':    { name: 'Sol',    role: 'Deadline & Calendar',     personality: 'Precise, urgent when needed. Action-oriented.' },
  'lex':    { name: 'Lex',    role: 'Legal Researcher',        personality: 'Analytical, confident, clear. Cites specifics.' },
  'rex':    { name: 'Rex',    role: 'Trial Strategist',        personality: 'Bold, direct, strategic.' },
  'sierra': { name: 'Sierra', role: 'Client Relations',        personality: 'Warm, empathetic, reassuring.' },
  'doc':    { name: 'Doc',    role: 'Legal Drafter',           personality: 'Methodical, precise, thorough.' },
};

// Detect which agent was emailed based on To: address
function detectAgent(toField: string): string {
  const lower = toField.toLowerCase();
  for (const agentId of Object.keys(AGENT_ADDRESSES)) {
    if (lower.includes(agentId + '@')) return agentId;
  }
  // Default to maya for general intake
  if (lower.includes('intake') || lower.includes('info') || lower.includes('contact')) return 'maya';
  return 'maya';
}

// Classify intent from subject + body
function classifyIntent(subject: string, body: string): string {
  const text = (subject + ' ' + body).toLowerCase();
  if (/deadline|court date|filing|due date|statute of limitations/.test(text)) return 'deadline';
  if (/research|case law|statute|precedent|citation/.test(text)) return 'research';
  if (/trial|witness|cross.exam|opening|closing|strategy/.test(text)) return 'trial';
  if (/draft|contract|motion|agreement|letter|document/.test(text)) return 'drafting';
  if (/client|update|status|how is my case/.test(text)) return 'client-update';
  if (/intake|new case|representation|help|injured|fired|arrested|accident/.test(text)) return 'intake';
  return 'general';
}

async function generateAgentReply(
  agentId: string,
  fromName: string,
  fromEmail: string,
  subject: string,
  body: string,
  intent: string
): Promise<string> {
  const agent = AGENT_ADDRESSES[agentId];
  if (!GEMINI_KEY) return `Thank you for reaching out. We'll get back to you shortly.\n\n— ${agent.name}`;

  const prompt = `You are ${agent.name}, ${agent.role} at CaseBuddy AI Law Firm.
Personality: ${agent.personality}

You received an email. Write a professional, helpful reply. Be concise — 3-5 short paragraphs max.
Get to the point immediately. No filler openers. Sign as "${agent.name} · CaseBuddy AI Law".

Email received:
From: ${fromName} <${fromEmail}>
Subject: ${subject}
Intent detected: ${intent}
Body:
${body.slice(0, 2000)}

Write only the email body. No subject line. Start with the response, not a greeting.`;

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.7, maxOutputTokens: 500 },
      }),
    }
  );
  const data = await res.json() as any;
  return (data.candidates?.[0]?.content?.parts?.[0]?.text || '').trim();
}

async function sendEmail(to: string, toName: string, fromAgent: string, subject: string, body: string) {
  const agent = AGENT_ADDRESSES[fromAgent];
  const htmlBody = body.replace(/\n/g, '<br>');

  await fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${SG_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: to, name: toName }] }],
      from: { email: `${fromAgent}@casebuddy.live`, name: `${agent.name} · CaseBuddy` },
      reply_to: { email: `${fromAgent}@casebuddy.live`, name: agent.name },
      subject,
      content: [
        { type: 'text/plain', value: body },
        { type: 'text/html',  value: `<div style="font-family:Arial,sans-serif;max-width:600px;line-height:1.6">${htmlBody}<br><br><hr style="border:none;border-top:1px solid #eee"><p style="color:#888;font-size:12px">📧 ${agent.name} · ${agent.role} · CaseBuddy AI Law<br>Reply to this email to continue the conversation.</p></div>` },
      ],
    }),
  });
}

async function saveToSupabase(email: {
  direction: 'inbound' | 'outbound';
  from_address: string; from_name: string;
  to_address: string; agent_id: string;
  subject: string; body: string; intent: string;
}) {
  if (!SB_URL || !SB_KEY) return;
  await fetch(`${SB_URL}/rest/v1/firm_emails`, {
    method: 'POST',
    headers: {
      apikey: SB_KEY,
      Authorization: `Bearer ${SB_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify({ ...email, received_at: new Date().toISOString() }),
  });
}

// ── Main handler ──────────────────────────────────────────────────────────────
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'GET') {
    return res.status(200).json({ ok: true, message: 'Email inbound webhook active' });
  }
  if (req.method !== 'POST') return res.status(405).end();

  try {
    // SendGrid Inbound Parse sends multipart/form-data
    // Vercel parses it into req.body when content-type is form-data
    const body   = req.body as any;
    const from   = body.from   || '';
    const to     = body.to     || '';
    const subject = body.subject || '(no subject)';
    const text   = body.text   || body.html || '';
    const fromEmail = (from.match(/<(.+?)>/) || [, from])[1] || from;
    const fromName  = from.replace(/<.+?>/, '').trim().replace(/^"|"$/g, '') || fromEmail;

    if (!fromEmail) return res.status(400).json({ error: 'No sender' });

    const agentId = detectAgent(to);
    const intent  = classifyIntent(subject, text);

    // Save inbound
    await saveToSupabase({
      direction: 'inbound',
      from_address: fromEmail, from_name: fromName,
      to_address: to, agent_id: agentId,
      subject, body: text.slice(0, 5000), intent,
    });

    // Generate AI reply
    const replyBody = await generateAgentReply(agentId, fromName, fromEmail, subject, text, intent);

    // Send reply
    const replySubject = subject.startsWith('Re:') ? subject : `Re: ${subject}`;
    await sendEmail(fromEmail, fromName, agentId, replySubject, replyBody);

    // Save outbound
    await saveToSupabase({
      direction: 'outbound',
      from_address: `${agentId}@casebuddy.live`, from_name: AGENT_ADDRESSES[agentId].name,
      to_address: fromEmail, agent_id: agentId,
      subject: replySubject, body: replyBody, intent,
    });

    // Notify firm owner
    if (FIRM_EMAIL) {
      await sendEmail(
        FIRM_EMAIL, 'Firm Owner', 'maya',
        `📬 [Inbound] ${AGENT_ADDRESSES[agentId].name} received email from ${fromName}`,
        `New email received and replied to automatically.\n\nFrom: ${fromName} <${fromEmail}>\nAgent: ${AGENT_ADDRESSES[agentId].name}\nSubject: ${subject}\nIntent: ${intent}\n\n--- ORIGINAL ---\n${text.slice(0, 800)}\n\n--- REPLY SENT ---\n${replyBody}`
      );
    }

    return res.status(200).json({ ok: true, agent: agentId, intent, replied: true });
  } catch (err: any) {
    console.error('[email-inbound]', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
}
