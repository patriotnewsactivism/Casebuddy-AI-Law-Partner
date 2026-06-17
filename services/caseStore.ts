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
 * Bridges the localStorage firm_id into the signed-in user's Supabase
 * user_metadata so it's available as a JWT claim for Postgres RLS policies
 * (see supabase/migrations/0003_auth_hardening.sql). Without this, an
 * authenticated user has no firm_id claim and firm-scoped RLS would match
 * nothing.
 */
export const adoptFirmIdFromUser = async (user: User | null): Promise<void> => {
  if (!user) return;
  const metaFirmId = user.user_metadata?.firm_id as string | undefined;
  if (metaFirmId) {
    setFirmId(metaFirmId);
    return;
  }

  const sb = getSupabase();
  if (!sb) return;
  const { error } = await sb.auth.updateUser({ data: { firm_id: getFirmId() } });
  if (!error) {
    await sb.auth.refreshSession();
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

  const { error } = await sb.from(CASES_TABLE).upsert(
    { id: c.id, firm_id: getFirmId(), data: c },
    { onConflict: 'id' }
  );
  return !error;
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

  const { error } = await sb.from(CASES_TABLE).upsert(rows, { onConflict: 'id' });
  return !error;
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
