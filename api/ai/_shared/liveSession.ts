/**
 * Live voice session manager.
 *
 * Maintains in-memory state for active realtime voice sessions. Each session
 * tracks the upstream provider WebSocket, call metadata, accumulated transcript,
 * tool execution state, and recorded facts.
 *
 * Sessions are keyed by a cryptographically random session ID issued by the
 * live-token endpoint. The session ID is the only credential the browser holds;
 * it carries no permanent provider keys.
 *
 * Provider credentials (GEMINI_API_KEY) remain server-side and are used only
 * when establishing the upstream provider connection.
 */

import { type LiveSessionFact } from '../../voice/_shared/intakeTools';

// ── Types ────────────────────────────────────────────────────────────────────

export type SessionChannel = 'browser' | 'twilio';

export interface TranscriptSegment {
  speaker: 'agent' | 'caller';
  text: string;
  timestamp: number;
  isFinal: boolean;
}

export interface LiveSession {
  /** Cryptographically random, URL-safe session identifier. */
  sessionId: string;
  /** How the caller is connected. */
  channel: SessionChannel;
  /** Supabase firm ID (resolved from auth or intake token). */
  firmId: string;
  /** Active intake row ID, if one has been created. */
  intakeId: string | null;
  /** Caller identity: phone number, user ID, or 'anonymous'. */
  callerId: string;
  /** ISO timestamp of session creation. */
  createdAt: string;
  /** ISO timestamp of last activity (audio or tool call). */
  lastActivityAt: string;
  /** Session system instruction (Maya persona + procedure guard). */
  systemInstruction: string;

  /** Upstream provider WebSocket (Gemini Multimodal Live). Not exposed to browser. */
  providerWs: WebSocket | null;
  /** Client-facing WebSocket (browser or Twilio bridge relay). */
  clientWs: WebSocket | null;

  /** Twilio-specific: stream SID for media control messages. */
  twilioStreamSid: string | null;

  /** Accumulated transcript segments. */
  transcript: TranscriptSegment[];
  /** Facts recorded by the `record_case_fact` tool during the call. */
  facts: LiveSessionFact[];

  /** Whether recording consent was obtained. */
  recordingConsent: boolean;
  /** Whether the session has been finalized (post-call synthesis run). */
  finalized: boolean;
}

// ── Session store ────────────────────────────────────────────────────────────

const sessions = new Map<string, LiveSession>();

/** Auto-expire idle sessions after 30 minutes. */
const SESSION_TTL_MS = 30 * 60 * 1000;
/** Sweep interval. */
const SWEEP_INTERVAL_MS = 5 * 60 * 1000;

function generateSessionId(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  // URL-safe base64
  return Buffer.from(bytes)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

// ── Public API ───────────────────────────────────────────────────────────────

export interface CreateSessionArgs {
  channel: SessionChannel;
  firmId: string;
  callerId: string;
  systemInstruction: string;
  intakeId?: string;
  recordingConsent?: boolean;
}

/**
 * Create a new live session and return its ID.
 * Does NOT open the upstream provider connection — that happens when
 * the client WebSocket connects and the session is activated.
 */
export function createSession(args: CreateSessionArgs): LiveSession {
  const now = new Date().toISOString();
  const session: LiveSession = {
    sessionId: generateSessionId(),
    channel: args.channel,
    firmId: args.firmId,
    intakeId: args.intakeId || null,
    callerId: args.callerId,
    createdAt: now,
    lastActivityAt: now,
    systemInstruction: args.systemInstruction,

    providerWs: null,
    clientWs: null,
    twilioStreamSid: null,

    transcript: [],
    facts: [],
    recordingConsent: args.recordingConsent ?? false,
    finalized: false,
  };

  sessions.set(session.sessionId, session);
  console.log(`[liveSession] created session ${session.sessionId.slice(0, 8)}… channel=${args.channel}`);
  return session;
}

/** Retrieve a session by ID. Returns null if expired or not found. */
export function getSession(sessionId: string): LiveSession | null {
  const session = sessions.get(sessionId);
  if (!session) return null;

  const elapsed = Date.now() - new Date(session.lastActivityAt).getTime();
  if (elapsed > SESSION_TTL_MS) {
    destroySession(sessionId);
    return null;
  }
  return session;
}

/** Touch a session to keep it alive. */
export function touchSession(sessionId: string): void {
  const session = sessions.get(sessionId);
  if (session) {
    session.lastActivityAt = new Date().toISOString();
  }
}

/** Add a transcript segment to the session. */
export function addTranscriptSegment(
  sessionId: string,
  speaker: 'agent' | 'caller',
  text: string,
  isFinal: boolean,
): void {
  const session = sessions.get(sessionId);
  if (!session) return;
  session.transcript.push({ speaker, text, timestamp: Date.now(), isFinal });
  session.lastActivityAt = new Date().toISOString();
}

/**
 * Tear down a session: close WebSockets, remove from store.
 * Does NOT run post-call synthesis — call finalizeSession() first.
 */
export function destroySession(sessionId: string): void {
  const session = sessions.get(sessionId);
  if (!session) return;

  try { session.providerWs?.close(); } catch { /* noop */ }
  try { session.clientWs?.close(); } catch { /* noop */ }
  session.providerWs = null;
  session.clientWs = null;

  sessions.delete(sessionId);
  console.log(`[liveSession] destroyed session ${sessionId.slice(0, 8)}…`);
}

/** Mark a session as finalized (post-call work has been triggered). */
export function markFinalized(sessionId: string): void {
  const session = sessions.get(sessionId);
  if (session) session.finalized = true;
}

/** Get the full transcript as speaker-tagged objects. */
export function getFullTranscript(sessionId: string): { speaker: string; text: string }[] {
  const session = sessions.get(sessionId);
  if (!session) return [];
  return session.transcript
    .filter(seg => seg.isFinal)
    .map(seg => ({ speaker: seg.speaker, text: seg.text }));
}

/** Get the number of active sessions (for monitoring). */
export function activeSessionCount(): number {
  return sessions.size;
}

// ── Idle session sweeper ─────────────────────────────────────────────────────

function sweepExpired(): void {
  const now = Date.now();
  for (const [id, session] of sessions) {
    const elapsed = now - new Date(session.lastActivityAt).getTime();
    if (elapsed > SESSION_TTL_MS) {
      console.log(`[liveSession] sweeping idle session ${id.slice(0, 8)}… (${Math.round(elapsed / 60_000)}m idle)`);
      destroySession(id);
    }
  }
}

// Start the sweeper. In serverless environments this runs within the function
// lifetime; on Railway/long-running it runs persistently.
if (typeof setInterval !== 'undefined') {
  setInterval(sweepExpired, SWEEP_INTERVAL_MS);
}
