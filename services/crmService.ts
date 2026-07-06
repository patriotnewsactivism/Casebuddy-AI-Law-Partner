import { deepseekChat, parseDeepSeekJson } from './deepseek';
import type { Lead } from './marketingService';

// ---------------------------------------------------------------------------
// Storage helpers
// ---------------------------------------------------------------------------

const STORAGE_KEYS = {
  PIPELINE: 'casebuddy_crm_pipeline',
  CLIENT_NOTES: 'casebuddy_client_notes',
  FOLLOW_UPS: 'casebuddy_follow_ups',
} as const;

const isLocalStorageAvailable = (): boolean => {
  try {
    const test = '__localStorage_test__';
    localStorage.setItem(test, test);
    localStorage.removeItem(test);
    return true;
  } catch {
    return false;
  }
};

const readStore = <T>(key: string, fallback: T): T => {
  if (!isLocalStorageAvailable()) return fallback;
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
};

const writeStore = <T>(key: string, value: T): void => {
  if (!isLocalStorageAvailable()) return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // silently ignore quota errors
  }
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CRMPipelineStage =
  | 'intake'
  | 'conflict-check'
  | 'consultation'
  | 'retainer-sent'
  | 'retainer-signed'
  | 'onboarded'
  | 'active'
  | 'closed';

export type FollowUpType = 'call' | 'email' | 'meeting' | 'task';

export interface ClientRecord {
  leadId: string;
  fullName: string;
  email: string;
  phone?: string;
  stage: CRMPipelineStage;
  matterType: string;
  caseId?: string;
  retainerAmount?: number;
  assignedAttorney?: string;
  notes: string;
  enteredAt: number;
  stageUpdatedAt: number;
}

export interface ClientNote {
  id: string;
  leadId: string;
  content: string;
  author: string;
  createdAt: number;
}

export interface FollowUp {
  id: string;
  leadId: string;
  type: FollowUpType;
  description: string;
  dueDate: string;
  completed: boolean;
  completedAt?: string;
  assignedTo?: string;
  createdAt: number;
}

// ---------------------------------------------------------------------------
// Pipeline stage ordering
// ---------------------------------------------------------------------------

const STAGE_ORDER: CRMPipelineStage[] = [
  'intake',
  'conflict-check',
  'consultation',
  'retainer-sent',
  'retainer-signed',
  'onboarded',
  'active',
  'closed',
];

const stageIndex = (stage: CRMPipelineStage): number => {
  const idx = STAGE_ORDER.indexOf(stage);
  return idx >= 0 ? idx : 999;
};

// ---------------------------------------------------------------------------
// Pipeline
// ---------------------------------------------------------------------------

export const getPipeline = (): ClientRecord[] => {
  const records = readStore<ClientRecord[]>(STORAGE_KEYS.PIPELINE, []);
  return records.sort((a, b) => stageIndex(a.stage) - stageIndex(b.stage));
};

export const getClientRecord = (leadId: string): ClientRecord | null => {
  const records = readStore<ClientRecord[]>(STORAGE_KEYS.PIPELINE, []);
  return records.find(r => r.leadId === leadId) ?? null;
};

export const saveClientRecord = (record: ClientRecord): void => {
  const records = readStore<ClientRecord[]>(STORAGE_KEYS.PIPELINE, []);
  const idx = records.findIndex(r => r.leadId === record.leadId);
  record.stageUpdatedAt = Date.now();
  if (idx >= 0) {
    records[idx] = record;
  } else {
    if (!record.enteredAt) record.enteredAt = Date.now();
    if (!record.stageUpdatedAt) record.stageUpdatedAt = Date.now();
    records.push(record);
  }
  writeStore(STORAGE_KEYS.PIPELINE, records);
};

export const advanceStage = (leadId: string): CRMPipelineStage => {
  const records = readStore<ClientRecord[]>(STORAGE_KEYS.PIPELINE, []);
  const record = records.find(r => r.leadId === leadId);
  if (!record) return 'intake';

  const currentIdx = stageIndex(record.stage);
  if (currentIdx >= STAGE_ORDER.length - 1) return record.stage;

  record.stage = STAGE_ORDER[currentIdx + 1];
  record.stageUpdatedAt = Date.now();
  writeStore(STORAGE_KEYS.PIPELINE, records);
  return record.stage;
};

export const getPipelineStats = () => {
  const records = readStore<ClientRecord[]>(STORAGE_KEYS.PIPELINE, []);
  const total = records.length;

  const byStage: Record<CRMPipelineStage, number> = {
    'intake': 0,
    'conflict-check': 0,
    'consultation': 0,
    'retainer-sent': 0,
    'retainer-signed': 0,
    'onboarded': 0,
    'active': 0,
    'closed': 0,
  };

  for (const r of records) {
    if (byStage.hasOwnProperty(r.stage)) {
      byStage[r.stage]++;
    }
  }

  const activeCount = total - (byStage['closed'] || 0);
  const closedCount = byStage['closed'] || 0;
  const conversionRate = total > 0 ? Math.round((closedCount / total) * 100) : 0;

  return { byStage, total, activeCount, closedCount, conversionRate };
};

// ---------------------------------------------------------------------------
// Client Notes
// ---------------------------------------------------------------------------

export const getClientNotes = (leadId: string): ClientNote[] => {
  const notes = readStore<ClientNote[]>(STORAGE_KEYS.CLIENT_NOTES, []);
  return notes
    .filter(n => n.leadId === leadId)
    .sort((a, b) => b.createdAt - a.createdAt);
};

export const addClientNote = (leadId: string, content: string, author: string): ClientNote => {
  const notes = readStore<ClientNote[]>(STORAGE_KEYS.CLIENT_NOTES, []);
  const note: ClientNote = {
    id: `note_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    leadId,
    content,
    author,
    createdAt: Date.now(),
  };
  notes.push(note);
  writeStore(STORAGE_KEYS.CLIENT_NOTES, notes);
  return note;
};

// ---------------------------------------------------------------------------
// Follow-ups
// ---------------------------------------------------------------------------

export const getFollowUps = (completed?: boolean): FollowUp[] => {
  const items = readStore<FollowUp[]>(STORAGE_KEYS.FOLLOW_UPS, []);
  let filtered = items;
  if (completed !== undefined) {
    filtered = items.filter(f => f.completed === completed);
  }
  return filtered.sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());
};

export const addFollowUp = (followUp: FollowUp): void => {
  const items = readStore<FollowUp[]>(STORAGE_KEYS.FOLLOW_UPS, []);
  const idx = items.findIndex(f => f.id === followUp.id);
  if (idx >= 0) {
    items[idx] = followUp;
  } else {
    if (!followUp.createdAt) followUp.createdAt = Date.now();
    items.push(followUp);
  }
  writeStore(STORAGE_KEYS.FOLLOW_UPS, items);
};

export const completeFollowUp = (id: string): void => {
  const items = readStore<FollowUp[]>(STORAGE_KEYS.FOLLOW_UPS, []);
  const item = items.find(f => f.id === id);
  if (item) {
    item.completed = true;
    item.completedAt = new Date().toISOString();
    writeStore(STORAGE_KEYS.FOLLOW_UPS, items);
  }
};

export const getOverdueFollowUps = (): FollowUp[] => {
  const items = readStore<FollowUp[]>(STORAGE_KEYS.FOLLOW_UPS, []);
  const now = new Date();
  return items
    .filter(f => !f.completed && new Date(f.dueDate) < now)
    .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());
};

export const generateFollowUpRecommendation = async (
  leadName: string,
  stage: CRMPipelineStage,
  notes: string
): Promise<string> => {
  const fallback = `Schedule a follow-up ${stage === 'intake' ? 'call' : 'email'} with ${leadName || 'the client'} to check on progress.`;

  if (!leadName.trim() && !notes.trim()) return fallback;

  try {
    const raw = await deepseekChat({
      systemInstruction:
        'You are a legal CRM assistant. Suggest the next best follow-up action for a client in a law firm pipeline. Keep advice practical and actionable.',
      messages: [
        {
          role: 'user',
          content: `Suggest a single next follow-up action for this client:

Client name: ${leadName || 'Unknown'}
Current pipeline stage: ${stage}
Recent notes: ${notes || 'None'}

Return ONLY a 1-3 sentence recommendation for what to do next (e.g., call to schedule, send retainer, prepare conflict check, etc.). Do not include any JSON or meta commentary.`,
        },
      ],
      jsonMode: false,
    });

    return raw?.trim() || fallback;
  } catch {
    return fallback;
  }
};
