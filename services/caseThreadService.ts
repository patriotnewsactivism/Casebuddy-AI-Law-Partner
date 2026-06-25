/**
 * caseThreadService.ts
 *
 * 2-way case communication service.
 * - Creates/fetches threads per case
 * - Saves every message (user → agent, agent → user) to Supabase
 * - Detects intent in user messages and dispatches the right AI employee
 * - Streams AI attorney/agent reply back and persists it
 */

import { getSupabase } from './supabaseClient';

/** Convenience — throws if Supabase isn't configured so callers get a clear error. */
function db() {
  const client = getSupabase();
  if (!client) throw new Error('Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.');
  return client;
}
import { deepseekChat } from './deepseek';
import {
  getAgentById, getSpecialistById, getParalegalById, getAnyPersonById,
  OPERATIONAL_AGENTS, LEGAL_SPECIALISTS, PARALEGALS,
} from '../agents/personas';
import { AGENT_CONFIG } from '../config/agentConfig';


// ── Types ──────────────────────────────────────────────────────────────────

export interface CaseThread {
  id: string;
  created_at: string;
  updated_at: string;
  firm_id: string;
  case_id: string;
  case_title: string;
  subject: string;
  status: 'open' | 'resolved' | 'pending';
  priority: 'low' | 'normal' | 'high' | 'urgent';
  participants: string[];
  last_message_at: string;
  unread_count: number;
  metadata: Record<string, unknown>;
}

export interface CaseMessage {
  id: string;
  created_at: string;
  thread_id: string;
  case_id: string;
  firm_id: string;
  sender_type: 'user' | 'agent' | 'attorney';
  sender_id: string;
  sender_name: string;
  direction: 'user_to_agent' | 'agent_to_user';
  body: string;
  read: boolean;
  triggers_automation: boolean;
  automation_target: string | null;
  automation_status: 'none' | 'queued' | 'running' | 'complete' | 'error';
  automation_result: string | null;
  attachment_url: string | null;
  attachment_name: string | null;
  attachment_type: string | null;
  metadata: Record<string, unknown>;
}

// ── Intent → agent routing ─────────────────────────────────────────────────

const ROUTING_KEYWORDS: { pattern: RegExp; agentId: string }[] = [
  { pattern: /\b(deadline|statute of limit|sol|filing date|court date|due date)\b/i, agentId: 'sol' },
  { pattern: /\b(research|case law|precedent|statute|regulation|citation|westlaw|lexis)\b/i, agentId: 'lex' },
  { pattern: /\b(draft|motion|brief|letter|document|contract|discovery|subpoena|deposition notice)\b/i, agentId: 'doc' },
  { pattern: /\b(trial|witness|cross.exam|jury|opening statement|closing|argument|strategy)\b/i, agentId: 'rex' },
  { pattern: /\b(schedule|appointment|client update|status update|notify client|send update)\b/i, agentId: 'sierra' },
  { pattern: /\b(evidence|exhibit|vault|upload|file|document center)\b/i, agentId: 'max' },
  { pattern: /\b(criminal|felony|misdemeanor|charges|arrest|bail|suppression|plea)\b/i, agentId: 'criminal-defense' },
  { pattern: /\b(injury|accident|damages|medical|malpractice|negligence|tort|pain and suffering)\b/i, agentId: 'personal-injury' },
  { pattern: /\b(divorce|custody|child support|family|marriage|alimony|parental)\b/i, agentId: 'family-law' },
  { pattern: /\b(employment|fired|discrimination|harassment|wrongful termination|EEOC|wage)\b/i, agentId: 'employment' },
  { pattern: /\b(immigration|visa|deportation|asylum|green card|citizenship|DACA)\b/i, agentId: 'immigration' },
  { pattern: /\b(real estate|property|landlord|tenant|lease|eviction|title|deed)\b/i, agentId: 'real-estate' },
  { pattern: /\b(business|contract|corp|LLC|partnership|startup|IP|trademark|copyright)\b/i, agentId: 'business' },
  { pattern: /\b(bankruptcy|debt|creditor|chapter 7|chapter 13|discharge|garnish)\b/i, agentId: 'bankruptcy' },
];

/** Build a name→id lookup across all firm members for @mention resolution */
const MENTION_MAP: Record<string, string> = (() => {
  const map: Record<string, string> = {};
  const add = (name: string, id: string) => {
    // index by full name, first name, and lowercase variants
    map[name.toLowerCase()] = id;
    const first = name.split(' ')[0].toLowerCase();
    if (!map[first]) map[first] = id;
  };
  OPERATIONAL_AGENTS.forEach(a => add(a.name, a.id));
  LEGAL_SPECIALISTS.forEach(s => add(s.name, s.id));
  PARALEGALS.forEach(p => add(p.name, p.id));
  return map;
})();

/**
 * Extract the first @mention from a message and return the target agent ID.
 * Returns null if no valid @mention is found.
 */
export function parseMention(text: string): string | null {
  const match = text.match(/@([A-Za-z]+(?:\s+[A-Za-z]+)?(?:\s+[A-Za-z]+)?)/);
  if (!match) return null;
  const raw = match[1].toLowerCase();
  // Try full match first, then first word
  return MENTION_MAP[raw] ?? MENTION_MAP[raw.split(' ')[0]] ?? null;
}

function detectAgentTarget(text: string): string {
  // @mention takes absolute priority
  const mentioned = parseMention(text);
  if (mentioned) return mentioned;

  for (const { pattern, agentId } of ROUTING_KEYWORDS) {
    if (pattern.test(text)) return agentId;
  }
  // Default: Maya as general intake/routing agent
  return 'maya';
}

// ── Broadcast: individual replies + Maya summary ────────────────────────────

export interface BroadcastReply {
  agentId: string;
  agentName: string;
  senderType: 'agent' | 'attorney';
  body: string;
}

/**
 * Send a broadcast message to a curated cross-section of firm members:
 * All 8 operational agents + 4 lead attorneys + all 24 paralegals that are
 * relevant. In practice we sample 6 agents + 2 attorneys + 2 paralegals for
 * speed, then have Maya produce a synthesis.
 */
export async function broadcastToAllStaff(
  userMessage: string,
  caseCtx: string,
): Promise<{ replies: BroadcastReply[]; summary: string }> {
  // Pick a cross-section: 3 ops agents + 3 attorneys + 2 paralegals
  const targets = [
    OPERATIONAL_AGENTS[0], // Maya
    OPERATIONAL_AGENTS[1], // Lex
    OPERATIONAL_AGENTS[3], // Rex
    LEGAL_SPECIALISTS[0],  // Alex Stone
    LEGAL_SPECIALISTS[1],  // Rosa Martinez
    LEGAL_SPECIALISTS[9],  // Derek Cole
    PARALEGALS[0],         // Marcus Webb Jr.
    PARALEGALS[2],         // Sofia Cruz
  ];

  const replyJobs = targets.map(async (person): Promise<BroadcastReply> => {
    const id = person.id;
    const sysInst = getPersonaInstruction(id, caseCtx);
    try {
      const body = await deepseekChat({
        systemInstruction: sysInst + '\n\nThis is a firm-wide broadcast. Give a brief (2-3 sentence) response from your role perspective.',
        messages: [{ role: 'user', content: userMessage }],
        temperature: 0.6,
        maxTokens: 200,
        timeoutMs: 25_000,
      });
      return { agentId: id, agentName: getPersonaName(id), senderType: getSenderType(id), body };
    } catch {
      return { agentId: id, agentName: getPersonaName(id), senderType: getSenderType(id), body: 'Standing by.' };
    }
  });

  const replies = await Promise.all(replyJobs);

  // Maya synthesizes all replies
  const replySummaryInput = replies.map(r => `${r.agentName}: ${r.body}`).join('\n');
  let summary = '';
  try {
    summary = await deepseekChat({
      systemInstruction: `You are Maya, the firm's intake specialist and internal coordinator. Multiple team members just responded to a broadcast. Synthesize their key points into a 3-4 sentence action summary for the attorney. Be concise and actionable.\n\nCase context:\n${caseCtx}`,
      messages: [{ role: 'user', content: `Original message: "${userMessage}"\n\nTeam responses:\n${replySummaryInput}\n\nProvide your synthesis.` }],
      temperature: 0.4,
      maxTokens: 300,
      timeoutMs: 20_000,
    });
  } catch {
    summary = 'Team has been notified and is reviewing your request.';
  }

  return { replies, summary };
}

function getPersonaInstruction(agentId: string, caseCtx: string): string {
  const specialist = getSpecialistById(agentId);
  if (specialist) {
    return `${specialist.systemInstruction}\n\nCurrent case context:\n${caseCtx}`;
  }
  const paralegal = getParalegalById(agentId);
  if (paralegal) {
    return `${paralegal.systemInstruction}\n\nBe concise — you are support staff, not lead counsel. Offer to take on specific tasks. Never mention being an AI unless directly asked.\n\nCurrent case context:\n${caseCtx}`;
  }
  const agent = getAgentById(agentId);
  if (agent) {
    return `You are ${agent.name}, the firm's ${agent.title}. ${agent.description}\n\nBe warm, concise, and genuinely helpful. Stay in character. Never mention being an AI unless directly asked.\n\nCurrent case context:\n${caseCtx}`;
  }
  return `You are a knowledgeable legal AI assistant. Current case context:\n${caseCtx}`;
}

function getPersonaName(agentId: string): string {
  const p = getParalegalById(agentId);
  if (p) return p.name;
  const specialist = getSpecialistById(agentId);
  if (specialist) return specialist.name;
  const agent = getAgentById(agentId);
  if (agent) return agent.name;
  return 'CaseBuddy';
}

function getSenderType(agentId: string): 'agent' | 'attorney' {
  if (getSpecialistById(agentId)) return 'attorney';
  if (getParalegalById(agentId)) return 'agent'; // paralegals are 'agent' type
  return 'agent'; // operational agents and fallback
}

// ── Thread management ──────────────────────────────────────────────────────

export async function getOrCreateThread(
  caseId: string,
  caseTitle: string,
  subject = 'Case Communication',
  firmId = 'default'
): Promise<CaseThread> {
  // Try to find existing open thread for this case
  const { data: existing } = await db()
    .from('case_threads')
    .select('*')
    .eq('case_id', caseId)
    .eq('firm_id', firmId)
    .eq('status', 'open')
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (existing) return existing as CaseThread;

  // Create new thread
  const { data: created, error } = await db()
    .from('case_threads')
    .insert({
      case_id: caseId,
      case_title: caseTitle,
      subject,
      firm_id: firmId,
      status: 'open',
      priority: 'normal',
      participants: ['user', 'maya'],
    })
    .select()
    .single();

  if (error) throw new Error(`Failed to create thread: ${error.message}`);
  return created as CaseThread;
}

export async function listThreadsForCase(caseId: string, firmId = 'default'): Promise<CaseThread[]> {
  const { data, error } = await db()
    .from('case_threads')
    .select('*')
    .eq('case_id', caseId)
    .eq('firm_id', firmId)
    .order('updated_at', { ascending: false });

  if (error) throw new Error(error.message);
  return (data ?? []) as CaseThread[];
}

export async function getThreadMessages(threadId: string): Promise<CaseMessage[]> {
  const { data, error } = await db()
    .from('case_messages')
    .select('*')
    .eq('thread_id', threadId)
    .order('created_at', { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []) as CaseMessage[];
}

export async function markThreadRead(threadId: string): Promise<void> {
  await db().from('case_messages').update({ read: true }).eq('thread_id', threadId).eq('direction', 'agent_to_user');
  await db().from('case_threads').update({ unread_count: 0 }).eq('id', threadId);
}

// ── Core send + auto-reply ─────────────────────────────────────────────────

export interface SendMessageOptions {
  threadId: string;
  caseId: string;
  caseTitle: string;
  caseSummary?: string;
  caseStatus?: string;
  userMessage: string;
  userName?: string;
  firmId?: string;
  attachmentUrl?: string;
  attachmentName?: string;
  attachmentType?: string;
  onAgentReply?: (msg: CaseMessage) => void;
}

export async function sendUserMessage(opts: SendMessageOptions): Promise<{ userMsg: CaseMessage; agentMsg: CaseMessage }> {
  const {
    threadId, caseId, caseTitle, caseSummary = '', caseStatus = '',
    userMessage, userName = 'Client', firmId = 'default',
    attachmentUrl, attachmentName, attachmentType, onAgentReply,
  } = opts;

  // 1. Detect which agent should respond
  const targetAgentId = detectAgentTarget(userMessage);
  const triggersAutomation = targetAgentId !== 'maya' || /\b(help|need|please|can you|what should|advise|recommend)\b/i.test(userMessage);

  // 2. Save user message
  const { data: userRow, error: userErr } = await db()
    .from('case_messages')
    .insert({
      thread_id: threadId,
      case_id: caseId,
      firm_id: firmId,
      sender_type: 'user',
      sender_id: 'user',
      sender_name: userName,
      direction: 'user_to_agent',
      body: userMessage,
      read: true,
      triggers_automation: triggersAutomation,
      automation_target: targetAgentId,
      automation_status: triggersAutomation ? 'queued' : 'none',
      attachment_url: attachmentUrl ?? null,
      attachment_name: attachmentName ?? null,
      attachment_type: attachmentType ?? null,
    })
    .select()
    .single();

  if (userErr) throw new Error(`Failed to save message: ${userErr.message}`);

  // Ensure the target agent is in participants (no-op update — participants are
  // managed in step 5 below after we know which agent replied)

  // 3. Mark automation running
  await db().from('case_messages').update({ automation_status: 'running' }).eq('id', userRow.id);

  // 4. Build AI reply
  const caseCtx = `Case: ${caseTitle}\nStatus: ${caseStatus}\nSummary: ${caseSummary}`;
  const sysInstruction = getPersonaInstruction(targetAgentId, caseCtx);
  const agentName = getPersonaName(targetAgentId);
  const senderType = getSenderType(targetAgentId);

  let replyBody = '';
  try {
    replyBody = await deepseekChat({
      systemInstruction: sysInstruction,
      messages: [{ role: 'user', content: userMessage }],
      temperature: 0.5,
      maxTokens: 1000,
      timeoutMs: 30_000,
    });

    // Mark automation complete on the user message
    await db().from('case_messages')
      .update({ automation_status: 'complete', automation_result: `Dispatched to ${agentName}` })
      .eq('id', userRow.id);
  } catch (err) {
    replyBody = `I'm looking into this for you. I'll get back to you on the case shortly — please feel free to add more details in the meantime.`;
    await db().from('case_messages')
      .update({ automation_status: 'error', automation_result: String(err) })
      .eq('id', userRow.id);
  }

  // 5. Save agent reply
  const { data: agentRow, error: agentErr } = await db()
    .from('case_messages')
    .insert({
      thread_id: threadId,
      case_id: caseId,
      firm_id: firmId,
      sender_type: senderType,
      sender_id: targetAgentId,
      sender_name: agentName,
      direction: 'agent_to_user',
      body: replyBody,
      read: false,
      triggers_automation: false,
      automation_status: 'none',
      metadata: { routed_by_intent: true, detected_from: userMessage.slice(0, 80) },
    })
    .select()
    .single();

  if (agentErr) throw new Error(`Failed to save agent reply: ${agentErr.message}`);

  // Add responder to thread participants
  await db().from('case_threads').select('participants').eq('id', threadId).single().then(async ({ data: t }) => {
    if (t && !t.participants.includes(targetAgentId)) {
      await db().from('case_threads').update({
        participants: [...t.participants, targetAgentId],
      }).eq('id', threadId);
    }
  });

  const agentMsg = agentRow as CaseMessage;
  onAgentReply?.(agentMsg);

  return { userMsg: userRow as CaseMessage, agentMsg };
}

// ── Attorney-initiated message (agent starts the conversation) ─────────────

export async function sendAgentMessage(
  threadId: string,
  caseId: string,
  agentId: string,
  body: string,
  firmId = 'default'
): Promise<CaseMessage> {
  const agentName = getPersonaName(agentId);
  const senderType = getSenderType(agentId);

  const { data, error } = await db()
    .from('case_messages')
    .insert({
      thread_id: threadId,
      case_id: caseId,
      firm_id: firmId,
      sender_type: senderType,
      sender_id: agentId,
      sender_name: agentName,
      direction: 'agent_to_user',
      body,
      read: false,
      triggers_automation: false,
      automation_status: 'none',
    })
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data as CaseMessage;
}

// ── Realtime subscription ──────────────────────────────────────────────────

export function subscribeToThread(
  threadId: string,
  onMessage: (msg: CaseMessage) => void
): () => void {
  const client = db();
  const channel = client
    .channel(`case_thread_${threadId}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'case_messages', filter: `thread_id=eq.${threadId}` },
      (payload) => onMessage(payload.new as CaseMessage)
    )
    .subscribe();

  return () => { client.removeChannel(channel); };
}
