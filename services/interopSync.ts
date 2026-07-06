/**
 * interopSync — the hub that keeps law-partner, Case-Companion, and
 * DiscoveryLens in sync.
 *
 * All three apps share one Supabase project, so a record created in any app
 * already lives in the same `documents` / `cases` tables. This service turns
 * that shared storage into a real product feature:
 *
 *   • provenance      — every row is tagged with source_app
 *   • one-click sync  — push a case or document into another app's workspace
 *                       (records the adoption in synced_to + app_sync_events)
 *   • pull feed       — list what another app has produced (e.g. DiscoveryLens
 *                       uploads) so you can adopt them into a case with a click
 *   • portable export — a versioned CBIF envelope for backup / cross-project
 *                       transfer, so nothing is locked to one app
 *
 * The canonical interchange contract is documented in INTEROP.md.
 */

import type { Case } from '../types';
import { getSupabase } from './supabaseClient';
import { getFirmId, deriveCaseRowId } from './caseStore';
import type { DocumentRecord } from './documentPipeline';

export type AppId = 'law-partner' | 'companion' | 'discoverylens';

export const APP_LABELS: Record<AppId, string> = {
  'law-partner': 'CaseBuddy Law Partner',
  'companion': 'Case Companion',
  'discoverylens': 'DiscoveryLens',
};

/** This app's identity — used to tag everything it creates. */
export const THIS_APP: AppId = 'law-partner';

// ── CBIF: CaseBuddy Interchange Format ───────────────────────────────────────
// The portable envelope every app can import/export. Versioned so we can
// evolve it without breaking older clients.

export const CBIF_VERSION = '1.0';

export interface CbifDocument {
  name: string;
  document_type: string | null;
  document_date: string | null;
  bates_formatted: string | null;
  summary: string | null;
  key_facts: string[] | null;
  favorable_findings: string[] | null;
  adverse_findings: string[] | null;
  ocr_text: string | null;
  file_url: string | null;
  source_app: string;
}

export interface CbifBundle {
  cbif_version: string;
  exported_at: string;
  exported_by_app: AppId;
  firm_id: string;
  case: Partial<Case> & { id: string; title: string };
  documents: CbifDocument[];
}

// ── Provenance-aware helpers ─────────────────────────────────────────────────

const logSyncEvent = async (
  entityType: 'case' | 'document',
  entityId: string,
  toApp: AppId,
  action: 'push' | 'pull' | 'update' = 'push',
  metadata: Record<string, unknown> = {}
): Promise<void> => {
  const sb = getSupabase();
  if (!sb) return;
  try {
    await sb.from('app_sync_events').insert({
      firm_id: getFirmId(),
      entity_type: entityType,
      entity_id: entityId,
      from_app: THIS_APP,
      to_app: toApp,
      action,
      metadata,
    });
  } catch { /* audit trail is best-effort */ }
};

const addSyncedTo = (existing: string[] | null | undefined, app: AppId): string[] => {
  const set = new Set(existing ?? []);
  set.add(app);
  return Array.from(set);
};

// ── Push: send a case (and optionally its documents) into another app ────────

/**
 * Make a case visible in another app's workspace. Because storage is shared,
 * this tags the row so the target app surfaces it and records the hand-off.
 */
export async function pushCaseToApp(caseAppId: string, target: AppId): Promise<boolean> {
  const sb = getSupabase();
  if (!sb) return false;
  try {
    const rowId = await deriveCaseRowId(caseAppId);
    const { data: existing } = await sb
      .from('cases')
      .select('synced_to')
      .eq('id', rowId)
      .maybeSingle();
    const synced_to = addSyncedTo(existing?.synced_to, target);
    const { error } = await sb.from('cases').update({ synced_to }).eq('id', rowId);
    if (error) { console.warn('[interopSync] pushCase failed:', error.message); return false; }
    await logSyncEvent('case', caseAppId, target, 'push');
    return true;
  } catch (e) {
    console.warn('[interopSync] pushCase error:', e);
    return false;
  }
}

/**
 * Adopt a document into a case and (optionally) surface it in another app.
 * This is the "sync DiscoveryLens upload into Law Partner with one click"
 * path: assign the shared document row to the case and tag it.
 */
export async function adoptDocumentIntoCase(
  documentId: string,
  caseAppId: string,
  target: AppId = THIS_APP
): Promise<boolean> {
  const sb = getSupabase();
  if (!sb) return false;
  try {
    const caseRowId = await deriveCaseRowId(caseAppId);
    const { data: existing } = await sb
      .from('documents')
      .select('synced_to')
      .eq('id', documentId)
      .maybeSingle();
    const synced_to = addSyncedTo(existing?.synced_to, target);
    const { error } = await sb
      .from('documents')
      .update({ case_id: caseRowId, synced_to })
      .eq('id', documentId);
    if (error) { console.warn('[interopSync] adoptDocument failed:', error.message); return false; }
    await logSyncEvent('document', documentId, target, 'push', { caseAppId });
    return true;
  } catch (e) {
    console.warn('[interopSync] adoptDocument error:', e);
    return false;
  }
}

// ── Pull: see what other apps have produced ──────────────────────────────────

/**
 * Documents created in another app (e.g. DiscoveryLens uploads with Bates
 * numbers + extracted fields + intelligent names) that this firm can adopt.
 * `unassignedOnly` filters to documents not yet attached to a case.
 */
export async function listDocumentsFromApp(
  source: AppId,
  opts: { unassignedOnly?: boolean; limit?: number } = {}
): Promise<DocumentRecord[]> {
  const sb = getSupabase();
  if (!sb) return [];
  try {
    let q = sb
      .from('documents')
      .select('*')
      .eq('source_app', source)
      .order('created_at', { ascending: false })
      .limit(opts.limit ?? 100);
    const { data, error } = await q;
    if (error) return [];
    let rows = (data ?? []) as DocumentRecord[];
    if (opts.unassignedOnly) {
      rows = rows.filter(d => !d.case_id);
    }
    return rows;
  } catch {
    return [];
  }
}

/** Cases created in another app that can be pulled into this one. */
export async function listCasesFromApp(source: AppId, limit = 100): Promise<any[]> {
  const sb = getSupabase();
  if (!sb) return [];
  try {
    const { data, error } = await sb
      .from('cases')
      .select('id, name, case_type, client_name, data, source_app, synced_to, updated_at')
      .eq('firm_id', getFirmId())
      .eq('source_app', source)
      .order('updated_at', { ascending: false })
      .limit(limit);
    if (error) return [];
    return data ?? [];
  } catch {
    return [];
  }
}

// ── Recent cross-app activity (for a "Connected Apps" feed) ──────────────────

export interface SyncEvent {
  id: string;
  created_at: string;
  entity_type: 'case' | 'document';
  entity_id: string;
  from_app: string;
  to_app: string;
  action: string;
  metadata: Record<string, unknown>;
}

export async function recentSyncEvents(limit = 25): Promise<SyncEvent[]> {
  const sb = getSupabase();
  if (!sb) return [];
  try {
    const { data, error } = await sb
      .from('app_sync_events')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) return [];
    return (data ?? []) as SyncEvent[];
  } catch {
    return [];
  }
}

// ── Portable export (CBIF) ───────────────────────────────────────────────────

/**
 * Export a case + its documents to the portable CBIF envelope — for backup or
 * transfer to a separate deployment. Within the shared project, prefer
 * push/adopt (no copy needed); use this for cross-project moves.
 */
export async function exportCaseBundle(c: Case): Promise<CbifBundle> {
  const sb = getSupabase();
  let documents: CbifDocument[] = [];
  if (sb) {
    try {
      const rowId = await deriveCaseRowId(c.id);
      const { data } = await sb
        .from('documents')
        .select('name, document_type, document_date, bates_formatted, summary, key_facts, favorable_findings, adverse_findings, ocr_text, file_url, source_app')
        .eq('case_id', rowId);
      documents = (data ?? []) as CbifDocument[];
    } catch { /* export core case even if documents unavailable */ }
  }
  return {
    cbif_version: CBIF_VERSION,
    exported_at: new Date().toISOString(),
    exported_by_app: THIS_APP,
    firm_id: getFirmId(),
    case: { ...c, id: c.id, title: c.title },
    documents,
  };
}

/** Validate a CBIF envelope before importing (used by the receiving app). */
export function isValidCbif(obj: any): obj is CbifBundle {
  return !!obj
    && typeof obj.cbif_version === 'string'
    && obj.case && typeof obj.case.id === 'string'
    && Array.isArray(obj.documents);
}
