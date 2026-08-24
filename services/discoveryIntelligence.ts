import type { CrossDocumentResult } from './edgeFunctionClient';
import {
  analyzeCrossDocuments,
  getCaseDocuments,
  type DocumentRecord,
} from './documentPipeline';

export type DiscoveryAnalysisType = 'contradictions' | 'timeline' | 'patterns' | 'comprehensive';

export interface DiscoverySourceRef {
  documentId: string;
  name: string;
  bates: string | null;
  citationLabel: string;
  documentType: string | null;
}

export interface GroundedContradiction {
  finding: string;
  severity: string;
  sources: DiscoverySourceRef[];
  unresolvedSourceReferences: string[];
}

export interface GroundedTimelineEvent {
  date: string;
  event: string;
  source: DiscoverySourceRef | null;
  unresolvedSourceReference?: string;
}

export interface GroundedPattern {
  pattern: string;
  significance: string;
  sources: DiscoverySourceRef[];
  unresolvedSourceReferences: string[];
}

export interface DiscoveryIntelligenceResult {
  summary: string;
  sources: DiscoverySourceRef[];
  contradictions: GroundedContradiction[];
  timeline: GroundedTimelineEvent[];
  patterns: GroundedPattern[];
  raw: CrossDocumentResult;
}

function toSource(document: DocumentRecord): DiscoverySourceRef {
  const bates = document.bates_formatted || document.bates_number || null;
  return {
    documentId: document.id,
    name: document.name,
    bates,
    citationLabel: bates ? `${bates} · ${document.name}` : document.name,
    documentType: document.document_type,
  };
}

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

function resolveSource(reference: string | null | undefined, sources: DiscoverySourceRef[]): DiscoverySourceRef | null {
  if (!reference) return null;
  const ref = normalize(reference);

  return sources.find(source =>
    normalize(source.documentId) === ref ||
    normalize(source.name) === ref ||
    (source.bates ? normalize(source.bates) === ref : false) ||
    normalize(source.citationLabel) === ref
  ) ?? null;
}

function uniqueSources(sources: DiscoverySourceRef[]): DiscoverySourceRef[] {
  const seen = new Set<string>();
  return sources.filter(source => {
    if (seen.has(source.documentId)) return false;
    seen.add(source.documentId);
    return true;
  });
}

/**
 * Run the existing cross-document analysis endpoint, but constrain the request
 * to documents that actually belong to the selected case and normalize every
 * source reference back to canonical document metadata/Bates labels.
 *
 * We deliberately keep unresolved source references visible rather than
 * guessing which document the model meant.
 */
export async function runDiscoveryIntelligence(
  caseId: string,
  requestedDocumentIds: string[],
  analysisType: DiscoveryAnalysisType = 'comprehensive',
): Promise<DiscoveryIntelligenceResult> {
  const documents = await getCaseDocuments(caseId);
  const byId = new Map(documents.map(document => [document.id, document]));
  const selectedDocuments = requestedDocumentIds
    .map(id => byId.get(id))
    .filter((document): document is DocumentRecord => Boolean(document));

  if (selectedDocuments.length < 2) {
    throw new Error('Select at least two documents from this matter for cross-document analysis.');
  }

  const selectedIds = selectedDocuments.map(document => document.id);
  const sources = selectedDocuments.map(toSource);
  const raw = await analyzeCrossDocuments(caseId, selectedIds, analysisType) as CrossDocumentResult;

  const contradictions: GroundedContradiction[] = (raw.contradictions ?? []).map(item => {
    const references = [item.doc1, item.doc2].filter(Boolean);
    const resolved = uniqueSources(
      references
        .map(reference => resolveSource(reference, sources))
        .filter((source): source is DiscoverySourceRef => Boolean(source)),
    );
    const unresolved = references.filter(reference => !resolveSource(reference, sources));

    return {
      finding: item.finding,
      severity: item.severity,
      sources: resolved,
      unresolvedSourceReferences: unresolved,
    };
  });

  const timeline: GroundedTimelineEvent[] = (raw.timeline ?? []).map(item => {
    const source = resolveSource(item.source, sources);
    return {
      date: item.date,
      event: item.event,
      source,
      unresolvedSourceReference: !source && item.source ? item.source : undefined,
    };
  });

  const patterns: GroundedPattern[] = (raw.patterns ?? []).map(item => {
    const references = item.documents ?? [];
    const resolved = uniqueSources(
      references
        .map(reference => resolveSource(reference, sources))
        .filter((source): source is DiscoverySourceRef => Boolean(source)),
    );
    const unresolved = references.filter(reference => !resolveSource(reference, sources));

    return {
      pattern: item.pattern,
      significance: item.significance,
      sources: resolved,
      unresolvedSourceReferences: unresolved,
    };
  });

  return {
    summary: raw.summary ?? '',
    sources,
    contradictions,
    timeline,
    patterns,
    raw,
  };
}
