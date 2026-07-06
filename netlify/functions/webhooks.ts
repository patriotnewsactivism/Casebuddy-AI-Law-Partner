/**
 * Netlify Function — Consolidated webhooks (case-event + email-inbound).
 * Ported from api/webhooks/index.ts (VercelRequest/VercelResponse → Request/Response).
 *
 * POST /api/webhooks?action=case-event|email-inbound
 */

const GEMINI_KEY  = process.env.GEMINI_API_KEY            ?? '';
const SG_KEY      = process.env.SENDGRID_API_KEY          ?? '';
const OWNER_EMAIL = process.env.FIRM_OWNER_EMAIL          ?? '';
const WH_SECRET   = process.env.SUPABASE_WEBHOOK_SECRET   ?? '';
const SB_URL      = process.env.SUPABASE_URL              ?? '';
const SB_KEY      = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': 'https://casebuddy.live',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, x-supabase-signature',
};

const jsonResp = (body: object, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const gemini = async (apiKey: string, prompt: string): Promise<string> => {
  const r = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }) }
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
      subject, content: [{ type: 'text/html', value: html }],
    }),
  });
};

async function sbFetch(path: string, opts: RequestInit = {}) {
  return fetch(`${SB_URL}/rest/v1/${path}`, {
    ...opts,
    headers: {
      apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`,
      'Content-Type': 'application/json', Prefer: 'return=representation',
      ...(opts.headers || {}),
    },
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// CASE-EVENT WEBHOOK
// ═══════════════════════════════════════════════════════════════════════════════

async function handleCaseEvent(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });

  if (WH_SECRET) {
    const sig = req.headers.get('x-supabase-signature') ?? '';
    if (!sig.includes(WH_SECRET.slice(0, 8))) return new Response('Unauthorized', { status: 401 });
  }

  let body: any;
  try { body = await req.json(); } catch { return new Response('Bad JSON', { status: 400 }); }

  const eventType = body.type ?? '';
  const newRecord = body.record ?? {};
  const oldRecord = body.old_record ?? {};
  const responses: string[] = [];

  // INSERT: new case
  if (eventType === 'INSERT' && newRecord.name) {
    if (GEMINI_KEY && OWNER_EMAIL) {
      const briefing = await gemini(GEMINI_KEY,
        `You are Maya at CaseBuddy AI Law Firm. A new case just came in.\nCase: ${newRecord.name}\nClient: ${newRecord.client_name}\nStatus: ${newRecord.status}\nSummary: ${newRecord.case_theory || 'No summary yet'}\nOpposing Counsel: ${newRecord.opposing_counsel || 'Unknown'}\nJudge: ${newRecord.judge || 'Unknown'}\nNext Court Date: ${newRecord.next_court_date || newRecord.trial_date || 'TBD'}\n\nWrite a brief 3-bullet intake briefing. Cover:\n1. What this case is about + key issue\n2. Immediate priorities (next 48 hours)\n3. Which specialist should take point and why\nBe direct, specific, 80 words max.`);
      await sendEmail(SG_KEY, OWNER_EMAIL, `📁 New Case: ${newRecord.title}`,
        `<div style="font-family:sans-serif;max-width:600px"><h2>📁 New Case Opened</h2><h3 style="color:#1e293b">${newRecord.name}</h3><p>Client: <strong>${newRecord.client_name}</strong> | Status: ${newRecord.status}</p><div style="background:#f8fafc;border-left:4px solid #d4af37;padding:12px;margin:16px 0"><p style="margin:0;font-weight:bold">Maya's Intake Briefing:</p><p style="margin:8px 0 0;white-space:pre-wrap">${briefing}</p></div><a href="https://casebuddy.live/app/firm-command" style="background:#d4af37;color:#0f172a;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:bold">Run Full Team Briefing →</a></div>`,
        'maya@casebuddy.live', 'Maya @ CaseBuddy');
      responses.push('Maya briefed team on new case');
    }
  }

  // UPDATE: Trial status
  if (eventType === 'UPDATE' && newRecord.status?.toLowerCase() === 'trial' && oldRecord.status?.toLowerCase() !== 'trial') {
    if (GEMINI_KEY && OWNER_EMAIL) {
      const checklist = await gemini(GEMINI_KEY,
        `You are Rex, trial strategist at CaseBuddy AI Law Firm.\nCase "${newRecord.name}" just moved to Trial status.\nClient: ${newRecord.client_name} | Judge: ${newRecord.judge || 'Unknown'}\nSummary: ${newRecord.case_theory || 'No summary'}\n\nGenerate a crisp trial prep checklist — 8-10 items. Format as HTML ordered list. Specific and actionable. 120 words max.`);
      await sendEmail(SG_KEY, OWNER_EMAIL, `⚖️ Trial Mode — ${newRecord.title}`,
        `<div style="font-family:sans-serif;max-width:600px"><h2 style="color:#dc2626">⚖️ Case Entered Trial Status</h2><h3>${newRecord.name}</h3><p>Client: <strong>${newRecord.client_name}</strong> | Judge: ${newRecord.judge || 'TBD'}</p><div style="background:#fef2f2;border-left:4px solid #dc2626;padding:12px;margin:16px 0"><p style="margin:0;font-weight:bold">Rex's Trial Prep Checklist:</p>${checklist}</div><a href="https://casebuddy.live/app/war-room" style="background:#dc2626;color:white;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:bold">Open War Room →</a></div>`,
        'rex@casebuddy.live', 'Rex @ CaseBuddy');
      responses.push('Rex generated trial prep checklist');
    }
  }

  // UPDATE: Settled/Closed
  if (eventType === 'UPDATE' && ['Settled', 'Closed'].includes(newRecord.status) && !['Settled', 'Closed'].includes(oldRecord.status)) {
    const clientEmail = newRecord.metadata?.clientEmail || newRecord.metadata?.contact;
    if (GEMINI_KEY && clientEmail?.includes('@')) {
      const closingLetter = await gemini(GEMINI_KEY,
        `You are Sierra at CaseBuddy AI Law Firm. Case "${newRecord.name}" was just ${newRecord.status?.toLowerCase() ?? 'resolved'}.\nClient: ${newRecord.client_name}\nWrite a brief, warm closing letter. Thank them, summarize resolution, invite referrals.\nFormat as clean HTML paragraphs. 120 words max. Sign as "Sierra, Client Relations · CaseBuddy AI Law Firm"`);
      await sendEmail(SG_KEY, clientEmail, `Your Case Has Been ${newRecord.status} — ${newRecord.name}`,
        `<div style="font-family:Georgia,serif;max-width:600px"><h2>⚖️ CaseBuddy Law Firm</h2>${closingLetter}<p style="color:#94a3b8;font-size:12px;margin-top:24px"><a href="https://casebuddy.live">casebuddy.live</a></p></div>`,
        'sierra@casebuddy.live', 'Sierra @ CaseBuddy');
      responses.push(`Sierra sent closing letter to ${clientEmail}`);
    }
  }

  return jsonResp({ ok: true, responses });
}

// ═══════════════════════════════════════════════════════════════════════════════
// EMAIL-INBOUND WEBHOOK
// ═══════════════════════════════════════════════════════════════════════════════

const FIRM_EMAIL = OWNER_EMAIL;
const REPLY_DELAY_MS = 3 * 60 * 1000;

const AGENTS: Record<string, { name: string; role: string; personality: string }> = {
  maya:   { name: 'Maya',   role: 'Case Intake Specialist',      personality: 'Warm, efficient, direct. Gets the key facts quickly.' },
  sol:    { name: 'Sol',    role: 'Deadline & Calendar Manager', personality: 'Precise, urgent when needed. Always gives specific dates.' },
  lex:    { name: 'Lex',    role: 'Legal Researcher',            personality: 'Analytical, confident. Cites specific statutes and cases.' },
  rex:    { name: 'Rex',    role: 'Trial Strategist',            personality: 'Bold, direct, strategic. Thinks about outcomes.' },
  sierra: { name: 'Sierra', role: 'Client Relations',            personality: 'Warm, empathetic, reassuring. Makes clients feel heard.' },
  doc:    { name: 'Doc',    role: 'Legal Drafter',               personality: 'Methodical, precise, thorough.' },
};

function detectAgent(toField: string): string {
  const lower = toField.toLowerCase();
  for (const id of Object.keys(AGENTS)) if (lower.includes(id + '@')) return id;
  return 'maya';
}

function classifyIntent(subject: string, body: string): string {
  const t = (subject + ' ' + body).toLowerCase();
  if (/deadline|court date|filing|due date|statute/.test(t))     return 'deadline';
  if (/research|case law|statute|precedent|citation/.test(t))    return 'research';
  if (/trial|witness|cross.exam|opening|closing|strategy/.test(t)) return 'trial';
  if (/draft|contract|motion|agreement|letter|document/.test(t)) return 'drafting';
  if (/client|update|status|how is my case/.test(t))             return 'client-update';
  return 'intake';
}

function missingIntakeFields(body: string, fromName: string): string[] {
  const lower = body.toLowerCase();
  const missing: string[] = [];
  if (!fromName || fromName.includes('@') || fromName.length < 3) missing.push('full name');
  if (!/\d{3}[\s.\-]\d{3}[\s.\-]\d{4}|\(\d{3}\)[\s.\-]?\d{3}[\s.\-]\d{4}|\+1\s?\d{10}/.test(body)) missing.push('best phone number');
  if (!/best time|call me|reach me|available|timezone|morning|afternoon|evening|am|pm/.test(lower)) missing.push('best time to call');
  return missing;
}

async function getThreadHistory(fromEmail: string, agentId: string, limit = 8) {
  try {
    const res = await sbFetch(`firm_emails?from_address=eq.${encodeURIComponent(fromEmail)}&agent_id=eq.${agentId}&order=received_at.asc&limit=${limit}`);
    if (!res.ok) return [];
    const rows: any[] = await res.json();
    return rows.map(r => ({ role: r.direction === 'inbound' ? 'user' as const : 'agent' as const, content: r.body?.slice(0, 800) || '' }));
  } catch { return []; }
}

async function saveEmail(record: { direction: 'inbound' | 'outbound'; from_address: string; from_name: string; to_address: string; agent_id: string; subject: string; body: string; intent: string; metadata?: object }) {
  if (!SB_URL || !SB_KEY) return null;
  try {
    const res = await sbFetch('firm_emails', { method: 'POST', body: JSON.stringify({ ...record, received_at: new Date().toISOString() }) });
    const rows = await res.json() as any[];
    return rows?.[0]?.id || null;
  } catch { return null; }
}

async function generateReply(agentId: string, fromName: string, fromEmail: string, subject: string, body: string, intent: string, history: Array<{ role: string; content: string }>, isNewContact: boolean, missingFields: string[]): Promise<string> {
  const agent = AGENTS[agentId];
  if (!GEMINI_KEY) return `Thank you for reaching out to CaseBuddy AI Law. To connect you with an attorney, I need:\n\n1. Your full name\n2. Best phone number\n3. Best time/timezone to call\n4. Brief description of your legal matter\n\n— ${agent.name} · CaseBuddy AI Law`;

  const historyContext = history.length > 0 ? `\n\nPREVIOUS CONVERSATION:\n` + history.map((h, i) => `[${i + 1}] ${h.role === 'user' ? fromName : agent.name}: ${h.content.slice(0, 400)}`).join('\n\n') + '\n---\n' : '';

  const intakeInstruction = (isNewContact || missingFields.length > 0) ?
    `INTAKE RULE: Before discussing legal advice, collect: full name, phone number, callback time/timezone, brief legal matter description.\n${missingFields.length > 0 ? `Still missing: ${missingFields.join(', ')}. Ask naturally.` : 'All collected. Confirm attorney will reach out.'}` :
    'All intake info collected. Focus on their question.';

  const systemPrompt = `You are ${agent.name}, ${agent.role} at CaseBuddy AI Law Firm.\nPersonality: ${agent.personality}\n${isNewContact ? 'NEW contact. Introduce yourself briefly.' : `RETURNING contact. You know ${fromName}.`}\n${historyContext}\n${intakeInstruction}\nRULES: Body only. 3-5 short paragraphs. No filler. Sign as "${agent.name} · CaseBuddy AI Law"`;

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_KEY}`,
    {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents: [{ role: 'user', parts: [{ text: `Email from ${fromName} <${fromEmail}>\nSubject: ${subject}\nIntent: ${intent}\n\n${body.slice(0, 2000)}` }] }],
        generationConfig: { temperature: 0.75, maxOutputTokens: 2000 },
      }),
    }
  );
  const data = await res.json() as any;
  return (data.candidates?.[0]?.content?.parts?.[0]?.text || '').trim() || `Thank you for reaching out. Please reply with your full name, phone number, preferred callback time, and a brief description of your matter.\n\n— ${agent.name} · CaseBuddy AI Law`;
}

async function handleEmailInbound(req: Request): Promise<Response> {
  if (req.method === 'GET') return jsonResp({ ok: true, message: 'Email inbound webhook active' });
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });

  try {
    const body = await req.json() as any;
    const from = body.from || '', to = body.to || '';
    const subject = body.subject || '(no subject)';
    const text = body.text || body.html || '';
    const fromEmail = (from.match(/<(.+?)>/) || [, from])[1]?.trim() || from;
    const fromName = from.replace(/<.+?>/, '').trim().replace(/^"|"$/g, '') || fromEmail;

    if (!fromEmail) return jsonResp({ error: 'No sender' }, 400);

    const agentId = detectAgent(to);
    const intent = classifyIntent(subject, text);
    const history = await getThreadHistory(fromEmail, agentId, 8);
    const isNewContact = history.length === 0;
    const missing = isNewContact ? missingIntakeFields(text, fromName) : [];

    await saveEmail({ direction: 'inbound', from_address: fromEmail, from_name: fromName, to_address: `${agentId}@casebuddy.live`, agent_id: agentId, subject, body: text.slice(0, 5000), intent });

    const replyBody = await generateReply(agentId, fromName, fromEmail, subject, text, intent, history, isNewContact, missing);
    const replySubject = subject.startsWith('Re:') ? subject : `Re: ${subject}`;
    const sendAt = new Date(Date.now() + REPLY_DELAY_MS).toISOString();

    await saveEmail({ direction: 'outbound', from_address: `${agentId}@casebuddy.live`, from_name: AGENTS[agentId].name, to_address: fromEmail, agent_id: agentId, subject: replySubject, body: replyBody, intent, metadata: { status: 'pending', send_at: sendAt, to_name: fromName, is_firm_copy: false } });

    if (FIRM_EMAIL) {
      await saveEmail({ direction: 'outbound', from_address: `${agentId}@casebuddy.live`, from_name: AGENTS[agentId].name, to_address: FIRM_EMAIL, agent_id: agentId, subject: `📬 ${isNewContact ? '[New Intake]' : '[Returning]'} ${AGENTS[agentId].name} replied to ${fromName}`, body: `Agent: ${AGENTS[agentId].name}\nFrom: ${fromName} <${fromEmail}>\nSubject: ${subject}\nIntent: ${intent}\n\n--- REPLY QUEUED ---\n${replyBody}`, intent, metadata: { status: 'pending', send_at: sendAt, to_name: 'Firm', is_firm_copy: true } });
    }

    return jsonResp({ ok: true, agent: agentId, intent, queued: true, send_at: sendAt, isNewContact, missingFields: missing, threadLength: history.length + 1 });
  } catch (err: any) {
    return jsonResp({ ok: false, error: err.message }, 500);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// ROUTER
// ═══════════════════════════════════════════════════════════════════════════════

export default async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const action = url.searchParams.get('action') || 'case-event';
  switch (action) {
    case 'case-event':    return handleCaseEvent(req);
    case 'email-inbound': return handleEmailInbound(req);
    default: return jsonResp({ error: `Unknown action: ${action}` }, 404);
  }
}

export const config = { path: "/api/webhooks" };
