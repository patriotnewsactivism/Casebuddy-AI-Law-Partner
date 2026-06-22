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
import { getSession } from './authService';
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

// ─── cloud row mapping ─────────────────────────────────────────────────────────
//
// The deployed `cases` table is per-user: `id` is a uuid, `user_id` defaults to
// auth.uid() (and RLS requires it to match the caller), and `name`/`case_type`/
// `client_name` are NOT NULL. The app, however, keys cases by ids like
// `Date.now().toString()` and stores the whole Case object. We bridge the two:
//
//   • id        — a deterministic uuid (v5: SHA-1 over a fixed namespace + the
//                 app id) so every case maps to exactly one cloud row and
//                 re-saves upsert idempotently. The real app id is preserved
//                 inside `data`, which is what we read back.
//   • data      — the full Case (source of truth for the client).
//   • name/…    — populated to satisfy the table's NOT NULL columns.
//   • user_id   — deliberately omitted so the column default (auth.uid()) fills
//                 it, satisfying the "auth.uid() = user_id" insert policy and
//                 making the creator the case 'owner' for later updates/deletes.

// RFC-4122 DNS namespace, as raw bytes.
const CASE_ID_NAMESPACE = Uint8Array.from(
  '6ba7b8109dad11d180b400c04fd430c8'.match(/.{2}/g)!.map(h => parseInt(h, 16))
);

const deriveCaseRowId = async (appId: string): Promise<string> => {
  const idBytes = new TextEncoder().encode(appId);
  const input = new Uint8Array(CASE_ID_NAMESPACE.length + idBytes.length);
  input.set(CASE_ID_NAMESPACE, 0);
  input.set(idBytes, CASE_ID_NAMESPACE.length);
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-1', input));
  const b = digest.slice(0, 16);
  b[6] = (b[6] & 0x0f) | 0x50; // version 5
  b[8] = (b[8] & 0x3f) | 0x80; // RFC 4122 variant
  const hex = Array.from(b, x => x.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};

const toCaseRow = async (c: Case) => ({
  id: await deriveCaseRowId(c.id),
  firm_id: getFirmId(),
  data: c,
  name: c.title?.trim() || 'Untitled Case',
  case_type: 'general',
  client_name: c.client?.trim() || 'Unknown',
});

// Cloud writes hit a per-user table whose insert policy needs auth.uid(), so
// only attempt them with a real session. Without this, anonymous page loads
// (e.g. a visitor with stale localStorage cases) fire inserts that fail the
// user_id NOT NULL constraint with a 400.
const hasAuthedSession = async (): Promise<boolean> => {
  try {
    const session = await getSession();
    return !!session?.access_token;
  } catch {
    return false;
  }
};

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
  if (!(await hasAuthedSession())) return false;

  // Never throw: callers often fire this without awaiting, so a network-level
  // rejection here would surface as an unhandled rejection and lose the case
  // silently. Swallow to a boolean instead.
  try {
    const { error } = await sb.from(CASES_TABLE).upsert(await toCaseRow(c), { onConflict: 'id' });
    if (error) console.warn('[caseStore] case upsert failed:', error.message);
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
  if (!(await hasAuthedSession())) return false;

  try {
    const rows = await Promise.all(cases.map(toCaseRow));
    const { error } = await sb.from(CASES_TABLE).upsert(rows, { onConflict: 'id' });
    if (error) console.warn('[caseStore] batch case sync failed:', error.message);
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
  if (!(await hasAuthedSession())) return false;

  const rowId = await deriveCaseRowId(id);
  const { error } = await sb.from(CASES_TABLE).delete().eq('id', rowId).eq('firm_id', getFirmId());
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
