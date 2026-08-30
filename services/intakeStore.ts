import { getSupabase, INTAKE_TABLE, isSupabaseConfigured } from './supabaseClient';
import { IntakeCase, IntakeData, IntakeScore, IntakeStatus } from '../types';

/**
 * Resolve the firm an intake belongs to, in order of authority:
 *   1. the firm resolved from the visitor's intake link (client or firm token)
 *   2. VITE_FIRM_ID, the deployment's configured firm
 *
 * There is deliberately no third fallback. `getFirmId()` mints a random UUID
 * when localStorage is empty, which for an anonymous visitor would file the
 * intake under a tenant nobody owns — the insert succeeds and then
 * `intake_firm_read` (firm_id = get_user_firm_id()) hides it from every user,
 * forever. Failing loudly keeps the submission in the local retry queue where
 * it can still be recovered.
 */
export class IntakeFirmUnresolvedError extends Error {
  constructor() {
    super('This intake could not be routed to a firm. Set VITE_FIRM_ID or use a firm intake link.');
    this.name = 'IntakeFirmUnresolvedError';
  }
}

export const resolveIntakeFirmIdOrNull = (tokenFirmId?: string): string | null => {
  const fromToken = (tokenFirmId || '').trim();
  if (fromToken) return fromToken;

  const configured = ((import.meta.env.VITE_FIRM_ID as string | undefined) || '').trim();
  if (configured) return configured;

  return null;
};

export const resolveIntakeFirmId = (tokenFirmId?: string): string => {
  const resolved = resolveIntakeFirmIdOrNull(tokenFirmId);
  if (!resolved) throw new IntakeFirmUnresolvedError();
  return resolved;
};

/** Unguessable token that lets a dropped-off caller resume their own intake. */
export const newResumeToken = (): string => {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
};

export interface PartialIntakeArgs {
  resumeToken: string;
  routeToken?: string;
  completion: 'partial' | 'complete' | 'abandoned';
  intake?: Partial<IntakeData>;
  score?: IntakeScore | null;
  transcript?: { speaker: string; text: string }[];
  extracted?: Record<string, unknown>;
  recordingConsent?: boolean;
  recordingPath?: string;
  recordingSeconds?: number;
}

/**
 * Write intake progress as the call happens, so an abandoned call still leaves
 * a contactable record. Anonymous callers have no UPDATE grant on
 * intake_cases; this goes through a security-definer RPC keyed on the resume
 * token, which also refuses to reopen an already-completed intake.
 */
export const saveIntakeProgress = async (args: PartialIntakeArgs): Promise<string | null> => {
  const supabase = getSupabase();
  if (!supabase) return null;

  const routeToken = (
    args.routeToken ||
    ((import.meta.env.VITE_PUBLIC_INTAKE_TOKEN as string | undefined) || '')
  ).trim();

  const intake = args.intake || {};
  const payload: Record<string, unknown> = {
    full_name: intake.fullName || '',
    contact: intake.contact || intake.email || intake.phone || '',
    matter_type: intake.matterType || '',
    jurisdiction: intake.jurisdiction || '',
    summary: intake.summary || '',
    intake,
    recording_consent: args.recordingConsent ?? false,
  };
  if (args.score) {
    payload.score = args.score.score;
    payload.disposition = args.score.disposition;
    payload.status = dispositionToStatus(args.score.disposition);
    payload.urgency = args.score.urgency;
    payload.score_detail = args.score;
  }
  if (args.transcript) payload.transcript = args.transcript;
  if (args.extracted) payload.extracted = args.extracted;
  if (args.recordingPath) payload.recording_path = args.recordingPath;
  if (args.recordingSeconds) payload.recording_seconds = args.recordingSeconds;

  const { data, error } = await supabase.rpc('upsert_public_intake', {
    p_resume_token: args.resumeToken,
    p_route_token: routeToken,
    p_payload: payload,
    p_completion: args.completion,
  });

  if (error) {
    console.warn('[intakeStore] saveIntakeProgress failed:', error.message);
    return null;
  }
  return typeof data === 'string' ? data : null;
};

/** Reload a caller's own partial intake so Maya can continue where she left off. */
export const resumeIntake = async (resumeToken: string) => {
  const supabase = getSupabase();
  if (!supabase || !resumeToken) return null;
  const { data, error } = await supabase.rpc('resume_public_intake', {
    p_resume_token: resumeToken,
  });
  const row = Array.isArray(data) ? data[0] : data;
  if (error || !row?.intake_id) return null;
  return row as {
    intake_id: string;
    firm_id: string;
    completion_state: string;
    full_name: string;
    contact: string;
    intake: Partial<IntakeData>;
    transcript: { speaker: string; text: string }[];
  };
};

/**
 * Assign an intake to an attorney or paralegal. The RPC also queues the four
 * automated workstreams (deadlines, precedent, case prep, conflicts) into
 * agent_tasks in the same transaction, so assignment can never land without
 * its follow-on work.
 */
export const assignIntake = async (
  intakeId: string,
  assignee: string,
  assigneeName = '',
): Promise<boolean> => {
  const supabase = getSupabase();
  if (!supabase) return false;
  const { data, error } = await supabase.rpc('assign_intake', {
    p_intake_id: intakeId,
    p_assignee: assignee,
    p_name: assigneeName,
  });
  if (error) {
    console.warn('[intakeStore] assignIntake failed:', error.message);
    return false;
  }
  return data === true;
};

/** Intakes that went quiet before Maya finished — the follow-up queue. */
export const fetchAbandonedIntakes = async (minIdleMinutes = 10): Promise<IntakeCase[]> => {
  const supabase = getSupabase();
  if (!supabase) return [];
  const cutoff = new Date(Date.now() - minIdleMinutes * 60_000).toISOString();
  const { data, error } = await supabase
    .from(INTAKE_TABLE)
    .select('*')
    .in('completion_state', ['partial', 'abandoned'])
    .lt('last_activity_at', cutoff)
    .order('last_activity_at', { ascending: false })
    .limit(100);
  if (error || !data) return [];
  return data as IntakeCase[];
};

// Resolve any public intake token through one narrowly scoped RPC. Anonymous
// callers never receive table-wide SELECT access to memberships or invites.
export const resolveFirmToken = async (token: string): Promise<string | null> => {
  const supabase = getSupabase();
  if (!supabase || !token) return null;

  const { data, error } = await supabase.rpc('resolve_public_intake_token', {
    p_token: token.trim(),
  });
  const row = Array.isArray(data) ? data[0] : data;
  if (error || !row?.firm_id) return null;
  return String(row.firm_id);
};

// Get or generate the current firm's shareable intake token.
export const getOrCreateIntakeToken = async (): Promise<string | null> => {
  const supabase = getSupabase();
  if (!supabase) return null;
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) return null;
  const userId = session.user.id;

  const { data } = await supabase
    .from('firm_memberships')
    .select('intake_token, firm_id')
    .eq('user_id', userId)
    .maybeSingle();

  if (data?.intake_token) return data.intake_token as string;

  const chars = 'abcdefghijkmnpqrstuvwxyz23456789';
  let token = '';
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  bytes.forEach(b => { token += chars[b % chars.length]; });

  const { error } = await supabase
    .from('firm_memberships')
    .update({ intake_token: token })
    .eq('user_id', userId);

  if (error) {
    console.warn('[intakeStore] intake token creation failed:', error.message);
    return null;
  }
  return token;
};

const LOCAL_KEY = 'casebuddy_intake_cases';
const RETRY_QUEUE_KEY = 'casebuddy_intake_retry_queue';

const loadRetryQueue = (): IntakeCase[] => {
  try { return JSON.parse(localStorage.getItem(RETRY_QUEUE_KEY) || '[]'); } catch { return []; }
};

const saveRetryQueue = (rows: IntakeCase[]) => {
  try { localStorage.setItem(RETRY_QUEUE_KEY, JSON.stringify(rows.slice(0, 50))); } catch { /* full */ }
};

/** Flush any queued-for-retry intakes to Supabase. Call on app init. */
export const flushRetryQueue = async (): Promise<number> => {
  const supabase = getSupabase();
  if (!supabase) return 0;
  const queue = loadRetryQueue();
  if (queue.length === 0) return 0;

  let flushed = 0;
  const remaining: IntakeCase[] = [];

  for (const row of queue) {
    const { error } = await supabase.from(INTAKE_TABLE).upsert(row, { onConflict: 'id' });
    if (error) remaining.push(row);
    else flushed++;
  }

  saveRetryQueue(remaining);
  if (flushed > 0) console.info(`[intakeStore] Flushed ${flushed} queued intakes to Supabase`);
  return flushed;
};

const dispositionToStatus = (d: IntakeScore['disposition']): IntakeStatus =>
  d === 'accepted' ? 'routed' : d === 'denied' ? 'denied' : 'new';

const loadLocal = (): IntakeCase[] => {
  try { return JSON.parse(localStorage.getItem(LOCAL_KEY) || '[]'); }
  catch { return []; }
};

const saveLocal = (rows: IntakeCase[]) => {
  try { localStorage.setItem(LOCAL_KEY, JSON.stringify(rows.slice(0, 200))); }
  catch { /* storage full — ignore */ }
};

export interface SubmitIntakeArgs {
  intake: IntakeData;
  score: IntakeScore;
  transcript: { speaker: string; text: string }[];
  /** firm_id resolved from the public intake token — required for multi-tenant isolation */
  firmId?: string;
  /** client_invite_id — ties this submission back to the specific client invite */
  clientInviteId?: string;
}

const buildRow = ({ intake, score, transcript, firmId, clientInviteId }: SubmitIntakeArgs): IntakeCase => ({
  id: (globalThis.crypto?.randomUUID?.() ?? `intake_${Date.now()}_${Math.random().toString(36).slice(2)}`),
  created_at: new Date().toISOString(),
  firm_id: resolveIntakeFirmIdOrNull(firmId) || '',
  full_name: intake.fullName,
  contact: intake.contact,
  matter_type: intake.matterType,
  jurisdiction: intake.jurisdiction,
  summary: intake.summary,
  score: score.score,
  disposition: score.disposition,
  status: dispositionToStatus(score.disposition),
  recommended_department: score.recommendedDepartment,
  recommended_agent_id: score.recommendedAgentId,
  urgency: score.urgency,
  client_invite_id: clientInviteId || undefined,
  intake,
  score_detail: score,
  transcript,
});

export const submitIntake = async (args: SubmitIntakeArgs): Promise<IntakeCase> => {
  const row = buildRow(args);
  const supabase = getSupabase();

  // An intake with no resolvable firm must never be invented into a random
  // tenant — `intake_public_submit` would reject it anyway, and a guessed
  // firm_id would bury it where no one can read it. Hold it in the retry queue
  // so it survives until the deployment's firm is configured.
  if (!row.firm_id) {
    console.error('[intakeStore] no firm could be resolved for this intake — queued locally, not submitted');
    saveRetryQueue([row, ...loadRetryQueue()]);
    saveLocal([row, ...loadLocal()]);
    return row;
  }

  if (supabase) {
    const { data, error } = await supabase.from(INTAKE_TABLE).insert(row).select().single();
    if (!error && data) {
      saveLocal([data as IntakeCase, ...loadLocal().filter(r => r.id !== row.id)]);
      return data as IntakeCase;
    }
    console.warn('[intakeStore] Supabase insert failed, queuing for retry:', error?.message);
    saveRetryQueue([row, ...loadRetryQueue()]);
  }

  saveLocal([row, ...loadLocal()]);
  return row;
};

export const fetchIntakes = async (): Promise<IntakeCase[]> => {
  const supabase = getSupabase();
  if (supabase) {
    // No client-side firm filter. The `intake_firm_read` policy already scopes
    // this to firm_id = get_user_firm_id(), which is derived from the session
    // rather than the browser. Filtering again on the localStorage firm id only
    // adds a way to hide the firm's own intakes when that value drifts — the
    // exact "it never showed up in my account" failure.
    const { data, error } = await supabase
      .from(INTAKE_TABLE)
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200);
    if (!error && data) {
      saveLocal(data as IntakeCase[]);
      return data as IntakeCase[];
    }
    if (error) console.warn('[intakeStore] fetchIntakes error:', error.message);
  }
  return loadLocal();
};

export const updateIntakeStatus = async (id: string, status: IntakeStatus): Promise<void> => {
  const supabase = getSupabase();
  if (supabase) await supabase.from(INTAKE_TABLE).update({ status }).eq('id', id);
  saveLocal(loadLocal().map(r => (r.id === id ? { ...r, status } : r)));
};

export const subscribeIntakes = (onInsert: (row: IntakeCase) => void): (() => void) => {
  const supabase = getSupabase();
  if (!supabase) return () => {};

  const channel = supabase
    .channel('intake_cases_feed')
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: INTAKE_TABLE },
      payload => onInsert(payload.new as IntakeCase),
    )
    .subscribe();

  return () => { supabase.removeChannel(channel); };
};

export const intakeBackendLabel = isSupabaseConfigured
  ? 'Live · synced across devices'
  : 'Local only · this device';
