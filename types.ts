
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
