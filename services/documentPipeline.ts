/**
 * Document Pipeline — upload, OCR, and analysis via Supabase Storage + workers.
 *
 * Security invariant: `case-documents` is private. Canonical code stores the
 * storage path, not a public object URL. Short-lived signed URLs are created
 * only when a browser or processing endpoint actually needs to read a file.
 *
 * Handles:
 * - private file upload to Supabase Storage
 * - document record management in Supabase
 * - queued OCR/analysis via the canonical pipeline worker
 * - bulk upload progress
 * - Bates display metadata
 */

import { getSupabase } from './supabaseClient';
import { edgeFn, OcrResult } from './edgeFunctionClient';
import { deriveCaseRowId } from './caseStore';

// ─── Types ────────────────────────────────────────────────────────────

export interface DocumentRecord {
  id: string;
  case_id: string;
  user_id: string;
  name: string;
  file_url: string | null;
  file_type: string;
  file_size: number;
  storage_path: string | null;
  bates_number: string | null;
  bates_prefix: string | null;
  bates_formatted: string | null;
  summary: string | null;
  key_facts: string[] | null;
  favorable_findings: string[] | null;
  adverse_findings: string[] | null;
  action_items: string[] | null;
  ai_analyzed: boolean;
  ocr_text: string | null;
  extracted_text: string | null;
  document_type: string | null;
  status: string;
  created_at: string;
  updated_at: string;
  content_hash?: string | null;
  entities?: unknown[] | null;
}

export interface UploadProgress {
  fileName: string;
  status: 'pending' | 'uploading' | 'processing' | 'analyzing' | 'complete' | 'error';
  progress: number;
  error?: string;
  documentId?: string;
  ocrResult?: OcrResult;
}

export interface BulkUploadOptions {
  caseId: string;
  batesPrefix?: string;
  batesStartNumber?: number;
  autoAnalyze?: boolean;
  onProgress?: (progress: UploadProgress[]) => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────

function sanitizeFileName(name: string): string {
  return name.replace(/[\\/]/g, '_').replace(/[^\w.\-() ]+/g, '_');
}

async function computeContentHash(file: File): Promise<string | null> {
  try {
    if (typeof crypto === 'undefined' || !crypto.subtle) return null;
    if (file.size > 200 * 1024 * 1024) return null;
    const buf = await file.arrayBuffer();
    const digest = await crypto.subtle.digest('SHA-256', buf);
    return Array.from(new Uint8Array(digest))
      .map(byte => byte.toString(16).padStart(2, '0'))
      .join('');
  } catch {
    return null;
  }
}

function formatBatesNumber(prefix: string, number: number, padLength = 6): string {
  return `${prefix}-${String(number).padStart(padLength, '0')}`;
}

/**
 * Resolve a private case document to a short-lived URL.
 *
 * Do not persist the returned URL. It is an access token with an expiry.
 */
export async function getDocumentSignedUrl(
  document: Pick<DocumentRecord, 'storage_path'>,
  expiresInSeconds = 10 * 60,
): Promise<string | null> {
  if (!document.storage_path) return null;
  const supabase = getSupabase();
  if (!supabase) return null;

  const { data, error } = await supabase.storage
    .from('case-documents')
    .createSignedUrl(document.storage_path, expiresInSeconds);

  if (error) {
    console.warn('[documentPipeline] could not create signed URL', { message: error.message });
    return null;
  }

  return data?.signedUrl ?? null;
}

// ─── Core Functions ──────────────────────────────────────────────────

/**
 * Upload a single file to private Supabase Storage and create a document row.
 */
export async function uploadDocument(
  file: File,
  caseId: string,
  options?: {
    batesPrefix?: string;
    batesNumber?: number;
    autoAnalyze?: boolean;
  },
): Promise<{ document: DocumentRecord; ocrResult?: OcrResult }> {
  const supabase = getSupabase();
  if (!supabase) throw new Error('Supabase not configured');

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const safeName = sanitizeFileName(file.name);
  const storagePath = `${user.id}/${caseId}/${Date.now()}-${safeName}`;
  const contentHash = await computeContentHash(file);

  const { error: uploadError } = await supabase.storage
    .from('case-documents')
    .upload(storagePath, file, { upsert: false });

  if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`);

  const batesFormatted = options?.batesPrefix && options?.batesNumber != null
    ? formatBatesNumber(options.batesPrefix, options.batesNumber)
    : null;

  const { data: doc, error: dbError } = await supabase
    .from('documents')
    .insert({
      case_id: await deriveCaseRowId(caseId),
      user_id: user.id,
      name: file.name,
      file_type: file.type,
      file_size: file.size,
      storage_path: storagePath,
      // Private storage objects do not have durable browser-readable URLs.
      file_url: null,
      status: options?.autoAnalyze === false ? 'uploaded' : 'queued',
      bates_prefix: options?.batesPrefix || null,
      bates_formatted: batesFormatted,
      content_hash: contentHash,
      source_app: 'law-partner',
    })
    .select('*')
    .single();

  if (dbError) {
    // Avoid orphaning a private object when the metadata insert fails.
    await supabase.storage.from('case-documents').remove([storagePath]).catch(() => undefined);
    throw new Error(`DB insert failed: ${dbError.message}`);
  }

  // A queued row is picked up by the canonical database trigger / pipeline
  // worker. The browser returns immediately instead of holding a long OCR call.
  return { document: doc as DocumentRecord };
}

/**
 * Bulk upload multiple files with progress tracking.
 *
 * Bates numbering in this compatibility path is still sequential within this
 * browser batch. Cross-client atomic reservation is a schema-level migration
 * and must be reconciled against the canonical production Supabase project
 * before replacing this path.
 */
export async function bulkUploadDocuments(
  files: File[],
  options: BulkUploadOptions,
): Promise<UploadProgress[]> {
  const supabase = getSupabase();
  if (!supabase) throw new Error('Supabase not configured');

  const progress: UploadProgress[] = files.map(file => ({
    fileName: file.name,
    status: 'pending' as const,
    progress: 0,
  }));

  const updateProgress = () => options.onProgress?.([...progress]);
  updateProgress();

  let nextBates = options.batesStartNumber || 1;
  if (options.batesPrefix && !options.batesStartNumber) {
    const { data: maxBates } = await supabase
      .from('documents')
      .select('bates_formatted')
      .eq('case_id', await deriveCaseRowId(options.caseId))
      .eq('bates_prefix', options.batesPrefix)
      .order('bates_formatted', { ascending: false })
      .limit(1);

    if (maxBates?.[0]?.bates_formatted) {
      const match = maxBates[0].bates_formatted.match(/(\d+)$/);
      if (match) nextBates = Number.parseInt(match[1], 10) + 1;
    }
  }

  for (let i = 0; i < files.length; i += 1) {
    progress[i].status = 'uploading';
    progress[i].progress = 15;
    updateProgress();

    try {
      const { document } = await uploadDocument(files[i], options.caseId, {
        batesPrefix: options.batesPrefix,
        batesNumber: options.batesPrefix ? nextBates++ : undefined,
        autoAnalyze: options.autoAnalyze !== false,
      });

      progress[i].status = options.autoAnalyze === false ? 'complete' : 'processing';
      progress[i].progress = options.autoAnalyze === false ? 100 : 70;
      progress[i].documentId = document.id;
    } catch (error) {
      progress[i].status = 'error';
      progress[i].error = error instanceof Error ? error.message : 'Upload failed';
    }

    updateProgress();
  }

  // Upload completion means the files and metadata were accepted. Analysis is
  // asynchronous; consumers can update the status through Realtime/polling.
  progress.forEach(item => {
    if (item.status === 'processing') {
      item.status = 'complete';
      item.progress = 100;
    }
  });
  updateProgress();

  return progress;
}

/** Fetch all documents for a case. */
export async function getCaseDocuments(caseId: string): Promise<DocumentRecord[]> {
  const supabase = getSupabase();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from('documents')
    .select('*')
    .eq('case_id', await deriveCaseRowId(caseId))
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching documents:', error);
    return [];
  }

  return (data ?? []) as DocumentRecord[];
}

/**
 * Re-analyze a document that was previously uploaded.
 *
 * The signed URL exists only for the processing request and is never written
 * back to the database.
 */
export async function reanalyzeDocument(documentId: string): Promise<OcrResult | null> {
  const supabase = getSupabase();
  if (!supabase) return null;

  const { data: doc, error } = await supabase
    .from('documents')
    .select('id, storage_path')
    .eq('id', documentId)
    .single();

  if (error || !doc?.storage_path) return null;

  const fileUrl = await getDocumentSignedUrl({ storage_path: doc.storage_path }, 15 * 60);
  if (!fileUrl) throw new Error('Could not authorize temporary access to the document');

  await supabase.from('documents').update({ status: 'processing' }).eq('id', documentId);

  try {
    const result = await edgeFn.ocrDocument({ documentId, fileUrl });

    await supabase.from('documents').update({
      status: 'analyzed',
      ai_analyzed: true,
      ocr_text: result.text?.slice(0, 100000) || null,
      extracted_text: result.text?.slice(0, 100000) || null,
      summary: result.summary || null,
      key_facts: result.keyFacts || null,
      favorable_findings: result.favorableFindings || null,
      adverse_findings: result.adverseFindings || null,
      action_items: result.actionItems || null,
      entities: result.entities || null,
    }).eq('id', documentId);

    return result;
  } catch (error) {
    await supabase.from('documents').update({ status: 'error' }).eq('id', documentId);
    throw error;
  }
}

/** Delete a document and its private storage object. */
export async function deleteDocument(documentId: string): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) return;

  const { data: doc } = await supabase
    .from('documents')
    .select('storage_path')
    .eq('id', documentId)
    .single();

  if (doc?.storage_path) {
    await supabase.storage.from('case-documents').remove([doc.storage_path]);
  }

  await supabase.from('documents').delete().eq('id', documentId);
}

/** Run cross-document analysis on selected documents. */
export async function analyzeCrossDocuments(
  caseId: string,
  documentIds: string[],
  analysisType: 'contradictions' | 'timeline' | 'patterns' | 'comprehensive' = 'comprehensive',
) {
  return edgeFn.crossDocumentAnalysis({ caseId, documentIds, analysisType });
}
