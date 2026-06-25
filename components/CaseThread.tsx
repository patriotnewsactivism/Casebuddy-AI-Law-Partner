import React, { useCallback, useContext, useEffect, useRef, useState } from 'react';
import {
  ArrowLeft, Send, Paperclip, Loader2, CheckCircle2, AlertCircle,
  Clock, Users, MessageSquare, Zap, ChevronDown
} from 'lucide-react';
import {
  getOrCreateThread, getThreadMessages, sendUserMessage,
  subscribeToThread, markThreadRead, sendAgentMessage,
  CaseThread as ICaseThread, CaseMessage,
} from '../services/caseThreadService';
import { getAgentById, getSpecialistById, OPERATIONAL_AGENTS, LEGAL_SPECIALISTS } from '../agents/personas';
import { AppContext } from '../App';

// ── Helpers ────────────────────────────────────────────────────────────────

function agentEmoji(id: string): string {
  const a = getAgentById(id) ?? getSpecialistById(id);
  return (a as any)?.emoji ?? '⚖️';
}
function agentColor(id: string): string {
  const a = getAgentById(id) ?? getSpecialistById(id);
  return (a as any)?.colorClass ?? 'text-gold-400';
}
function agentName(id: string): string {
  const a = getAgentById(id) ?? getSpecialistById(id);
  return (a as any)?.name ?? id;
}

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

// ── Quick-start attorney buttons ───────────────────────────────────────────

const QUICK_ATTORNEYS = [
  ...LEGAL_SPECIALISTS.slice(0, 4),
  ...OPERATIONAL_AGENTS.slice(0, 4),
];

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
  const [showParticipants, setShowParticipants] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const endRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const unsubRef = useRef<(() => void) | null>(null);

  const caseId = activeCase?.id ?? 'global';
  const caseTitle = activeCase?.title ?? 'General Case';
  const caseSummary = activeCase?.summary ?? '';
  const caseStatus = activeCase?.status ?? '';

  // Load thread + messages
  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);

    getOrCreateThread(caseId, caseTitle).then(async (t) => {
      if (!alive) return;
      setThread(t);
      const msgs = await getThreadMessages(t.id);
      if (!alive) return;
      setMessages(msgs);
      await markThreadRead(t.id);

      // Realtime subscription
      unsubRef.current?.();
      unsubRef.current = subscribeToThread(t.id, (newMsg) => {
        setMessages(prev => {
          if (prev.find(m => m.id === newMsg.id)) return prev;
          return [...prev, newMsg];
        });
        if (newMsg.direction === 'agent_to_user') {
          markThreadRead(t.id);
        }
      });

      setLoading(false);
    }).catch(err => {
      if (!alive) return;
      setError(String(err));
      setLoading(false);
    });

    return () => { alive = false; unsubRef.current?.(); };
  }, [caseId, caseTitle]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, sending]);

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || sending || !thread) return;
    setInput('');
    setSending(true);
    setError(null);

    try {
      await sendUserMessage({
        threadId: thread.id,
        caseId,
        caseTitle,
        caseSummary,
        caseStatus,
        userMessage: text,
        userName: 'Attorney',
      });
      // Messages arrive via realtime; no need to push manually
    } catch (err) {
      setError('Failed to send message. Please try again.');
    } finally {
      setSending(false);
    }
  }, [input, sending, thread, caseId, caseTitle, caseSummary, caseStatus]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  };

  const startConversationWith = async (agentId: string) => {
    if (!thread) return;
    setSending(true);
    try {
      const name = agentName(agentId);
      const greeting = `Hi — I'm reviewing the ${caseTitle} case file and wanted to open a direct line. What do you need from me on this matter?`;
      await sendAgentMessage(thread.id, caseId, agentId, greeting);
    } catch { /* silently fail */ }
    setSending(false);
  };

  // ── Render ─────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-400">
        <Loader2 size={24} className="animate-spin mr-3" /> Loading case thread…
      </div>
    );
  }

  if (error && !thread) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-red-400 gap-2">
        <AlertCircle size={24} />
        <p className="text-sm">{error}</p>
      </div>
    );
  }

  const participants = thread?.participants ?? [];

  return (
    <div className="flex flex-col h-[calc(100vh-7rem)] max-w-3xl mx-auto">

      {/* ── Header ── */}
      <div className="flex items-start gap-3 pb-4 border-b border-slate-800">
        {onBack && (
          <button onClick={onBack} className="p-2 rounded-lg hover:bg-slate-800 text-slate-400 mt-0.5 transition-colors">
            <ArrowLeft size={18} />
          </button>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
              <MessageSquare size={16} className="text-gold-400" />
              {caseTitle}
            </h2>
            {thread && (
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${PRIORITY_COLORS[thread.priority]}`}>
                {thread.priority}
              </span>
            )}
            <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 font-medium">
              {thread?.status ?? 'open'}
            </span>
          </div>
          <button
            onClick={() => setShowParticipants(v => !v)}
            className="flex items-center gap-1.5 mt-1 text-xs text-slate-500 hover:text-slate-300 transition-colors"
          >
            <Users size={11} />
            {participants.length} participant{participants.length !== 1 ? 's' : ''}
            <ChevronDown size={11} className={`transition-transform ${showParticipants ? 'rotate-180' : ''}`} />
          </button>
          {showParticipants && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {participants.map(pid => (
                <span key={pid} className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-300">
                  {pid === 'user' ? '👤 You' : `${agentEmoji(pid)} ${agentName(pid)}`}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Quick-invite an attorney ── */}
      {messages.length === 0 && !loading && (
        <div className="py-6 border-b border-slate-800">
          <p className="text-xs text-slate-500 uppercase tracking-widest mb-3 px-1">Start a conversation with</p>
          <div className="flex flex-wrap gap-2">
            {QUICK_ATTORNEYS.map(a => (
              <button
                key={a.id}
                onClick={() => startConversationWith(a.id)}
                className={`flex items-center gap-2 text-xs px-3 py-2 rounded-xl border transition-all hover:scale-105 ${(a as any).bgClass} ${(a as any).borderClass} ${(a as any).colorClass}`}
              >
                <span>{(a as any).emoji}</span>
                <span className="font-medium">{a.name}</span>
                <span className="text-slate-500">{'title' in a ? (a as any).title : (a as any).practiceArea}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Messages ── */}
      <div className="flex-1 overflow-y-auto py-4 space-y-3 px-1">
        {messages.map((msg) => {
          const isUser = msg.direction === 'user_to_agent';
          const name = isUser ? (msg.sender_name || 'You') : msg.sender_name;
          const emoji = isUser ? '👤' : agentEmoji(msg.sender_id);
          const color = isUser ? 'text-slate-300' : agentColor(msg.sender_id);

          return (
            <div key={msg.id} className={`flex ${isUser ? 'justify-end' : 'justify-start'} gap-2`}>
              {!isUser && (
                <div className="text-xl w-9 h-9 flex-shrink-0 rounded-full bg-slate-800 flex items-center justify-center text-base mt-1">
                  {emoji}
                </div>
              )}
              <div className={`max-w-[78%] flex flex-col gap-1 ${isUser ? 'items-end' : 'items-start'}`}>
                <span className={`text-xs font-medium ${color}`}>{name}</span>
                <div
                  className={`px-4 py-2.5 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${
                    isUser
                      ? 'bg-gold-500/15 border border-gold-500/30 text-gold-50 rounded-br-sm'
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
                      {msg.automation_status === 'queued' && `Routing to ${agentName(msg.automation_target ?? 'maya')}…`}
                      {msg.automation_status === 'running' && `${agentName(msg.automation_target ?? 'maya')} working…`}
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
                <div className="text-xl w-9 h-9 flex-shrink-0 rounded-full bg-slate-800 flex items-center justify-center text-base mt-1">
                  👤
                </div>
              )}
            </div>
          );
        })}

        {sending && (
          <div className="flex justify-start gap-2">
            <div className="w-9 h-9 rounded-full bg-slate-800 flex items-center justify-center">⚖️</div>
            <div className="px-4 py-2.5 rounded-2xl rounded-bl-sm bg-slate-800 border border-slate-700 text-slate-400">
              <Loader2 size={15} className="animate-spin" />
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      {/* ── Error bar ── */}
      {error && (
        <div className="flex items-center gap-2 px-4 py-2 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-xs mb-2">
          <AlertCircle size={13} /> {error}
        </div>
      )}

      {/* ── Composer ── */}
      <div className="pt-3 border-t border-slate-800">
        <div className="flex items-end gap-2">
          <button
            onClick={() => fileRef.current?.click()}
            className="p-2.5 rounded-xl bg-slate-800 border border-slate-700 hover:border-slate-600 text-slate-400 hover:text-slate-200 transition-colors flex-shrink-0"
            title="Attach document to case file"
          >
            <Paperclip size={16} />
          </button>
          <input ref={fileRef} type="file" className="hidden" accept=".pdf,.doc,.docx,.txt,.png,.jpg,.jpeg" />
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            rows={1}
            placeholder="Message any attorney or AI employee — message is saved to the case file…"
            className="flex-1 resize-none bg-slate-900 border border-slate-700 focus:border-gold-500/60 rounded-xl px-4 py-3 text-sm text-slate-100 placeholder:text-slate-600 outline-none max-h-36"
          />
          <button
            onClick={send}
            disabled={!input.trim() || sending}
            className="p-2.5 rounded-xl bg-gold-500/20 border border-gold-500/40 hover:bg-gold-500/30 text-gold-400 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex-shrink-0"
          >
            {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
          </button>
        </div>
        <p className="text-xs text-slate-600 mt-2 px-1">
          Messages are automatically routed to the right AI employee and saved to the case file. Attorney-client privileged.
        </p>
      </div>
    </div>
  );
};

export default CaseThreadView;
