/**
 * caseStore — cross-device case persistence via Supabase.
 *
 * Strategy:
 *   1. Load from localStorage immediately (zero-latency initial render).
 *   2. Fetch from Supabase in the background; merge results (Supabase wins on conflict).
 *   3. Every save goes to localStorage first, then Supabase asynchronously.
 *   4. Realtime subscription pushes changes from other devices to this session.
 *
 * firm_id scopes rows to one firm without requiring auth. It is a UUID generated
 * once per installation and stored in localStorage. Attorneys on the same firm
 * share the firm_id (e.g. via the Settings page) to share cases.
 */

import type { User } from '@supabase/supabase-js';
import { Case } from '../types';
import { getSupabase, isSupabaseConfigured } from './supabaseClient';
import { saveCases, loadCases } from '../utils/storage';

const CASES_TABLE = 'cases';
const FIRM_ID_KEY = 'casebuddy_firm_id';

// ─── firm_id helpers ─────────────────────────────────────────────────────────

export const getFirmId = (): string => {
  let id = localStorage.getItem(FIRM_ID_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(FIRM_ID_KEY, id);
  }
  return id;
};

export const setFirmId = (id: string) => {
  localStorage.setItem(FIRM_ID_KEY, id.trim());
};

/**
 * Ensures the signed-in user has a row in `firm_memberships` so that
 * firm-scoped RLS policies (migration 0005) can resolve their firm_id.
 *
 * Security model: firm_memberships has no UPDATE policy, so once a user
 * claims a firm_id it is immutable from the client — preventing the
 * user_metadata escalation attack from migration 0003.
 *
 * Flow:
 *  1. Fetch the user's existing membership. If found, sync localStorage to
 *     match (membership is source of truth after first claim).
 *  2. If no membership, INSERT one using the firm_id from localStorage.
 *     The PRIMARY KEY on user_id prevents double-claiming.
 */
export const adoptFirmIdFromUser = async (user: User | null): Promise<void> => {
  if (!user) return;
  const sb = getSupabase();
  if (!sb) return;

  try {
    const { data: membership } = await sb
      .from('firm_memberships')
      .select('firm_id')
      .eq('user_id', user.id)
      .single();

    if (membership?.firm_id) {
      // Existing membership is the source of truth — sync localStorage.
      setFirmId(membership.firm_id);
      return;
    }

    // No membership yet — claim this device's firm_id.
    const { error } = await sb
      .from('firm_memberships')
      .insert({ user_id: user.id, firm_id: getFirmId() });

    // 23505 = unique_violation means another tab beat us to it — not an error.
    if (error && error.code !== '23505') {
      console.warn('[caseStore] firm membership claim failed:', error.message);
    }
  } catch {
    // Best-effort: if Supabase is unreachable, localStorage firm_id is used.
  }
};

// ─── sync status ─────────────────────────────────────────────────────────────

export type SyncStatus = 'syncing' | 'synced' | 'local-only' | 'error';

// ─── fetch ────────────────────────────────────────────────────────────────────

export const fetchCasesFromCloud = async (): Promise<Case[] | null> => {
  if (!isSupabaseConfigured) return null;
  const sb = getSupabase();
  if (!sb) return null;

  const { data, error } = await sb
    .from(CASES_TABLE)
    .select('data')
    .eq('firm_id', getFirmId())
    .order('updated_at', { ascending: false });

  if (error) return null;
  return (data ?? []).map((row: any) => row.data as Case);
};

// ─── upsert single case ───────────────────────────────────────────────────────

export const upsertCaseToCloud = async (c: Case): Promise<boolean> => {
  if (!isSupabaseConfigured) return false;
  const sb = getSupabase();
  if (!sb) return false;

  // Never throw: callers often fire this without awaiting, so a network-level
  // rejection here would surface as an unhandled rejection and lose the case
  // silently. Swallow to a boolean instead.
  try {
    const { error } = await sb.from(CASES_TABLE).upsert(
      { id: c.id, firm_id: getFirmId(), data: c },
      { onConflict: 'id' }
    );
    return !error;
  } catch {
    return false;
  }
};

// ─── upsert batch (initial sync of localStorage cases) ───────────────────────

export const syncLocalCasesToCloud = async (cases: Case[]): Promise<boolean> => {
  if (!isSupabaseConfigured || cases.length === 0) return false;
  const sb = getSupabase();
  if (!sb) return false;

  const rows = cases.map(c => ({
    id: c.id,
    firm_id: getFirmId(),
    data: c,
  }));

  try {
    const { error } = await sb.from(CASES_TABLE).upsert(rows, { onConflict: 'id' });
    return !error;
  } catch {
    return false;
  }
};

// ─── delete ───────────────────────────────────────────────────────────────────

export const deleteCaseFromCloud = async (id: string): Promise<boolean> => {
  if (!isSupabaseConfigured) return false;
  const sb = getSupabase();
  if (!sb) return false;

  const { error } = await sb.from(CASES_TABLE).delete().eq('id', id).eq('firm_id', getFirmId());
  return !error;
};

// ─── realtime subscription ────────────────────────────────────────────────────

export const subscribeCases = (
  onUpdate: (cases: Case[]) => void
): (() => void) => {
  if (!isSupabaseConfigured) return () => {};
  const sb = getSupabase();
  if (!sb) return () => {};

  const firmId = getFirmId();
  const channel = sb
    .channel('cases-changes')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: CASES_TABLE, filter: `firm_id=eq.${firmId}` },
      async () => {
        // Re-fetch the full list on any change so we always have a consistent view
        const fresh = await fetchCasesFromCloud();
        if (fresh) onUpdate(fresh);
      }
    )
    .subscribe();

  return () => { sb.removeChannel(channel); };
};

// ─── high-level: load cases (localStorage → cloud merge) ─────────────────────

/**
 * Returns local cases immediately, then calls onCloudLoad when Supabase responds.
 * Caller decides how to merge (Supabase wins strategy is recommended).
 */
export const loadCasesWithSync = async (
  onCloudLoad: (cases: Case[], status: SyncStatus) => void
): Promise<Case[]> => {
  const local = loadCases();

  if (!isSupabaseConfigured) {
    onCloudLoad(local, 'local-only');
    return local;
  }

  // Fire cloud fetch in the background
  fetchCasesFromCloud().then(cloud => {
    if (!cloud) {
      onCloudLoad(local, 'error');
      return;
    }

    // Merge: start with local, overwrite with cloud (cloud is source of truth)
    const merged = mergeByCloudWins(local, cloud);
    // Persist merged back to localStorage for offline access
    saveCases(merged);
    onCloudLoad(merged, 'synced');

    // Push any local-only cases up to the cloud
    const localOnlyIds = new Set(local.map(c => c.id));
    cloud.forEach(c => localOnlyIds.delete(c.id));
    const localOnly = local.filter(c => localOnlyIds.has(c.id));
    if (localOnly.length > 0) syncLocalCasesToCloud(localOnly);
  }).catch(() => onCloudLoad(local, 'error'));

  return local;
};

const mergeByCloudWins = (local: Case[], cloud: Case[]): Case[] => {
  const map = new Map<string, Case>();
  // local first, then cloud overwrites
  local.forEach(c => map.set(c.id, c));
  cloud.forEach(c => map.set(c.id, c));
  return Array.from(map.values());
};

// ─── label for the UI ────────────────────────────────────────────────────────

export const syncLabel = (status: SyncStatus): string =>
  status === 'synced' ? 'Synced · all devices'
    : status === 'syncing' ? 'Syncing...'
    : status === 'error' ? 'Cloud unavailable'
    : 'Local only';
