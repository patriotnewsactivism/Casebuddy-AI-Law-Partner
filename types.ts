
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
  updatedAt?: string;
}

// ── Intake pipeline ──────────────────────────────────────────────────────────
// A prospect completes a voice intake with Maya; the conversation is distilled
// into a structured IntakeData record, scored, and routed to a department.

export interface IntakeData {
  fullName: string;
  contact: string;          // phone or email, however they gave it
  matterType: string;       // e.g. "Personal Injury", "Family Law"
  jurisdiction: string;     // state / court, if known
  summary: string;          // one-line plain-language description (used on cards)
  incidentDate: string;     // when it happened (free text ok)
  opposingParties: string;  // who they're up against
  deadlines: string;        // any known deadlines / court dates
  injuriesOrDamages: string;
  desiredOutcome: string;
  priorCounsel: string;     // have they spoken to other lawyers?

  // ── Detailed report (optional; populated by the richer extractor) ──────────
  // Every field below must be grounded in what the caller actually said. When a
  // detail wasn't covered, it's left empty rather than guessed — gaps live in
  // `openQuestions` so the firm follows up instead of the model inventing facts.
  detailedNarrative?: string;                 // full factual write-up of the matter
  keyFacts?: string[];                        // concrete facts the client stated
  timeline?: { date: string; event: string }[]; // chronology as described
  parties?: { name: string; role: string }[];    // people/entities + their role
  witnesses?: string;                         // anyone who saw or can speak to it
  evidenceMentioned?: string;                 // docs, photos, texts, records named
  financialImpact?: string;                   // bills, lost wages, property loss
  priorLegalActions?: string;                 // police reports, claims, suits filed
  clientQuotes?: string[];                    // short verbatim quotes, client's words
  openQuestions?: string[];                   // important unknowns to follow up on
  emotionalState?: string;                    // how the caller presented (for the human)
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
  firm_id?: string;
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
  tags?: string[];
  notes?: string;
}

// ── TimelineEvent (used in EvidenceTimeline) ─────────────────────────────────
export interface TimelineEvent {
  id: string;
  date: string;
  title: string;
  description: string;
  type?: string;
  time?: string;
  importance: 'low' | 'medium' | 'high' | 'critical';
  tags?: string[];
  linkedEvidence?: string[];
  linkedWitnesses?: string[];
}

// ── Juror (used in MockJury) ─────────────────────────────────────────────────
export interface Juror {
  id: string;
  name: string;
  age: number;
  occupation: string;
  education: string;
  avatar: string;
  background?: string;
  biases?: string[];
  persuasionLevel?: number;
  leaningScore?: number;
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
  caseId?: string;
  caseTitle?: string;
  phase: string;
  mode: string;
  date: number | string;
  duration: number;
  score?: number;
  transcript: Message[];
  audioUrl?: string;
  feedback?: string;
  metrics?: {
    objectionsReceived?: number;
    fallaciesCommitted?: number;
    avgRhetoricalScore?: number;
    wordCount?: number;
    fillerWordsCount?: number;
  };
}

// ── Agent Automation System ──────────────────────────────────────────────────

export interface AgentAction {
  type: string;
  description: string;
  result?: any;
  timestamp: number;
}

export interface AgentInsight {
  id: string;
  agentId: string;
  caseId: string;
  title: string;
  content: string;
  confidence: number;
  type: 'risk' | 'opportunity' | 'pattern' | 'recommendation' | 'alert';
  source: 'analysis' | 'monitoring' | 'research' | 'learning';
  timestamp: number;
  read: boolean;
}

export interface AgentPattern {
  id: string;
  agentId: string;
  pattern: string;
  confidence: number;
  occurrences: number;
  lastSeen: number;
  category: string;
}

export interface AgentHandoff {
  id: string;
  fromAgentId: string;
  toAgentId: string;
  reason: string;
  caseId: string;
  context: Record<string, any>;
  timestamp: number;
}

export interface ShortTermMemory {
  recentActions: AgentAction[];
  workingContext: Record<string, any>;
  pendingInsights: AgentInsight[];
}

export interface LongTermMemory {
  insights: AgentInsight[];
  patterns: AgentPattern[];
  interactionCount: number;
  lastActiveAt: number;
}

export interface AgentMemory {
  agentId: string;
  caseId: string;
  shortTerm: ShortTermMemory;
  longTerm: LongTermMemory;
  handoffs: AgentHandoff[];
  updatedAt: number;
}

export type BackgroundTaskType = 'monitor' | 'analyze' | 'draft' | 'alert' | 'research' | 'workflow';
export type BackgroundTaskStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent';
export type TaskSchedule = 'immediate' | 'hourly' | 'daily' | 'on-event';

export interface BackgroundTask {
  id: string;
  agentId: string;
  caseId: string;
  taskType: BackgroundTaskType;
  schedule: TaskSchedule;
  priority: TaskPriority;
  status: BackgroundTaskStatus;
  description: string;
  result?: any;
  error?: string;
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
  retryCount?: number;
}

export type NotificationPriority = 'low' | 'medium' | 'high' | 'critical';
export type NotificationType = 'alert' | 'insight' | 'task-complete' | 'recommendation' | 'warning' | 'deadline';

export interface NotificationAction {
  label: string;
  route?: string;
}

export interface AgentNotification {
  id: string;
  agentId: string;
  caseId?: string;
  caseTitle?: string;
  type: NotificationType;
  priority: NotificationPriority;
  title: string;
  message: string;
  actions?: NotificationAction[];
  read: boolean;
  dismissed: boolean;
  timestamp: number;
}

export type ReasoningMode = 'standard' | 'deep-think' | 'expert-panel' | 'adversarial';

export interface ReasoningStep {
  subtask: string;
  reasoning: string;
  timestamp: number;
}

export interface ReasoningResult {
  mode: ReasoningMode;
  steps?: ReasoningStep[];
  synthesis: string;
  critique?: string;
  confidence: number;
  durationMs: number;
  perspectives?: { specialistId: string; specialistName: string; response: string }[];
}

export interface WorkflowStep {
  id: string;
  agentId: string;
  action: string;
  description: string;
  inputs: Record<string, any>;
  outputs?: Record<string, any>;
  status: 'pending' | 'running' | 'completed' | 'skipped' | 'failed';
  startedAt?: number;
  completedAt?: number;
  error?: string;
}

export interface Workflow {
  id: string;
  name: string;
  description: string;
  triggerEvent: string;
  steps: WorkflowStep[];
  status: 'pending' | 'running' | 'completed' | 'failed';
  caseId?: string;
  createdAt: number;
  completedAt?: number;
  result?: Record<string, any>;
}

export interface MonitoringRule {
  id: string;
  agentId: string;
  name: string;
  description: string;
  checkIntervalMs: number;
  enabled: boolean;
  lastChecked?: number;
  lastTriggered?: number;
}

export interface CrossCaseInsight {
  type: 'benchmark' | 'pattern' | 'risk' | 'strategy';
  title: string;
  description: string;
  confidence: number;
  basedOnCases: number;
}

export interface AgentStatus {
  agentId: string;
  isActive: boolean;
  currentTask?: BackgroundTask;
  tasksCompleted: number;
  tasksToday: number;
  lastActiveAt?: number;
  insights: number;
}

export interface LearningEvent {
  id: string;
  agentId: string;
  caseId: string;
  action: string;
  outcome: 'success' | 'failure' | 'neutral';
  userFeedback?: 'positive' | 'negative';
  context: Record<string, any>;
  timestamp: number;
}

// ── War Room ─────────────────────────────────────────────────────────────────
export interface WarRoomTask {
  id: string;
  agent: string;
  category: string;
  title: string;
  description: string;
  status: 'pending' | 'working' | 'done' | 'error';
  priority: 'low' | 'medium' | 'high' | 'critical';
  done: boolean;
  content?: string;
}

export interface WarRoomBriefing {
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  estimatedTrialReadiness: number;
  topPriority: string;
  keyRisks: string[];
  summary: string;
  tasks: WarRoomTask[];
}
