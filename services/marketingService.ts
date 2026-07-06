import { deepseekChat, parseDeepSeekJson } from './deepseek';

// ---------------------------------------------------------------------------
// Storage helpers
// ---------------------------------------------------------------------------

const STORAGE_KEYS = {
  LEADS: 'casebuddy_leads',
  CAMPAIGNS: 'casebuddy_campaigns',
  FORM_TEMPLATES: 'casebuddy_form_templates',
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
    // quota exceeded or private browsing — silently ignore
  }
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type LeadStatus = 'new' | 'contacted' | 'qualified' | 'converted' | 'lost';
export type LeadSource = 'website' | 'referral' | 'social-media' | 'ad' | 'event' | 'other';
export type CampaignType = 'email' | 'social' | 'ad' | 'event' | 'referral';
export type CampaignStatus = 'draft' | 'active' | 'paused' | 'completed';

export interface Lead {
  id: string;
  fullName: string;
  email: string;
  phone?: string;
  source: LeadSource;
  status: LeadStatus;
  notes: string;
  matterType?: string;
  urgency: 'low' | 'medium' | 'high';
  assignedTo?: string;
  contactedAt?: string;
  convertedCaseId?: string;
  tags: string[];
  createdAt: number;
  updatedAt: number;
}

export interface Campaign {
  id: string;
  name: string;
  type: CampaignType;
  status: CampaignStatus;
  targetAudience: string;
  message: string;
  subject?: string;
  scheduledAt?: string;
  sentCount: number;
  openedCount: number;
  convertedCount: number;
  createdAt: number;
  updatedAt: number;
}

export interface IntakeFormTemplate {
  id: string;
  name: string;
  description: string;
  fields: { label: string; type: 'text' | 'email' | 'phone' | 'textarea' | 'select'; required: boolean; options?: string[] }[];
  embedCode: string;
  redirectUrl?: string;
  notificationEmail?: string;
  createdAt: number;
}

// ---------------------------------------------------------------------------
// Leads
// ---------------------------------------------------------------------------

export const getLeads = (status?: LeadStatus): Lead[] => {
  const leads = readStore<Lead[]>(STORAGE_KEYS.LEADS, []);
  if (status) return leads.filter(l => l.status === status);
  return leads;
};

export const saveLead = (lead: Lead): void => {
  const leads = readStore<Lead[]>(STORAGE_KEYS.LEADS, []);
  const idx = leads.findIndex(l => l.id === lead.id);
  lead.updatedAt = Date.now();
  if (idx >= 0) {
    leads[idx] = lead;
  } else {
    if (!lead.createdAt) lead.createdAt = Date.now();
    if (!lead.updatedAt) lead.updatedAt = Date.now();
    if (!lead.tags) lead.tags = [];
    leads.push(lead);
  }
  writeStore(STORAGE_KEYS.LEADS, leads);
};

export const deleteLead = (id: string): void => {
  const leads = readStore<Lead[]>(STORAGE_KEYS.LEADS, []);
  writeStore(STORAGE_KEYS.LEADS, leads.filter(l => l.id !== id));
};

export const updateLeadStatus = (id: string, status: LeadStatus): void => {
  const leads = readStore<Lead[]>(STORAGE_KEYS.LEADS, []);
  const lead = leads.find(l => l.id === id);
  if (lead) {
    lead.status = status;
    lead.updatedAt = Date.now();
    if (status === 'contacted') lead.contactedAt = new Date().toISOString();
    writeStore(STORAGE_KEYS.LEADS, leads);
  }
};

export const convertLeadToCase = (leadId: string, caseId: string): void => {
  const leads = readStore<Lead[]>(STORAGE_KEYS.LEADS, []);
  const lead = leads.find(l => l.id === leadId);
  if (lead) {
    lead.status = 'converted';
    lead.convertedCaseId = caseId;
    lead.updatedAt = Date.now();
    writeStore(STORAGE_KEYS.LEADS, leads);
  }
};

export const getLeadStats = () => {
  const leads = readStore<Lead[]>(STORAGE_KEYS.LEADS, []);
  const total = leads.length;
  const newLeads = leads.filter(l => l.status === 'new').length;
  const qualified = leads.filter(l => l.status === 'qualified').length;
  const converted = leads.filter(l => l.status === 'converted').length;
  const lost = leads.filter(l => l.status === 'lost').length;
  const closedTotal = converted + lost;
  const conversionRate = closedTotal > 0 ? Math.round((converted / closedTotal) * 100) : 0;
  return { total, new: newLeads, qualified, converted, lost, conversionRate };
};

export const scoreLead = async (
  name: string,
  matterSummary: string
): Promise<{ score: number; recommendation: string; suggestedDepartment: string }> => {
  const fallback = { score: 50, recommendation: 'Needs further review.', suggestedDepartment: 'General Practice' };

  if (!name.trim() && !matterSummary.trim()) return fallback;

  try {
    const raw = await deepseekChat({
      systemInstruction:
        'You are a legal intake specialist scoring a potential client lead. Analyze the matter summary and produce a JSON object.',
      messages: [
        {
          role: 'user',
          content: `Score this lead on a 0-100 scale (0 = unlikely to retain, 100 = high-value client ready to sign).

Lead name: ${name || 'Unknown'}
Matter summary: ${matterSummary || 'No details provided'}

Return ONLY a JSON object with exactly these keys:
- "score": number (0-100)
- "recommendation": string (1-2 sentence assessment of lead quality and next step)
- "suggestedDepartment": string (e.g. "Family Law", "Criminal Defense", "Personal Injury", "Corporate", "Real Estate", "Employment Law", "General Practice")`,
        },
      ],
      jsonMode: true,
    });

    return parseDeepSeekJson<{ score: number; recommendation: string; suggestedDepartment: string }>(raw, fallback);
  } catch {
    return fallback;
  }
};

// ---------------------------------------------------------------------------
// Campaigns
// ---------------------------------------------------------------------------

export const getCampaigns = (type?: CampaignType): Campaign[] => {
  const campaigns = readStore<Campaign[]>(STORAGE_KEYS.CAMPAIGNS, []);
  if (type) return campaigns.filter(c => c.type === type);
  return campaigns;
};

export const saveCampaign = (campaign: Campaign): void => {
  const campaigns = readStore<Campaign[]>(STORAGE_KEYS.CAMPAIGNS, []);
  const idx = campaigns.findIndex(c => c.id === campaign.id);
  campaign.updatedAt = Date.now();
  if (idx >= 0) {
    campaigns[idx] = campaign;
  } else {
    if (!campaign.createdAt) campaign.createdAt = Date.now();
    if (!campaign.updatedAt) campaign.updatedAt = Date.now();
    campaigns.push(campaign);
  }
  writeStore(STORAGE_KEYS.CAMPAIGNS, campaigns);
};

export const deleteCampaign = (id: string): void => {
  const campaigns = readStore<Campaign[]>(STORAGE_KEYS.CAMPAIGNS, []);
  writeStore(STORAGE_KEYS.CAMPAIGNS, campaigns.filter(c => c.id !== id));
};

export const generateCampaignContent = async (
  type: CampaignType,
  targetAudience: string,
  firmName: string
): Promise<string> => {
  const fallback = `Learn how ${firmName || 'our firm'} can help with your legal needs. Contact us today for a free consultation.`;

  try {
    const typeLabel: Record<CampaignType, string> = {
      email: 'an email subject line and body',
      social: 'a social media post',
      ad: 'a paid search/social ad',
      event: 'an event invitation',
      referral: 'a referral partner outreach message',
    };

    const raw = await deepseekChat({
      systemInstruction:
        'You are a legal marketing copywriter. Write compelling, ethical marketing copy for a law firm. Do not make exaggerated claims or guarantees.',
      messages: [
        {
          role: 'user',
          content: `Write ${typeLabel[type] || 'marketing copy'} for the law firm "${firmName || 'the firm'}".

Target audience: ${targetAudience || 'general legal consumers'}
Campaign type: ${type}

Keep it professional, warm, and persuasive. Include a clear call to action. Return ONLY the marketing copy text with no extra commentary.`,
        },
      ],
      jsonMode: false,
    });

    return raw?.trim() || fallback;
  } catch {
    return fallback;
  }
};

// ---------------------------------------------------------------------------
// Intake Forms
// ---------------------------------------------------------------------------

export const getFormTemplates = (): IntakeFormTemplate[] => {
  return readStore<IntakeFormTemplate[]>(STORAGE_KEYS.FORM_TEMPLATES, []);
};

export const saveFormTemplate = (template: IntakeFormTemplate): void => {
  const templates = readStore<IntakeFormTemplate[]>(STORAGE_KEYS.FORM_TEMPLATES, []);
  const idx = templates.findIndex(t => t.id === template.id);
  if (idx >= 0) {
    templates[idx] = template;
  } else {
    if (!template.createdAt) template.createdAt = Date.now();
    templates.push(template);
  }
  writeStore(STORAGE_KEYS.FORM_TEMPLATES, templates);
};

export const deleteFormTemplate = (id: string): void => {
  const templates = readStore<IntakeFormTemplate[]>(STORAGE_KEYS.FORM_TEMPLATES, []);
  writeStore(STORAGE_KEYS.FORM_TEMPLATES, templates.filter(t => t.id !== id));
};

export const generateEmbedCode = (templateId: string, firmId: string): string => {
  return [
    `<iframe`,
    `  src="https://app.casebuddy.com/embed/intake?template=${encodeURIComponent(templateId)}&firm=${encodeURIComponent(firmId)}"`,
    `  width="100%"`,
    `  height="700"`,
    `  frameborder="0"`,
    `  style="border: none; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.1);"`,
    `  title="CaseBuddy Intake Form"`,
    `></iframe>`,
  ].join('\n');
};
