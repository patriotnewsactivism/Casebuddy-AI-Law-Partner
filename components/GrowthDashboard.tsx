import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  TrendingUp, Users, Target, Mail, Phone, Calendar, BarChart3, Plus, Trash2,
  Edit3, Send, Eye, ChevronRight, ArrowUpRight, ArrowDownRight, Clock,
  CheckCircle2, XCircle, AlertTriangle, Zap, Loader2, Filter, Search,
  Copy, Code, Globe, MessageSquare, UserPlus, Building2
} from 'lucide-react';
import {
  getLeads, saveLead, deleteLead, updateLeadStatus, convertLeadToCase,
  getLeadStats, scoreLead,
  getCampaigns, saveCampaign, deleteCampaign, generateCampaignContent,
  getFormTemplates, saveFormTemplate, deleteFormTemplate, generateEmbedCode,
  type Lead, type LeadStatus, type LeadSource, type Campaign, type CampaignType,
  type CampaignStatus, type IntakeFormTemplate
} from '../services/marketingService';
import {
  getPipeline, getClientRecord, saveClientRecord, advanceStage, getPipelineStats,
  getClientNotes, addClientNote, getFollowUps, addFollowUp, completeFollowUp,
  getOverdueFollowUps, generateFollowUpRecommendation,
  type ClientRecord, type CRMPipelineStage, type ClientNote, type FollowUp, type FollowUpType
} from '../services/crmService';
import { deepseekChat } from '../services/deepseek';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const generateId = (prefix: string): string =>
  `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

const formatDate = (ts: number): string => {
  if (!ts) return '-';
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

const daysSince = (ts: number): number => {
  return Math.floor((Date.now() - ts) / (1000 * 60 * 60 * 24));
};

const leadStatusBadge = (status: LeadStatus): { bg: string; text: string; label: string } => {
  switch (status) {
    case 'new': return { bg: 'bg-blue-900/40', text: 'text-blue-400', label: 'New' };
    case 'contacted': return { bg: 'bg-purple-900/40', text: 'text-purple-400', label: 'Contacted' };
    case 'qualified': return { bg: 'bg-amber-900/40', text: 'text-amber-400', label: 'Qualified' };
    case 'converted': return { bg: 'bg-green-900/40', text: 'text-green-400', label: 'Converted' };
    case 'lost': return { bg: 'bg-red-900/40', text: 'text-red-400', label: 'Lost' };
  }
};

const leadSourceBadge = (source: LeadSource): { bg: string; text: string; label: string } => {
  switch (source) {
    case 'website': return { bg: 'bg-slate-700', text: 'text-slate-300', label: 'Website' };
    case 'referral': return { bg: 'bg-green-900/40', text: 'text-green-400', label: 'Referral' };
    case 'social-media': return { bg: 'bg-purple-900/40', text: 'text-purple-400', label: 'Social' };
    case 'ad': return { bg: 'bg-orange-900/40', text: 'text-orange-400', label: 'Ad' };
    case 'event': return { bg: 'bg-teal-900/40', text: 'text-teal-400', label: 'Event' };
    case 'other': return { bg: 'bg-slate-700', text: 'text-slate-400', label: 'Other' };
  }
};

const campaignTypeBadge = (type: CampaignType): { bg: string; text: string; label: string } => {
  switch (type) {
    case 'email': return { bg: 'bg-blue-900/40', text: 'text-blue-400', label: 'Email' };
    case 'social': return { bg: 'bg-purple-900/40', text: 'text-purple-400', label: 'Social' };
    case 'ad': return { bg: 'bg-orange-900/40', text: 'text-orange-400', label: 'Ad' };
    case 'event': return { bg: 'bg-green-900/40', text: 'text-green-400', label: 'Event' };
    case 'referral': return { bg: 'bg-gold-900/40', text: 'text-gold-400', label: 'Referral' };
  }
};

const campaignStatusBadge = (status: CampaignStatus): { bg: string; text: string; label: string } => {
  switch (status) {
    case 'draft': return { bg: 'bg-slate-700', text: 'text-slate-300', label: 'Draft' };
    case 'active': return { bg: 'bg-green-900/40', text: 'text-green-400', label: 'Active' };
    case 'paused': return { bg: 'bg-amber-900/40', text: 'text-amber-400', label: 'Paused' };
    case 'completed': return { bg: 'bg-blue-900/40', text: 'text-blue-400', label: 'Completed' };
  }
};

const urgencyBadge = (urgency: 'low' | 'medium' | 'high'): { bg: string; text: string; label: string } => {
  switch (urgency) {
    case 'low': return { bg: 'bg-slate-700', text: 'text-slate-400', label: 'Low' };
    case 'medium': return { bg: 'bg-amber-900/40', text: 'text-amber-400', label: 'Medium' };
    case 'high': return { bg: 'bg-red-900/40', text: 'text-red-400', label: 'High' };
  }
};

const STAGE_LABELS: Record<CRMPipelineStage, string> = {
  'intake': 'Intake',
  'conflict-check': 'Conflict Check',
  'consultation': 'Consultation',
  'retainer-sent': 'Retainer Sent',
  'retainer-signed': 'Retainer Signed',
  'onboarded': 'Onboarded',
  'active': 'Active',
  'closed': 'Closed',
};

const STAGE_COLORS: Record<CRMPipelineStage, string> = {
  'intake': 'border-t-slate-400',
  'conflict-check': 'border-t-blue-400',
  'consultation': 'border-t-purple-400',
  'retainer-sent': 'border-t-amber-400',
  'retainer-signed': 'border-t-orange-400',
  'onboarded': 'border-t-teal-400',
  'active': 'border-t-green-400',
  'closed': 'border-t-slate-500',
};

const PIPELINE_STAGES: CRMPipelineStage[] = [
  'intake', 'conflict-check', 'consultation', 'retainer-sent',
  'retainer-signed', 'onboarded', 'active', 'closed',
];

const FOLLOWUP_TYPE_ICONS: Record<FollowUpType, React.ReactNode> = {
  call: <Phone className="w-3.5 h-3.5" />,
  email: <Mail className="w-3.5 h-3.5" />,
  meeting: <Calendar className="w-3.5 h-3.5" />,
  task: <CheckCircle2 className="w-3.5 h-3.5" />,
};

const TABS = [
  { key: 'leads', label: 'Leads', icon: Users },
  { key: 'pipeline', label: 'Pipeline', icon: BarChart3 },
  { key: 'campaigns', label: 'Campaigns', icon: Send },
  { key: 'forms', label: 'Forms', icon: Code },
];

const LEAD_SOURCES: LeadSource[] = ['website', 'referral', 'social-media', 'ad', 'event', 'other'];
const LEAD_STATUSES: LeadStatus[] = ['new', 'contacted', 'qualified', 'converted', 'lost'];
const CAMPAIGN_TYPES: CampaignType[] = ['email', 'social', 'ad', 'event', 'referral'];
const FOLLOWUP_TYPES: FollowUpType[] = ['call', 'email', 'meeting', 'task'];
const FIELD_TYPES = ['text', 'email', 'phone', 'textarea', 'select'] as const;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const GrowthDashboard: React.FC = () => {
  const [activeTab, setActiveTab] = useState('leads');

  // Leads state
  const [leads, setLeads] = useState<Lead[]>([]);
  const [leadStats, setLeadStats] = useState({ total: 0, new: 0, qualified: 0, converted: 0, lost: 0, conversionRate: 0 });
  const [leadFilter, setLeadFilter] = useState<string>('all');
  const [leadSearch, setLeadSearch] = useState('');
  const [showLeadModal, setShowLeadModal] = useState(false);
  const [editingLead, setEditingLead] = useState<Lead | null>(null);

  // Lead form state
  const [leadForm, setLeadForm] = useState({
    fullName: '', email: '', phone: '', source: 'website' as LeadSource,
    matterType: '', urgency: 'medium' as 'low' | 'medium' | 'high', notes: '', tags: '',
  });

  // AI Scoring state
  const [scoreName, setScoreName] = useState('');
  const [scoreSummary, setScoreSummary] = useState('');
  const [scoring, setScoring] = useState(false);
  const [scoreResult, setScoreResult] = useState<{ score: number; recommendation: string; suggestedDepartment: string } | null>(null);

  // Pipeline state
  const [pipeline, setPipeline] = useState<ClientRecord[]>([]);
  const [pipelineStats, setPipelineStats] = useState<{ byStage: Record<CRMPipelineStage, number>; total: number; activeCount: number; closedCount: number; conversionRate: number } | null>(null);
  const [expandedClient, setExpandedClient] = useState<string | null>(null);
  const [showAddRecordModal, setShowAddRecordModal] = useState(false);
  const [clientNotes, setClientNotes] = useState<ClientNote[]>([]);
  const [clientFollowUps, setClientFollowUps] = useState<FollowUp[]>([]);
  const [overdueFollowUps, setOverdueFollowUps] = useState<FollowUp[]>([]);
  const [newNote, setNewNote] = useState('');
  const [followUpForm, setFollowUpForm] = useState({ type: 'call' as FollowUpType, description: '', dueDate: '', assignedTo: '' });
  const [followUpRec, setFollowUpRec] = useState('');
  const [generatingRec, setGeneratingRec] = useState(false);

  // Add Record form
  const [recordForm, setRecordForm] = useState({
    fullName: '', email: '', phone: '', matterType: '', stage: 'intake' as CRMPipelineStage,
    assignedAttorney: '', notes: '', retainerAmount: '',
  });

  // Campaigns state
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [showCampaignModal, setShowCampaignModal] = useState(false);
  const [editingCampaign, setEditingCampaign] = useState<Campaign | null>(null);
  const [campaignForm, setCampaignForm] = useState({
    name: '', type: 'email' as CampaignType, targetAudience: '', subject: '', message: '', scheduledAt: '',
  });
  const [generatingContent, setGeneratingContent] = useState(false);

  // Forms state
  const [formTemplates, setFormTemplates] = useState<IntakeFormTemplate[]>([]);
  const [showFormModal, setShowFormModal] = useState(false);
  const [editingForm, setEditingForm] = useState<IntakeFormTemplate | null>(null);
  const [formForm, setFormForm] = useState({
    name: '', description: '', notificationEmail: '', redirectUrl: '',
    fields: [] as { label: string; type: string; required: boolean; options?: string[] }[],
  });
  const [showEmbedCode, setShowEmbedCode] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // --- Data Loaders ---
  const loadLeads = useCallback(() => {
    setLeads(getLeads());
    setLeadStats(getLeadStats());
  }, []);

  const loadPipeline = useCallback(() => {
    setPipeline(getPipeline());
    setPipelineStats(getPipelineStats());
    setOverdueFollowUps(getOverdueFollowUps());
  }, []);

  const loadCampaigns = useCallback(() => {
    setCampaigns(getCampaigns());
  }, []);

  const loadForms = useCallback(() => {
    setFormTemplates(getFormTemplates());
  }, []);

  useEffect(() => { loadLeads(); loadPipeline(); loadCampaigns(); loadForms(); }, [loadLeads, loadPipeline, loadCampaigns, loadForms]);

  const loadClientDetails = useCallback((leadId: string) => {
    setClientNotes(getClientNotes(leadId));
    setClientFollowUps(getFollowUps(undefined).filter(f => !('leadId' in f) || (f as FollowUp).leadId === leadId));
  }, []);

  // --- Filtered leads ---
  const filteredLeads = useMemo(() => {
    let result = leads;
    if (leadFilter !== 'all') result = result.filter(l => l.status === leadFilter);
    if (leadSearch.trim()) {
      const q = leadSearch.toLowerCase();
      result = result.filter(l => l.fullName.toLowerCase().includes(q) || l.email.toLowerCase().includes(q));
    }
    return result;
  }, [leads, leadFilter, leadSearch]);

  // --- Lead Handlers ---
  const openLeadModal = (lead?: Lead) => {
    if (lead) {
      setEditingLead(lead);
      setLeadForm({
        fullName: lead.fullName, email: lead.email, phone: lead.phone || '',
        source: lead.source, matterType: lead.matterType || '', urgency: lead.urgency,
        notes: lead.notes, tags: lead.tags.join(', '),
      });
    } else {
      setEditingLead(null);
      setLeadForm({ fullName: '', email: '', phone: '', source: 'website', matterType: '', urgency: 'medium', notes: '', tags: '' });
    }
    setShowLeadModal(true);
  };

  const handleSaveLead = () => {
    if (!leadForm.fullName.trim() || !leadForm.email.trim()) return;
    const lead: Lead = {
      id: editingLead?.id || generateId('lead'),
      fullName: leadForm.fullName.trim(),
      email: leadForm.email.trim(),
      phone: leadForm.phone.trim() || undefined,
      source: leadForm.source,
      status: editingLead?.status || 'new',
      notes: leadForm.notes.trim(),
      matterType: leadForm.matterType.trim() || undefined,
      urgency: leadForm.urgency,
      tags: leadForm.tags.split(',').map(t => t.trim()).filter(Boolean),
      createdAt: editingLead?.createdAt || Date.now(),
      updatedAt: Date.now(),
    };
    saveLead(lead);
    setShowLeadModal(false);
    loadLeads();
  };

  const handleDeleteLead = (id: string) => {
    deleteLead(id);
    loadLeads();
  };

  const handleStatusChange = (id: string, status: LeadStatus) => {
    updateLeadStatus(id, status);
    loadLeads();
  };

  const handleScoreLead = async () => {
    setScoring(true);
    setScoreResult(null);
    try {
      const result = await scoreLead(scoreName, scoreSummary);
      setScoreResult(result);
    } finally {
      setScoring(false);
    }
  };

  // --- Pipeline Handlers ---
  const handleAdvanceStage = (leadId: string) => {
    advanceStage(leadId);
    loadPipeline();
  };

  const handleSaveRecord = () => {
    if (!recordForm.fullName.trim() || !recordForm.email.trim()) return;
    const record: ClientRecord = {
      leadId: generateId('client'),
      fullName: recordForm.fullName.trim(),
      email: recordForm.email.trim(),
      phone: recordForm.phone.trim() || undefined,
      stage: recordForm.stage,
      matterType: recordForm.matterType.trim(),
      assignedAttorney: recordForm.assignedAttorney.trim() || undefined,
      notes: recordForm.notes.trim(),
      retainerAmount: recordForm.retainerAmount ? parseFloat(recordForm.retainerAmount) : undefined,
      enteredAt: Date.now(),
      stageUpdatedAt: Date.now(),
    };
    saveClientRecord(record);
    setShowAddRecordModal(false);
    setRecordForm({ fullName: '', email: '', phone: '', matterType: '', stage: 'intake', assignedAttorney: '', notes: '', retainerAmount: '' });
    loadPipeline();
  };

  const handleAddNote = (leadId: string) => {
    if (!newNote.trim()) return;
    addClientNote(leadId, newNote.trim(), 'Attorney');
    setNewNote('');
    loadClientDetails(leadId);
  };

  const handleAddFollowUp = (leadId: string) => {
    if (!followUpForm.description.trim() || !followUpForm.dueDate) return;
    const fu: FollowUp = {
      id: generateId('fu'),
      leadId,
      type: followUpForm.type,
      description: followUpForm.description.trim(),
      dueDate: followUpForm.dueDate,
      completed: false,
      assignedTo: followUpForm.assignedTo.trim() || undefined,
      createdAt: Date.now(),
    };
    addFollowUp(fu);
    setFollowUpForm({ type: 'call', description: '', dueDate: '', assignedTo: '' });
    loadClientDetails(leadId);
    loadPipeline();
  };

  const handleCompleteFollowUp = (id: string, leadId: string) => {
    completeFollowUp(id);
    loadClientDetails(leadId);
    loadPipeline();
  };

  const handleGenerateRec = async (client: ClientRecord) => {
    setGeneratingRec(true);
    setFollowUpRec('');
    try {
      const rec = await generateFollowUpRecommendation(client.fullName, client.stage, client.notes);
      setFollowUpRec(rec);
    } finally {
      setGeneratingRec(false);
    }
  };

  const expandClient = (leadId: string) => {
    if (expandedClient === leadId) {
      setExpandedClient(null);
    } else {
      setExpandedClient(leadId);
      loadClientDetails(leadId);
      setNewNote('');
      setFollowUpForm({ type: 'call', description: '', dueDate: '', assignedTo: '' });
      setFollowUpRec('');
    }
  };

  // --- Campaign Handlers ---
  const openCampaignModal = (campaign?: Campaign) => {
    if (campaign) {
      setEditingCampaign(campaign);
      setCampaignForm({
        name: campaign.name, type: campaign.type, targetAudience: campaign.targetAudience,
        subject: campaign.subject || '', message: campaign.message, scheduledAt: campaign.scheduledAt || '',
      });
    } else {
      setEditingCampaign(null);
      setCampaignForm({ name: '', type: 'email', targetAudience: '', subject: '', message: '', scheduledAt: '' });
    }
    setShowCampaignModal(true);
  };

  const handleSaveCampaign = (activate: boolean) => {
    if (!campaignForm.name.trim()) return;
    const campaign: Campaign = {
      id: editingCampaign?.id || generateId('camp'),
      name: campaignForm.name.trim(),
      type: campaignForm.type,
      status: activate ? 'active' : 'draft',
      targetAudience: campaignForm.targetAudience.trim(),
      message: campaignForm.message.trim(),
      subject: campaignForm.subject.trim() || undefined,
      scheduledAt: campaignForm.scheduledAt || undefined,
      sentCount: editingCampaign?.sentCount || 0,
      openedCount: editingCampaign?.openedCount || 0,
      convertedCount: editingCampaign?.convertedCount || 0,
      createdAt: editingCampaign?.createdAt || Date.now(),
      updatedAt: Date.now(),
    };
    saveCampaign(campaign);
    setShowCampaignModal(false);
    loadCampaigns();
  };

  const handleGenerateContent = async () => {
    setGeneratingContent(true);
    try {
      const content = await generateCampaignContent(campaignForm.type, campaignForm.targetAudience, 'the firm');
      setCampaignForm(prev => ({ ...prev, message: content }));
    } finally {
      setGeneratingContent(false);
    }
  };

  const handleDeleteCampaign = (id: string) => {
    deleteCampaign(id);
    loadCampaigns();
  };

  const handleToggleCampaignStatus = (campaign: Campaign) => {
    const newStatus: CampaignStatus = campaign.status === 'active' ? 'paused' : 'active';
    saveCampaign({ ...campaign, status: newStatus, updatedAt: Date.now() });
    loadCampaigns();
  };

  // --- Form Handlers ---
  const openFormModal = (template?: IntakeFormTemplate) => {
    if (template) {
      setEditingForm(template);
      setFormForm({
        name: template.name, description: template.description,
        notificationEmail: template.notificationEmail || '', redirectUrl: template.redirectUrl || '',
        fields: template.fields.map(f => ({ ...f })),
      });
    } else {
      setEditingForm(null);
      setFormForm({ name: '', description: '', notificationEmail: '', redirectUrl: '', fields: [] });
    }
    setShowFormModal(true);
  };

  const handleAddField = () => {
    setFormForm(prev => ({
      ...prev,
      fields: [...prev.fields, { label: '', type: 'text', required: false }],
    }));
  };

  const handleRemoveField = (idx: number) => {
    setFormForm(prev => ({
      ...prev,
      fields: prev.fields.filter((_, i) => i !== idx),
    }));
  };

  const handleUpdateField = (idx: number, updates: Partial<typeof formForm.fields[number]>) => {
    setFormForm(prev => ({
      ...prev,
      fields: prev.fields.map((f, i) => i === idx ? { ...f, ...updates } as typeof f : f),
    }));
  };

  const handleSaveForm = () => {
    if (!formForm.name.trim()) return;
    const id = editingForm?.id || generateId('form');
    const embedCode = generateEmbedCode(id, 'default');
    const template: IntakeFormTemplate = {
      id,
      name: formForm.name.trim(),
      description: formForm.description.trim(),
      fields: formForm.fields as IntakeFormTemplate['fields'],
      embedCode,
      redirectUrl: formForm.redirectUrl.trim() || undefined,
      notificationEmail: formForm.notificationEmail.trim() || undefined,
      createdAt: editingForm?.createdAt || Date.now(),
    };
    saveFormTemplate(template);
    setShowFormModal(false);
    loadForms();
  };

  const handleDeleteForm = (id: string) => {
    deleteFormTemplate(id);
    loadForms();
  };

  const handleCopyEmbed = async (code: string, id: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      // clipboard not available
    }
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white font-serif">Growth Dashboard</h1>
          <p className="text-slate-400 text-sm mt-1">Marketing, CRM pipeline, and client acquisition</p>
        </div>
        <div className="flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-gold-500" />
          <span className="text-gold-400 font-semibold text-sm">Growth Hub</span>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-900 border border-slate-800 rounded-xl p-1 w-fit">
        {TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === tab.key
                ? 'bg-slate-800 text-gold-400 border border-gold-500/20'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
            }`}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* ───────────────────────────── TAB: LEADS ───────────────────────────── */}
      {activeTab === 'leads' && (
        <div className="space-y-6">
          {/* Stats Row */}
          <div className="grid grid-cols-4 gap-4">
            {[
              { label: 'Total Leads', value: leadStats.total, icon: Users, color: 'text-blue-400' },
              { label: 'New', value: leadStats.new, icon: Zap, color: 'text-blue-400' },
              { label: 'Qualified', value: leadStats.qualified, icon: CheckCircle2, color: 'text-amber-400' },
              { label: 'Conversion Rate', value: `${leadStats.conversionRate}%`, icon: TrendingUp, color: 'text-green-400' },
            ].map(card => (
              <div key={card.label} className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex items-center gap-3">
                <div className={`w-10 h-10 rounded-lg bg-slate-800 flex items-center justify-center ${card.color}`}>
                  <card.icon className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-slate-400 text-xs">{card.label}</div>
                  <div className="text-white text-xl font-bold">{card.value}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Controls */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2 bg-slate-900 border border-slate-800 rounded-lg px-3 py-2">
              <Search className="w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search leads..."
                value={leadSearch}
                onChange={e => setLeadSearch(e.target.value)}
                className="bg-transparent text-white text-sm outline-none w-48 placeholder-slate-500"
              />
            </div>
            <div className="flex items-center gap-2 bg-slate-900 border border-slate-800 rounded-lg px-3 py-2">
              <Filter className="w-4 h-4 text-slate-400" />
              <select
                value={leadFilter}
                onChange={e => setLeadFilter(e.target.value)}
                className="bg-transparent text-white text-sm outline-none"
              >
                <option value="all">All Status</option>
                {LEAD_STATUSES.map(s => (
                  <option key={s} value={s} className="bg-slate-900">{s.charAt(0).toUpperCase() + s.slice(1)}</option>
                ))}
              </select>
            </div>
            <div className="flex-1" />
            <button
              onClick={() => openLeadModal()}
              className="flex items-center gap-2 bg-gold-500/10 border border-gold-500/30 text-gold-400 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gold-500/20 transition-all"
            >
              <Plus className="w-4 h-4" />
              Add Lead
            </button>
          </div>

          {/* Lead Table */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400 text-xs uppercase tracking-wider">
                    <th className="text-left p-3 pl-4">Name</th>
                    <th className="text-left p-3">Email</th>
                    <th className="text-left p-3">Source</th>
                    <th className="text-left p-3">Status</th>
                    <th className="text-left p-3">Urgency</th>
                    <th className="text-left p-3">Created</th>
                    <th className="text-right p-3 pr-4">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredLeads.length === 0 && (
                    <tr>
                      <td colSpan={7} className="text-center text-slate-500 py-12">
                        <Users className="w-8 h-8 mx-auto mb-2 opacity-50" />
                        No leads found
                      </td>
                    </tr>
                  )}
                  {filteredLeads.map(lead => {
                    const sBadge = leadStatusBadge(lead.status);
                    const srcBadge = leadSourceBadge(lead.source);
                    const urgBadge = urgencyBadge(lead.urgency);
                    return (
                      <tr key={lead.id} className="border-b border-slate-800/50 hover:bg-slate-800/40 transition-colors">
                        <td className="p-3 pl-4 text-white font-medium">{lead.fullName}</td>
                        <td className="p-3 text-slate-400">{lead.email}</td>
                        <td className="p-3">
                          <span className={`text-xs px-2 py-0.5 rounded-full border ${srcBadge.bg} ${srcBadge.text}`}>
                            {srcBadge.label}
                          </span>
                        </td>
                        <td className="p-3">
                          <span className={`text-xs px-2 py-0.5 rounded-full border ${sBadge.bg} ${sBadge.text}`}>
                            {sBadge.label}
                          </span>
                        </td>
                        <td className="p-3">
                          <span className={`text-xs px-2 py-0.5 rounded-full border ${urgBadge.bg} ${urgBadge.text}`}>
                            {urgBadge.label}
                          </span>
                        </td>
                        <td className="p-3 text-slate-400">{formatDate(lead.createdAt)}</td>
                        <td className="p-3 pr-4">
                          <div className="flex items-center justify-end gap-1">
                            <button onClick={() => openLeadModal(lead)} className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors" title="Edit">
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                            <button onClick={() => handleDeleteLead(lead.id)} className="p-1.5 rounded-lg hover:bg-red-900/30 text-slate-400 hover:text-red-400 transition-colors" title="Delete">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                            <select
                              value={lead.status}
                              onChange={e => handleStatusChange(lead.id, e.target.value as LeadStatus)}
                              className="bg-slate-800 border border-slate-700 rounded-lg text-xs text-slate-300 px-2 py-1 outline-none ml-1"
                            >
                              {LEAD_STATUSES.map(s => (
                                <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
                              ))}
                            </select>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* AI Lead Scoring */}
          <div className="bg-slate-900 border border-gold-500/20 rounded-xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 rounded-lg bg-gold-500/10 flex items-center justify-center">
                <Target className="w-4 h-4 text-gold-500" />
              </div>
              <h3 className="text-lg font-semibold text-white">AI Lead Scoring</h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-3">
                <input
                  type="text"
                  placeholder="Lead name"
                  value={scoreName}
                  onChange={e => setScoreName(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-gold-500/50 placeholder-slate-500"
                />
                <textarea
                  placeholder="Describe the potential matter in detail..."
                  value={scoreSummary}
                  onChange={e => setScoreSummary(e.target.value)}
                  rows={3}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-gold-500/50 placeholder-slate-500 resize-none"
                />
                <button
                  onClick={handleScoreLead}
                  disabled={scoring}
                  className="flex items-center gap-2 bg-gold-500/10 border border-gold-500/30 text-gold-400 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gold-500/20 transition-all disabled:opacity-50"
                >
                  {scoring ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                  Score Lead
                </button>
              </div>
              <div>
                {scoreResult ? (
                  <div className="bg-slate-800 rounded-xl p-4 space-y-3">
                    <div className="flex items-center gap-3">
                      <div className="relative w-16 h-16 flex items-center justify-center">
                        <svg className="w-16 h-16 -rotate-90" viewBox="0 0 64 64">
                          <circle cx="32" cy="32" r="28" fill="none" stroke="currentColor" strokeWidth="4" className="text-slate-700" />
                          <circle
                            cx="32" cy="32" r="28" fill="none"
                            stroke={scoreResult.score >= 70 ? '#22c55e' : scoreResult.score >= 40 ? '#f59e0b' : '#ef4444'}
                            strokeWidth="4" strokeLinecap="round"
                            strokeDasharray={`${(scoreResult.score / 100) * 175.93} 175.93`}
                          />
                        </svg>
                        <span className="absolute text-lg font-bold text-white">{scoreResult.score}</span>
                      </div>
                      <div>
                        <div className="text-sm font-semibold text-white">{scoreResult.suggestedDepartment}</div>
                        <div className={`text-xs font-medium ${
                          scoreResult.score >= 70 ? 'text-green-400' : scoreResult.score >= 40 ? 'text-amber-400' : 'text-red-400'
                        }`}>
                          {scoreResult.score >= 70 ? 'High Value' : scoreResult.score >= 40 ? 'Moderate' : 'Low Priority'}
                        </div>
                      </div>
                    </div>
                    <p className="text-slate-300 text-sm leading-relaxed">{scoreResult.recommendation}</p>
                  </div>
                ) : (
                  <div className="bg-slate-800 rounded-xl p-4 flex items-center justify-center h-full min-h-[120px]">
                    <p className="text-slate-500 text-sm">Enter lead details and click Score Lead to see AI analysis</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────────────── TAB: PIPELINE ──────────────────────────── */}
      {activeTab === 'pipeline' && (
        <div className="space-y-6">
          {/* Pipeline Stats Bar */}
          {pipelineStats && (
            <div className="grid grid-cols-4 gap-4">
              {[
                { label: 'Active Clients', value: pipelineStats.activeCount, icon: Users, color: 'text-blue-400' },
                { label: 'Closed', value: pipelineStats.closedCount, icon: CheckCircle2, color: 'text-green-400' },
                { label: 'Conversion Rate', value: `${pipelineStats.conversionRate}%`, icon: TrendingUp, color: 'text-gold-400' },
                { label: 'Avg Days to Close', value: pipelineStats.total > 0 ? `${Math.round(pipeline.reduce((sum, c) => sum + daysSince(c.enteredAt), 0) / pipelineStats.total)}d` : '-', icon: Clock, color: 'text-purple-400' },
              ].map(card => (
                <div key={card.label} className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-lg bg-slate-800 flex items-center justify-center ${card.color}`}>
                    <card.icon className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-slate-400 text-xs">{card.label}</div>
                    <div className="text-white text-xl font-bold">{card.value}</div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Action Bar */}
          <div className="flex items-center gap-3">
            <div className="flex-1" />
            <button
              onClick={() => {
                setRecordForm({ fullName: '', email: '', phone: '', matterType: '', stage: 'intake', assignedAttorney: '', notes: '', retainerAmount: '' });
                setShowAddRecordModal(true);
              }}
              className="flex items-center gap-2 bg-gold-500/10 border border-gold-500/30 text-gold-400 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gold-500/20 transition-all"
            >
              <UserPlus className="w-4 h-4" />
              Add Client Record
            </button>
          </div>

          {/* Kanban Board */}
          <div className="overflow-x-auto pb-4">
            <div className="flex gap-3" style={{ minWidth: '1400px' }}>
              {PIPELINE_STAGES.map(stage => {
                const stageCards = pipeline.filter(r => r.stage === stage);
                return (
                  <div key={stage} className={`flex-shrink-0 w-[220px] bg-slate-900/60 border border-slate-700/50 rounded-xl ${STAGE_COLORS[stage]} border-t-2`}>
                    <div className="p-3 border-b border-slate-800/50">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-semibold text-white">{STAGE_LABELS[stage]}</span>
                        <span className="text-xs text-slate-400 bg-slate-800 px-2 py-0.5 rounded-full">{stageCards.length}</span>
                      </div>
                    </div>
                    <div className="p-2 space-y-2 max-h-[500px] overflow-y-auto">
                      {stageCards.length === 0 && (
                        <div className="text-center text-slate-500 text-xs py-6 italic">No clients</div>
                      )}
                      {stageCards.map(record => {
                        const isExpanded = expandedClient === record.leadId;
                        return (
                          <div key={record.leadId}>
                            <div
                              onClick={() => expandClient(record.leadId)}
                              className="bg-slate-800/80 border border-slate-700/50 rounded-lg p-3 cursor-pointer hover:border-slate-600 transition-all"
                            >
                              <div className="text-white text-sm font-medium truncate">{record.fullName}</div>
                              <div className="text-slate-400 text-xs mt-0.5 truncate">{record.matterType}</div>
                              <div className="flex items-center justify-between mt-2">
                                <span className="text-slate-500 text-xs flex items-center gap-1">
                                  <Clock className="w-3 h-3" />
                                  {daysSince(record.stageUpdatedAt)}d
                                </span>
                                {record.assignedAttorney && (
                                  <span className="text-slate-500 text-xs truncate max-w-[100px]">{record.assignedAttorney}</span>
                                )}
                              </div>
                              <div className="flex items-center gap-1 mt-2">
                                <button
                                  onClick={e => { e.stopPropagation(); handleAdvanceStage(record.leadId); }}
                                  disabled={stage === 'closed'}
                                  className="flex items-center gap-1 text-xs text-gold-400 hover:text-gold-300 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                                >
                                  <ChevronRight className="w-3 h-3" /> Advance
                                </button>
                              </div>
                            </div>

                            {/* Expanded Detail */}
                            {isExpanded && (
                              <div className="mt-2 bg-slate-800 border border-slate-700 rounded-lg p-3 space-y-3 text-sm">
                                <div className="space-y-1">
                                  <div className="text-slate-400 text-xs">Contact</div>
                                  <div className="text-white">{record.email}</div>
                                  {record.phone && <div className="text-slate-400">{record.phone}</div>}
                                </div>
                                <div className="space-y-1">
                                  <div className="text-slate-400 text-xs">Stage</div>
                                  <select
                                    value={record.stage}
                                    onChange={e => {
                                      const updated = { ...record, stage: e.target.value as CRMPipelineStage, stageUpdatedAt: Date.now() };
                                      saveClientRecord(updated);
                                      loadPipeline();
                                    }}
                                    className="bg-slate-900 border border-slate-700 rounded-lg text-xs text-white px-2 py-1 outline-none w-full"
                                  >
                                    {PIPELINE_STAGES.map(s => (
                                      <option key={s} value={s}>{STAGE_LABELS[s]}</option>
                                    ))}
                                  </select>
                                </div>

                                {/* Notes */}
                                <div>
                                  <div className="text-slate-400 text-xs mb-1">Notes</div>
                                  <div className="space-y-1 max-h-[100px] overflow-y-auto">
                                    {clientNotes.length === 0 && <div className="text-slate-500 text-xs italic">No notes</div>}
                                    {clientNotes.map(note => (
                                      <div key={note.id} className="bg-slate-900 rounded-lg px-2 py-1">
                                        <div className="text-slate-300 text-xs">{note.content}</div>
                                        <div className="text-slate-500 text-[10px] mt-0.5">{note.author} · {formatDate(note.createdAt)}</div>
                                      </div>
                                    ))}
                                  </div>
                                  <div className="flex gap-1 mt-1">
                                    <input
                                      type="text"
                                      placeholder="Add note..."
                                      value={newNote}
                                      onChange={e => setNewNote(e.target.value)}
                                      onKeyDown={e => e.key === 'Enter' && handleAddNote(record.leadId)}
                                      className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-white text-xs outline-none placeholder-slate-500"
                                    />
                                    <button onClick={() => handleAddNote(record.leadId)} className="text-gold-400 text-xs hover:text-gold-300">Add</button>
                                  </div>
                                </div>

                                {/* Follow-ups */}
                                <div>
                                  <div className="text-slate-400 text-xs mb-1">Follow-ups</div>
                                  <div className="space-y-1 max-h-[120px] overflow-y-auto">
                                    {clientFollowUps.filter(f => f.leadId === record.leadId).length === 0 && (
                                      <div className="text-slate-500 text-xs italic">No follow-ups</div>
                                    )}
                                    {clientFollowUps.filter(f => f.leadId === record.leadId).map(fu => {
                                      const isOverdue = !fu.completed && new Date(fu.dueDate) < new Date();
                                      return (
                                        <div key={fu.id} className={`rounded-lg px-2 py-1.5 flex items-center justify-between ${isOverdue ? 'bg-red-900/20 border border-red-800/30' : 'bg-slate-900'}`}>
                                          <div className="flex items-center gap-1.5 min-w-0">
                                            <span className={isOverdue ? 'text-red-400' : 'text-slate-400'}>{FOLLOWUP_TYPE_ICONS[fu.type]}</span>
                                            <span className={`text-xs truncate ${isOverdue ? 'text-red-300' : 'text-slate-300'}`}>{fu.description}</span>
                                          </div>
                                          {!fu.completed && (
                                            <button
                                              onClick={() => handleCompleteFollowUp(fu.id, record.leadId)}
                                              className="text-green-400 hover:text-green-300 text-xs shrink-0 ml-2"
                                            >
                                              Done
                                            </button>
                                          )}
                                        </div>
                                      );
                                    })}
                                  </div>
                                  <div className="mt-1 space-y-1">
                                    <div className="flex gap-1">
                                      <select
                                        value={followUpForm.type}
                                        onChange={e => setFollowUpForm(prev => ({ ...prev, type: e.target.value as FollowUpType }))}
                                        className="bg-slate-900 border border-slate-700 rounded-lg text-xs text-white px-1 py-1 outline-none"
                                      >
                                        {FOLLOWUP_TYPES.map(t => (
                                          <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
                                        ))}
                                      </select>
                                      <input
                                        type="date"
                                        value={followUpForm.dueDate}
                                        onChange={e => setFollowUpForm(prev => ({ ...prev, dueDate: e.target.value }))}
                                        className="bg-slate-900 border border-slate-700 rounded-lg text-xs text-white px-1 py-1 outline-none w-[90px]"
                                      />
                                    </div>
                                    <div className="flex gap-1">
                                      <input
                                        type="text"
                                        placeholder="Description..."
                                        value={followUpForm.description}
                                        onChange={e => setFollowUpForm(prev => ({ ...prev, description: e.target.value }))}
                                        className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-white text-xs outline-none placeholder-slate-500"
                                      />
                                      <button onClick={() => handleAddFollowUp(record.leadId)} className="text-gold-400 text-xs hover:text-gold-300">
                                        Add
                                      </button>
                                    </div>
                                  </div>

                                  {/* AI Follow-Up Recommendation */}
                                  {followUpRec && (
                                    <div className="mt-2 bg-gold-500/5 border border-gold-500/10 rounded-lg p-2">
                                      <div className="flex items-center gap-1 mb-1">
                                        <Zap className="w-3 h-3 text-gold-400" />
                                        <span className="text-gold-400 text-xs font-medium">AI Suggestion</span>
                                      </div>
                                      <p className="text-slate-300 text-xs">{followUpRec}</p>
                                    </div>
                                  )}
                                  <button
                                    onClick={() => handleGenerateRec(record)}
                                    disabled={generatingRec}
                                    className="flex items-center gap-1 text-xs text-gold-400 hover:text-gold-300 transition-colors mt-1 disabled:opacity-50"
                                  >
                                    {generatingRec ? <Loader2 className="w-3 h-3 animate-spin" /> : <Zap className="w-3 h-3" />}
                                    AI Follow-Up
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Overdue follow-ups alert */}
          {overdueFollowUps.length > 0 && (
            <div className="bg-red-900/20 border border-red-800/30 rounded-xl p-4">
              <div className="flex items-center gap-2 text-red-400 font-semibold text-sm mb-2">
                <AlertTriangle className="w-4 h-4" />
                {overdueFollowUps.length} Overdue Follow-Up{overdueFollowUps.length > 1 ? 's' : ''}
              </div>
              <div className="space-y-1">
                {overdueFollowUps.slice(0, 5).map(fu => (
                  <div key={fu.id} className="text-red-300 text-xs flex items-center gap-2">
                    {FOLLOWUP_TYPE_ICONS[fu.type]}
                    <span>{fu.description}</span>
                    <span className="text-red-500">— Due {formatDate(new Date(fu.dueDate).getTime())}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ───────────────────────── TAB: CAMPAIGNS ───────────────────────────── */}
      {activeTab === 'campaigns' && (
        <div className="space-y-6">
          <div className="flex items-center gap-3">
            <div className="flex-1" />
            <button
              onClick={() => openCampaignModal()}
              className="flex items-center gap-2 bg-gold-500/10 border border-gold-500/30 text-gold-400 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gold-500/20 transition-all"
            >
              <Plus className="w-4 h-4" />
              New Campaign
            </button>
          </div>

          {campaigns.length === 0 && (
            <div className="text-center text-slate-500 py-16">
              <Send className="w-10 h-10 mx-auto mb-3 opacity-50" />
              <p className="text-sm">No campaigns yet. Create your first marketing campaign.</p>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {campaigns.map(campaign => {
              const tBadge = campaignTypeBadge(campaign.type);
              const sBadge = campaignStatusBadge(campaign.status);
              return (
                <div key={campaign.id} className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-3 hover:border-slate-700 transition-colors">
                  <div className="flex items-start justify-between">
                    <div>
                      <h4 className="text-white font-semibold">{campaign.name}</h4>
                      <div className="flex items-center gap-2 mt-1">
                        <span className={`text-xs px-2 py-0.5 rounded-full border ${tBadge.bg} ${tBadge.text}`}>
                          {tBadge.label}
                        </span>
                        <span className={`text-xs px-2 py-0.5 rounded-full border ${sBadge.bg} ${sBadge.text}`}>
                          {sBadge.label}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <button onClick={() => openCampaignModal(campaign)} className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors">
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => handleDeleteCampaign(campaign.id)} className="p-1.5 rounded-lg hover:bg-red-900/30 text-slate-400 hover:text-red-400 transition-colors">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {campaign.subject && (
                    <div className="text-slate-300 text-sm bg-slate-800 rounded-lg px-3 py-2 truncate">
                      <span className="text-slate-500 text-xs">Subject: </span>
                      {campaign.subject}
                    </div>
                  )}
                  <p className="text-slate-400 text-sm line-clamp-2">{campaign.message}</p>

                  {/* Stats */}
                  <div className="flex items-center gap-4 text-xs pt-3 border-t border-slate-800/50">
                    <div className="flex items-center gap-1 text-slate-400">
                      <Send className="w-3 h-3" /> {campaign.sentCount}
                    </div>
                    <div className="flex items-center gap-1 text-blue-400">
                      <Eye className="w-3 h-3" /> {campaign.openedCount}
                    </div>
                    <div className="flex items-center gap-1 text-green-400">
                      <CheckCircle2 className="w-3 h-3" /> {campaign.convertedCount}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 pt-2 border-t border-slate-800/50">
                    {campaign.status === 'draft' ? (
                      <button
                        onClick={() => {
                          saveCampaign({ ...campaign, status: 'active', updatedAt: Date.now() });
                          loadCampaigns();
                        }}
                        className="flex-1 bg-green-500/10 border border-green-500/30 text-green-400 px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-green-500/20 transition-all text-center"
                      >
                        Activate
                      </button>
                    ) : (
                      <button
                        onClick={() => handleToggleCampaignStatus(campaign)}
                        className={`flex-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-all text-center ${
                          campaign.status === 'active'
                            ? 'bg-amber-500/10 border border-amber-500/30 text-amber-400 hover:bg-amber-500/20'
                            : 'bg-blue-500/10 border border-blue-500/30 text-blue-400 hover:bg-blue-500/20'
                        }`}
                      >
                        {campaign.status === 'active' ? 'Pause' : 'Resume'}
                      </button>
                    )}
                    {campaign.scheduledAt && (
                      <div className="text-slate-500 text-xs flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {new Date(campaign.scheduledAt).toLocaleDateString()}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ──────────────────────────── TAB: FORMS ────────────────────────────── */}
      {activeTab === 'forms' && (
        <div className="space-y-6">
          <div className="flex items-center gap-3">
            <div className="flex-1" />
            <button
              onClick={() => openFormModal()}
              className="flex items-center gap-2 bg-gold-500/10 border border-gold-500/30 text-gold-400 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gold-500/20 transition-all"
            >
              <Plus className="w-4 h-4" />
              Create Form
            </button>
          </div>

          {formTemplates.length === 0 && (
            <div className="text-center text-slate-500 py-16">
              <Code className="w-10 h-10 mx-auto mb-3 opacity-50" />
              <p className="text-sm">No intake form templates yet. Create one to embed on your website.</p>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {formTemplates.map(template => (
              <div key={template.id} className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-3 hover:border-slate-700 transition-colors">
                <div className="flex items-start justify-between">
                  <div>
                    <h4 className="text-white font-semibold">{template.name}</h4>
                    <p className="text-slate-400 text-sm mt-0.5">{template.description}</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => openFormModal(template)} className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors">
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => handleDeleteForm(template.id)} className="p-1.5 rounded-lg hover:bg-red-900/30 text-slate-400 hover:text-red-400 transition-colors">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <div className="flex items-center gap-2 text-xs text-slate-400">
                  <span className="bg-slate-800 px-2 py-0.5 rounded-full">{template.fields.length} fields</span>
                  {template.notificationEmail && <span className="text-slate-500">Notifies: {template.notificationEmail}</span>}
                </div>

                {/* Embed code toggle */}
                <div>
                  <button
                    onClick={() => setShowEmbedCode(showEmbedCode === template.id ? null : template.id)}
                    className="flex items-center gap-1.5 text-sm text-gold-400 hover:text-gold-300 transition-colors"
                  >
                    <Code className="w-3.5 h-3.5" />
                    {showEmbedCode === template.id ? 'Hide Embed' : 'Show Embed'}
                  </button>
                  {showEmbedCode === template.id && (
                    <div className="mt-2 bg-slate-950 rounded-lg border border-slate-700 overflow-hidden">
                      <div className="flex items-center justify-between px-3 py-1.5 bg-slate-800 border-b border-slate-700">
                        <span className="text-xs text-slate-400">Embed Code</span>
                        <button
                          onClick={() => handleCopyEmbed(template.embedCode, template.id)}
                          className="flex items-center gap-1 text-xs text-slate-400 hover:text-white transition-colors"
                        >
                          {copiedId === template.id ? <CheckCircle2 className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
                          {copiedId === template.id ? 'Copied!' : 'Copy'}
                        </button>
                      </div>
                      <pre className="p-3 text-xs text-slate-400 overflow-x-auto font-mono whitespace-pre-wrap">{template.embedCode}</pre>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ──────────────────────── LEAD MODAL ──────────────────────── */}
      {showLeadModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => setShowLeadModal(false)}>
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg p-6 space-y-4" onClick={e => e.stopPropagation()}>
            <h3 className="text-xl font-semibold text-white">{editingLead ? 'Edit Lead' : 'Add Lead'}</h3>
            <div className="space-y-3">
              <input type="text" placeholder="Full Name *" value={leadForm.fullName} onChange={e => setLeadForm(prev => ({ ...prev, fullName: e.target.value }))}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-gold-500/50 placeholder-slate-500" />
              <input type="email" placeholder="Email *" value={leadForm.email} onChange={e => setLeadForm(prev => ({ ...prev, email: e.target.value }))}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-gold-500/50 placeholder-slate-500" />
              <input type="text" placeholder="Phone" value={leadForm.phone} onChange={e => setLeadForm(prev => ({ ...prev, phone: e.target.value }))}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-gold-500/50 placeholder-slate-500" />
              <div className="grid grid-cols-2 gap-3">
                <select value={leadForm.source} onChange={e => setLeadForm(prev => ({ ...prev, source: e.target.value as LeadSource }))}
                  className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm outline-none">
                  {LEAD_SOURCES.map(s => <option key={s} value={s}>{s.replace('-', ' ').replace(/\b\w/g, c => c.toUpperCase())}</option>)}
                </select>
                <select value={leadForm.urgency} onChange={e => setLeadForm(prev => ({ ...prev, urgency: e.target.value as 'low' | 'medium' | 'high' }))}
                  className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm outline-none">
                  <option value="low">Low Urgency</option>
                  <option value="medium">Medium Urgency</option>
                  <option value="high">High Urgency</option>
                </select>
              </div>
              <input type="text" placeholder="Matter Type" value={leadForm.matterType} onChange={e => setLeadForm(prev => ({ ...prev, matterType: e.target.value }))}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-gold-500/50 placeholder-slate-500" />
              <textarea placeholder="Notes" value={leadForm.notes} onChange={e => setLeadForm(prev => ({ ...prev, notes: e.target.value }))} rows={2}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-gold-500/50 placeholder-slate-500 resize-none" />
              <input type="text" placeholder="Tags (comma separated)" value={leadForm.tags} onChange={e => setLeadForm(prev => ({ ...prev, tags: e.target.value }))}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-gold-500/50 placeholder-slate-500" />
            </div>
            <div className="flex gap-3 pt-2">
              <button onClick={() => setShowLeadModal(false)} className="flex-1 bg-slate-800 border border-slate-700 text-slate-300 px-4 py-2 rounded-lg text-sm hover:bg-slate-700 transition-colors">
                Cancel
              </button>
              <button onClick={handleSaveLead} className="flex-1 bg-gold-500/10 border border-gold-500/30 text-gold-400 px-4 py-2 rounded-lg text-sm hover:bg-gold-500/20 transition-colors">
                Save Lead
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────── ADD CLIENT RECORD MODAL ─────────────────── */}
      {showAddRecordModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => setShowAddRecordModal(false)}>
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg p-6 space-y-4" onClick={e => e.stopPropagation()}>
            <h3 className="text-xl font-semibold text-white">Add Client Record</h3>
            <div className="space-y-3">
              <input type="text" placeholder="Full Name *" value={recordForm.fullName} onChange={e => setRecordForm(prev => ({ ...prev, fullName: e.target.value }))}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-gold-500/50 placeholder-slate-500" />
              <input type="email" placeholder="Email *" value={recordForm.email} onChange={e => setRecordForm(prev => ({ ...prev, email: e.target.value }))}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-gold-500/50 placeholder-slate-500" />
              <input type="text" placeholder="Phone" value={recordForm.phone} onChange={e => setRecordForm(prev => ({ ...prev, phone: e.target.value }))}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-gold-500/50 placeholder-slate-500" />
              <input type="text" placeholder="Matter Type" value={recordForm.matterType} onChange={e => setRecordForm(prev => ({ ...prev, matterType: e.target.value }))}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-gold-500/50 placeholder-slate-500" />
              <select value={recordForm.stage} onChange={e => setRecordForm(prev => ({ ...prev, stage: e.target.value as CRMPipelineStage }))}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm outline-none">
                {PIPELINE_STAGES.map(s => <option key={s} value={s}>{STAGE_LABELS[s]}</option>)}
              </select>
              <input type="text" placeholder="Assigned Attorney" value={recordForm.assignedAttorney} onChange={e => setRecordForm(prev => ({ ...prev, assignedAttorney: e.target.value }))}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-gold-500/50 placeholder-slate-500" />
              <input type="number" placeholder="Retainer Amount ($)" value={recordForm.retainerAmount} onChange={e => setRecordForm(prev => ({ ...prev, retainerAmount: e.target.value }))}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-gold-500/50 placeholder-slate-500" />
              <textarea placeholder="Notes" value={recordForm.notes} onChange={e => setRecordForm(prev => ({ ...prev, notes: e.target.value }))} rows={2}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-gold-500/50 placeholder-slate-500 resize-none" />
            </div>
            <div className="flex gap-3 pt-2">
              <button onClick={() => setShowAddRecordModal(false)} className="flex-1 bg-slate-800 border border-slate-700 text-slate-300 px-4 py-2 rounded-lg text-sm hover:bg-slate-700 transition-colors">
                Cancel
              </button>
              <button onClick={handleSaveRecord} className="flex-1 bg-gold-500/10 border border-gold-500/30 text-gold-400 px-4 py-2 rounded-lg text-sm hover:bg-gold-500/20 transition-colors">
                Save Record
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────── CAMPAIGN MODAL ─────────────────── */}
      {showCampaignModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => setShowCampaignModal(false)}>
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg p-6 space-y-4" onClick={e => e.stopPropagation()}>
            <h3 className="text-xl font-semibold text-white">{editingCampaign ? 'Edit Campaign' : 'New Campaign'}</h3>
            <div className="space-y-3">
              <input type="text" placeholder="Campaign Name *" value={campaignForm.name} onChange={e => setCampaignForm(prev => ({ ...prev, name: e.target.value }))}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-gold-500/50 placeholder-slate-500" />
              <select value={campaignForm.type} onChange={e => setCampaignForm(prev => ({ ...prev, type: e.target.value as CampaignType }))}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm outline-none">
                {CAMPAIGN_TYPES.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
              </select>
              <input type="text" placeholder="Target Audience" value={campaignForm.targetAudience} onChange={e => setCampaignForm(prev => ({ ...prev, targetAudience: e.target.value }))}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-gold-500/50 placeholder-slate-500" />
              {campaignForm.type === 'email' && (
                <input type="text" placeholder="Subject Line" value={campaignForm.subject} onChange={e => setCampaignForm(prev => ({ ...prev, subject: e.target.value }))}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-gold-500/50 placeholder-slate-500" />
              )}
              <div className="relative">
                <textarea placeholder="Message / Content" value={campaignForm.message} onChange={e => setCampaignForm(prev => ({ ...prev, message: e.target.value }))} rows={4}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-gold-500/50 placeholder-slate-500 resize-none" />
                <button
                  onClick={handleGenerateContent}
                  disabled={generatingContent}
                  className="absolute bottom-2 right-2 flex items-center gap-1 bg-gold-500/10 border border-gold-500/30 text-gold-400 px-2 py-1 rounded-lg text-xs hover:bg-gold-500/20 transition-all disabled:opacity-50"
                >
                  {generatingContent ? <Loader2 className="w-3 h-3 animate-spin" /> : <Zap className="w-3 h-3" />}
                  Generate with AI
                </button>
              </div>
              <input type="date" value={campaignForm.scheduledAt} onChange={e => setCampaignForm(prev => ({ ...prev, scheduledAt: e.target.value }))}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-gold-500/50" />
            </div>
            <div className="flex gap-3 pt-2">
              <button onClick={() => setShowCampaignModal(false)} className="flex-1 bg-slate-800 border border-slate-700 text-slate-300 px-4 py-2 rounded-lg text-sm hover:bg-slate-700 transition-colors">
                Cancel
              </button>
              <button onClick={() => handleSaveCampaign(false)} className="flex-1 bg-slate-800 border border-slate-700 text-slate-300 px-4 py-2 rounded-lg text-sm hover:bg-slate-700 transition-colors">
                Save Draft
              </button>
              <button onClick={() => handleSaveCampaign(true)} className="flex-1 bg-gold-500/10 border border-gold-500/30 text-gold-400 px-4 py-2 rounded-lg text-sm hover:bg-gold-500/20 transition-colors">
                Activate
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────── FORM TEMPLATE MODAL ─────────────────── */}
      {showFormModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => setShowFormModal(false)}>
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl p-6 space-y-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <h3 className="text-xl font-semibold text-white">{editingForm ? 'Edit Form Template' : 'Create Form Template'}</h3>
            <div className="space-y-3">
              <input type="text" placeholder="Form Name *" value={formForm.name} onChange={e => setFormForm(prev => ({ ...prev, name: e.target.value }))}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-gold-500/50 placeholder-slate-500" />
              <textarea placeholder="Description" value={formForm.description} onChange={e => setFormForm(prev => ({ ...prev, description: e.target.value }))} rows={2}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-gold-500/50 placeholder-slate-500 resize-none" />
              <input type="email" placeholder="Notification Email" value={formForm.notificationEmail} onChange={e => setFormForm(prev => ({ ...prev, notificationEmail: e.target.value }))}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-gold-500/50 placeholder-slate-500" />
              <input type="url" placeholder="Redirect URL (after submit)" value={formForm.redirectUrl} onChange={e => setFormForm(prev => ({ ...prev, redirectUrl: e.target.value }))}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-gold-500/50 placeholder-slate-500" />

              {/* Fields Editor */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-slate-400 font-medium">Form Fields</span>
                  <button onClick={handleAddField} className="flex items-center gap-1 text-xs text-gold-400 hover:text-gold-300 transition-colors">
                    <Plus className="w-3 h-3" /> Add Field
                  </button>
                </div>
                {formForm.fields.length === 0 && (
                  <div className="text-center text-slate-500 text-xs py-4 border border-dashed border-slate-700 rounded-lg">
                    No fields yet. Add fields to build your intake form.
                  </div>
                )}
                <div className="space-y-2">
                  {formForm.fields.map((field, idx) => (
                    <div key={idx} className="bg-slate-800 border border-slate-700 rounded-lg p-3 space-y-2">
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          placeholder="Field Label"
                          value={field.label}
                          onChange={e => handleUpdateField(idx, { label: e.target.value })}
                          className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-white text-sm outline-none focus:border-gold-500/50 placeholder-slate-500"
                        />
                        <select
                          value={field.type}
                          onChange={e => handleUpdateField(idx, { type: e.target.value, options: e.target.value === 'select' ? field.options || [] : undefined })}                          className="bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-white text-xs outline-none"
                        >
                          {FIELD_TYPES.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
                        </select>
                        <label className="flex items-center gap-1 text-xs text-slate-400 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={field.required}
                            onChange={e => handleUpdateField(idx, { required: e.target.checked })}
                            className="rounded bg-slate-900 border-slate-700"
                          />
                          Req
                        </label>
                        <button onClick={() => handleRemoveField(idx)} className="text-slate-500 hover:text-red-400 transition-colors">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      {field.type === 'select' && (
                        <input
                          type="text"
                          placeholder="Options (comma separated)"
                          value={field.options?.join(', ') || ''}
                          onChange={e => handleUpdateField(idx, { options: e.target.value.split(',').map(o => o.trim()).filter(Boolean) })}
                          className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-white text-sm outline-none focus:border-gold-500/50 placeholder-slate-500"
                        />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex gap-3 pt-2">
              <button onClick={() => setShowFormModal(false)} className="flex-1 bg-slate-800 border border-slate-700 text-slate-300 px-4 py-2 rounded-lg text-sm hover:bg-slate-700 transition-colors">
                Cancel
              </button>
              <button onClick={handleSaveForm} className="flex-1 bg-gold-500/10 border border-gold-500/30 text-gold-400 px-4 py-2 rounded-lg text-sm hover:bg-gold-500/20 transition-colors">
                {editingForm ? 'Update' : 'Create'} Form
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default GrowthDashboard;
