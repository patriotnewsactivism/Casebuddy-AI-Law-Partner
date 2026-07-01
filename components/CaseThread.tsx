import React, { useCallback, useContext, useEffect, useRef, useState } from 'react';
import {
  ArrowLeft, Send, Paperclip, Loader2, CheckCircle2, AlertCircle,
  Clock, Users, MessageSquare, Zap, ChevronDown, ChevronRight,
  Radio, Mic, Briefcase, Scale, UserCheck, Volume2,
} from 'lucide-react';
import {
  getOrCreateThread, getThreadMessages, sendUserMessage,
  subscribeToThread, markThreadRead, sendAgentMessage,
  broadcastToAllStaff, parseMention,
  CaseThread as ICaseThread, CaseMessage, BroadcastReply,
} from '../services/caseThreadService';
import {
  getAgentById, getSpecialistById, getParalegalById, getAnyPersonById,
  OPERATIONAL_AGENTS, LEGAL_SPECIALISTS, PARALEGALS,
  OperationalAgent, LegalSpecialist, Paralegal,
} from '../agents/personas';
import { AppContext } from '../App';
import { deepseekChat } from '../services/deepseek';
import { uploadDocument, reanalyzeDocument } from '../services/documentPipeline';

// ── Helpers ────────────────────────────────────────────────────────────────

function personEmoji(id: string): string {
  const p = getAnyPersonById(id) as any;
  return p?.emoji ?? '⚖️';
}
function personColor(id: string): string {
  const p = getAnyPersonById(id) as any;
  return p?.colorClass ?? 'text-gold-400';
}
function personName(id: string): string {
  const p = getAnyPersonById(id) as any;
  return p?.name ?? id;
}
function personBg(id: string): string {
  const p = getAnyPersonById(id) as any;
  return p?.bgClass ?? 'bg-slate-800';
}
function personBorder(id: string): string {
  const p = getAnyPersonById(id) as any;
  return p?.borderClass ?? 'border-slate-700';
}

type RoleBadge = 'attorney' | 'paralegal' | 'ops' | 'user';

function getRoleBadge(id: string): RoleBadge {
  if (id === 'user') return 'user';
  if (getSpecialistById(id)) return 'attorney';
  if (getParalegalById(id)) return 'paralegal';
  return 'ops';
}

const ROLE_BADGE_STYLES: Record<RoleBadge, { label: string; cls: string }> = {
  attorney: { label: 'Attorney', cls: 'bg-gold-500/15 text-gold-400 border border-gold-500/30' },
  paralegal: { label: 'Paralegal', cls: 'bg-violet-500/15 text-violet-400 border border-violet-500/30' },
  ops:       { label: 'Staff',    cls: 'bg-slate-700 text-slate-400 border border-slate-600' },
  user:      { label: 'You',      cls: 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30' },
};

const PRIORITY_COLORS: Record<string, string> = {
  low: 'text-slate-400 bg-slate-800',
  normal: 'text-blue-400 bg-blue-500/10',
  high: 'text-amber-400 bg-amber-500/10',
  urgent: 'text-red-400 bg-red-500/10',
};

const AUTO_STATUS_ICON: Record<string, React.ReactNode> = {
  queued:   <Clock size={11} className="text-amber-400" />,
  running:  <Loader2 size={11} className="animate-spin text-blue-400" />,
  complete: <CheckCircle2 size={11} className="text-emerald-400" />,
  error:    <AlertCircle size={11} className="text-red-400" />,
};

// ── @mention autocomplete ──────────────────────────────────────────────────

const ALL_MENTION_TARGETS = [
  ...OPERATIONAL_AGENTS.map(a => ({ id: a.id, name: a.name, emoji: a.emoji, role: 'ops' as RoleBadge, subtitle: a.title })),
  ...LEGAL_SPECIALISTS.map(s => ({ id: s.id, name: s.name, emoji: s.emoji, role: 'attorney' as RoleBadge, subtitle: s.practiceArea })),
  ...PARALEGALS.map(p => ({ id: p.id, name: p.name, emoji: p.emoji, role: 'paralegal' as RoleBadge, subtitle: `${p.supervisorName}'s paralegal` })),
];

function getMentionSuggestions(query: string) {
  if (!query) return ALL_MENTION_TARGETS.slice(0, 8);
  const q = query.toLowerCase();
  return ALL_MENTION_TARGETS.filter(t =>
    t.name.toLowerCase().includes(q) || t.subtitle.toLowerCase().includes(q)
  ).slice(0, 8);
}

// ── Firm Roster Sidebar ────────────────────────────────────────────────────

interface RosterItemProps {
  id: string;
  name: string;
  emoji: string;
  title: string;
  colorClass: string;
  bgClass: string;
  borderClass: string;
  role: RoleBadge;
  onPing: (id: string) => void;
}

const RosterItem: React.FC<RosterItemProps> = ({ id, name, emoji, title, colorClass, bgClass, borderClass, role, onPing }) => (
  <div className={`flex items-center gap-2 px-2 py-1.5 rounded-lg group hover:${bgClass} transition-all`}>
    <div className="relative flex-shrink-0">
      <div className={`w-7 h-7 rounded-full flex items-center justify-center text-sm ${bgClass} border ${borderClass}`}>
        {emoji}
      </div>
      <span className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-400 border border-slate-900 shadow-[0_0_4px_1px_rgba(52,211,153,0.5)]" />
    </div>
    <div className="flex-1 min-w-0">
      <p className={`text-xs font-medium ${colorClass} truncate`}>{name}</p>
      <p className="text-[10px] text-slate-500 truncate">{title}</p>
    </div>
    <button
      onClick={() => onPing(id)}
      className="opacity-0 group-hover:opacity-100 text-[10px] px-1.5 py-0.5 rounded bg-slate-700 hover:bg-slate-600 text-slate-300 transition-all flex-shrink-0"
    >
      Ping
    </button>
  </div>
);

// ── Component ──────────────────────────────────────────────────────────────

interface Props {
  onBack?: () => void;
}

const CaseThreadView: React.FC<Props> = ({ onBack }) => {
  const { activeCase } = useContext(AppContext);

  const [thread, setThread] = useState<ICaseThread | null>(null);
  const [messages, setMessages] = useState<CaseMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [attaching, setAttaching] = useState(false);
  const [offlineMode, setOfflineMode] = useState(false);
  const [offlineMessages, setOfflineMessages] = useState<CaseMessage[]>(() => {
    // Rehydrate from localStorage on mount
    try {
      const saved = localStorage.getItem(`warroom_msgs_${activeCase?.id ?? 'global'}`);
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });
  const [showRoster, setShowRoster] = useState(true);
  const [showParticipants, setShowParticipants] = useState(false);
  const [expandedAttorneys, setExpandedAttorneys] = useState<Set<string>>(new Set());
  const [broadcasting, setBroadcasting] = useState(false);
  const [broadcastReplies, setBroadcastReplies] = useState<BroadcastReply[]>([]);
  const [showBroadcastPanel, setShowBroadcastPanel] = useState(false);
  const [typingAgent, setTypingAgent] = useState<string | null>(null);

  // @mention state
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionSuggestions, setMentionSuggestions] = useState(getMentionSuggestions(''));
  const [showMentions, setShowMentions] = useState(false);

  const endRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const unsubRef = useRef<(() => void) | null>(null);

  const caseId = activeCase?.id ?? 'global';
  const caseTitle = activeCase?.title ?? 'General Case';
  const caseSummary = activeCase?.summary ?? '';
  const caseStatus = activeCase?.status ?? '';
  const caseCtx = `Case: ${caseTitle}\nStatus: ${caseStatus}\nSummary: ${caseSummary}`;

  // ── Offline persistence key (per case) ──────────────────────────────────
  const offlineKey = `warroom_msgs_${caseId}`;

  // Auto-save offline messages whenever they change
  useEffect(() => {
    if (offlineMode) {
      try { localStorage.setItem(offlineKey, JSON.stringify(offlineMessages)); } catch {}
    }
  }, [offlineMessages, offlineMode, offlineKey]);

  const allMessages = offlineMode ? offlineMessages : messages;

  // ── Load thread + messages ─────────────────────────────────────────────

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    setOfflineMode(false);

    getOrCreateThread(caseId, caseTitle).then(async (t) => {
      if (!alive) return;
      setThread(t);
      const msgs = await getThreadMessages(t.id);
      if (!alive) return;
      setMessages(msgs);
      await markThreadRead(t.id);

      unsubRef.current?.();
      unsubRef.current = subscribeToThread(t.id, (newMsg) => {
        setMessages(prev => {
          if (prev.find(m => m.id === newMsg.id)) return prev;
          return [...prev, newMsg];
        });
        if (newMsg.direction === 'agent_to_user') markThreadRead(t.id);
      });

      setLoading(false);
    }).catch(() => {
      if (!alive) return;
      // Supabase not configured — enter offline/local-only mode
      setOfflineMode(true);
      setLoading(false);
    });

    return () => { alive = false; unsubRef.current?.(); };
  }, [caseId, caseTitle]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [allMessages, sending, broadcastReplies]);

  // ── @mention input handling ────────────────────────────────────────────

  const handleInputChange = (val: string) => {
    setInput(val);
    // Detect @mention trigger
    const atIdx = val.lastIndexOf('@');
    if (atIdx !== -1) {
      const afterAt = val.slice(atIdx + 1);
      if (!afterAt.includes(' ') || afterAt.length < 20) {
        setMentionQuery(afterAt);
        setMentionSuggestions(getMentionSuggestions(afterAt));
        setShowMentions(true);
        return;
      }
    }
    setShowMentions(false);
    setMentionQuery(null);
  };

  const insertMention = (name: string) => {
    const atIdx = input.lastIndexOf('@');
    const newVal = input.slice(0, atIdx) + `@${name} `;
    setInput(newVal);
    setShowMentions(false);
    setMentionQuery(null);
    textareaRef.current?.focus();
  };

  // ── Send message ───────────────────────────────────────────────────────

  const sendOffline = useCallback(async (text: string) => {
    const mentioned = parseMention(text);
    const targetId = mentioned ?? 'maya';
    const targetName = personName(targetId);

    const userMsg: CaseMessage = {
      id: `local-${Date.now()}-u`,
      created_at: new Date().toISOString(),
      thread_id: 'local',
      case_id: caseId,
      firm_id: 'default',
      sender_type: 'user',
      sender_id: 'user',
      sender_name: 'You',
      direction: 'user_to_agent',
      body: text,
      read: true,
      triggers_automation: true,
      automation_target: targetId,
      automation_status: 'queued',
      automation_result: null,
      attachment_url: null,
      attachment_name: null,
      attachment_type: null,
      metadata: {},
    };
    setOfflineMessages(prev => [...prev, userMsg]);
    setTypingAgent(targetId);

    try {
      const person = getAnyPersonById(targetId) as any;
      const sysInst = person?.systemInstruction
        ? `${person.systemInstruction}\n\nCurrent case context:\n${caseCtx}`
        : `You are ${targetName}. Current case context:\n${caseCtx}`;

      const reply = await deepseekChat({
        systemInstruction: sysInst,
        messages: [{ role: 'user', content: text }],
        temperature: 0.5,
        maxTokens: 800,
        timeoutMs: 30_000,
      });

      const agentMsg: CaseMessage = {
        id: `local-${Date.now()}-a`,
        created_at: new Date().toISOString(),
        thread_id: 'local',
        case_id: caseId,
        firm_id: 'default',
        sender_type: getSpecialistById(targetId) ? 'attorney' : 'agent',
        sender_id: targetId,
        sender_name: targetName,
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
      setOfflineMessages(prev => [...prev, agentMsg]);
    } catch {
      const errMsg: CaseMessage = {
        id: `local-${Date.now()}-e`,
        created_at: new Date().toISOString(),
        thread_id: 'local',
        case_id: caseId,
        firm_id: 'default',
        sender_type: 'agent',
        sender_id: targetId,
        sender_name: targetName,
        direction: 'agent_to_user',
        body: "I'm reviewing this now — I'll get back to you shortly.",
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
      setOfflineMessages(prev => [...prev, errMsg]);
    } finally {
      setTypingAgent(null);
    }
  }, [caseId, caseCtx]);

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || sending) return;
    setInput('');
    setSending(true);
    setError(null);

    try {
      if (offlineMode) {
        await sendOffline(text);
      } else if (thread) {
        await sendUserMessage({
          threadId: thread.id,
          caseId,
          caseTitle,
          caseSummary,
          caseStatus,
          userMessage: text,
          userName: 'Attorney',
        });
      }
    } catch {
      setError('Failed to send message. Please try again.');
    } finally {
      setSending(false);
    }
  }, [input, sending, thread, caseId, caseTitle, caseSummary, caseStatus, offlineMode, sendOffline]);

  // ── Attach a document (real upload: Supabase Storage + OCR via
  // Google Cloud Vision -> Gemini -> OCR.space, analysis via Gemini ->
  // OpenAI -> Cohere, same shared pipeline used everywhere else) ─────────
  const handleFileAttach = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (fileRef.current) fileRef.current.value = '';
    if (!file) return;

    setAttaching(true);
    try {
      const { document } = await uploadDocument(file, caseId);
      const attachBody = `📎 Attached document: ${file.name}`;

      if (offlineMode) {
        const userMsg: CaseMessage = {
          id: `local-${Date.now()}-att`,
          created_at: new Date().toISOString(),
          thread_id: 'local',
          case_id: caseId,
          firm_id: 'default',
          sender_type: 'user',
          sender_id: 'user',
          sender_name: 'You',
          direction: 'user_to_agent',
          body: attachBody,
          read: true,
          triggers_automation: false,
          automation_target: null,
          automation_status: 'none',
          automation_result: null,
          attachment_url: document.file_url,
          attachment_name: file.name,
          attachment_type: file.type,
          metadata: {},
        };
        setOfflineMessages(prev => [...prev, userMsg]);
      } else if (thread) {
        await sendUserMessage({
          threadId: thread.id,
          caseId,
          caseTitle,
          caseSummary,
          caseStatus,
          userMessage: attachBody,
          userName: 'Attorney',
          attachmentUrl: document.file_url ?? undefined,
          attachmentName: file.name,
          attachmentType: file.type,
        });
      }

      // Run real OCR + legal analysis in the background — no need to block the composer.
      reanalyzeDocument(document.id).catch(err => console.error('Attachment OCR failed:', err));
    } catch (err) {
      console.error('Attach document failed:', err);
      setError('Failed to attach document. Please try again.');
    } finally {
      setAttaching(false);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (showMentions && (e.key === 'Escape')) {
      setShowMentions(false);
      return;
    }
    if (e.key === 'Enter' && !e.shiftKey && !showMentions) {
      e.preventDefault();
      send();
    }
  };

  // ── Ping a specific agent ──────────────────────────────────────────────

  const pingAgent = async (agentId: string) => {
    setSending(true);
    try {
      const name = personName(agentId);
      const greeting = `Hey — I'm reviewing the ${caseTitle} case file. What can I help with?`;
      if (offlineMode) {
        await sendOffline(`@${name} ${greeting}`);
      } else if (thread) {
        await sendAgentMessage(thread.id, caseId, agentId, greeting);
      }
    } catch { /* silent */ } finally {
      setSending(false);
    }
  };

  // ── Broadcast ──────────────────────────────────────────────────────────

  const handleBroadcast = async () => {
    const text = input.trim();
    if (!text && !broadcasting) {
      // Prompt user to type something first
      setError('Type a message first, then press Broadcast.');
      return;
    }
    const broadcastText = text || 'Team check-in — please provide a brief status update from your area.';
    setInput('');
    setBroadcasting(true);
    setBroadcastReplies([]);
    setShowBroadcastPanel(true);
    setError(null);

    try {
      const { replies, summary } = await broadcastToAllStaff(broadcastText, caseCtx, caseId);
      setBroadcastReplies(replies);

      // Add Maya's summary as a regular message
      if (offlineMode) {
        const summaryMsg: CaseMessage = {
          id: `local-${Date.now()}-bc`,
          created_at: new Date().toISOString(),
          thread_id: 'local',
          case_id: caseId,
          firm_id: 'default',
          sender_type: 'agent',
          sender_id: 'maya',
          sender_name: 'Maya (Broadcast Summary)',
          direction: 'agent_to_user',
          body: `📡 **Broadcast Summary**\n\n${summary}`,
          read: true,
          triggers_automation: false,
          automation_target: null,
          automation_status: 'none',
          automation_result: null,
          attachment_url: null,
          attachment_name: null,
          attachment_type: null,
          metadata: { isBroadcastSummary: true },
        };
        setOfflineMessages(prev => [...prev, summaryMsg]);
      }
    } catch {
      setError('Broadcast failed. Please try again.');
    } finally {
      setBroadcasting(false);
    }
  };

  // ── Roster helpers ─────────────────────────────────────────────────────

  const toggleAttorney = (id: string) => {
    setExpandedAttorneys(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  // ── Render ─────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-400">
        <Loader2 size={24} className="animate-spin mr-3" /> Loading firm war room…
      </div>
    );
  }

  const participants = thread?.participants ?? [];

  return (
    <div className="flex h-[calc(100vh-7rem)] gap-3">

      {/* ── Firm Roster Sidebar ── */}
      {showRoster && (
        <div className="w-56 flex-shrink-0 flex flex-col bg-slate-900/60 border border-slate-800 rounded-2xl overflow-hidden">
          <div className="px-3 py-2.5 border-b border-slate-800 flex items-center justify-between">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Firm Staff</span>
            <span className="text-[10px] text-emerald-400 font-medium flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse inline-block" />
              {OPERATIONAL_AGENTS.length + LEGAL_SPECIALISTS.length + PARALEGALS.length} online
            </span>
          </div>
          <div className="flex-1 overflow-y-auto py-2 px-1 space-y-0.5">

            {/* Operational Agents section */}
            <p className="text-[10px] font-bold text-slate-600 uppercase tracking-widest px-2 pt-1 pb-0.5">Operations</p>
            {OPERATIONAL_AGENTS.map(a => (
              <RosterItem
                key={a.id}
                id={a.id}
                name={a.name}
                emoji={a.emoji}
                title={a.title}
                colorClass={a.colorClass}
                bgClass={a.bgClass}
                borderClass={a.borderClass}
                role="ops"
                onPing={pingAgent}
              />
            ))}

            {/* Attorneys + Paralegals */}
            <p className="text-[10px] font-bold text-slate-600 uppercase tracking-widest px-2 pt-3 pb-0.5">Attorneys & Paralegals</p>
            {LEGAL_SPECIALISTS.map(atty => {
              const paralegals = PARALEGALS.filter(p => p.supervisorId === atty.id);
              const expanded = expandedAttorneys.has(atty.id);
              return (
                <div key={atty.id}>
                  <div className="flex items-center">
                    <div className="flex-1">
                      <RosterItem
                        id={atty.id}
                        name={atty.name}
                        emoji={atty.emoji}
                        title={atty.title}
                        colorClass={atty.colorClass}
                        bgClass={atty.bgClass}
                        borderClass={atty.borderClass}
                        role="attorney"
                        onPing={pingAgent}
                      />
                    </div>
                    <button
                      onClick={() => toggleAttorney(atty.id)}
                      className="p-1 text-slate-600 hover:text-slate-400 transition-colors flex-shrink-0"
                    >
                      {expanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
                    </button>
                  </div>
                  {expanded && (
                    <div className="ml-4 border-l border-slate-800 pl-2 space-y-0.5">
                      {paralegals.map(pl => (
                        <RosterItem
                          key={pl.id}
                          id={pl.id}
                          name={pl.name}
                          emoji={pl.emoji}
                          title={pl.specialty}
                          colorClass={pl.colorClass}
                          bgClass={pl.bgClass}
                          borderClass={pl.borderClass}
                          role="paralegal"
                          onPing={pingAgent}
                        />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Main Chat Panel ── */}
      <div className="flex flex-col flex-1 min-w-0">

        {/* Header */}
        <div className="flex items-start gap-3 pb-3 border-b border-slate-800 mb-1">
          {onBack && (
            <button onClick={onBack} className="p-2 rounded-lg hover:bg-slate-800 text-slate-400 mt-0.5 transition-colors">
              <ArrowLeft size={18} />
            </button>
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={() => setShowRoster(v => !v)}
                className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-500 hover:text-slate-300 transition-colors"
                title="Toggle firm roster"
              >
                <Users size={15} />
              </button>
              <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
                <MessageSquare size={16} className="text-gold-400" />
                {caseTitle}
              </h2>
              {offlineMode && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/30 font-medium">
                  Local Mode
                </span>
              )}
              {thread && (
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${PRIORITY_COLORS[thread.priority]}`}>
                  {thread.priority}
                </span>
              )}
              <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 font-medium">
                {thread?.status ?? 'open'}
              </span>
            </div>
            {!offlineMode && (
              <button
                onClick={() => setShowParticipants(v => !v)}
                className="flex items-center gap-1.5 mt-1 text-xs text-slate-500 hover:text-slate-300 transition-colors"
              >
                <Users size={11} />
                {participants.length} participant{participants.length !== 1 ? 's' : ''}
                <ChevronDown size={11} className={`transition-transform ${showParticipants ? 'rotate-180' : ''}`} />
              </button>
            )}
            {showParticipants && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {participants.map(pid => (
                  <span key={pid} className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-300">
                    {pid === 'user' ? '👤 You' : `${personEmoji(pid)} ${personName(pid)}`}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Broadcast panel (collapsible) */}
        {showBroadcastPanel && (
          <div className="mb-3 rounded-xl border border-violet-500/30 bg-violet-500/5 overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2 border-b border-violet-500/20">
              <span className="text-xs font-bold text-violet-400 flex items-center gap-1.5">
                <Radio size={12} />
                Broadcast Replies {broadcasting && <Loader2 size={11} className="animate-spin ml-1" />}
              </span>
              <button onClick={() => setShowBroadcastPanel(false)} className="text-slate-500 hover:text-slate-300 text-xs">close</button>
            </div>
            <div className="p-3 grid grid-cols-2 gap-2">
              {broadcastReplies.map(r => (
                <div key={r.agentId} className={`rounded-lg p-2.5 border ${personBorder(r.agentId)} ${personBg(r.agentId)}`}>
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className="text-sm">{personEmoji(r.agentId)}</span>
                    <span className={`text-xs font-semibold ${personColor(r.agentId)}`}>{r.agentName}</span>
                    <span className={`ml-auto text-[9px] px-1 py-0.5 rounded font-medium ${ROLE_BADGE_STYLES[getRoleBadge(r.agentId)].cls}`}>
                      {ROLE_BADGE_STYLES[getRoleBadge(r.agentId)].label}
                    </span>
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed">{r.body}</p>
                </div>
              ))}
              {broadcasting && (
                <div className="col-span-2 flex items-center justify-center py-3 text-slate-500 text-xs gap-2">
                  <Loader2 size={14} className="animate-spin" /> Gathering team responses…
                </div>
              )}
            </div>
          </div>
        )}

        {/* Messages */}
        <div className="flex-1 overflow-y-auto py-2 space-y-3 px-1">

          {/* Empty state — quick invite */}
          {allMessages.length === 0 && !loading && (
            <div className="py-8 text-center">
              <div className="w-14 h-14 mx-auto rounded-2xl bg-gold-500/10 border border-gold-500/30 flex items-center justify-center text-3xl mb-4">⚖️</div>
              <p className="text-slate-400 text-sm mb-1">Firm War Room ready</p>
              <p className="text-slate-600 text-xs mb-6">Message any attorney, paralegal, or staff member. Use @Name to ping someone specific.</p>
              <div className="flex flex-wrap gap-2 justify-center">
                {[...LEGAL_SPECIALISTS.slice(0, 3), ...OPERATIONAL_AGENTS.slice(0, 3)].map((a: any) => (
                  <button
                    key={a.id}
                    onClick={() => pingAgent(a.id)}
                    className={`flex items-center gap-2 text-xs px-3 py-2 rounded-xl border transition-all hover:scale-105 ${a.bgClass} ${a.borderClass} ${a.colorClass}`}
                  >
                    <span>{a.emoji}</span>
                    <span className="font-medium">{a.name}</span>
                    <span className="text-slate-500">{'title' in a ? a.title : a.practiceArea}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {allMessages.map((msg) => {
            const isUser = msg.direction === 'user_to_agent';
            const name = isUser ? (msg.sender_name || 'You') : msg.sender_name;
            const emoji = isUser ? '👤' : personEmoji(msg.sender_id);
            const color = isUser ? 'text-slate-300' : personColor(msg.sender_id);
            const role = getRoleBadge(isUser ? 'user' : msg.sender_id);
            const badgeStyle = ROLE_BADGE_STYLES[role];
            const isBroadcastSummary = (msg.metadata as any)?.isBroadcastSummary;

            return (
              <div key={msg.id} className={`flex ${isUser ? 'justify-end' : 'justify-start'} gap-2`}>
                {!isUser && (
                  <div className={`text-xl w-9 h-9 flex-shrink-0 rounded-full flex items-center justify-center text-base mt-1 ${personBg(msg.sender_id)} border ${personBorder(msg.sender_id)}`}>
                    {isBroadcastSummary ? '📡' : emoji}
                  </div>
                )}
                <div className={`max-w-[75%] flex flex-col gap-1 ${isUser ? 'items-end' : 'items-start'}`}>
                  <div className="flex items-center gap-1.5">
                    <span className={`text-xs font-medium ${color}`}>{name}</span>
                    <span className={`text-[9px] px-1.5 py-0.5 rounded font-medium ${badgeStyle.cls}`}>
                      {badgeStyle.label}
                    </span>
                  </div>
                  <div
                    className={`px-4 py-2.5 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${
                      isUser
                        ? 'bg-gold-500/15 border border-gold-500/30 text-gold-50 rounded-br-sm'
                        : isBroadcastSummary
                          ? 'bg-violet-500/10 border border-violet-500/30 text-slate-100 rounded-bl-sm'
                          : 'bg-slate-800 border border-slate-700 text-slate-100 rounded-bl-sm'
                    }`}
                  >
                    {msg.body}
                    {msg.attachment_url && (
                      <a
                        href={msg.attachment_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block mt-2 text-xs text-blue-400 underline"
                      >
                        📎 {msg.attachment_name ?? 'Attachment'}
                      </a>
                    )}
                  </div>
                  {/* Automation badge */}
                  {msg.triggers_automation && msg.automation_status !== 'none' && (
                    <div className="flex items-center gap-1 text-xs text-slate-500">
                      <Zap size={10} className="text-gold-400" />
                      {AUTO_STATUS_ICON[msg.automation_status]}
                      <span>
                        {msg.automation_status === 'queued' && `Routing to ${personName(msg.automation_target ?? 'maya')}…`}
                        {msg.automation_status === 'running' && `${personName(msg.automation_target ?? 'maya')} working…`}
                        {msg.automation_status === 'complete' && msg.automation_result}
                        {msg.automation_status === 'error' && 'Auto-dispatch failed'}
                      </span>
                    </div>
                  )}
                  <span className="text-xs text-slate-600">
                    {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
                {isUser && (
                  <div className="w-9 h-9 flex-shrink-0 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-base mt-1">
                    👤
                  </div>
                )}
              </div>
            );
          })}

          {/* Typing indicator */}
          {(sending || typingAgent) && (
            <div className="flex justify-start gap-2">
              <div className={`w-9 h-9 rounded-full flex items-center justify-center ${personBg(typingAgent ?? 'maya')} border ${personBorder(typingAgent ?? 'maya')}`}>
                {personEmoji(typingAgent ?? 'maya')}
              </div>
              <div className="px-4 py-3 rounded-2xl rounded-bl-sm bg-slate-800 border border-slate-700">
                <div className="flex gap-1 items-center">
                  {[0, 1, 2].map(i => (
                    <span
                      key={i}
                      className={`w-1.5 h-1.5 rounded-full ${personColor(typingAgent ?? 'maya').replace('text-', 'bg-')} opacity-70 animate-bounce`}
                      style={{ animationDelay: `${i * 0.15}s` }}
                    />
                  ))}
                  <span className="ml-2 text-xs text-slate-500">{personName(typingAgent ?? 'maya')} is responding…</span>
                </div>
              </div>
            </div>
          )}
          <div ref={endRef} />
        </div>

        {/* Error bar */}
        {error && (
          <div className="flex items-center gap-2 px-4 py-2 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-xs mb-2">
            <AlertCircle size={13} /> {error}
            <button onClick={() => setError(null)} className="ml-auto text-red-300 hover:text-red-100">✕</button>
          </div>
        )}

        {/* @mention autocomplete */}
        {showMentions && (
          <div className="mb-2 rounded-xl border border-slate-700 bg-slate-900 shadow-xl overflow-hidden">
            <p className="text-[10px] text-slate-500 px-3 py-1.5 border-b border-slate-800 uppercase tracking-widest">Mention someone</p>
            <div className="max-h-48 overflow-y-auto">
              {mentionSuggestions.map(t => (
                <button
                  key={t.id}
                  onClick={() => insertMention(t.name)}
                  className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-slate-800 transition-colors text-left"
                >
                  <span className="text-base">{t.emoji}</span>
                  <div className="flex-1 min-w-0">
                    <span className="text-sm text-slate-200 font-medium">{t.name}</span>
                    <span className="text-xs text-slate-500 ml-2">{t.subtitle}</span>
                  </div>
                  <span className={`text-[9px] px-1.5 py-0.5 rounded font-medium ${ROLE_BADGE_STYLES[t.role].cls}`}>
                    {ROLE_BADGE_STYLES[t.role].label}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Composer */}
        <div className="pt-3 border-t border-slate-800">
          <div className="flex items-end gap-2">
            <button
              onClick={() => fileRef.current?.click()}
              disabled={attaching}
              className="p-2.5 rounded-xl bg-slate-800 border border-slate-700 hover:border-slate-600 text-slate-400 hover:text-slate-200 transition-colors flex-shrink-0 disabled:opacity-50"
              title="Attach document"
            >
              {attaching ? <Loader2 size={16} className="animate-spin" /> : <Paperclip size={16} />}
            </button>
            <input ref={fileRef} type="file" className="hidden" accept=".pdf,.doc,.docx,.txt,.png,.jpg,.jpeg" onChange={handleFileAttach} />

            <div className="flex-1 relative">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={e => handleInputChange(e.target.value)}
                onKeyDown={onKeyDown}
                rows={1}
                placeholder="Message any attorney, paralegal, or staff… use @Name to ping someone"
                className="w-full resize-none bg-slate-900 border border-slate-700 focus:border-gold-500/60 rounded-xl px-4 py-3 text-sm text-slate-100 placeholder:text-slate-600 outline-none max-h-36"
              />
            </div>

            {/* Broadcast button */}
            <button
              onClick={handleBroadcast}
              disabled={broadcasting}
              className="p-2.5 rounded-xl bg-violet-500/15 border border-violet-500/30 hover:bg-violet-500/25 text-violet-400 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex-shrink-0"
              title="Broadcast to all staff"
            >
              {broadcasting ? <Loader2 size={16} className="animate-spin" /> : <Radio size={16} />}
            </button>

            {/* Send button */}
            <button
              onClick={send}
              disabled={!input.trim() || sending}
              className="p-2.5 rounded-xl bg-gold-500/20 border border-gold-500/40 hover:bg-gold-500/30 text-gold-400 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex-shrink-0"
            >
              {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
            </button>
          </div>
          <p className="text-xs text-slate-600 mt-2 px-1">
            Use <span className="text-slate-500 font-mono">@Name</span> to ping anyone on the firm roster. Press
            <span className="text-violet-400 mx-1"><Radio size={10} className="inline" /> Broadcast</span>
            to hear from the whole team at once. All messages are attorney-client privileged.
          </p>
        </div>
      </div>
    </div>
  );
};

export default CaseThreadView;
