import type { VercelRequest, VercelResponse } from '@vercel/node';

const GEMINI_KEY  = process.env.GEMINI_API_KEY            || '';
const SB_URL      = process.env.SUPABASE_URL              || '';
const SB_KEY      = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

// ── Intake state detection ─────────────────────────────────────────────────────
// We track intake progress by scanning what the conversation already contains.
function detectMissingIntakeFields(history: any[], currentBody: string, fromNumber: string): string[] {
  const allText = history.map((h: any) => h.body || '').join(' ') + ' ' + currentBody;
  const lower = allText.toLowerCase();
  const missing: string[] = [];

  // Name: look for "my name is", "i'm", "this is [Name]", or capitalized name patterns
  if (!/my name is|i\'m |i am |this is [a-z]/i.test(allText) && !/[A-Z][a-z]+ [A-Z][a-z]+/.test(allText)) {
    missing.push('full name');
  }
  // Phone: look for digit patterns (10-digit US number)
  if (!/\d{3}[\s.\-]\d{3}[\s.\-]\d{4}|\(\d{3}\)[\s.\-]?\d{3}[\s.\-]\d{4}|\+?1?\s?\d{10}/.test(allText)) {
    missing.push('best callback number');
  }
  // Time preference
  if (!/best time|call me|reach me|available|morning|afternoon|evening|\bam\b|\bpm\b|timezone/.test(lower)) {
    missing.push('best time to call');
  }
  return missing;
}

async function sbFetch(path: string, opts: RequestInit = {}) {
  if (!SB_URL || !SB_KEY) return new Response('{}');
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

async function getSmsHistory(fromNumber: string, limit = 10) {
  try {
    const res = await sbFetch(`sms_messages?from_number=eq.${encodeURIComponent(fromNumber)}&order=created_at.asc&limit=${limit}`);
    if (!res.ok) return [];
    return (await res.json()) as any[];
  } catch { return []; }
}

async function generateSmsReply(
  body: string,
  fromNumber: string,
  history: any[],
  isNewContact: boolean,
  missingFields: string[]
): Promise<string> {

  // Handle opt-out / help keywords first — no AI needed
  const lower = body.toLowerCase().trim();
  if (['stop','unsubscribe','cancel','quit','end'].includes(lower))
    return 'You have been unsubscribed from CaseBuddy AI Law messages. Reply START to re-subscribe.';
  if (['start','subscribe','unstop'].includes(lower))
    return 'Welcome back to CaseBuddy AI Law! You are now re-subscribed. Visit casebuddy.live';
  if (['help','info'].includes(lower))
    return 'CaseBuddy AI Law: Visit casebuddy.live or email support@casebuddy.live. Reply STOP to opt out.';

  if (!GEMINI_KEY)
    return isNewContact
      ? 'Hi! I\'m Maya from CaseBuddy AI Law. To connect you with an attorney, please reply with your full name, best callback number, and preferred call time.'
      : 'Thanks for your message. An attorney will follow up with you shortly. - Maya, CaseBuddy';

  const historyContext = history.length > 0
    ? 'Prior SMS thread:\n' + history.map((h: any) => `${h.direction === 'inbound' ? 'Client' : 'Maya'}: ${h.body}`).join('\n') + '\n\n'
    : '';

  const intakeRule = (isNewContact || missingFields.length > 0)
    ? `INTAKE RULE (follow before anything else):
Before any legal discussion, collect these missing fields in a natural, friendly way:
${missingFields.map((f, i) => `${i + 1}. ${f}`).join('\n')}
Ask for ONLY the missing ones. Do NOT re-ask for info already provided.
Once all fields are collected, confirm an attorney will call them back within 1 business day.`
    : 'All intake info collected. Focus on the client\'s question. Keep it brief and helpful.';

  const systemPrompt = `You are Maya, Case Intake Specialist at CaseBuddy AI Law.
Personality: Warm, efficient, direct. SMS replies MUST be under 160 characters. No markdown. No bullet points in SMS.
${isNewContact ? 'This is a NEW contact. Introduce yourself in 5 words or less, then follow intake rule.' : 'RETURNING contact — do NOT re-introduce yourself.'}
${historyContext}${intakeRule}
Sign off "- Maya, CaseBuddy" only on the very first message.`;

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents: [{ role: 'user', parts: [{ text: `SMS from ${fromNumber}: ${body}` }] }],
        generationConfig: { temperature: 0.7, maxOutputTokens: 160 },
      }),
    }
  );

  const data = await res.json() as any;
  const reply = (data.candidates?.[0]?.content?.parts?.[0]?.text || '').trim();
  // Hard cap at 320 chars (2 SMS segments max)
  return reply.slice(0, 320) || 'Hi! I\'m Maya at CaseBuddy AI Law. Please share your name, callback number, and best time to call.';
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).end();

  const { From, To, Body, MessageSid } = req.body as any;
  console.log(`[sms-inbound] From=${From} To=${To} Body="${Body}"`);

  const history = await getSmsHistory(From, 10);
  const isNewContact = history.length === 0;
  const missingFields = detectMissingIntakeFields(history, Body, From);

  // Save inbound SMS
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

  const reply = await generateSmsReply(Body, From, history, isNewContact, missingFields);

  // Save outbound SMS
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

  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>${reply.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</Message>
</Response>`;

  res.setHeader('Content-Type', 'text/xml');
  return res.status(200).send(twiml);
}
