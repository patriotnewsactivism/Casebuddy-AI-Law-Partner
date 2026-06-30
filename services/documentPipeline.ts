/**
 * Document Pipeline — upload, OCR, and analysis via Supabase Storage + Edge Functions
 * 
 * Handles:
 * - File upload to Supabase Storage (case-documents bucket)
 * - OCR processing via edge function (Gemini → Tesseract → OCR.space)
 * - Document record management in Supabase
 * - Bulk upload with progress tracking
 * - Bates numbering
 */

import { getSupabase, isSupabaseConfigured } from './supabaseClient';
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
}

export interface UploadProgress {
  fileName: string;
  status: 'pending' | 'uploading' | 'processing' | 'analyzing' | 'complete' | 'error';
  progress: number; // 0-100
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
    if (file.size > 200 * 1024 * 1024) return null; // skip >200MB
    const buf = await file.arrayBuffer();
    const digest = await crypto.subtle.digest('SHA-256', buf);
    return Array.from(new Uint8Array(digest))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  } catch {
    return null;
  }
}

function formatBatesNumber(prefix: string, number: number, padLength = 6): string {
  return `${prefix}-${String(number).padStart(padLength, '0')}`;
}

// ─── Core Functions ──────────────────────────────────────────────────

/**
 * Upload a single file to Supabase Storage and create a document record.
 */
export async function uploadDocument(
  file: File,
  caseId: string,
  options?: {
    batesPrefix?: string;
    batesNumber?: number;
    autoAnalyze?: boolean;
  }
): Promise<{ document: DocumentRecord; ocrResult?: OcrResult }> {
  const supabase = getSupabase();
  if (!supabase) throw new Error('Supabase not configured');

  // Get current user
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const safeName = sanitizeFileName(file.name);
  const storagePath = `${user.id}/${caseId}/${Date.now()}-${safeName}`;
  const contentHash = await computeContentHash(file);

  // 1. Upload to Supabase Storage
  const { error: uploadError } = await supabase.storage
    .from('case-documents')
    .upload(storagePath, file, { upsert: true });

  if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`);

  // 2. Get public URL
  const { data: publicUrlData } = supabase.storage
    .from('case-documents')
    .getPublicUrl(storagePath);

  const fileUrl = publicUrlData?.publicUrl || null;

  // 3. Build Bates number if requested
  const batesFormatted = options?.batesPrefix && options?.batesNumber != null
    ? formatBatesNumber(options.batesPrefix, options.batesNumber)
    : null;

  // 4. Insert document record
  const { data: doc, error: dbError } = await supabase
    .from('documents')
    .insert({
      case_id: await deriveCaseRowId(caseId),
      user_id: user.id,
      name: file.name,
      file_type: file.type,
      file_size: file.size,
      storage_path: storagePath,
      file_url: fileUrl,
      status: 'queued',
      bates_prefix: options?.batesPrefix || null,
      bates_formatted: batesFormatted,
      content_hash: contentHash,
    })
    .select('*')
    .single();

  if (dbError) throw new Error(`DB insert failed: ${dbError.message}`);

  // 5. Rely on the Database Webhook to trigger OCR + Analysis
  // Since we inserted the document into `documents` with status `queued`, 
  // the `trigger_queue_ocr` Postgres trigger will insert an `ocr` job
  // into the `pipeline_jobs` table. The frontend UI can listen via Realtime.
  
  let ocrResult: OcrResult | undefined;
  
  if (fileUrl && (options?.autoAnalyze !== false)) {
    // We no longer block on edgeFn.ocrDocument. The UI will return instantly.
  }

  return { document: doc as DocumentRecord, ocrResult };
}

/**
 * Bulk upload multiple files with progress tracking.
 */
export async function bulkUploadDocuments(
  files: File[],
  options: BulkUploadOptions
): Promise<UploadProgress[]> {
  const supabase = getSupabase();
  if (!supabase) throw new Error('Supabase not configured');

  const progress: UploadProgress[] = files.map(f => ({
    fileName: f.name,
    status: 'pending' as const,
    progress: 0,
  }));

  const updateProgress = () => options.onProgress?.(progress);
  updateProgress();

  // Get next Bates number if prefix provided
  let nextBates = options.batesStartNumber || 1;
  if (options.batesPrefix && !options.batesStartNumber) {
    // Query highest existing Bates number for this prefix
    const { data: maxBates } = await supabase
      .from('documents')
      .select('bates_formatted')
      .eq('case_id', await deriveCaseRowId(options.caseId))
      .eq('bates_prefix', options.batesPrefix)
      .order('bates_formatted', { ascending: false })
      .limit(1);

    if (maxBates?.[0]?.bates_formatted) {
      const match = maxBates[0].bates_formatted.match(/(\d+)$/);
      if (match) nextBates = parseInt(match[1]) + 1;
    }
  }

  // Process files sequentially (to avoid overwhelming edge functions)
  for (let i = 0; i < files.length; i++) {
    progress[i].status = 'uploading';
    progress[i].progress = 10;
    updateProgress();

    try {
      progress[i].status = 'uploading';
      progress[i].progress = 30;
      updateProgress();

      const { document, ocrResult } = await uploadDocument(files[i], options.caseId, {
        batesPrefix: options.batesPrefix,
        batesNumber: options.batesPrefix ? nextBates++ : undefined,
        autoAnalyze: options.autoAnalyze !== false,
      });

      progress[i].status = 'complete';
      progress[i].progress = 100;
      progress[i].documentId = document.id;
      progress[i].ocrResult = ocrResult;
    } catch (err) {
      progress[i].status = 'error';
      progress[i].error = err instanceof Error ? err.message : 'Upload failed';
    }

    updateProgress();
  }

  return progress;
}

/**
 * Fetch all documents for a case.
 */
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

  return data as DocumentRecord[];
}

/**
 * Re-analyze a document that was previously uploaded.
 */
export async function reanalyzeDocument(documentId: string): Promise<OcrResult | null> {
  const supabase = getSupabase();
  if (!supabase) return null;

  const { data: doc } = await supabase
    .from('documents')
    .select('id, file_url')
    .eq('id', documentId)
    .single();

  if (!doc?.file_url) return null;

  await supabase.from('documents').update({ status: 'processing' }).eq('id', documentId);

  try {
    const result = await edgeFn.ocrDocument({
      documentId,
      fileUrl: doc.file_url,
    });

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
  } catch (err) {
    await supabase.from('documents').update({ status: 'error' }).eq('id', documentId);
    throw err;
  }
}

/**
 * Delete a document and its storage file.
 */
export async function deleteDocument(documentId: string): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) return;

  // Get storage path first
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

/**
 * Run cross-document analysis on selected documents.
 */
export async function analyzeCrossDocuments(
  caseId: string,
  documentIds: string[],
  analysisType: 'contradictions' | 'timeline' | 'patterns' | 'comprehensive' = 'comprehensive'
) {
  return edgeFn.crossDocumentAnalysis({ caseId, documentIds, analysisType });
}
