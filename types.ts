
export enum CaseStatus {
  PRE_TRIAL = 'Pre-Trial',
  DISCOVERY = 'Discovery',
  TRIAL = 'Trial',
  APPEAL = 'Appeal',
  CLOSED = 'Closed'
}

export enum DocumentType {
  DEPOSITION = 'Deposition',
  MOTION = 'Motion',
  EVIDENCE = 'Evidence',
  CONTRACT = 'Contract',
  OTHER = 'Other'
}

export type TrialPhase = 
  | 'pre-trial-motions'
  | 'voir-dire' 
  | 'opening-statement' 
  | 'direct-examination' 
  | 'cross-examination' 
  | 'defendant-testimony'
  | 'closing-argument' 
  | 'sentencing';

export type SimulationMode = 'learn' | 'practice' | 'trial';

export interface Case {
  id: string;
  title: string;
  client: string;
  status: CaseStatus;
  opposingCounsel: string;
  judge: string;
  nextCourtDate: string;
  summary: string;
  winProbability: number;
}

// ── Intake pipeline ──────────────────────────────────────────────────────────
// A prospect completes a voice intake with Maya; the conversation is distilled
// into a structured IntakeData record, scored, and routed to a department.

export interface IntakeData {
  fullName: string;
  contact: string;          // phone or email, however they gave it
  matterType: string;       // e.g. "Personal Injury", "Family Law"
  jurisdiction: string;     // state / court, if known
  summary: string;          // plain-language description of what happened
  incidentDate: string;     // when it happened (free text ok)
  opposingParties: string;  // who they're up against
  deadlines: string;        // any known deadlines / court dates
  injuriesOrDamages: string;
  desiredOutcome: string;
  priorCounsel: string;     // have they spoken to other lawyers?
}

export type IntakeDisposition = 'accepted' | 'review' | 'denied';

export interface IntakeScore {
  score: number;                 // 0-100 case-strength / fit score
  disposition: IntakeDisposition;
  recommendedDepartment: string; // human label, e.g. "Personal Injury"
  recommendedAgentId: string;    // specialist id, e.g. "personal-injury"
  factors: { label: string; impact: 'positive' | 'negative' | 'neutral'; note: string }[];
  reasoning: string;             // short internal rationale
  clientMessage: string;         // friendly message shown to the prospect
  urgency: 'low' | 'medium' | 'high';
}

export type IntakeStatus = 'new' | 'accepted' | 'denied' | 'routed';

export interface IntakeCase {
  id: string;
  created_at: string;
  full_name: string;
  contact: string;
  matter_type: string;
  jurisdiction: string;
  summary: string;
  score: number;
  disposition: IntakeDisposition;
  status: IntakeStatus;
  recommended_department: string;
  recommended_agent_id: string;
  urgency: 'low' | 'medium' | 'high';
  intake: IntakeData;
  score_detail: IntakeScore;
  transcript: { speaker: string; text: string }[];
}

export interface Document {
  id: string;
  name: string;
  type: DocumentType;
  date: string;
  content: string;
  summary?: string;
  keyEntities?: string[];
}

export interface Witness {
  id: string;
  name: string;
  role: string;
  personality: string; // e.g., "Hostile", "Nervous", "Cooperative"
  credibilityScore: number; // 0-100
  avatarUrl: string;
}

export interface Message {
  id: string;
  sender: 'user' | 'witness' | 'system' | 'opponent' | 'coach';
  text: string;
  timestamp: number;
  sentiment?: string;
}

export interface StrategyInsight {
  title: string;
  description: string;
  confidence: number;
  type: 'risk' | 'opportunity' | 'prediction';
}

export interface OpposingProfile {
  name: string;
  firm: string;
  aggressiveness: number; // 0-100
  settlementTendency: number; // 0-100
  commonTactics: string[];
}

export interface CoachingAnalysis {
  critique: string;
  suggestion: string;
  sampleResponse: string;
  fallaciesIdentified: string[]; // List of logical fallacies detected
  rhetoricalEffectiveness: number; // 0-100 score
  rhetoricalFeedback: string; // Brief comment on tone/persuasion
  teleprompterScript?: string; // New field for providing text to read/reference
}

export interface Transcription {
  id: string;
  caseId: string;
  fileName: string;
  fileUrl?: string;
  text: string;
  duration?: number; // in seconds
  speakers?: string[];
  timestamp: number;
  tags?: string[];
  notes?: string;
}

// ── Evidence (used in EvidenceTimeline) ──────────────────────────────────────
export interface Evidence {
  id: string;
  name: string;
  type: string;
  description: string;
  dateObtained: string;
  exhibitNumber?: string;
  source?: string;
  status?: string;
}

// ── TimelineEvent (used in EvidenceTimeline) ─────────────────────────────────
export interface TimelineEvent {
  id: string;
  date: string;
  title: string;
  description: string;
  type?: string;
  linkedEvidence?: string[];
}

// ── Juror (used in MockJury) ─────────────────────────────────────────────────
export interface Juror {
  id: string;
  name: string;
  age: number;
  occupation: string;
  education: string;
  avatar: string;
  biases?: string[];
  persuasionLevel?: number;
}

// ── JuryDeliberation (used in MockJury) ─────────────────────────────────────
export interface JuryDeliberation {
  jurorId: string;
  statement: string;
  sentiment?: string;
}

// ── JuryVerdict (used in MockJury) ──────────────────────────────────────────
export interface JuryVerdict {
  verdict: 'guilty' | 'not guilty' | 'hung';
  confidence: number;
  voteTally: { guilty: number; notGuilty: number };
  reasoning: string;
  strengths: string[];
  weaknesses: string[];
}

// ── TrialSession (used in SessionHistory) ───────────────────────────────────
export interface TrialSession {
  id: string;
  caseTitle: string;
  phase: string;
  mode: string;
  date: number;
  duration: number;
  score: number;
  transcript?: string;
  audioUrl?: string;
  metrics?: {
    objectionsReceived?: number;
    fallaciesCommitted?: number;
    avgRhetoricalScore?: number;
    wordCount?: number;
  };
}

