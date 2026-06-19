import type { VercelRequest, VercelResponse } from '@vercel/node';

const TWILIO_SID  = process.env.TWILIO_ACCOUNT_SID    || '';
const TWILIO_AUTH = process.env.TWILIO_AUTH_TOKEN     || '';
const GEMINI_KEY  = process.env.GEMINI_API_KEY        || '';
const SB_URL      = process.env.SUPABASE_URL          || '';
const SB_KEY      = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const AGENTS: Record<string, { name: string; personality: string }> = {
  default: { name: 'Maya', personality: 'Warm, efficient case intake specialist. Keep SMS replies under 160 chars when possible. Direct and helpful.' },
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

async function getSmSHistory(fromNumber: string, limit = 6) {
  try {
    const res = await sbFetch(`sms_messages?from_number=eq.${encodeURIComponent(fromNumber)}&order=created_at.asc&limit=${limit}`);
    if (!res.ok) return [];
    return (await res.json()) as any[];
  } catch { return []; }
}

async function generateSmsReply(body: string, fromNumber: string, history: any[]): Promise<string> {
  if (!GEMINI_KEY) return 'Thanks for texting CaseBuddy AI Law. Reply HELP for assistance or visit casebuddy.live.';

  // Handle opt-out keywords
  const lower = body.toLowerCase().trim();
  if (['stop','unsubscribe','cancel','quit','end'].includes(lower)) {
    return 'You have been unsubscribed from CaseBuddy AI Law messages. Reply START to re-subscribe.';
  }
  if (['start','subscribe','unstop'].includes(lower)) {
    return 'Welcome back to CaseBuddy AI Law! You are now re-subscribed. Visit casebuddy.live to manage your cases.';
  }
  if (['help','info'].includes(lower)) {
    return 'CaseBuddy AI Law: For help visit casebuddy.live or email support@casebuddy.live. Reply STOP to opt out.';
  }

  const historyContext = history.length > 0
    ? 'Previous messages:\n' + history.map((h: any) => `${h.direction === 'inbound' ? 'Client' : 'Maya'}: ${h.body}`).join('\n') + '\n\n'
    : '';

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: `You are Maya, Case Intake Specialist at CaseBuddy AI Law. ${AGENTS.default.personality}\nThis is an SMS conversation. Keep replies concise — ideally under 160 characters. Never use markdown. Sign off with "- Maya, CaseBuddy" only for first message.\n${historyContext}` }] },
        contents: [{ role: 'user', parts: [{ text: `SMS from ${fromNumber}: ${body}` }] }],
        generationConfig: { temperature: 0.7, maxOutputTokens: 200 },
      }),
    }
  );

  const data = await res.json() as any;
  return (data.candidates?.[0]?.content?.parts?.[0]?.text || '').trim() ||
    'Thanks for reaching out to CaseBuddy AI Law. We\'ll follow up shortly. Visit casebuddy.live';
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).end();

  const { From, To, Body, MessageSid } = req.body as any;
  console.log(`[sms-inbound] From=${From} To=${To} Body="${Body}"`);

  const history = await getSmSHistory(From, 6);

  // Save inbound SMS
  if (SB_URL && SB_KEY) {
    await sbFetch('sms_messages', {
      method: 'POST',
      body: JSON.stringify({
        message_sid: MessageSid,
        from_number: From,
        to_number: To,
        body: Body,
        direction: 'inbound',
        created_at: new Date().toISOString(),
      }),
    });
  }

  const reply = await generateSmsReply(Body, From, history);

  // Save outbound SMS
  if (SB_URL && SB_KEY) {
    await sbFetch('sms_messages', {
      method: 'POST',
      body: JSON.stringify({
        from_number: To,
        to_number: From,
        body: reply,
        direction: 'outbound',
        created_at: new Date().toISOString(),
      }),
    });
  }

  // Respond with TwiML SMS reply
  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>${reply.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</Message>
</Response>`;

  res.setHeader('Content-Type', 'text/xml');
  return res.status(200).send(twiml);
}
