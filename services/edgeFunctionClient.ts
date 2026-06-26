/**
 * Edge Function Client — typed wrapper around supabase.functions.invoke()
 * 
 * Connects AI-Law-Partner to the 32 Supabase Edge Functions originally
 * from case-companion. These run server-side with full database access,
 * proper auth, and rate limiting.
 * 
 * Usage:
 *   import { edgeFn } from './edgeFunctionClient';
 *   const result = await edgeFn.ocrDocument({ documentId, fileUrl });
 */

import { getSupabase, isSupabaseConfigured } from './supabaseClient';

// ─── Types ────────────────────────────────────────────────────────────

export interface EdgeFunctionError {
  error: string;
  details?: string;
  timestamp?: string;
}

// OCR
export interface OcrRequest {
  documentId: string;
  fileUrl: string;
  skipAnalysis?: boolean;
}

export interface OcrResult {
  documentId: string;
  text: string;
  summary?: string;
  keyFacts?: string[];
  favorableFindings?: string[];
  adverseFindings?: string[];
  actionItems?: string[];
  entities?: Record<string, unknown>;
  ocrProvider?: string;
  tables?: Array<{ headers: string[]; rows: string[][] }>;
  events?: Array<{ date: string; description: string; type: string }>;
}

// Evidence Analysis
export interface EvidenceAnalysisRequest {
  caseId: string;
  documentId?: string;
  documentText?: string;
  analysisType?: 'admissibility' | 'impeachment' | 'corroboration' | 'comprehensive';
}

export interface EvidenceAnalysisResult {
  admissibility: {
    ruling: 'admissible' | 'inadmissible' | 'conditionally_admissible';
    confidence: number;
    basis: string[];
    objections: string[];
    counterArguments: string[];
  };
  motions: Array<{
    type: string;
    title: string;
    basis: string;
    strength: 'strong' | 'moderate' | 'weak';
  }>;
  caseLaw: Array<{
    citation: string;
    relevance: string;
    holding: string;
  }>;
}

// Discovery Response
export interface DiscoveryResponseRequest {
  caseId: string;
  requestType: 'interrogatory' | 'request_for_production' | 'request_for_admission' | 'deposition';
  requests: Array<{
    id: string;
    request_number?: string;
    question: string;
    response?: string | null;
    objections?: string[];
  }>;
  caseContext?: string;
  jurisdiction?: string;
}

export interface DiscoveryResponseResult {
  responses: Array<{
    id: string;
    requestNumber: string;
    response: string;
    objections: string[];
    privilegeLog?: string;
    notes?: string;
  }>;
}

// Case Strategy
export interface CaseStrategyRequest {
  caseId: string;
  analysisType?: 'swot' | 'outcome_prediction' | 'settlement' | 'comprehensive';
}

export interface CaseStrategyResult {
  swot?: {
    strengths: string[];
    weaknesses: string[];
    opportunities: string[];
    threats: string[];
  };
  outcomePrediction?: {
    winProbability: number;
    factors: Array<{ factor: string; impact: 'positive' | 'negative' | 'neutral'; weight: number }>;
  };
  settlementRange?: {
    low: number;
    mid: number;
    high: number;
    reasoning: string;
  };
  recommendations: string[];
}

// Legal Research
export interface LegalResearchRequest {
  query: string;
  caseId?: string;
  jurisdiction?: string;
  practiceArea?: string;
  sources?: ('courtlistener' | 'google_scholar' | 'justia')[];
  maxResults?: number;
}

export interface LegalResearchResult {
  results: Array<{
    title: string;
    citation: string;
    court: string;
    date: string;
    relevance: number;
    snippet: string;
    url?: string;
    source: string;
  }>;
  summary?: string;
}

// Conflict Check
export interface ConflictCheckRequest {
  caseId?: string;
  partyName: string;
  partyType?: string;
  additionalNames?: string[];
}

export interface ConflictCheckResult {
  hasConflict: boolean;
  conflicts: Array<{
    caseId: string;
    caseName: string;
    partyName: string;
    relationship: string;
    severity: 'high' | 'medium' | 'low';
  }>;
  clearanceNotes: string;
}

// Trial Simulation
export interface TrialSimulationRequest {
  caseId: string;
  mode: 'cross_examination' | 'direct_examination' | 'opening_statement' | 'closing_argument' |
        'voir_dire' | 'deposition' | 'mediation' | 'oral_argument' | 'motion_hearing' | 'sentencing';
  characterType?: 'judge' | 'witness' | 'opposing_counsel' | 'juror';
  userMessage: string;
  sessionHistory?: Array<{ role: string; content: string }>;
}

export interface TrialSimulationResult {
  response: string;
  characterName?: string;
  feedback?: {
    strengths: string[];
    improvements: string[];
    score?: number;
  };
  sessionId?: string;
}

// Settlement Analysis
export interface SettlementAnalysisRequest {
  caseId: string;
  damages?: Record<string, number>;
  liabilityFactors?: string[];
  jurisdiction?: string;
}

export interface SettlementAnalysisResult {
  recommendedRange: { low: number; mid: number; high: number };
  factors: Array<{ name: string; impact: number; description: string }>;
  comparableCases: Array<{ citation: string; amount: number; similarity: number }>;
  strategy: string;
}

// Cross-Document Analysis
export interface CrossDocumentRequest {
  caseId: string;
  documentIds: string[];
  analysisType?: 'contradictions' | 'timeline' | 'patterns' | 'comprehensive';
}

export interface CrossDocumentResult {
  contradictions: Array<{ doc1: string; doc2: string; finding: string; severity: string }>;
  timeline: Array<{ date: string; event: string; source: string }>;
  patterns: Array<{ pattern: string; documents: string[]; significance: string }>;
  summary: string;
}

// Mock Jury
export interface MockJuryRequest {
  caseId: string;
  caseSummary: string;
  jurorCount?: number;
  caseType?: string;
}

export interface MockJuryResult {
  verdict: 'plaintiff' | 'defendant' | 'hung';
  voteCount: { plaintiff: number; defendant: number; undecided: number };
  deliberation: string;
  jurorProfiles: Array<{
    name: string;
    demographics: string;
    vote: string;
    reasoning: string;
    concerns: string[];
  }>;
}

// Document-Aware Chat
export interface DocumentChatRequest {
  caseId: string;
  message: string;
  documentIds?: string[];
  chatHistory?: Array<{ role: string; content: string }>;
}

export interface DocumentChatResult {
  response: string;
  citations: Array<{ documentId: string; documentName: string; excerpt: string }>;
}

// Send Email
export interface SendEmailRequest {
  to: string;
  subject: string;
  body: string;
  caseId?: string;
  attachments?: Array<{ filename: string; content: string; contentType: string }>;
}

// ─── Client ──────────────────────────────────────────────────────────

async function invoke<T>(functionName: string, body: Record<string, unknown>): Promise<T> {
  const supabase = getSupabase();
  if (!supabase) {
    throw new Error('Supabase not configured — cannot call edge functions');
  }

  const { data, error } = await supabase.functions.invoke(functionName, { body });

  if (error) {
    console.error(`Edge function ${functionName} error:`, error);
    throw new Error(`${functionName} failed: ${error.message}`);
  }

  return data as T;
}

// ─── Public API ──────────────────────────────────────────────────────

export const edgeFn = {
  // ── Document Processing ─────────────────────────────────────────
  ocrDocument: (req: OcrRequest) => invoke<OcrResult>('ocr-document', req as any),

  crossDocumentAnalysis: (req: CrossDocumentRequest) =>
    invoke<CrossDocumentResult>('cross-document-analysis', req as any),

  documentChat: (req: DocumentChatRequest) =>
    invoke<DocumentChatResult>('document-aware-chat', req as any),

  // ── Discovery & Evidence ────────────────────────────────────────
  discoveryResponse: (req: DiscoveryResponseRequest) =>
    invoke<DiscoveryResponseResult>('discovery-response', req as any),

  evidenceAnalysis: (req: EvidenceAnalysisRequest) =>
    invoke<EvidenceAnalysisResult>('evidence-analysis', req as any),

  privilegeLog: (req: { caseId: string; documentIds: string[] }) =>
    invoke<{ entries: Array<{ documentId: string; privilege: string; basis: string }> }>('privilege-log', req as any),

  // ── Strategy & Research ─────────────────────────────────────────
  caseStrategy: (req: CaseStrategyRequest) =>
    invoke<CaseStrategyResult>('case-strategy', req as any),

  legalResearch: (req: LegalResearchRequest) =>
    invoke<LegalResearchResult>('legal-research', req as any),

  settlementAnalysis: (req: SettlementAnalysisRequest) =>
    invoke<SettlementAnalysisResult>('settlement-analysis', req as any),

  conflictCheck: (req: ConflictCheckRequest) =>
    invoke<ConflictCheckResult>('conflict-check', req as any),

  judicialResearch: (req: { judgeName: string; jurisdiction?: string; caseId?: string }) =>
    invoke<{ profile: Record<string, unknown>; rulings: Array<Record<string, unknown>> }>('judicial-research', req as any),

  // ── Trial Preparation ───────────────────────────────────────────
  trialSimulation: (req: TrialSimulationRequest) =>
    invoke<TrialSimulationResult>('trial-simulation', req as any),

  trialCoach: (req: { caseId: string; sessionId?: string; message: string; mode?: string }) =>
    invoke<{ feedback: string; score?: number; tips: string[] }>('trial-coach', req as any),

  trialAssistant: (req: { caseId: string; question: string; context?: string }) =>
    invoke<{ answer: string; references: string[] }>('trial-assistant', req as any),

  witnessPrep: (req: { caseId: string; witnessName: string; witnessType: string; message: string }) =>
    invoke<{ response: string; suggestions: string[] }>('witness-prep', req as any),

  mockJury: (req: MockJuryRequest) => invoke<MockJuryResult>('mock-jury', req as any),

  argumentAnalyzer: (req: { caseId: string; argument: string; side: 'plaintiff' | 'defendant' }) =>
    invoke<{ analysis: string; strengths: string[]; weaknesses: string[]; counterArguments: string[] }>('argument-analyzer', req as any),

  // ── Communication ───────────────────────────────────────────────
  sendEmail: (req: SendEmailRequest) =>
    invoke<{ success: boolean; messageId?: string }>('send-email', req as any),

  chat: (req: { message: string; caseId?: string; history?: Array<{ role: string; content: string }> }) =>
    invoke<{ response: string }>('chat', req as any),

  // ── Gemini Proxy ────────────────────────────────────────────────
  geminiProxy: (req: { model?: string; messages: Array<{ role: string; content: string }>; temperature?: number }) =>
    invoke<{ response: string; model: string }>('gemini-proxy', req as any),

  // ── Document Export ─────────────────────────────────────────────
  exportDocument: (req: { documentId?: string; content: string; format: 'docx' | 'pdf' | 'txt'; title?: string }) =>
    invoke<{ fileUrl: string; fileName: string }>('export-document', req as any),

  // ── Session Management ──────────────────────────────────────────
  saveSession: (req: { caseId: string; sessionType: string; sessionData: Record<string, unknown> }) =>
    invoke<{ sessionId: string }>('save-session', req as any),
};

export default edgeFn;
