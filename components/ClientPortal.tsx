import React, { useState, useEffect, useContext, useRef, useCallback } from 'react';
import { useLocation, Link } from 'react-router-dom';
import {
  Scale, Shield, User, Send, Paperclip, Loader2, CheckCircle2, AlertTriangle,
  Clock, MessageSquare, Upload, ArrowLeft, FileText, Trash2, Tag, Calendar, Check, AlertCircle, PhoneCall
} from 'lucide-react';
import { AppContext } from '../App';
import { deepseekChat } from '../services/deepseek';
import { pushNotification } from '../services/notificationManager';
import { toast } from 'react-toastify';
import { CaseMessage, CaseStatus } from '../types';

interface EvidenceItem {
  id: string;
  caseId: string;
  name: string;
  type: string;
  size: number;
  timestamp: number;
  summary: string;
  relevance: number;
  keyFacts: string[];
  concerns: string[];
  tags: string[];
  dataUrl?: string;
}

const ClientPortal: React.FC = () => {
  const { cases, activeCase, updateCase } = useContext(AppContext);
  const location = useLocation();
  const isAttorneyMode = location.pathname.startsWith('/app');

  // Authorization state
  const [selectedCase, setSelectedCase] = useState<any | null>(null);
  const [accessCode, setAccessCode] = useState('');
  const [isAuthorized, setIsAuthorized] = useState(false);

  // Chat/Messaging State
  const [messages, setMessages] = useState<CaseMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [typingAgent, setTypingAgent] = useState<string | null>(null);

  // Upload state
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Escalation state
  const [isEscalated, setIsEscalated] = useState(false);

  // Storage Keys
  const offlineKey = (caseId: string) => `warroom_msgs_${caseId}`;
  const evidenceKey = (caseId: string) => `evidence_${caseId}`;
  const escalatedKey = (caseId: string) => `escalated_${caseId}`;

  // Automatically authorize and set case if attorney is in simulation/preview mode
  useEffect(() => {
    if (isAttorneyMode && activeCase) {
      setSelectedCase(activeCase);
      setIsAuthorized(true);
    }
  }, [isAttorneyMode, activeCase]);

  // Load chat messages, evidence, and escalation status for the authorized case
  useEffect(() => {
    if (!selectedCase) return;

    // Load Escalated Status
    const escalated = localStorage.getItem(escalatedKey(selectedCase.id)) === 'true';
    setIsEscalated(escalated);

    // Load Messages
    try {
      const savedMsgs = localStorage.getItem(offlineKey(selectedCase.id));
      if (savedMsgs) {
        setMessages(JSON.parse(savedMsgs));
      } else {
        // Initialize with default Sierra welcome message if empty
        const welcomeMsg: CaseMessage = {
          id: `local-welcome-${Date.now()}`,
          created_at: new Date().toISOString(),
          thread_id: 'local',
          case_id: selectedCase.id,
          firm_id: 'default',
          sender_type: 'agent',
          sender_id: 'sierra',
          sender_name: 'Sierra',
          direction: 'agent_to_user',
          body: `Hello ${selectedCase.client || 'there'}! Welcome to your CaseBuddy Client Portal. I am Sierra, your dedicated Client Success Coordinator. How can we or our legal team assist you with "${selectedCase.title}" today?`,
          read: true,
          triggers_automation: false,
          automation_target: null,
          automation_status: 'none',
          automation_result: null,
          attachment_url: null,
          attachment_name: null,
          attachment_type: null,
          metadata: {},
        };
        const initial = [welcomeMsg];
        localStorage.setItem(offlineKey(selectedCase.id), JSON.stringify(initial));
        setMessages(initial);
      }
    } catch {
      setMessages([]);
    }
  }, [selectedCase]);

  // Save messages to local storage whenever they change
  const persistMessages = (updatedMsgs: CaseMessage[]) => {
    if (!selectedCase) return;
    localStorage.setItem(offlineKey(selectedCase.id), JSON.stringify(updatedMsgs));
    setMessages(updatedMsgs);
  };

  // Handle Client Login using sandbox / reference codes
  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    const code = accessCode.trim().toLowerCase();
    if (!code) {
      toast.error('Please enter an Access Code.');
      return;
    }

    // Lookup case based on Code
    // For sandbox usability, we accept Case ID, first 8 characters of ID, or client name matches
    const found = cases.find(
      c => c.id.toLowerCase() === code || 
           c.id.toLowerCase().startsWith(code) || 
           c.client.toLowerCase().includes(code)
    );

    if (found) {
      setSelectedCase(found);
      setIsAuthorized(true);
      toast.success(`Access granted. Welcome, ${found.client}!`);
    } else {
      toast.error('Invalid Client Access Code. Try using "case-1" or a client name.');
    }
  };

  // Human Escalation Action
  const triggerEscalation = () => {
    if (!selectedCase) return;

    localStorage.setItem(escalatedKey(selectedCase.id), 'true');
    setIsEscalated(true);

    // Add visual system message to chat thread
    const systemAlert: CaseMessage = {
      id: `local-sys-${Date.now()}`,
      created_at: new Date().toISOString(),
      thread_id: 'local',
      case_id: selectedCase.id,
      firm_id: 'default',
      sender_type: 'agent',
      sender_id: 'system',
      sender_name: 'System Alert',
      direction: 'agent_to_user',
      body: `⚠️ [SYSTEM ALERT]: Human attorney escalation requested. AI auto-replies are paused. Attorney Tom Bradley has been notified and will call you back shortly at your registered number.`,
      read: true,
      triggers_automation: false,
      automation_target: null,
      automation_status: 'none',
      automation_result: null,
      attachment_url: null,
      attachment_name: null,
      attachment_type: null,
      metadata: {},
    };

    persistMessages([...messages, systemAlert]);

    // Push notification to the Attorney Dashboard
    pushNotification({
      agentId: 'sierra',
      caseId: selectedCase.id,
      caseTitle: selectedCase.title,
      type: 'warning',
      priority: 'critical',
      title: 'CRITICAL: Urgent Human Escalation',
      message: `Client ${selectedCase.client} has requested urgent human contact on case "${selectedCase.title}". AI automation is temporarily suspended.`,
    });

    toast.warning('Case escalated to lead attorney. AI responses are now paused.');
  };

  // Resolve Human Escalation (Attorney only action)
  const resolveEscalation = () => {
    if (!selectedCase) return;

    localStorage.removeItem(escalatedKey(selectedCase.id));
    setIsEscalated(false);

    const systemAlert: CaseMessage = {
      id: `local-sys-${Date.now()}`,
      created_at: new Date().toISOString(),
      thread_id: 'local',
      case_id: selectedCase.id,
      firm_id: 'default',
      sender_type: 'agent',
      sender_id: 'system',
      sender_name: 'System Alert',
      direction: 'agent_to_user',
      body: `✅ [SYSTEM ALERT]: Lead Attorney Tom Bradley has resolved the escalation. AI support is active.`,
      read: true,
      triggers_automation: false,
      automation_target: null,
      automation_status: 'none',
      automation_result: null,
      attachment_url: null,
      attachment_name: null,
      attachment_type: null,
      metadata: {},
    };

    persistMessages([...messages, systemAlert]);
    toast.success('Escalation resolved. AI assistance re-enabled.');
  };

  // Send Message logic
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if (!text || sending) return;

    setInput('');
    setSending(true);

    const userMsg: CaseMessage = {
      id: `local-${Date.now()}-u`,
      created_at: new Date().toISOString(),
      thread_id: 'local',
      case_id: selectedCase.id,
      firm_id: 'default',
      sender_type: 'user',
      sender_id: 'client',
      sender_name: selectedCase.client,
      direction: 'user_to_agent',
      body: text,
      read: true,
      triggers_automation: true,
      automation_target: 'sierra',
      automation_status: 'queued',
      automation_result: null,
      attachment_url: null,
      attachment_name: null,
      attachment_type: null,
      metadata: {},
    };

    const currentMsgs = [...messages, userMsg];
    persistMessages(currentMsgs);

    // If case is escalated, AI will NOT reply. The message stays for human attorney review.
    if (isEscalated) {
      setSending(false);
      return;
    }

    // Trigger AI response (Sierra as the portal agent)
    setTypingAgent('sierra');
    try {
      const caseCtx = `Case Title: ${selectedCase.title}\nClient: ${selectedCase.client}\nSummary: ${selectedCase.summary}\nNext Court Date: ${selectedCase.nextCourtDate}`;
      const systemInstruction = `You are Sierra, the Client Success Coordinator at CaseBuddy Law Firm. Your job is to support the client, coordinate updates, answer basic operational questions, and reassure them. Keep your response brief, warm, professional, and limited to 2-3 sentences.
      
      Client message history: ${currentMsgs.slice(-5).map(m => `${m.sender_name}: ${m.body}`).join('\n')}
      
      Case Context:
      ${caseCtx}`;

      const reply = await deepseekChat({
        systemInstruction,
        messages: [{ role: 'user', content: text }],
        temperature: 0.6,
        maxTokens: 500,
        timeoutMs: 30_000,
      });

      const agentMsg: CaseMessage = {
        id: `local-${Date.now()}-a`,
        created_at: new Date().toISOString(),
        thread_id: 'local',
        case_id: selectedCase.id,
        firm_id: 'default',
        sender_type: 'agent',
        sender_id: 'sierra',
        sender_name: 'Sierra',
        direction: 'agent_to_user',
        body: reply,
        read: true,
        triggers_automation: false,
        automation_target: null,
        automation_status: 'none',
        automation_result: null,
        attachment_url: null,
        attachment_name: null,
        attachment_type: null,
        metadata: {},
      };

      persistMessages([...currentMsgs, agentMsg]);
    } catch {
      const errMsg: CaseMessage = {
        id: `local-${Date.now()}-e`,
        created_at: new Date().toISOString(),
        thread_id: 'local',
        case_id: selectedCase.id,
        firm_id: 'default',
        sender_type: 'agent',
        sender_id: 'sierra',
        sender_name: 'Sierra',
        direction: 'agent_to_user',
        body: `Thank you for your message! I'm reviewing this with attorney Tom Bradley, and we will update you shortly.`,
        read: true,
        triggers_automation: false,
        automation_target: null,
        automation_status: 'none',
        automation_result: null,
        attachment_url: null,
        attachment_name: null,
        attachment_type: null,
        metadata: {},
      };
      persistMessages([...currentMsgs, errMsg]);
    } finally {
      setTypingAgent(null);
      setSending(false);
    }
  };

  // Secure Evidence Upload Simulation
  const handleUploadClick = () => {
    fileRef.current?.click();
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedCase) return;

    if (file.size > 20 * 1024 * 1024) {
      toast.error('Files must be under 20MB for portal upload.');
      return;
    }

    setUploading(true);
    toast.info(`Uploading & scanning "${file.name}"...`);

    try {
      const reader = new FileReader();
      const dataUrl = await new Promise<string>(resolve => {
        reader.onloadend = () => resolve(reader.result as string);
        reader.readAsDataURL(file);
      });

      // Get existing evidence items
      const existingKey = evidenceKey(selectedCase.id);
      const savedEvidenceRaw = localStorage.getItem(existingKey);
      const currentEvidence: EvidenceItem[] = savedEvidenceRaw ? JSON.parse(savedEvidenceRaw) : [];

      const newEvidence: EvidenceItem = {
        id: `ev-${Date.now()}`,
        caseId: selectedCase.id,
        name: file.name,
        type: file.type || 'application/octet-stream',
        size: file.size,
        timestamp: Date.now(),
        summary: `Document uploaded securely by Client ${selectedCase.client} via Client Portal. Clean virus scan verified.`,
        relevance: 80,
        keyFacts: ['Uploaded via client portal', `Mime-Type: ${file.type}`],
        concerns: [],
        tags: ['client-portal', 'pending-review'],
        dataUrl,
      };

      localStorage.setItem(existingKey, JSON.stringify([newEvidence, ...currentEvidence]));

      // Insert message in chat
      const uploadSuccessMsg: CaseMessage = {
        id: `local-${Date.now()}-up`,
        created_at: new Date().toISOString(),
        thread_id: 'local',
        case_id: selectedCase.id,
        firm_id: 'default',
        sender_type: 'agent',
        sender_id: 'sierra',
        sender_name: 'Sierra',
        direction: 'agent_to_user',
        body: `📎 [Document Received]: I have successfully received and securely uploaded your file "${file.name}" to your case's Evidence Vault. Our legal team has been notified.`,
        read: true,
        triggers_automation: false,
        automation_target: null,
        automation_status: 'none',
        automation_result: null,
        attachment_url: null,
        attachment_name: file.name,
        attachment_type: file.type,
        metadata: {},
      };

      persistMessages([...messages, uploadSuccessMsg]);

      // Trigger standard attorney notification
      pushNotification({
        agentId: 'max',
        caseId: selectedCase.id,
        caseTitle: selectedCase.title,
        type: 'task-complete',
        priority: 'high',
        title: 'New Document via Client Portal',
        message: `Client ${selectedCase.client} has securely uploaded document "${file.name}" directly to the Evidence Vault.`,
      });

      toast.success('Document uploaded successfully!');
    } catch {
      toast.error('Document upload failed. Please try again.');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  // Helper to determine milestone progress percentages
  const getProgressDetails = () => {
    if (!selectedCase) return { activeStep: 1, percent: 25 };
    switch (selectedCase.status) {
      case CaseStatus.PRE_TRIAL:
        return { activeStep: 2, percent: 50 };
      case CaseStatus.DISCOVERY:
        return { activeStep: 2, percent: 50 };
      case CaseStatus.TRIAL:
        return { activeStep: 3, percent: 75 };
      case CaseStatus.CLOSED:
        return { activeStep: 4, percent: 100 };
      default:
        return { activeStep: 1, percent: 25 };
    }
  };

  const { activeStep, percent } = getProgressDetails();

  // LOGIN PAGE / GATEWAY
  if (!isAuthorized || !selectedCase) {
    return (
      <div className="min-h-screen bg-[#020617] text-slate-100 flex flex-col justify-center items-center p-4">
        <div className="w-full max-w-md p-8 rounded-2xl bg-slate-900 border border-slate-800 shadow-2xl relative overflow-hidden">
          {/* Top visual gradient flare */}
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-gold-500 via-amber-500 to-amber-700" />
          
          <div className="flex flex-col items-center mb-6">
            <div className="p-3 bg-gold-500/10 border border-gold-500/20 rounded-2xl mb-4">
              <Scale size={32} className="text-gold-400 animate-pulse" />
            </div>
            <h1 className="text-2xl font-bold text-center font-serif">CaseBuddy Client Portal</h1>
            <p className="text-slate-400 text-xs text-center mt-1">
              Secure, AI-powered attorney-client workspace.
            </p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                Secure Client Access Code
              </label>
              <input
                type="text"
                value={accessCode}
                onChange={(e) => setAccessCode(e.target.value)}
                placeholder="Enter Case Reference or Client Name"
                className="w-full px-4 py-3 bg-slate-950 border border-slate-800 rounded-xl text-sm focus:outline-none focus:border-gold-500/50 text-slate-100 transition-colors"
                autoFocus
              />
            </div>
            
            <button
              type="submit"
              className="w-full py-3 bg-gold-500 hover:bg-gold-600 active:translate-y-px text-slate-950 font-semibold rounded-xl text-sm shadow-lg shadow-gold-500/10 transition-all flex items-center justify-center gap-1.5"
            >
              <Shield size={16} />
              Access Secured Case Portal
            </button>
          </form>

          {/* Sandboxed Demo Helper Box */}
          <div className="mt-8 pt-6 border-t border-slate-800/60">
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
              Sandbox Access Codes (Demo Mode)
            </h3>
            <p className="text-[11px] text-slate-500 mb-3 leading-relaxed">
              Click any of your registered active cases below to instantly log in as that client and simulate their portal experience:
            </p>
            <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
              {cases.map((c) => (
                <button
                  key={c.id}
                  onClick={() => {
                    setAccessCode(c.id);
                    setSelectedCase(c);
                    setIsAuthorized(true);
                    toast.success(`Access granted as Client ${c.client}`);
                  }}
                  className="w-full text-left px-3 py-2 rounded-lg bg-slate-950/60 hover:bg-slate-950 border border-slate-800 hover:border-slate-700/80 transition-all flex justify-between items-center text-xs text-slate-300"
                >
                  <span className="font-semibold">{c.client}</span>
                  <span className="text-slate-500 font-mono text-[10px] bg-slate-900 px-1.5 py-0.5 rounded">
                    {c.id.substring(0, 8)}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // LOGGED IN VIEW
  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Simulation Banner for Attorneys */}
      {isAttorneyMode && (
        <div className="bg-gold-500/10 border border-gold-500/30 text-gold-400 p-3 rounded-xl flex items-center justify-between text-xs sm:text-sm">
          <div className="flex items-center gap-2">
            <Shield size={16} className="text-gold-400 animate-pulse" />
            <span>
              <strong>Attorney Simulation Mode:</strong> You are previewing how <strong>{selectedCase.client}</strong> sees their portal.
            </span>
          </div>
          <Link
            to="/app/cases"
            className="px-2.5 py-1 rounded bg-gold-500 text-slate-950 text-xs font-semibold hover:bg-gold-400 transition-colors flex items-center gap-1"
          >
            <ArrowLeft size={12} />
            Back to Case Files
          </Link>
        </div>
      )}

      {/* Case Header Card */}
      <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-xl relative overflow-hidden">
        {/* Top visual gradient flare */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-gold-500 via-amber-500 to-amber-700" />
        
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-slate-950 border border-slate-800/80 flex items-center justify-center text-gold-400 text-lg shadow-inner font-serif font-bold">
            {selectedCase.title.charAt(0)}
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl font-bold font-serif text-white">{selectedCase.title}</h1>
              <span className={`px-2 py-0.5 text-[10px] uppercase font-bold rounded-full border ${
                isEscalated ? 'bg-red-500/10 text-red-400 border-red-500/25' : 'bg-gold-500/10 text-gold-400 border-gold-500/20'
              }`}>
                {isEscalated ? 'Human Escalated' : selectedCase.status}
              </span>
            </div>
            <p className="text-slate-400 text-sm mt-0.5">
              Client: <span className="text-slate-200 font-medium">{selectedCase.client}</span> &bull; Case ID: <span className="font-mono text-xs">{selectedCase.id.substring(0, 8)}</span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Escalation Control */}
          {isEscalated ? (
            <div className="flex items-center gap-2">
              <div className="px-4 py-2.5 rounded-xl bg-red-500/15 border border-red-500/25 text-red-400 flex items-center gap-2 text-xs font-semibold animate-pulse">
                <AlertTriangle size={14} />
                Human Contact Requested
              </div>
              {isAttorneyMode && (
                <button
                  onClick={resolveEscalation}
                  className="px-3 py-2.5 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 text-xs font-bold transition-all"
                >
                  Resolve Escalation
                </button>
              )}
            </div>
          ) : (
            <button
              onClick={triggerEscalation}
              className="px-4 py-2.5 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-400 hover:text-amber-300 text-xs font-bold transition-all flex items-center gap-1.5"
              title="Pause AI automation and page your lead human attorney."
            >
              <PhoneCall size={14} />
              Escalate to Attorney
            </button>
          )}

          {!isAttorneyMode && (
            <button
              onClick={() => {
                setIsAuthorized(false);
                setSelectedCase(null);
                setAccessCode('');
              }}
              className="px-4 py-2.5 rounded-xl border border-slate-800 bg-slate-950/60 text-slate-400 hover:bg-slate-950 hover:text-slate-200 text-xs font-semibold transition-all"
            >
              Log Out
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left 1 Column: Progress, Team, Document Actions */}
        <div className="lg:col-span-1 space-y-6">
          
          {/* Progress / Milestones Card */}
          <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-4">
            <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider">Case Milestones</h2>
            
            {/* ProgressBar */}
            <div className="relative">
              <div className="w-full h-1 bg-slate-800 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-gradient-to-r from-gold-500 to-amber-500 transition-all duration-500" 
                  style={{ width: `${percent}%` }}
                />
              </div>
            </div>

            {/* Steps timeline list */}
            <div className="space-y-4 pt-2">
              <div className="flex items-start gap-3">
                <div className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 text-[10px] font-bold ${
                  activeStep >= 1 ? 'bg-gold-500 text-slate-950' : 'bg-slate-800 text-slate-500'
                }`}>
                  {activeStep > 1 ? <Check size={10} strokeWidth={3} /> : '1'}
                </div>
                <div>
                  <h4 className={`text-xs font-semibold ${activeStep >= 1 ? 'text-slate-100' : 'text-slate-500'}`}>Case Evaluation & Intake</h4>
                  <p className="text-[10px] text-slate-400">Complete legal analysis & acceptance.</p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 text-[10px] font-bold ${
                  activeStep >= 2 ? 'bg-gold-500 text-slate-950 animate-pulse' : 'bg-slate-800 text-slate-500'
                }`}>
                  {activeStep > 2 ? <Check size={10} strokeWidth={3} /> : '2'}
                </div>
                <div>
                  <h4 className={`text-xs font-semibold ${activeStep >= 2 ? 'text-slate-100' : 'text-slate-500'}`}>Evidence & Discovery</h4>
                  <p className="text-[10px] text-slate-400">Secure document audit, filings, depositions.</p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 text-[10px] font-bold ${
                  activeStep >= 3 ? 'bg-gold-500 text-slate-950' : 'bg-slate-800 text-slate-500'
                }`}>
                  {activeStep > 3 ? <Check size={10} strokeWidth={3} /> : '3'}
                </div>
                <div>
                  <h4 className={`text-xs font-semibold ${activeStep >= 3 ? 'text-slate-100' : 'text-slate-500'}`}>Trial Preparation</h4>
                  <p className="text-[10px] text-slate-400">Practice simulations, opening arguments, coaching.</p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 text-[10px] font-bold ${
                  activeStep >= 4 ? 'bg-gold-500 text-slate-950' : 'bg-slate-800 text-slate-500'
                }`}>
                  '4'
                </div>
                <div>
                  <h4 className={`text-xs font-semibold ${activeStep >= 4 ? 'text-slate-100' : 'text-slate-500'}`}>Resolution & Verdict</h4>
                  <p className="text-[10px] text-slate-400">Final courtroom hearing or settlement release.</p>
                </div>
              </div>
            </div>
          </div>

          {/* Legal Team Card */}
          <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-4">
            <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider">Your Legal Team</h2>
            
            <div className="space-y-3.5">
              {/* Tom Bradley */}
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-gold-500/10 border border-gold-500/25 flex items-center justify-center text-sm">
                  💼
                </div>
                <div>
                  <h4 className="text-xs font-bold text-gold-400">Tom Bradley</h4>
                  <p className="text-[10px] text-slate-400">Lead Trial Strategist / Supervisor</p>
                </div>
              </div>

              {/* Sierra */}
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-violet-500/10 border border-violet-500/25 flex items-center justify-center text-sm">
                  💁‍♀️
                </div>
                <div>
                  <h4 className="text-xs font-bold text-violet-400">Sierra</h4>
                  <p className="text-[10px] text-slate-400">Client Success Coordinator</p>
                </div>
              </div>
            </div>
          </div>

          {/* Secure Evidence Upload Form */}
          <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-4">
            <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider">Secure Evidence Vault</h2>
            <p className="text-[10px] text-slate-500 leading-relaxed">
              Have you received new photos, police reports, or records? Upload them securely below to instantly encrypt and add them directly to your legal team's database.
            </p>

            <input
              type="file"
              ref={fileRef}
              onChange={handleFileUpload}
              className="hidden"
            />

            <button
              onClick={handleUploadClick}
              disabled={uploading}
              className="w-full py-3 border border-dashed border-slate-700 hover:border-gold-500/40 bg-slate-950 hover:bg-slate-900 text-slate-300 hover:text-slate-100 rounded-xl transition-all flex flex-col items-center justify-center gap-2 group cursor-pointer"
            >
              {uploading ? (
                <Loader2 size={20} className="text-gold-400 animate-spin" />
              ) : (
                <Upload size={20} className="text-slate-500 group-hover:text-gold-400 transition-colors" />
              )}
              <span className="text-xs font-medium">
                {uploading ? 'Analyzing Virus Scan...' : 'Securely Upload File'}
              </span>
              <span className="text-[9px] text-slate-500">PDF, JPG, PNG under 20MB</span>
            </button>
          </div>

        </div>

        {/* Right 2 Columns: Chat / Messaging Workspace */}
        <div className="lg:col-span-2 flex flex-col h-[650px] bg-slate-900 rounded-2xl border border-slate-800 overflow-hidden shadow-xl">
          {/* Chat Header */}
          <div className="px-5 py-4 bg-slate-900 border-b border-slate-800/80 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse border border-slate-900" />
              <div>
                <h3 className="text-xs font-bold text-slate-200">Legal Coordinator Hotline</h3>
                <p className="text-[10px] text-slate-500">AI Coordinator Active &bull; Monitored by Supervisor</p>
              </div>
            </div>
          </div>

          {/* Messages Body Scroll Area */}
          <div className="flex-1 overflow-y-auto p-5 space-y-4 bg-slate-950/40">
            {messages.map((m) => {
              const isUser = m.sender_type === 'user';
              const isSys = m.sender_id === 'system';
              return (
                <div
                  key={m.id}
                  className={`flex ${isUser ? 'justify-end' : 'justify-start'} ${isSys ? 'w-full justify-center px-4' : ''}`}
                >
                  {isSys ? (
                    <div className="w-full max-w-lg p-3 rounded-xl bg-slate-900/80 border border-slate-800 text-center text-xs text-slate-300 shadow-md">
                      {m.body}
                    </div>
                  ) : (
                    <div className={`max-w-[85%] sm:max-w-md p-4 rounded-2xl shadow-md space-y-1 ${
                      isUser
                        ? 'bg-slate-800 text-slate-100 rounded-tr-none border border-slate-700/80'
                        : 'bg-slate-900 text-slate-100 rounded-tl-none border border-slate-800'
                    }`}>
                      <div className="flex items-center justify-between gap-6 mb-1">
                        <span className={`text-[10px] font-bold uppercase tracking-wider ${isUser ? 'text-emerald-400' : 'text-violet-400'}`}>
                          {m.sender_name}
                        </span>
                        <span className="text-[9px] text-slate-500 font-mono">
                          {new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      
                      <p className="text-xs leading-relaxed whitespace-pre-wrap">{m.body}</p>
                      
                      {m.attachment_name && (
                        <div className="mt-2.5 pt-2 border-t border-slate-800 flex items-center gap-2 text-[10px] text-gold-400 font-mono">
                          <Paperclip size={11} />
                          <span className="truncate max-w-xs">{m.attachment_name}</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            {typingAgent && (
              <div className="flex justify-start">
                <div className="bg-slate-900 text-slate-100 p-4 rounded-2xl rounded-tl-none border border-slate-800 flex items-center gap-2 shadow-md">
                  <span className="text-[10px] font-bold text-violet-400 uppercase tracking-wider">Sierra is typing</span>
                  <div className="flex gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Messages Footer Input */}
          <div className="p-4 bg-slate-900 border-t border-slate-800/80">
            <form onSubmit={handleSendMessage} className="flex gap-2">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={isEscalated ? "All AI responses paused. Ask human attorney..." : "Type your message to the legal team..."}
                className="flex-1 px-4 py-3 bg-slate-950 border border-slate-800 rounded-xl text-xs focus:outline-none focus:border-gold-500/50 text-slate-100 transition-colors"
              />
              <button
                type="submit"
                disabled={!input.trim() || sending}
                className="px-4 py-3 bg-gold-500 hover:bg-gold-600 disabled:opacity-40 disabled:hover:bg-gold-500 rounded-xl transition-all flex items-center justify-center text-slate-950 cursor-pointer shadow-lg shadow-gold-500/10"
              >
                {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
              </button>
            </form>
          </div>
        </div>

      </div>
    </div>
  );
};

export default ClientPortal;
