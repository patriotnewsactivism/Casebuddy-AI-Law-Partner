import { getSupabase, INTAKE_TABLE, isSupabaseConfigured } from './supabaseClient';
import { IntakeCase, IntakeData, IntakeScore, IntakeStatus } from '../types';
import { getFirmId } from './caseStore';

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
  firm_id: firmId || (import.meta.env.VITE_FIRM_ID as string | undefined) || getFirmId(),
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
    const firmId = getFirmId();
    const { data, error } = await supabase
      .from(INTAKE_TABLE)
      .select('*')
      .eq('firm_id', firmId)
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
