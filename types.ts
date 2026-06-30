
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
  caseType?: string;
  assignedSpecialistId?: string;
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
  client_invite_id?: string;   // set when intake came from a specific client invite link
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

export type BackgroundTaskType = 'monitor' | 'analyze' | 'draft' | 'alert' | 'research' | 'workflow' | 'summarize';
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
  parallel?: boolean;
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

// ── CasePipeline — Autonomous Evidence Intelligence Engine ────────────────────

export type PipelineStageId =
  | 'inventory'
  | 'extraction'
  | 'indexing'
  | 'entities'
  | 'chronology'
  | 'contradictions'
  | 'constitutional'
  | 'motions'
  | 'discovery-plan'
  | 'gap-analysis'
  | 'impeachment'
  | 'witness-questions'
  | 'briefing';

export interface PipelineStageDef {
  id: PipelineStageId;
  label: string;
  description: string;
  icon: string; // emoji
}

export type PipelineStageStatus = 'pending' | 'running' | 'completed' | 'error' | 'skipped';

export interface PipelineStage {
  id: PipelineStageId;
  label: string;
  status: PipelineStageStatus;
  startedAt?: number;
  completedAt?: number;
  error?: string;
  output?: any;
}

export interface PipelineInventoryItem {
  id: string;
  fileName: string;
  fileSize: number;
  fileType: string;
  batesNumber?: string;
  category?: string; // 'police-report' | 'witness-statement' | 'medical-record' | 'photo' | 'video' | 'audio' | 'correspondence' | 'legal-filing' | 'other'
  extractedText?: string;
  summary?: string;
}

export interface PipelineEntity {
  name: string;
  type: 'person' | 'organization' | 'location' | 'date' | 'statute' | 'case-law';
  role?: string; // 'witness' | 'opposing-party' | 'victim' | 'officer' | 'expert' | 'judge' | 'other'
  mentions: number;
  documents: string[]; // inventory item ids
}

export interface PipelineChronologyEntry {
  date: string;
  title: string;
  description: string;
  source: string; // inventory item id
  confidence: 'high' | 'medium' | 'low';
}

export interface PipelineContradiction {
  id: string;
  description: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  sourceA: string; // inventory item id
  sourceB: string;
  detail: string;
  implication: string;
}

export interface PipelineConstitutionalIssue {
  amendment: string; // e.g. '4th', '5th', '6th', '8th', '14th'
  issue: string;
  description: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  recommendation: string;
  relevantFacts: string[];
}

export interface PipelineMotion {
  title: string;
  type: string; // 'motion-to-suppress' | 'motion-to-dismiss' | 'motion-in-limine' | 'motion-for-summary-judgment' | 'other'
  priority: 'critical' | 'high' | 'medium' | 'low';
  basis: string;
  draftContent?: string;
}

export interface PipelineDiscoveryItem {
  type: 'interrogatory' | 'request-for-production' | 'request-for-admission' | 'subpoena' | 'deposition-notice';
  target: string; // who/what it's directed at
  description: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  draftContent?: string;
}

export interface PipelineGap {
  description: string;
  category: 'missing-evidence' | 'missing-witness' | 'missing-document' | 'incomplete-record' | 'chain-of-custody' | 'other';
  severity: 'critical' | 'high' | 'medium' | 'low';
  recommendation: string;
}

export interface PipelineImpeachment {
  targetName: string;
  targetRole: string;
  statement: string;
  source: string; // inventory item id
  contradiction: string;
  impeachmentValue: 'critical' | 'high' | 'medium' | 'low';
  suggestedQuestions: string[];
}

export interface PipelineWitnessQuestions {
  witnessName: string;
  witnessRole: string;
  directExamination: string[];
  crossExamination: string[];
  keyTopics: string[];
}

export interface PipelineBriefing {
  executiveSummary: string;
  casePosture: string;
  topRisks: string[];
  topOpportunities: string[];
  keyFindings: string[];
  recommendedActions: { action: string; priority: 'critical' | 'high' | 'medium' | 'low'; assignedTo: string }[];
  nextSteps: string[];
  generatedAt: number;
}

export interface PipelineState {
  id: string;
  caseId: string;
  caseTitle: string;
  status: 'idle' | 'running' | 'completed' | 'error' | 'cancelled';
  stages: PipelineStage[];
  inventory: PipelineInventoryItem[];
  entities: PipelineEntity[];
  chronology: PipelineChronologyEntry[];
  contradictions: PipelineContradiction[];
  constitutionalIssues: PipelineConstitutionalIssue[];
  motions: PipelineMotion[];
  discoveryItems: PipelineDiscoveryItem[];
  gaps: PipelineGap[];
  impeachments: PipelineImpeachment[];
  witnessQuestions: PipelineWitnessQuestions[];
  briefing?: PipelineBriefing;
  startedAt?: number;
  completedAt?: number;
  error?: string;
  currentStageId?: PipelineStageId;
  overallProgress: number; // 0-100
}

export const PIPELINE_STAGES: PipelineStageDef[] = [
  { id: 'inventory', label: 'Upload & Inventory', description: 'Scanning all files, creating document inventory', icon: '📋' },
  { id: 'extraction', label: 'Text Extraction', description: 'Extracting text from all documents via OCR', icon: '🔍' },
  { id: 'indexing', label: 'Document Indexing', description: 'Categorizing and assigning exhibit numbers', icon: '🏷️' },
  { id: 'entities', label: 'Entity Extraction', description: 'Identifying people, places, organizations, dates', icon: '👥' },
  { id: 'chronology', label: 'Chronology', description: 'Building a timeline of all events', icon: '📅' },
  { id: 'contradictions', label: 'Contradiction Detection', description: 'Cross-referencing documents for inconsistencies', icon: '⚠️' },
  { id: 'constitutional', label: 'Constitutional Analysis', description: 'Identifying constitutional issues and violations', icon: '🏛️' },
  { id: 'motions', label: 'Motion Drafting', description: 'Drafting relevant motions based on findings', icon: '📝' },
  { id: 'discovery-plan', label: 'Discovery Planning', description: 'Recommending interrogatories, RFPs, RFAs, subpoenas', icon: '🔎' },
  { id: 'gap-analysis', label: 'Evidence Gap Analysis', description: 'Identifying missing evidence and records', icon: '🕳️' },
  { id: 'impeachment', label: 'Impeachment Material', description: 'Finding statements that can impeach witnesses', icon: '🎯' },
  { id: 'witness-questions', label: 'Witness Questions', description: 'Generating examination and cross-examination questions', icon: '❓' },
  { id: 'briefing', label: 'Final Briefing', description: 'Compiling comprehensive morning briefing', icon: '📊' },
];

// ── Billing & Time Tracking ────────────────────────────────────────────────────

export type InvoiceStatus = 'draft' | 'sent' | 'paid' | 'overdue' | 'cancelled' | 'partial';

export type BillingFrequency = 'hourly' | 'flat-fee' | 'contingency' | 'retainer' | 'subscription';

export interface BillingRate {
  id: string;
  caseId?: string;
  name: string;
  rate: number;
  frequency: BillingFrequency;
  currency: string;
}

export interface TimeEntry {
  id: string;
  caseId: string;
  caseTitle: string;
  date: string;
  description: string;
  hours: number;
  rate: number;
  amount: number;
  billed: boolean;
  invoiceId?: string;
  createdAt: number;
}

export interface Expense {
  id: string;
  caseId: string;
  caseTitle: string;
  date: string;
  description: string;
  category: string;
  amount: number;
  billed: boolean;
  invoiceId?: string;
  createdAt: number;
}

export interface InvoiceLineItem {
  id: string;
  type: 'time' | 'expense' | 'flat-fee' | 'retainer-draw';
  description: string;
  date?: string;
  hours?: number;
  rate?: number;
  amount: number;
  sourceId?: string;
}

export interface Invoice {
  id: string;
  number: string;
  caseId: string;
  caseTitle: string;
  clientName: string;
  clientEmail?: string;
  status: InvoiceStatus;
  issueDate: string;
  dueDate: string;
  lineItems: InvoiceLineItem[];
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  total: number;
  amountPaid: number;
  notes?: string;
  terms?: string;
  createdAt: number;
  updatedAt: number;
  paidAt?: string;
}

export interface Retainer {
  id: string;
  caseId: string;
  caseTitle: string;
  clientName: string;
  totalAmount: number;
  remainingAmount: number;
  hourlyRate: number;
  minimumBalance: number;
  lastDrawAt?: string;
  createdAt: number;
  updatedAt: number;
}

export interface Payment {
  id: string;
  invoiceId: string;
  caseId: string;
  amount: number;
  date: string;
  method: string;
  reference?: string;
  notes?: string;
  createdAt: number;
}

export interface BillingDashboard {
  totalInvoiced: number;
  totalCollected: number;
  totalOutstanding: number;
  overdueCount: number;
  overdueAmount: number;
  thisMonthBilled: number;
  thisMonthCollected: number;
  thisMonthHours: number;
  activeRetainers: number;
  retainerBalance: number;
}


// ── Enterprise: Multi-user, RBAC, Product Tiers ───────────────────────────────

export type ProductTier = 'personal' | 'professional' | 'enterprise';

export type UserRole = 'admin' | 'attorney' | 'paralegal' | 'viewer';

export interface TeamMember {
  id: string;
  email: string;
  displayName: string;
  role: UserRole;
  title?: string;
  avatarInitials: string;
  status: 'active' | 'invited' | 'disabled';
  joinedAt?: string;
  lastActiveAt?: string;
}

export interface Permission {
  action: string;                // e.g. 'cases:create', 'billing:view', 'admin:settings'
  description: string;
}

export interface RoleDefinition {
  role: UserRole;
  label: string;
  permissions: string[];         // list of permission actions
}

export interface ApiKey {
  id: string;
  name: string;
  key: string;                   // the actual key (masked in UI)
  prefix: string;                // first 8 chars for identification
  scopes: string[];              // e.g. ['read:cases', 'write:documents']
  createdAt: number;
  lastUsedAt?: number;
  enabled: boolean;
}

export interface TierFeature {
  id: string;
  label: string;
  description: string;
  requiredTier: ProductTier;
}

export interface FirmSettings {
  firmName: string;
  firmEmail: string;
  firmPhone?: string;
  firmAddress?: string;
  firmWebsite?: string;
  logoUrl?: string;
  primaryColor?: string;
  timezone: string;
  currency: string;
  defaultBillingRate: number;
  invoicePrefix: string;         // e.g. 'INV'
  invoiceFooter?: string;
  requireMFA: boolean;
  sessionTimeoutMinutes: number;
}

export interface UsageMetrics {
  totalCases: number;
  activeCases: number;
  totalDocuments: number;
  totalTimeEntries: number;
  totalApiCalls: number;
  storageUsedMB: number;
  teamMembers: number;
  month: string;
}

// Tier feature definitions
export const TIER_FEATURES: TierFeature[] = [
  { id: 'cases', label: 'Case Management', description: 'Create and manage cases', requiredTier: 'personal' },
  { id: 'evidence', label: 'Evidence Vault', description: 'Upload and organize evidence', requiredTier: 'personal' },
  { id: 'timeline', label: 'Case Timeline', description: 'Visual case chronology', requiredTier: 'personal' },
  { id: 'documents', label: 'Document Drafting', description: 'AI-powered document generation', requiredTier: 'personal' },
  { id: 'strategy', label: 'AI Strategy', description: 'Case strategy analysis', requiredTier: 'personal' },
  { id: 'deadlines', label: 'Deadline Tracking', description: 'Court deadline management', requiredTier: 'personal' },
  { id: 'witness-prep', label: 'Witness Preparation', description: 'Witness interview and prep tools', requiredTier: 'personal' },
  { id: 'jury', label: 'Jury Analysis', description: 'Voir dire and jury simulation', requiredTier: 'personal' },
  { id: 'trial-sim', label: 'Trial Simulator', description: 'Live voice trial practice', requiredTier: 'personal' },
  { id: 'transcriber', label: 'Transcriber & OCR', description: 'Audio transcription and document OCR', requiredTier: 'personal' },
  { id: 'foia', label: 'FOIA & Records', description: 'Public records requests', requiredTier: 'personal' },
  { id: 'pipeline', label: 'Case Pipeline', description: 'Autonomous evidence analysis', requiredTier: 'professional' },
  { id: 'billing', label: 'Billing & Invoices', description: 'Time tracking and invoicing', requiredTier: 'professional' },
  { id: 'intake', label: 'Client Intake', description: 'Automated client intake system', requiredTier: 'professional' },
  { id: 'discovery', label: 'Discovery Manager', description: 'Full discovery management', requiredTier: 'professional' },
  { id: 'crm', label: 'Client Portal', description: 'Client-facing portal', requiredTier: 'professional' },
  { id: 'mail-room', label: 'Mail Room', description: 'AI email management', requiredTier: 'professional' },
  { id: 'legal-team', label: 'AI Legal Team', description: '12 specialist AI attorneys', requiredTier: 'professional' },
  { id: 'firm-command', label: 'Firm Command', description: 'Multi-agent orchestration', requiredTier: 'professional' },
  { id: 'intercom', label: 'Intercom', description: 'Live voice intercom', requiredTier: 'professional' },
  { id: 'case-threads', label: 'Case Threads', description: 'Threaded team discussions', requiredTier: 'professional' },
  { id: 'integrations', label: 'Integrations', description: 'Third-party service connections', requiredTier: 'professional' },
  { id: 'agent-status', label: 'Agent Status', description: 'AI agent monitoring', requiredTier: 'professional' },
  { id: 'team-management', label: 'Team Management', description: 'Multi-user accounts and roles', requiredTier: 'enterprise' },
  { id: 'rbac', label: 'Role-Based Access', description: 'Granular permissions control', requiredTier: 'enterprise' },
  { id: 'api-access', label: 'API Access', description: 'Programmatic API integration', requiredTier: 'enterprise' },
  { id: 'white-label', label: 'White Label', description: 'Custom branding and domain', requiredTier: 'enterprise' },
  { id: 'audit-log', label: 'Audit Logs', description: 'Compliance activity tracking', requiredTier: 'enterprise' },
  { id: 'sso', label: 'SSO Integration', description: 'Single sign-on support', requiredTier: 'enterprise' },
];

// ── Knowledge Base ─────────────────────────────────────────────────────────────

export type KBArticleStatus = 'draft' | 'published' | 'archived';

export type KBCategory =
  | 'case-strategy'
  | 'motion-drafting'
  | 'evidence-rules'
  | 'discovery'
  | 'witness-examination'
  | 'jury-selection'
  | 'constitutional-law'
  | 'criminal-procedure'
  | 'civil-procedure'
  | 'appellate'
  | 'settlement'
  | 'trial-technique'
  | 'legal-research'
  | 'client-management'
  | 'firm-operations';

export interface KBArticle {
  id: string;
  title: string;
  content: string;               // markdown content
  category: KBCategory;
  tags: string[];
  status: KBArticleStatus;
  author: string;                // agent name or 'user'
  caseReference?: string;        // caseId this was learned from
  relatedCaseIds: string[];      // cases this article is relevant to
  citations: string[];           // legal citations referenced
  viewCount: number;
  helpfulCount: number;
  createdAt: number;
  updatedAt: number;
}

export interface KBSearchResult {
  article: KBArticle;
  relevanceScore: number;        // 0-100
  matchedOn: string[];           // which fields matched
}

export interface KBCategoryInfo {
  id: KBCategory;
  label: string;
  description: string;
  icon: string;                  // emoji
}

export const KB_CATEGORIES: KBCategoryInfo[] = [
  { id: 'case-strategy', label: 'Case Strategy', description: 'Strategic approaches and frameworks', icon: '🎯' },
  { id: 'motion-drafting', label: 'Motion Drafting', description: 'Motion templates and arguments', icon: '📝' },
  { id: 'evidence-rules', label: 'Evidence Rules', description: 'Rules of evidence and admissibility', icon: '🔍' },
  { id: 'discovery', label: 'Discovery', description: 'Discovery tactics and management', icon: '🔎' },
  { id: 'witness-examination', label: 'Witness Examination', description: 'Direct and cross techniques', icon: '👤' },
  { id: 'jury-selection', label: 'Jury Selection', description: 'Voir dire and jury strategy', icon: '🧠' },
  { id: 'constitutional-law', label: 'Constitutional Law', description: '4th/5th/6th Amendment issues', icon: '🏛️' },
  { id: 'criminal-procedure', label: 'Criminal Procedure', description: 'Criminal case process', icon: '⚖️' },
  { id: 'civil-procedure', label: 'Civil Procedure', description: 'Civil litigation rules', icon: '📋' },
  { id: 'appellate', label: 'Appellate Practice', description: 'Appeals and post-conviction', icon: '📚' },
  { id: 'settlement', label: 'Settlement', description: 'Negotiation and ADR', icon: '🤝' },
  { id: 'trial-technique', label: 'Trial Technique', description: 'Courtroom advocacy skills', icon: '🎭' },
  { id: 'legal-research', label: 'Legal Research', description: 'Research methods and resources', icon: '📖' },
  { id: 'client-management', label: 'Client Management', description: 'Client relations and intake', icon: '👥' },
  { id: 'firm-operations', label: 'Firm Operations', description: 'Practice management', icon: '🏢' },
];

export const ROLE_DEFINITIONS: RoleDefinition[] = [
  {
    role: 'admin',
    label: 'Administrator',
    permissions: ['*'],
  },
  {
    role: 'attorney',
    label: 'Attorney',
    permissions: [
      'cases:*', 'evidence:*', 'documents:*', 'strategy:*', 'billing:*',
      'witness:*', 'jury:*', 'discovery:*', 'deadlines:*', 'pipeline:*',
      'intake:*', 'clients:*', 'transcriber:*', 'foia:*', 'team:view',
    ],
  },
  {
    role: 'paralegal',
    label: 'Paralegal',
    permissions: [
      'cases:view', 'cases:edit', 'evidence:*', 'documents:view', 'documents:create',
      'deadlines:*', 'discovery:view', 'discovery:create', 'transcriber:*',
      'clients:view', 'foia:view', 'foia:create', 'billing:view', 'billing:create',
    ],
  },
  {
    role: 'viewer',
    label: 'Viewer',
    permissions: [
      'cases:view', 'evidence:view', 'documents:view', 'deadlines:view',
      'discovery:view', 'clients:view',
    ],
  },
];
