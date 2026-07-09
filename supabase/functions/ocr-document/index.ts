import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  getCorsHeaders,
  createErrorResponse,
  validateEnvVars,
  validateRequestBody,
  checkRateLimit,
} from '../_shared/errorHandler.ts';
import { verifyAuth, forbiddenResponse } from '../_shared/auth.ts';
import { validateUUID, validateURL } from '../_shared/validation.ts';
import { getGenerateContentCapableGeminiModels, 
getPreferredGeminiCandidates, rankGeminiModels } from '../_shared/gemini-model-utils.ts';
import { googleVisionOcr, isGoogleVisionConfigured } from '../_shared/google-vision.ts';
const STORAGE_BUCKET = 'case-documents';

interface OcrSpaceParsedResult {
  ParsedText?: string;
}

interface OcrSpaceResponse {
  OCRExitCode?: number;
  ParsedResults?: OcrSpaceParsedResult[];
  ErrorMessage?: string | string[];
}

interface GeminiContentPart {
  text?: string;
}

interface GeminiCandidate {
  content?: {
    parts?: GeminiContentPart[];
  };
}

interface GeminiResponse {
  candidates?: GeminiCandidate[];
}

interface GeminiInlineData {
  mime_type: string;
  data: string;
}

interface GeminiPart {
  text?: string;
  inline_data?: GeminiInlineData;
}

interface GeminiContent {
  parts: GeminiPart[];
}

interface GeminiGenerationConfig {
  temperature?: number;
  maxOutputTokens?: number;
  responseMimeType?: string;
}

interface GeminiRequestBody {
  contents: GeminiContent[];
  generationConfig?: GeminiGenerationConfig;
}

type TimelineImportance = 'low' | 'medium' | 'high';
type TimelinePhase = 'pre-suit' | 'pleadings' | 'discovery' | 'dispositive' | 'trial' | 'post-trial';

const DEFAULT_TIMELINE_EVENT_CAP = 30;

const parsePositiveInt = (value: string | undefined, fallback: number): number => {
  const parsed = Number.parseInt(value || '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const MAX_TIMELINE_EVENTS = parsePositiveInt(Deno.env.get('TIMELINE_EVENT_CAP'), DEFAULT_TIMELINE_EVENT_CAP);

interface TimelineEventCandidate {
  date?: string;
  event_title?: string;
  description?: string;
  importance?: string;
  event_type?: string;
  phase?: string;
  next_required_action?: string;
  entities?: string[];
}

interface TimelineEventInsertRow {
  case_id: string;
  user_id: string;
  linked_document_id: string;
  event_date: string;
  title: string;
  description: string;
  importance: TimelineImportance;
  event_type: string;
  phase: TimelinePhase;
  next_required_action: string | null;
  entities: string[];
  created_at: string;
  updated_at: string;
}

interface HeuristicAnalysisResult {
  summary: string;
  keyFacts: string[];
  favorableFindings: string[];
  adverseFindings: string[];
  actionItems: string[];
  timelineEvents: TimelineEventCandidate[];
}

interface StructuredChunkAnalysis {
  summary: string;
  keyFacts: string[];
  favorableFindings: string[];
  adverseFindings: string[];
  actionItems: string[];
  timelineEvents: TimelineEventCandidate[];
  entities: unknown[];
}

const ANALYSIS_CHUNK_CHAR_LIMIT = 12000;
const ANALYSIS_CHUNK_OVERLAP = 500;

function extractStoragePath(fileUrl: string): string | null {
  if (!fileUrl || typeof fileUrl !== 'string') return null;
  if (!fileUrl.startsWith('http')) return fileUrl.replace(/^\/+/, '');
  const lower = fileUrl.toLowerCase();
  if (!lower.includes('/storage/v1/object/')) return null;
  const marker = `/${STORAGE_BUCKET}/`;
  const markerIndex = lower.indexOf(marker);
  if (markerIndex === -1) return null;
  const pathWithQuery = fileUrl.slice(markerIndex + marker.length);
  return pathWithQuery.split('?')[0];
}

async function loadFileBlob(
  supabase: SupabaseClient,
  fileUrl: string
): Promise<{ blob: Blob; contentType: string }> {
  const storagePath = extractStoragePath(fileUrl);
  if (storagePath) {
    const { data, error } = await supabase.storage.from(STORAGE_BUCKET).download(storagePath);
    if (!error && data) return { blob: data, contentType: data.type || '' };
  }
  if (!fileUrl.startsWith('http')) throw new Error('File URL is not a valid URL');
  const response = await fetch(fileUrl);
  if (!response.ok) throw new Error(`Failed to fetch file: ${response.status} ${response.statusText}`);
  const contentType = response.headers.get('content-type') || '';
  const blob = await response.blob();
  return { blob, contentType };
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const arrayBufferToBase64 = (buffer: ArrayBuffer): string => {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 16384; // 16kb chunks - fast and safe
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
};

// Strip NUL bytes, lone surrogates, and other control chars that Postgres/JSONB
// rejects with "unsupported Unicode escape sequence" — common artifacts from
// OCR on scanned/corrupted PDFs. Keeps \t and \n.
const sanitizeForPostgres = (text: string): string =>
  text
    // eslint-disable-next-line no-control-regex
    .replace(/\u0000/g, '') // NUL — the specific cause of the Postgres error
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0001-\u0008\u000B\u000C\u000E-\u001F]/g, '') // other C0 control chars
    .replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, ''); // lone surrogates

const normalizeExtractedText = (text: string) =>
  sanitizeForPostgres(text)
    .replace(/\r\n/g, '\n').replace(/[ \t]+\n/g, '\n').replace(/\n{4,}/g, '\n\n\n').trim();

const extractGeminiText = (payload: GeminiResponse): string => {
  const parts = payload?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) return '';
  return parts.map((part) => String(part?.text || '')).join('').trim();
};

const toDateOnlyString = (value: string | undefined): string | null => {
  if (!value) return null;
  const trimmed = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  if (/^\d{4}-\d{2}$/.test(trimmed)) return `${trimmed}-01`;
  if (/^\d{4}$/.test(trimmed)) return `${trimmed}-01-01`;
  const parsed = new Date(trimmed);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().split('T')[0];
  return null;
};

const normalizeImportance = (value: string | undefined): TimelineImportance => {
  const normalized = (value || '').trim().toLowerCase();
  if (normalized === 'low' || normalized === 'medium' || normalized === 'high') return normalized;
  return 'medium';
};

const importanceRank: Record<TimelineImportance, number> = {
  low: 1,
  medium: 2,
  high: 3,
};

const normalizeTitleKey = (value: string | undefined): string =>
  (value || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const buildTextChunks = (text: string, maxChars: number, overlapChars: number): string[] => {
  const cleaned = text.trim();
  if (!cleaned) return [];

  const chunks: string[] = [];
  let cursor = 0;

  while (cursor < cleaned.length) {
    let end = Math.min(cursor + maxChars, cleaned.length);
    if (end < cleaned.length) {
      const breakIdx = cleaned.lastIndexOf('\n\n', end);
      if (breakIdx > cursor + Math.floor(maxChars * 0.6)) {
        end = breakIdx;
      }
    }

    const chunk = cleaned.slice(cursor, end).trim();
    if (chunk) {
      chunks.push(chunk);
    }

    if (end >= cleaned.length) break;
    cursor = Math.max(end - overlapChars, cursor + 1);
  }

  return chunks;
};

const mergeChunkAnalyses = (analyses: StructuredChunkAnalysis[]): StructuredChunkAnalysis => {
  const timelineMap = new Map<string, TimelineEventCandidate>();
  const summaryParts: string[] = [];

  for (const analysis of analyses) {
    if (analysis.summary.trim()) {
      summaryParts.push(analysis.summary.trim());
    }

    for (const event of analysis.timelineEvents || []) {
      const normalizedDate = toDateOnlyString(event.date);
      const normalizedTitle = normalizeTitleKey(event.event_title);
      if (!normalizedDate || !normalizedTitle) {
        continue;
      }

      const key = `${normalizedDate}|${normalizedTitle}`;
      const existing = timelineMap.get(key);
      if (!existing) {
        timelineMap.set(key, {
          ...event,
          date: normalizedDate,
          event_title: event.event_title?.trim() || 'Untitled Event',
          description: (event.description || '').trim(),
          importance: normalizeImportance(event.importance),
          entities: uniqueTrimmed(Array.isArray(event.entities) ? event.entities : [], 15),
        });
        continue;
      }

      const existingImportance = normalizeImportance(existing.importance);
      const candidateImportance = normalizeImportance(event.importance);
      const strongerImportance =
        importanceRank[candidateImportance] > importanceRank[existingImportance]
          ? candidateImportance
          : existingImportance;

      const mergedDescription =
        (event.description || '').length > (existing.description || '').length
          ? (event.description || '').trim()
          : (existing.description || '').trim();

      timelineMap.set(key, {
        ...existing,
        importance: strongerImportance,
        description: mergedDescription,
        entities: uniqueTrimmed(
          [
            ...(Array.isArray(existing.entities) ? existing.entities : []),
            ...(Array.isArray(event.entities) ? event.entities : []),
          ],
          15
        ),
      });
    }
  }

  return {
    summary: uniqueTrimmed(summaryParts, 3).join(' '),
    keyFacts: uniqueTrimmed(analyses.flatMap((analysis) => analysis.keyFacts || []), 12),
    favorableFindings: uniqueTrimmed(
      analyses.flatMap((analysis) => analysis.favorableFindings || []),
      8
    ),
    adverseFindings: uniqueTrimmed(analyses.flatMap((analysis) => analysis.adverseFindings || []), 8),
    actionItems: uniqueTrimmed(analyses.flatMap((analysis) => analysis.actionItems || []), 8),
    timelineEvents: Array.from(timelineMap.values()).sort((a, b) =>
      (toDateOnlyString(a.date) || '9999-12-31').localeCompare(toDateOnlyString(b.date) || '9999-12-31')
    ),
    entities: uniqueTrimmed(
      analyses.flatMap((analysis) =>
        (analysis.entities || []).map((entity) => JSON.stringify(entity))
      ),
      25
    ).map((entity) => {
      try {
        return JSON.parse(entity);
      } catch {
        return entity;
      }
    }),
  };
};

const normalizeTimelineEvent = (
  event: TimelineEventCandidate,
  caseId: string,
  documentId: string,
  ownerUserId: string
): TimelineEventInsertRow | null => {
  const nowIso = new Date().toISOString();
  const dateOnly = toDateOnlyString(event.date);
  if (!dateOnly) return null;
  let title = (event.event_title || '').trim();
  title = title.replace(/={2,}\s*PAGE\s+\d+\s*={0,}/gi, '').replace(/^PAGE\s+\d+\s*/i, '').trim();
  const description = (event.description || '').replace(/={2,}\s*PAGE\s+\d+\s*={0,}/gi, '').trim();
  const eventType = (event.event_type || '').trim();
  const content = `${title} ${description} ${eventType}`.toLowerCase();
  const entities = Array.isArray(event.entities) ? event.entities : [];
  const importance = normalizeImportance(event.importance);
  const phase = normalizePhase(event.phase, content);
  const nextRequiredAction = (event.next_required_action || '').trim() || inferNextRequiredAction(phase, content);
  if (!title && description.length < 20) return null;
  if (isTitleOcrJunk(title)) return null;
  return {
    case_id: caseId,
    user_id: ownerUserId,
    linked_document_id: documentId,
    event_date: new Date(`${dateOnly}T00:00:00.000Z`).toISOString(),
    title: title.length > 0 ? title.slice(0, 180) : 'Untitled Event',
    description: description.slice(0, 2000),
    importance,
    event_type: eventType.length > 0 ? eventType.slice(0, 100) : 'general',
    phase,
    next_required_action: nextRequiredAction.slice(0, 240) || null,
    entities,
    created_at: nowIso,
    updated_at: nowIso,
  };
};

const sentenceSplitRegex = /[^.!?\\n]+[.!?]?/g;

const extractSentences = (text: string): string[] => {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (!normalized) return [];
  return normalized.match(sentenceSplitRegex)?.map((s) => s.trim()).filter(Boolean) || [];
};

const buildAnalysisDocumentContext = (text: string, maxChars = 120000): string => {
  const normalized = normalizeExtractedText(text);
  if (normalized.length <= maxChars) return normalized;
  const head = normalized.slice(0, maxChars * 0.7);
  const tail = normalized.slice(-maxChars * 0.2);
  return `${head}\n\n[... document continues ...]\n\n${tail}`;
};

const monthNames = '(?:January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)';

const dateTokenMatchers = [
  new RegExp(`\\b${monthNames}\\s+\\d{1,2},\\s+\\d{4}\\b`, 'i'),
  /\b\d{4}-\d{2}-\d{2}\b/,
  /\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/,
  new RegExp(`\\b${monthNames}\\s+\\d{4}\\b`, 'i'),
] as const;

const extractDateToken = (sentence: string): string | null => {
  for (const matcher of dateTokenMatchers) {
    const match = sentence.match(matcher);
    if (match?.[0]) return match[0];
  }
  return null;
};

const isOcrArtifact = (sentence: string): boolean => {
  const s = sentence.trim();
  if (/^={2,}\s*PAGE\s+\d+/i.test(s)) return true;
  if (/^PAGE\s+\d+\s+(Case|of)\b/i.test(s)) return true;
  if (/^Case\s+\d+[:-]\d+/i.test(s)) return true;
  if (/^Document\s+[#\d]/i.test(s) && /Page\s+\d+\s+of\s+\d+/i.test(s)) return true;
  const cleaned = s.replace(/(?:PAGE|DOCUMENT|===|\d+\s*of\s*\d+|Case\s*\d+[:-]\S+)/gi, '').trim();
  if (cleaned.length < 15) return true;
  return false;
};

const buildTimelineTitle = (sentence: string, dateToken: string | null): string => {
  let cleaned = sentence.replace(/={2,}\s*PAGE\s+\d+\s*={0,}/gi, '').trim();
  cleaned = cleaned.replace(/^PAGE\s+\d+\s*/i, '').trim();
  const withoutDate = dateToken ? cleaned.replace(dateToken, ' ') : cleaned;
  const withoutCaseNum = withoutDate.replace(/Case\s+\d+[:-]\d+[-\w]*/gi, ' ').trim();
  const withoutDocRef = withoutCaseNum.replace(/Document\s+#?\s*\d+/gi, ' ').replace(/Page\s+\d+\s+of\s+\d+/gi, ' ').trim();
  const words = withoutDocRef.replace(/[^a-zA-Z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean).slice(0, 8);
  if (words.length === 0) return 'Document event';
  const base = words.join(' ');
  return base.charAt(0).toUpperCase() + base.slice(1);
};

const inferEventType = (sentence: string): string => {
  if (/\b(filed|motion|complaint|petition|answer|brief|order)\b/i.test(sentence)) return 'filing';
  if (/\b(hearing|trial|deposition|mediation|conference|meeting)\b/i.test(sentence)) return 'meeting';
  if (/\b(email|letter|call|message|notice|response)\b/i.test(sentence)) return 'communication';
  if (/\b(incident|accident|collision|injury|damage)\b/i.test(sentence)) return 'incident';
  return 'general';
};

const inferImportance = (sentence: string): TimelineImportance => {
  if (/\b(trial|hearing|deadline|deposition|filed|served|breach|injury|accident|default|termination)\b/i.test(sentence)) return 'high';
  if (/\b(meeting|mediation|response|notice|email|letter|call)\b/i.test(sentence)) return 'medium';
  return 'low';
};

const uniqueTrimmed = (items: string[], maxItems: number): string[] => {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of items) {
    const cleaned = item.trim().replace(/\s+/g, ' ');
    if (!cleaned) continue;
    const key = cleaned.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(cleaned);
    if (result.length >= maxItems) break;
  }
  return result;
};

const buildHeuristicAnalysis = (text: string): HeuristicAnalysisResult => {
  const sentences = extractSentences(text).slice(0, 100);
  const timelineEvents: TimelineEventCandidate[] = [];
  for (const sentence of sentences) {
    if (isOcrArtifact(sentence)) continue;
    const dateToken = extractDateToken(sentence);
    if (!dateToken) continue;
    if (!/\b(filed|served|hearing|trial|deposition|meeting|conference|incident|accident|injury|deadline|notice|email|letter|call|agreement|contract|payment|settlement|judgment|order|motion|complaint)\b/i.test(sentence)) continue;
    const title = buildTimelineTitle(sentence, dateToken);
    if (title.length < 5 || /^(Document event|Filed|Page|Case)$/i.test(title)) continue;
    const cleanDesc = sentence.replace(/={2,}\s*PAGE\s+\d+\s*={0,}/gi, '').replace(/^PAGE\s+\d+\s*/i, '').trim();
    timelineEvents.push({
      date: toDateOnlyString(dateToken) || undefined,
      event_title: title,
      description: cleanDesc.slice(0, 280),
      importance: inferImportance(sentence),
      event_type: inferEventType(sentence),
      phase: normalizePhase(undefined, sentence),
    });
    if (timelineEvents.length >= MAX_TIMELINE_EVENTS) break;
  }
  const factCandidates = sentences.filter((s) => /\b(\d{1,2}\/\d{1,2}\/\d{2,4}|\d{4}-\d{2}-\d{2}|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|\$|\d{2,}|agreement|demand|response|meeting|incident|email|letter)\b/i.test(s));
  const favorableCandidates = sentences.filter((s) => /\b(admit|confirmed|supports|favorable|complied|approved|paid|received|signed)\b/i.test(s));
  const adverseCandidates = sentences.filter((s) => /\b(deny|denied|dispute|late|overdue|breach|damaging|adverse|inconsistent|liability|default|failed)\b/i.test(s));
  const firstSentence = sentences[0]?.slice(0, 200) || '';
  const generatedSummary = `Document preview: ${firstSentence}${firstSentence ? '...' : ''} (Identified ${timelineEvents.length} timeline events, ${factCandidates.length} potential facts)`;
  return {
    summary: generatedSummary,
    keyFacts: uniqueTrimmed(factCandidates, 20),
    favorableFindings: uniqueTrimmed(favorableCandidates, 10),
    adverseFindings: uniqueTrimmed(adverseCandidates, 10),
    actionItems: uniqueTrimmed(
      sentences.filter((s) => /\b(should|must|need|required|deadline|file|serve|respond|review|prepare|schedule|request|notice|follow.up|contact|submit|send|call|meet|verify|confirm|obtain|complete|update)\b/i.test(s)),
      10
    ),
    timelineEvents: timelineEvents.sort((a, b) => {
      const aDate = toDateOnlyString(a.date) || '9999-12-31';
      const bDate = toDateOnlyString(b.date) || '9999-12-31';
      return aDate.localeCompare(bDate);
    }),
  };
};

// ===== Build the AI analysis prompt (shared between Azure OpenAI and Gemini) =====
function buildAnalysisPrompt(documentContext: string, tableContext: string, maxEvents: number): string {
  const tableSection = tableContext
    ? `\n\n=== EXTRACTED TABLES ===\n${tableContext}\n=== END TABLES ===\n`
    : '';

  return `Analyze this legal document with maximum precision. Extract every strategically relevant detail.

CRITICAL RULES FOR TIMELINE EVENTS:
- Extract REAL legal events only: filings, hearings, depositions, incidents, deadlines, agreements, rulings, communications, medical appointments, financial transactions.
- DO NOT create events from OCR page markers, document headers, case number lines, page counts, or Bates stamps.
- Each event_title must describe WHAT HAPPENED (e.g., "Motion for Summary Judgment Filed", "Deposition of John Smith Conducted", "Plaintiff Served with Complaint").
- BAD titles: "PAGE 1 Case 3:25-cv", "Filed 12:54 PM", "Document 1"
- GOOD titles: "Complaint Filed in District Court", "Defense Expert Disclosure Deadline Passed", "Settlement Conference Held"

ANALYSIS REQUIREMENTS:
1. SUMMARY: 4-6 sentence executive summary — document type, parties, key facts, strategic significance, and recommended next steps
2. KEY_FACTS: 10-20 specific factual findings (dates, events, admissions, amounts, names, locations, Bates numbers)
3. FAVORABLE_FINDINGS: 6-10 findings supporting the client's position (admissions, favorable testimony, corroborating evidence, compliance)
4. ADVERSE_FINDINGS: 6-10 findings that could hurt the case (contradictions, damaging statements, weaknesses, non-compliance, liability exposure)
5. ACTION_ITEMS: 6-10 specific follow-up tasks (witnesses to depose, documents to request, legal research needed, deadlines to calendar, issues to address)
6. TIMELINE_EVENTS: Up to ${maxEvents} meaningful chronological events. Each must include:
   - "date": YYYY-MM-DD format
   - "event_title": Clear action-oriented title (5-12 words)
   - "description": 1-3 sentences explaining what happened and its legal significance
   - "importance": "high", "medium", or "low"
   - "event_type": one of "communication", "filing", "incident", "meeting", "deadline", "medical", "financial", "contractual"
   - "entities": Array of parties/people/orgs directly involved
   - "phase": "pre-suit", "pleadings", "discovery", "dispositive", "trial", or "post-trial"
   - "next_required_action": One concrete litigation task triggered by this event
7. ENTITIES: All key people, organizations, and locations with their roles
   - "name", "type" (person/organization/location), "role" (e.g., "Plaintiff", "Defense Expert", "Treating Physician")

Respond ONLY with valid JSON (no markdown, no preamble):
{
  "summary": "string",
  "key_facts": ["fact1", ...],
  "favorable_findings": ["finding1", ...],
  "adverse_findings": ["finding1", ...],
  "action_items": ["action1", ...],
  "timeline_events": [{ "date": "YYYY-MM-DD", "event_title": "...", "description": "...", "importance": "high", "event_type": "...", "phase": "...", "next_required_action": "...", "entities": ["..."] }],
  "entities": [{ "name": "...", "type": "person", "role": "..." }]
}

DOCUMENT TEXT:
${documentContext}${tableSection}`;
}

// ===== PDF Embedded Text Extraction (Tier 0) =====
// Attempts to extract text from a PDF's text layer before resorting to OCR.
// Works on PDFs that have embedded text (not scanned image-only PDFs).
async function extractPdfEmbeddedText(fileBlob: Blob): Promise<string> {
  try {
    if (!fileBlob || fileBlob.size === 0) return '';

    // Quick check: only attempt on files with PDF-like signatures
    if (fileBlob.size > 100 * 1024 * 1024) {
      // Skip very large files — the cost of reading into memory outweighs the benefit
      throw new Error('File too large for embedded text extraction');
    }

    const arrayBuffer = await fileBlob.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);

    // Check PDF magic bytes
    if (bytes[0] !== 0x25 || bytes[1] !== 0x50 || bytes[2] !== 0x44 || bytes[3] !== 0x46) {
      return ''; // Not a PDF
    }

    const text = new TextDecoder('utf-8', { fatal: false }).decode(bytes);

    // Extract text from PDF text objects (BT ... ET blocks)
    const extracted: string[] = [];
    let idx = 0;
    while (idx < text.length) {
      const btStart = text.indexOf('BT', idx);
      if (btStart === -1) break;
      const contentStart = btStart + 2;
      const etEnd = text.indexOf('ET', contentStart);
      if (etEnd === -1) break;

      const block = text.substring(contentStart, etEnd);

      // Match (text) Tj
      const tjRegex = /\(([^)]*)\)\s*Tj/g;
      let tjMatch;
      while ((tjMatch = tjRegex.exec(block)) !== null) {
        if (tjMatch[1]) extracted.push(tjMatch[1]);
      }

      // Match (text) ' (single-quote operator)
      const sqRegex = /\(([^)]*)\)\s*'/g;
      let sqMatch;
      while ((sqMatch = sqRegex.exec(block)) !== null) {
        if (sqMatch[1]) extracted.push(sqMatch[1]);
      }

      idx = etEnd + 2;
    }

    const result = extracted.join(' ').replace(/\s+/g, ' ').trim();
    return result;
  } catch {
    return '';
  }
}

// ===== Phase Normalization =====
function normalizePhase(phase: string | undefined, content: string): TimelinePhase {
  const normalized = (phase || '').trim().toLowerCase();
  const validPhases: TimelinePhase[] = ['pre-suit', 'pleadings', 'discovery', 'dispositive', 'trial', 'post-trial'];
  if (validPhases.includes(normalized as TimelinePhase)) {
    return normalized as TimelinePhase;
  }

  const contentLower = content.toLowerCase();
  if (/pre[-\s]?suit|statute\s+of\s+limitations|demand\s+letter/i.test(contentLower)) return 'pre-suit';
  if (/complaint|answer|motion\s+to\s+dismiss|plead|responsive\s+pleading/i.test(contentLower)) return 'pleadings';
  if (/interrogator|deposit|discovery|request\s+for\s+production|document\s+request|admission/i.test(contentLower)) return 'discovery';
  if (/summary\s+judgment|dismiss|dispositive|motion\s+in\s+limine|directed\s+verdict/i.test(contentLower)) return 'dispositive';
  if (/trial|jury|evidence|exhibit|witness|opening|closing|voir\s+dire/i.test(contentLower)) return 'trial';
  if (/appeal|post[-\s]trial|judgment|settlement/i.test(contentLower)) return 'post-trial';
  return 'discovery';
}

// ===== Infer Next Required Action =====
function inferNextRequiredAction(phase: TimelinePhase, content: string): string {
  const contentLower = content.toLowerCase();
  const actions: Record<TimelinePhase, string[]> = {
    'pre-suit': ['Send demand letter', 'Preserve evidence', 'Investigate claims', 'Evaluate settlement options'],
    'pleadings': ['File responsive pleading', 'Review complaint for affirmative defenses', 'Calendar answer deadline', 'Prepare initial disclosures'],
    'discovery': ['Prepare discovery requests', 'Review produced documents', 'Schedule depositions', 'Serve interrogatories'],
    'dispositive': ['Research legal standard', 'Draft motion', 'File and serve motion', 'Prepare opposition brief'],
    'trial': ['Prepare witness examinations', 'Finalize exhibit list', 'File motions in limine', 'Prepare opening statement'],
    'post-trial': ['File notice of appeal', 'Prepare bill of costs', 'Review judgment for errors', 'Evaluate post-trial motions'],
  };

  const candidates = actions[phase] || actions['discovery'];
  for (const action of candidates) {
    if (contentLower.includes(action.split(' ')[0].toLowerCase())) return action;
  }
  return candidates[0];
}

// ===== OCR Junk Title Detection =====
function isTitleOcrJunk(title: string): boolean {
  if (!title || title.length < 3) return true;
  // Patterns that indicate OCR artifacts rather than real legal events
  if (/^page\s+\d+/i.test(title)) return true;
  if (/^={2,}/i.test(title)) return true;
  if (/^\d+$/.test(title.trim())) return true;
  if (/^[A-Z0-9]{20,}$/.test(title.replace(/\s/g, ''))) return true;
  if (/^\s*$/.test(title)) return true;
  if (/^document\s*\d+/i.test(title)) return true;
  if (/^bates\s*stamp/i.test(title)) return true;
  return false;
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    validateEnvVars(['SUPABASE_URL', 'SUPABASE_ANON_KEY']);

    const ocrSpaceApiKey = Deno.env.get('OCR_SPACE_API_KEY');
    // Azure Computer Vision Read — primary OCR (5,000 free transactions/month)
    const azureVisionEndpoint = (Deno.env.get('AZURE_VISION_ENDPOINT') || Deno.env.get('VITE_AZURE_VISION_ENDPOINT') || '').replace(/\/+$/, '');
    const azureVisionKey = Deno.env.get('AZURE_VISION_KEY') || Deno.env.get('VITE_AZURE_VISION_KEY') || '';
    const hasAzureVision = Boolean(azureVisionEndpoint && azureVisionKey);
    const googleApiKey = Deno.env.get('GOOGLE_AI_API_KEY');
    // GEMINI_API_KEY is a backup key tried if GOOGLE_AI_API_KEY returns 400 (invalid)
    const geminiApiKey = Deno.env.get('GEMINI_API_KEY');
    // All Gemini keys to try in order (filter out duplicates/empties)
    const allGeminiKeys = [...new Set([googleApiKey, geminiApiKey].filter(Boolean))] as string[];

    const cohereApiKey = Deno.env.get('COHERE_API_KEY');
    const hasCohere = !!cohereApiKey;

    const groqApiKey = Deno.env.get('GROQ_API_KEY') || Deno.env.get('VITE_GROQ_API_KEY');
    const hasGroq = !!groqApiKey;

    // AI provider for analysis (OpenRouter free → Gemini → OpenAI)
    const openrouterApiKey = Deno.env.get('OPENROUTER_API_KEY');
    const openaiApiKey = Deno.env.get('OPENAI_API_KEY');
    const aiGatewayUrl = Deno.env.get('AI_GATEWAY_URL');
    const aiGatewayModel = Deno.env.get('AI_GATEWAY_MODEL') || 'openai/gpt-oss-120b:free';
    const hasOpenAI = !!(aiGatewayUrl || openrouterApiKey || openaiApiKey);

    const hasOcrSpace = !!ocrSpaceApiKey;
    const hasGemini = allGeminiKeys.length > 0;
    const hasGoogleVision = isGoogleVisionConfigured();
    const geminiModelCandidates = getPreferredGeminiCandidates(Deno.env.get('GOOGLE_AI_MODEL'));

    console.log(`OCR providers: AzureRead=${hasAzureVision}, GoogleVision=${hasGoogleVision}, Gemini=${hasGemini}, Groq=${hasGroq}, OCR.space=${hasOcrSpace}`);
    console.log(`Analysis providers: OpenAI/OpenRouter=${hasOpenAI}, Gemini=${hasGemini}, Cohere=${hasCohere}`);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    // Supabase has two live service-role key formats depending on when a project
    // rotated to the new API key system: the legacy JWT (SERVICE_ROLE_KEY, starts
    // with "eyJ...") and the new secret-key format (SUPABASE_SERVICE_ROLE_KEY,
    // starts with "sb_secret_..."). Different internal callers (pipeline-worker,
    // manual invocations, etc.) may still be holding either format, so accept
    // a bearer token that matches ANY currently-valid service-role secret rather
    // than only the first one that happens to be set.
    const validServiceRoleKeys = [
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),
      Deno.env.get('SERVICE_ROLE_KEY'),
    ].filter((k): k is string => !!k);
    const serviceRoleKey = validServiceRoleKeys[0];
    const authHeader = req.headers.get('Authorization') || '';
    const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : authHeader.trim();

    let user: { id: string };
    let supabase: SupabaseClient;
    let isServiceRole = false;

    if (validServiceRoleKeys.includes(bearerToken)) {
      console.log('Service role authentication detected');
      isServiceRole = true;
      supabase = createClient(supabaseUrl, serviceRoleKey!);
      user = { id: 'service-role' };
    } else {
      const authResult = await verifyAuth(req);
      if (!authResult.authorized || !authResult.user || !authResult.supabase) {
        return createErrorResponse(new Error(authResult.error || 'Unauthorized'), 401, 'ocr-document', corsHeaders);
      }
      user = authResult.user;
      supabase = authResult.supabase;
    }

    if (!isServiceRole) {
      const rateLimitCheck = checkRateLimit(`ocr:${user.id}`, 60, 60000);
      if (!rateLimitCheck.allowed) {
        return new Response(
          JSON.stringify({ error: 'Rate limit exceeded', resetAt: new Date(rateLimitCheck.resetAt).toISOString() }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    const requestBody = (await req.json()) as Record<string, unknown>;
    validateRequestBody<{ documentId: string; fileUrl: string }>(requestBody, ['documentId', 'fileUrl']);

    const { documentId, fileUrl } = requestBody;
    const validatedDocumentId = validateUUID(documentId as string, 'documentId');
    const validatedFileUrl = validateURL(fileUrl as string);

    console.log(`Processing OCR for document: ${validatedDocumentId}`);

    const { data: documentData, error: docError } = await supabase
      .from('documents')
      .select('case_id, name, cases!inner(user_id)')
      .eq('id', validatedDocumentId)
      .single();

    if (docError || !documentData) {
      return createErrorResponse(new Error('Document not found'), 404, 'ocr-document', corsHeaders);
    }

    interface DocumentOwnerData {
      case_id: string;
      name: string;
      cases: { user_id: string } | { user_id: string }[];
    }
    const docOwnerData = documentData as unknown as DocumentOwnerData;
    const caseRelation = docOwnerData.cases;
    const ownerId = Array.isArray(caseRelation) ? caseRelation[0]?.user_id : caseRelation?.user_id;

    if (!ownerId) {
      return createErrorResponse(new Error('Document owner could not be resolved'), 500, 'ocr-document', corsHeaders);
    }

    if (!isServiceRole && ownerId !== user.id) {
      return forbiddenResponse('You do not have access to this document', corsHeaders);
    }

    console.log(`Processing: ${documentData.name}`);

    const { blob: fileBlob, contentType } = await loadFileBlob(supabase, validatedFileUrl);
    const resolvedContentType = contentType || fileBlob.type || '';
    let extractedText = '';
    let extractedTables: unknown[] = [];
    let ocrProvider = '';

    // ===== OCR EXTRACTION - Triple-tier with Azure as primary =====
    let resolvedGeminiModels: string[] | null = null;

    const resolveGeminiModels = async () => {
      if (resolvedGeminiModels) return resolvedGeminiModels;

      const preferredModels = geminiModelCandidates;
      if (!googleApiKey) {
        resolvedGeminiModels = preferredModels;
        return preferredModels;
      }

      try {
        const modelsResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models`, { headers: { 'x-goog-api-key': googleApiKey } });
        if (!modelsResponse.ok) {
          console.warn(`Unable to list Gemini models (${modelsResponse.status}). Falling back to preferred defaults.`);
          resolvedGeminiModels = preferredModels;
          return preferredModels;
        }

        const modelsPayload = await modelsResponse.json();
        const availableModels = getGenerateContentCapableGeminiModels(modelsPayload);
        if (availableModels.length === 0) {
          resolvedGeminiModels = preferredModels;
          return preferredModels;
        }

        resolvedGeminiModels = rankGeminiModels(preferredModels, availableModels);
        return resolvedGeminiModels;
      } catch (modelError) {
        console.warn('Failed to resolve Gemini models. Falling back to preferred defaults.', modelError);
        resolvedGeminiModels = preferredModels;
        return preferredModels;
      }
    };

    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

    const invokeGeminiWithFallback = async (
      body: GeminiRequestBody,
      purpose: 'OCR' | 'ANALYSIS'
    ): Promise<{ payload: GeminiResponse; model: string }> => {
      const candidateModels = purpose === 'OCR'
        ? await resolveGeminiModels()
        : geminiModelCandidates;

      const maxRetries = 3;
      const keyErrors: string[] = [];

      // Try each API key in order — if one returns 400 (invalid key), skip to the next
      for (const apiKey of allGeminiKeys) {
        let lastError = '';
        let keyInvalid = false;

        for (const model of candidateModels) {
          if (keyInvalid) break;

          for (let attempt = 0; attempt < maxRetries; attempt++) {
            if (attempt > 0) {
              const backoff = Math.min(1000 * Math.pow(2, attempt), 8000);
              console.log(`Retrying Gemini ${purpose} (${model}) in ${backoff}ms (attempt ${attempt + 1})`);
              await sleep(backoff);
            }

            try {
              const response = await fetch(
                `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
                {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(body),
                }
              );

              if (response.ok) {
                const payload = (await response.json()) as GeminiResponse;
                return { payload, model };
              }

              const errorText = await response.text();

              // 400 with "API key not valid" means the key itself is bad — skip to next key
              if (response.status === 400 && /API key not valid|INVALID_ARGUMENT/i.test(errorText)) {
                console.warn(`Gemini key invalid (400) — trying next key if available`);
                keyErrors.push(`key[${apiKey.slice(-6)}] invalid: ${response.status}`);
                keyInvalid = true;
                break;
              }

              const unavailableModel =
                (response.status === 404 || response.status === 400) &&
                /model|not found|not supported/i.test(errorText);

              // 429 (rate limit) and 5xx (capacity/"high demand", e.g. 503 on
              // preview models) are transient: retry with backoff, then move
              // to the next candidate model instead of aborting everything.
              if (response.status === 429 || response.status >= 500) {
                if (attempt < maxRetries - 1) continue;
                lastError = response.status === 429
                  ? `${model}: rate limit exceeded after ${maxRetries} attempts`
                  : `${model}: server error ${response.status} after ${maxRetries} attempts`;
                console.warn(`${lastError} — trying next model`);
                break;
              }

              if (unavailableModel) {
                lastError = `${model}: ${errorText}`;
                console.warn(`Gemini model unavailable for ${purpose}, trying next model: ${model}`);
                break;
              }

              throw new Error(`Gemini ${purpose} failed (${model}, ${response.status}): ${errorText}`);
            } catch (err) {
              if (err instanceof Error && err.message.includes('rate limit')) {
                if (attempt < maxRetries - 1) continue;
                lastError = `${model}: rate limit exceeded after ${maxRetries} attempts`;
                break;
              }
              if (err instanceof Error && (err.message.includes('model unavailable') || err.message.includes('not found'))) {
                lastError = err.message;
                break;
              }
              throw err;
            }
          }
        }

        if (!keyInvalid && lastError) {
          keyErrors.push(lastError);
        }
      }

      throw new Error(`Gemini ${purpose} failed for all keys/models: ${keyErrors.join('; ')}`);
    };

    const geminiOcr = async (fileBlob, mimeType, isImage) => {
      const arrayBuffer = await fileBlob.arrayBuffer();
      const base64 = arrayBufferToBase64(arrayBuffer);

      const prompt = isImage
        ? `You are a professional legal document OCR system. Extract ALL text from this image with the highest possible accuracy. Preserve exact formatting, line breaks, headings, tables, stamps, dates, signatures, marginalia, Bates numbers, exhibit numbers, and document identifiers. Return plain text only.`
        : `You are a professional legal document OCR system. Extract ALL text from every page of this PDF with the highest possible accuracy. Preserve exact formatting, line breaks, headings, tables, stamps, dates, signatures, marginalia, Bates numbers, exhibit numbers, and document identifiers. Prefix each page with "=== PAGE X ===". Return plain text only.`;

      const { payload, model } = await invokeGeminiWithFallback(
        {
          contents: [{ parts: [{ text: prompt }, { inline_data: { mime_type: mimeType, data: base64 } }] }],
          generationConfig: { temperature: 0.05, maxOutputTokens: 32768 },
        },
        'OCR'
      );

      const text = extractGeminiText(payload);
      if (!text?.trim()) throw new Error(`Gemini returned empty OCR text (${model})`);
      console.log(`Gemini OCR succeeded with model: ${model}`);
      return text;
    };

    const cohereOcr = async (fileBlob: Blob, mimeType: string, isImage: boolean) => {
      if (!cohereApiKey) throw new Error('Cohere API key not configured');
      const arrayBuffer = await fileBlob.arrayBuffer();
      const base64 = arrayBufferToBase64(arrayBuffer);

      const prompt = isImage
        ? `You are a professional legal document OCR system. Extract ALL text from this image with the highest possible accuracy. Preserve exact formatting, line breaks, headings, tables, stamps, dates, signatures, marginalia, Bates numbers, exhibit numbers, and document identifiers. Return plain text only.`
        : `You are a professional legal document OCR system. Extract ALL text from every page of this document with the highest possible accuracy. Preserve exact formatting, line breaks, headings, tables, stamps, dates, signatures, marginalia, Bates numbers, exhibit numbers, and document identifiers. Prefix each page with "=== PAGE X ===". Return plain text only.`;

      const response = await fetch('https://api.cohere.com/v2/chat', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${cohereApiKey}`,
          'Content-Type': 'application/json',
          'X-Client-Name': 'case-companion-ocr'
        },
        body: JSON.stringify({
          model: 'command-a-vision-07-2025',
          messages: [
            {
              role: 'user',
              content: [
                { type: 'text', text: prompt },
                {
                  type: 'image_url',
                  image_url: { url: `data:${mimeType};base64,${base64}` }
                }
              ]
            }
          ],
          temperature: 0.1,
          max_tokens: 4000
        })
      });

      if (!response.ok) {
        throw new Error(`Cohere OCR failed: ${await response.text()}`);
      }

      const data = await response.json();
      const text = data?.message?.content?.filter((p: { type: string; text?: string }) => p.type === 'text').map((p: { type: string; text?: string }) => p.text).join('').trim() || '';
      
      if (!text) throw new Error('Cohere returned empty OCR text');
      console.log('Cohere OCR succeeded');
      return text;
    };

    const groqOcr = async (fileBlob: Blob, mimeType: string, isImage: boolean): Promise<string> => {
      if (!groqApiKey) throw new Error('Groq API key not configured');
      if (!isImage) throw new Error('Groq vision OCR only supports images, not raw PDFs');
      const arrayBuffer = await fileBlob.arrayBuffer();
      const base64 = arrayBufferToBase64(arrayBuffer);
      const prompt = `You are a professional legal document OCR system. Extract ALL text from this image with the highest possible accuracy. Preserve exact formatting, line breaks, headings, tables, stamps, dates, signatures, marginalia, Bates numbers, exhibit numbers, and document identifiers. Return plain text only.`;

      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${groqApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'meta-llama/llama-4-scout-17b-16e-instruct',
          messages: [
            {
              role: 'user',
              content: [
                { type: 'text', text: prompt },
                { type: 'image_url', image_url: { url: `data:${mimeType};base64,${base64}` } },
              ],
            },
          ],
          temperature: 0.1,
          max_tokens: 4000,
        }),
      });

      if (!response.ok) {
        throw new Error(`Groq OCR failed: ${await response.text()}`);
      }
      const data = await response.json();
      const text = data?.choices?.[0]?.message?.content?.trim() || '';
      if (!text) throw new Error('Groq returned empty OCR text');
      console.log('Groq OCR succeeded');
      return text;
    };

    const ocrSpaceExtract = async (blob, isImage, ct) => {
      if (!ocrSpaceApiKey) throw new Error('OCR.space API key not configured');
      console.log('Using OCR.space fallback...');
      const extension = isImage ? 'jpg' : 'pdf';
      const fileName = `document.${extension}`;
      const file = new File([blob], fileName, { type: ct || (isImage ? 'image/jpeg' : 'application/pdf') });
      const formData = new FormData();
      formData.append('file', file, fileName);
      formData.append('apikey', ocrSpaceApiKey);
      formData.append('language', 'eng');
      formData.append('isOverlayRequired', 'false');
      formData.append('detectOrientation', 'true');
      formData.append('scale', 'true');
      formData.append('OCREngine', '2');
      formData.append('filetype', extension.toUpperCase());

      // Retry up to 3 times with backoff on 429
      let ocrLastErr: Error | null = null;
      for (let attempt = 0; attempt < 3; attempt++) {
        if (attempt > 0) {
          const backoff = Math.min(2000 * Math.pow(2, attempt), 10000);
          console.log(`Retrying OCR.space in ${backoff}ms (attempt ${attempt + 1})`);
          await sleep(backoff);
        }
        try {
          const response = await fetch('https://api.ocr.space/parse/image', { method: 'POST', body: formData });
          if (response.status === 429) {
            ocrLastErr = new Error(`OCR.space API rate limited (429)`);
            continue;
          }
          if (!response.ok) throw new Error(`OCR.space API failed: ${response.status}`);

          const result = (await response.json()) as OcrSpaceResponse;
          if (result.OCRExitCode !== 1 || !result.ParsedResults?.length) {
            const errorMessage = Array.isArray(result.ErrorMessage) ? result.ErrorMessage.join(', ') : (result.ErrorMessage || 'Unknown error');
            throw new Error(`OCR.space parsing failed: ${errorMessage}`);
          }

          const extracted = result.ParsedResults
            .map((page, idx) => {
              const pageText = page.ParsedText || '';
              return result.ParsedResults!.length > 1 ? `=== PAGE ${idx + 1} ===\n${pageText}` : pageText;
            })
            .join('\n\n');

          console.log(`OCR.space extracted ${extracted.length} characters`);
          return extracted;
        } catch (err) {
          ocrLastErr = err instanceof Error ? err : new Error(String(err));
          if (ocrLastErr.message.includes('rate limit') && attempt < 2) continue;
          throw ocrLastErr;
        }
      }
      throw ocrLastErr || new Error('OCR.space failed after retries');
    };

    // Azure Computer Vision Read v3.2 — async submit + poll. Handles images
    // and scanned PDFs. Primary OCR tier (5,000 free requests/month).
    const azureVisionOcr = async (fileBlob: Blob): Promise<string> => {
      const submit = await fetch(`${azureVisionEndpoint}/vision/v3.2/read/analyze`, {
        method: 'POST',
        headers: { 'Ocp-Apim-Subscription-Key': azureVisionKey, 'Content-Type': 'application/octet-stream' },
        body: new Uint8Array(await fileBlob.arrayBuffer()),
      });
      if (!submit.ok) {
        const errText = await submit.text().catch(() => '');
        throw new Error(`Azure Read submit ${submit.status}: ${errText.slice(0, 200)}`);
      }
      const opUrl = submit.headers.get('Operation-Location');
      if (!opUrl) throw new Error('Azure Read: missing Operation-Location header');
      for (let attempt = 0; attempt < 30; attempt++) {
        await new Promise((r) => setTimeout(r, attempt < 3 ? 700 : 1200));
        const poll = await fetch(opUrl, { headers: { 'Ocp-Apim-Subscription-Key': azureVisionKey } });
        if (!poll.ok) continue;
        const result = await poll.json();
        if (result.status === 'succeeded') {
          const pages = result.analyzeResult?.readResults ?? [];
          const text = pages
            .map((p: { lines?: { text: string }[] }) => (p.lines ?? []).map((l) => l.text).join('\n'))
            .join('\n\n');
          if (!text.trim()) throw new Error('Azure Read returned empty text');
          return text;
        }
        if (result.status === 'failed') throw new Error('Azure Read analysis failed');
      }
      throw new Error('Azure Read timed out');
    };

    const isOcrTarget =
      resolvedContentType.includes('image') ||
      resolvedContentType.includes('pdf') ||
      !!validatedFileUrl.match(/\.(jpg|jpeg|png|gif|webp|bmp|tiff|pdf)$/i);

    if (isOcrTarget) {
      const isImage = resolvedContentType.includes('image') || !!validatedFileUrl.match(/\.(jpg|jpeg|png|gif|webp|bmp|tiff)$/i);
      const isPdf = resolvedContentType.includes('pdf') || !!validatedFileUrl.match(/\.pdf$/i);
      console.log(`Document: ${(fileBlob.size / 1024 / 1024).toFixed(2)}MB, MIME: ${resolvedContentType}, isImage: ${isImage}, isPdf: ${isPdf}`);

      const errors: string[] = [];

      // Wall-clock budget for the whole OCR chain. Supabase Edge Functions get
      // forcibly killed past their platform execution limit — if that happens
      // mid-retry-storm, the code never reaches the outer catch/status update
      // and the pipeline_jobs row is orphaned in 'processing' forever. Bail
      // out cleanly with a real error well before that limit instead.
      const ocrChainStartedAt = Date.now();
      const OCR_TIME_BUDGET_MS = 90_000;
      const ocrTimeRemaining = () => OCR_TIME_BUDGET_MS - (Date.now() - ocrChainStartedAt);
      const ocrBudgetOk = () => ocrTimeRemaining() > 5000;

      // Tier 0: PDF embedded text extraction (fast, free — works for PDFs with text layers)
      if (isPdf && !isImage) {
        try {
          console.log('Attempting PDF embedded text extraction (Tier 0)...');
          const pdfText = await extractPdfEmbeddedText(fileBlob);
          // Only accept if we got substantial text (not just metadata/headers)
          if (pdfText.length > 100) {
            extractedText = pdfText;
            ocrProvider = 'pdf_text_extract';
            console.log(`PDF text extraction: ${extractedText.length} chars (no OCR needed)`);
          } else {
            console.log(`PDF text extraction: only ${pdfText.length} chars — likely scanned, proceeding to OCR`);
          }
        } catch (pdfError) {
          console.log(`PDF text extraction skipped: ${pdfError instanceof Error ? pdfError.message : String(pdfError)}`);
        }
      }

      // Guard against Deno serverless memory limits (WORKER_RESOURCE_LIMIT) on scanned documents > 12MB
      if (!extractedText && fileBlob.size > 12 * 1024 * 1024) {
        throw new Error(`Document is too large for edge OCR (${(fileBlob.size / 1024 / 1024).toFixed(2)}MB). The limit for scanned OCR processing is 12MB. Please compress the PDF or split it into smaller documents.`);
      }

      // Tier 0.7: Azure Computer Vision Read (PRIMARY — 5,000 free/month,
      // purpose-built document OCR: dense text, tables, handwriting)
      if (!extractedText && hasAzureVision) {
        try {
          console.log('Attempting Azure Computer Vision Read OCR (primary)...');
          extractedText = await azureVisionOcr(fileBlob);
          ocrProvider = 'azure_read';
          console.log(`Azure Read OCR: ${extractedText.length} chars`);
        } catch (error) {
          console.error('Azure Read OCR error:', error);
          errors.push(`Azure Read: ${error instanceof Error ? error.message : String(error)}`);
        }
      }

      // Tier 0.8: Groq vision OCR (meta-llama/llama-4-scout — free-tier friendly,
      // very fast; images only, PDFs fall through to the next tier)
      if (!extractedText && hasGroq && isImage && ocrBudgetOk()) {
        try {
          console.log('Attempting Groq vision OCR...');
          const mimeType = resolvedContentType || 'image/jpeg';
          extractedText = await groqOcr(fileBlob, mimeType, isImage);
          ocrProvider = 'groq';
        } catch (error) {
          console.error('Groq OCR error:', error);
          errors.push(`Groq: ${error instanceof Error ? error.message : String(error)}`);
        }
      }

      // Tier 1: Google Cloud Vision (DOCUMENT_TEXT_DETECTION — purpose-built OCR,
      // typically best for dense text, tables, stamps, and scanned legal documents)
      if (!extractedText && hasGoogleVision && ocrBudgetOk()) {
        try {
          console.log('Attempting Google Cloud Vision OCR (primary)...');
          extractedText = await googleVisionOcr(fileBlob, isImage);
          ocrProvider = 'google_cloud_vision';
        } catch (error) {
          console.error('Google Cloud Vision OCR error:', error);
          errors.push(`Google Cloud Vision: ${error instanceof Error ? error.message : String(error)}`);
        }
      }

      // Tier 1.5: Cohere Vision OCR
      if (!extractedText && hasCohere && isImage && ocrBudgetOk()) {
        try {
          console.log('Attempting Cohere OCR (command-a-vision)...');
          const mimeType = resolvedContentType || 'image/jpeg';
          extractedText = await cohereOcr(fileBlob, mimeType, isImage);
          ocrProvider = 'cohere';
        } catch (error) {
          console.error('Cohere OCR error:', error);
          errors.push(`Cohere: ${error instanceof Error ? error.message : String(error)}`);
        }
      }

      // Tier 2: Gemini 2.5 Pro (best multimodal AI for legal docs — tables, stamps, Bates numbers)
      if (!extractedText && hasGemini && ocrBudgetOk()) {
        try {
          console.log('Attempting Gemini OCR (primary — best for legal documents)...');
          const mimeType = resolvedContentType || (isImage ? 'image/jpeg' : 'application/pdf');
          extractedText = await geminiOcr(fileBlob, mimeType, isImage);
          ocrProvider = 'gemini';
        } catch (error) {
          console.error('Gemini OCR error:', error);
          errors.push(`Gemini: ${error instanceof Error ? error.message : String(error)}`);
        }
      }

      // Tier 2: Azure Document Intelligence (removed — Gemini and OCR.space used instead)

      // Tier 3: Tesseract.js (removed to conserve memory and prevent serverless timeouts)

      // Tier 4: OCR.space (backup — 25k/month free, 1MB file limit on free tier)
      if (!extractedText && hasOcrSpace && ocrTimeRemaining() > 2000) {
        try {
          extractedText = await ocrSpaceExtract(fileBlob, isImage, resolvedContentType);
          ocrProvider = 'ocr_space';
        } catch (error) {
          console.error('OCR.space error:', error);
          errors.push(`OCR.space: ${error instanceof Error ? error.message : String(error)}`);
        }
      }

      if (!extractedText) {
        if (!ocrBudgetOk()) {
          throw new Error(`OCR time budget (${OCR_TIME_BUDGET_MS}ms) exceeded before any provider succeeded. Tried: ${errors.join('; ')}`);
        }
        throw new Error(`All OCR providers failed. ${errors.join('; ')}`);
      }
    } else if (resolvedContentType.includes('text') || !!validatedFileUrl.match(/\.(txt|doc|docx)$/i)) {
      extractedText = await fileBlob.text();
      ocrProvider = 'direct-text';
      console.log(`Read ${extractedText.length} characters from text file`);
    } else {
      extractedText = `[File type ${resolvedContentType || 'unknown'} - OCR not available for this format]`;
      ocrProvider = 'none';
    }

    extractedText = normalizeExtractedText(extractedText);

    if (isOcrTarget && extractedText.length < 30) {
      throw new Error('OCR extraction returned too little text. The file may be corrupted or heavily redacted.');
    }

    // ===== AI ANALYSIS =====
    // Chain: Gemini Flash → OpenAI/OpenRouter → Cohere → Heuristic
    let keyFacts: string[] = [];
    let favorableFindings: string[] = [];
    let adverseFindings: string[] = [];
    let actionItems: string[] = [];
    let summary = '';
    let timelineEvents: unknown[] = [];
    let extractedEntities: unknown[] = [];
    let analysisProvider: 'gemini' | 'openai' | 'cohere' | 'heuristic' | 'none' = 'none';

    const hasSubstantialText = Boolean(
      extractedText &&
      extractedText.length > 50 &&
      !extractedText.startsWith('[File type') &&
      (hasOpenAI || hasGemini || hasCohere)
    );

    if (hasSubstantialText) {
      console.log('Analyzing extracted text with AI (chunked)...');
      
      const parseAnalysisJson = (content: string) => {
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (!jsonMatch) return null;
        const parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
        return {
          summary: String(parsed.summary || ''),
          keyFacts: Array.isArray(parsed.key_facts) ? parsed.key_facts.map((i) => String(i)) : [],
          favorableFindings: Array.isArray(parsed.favorable_findings) ? parsed.favorable_findings.map((i) => String(i)) : [],
          adverseFindings: Array.isArray(parsed.adverse_findings) ? parsed.adverse_findings.map((i) => String(i)) : [],
          actionItems: Array.isArray(parsed.action_items) ? parsed.action_items.map((i) => String(i)) : [],
          timelineEvents: Array.isArray(parsed.timeline_events) ? (parsed.timeline_events as unknown[]) : [],
          entities: Array.isArray(parsed.entities) ? parsed.entities : [],
        };
      };

      // If we have Cohere and text is < 200,000 characters, do it in a single pass (bypassing chunks)
      if (hasCohere && extractedText.length <= 200000) {
        console.log('Using Cohere single-pass analysis due to large context window...');
        const prompt = buildAnalysisPrompt(extractedText, '', MAX_TIMELINE_EVENTS);
        try {
          const response = await fetch('https://api.cohere.com/v2/chat', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${cohereApiKey}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              model: 'command-a-plus-05-2026',
              messages: [{ role: 'user', content: prompt }],
              temperature: 0.1,
              max_tokens: 4000
            })
          });
          
          if (response.ok) {
            const data = await response.json();
            const content = data?.message?.content?.filter((p: { type: string; text?: string }) => p.type === 'text').map((p: { type: string; text?: string }) => p.text).join('') || '';
            const parsed = parseAnalysisJson(content);
            if (parsed) {
              analysisProvider = 'cohere';
              summary = parsed.summary;
              keyFacts = parsed.keyFacts;
              favorableFindings = parsed.favorableFindings;
              adverseFindings = parsed.adverseFindings;
              actionItems = parsed.actionItems;
              timelineEvents = parsed.timelineEvents;
              extractedEntities = parsed.entities;
            }
          } else {
            console.warn(`Cohere single-pass analysis failed: ${await response.text()}`);
          }
        } catch (e) {
          console.error('Cohere single-pass analysis error:', e);
        }
      }
      
      if (analysisProvider === 'none') {
        // Fall back to chunking logic
        const textChunks = buildTextChunks(
          extractedText,
          ANALYSIS_CHUNK_CHAR_LIMIT,
          ANALYSIS_CHUNK_OVERLAP
        );

        // ── Process chunks in parallel batches (max 3 concurrent AI calls) ──
        const CHUNK_CONCURRENCY = 3;

      type ChunkProviderResult = { result: StructuredChunkAnalysis | null; provider: 'gemini' | 'openai' | 'cohere' | null };

      const processChunk = async (index: number, textChunk: string): Promise<ChunkProviderResult> => {
        const totalChunks = textChunks.length;
        const chunkPrompt = `You are an expert legal document analyst specializing in litigation support. Analyze documents with precision and identify strategic insights for case preparation.

Analyze this legal document CHUNK and provide a JSON response with comprehensive legal analysis for this chunk only.

ANALYSIS REQUIREMENTS:
1. SUMMARY: 1-2 sentence summary of this chunk's significance
2. KEY_FACTS: up to 6 specific factual findings from this chunk
3. FAVORABLE_FINDINGS: up to 4 findings that could support the case
4. ADVERSE_FINDINGS: up to 4 findings that could hurt the case
5. ACTION_ITEMS: up to 4 specific follow-up actions from this chunk
6. TIMELINE_EVENTS: Extract chronological events in this chunk. For each event provide:
   - "date": YYYY-MM-DD format (if approximate, use first of month/year)
   - "event_title": Short title (5-10 words)
   - "description": Detailed description (1-2 sentences)
   - "source_doc_id": Use "${validatedDocumentId}" for all events
   - "importance": "high", "medium", or "low"
   - "event_type": e.g., "communication", "filing", "incident", "meeting"
   - "entities": Array of key people/orgs involved in THIS specific event
   - Include ONLY major case milestones found in this chunk.

7. ENTITIES: Extract key entities (people, organizations, locations) with role.

Respond ONLY with valid JSON in this exact format:
{
  "summary": "string",
  "key_facts": ["fact1", "fact2"],
  "favorable_findings": ["finding1", "finding2"],
  "adverse_findings": ["finding1", "finding2"],
  "action_items": ["action1", "action2"],
  "timeline_events": [
    {
      "date": "2023-01-01",
      "event_title": "...",
      "description": "...",
      "source_doc_id": "${validatedDocumentId}",
      "importance": "high",
      "event_type": "...",
      "entities": ["Person A", "Company B"]
    }
  ],
  "entities": [
    { "name": "...", "type": "person/organization/location", "role": "..." }
  ]
}

Chunk ${index + 1} of ${totalChunks}:
${textChunk}`;

        let chunkContent = '';
        let chunkProvider: 'gemini' | 'openai' | 'cohere' | null = null;

        if (hasGemini) {
          try {
            const { payload } = await invokeGeminiWithFallback(
              {
                contents: [{ parts: [{ text: chunkPrompt }] }],
                generationConfig: {
                  temperature: 0.1,
                  // 2500 truncated the JSON (summary+timeline+entities), causing parse failures
                  maxOutputTokens: 6000,
                  responseMimeType: 'application/json',
                },
              },
              'analysis'
            );
            chunkContent = extractGeminiText(payload);
            if (chunkContent) chunkProvider = 'gemini';
          } catch (err) {
            console.error(`Gemini chunk ${index + 1} error:`, err);
          }
        }

        if (!chunkContent && hasOpenAI) {
          try {
            let analysisApiUrl: string;
            let analysisApiKey: string;
            let analysisModel: string;
            if (aiGatewayUrl) {
              analysisApiUrl = aiGatewayUrl;
              analysisApiKey = openaiApiKey || openrouterApiKey || '';
              analysisModel = aiGatewayModel;
            } else if (openrouterApiKey) {
              analysisApiUrl = 'https://openrouter.ai/api/v1/chat/completions';
              analysisApiKey = openrouterApiKey;
              analysisModel = aiGatewayModel;
            } else {
              analysisApiUrl = 'https://api.openai.com/v1/chat/completions';
              analysisApiKey = openaiApiKey || '';
              analysisModel = 'gpt-4o-mini';
            }
            const analysisResponse = await fetch(analysisApiUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${analysisApiKey}` },
              body: JSON.stringify({
                model: analysisModel,
                messages: [{ role: 'user', content: chunkPrompt }],
                temperature: 0.1,
                max_tokens: 2500,
                response_format: { type: 'json_object' },
              }),
            });
            if (analysisResponse.ok) {
              const analysisData = await analysisResponse.json();
              chunkContent = analysisData.choices?.[0]?.message?.content || '';
              if (chunkContent) chunkProvider = 'openai';
            } else {
              console.error(`OpenAI chunk ${index + 1} failed:`, await analysisResponse.text());
            }
          } catch (err) {
            console.error(`OpenAI chunk ${index + 1} error:`, err);
          }
        }

        if (!chunkContent && hasCohere) {
          try {
            const cohereResponse = await fetch('https://api.cohere.com/v2/chat', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${cohereApiKey}` },
              body: JSON.stringify({
                model: 'command-a-03-2025',
                messages: [{ role: 'user', content: chunkPrompt }],
                temperature: 0.1,
                response_format: { type: 'json_object' },
              }),
            });
            if (cohereResponse.ok) {
              const cohereData = await cohereResponse.json();
              const contentBlocks = cohereData?.message?.content;
              chunkContent = Array.isArray(contentBlocks)
                ? contentBlocks.map((b: { text?: string }) => b?.text || '').join('')
                : '';
              if (chunkContent) chunkProvider = 'cohere';
            } else {
              console.error(`Cohere chunk ${index + 1} failed:`, await cohereResponse.text());
            }
          } catch (err) {
            console.error(`Cohere chunk ${index + 1} error:`, err);
          }
        }

        if (!chunkContent) return { result: null, provider: null };

        try {
          const parsed = parseAnalysisJson(chunkContent);
          if (!parsed) return { result: null, provider: null };
          return {
            provider: chunkProvider,
            result: parsed
          };
        } catch (err) {
          console.error(`Failed to parse chunk ${index + 1} JSON:`, err);
          return { result: null, provider: null };
        }
      };

      // Run chunks in parallel batches of CHUNK_CONCURRENCY
      const chunkResults: StructuredChunkAnalysis[] = [];
      for (let batchStart = 0; batchStart < textChunks.length; batchStart += CHUNK_CONCURRENCY) {
        const batch = textChunks.slice(batchStart, batchStart + CHUNK_CONCURRENCY);
        const batchOutcomes = await Promise.allSettled(
          batch.map((chunk, j) => processChunk(batchStart + j, chunk))
        );
        for (const outcome of batchOutcomes) {
          if (outcome.status === 'fulfilled' && outcome.value.result) {
            chunkResults.push(outcome.value.result);
            if (!analysisProvider || analysisProvider === 'none') {
              analysisProvider = outcome.value.provider ?? 'openai';
            }
          }
        }
      }

      if (chunkResults.length > 0) {
        const merged = mergeChunkAnalyses(chunkResults);
        summary = merged.summary;
        keyFacts = merged.keyFacts;
        favorableFindings = merged.favorableFindings;
        adverseFindings = merged.adverseFindings;
        actionItems = merged.actionItems;
        timelineEvents = merged.timelineEvents;
        extractedEntities = merged.entities;
      }
      } // Close if (analysisProvider === 'none')
    }

    // === Analysis Tier 3: Heuristic fallback ===
    if (hasSubstantialText && summary.length === 0 && keyFacts.length === 0) {
      console.log('AI analysis unavailable — falling back to heuristic extraction...');
      const heuristic = buildHeuristicAnalysis(extractedText);
      analysisProvider = 'heuristic';
      summary = heuristic.summary;
      keyFacts = heuristic.keyFacts;
      favorableFindings = heuristic.favorableFindings;
      adverseFindings = heuristic.adverseFindings;
      actionItems = heuristic.actionItems;
      timelineEvents = heuristic.timelineEvents;
    }

    const hasAnalysis = summary.length > 0 || keyFacts.length > 0 || favorableFindings.length > 0 || adverseFindings.length > 0 || actionItems.length > 0 || timelineEvents.length > 0;

    // Safety net: sanitize ALL text that goes into Postgres — OCR output
    // frequently contains NUL bytes, lone surrogates, and C0 control chars
    // that Postgres rejects with "unsupported Unicode escape sequence".
    extractedText = sanitizeForPostgres(extractedText);
    summary = sanitizeForPostgres(summary);
    keyFacts = keyFacts.map(sanitizeForPostgres);
    favorableFindings = favorableFindings.map(sanitizeForPostgres);
    adverseFindings = adverseFindings.map(sanitizeForPostgres);
    actionItems = actionItems.map(sanitizeForPostgres);
    // Recursively sanitize string values inside entities and tables
    extractedEntities = extractedEntities.map(e => {
      if (typeof e === 'string') return sanitizeForPostgres(e);
      if (e && typeof e === 'object') {
        const obj = e as Record<string, unknown>;
        for (const k of Object.keys(obj)) {
          if (typeof obj[k] === 'string') obj[k] = sanitizeForPostgres(obj[k] as string);
        }
      }
      return e;
    });
    extractedTables = extractedTables.map(t => {
      if (t && typeof t === 'object') {
        const obj = t as Record<string, unknown>;
        for (const k of Object.keys(obj)) {
          if (typeof obj[k] === 'string') obj[k] = sanitizeForPostgres(obj[k] as string);
        }
      }
      return t;
    });

    const updateData: Record<string, unknown> = {
      ocr_text: extractedText,
      ocr_processed_at: new Date().toISOString(),
      ocr_provider: ocrProvider,
      ai_analyzed: hasAnalysis,
      summary: summary || null,
      key_facts: keyFacts.length > 0 ? keyFacts : null,
      favorable_findings: favorableFindings.length > 0 ? favorableFindings : null,
      adverse_findings: adverseFindings.length > 0 ? adverseFindings : null,
      action_items: actionItems.length > 0 ? actionItems : null,
      entities: extractedEntities.length > 0 ? extractedEntities : null,
    };

    // Store structured tables (if any were extracted during OCR)
    if (extractedTables.length > 0) {
      updateData.extracted_tables = extractedTables;
    }

    const { error: updateError } = await supabase.from('documents').update(updateData).eq('id', validatedDocumentId);

    if (updateError) {
      console.warn('Primary update failed, trying legacy fields...', updateError);
      const legacyData: Record<string, unknown> = {
        ocr_text: extractedText,
        ai_analyzed: hasAnalysis,
        summary: summary || null,
        key_facts: keyFacts.length > 0 ? keyFacts : null,
        favorable_findings: favorableFindings.length > 0 ? favorableFindings : null,
        adverse_findings: adverseFindings.length > 0 ? adverseFindings : null,
        action_items: actionItems.length > 0 ? actionItems : null,
      };
      const { error: legacyError } = await supabase.from('documents').update(legacyData).eq('id', validatedDocumentId);
      if (legacyError) throw new Error(`Failed to update document: ${legacyError.message}`);
    }

    // ===== Timeline events insertion =====
    let timelineEventsInserted = 0;
    let timelineInsertWarning: string | null = null;

    if (timelineEvents.length > 0) {
      console.log(`Inserting ${timelineEvents.length} timeline events...`);
      const caseId = docOwnerData.case_id;

      const dedupedEvents = new Map<string, TimelineEventInsertRow[]>();
      const normalizedEvents = (timelineEvents as TimelineEventCandidate[])
        .map((event) => normalizeTimelineEvent(event, caseId, validatedDocumentId, ownerId))
        .filter((event) => !!event)
        .sort((a, b) => a.event_date.localeCompare(b.event_date))
        .filter((event) => {
          const dedupeKey = `${event.event_date.slice(0, 10)}|${event.title.trim().toLowerCase()}`;
          const existing = dedupedEvents.get(dedupeKey) || [];
          if (existing.length === 0) { dedupedEvents.set(dedupeKey, [event]); return true; }
          const hasDiffType = existing.some((c) => c.event_type !== event.event_type);
          if (existing.length === 1 && hasDiffType) { dedupedEvents.set(dedupeKey, [...existing, event]); return true; }
          return false;
        })
        .slice(0, MAX_TIMELINE_EVENTS);

      if (normalizedEvents.length > 0) {
        const { error: clearError } = await supabase.from('timeline_events').delete().eq('linked_document_id', validatedDocumentId);
        if (clearError) { timelineInsertWarning = `Failed clearing old events: ${clearError.message}`; console.warn(timelineInsertWarning); }

        const { data: insertedRows, error: timelineError } = await supabase.from('timeline_events').insert(normalizedEvents).select('id');
        if (timelineError) {
          timelineInsertWarning = `Failed to insert timeline events: ${timelineError.message}`;
          console.error(timelineInsertWarning);
        } else {
          timelineEventsInserted = insertedRows?.length ?? normalizedEvents.length;
          console.log(`Timeline events inserted: ${timelineEventsInserted}`);
        }
      }
    }

    console.log(`Document processed: ocrProvider=${ocrProvider}, analysisProvider=${analysisProvider}, tables=${extractedTables.length}`);

    return new Response(
      JSON.stringify({
        success: true,
        textLength: extractedText.length,
        ocrProvider,
        analysisProvider,
        hasAnalysis,
        summary,
        keyFacts,
        favorableFindings,
        adverseFindings,
        actionItems,
        requestedTimelineEvents: timelineEvents.length,
        timelineEventsInserted,
        timelineInsertWarning,
        tablesExtracted: extractedTables.length,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('OCR Error:', error);
    return createErrorResponse(error instanceof Error ? error : new Error('An unknown error occurred'), 500, 'ocr-document', getCorsHeaders(req));
  }
});

