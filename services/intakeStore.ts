import { getSupabase, INTAKE_TABLE, isSupabaseConfigured } from './supabaseClient';
import { IntakeCase, IntakeData, IntakeScore, IntakeStatus } from '../types';
import { getFirmId } from './caseStore';

// Persists intake cases to Supabase so a prospect's submission on their own
// device shows up live in the attorney's dashboard. Falls back to localStorage
// (single-device) when Supabase isn't reachable, so the flow never hard-fails.

const LOCAL_KEY = 'casebuddy_intake_cases';

const dispositionToStatus = (d: IntakeScore['disposition']): IntakeStatus =>
  d === 'accepted' ? 'routed' : d === 'denied' ? 'denied' : 'new';

const loadLocal = (): IntakeCase[] => {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_KEY) || '[]');
  } catch {
    return [];
  }
};

const saveLocal = (rows: IntakeCase[]) => {
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(rows.slice(0, 200)));
  } catch {
    /* storage full — ignore */
  }
};

export interface SubmitIntakeArgs {
  intake: IntakeData;
  score: IntakeScore;
  transcript: { speaker: string; text: string }[];
}

/** Build a row from the extracted intake + score. */
const buildRow = ({ intake, score, transcript }: SubmitIntakeArgs): IntakeCase => ({
  id: (globalThis.crypto?.randomUUID?.() ?? `intake_${Date.now()}_${Math.random().toString(36).slice(2)}`),
  created_at: new Date().toISOString(),
  // firm_id scopes the intake to this firm's dashboard (migration 0005).
  // VITE_FIRM_ID is the canonical firm ID for this deployment; falls back to
  // the device's localStorage UUID so single-user installs still work.
  firm_id: (import.meta.env.VITE_FIRM_ID as string | undefined) || getFirmId(),
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
  intake,
  score_detail: score,
  transcript,
});

/** Save a completed, scored intake. Returns the stored row. */
export const submitIntake = async (args: SubmitIntakeArgs): Promise<IntakeCase> => {
  const row = buildRow(args);
  const supabase = getSupabase();

  if (supabase) {
    const { data, error } = await supabase.from(INTAKE_TABLE).insert(row).select().single();
    if (!error && data) {
      // Mirror locally so the originating device has an offline copy too.
      saveLocal([data as IntakeCase, ...loadLocal().filter(r => r.id !== row.id)]);
      return data as IntakeCase;
    }
    // Fall through to local on RLS/table/network errors so intake never blocks.
    // eslint-disable-next-line no-console
    console.warn('[intakeStore] Supabase insert failed, using local fallback:', error?.message);
  }

  saveLocal([row, ...loadLocal()]);
  return row;
};

/** Fetch all intake cases (most recent first). */
export const fetchIntakes = async (): Promise<IntakeCase[]> => {
  const supabase = getSupabase();
  if (supabase) {
    const { data, error } = await supabase
      .from(INTAKE_TABLE)
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200);
    if (!error && data) {
      saveLocal(data as IntakeCase[]);
      return data as IntakeCase[];
    }
  }
  return loadLocal();
};

/** Update an intake's workflow status (accept / deny / route from the inbox). */
export const updateIntakeStatus = async (id: string, status: IntakeStatus): Promise<void> => {
  const supabase = getSupabase();
  if (supabase) {
    await supabase.from(INTAKE_TABLE).update({ status }).eq('id', id);
  }
  saveLocal(loadLocal().map(r => (r.id === id ? { ...r, status } : r)));
};

/**
 * Subscribe to live intake inserts. Calls `onInsert` whenever a new intake is
 * created (e.g. a prospect finishing a voice intake on another device).
 * Returns an unsubscribe function.
 */
export const subscribeIntakes = (onInsert: (row: IntakeCase) => void): (() => void) => {
  const supabase = getSupabase();
  if (!supabase) return () => {};

  const channel = supabase
    .channel('intake_cases_feed')
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: INTAKE_TABLE },
      payload => onInsert(payload.new as IntakeCase)
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
};

export const intakeBackendLabel = isSupabaseConfigured
  ? 'Live · synced across devices'
  : 'Local only · this device';
