
import React, { useState, useRef, useEffect, useContext } from 'react';
import { Send, MessageSquare, ChevronRight, ChevronLeft, RotateCcw, Scale, Mic, MicOff, Info, Briefcase, FileDown, Trash2, ThumbsUp, ThumbsDown, ChevronDown } from 'lucide-react';
import { LEGAL_SPECIALISTS, LegalSpecialist } from '../agents/personas';
import AgentHeader from './AgentHeader';
import { consultSpecialist, consultSpecialistStream } from '../services/geminiService';
import { AppContext } from '../App';
import { handleError } from '../utils/errorHandler';
import AIDisclaimer from './AIDisclaimer';
import { buildMemoryContext, recordAction } from '../services/agentMemory';
import { recordFeedback, buildPatternsContext, recordLearningEvent } from '../services/agentLearning';
import { runReasoning, selectReasoningMode } from '../services/agentReasoning';
import { ReasoningModeSelector, ReasoningResultBadge } from './ReasoningIndicator';
import type { ReasoningMode } from '../types';

interface ChatMessage {
  role: 'user' | 'model';
  text: string;
  timestamp: number;
  reasoningMode?: ReasoningMode;
  confidence?: number;
}

interface ConsultationSession {
  specialistId: string;
  messages: ChatMessage[];
}

const DISCLAIMER = 'This is AI-generated information for educational and planning purposes only. It does not constitute legal advice. Always consult a licensed attorney for representation.';

const TypingIndicator = ({ colorClass }: { colorClass: string }) => (
  <div className="flex items-center gap-2 px-4 py-3">
    <div className="flex gap-1">
      {[0, 1, 2].map(i => (
        <div key={i} className={`w-2 h-2 rounded-full ${colorClass.replace('text-', 'bg-')} opacity-60 animate-bounce`}
          style={{ animationDelay: `${i * 0.15}s` }} />
      ))}
    </div>
    <span className="text-xs text-slate-500">Consulting…</span>
  </div>
);

const VoiceButton = ({ onTranscript }: { onTranscript: (text: string) => void }) => {
  const [listening, setListening] = useState(false);
  const recRef = useRef<any>(null);

  const toggle = () => {
    const SpeechRec = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRec) return;
    if (listening) {
      recRef.current?.stop();
      setListening(false);
      return;
    }
    const rec = new SpeechRec();
    rec.continuous = false;
    rec.interimResults = false;
    rec.lang = 'en-US';
    rec.onresult = (e: any) => {
      onTranscript(e.results[0][0].transcript);
      setListening(false);
    };
    rec.onerror = () => setListening(false);
    rec.onend = () => setListening(false);
    rec.start();
    recRef.current = rec;
    setListening(true);
  };

  return (
    <button onClick={toggle} title={listening ? 'Stop listening' : 'Voice input'}
      className={`p-2 rounded-lg transition-colors ${listening ? 'text-red-400 bg-red-500/10 animate-pulse' : 'text-slate-500 hover:text-slate-300 hover:bg-slate-700'}`}>
      {listening ? <MicOff size={18} /> : <Mic size={18} />}
    </button>
  );
};

interface ChatPanelProps {
  specialist: LegalSpecialist;
  session: ConsultationSession;
  onSend: (text: string, mode: ReasoningMode) => Promise<void> | void;
  onReset: () => void;
  loading: boolean;
  streamingText?: string;
  onBack?: () => void;
  activeCase?: { title: string } | null;
  onFeedback: (msgIdx: number, feedback: 'positive' | 'negative') => void;
}
const ChatPanel: React.FC<ChatPanelProps> = ({ specialist, session, onSend, onReset, loading, streamingText, onBack, activeCase, onFeedback }) => {
  const [input, setInput] = useState('');
  const [reasoningMode, setReasoningMode] = useState<ReasoningMode>('standard');
  const bottomRef = useRef<HTMLDivElement>(null);

  const exportTranscript = () => {
    const win = window.open('', '_blank');
    if (!win) return;
    win.document.write(`
      <html><head>
        <title>Consultation — ${specialist.name}</title>
        <style>
          body { font-family: Georgia, serif; max-width: 700px; margin: 40px auto; color: #1a1a1a; line-height: 1.6; }
          h1 { font-size: 22px; border-bottom: 2px solid #d4af37; padding-bottom: 8px; }
          .meta { color: #666; font-size: 13px; margin-bottom: 24px; }
          .msg { margin-bottom: 16px; }
          .msg-user { text-align: right; }
          .bubble { display: inline-block; max-width: 80%; padding: 10px 14px; border-radius: 12px; font-size: 14px; }
          .bubble-user { background: #1e293b; color: #f1f5f9; }
          .bubble-ai { background: #f8f5e6; color: #1a1a1a; border: 1px solid #d4af37; }
          .label { font-size: 11px; color: #999; margin-bottom: 4px; }
          .disclaimer { margin-top: 40px; padding: 12px; border: 1px solid #ddd; font-size: 12px; color: #666; }
          @media print { body { margin: 20px; } }
        </style>
      </head><body>
        <h1>Consultation: ${specialist.name} — ${specialist.practiceArea}</h1>
        <div class="meta">
      <AIDisclaimer variant="full" className="mb-5" />
          Exported ${new Date().toLocaleDateString()} · ${session.messages.length} messages
          ${activeCase ? `· Case: ${activeCase.title}` : ''}
        </div>
        ${session.messages.map(m => `
          <div class="msg ${m.role === 'user' ? 'msg-user' : ''}">
            <div class="label">${m.role === 'user' ? 'You' : specialist.name} · ${new Date(m.timestamp).toLocaleTimeString()}</div>
            <div class="bubble ${m.role === 'user' ? 'bubble-user' : 'bubble-ai'}">${m.text.replace(/\n/g, '<br/>')}</div>
          </div>
        `).join('')}
        <div class="disclaimer">⚠ This is AI-generated information for educational and planning purposes only. It does not constitute legal advice. Always consult a licensed attorney for representation.</div>
      </body></html>
    `);
    win.document.close();
    win.print();
  };

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [session.messages, loading]);

  const submit = () => {
    const text = input.trim();
    if (!text || loading) return;
    setInput('');
    // Auto-select reasoning mode based on query length/complexity
    const autoMode = selectReasoningMode(text, reasoningMode);
    onSend(text, autoMode);
  };

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="p-3 sm:p-4 border-b border-slate-800 flex items-center justify-between gap-2 sm:gap-3 shrink-0">
        {onBack && (
          <button onClick={onBack} className="md:hidden p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors shrink-0">
            <ChevronLeft size={20} />
          </button>
        )}
        <div className="flex-1 min-w-0">
          <AgentHeader agent={specialist} compact />
        </div>
        {session.messages.length > 0 && (
          <button onClick={exportTranscript} title="Export transcript"
            className="p-2 text-slate-500 hover:text-slate-300 hover:bg-slate-800 rounded-lg transition-colors shrink-0">
            <FileDown size={16} />
          </button>
        )}
        <button onClick={onReset} title="New consultation"
          className="p-2 text-slate-500 hover:text-slate-300 hover:bg-slate-800 rounded-lg transition-colors shrink-0">
          <RotateCcw size={16} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {session.messages.length === 0 && (
          <div className="text-center py-12 space-y-4">
            <div className={`w-20 h-20 mx-auto rounded-2xl flex items-center justify-center text-4xl ${specialist.bgClass} border ${specialist.borderClass}`}>
              {specialist.emoji}
            </div>
            <div>
              <p className={`text-lg font-semibold ${specialist.colorClass}`}>{specialist.name}</p>
              <p className="text-slate-400 text-sm mt-1">{specialist.title}</p>
            </div>
            <p className="text-slate-500 text-sm max-w-sm mx-auto">
              Ask {specialist.name} anything about {specialist.practiceArea}. Be as specific as possible — the more context you provide, the better the guidance.
            </p>
            <div className="flex flex-wrap gap-2 justify-center mt-4">
              {specialist.commonTopics.slice(0, 3).map(t => (
                <button key={t} onClick={() => onSend(`Tell me about ${t.toLowerCase()}.`)}
                  className={`text-xs px-3 py-1.5 rounded-lg border ${specialist.bgClass} ${specialist.borderClass} ${specialist.colorClass} hover:opacity-80 transition-opacity`}>
                  {t}
                </button>
              ))}
            </div>
          </div>
        )}

        {session.messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            {msg.role === 'model' && (
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-sm mr-2 mt-1 shrink-0 border ${specialist.borderClass}`}
                style={{ background: 'rgba(0,0,0,0.3)' }}>
                {specialist.emoji}
              </div>
            )}
            <div className="max-w-[80%] space-y-1">
              <div className={`rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${
                msg.role === 'user'
                  ? 'bg-slate-700 text-white rounded-tr-sm'
                  : `${specialist.bgClass} border ${specialist.borderClass} text-slate-200 rounded-tl-sm`
              }`}>
                {msg.text}
              </div>
              {/* Reasoning badge + feedback for model messages */}
              {msg.role === 'model' && (
                <div className="flex items-center gap-2 px-1">
                  {msg.reasoningMode && msg.reasoningMode !== 'standard' && (
                    <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${
                      msg.reasoningMode === 'deep-think' ? 'border-violet-500/30 text-violet-400 bg-violet-500/10' :
                      msg.reasoningMode === 'expert-panel' ? 'border-cyan-500/30 text-cyan-400 bg-cyan-500/10' :
                      'border-red-500/30 text-red-400 bg-red-500/10'
                    }`}>
                      {msg.reasoningMode === 'deep-think' ? '🧠 Deep' :
                       msg.reasoningMode === 'expert-panel' ? '👥 Panel' : '⚔️ Adversarial'}
                      {msg.confidence ? ` · ${msg.confidence}%` : ''}
                    </span>
                  )}
                  <button
                    onClick={() => onFeedback(i, 'positive')}
                    className="text-slate-600 hover:text-green-400 transition-colors"
                    title="Helpful"
                  >
                    <ThumbsUp size={11} />
                  </button>
                  <button
                    onClick={() => onFeedback(i, 'negative')}
                    className="text-slate-600 hover:text-red-400 transition-colors"
                    title="Not helpful"
                  >
                    <ThumbsDown size={11} />
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}

        {/* Streaming response */}
        {loading && streamingText && (
          <div className="flex justify-start">
            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-sm mr-2 mt-1 shrink-0 border ${specialist.borderClass}`}
              style={{ background: 'rgba(0,0,0,0.3)' }}>
              {specialist.emoji}
            </div>
            <div className={`max-w-[80%] rounded-2xl rounded-tl-sm px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${specialist.bgClass} border ${specialist.borderClass} text-slate-200`}>
              {streamingText}
              <span className="inline-block w-1.5 h-4 bg-current ml-0.5 animate-pulse" />
            </div>
          </div>
        )}

        {loading && !streamingText && (
          <div className="flex justify-start">
            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-sm mr-2 mt-1 shrink-0 border ${specialist.borderClass}`}
              style={{ background: 'rgba(0,0,0,0.3)' }}>
              {specialist.emoji}
            </div>
            <div className={`rounded-2xl rounded-tl-sm ${specialist.bgClass} border ${specialist.borderClass}`}>
              <TypingIndicator colorClass={specialist.colorClass} />
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      <div className="p-4 border-t border-slate-800 shrink-0 space-y-2">
        {/* Reasoning mode selector */}
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-slate-500 font-medium shrink-0">Mode:</span>
          <ReasoningModeSelector value={reasoningMode} onChange={setReasoningMode} disabled={loading} compact />
        </div>

        <div className="flex items-center gap-2 bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 focus-within:border-slate-600">
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKey}
            placeholder={`Ask ${specialist.name} a question…`}
            rows={2}
            className="flex-1 bg-transparent text-sm text-white placeholder-slate-500 resize-none outline-none"
          />
          <div className="flex items-center gap-1 shrink-0">
            <VoiceButton onTranscript={t => setInput(prev => prev + (prev ? ' ' : '') + t)} />
            <button onClick={submit} disabled={!input.trim() || loading}
              className={`p-2 rounded-lg transition-colors ${input.trim() && !loading ? `${specialist.colorClass.replace('text-', 'bg-').replace('-400', '-500')} text-white hover:opacity-90` : 'text-slate-600 bg-slate-700 cursor-not-allowed'}`}>
              <Send size={16} />
            </button>
          </div>
        </div>
        <p className="text-xs text-slate-600 text-center">{DISCLAIMER}</p>
      </div>
    </div>
  );
};

interface SpecialistCardProps {
  specialist: LegalSpecialist;
  isActive: boolean;
  onClick: () => void;
  hasHistory: boolean;
}
const SpecialistCard: React.FC<SpecialistCardProps> = ({ specialist, isActive, onClick, hasHistory }) => (
  <button onClick={onClick}
    className={`w-full text-left p-4 rounded-xl border transition-all duration-150 group ${
      isActive
        ? `${specialist.bgClass} ${specialist.borderClass}`
        : 'bg-slate-800/50 border-slate-700 hover:border-slate-600 hover:bg-slate-800'
    }`}>
    <div className="flex items-start gap-3">
      <div className={`w-11 h-11 rounded-xl flex items-center justify-center text-xl shrink-0 border ${specialist.borderClass}`}
        style={{ background: 'rgba(0,0,0,0.3)' }}>
        {specialist.emoji}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-1">
          <span className={`font-semibold text-sm ${isActive ? specialist.colorClass : 'text-white group-hover:text-white'}`}>
            {specialist.name}
          </span>
          <div className="flex items-center gap-1 shrink-0">
            {hasHistory && (
              <div className={`w-2 h-2 rounded-full ${specialist.colorClass.replace('text-', 'bg-')}`} />
            )}
            <ChevronRight size={14} className="text-slate-600" />
          </div>
        </div>
        <p className="text-xs text-slate-400 mt-0.5 truncate">{specialist.practiceArea}</p>
        <p className="text-xs text-slate-500 mt-1 line-clamp-2">{specialist.description}</p>
        <p className="text-xs mt-1.5 font-medium" style={{ color: 'rgba(255,255,255,0.3)' }}>
          {specialist.yearsExperience} yrs · {specialist.personality.split(',')[0]}
        </p>
      </div>
    </div>
  </button>
);

const SESSIONS_KEY = 'casebuddy_legal_sessions';

const LegalTeam: React.FC = () => {
  const { activeCase } = useContext(AppContext);
  const [activeId, setActiveId] = useState<string>(LEGAL_SPECIALISTS[0].id);
  const [sessions, setSessions] = useState<Record<string, ConsultationSession>>(() => {
    try {
      const saved = localStorage.getItem(SESSIONS_KEY);
      return saved ? JSON.parse(saved) : {};
    } catch { return {}; }
  });
  const [loading, setLoading] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const [showInfo, setShowInfo] = useState(false);
  const [mobileShowChat, setMobileShowChat] = useState(false);

  useEffect(() => {
    try { localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions)); } catch {}
  }, [sessions]);

  const specialist = LEGAL_SPECIALISTS.find(s => s.id === activeId)!

  const getSession = (id: string): ConsultationSession =>
    sessions[id] || { specialistId: id, messages: [] };

  const handleSend = async (text: string, mode: ReasoningMode = 'standard') => {
    const session = getSession(activeId);
    const userMsg: ChatMessage = { role: 'user', text, timestamp: Date.now() };
    const updatedMessages = [...session.messages, userMsg];

    setSessions(prev => ({
      ...prev,
      [activeId]: { ...session, messages: updatedMessages },
    }));

    setLoading(true);
    setStreamingText('');

    try {
      const history = updatedMessages.slice(0, -1).map(m => ({
        role: m.role as 'user' | 'model',
        parts: [{ text: m.text }],
      }));

      const caseCtx = activeCase
        ? `Case: ${activeCase.title} | Client: ${activeCase.client} | Status: ${activeCase.status} | Summary: ${activeCase.summary}`
        : undefined;

      // Load memory context for this specialist
      const memCtx = await buildMemoryContext(activeId, activeCase?.id ?? 'general');
      // Inject learned patterns into context so agents improve over time
      const patternsCtx = await buildPatternsContext(activeId);
      const fullMemCtx = memCtx + patternsCtx;

      let reply: string;
      let confidence: number | undefined;

      if (mode === 'standard') {
        // Use streaming for standard mode
        let accumulated = '';
        try {
          const stream = consultSpecialistStream(
            specialist.systemInstruction,
            history,
            text,
            caseCtx,
            fullMemCtx
          );
          for await (const chunk of stream) {
            accumulated += chunk;
            setStreamingText(accumulated);
          }
          reply = accumulated || await consultSpecialist(specialist.systemInstruction, history, text, caseCtx, fullMemCtx);
        } catch {
          // Streaming failed — fall back to non-streaming
          reply = await consultSpecialist(specialist.systemInstruction, history, text, caseCtx, fullMemCtx);
        }
      } else {
        // Deep reasoning modes
        const result = await runReasoning({
          mode,
          agentId: activeId,
          caseId: activeCase?.id ?? 'general',
          systemInstruction: specialist.systemInstruction,
          task: text,
          caseContext: caseCtx ?? '',
        });
        reply = result.synthesis;
        if (result.critique) {
          reply += `\n\n---\n**Self-Critique:** ${result.critique}`;
        }
        confidence = result.confidence;
      }

      // Record action in memory
      await recordAction(activeId, activeCase?.id ?? 'general', {
        type: 'consultation',
        description: `Consulted on: ${text.slice(0, 80)}`,
        result: reply.slice(0, 150),
      });

      // Record learning event for pattern extraction
      recordLearningEvent({
        agentId: activeId,
        caseId: activeCase?.id ?? 'general',
        action: 'consultation',
        outcome: 'neutral',
        context: {
          mode,
          questionLength: text.length,
          replyLength: reply.length,
          winProbability: activeCase?.winProbability,
        },
      }).catch(() => { /* non-critical */ });

      const modelMsg: ChatMessage = {
        role: 'model',
        text: reply,
        timestamp: Date.now(),
        reasoningMode: mode !== 'standard' ? mode : undefined,
        confidence,
      };

      setSessions(prev => ({
        ...prev,
        [activeId]: {
          specialistId: activeId,
          messages: [...updatedMessages, modelMsg],
        },
      }));
    } catch (err) {
      handleError(err, `${specialist.name} is unavailable. Please try again.`, 'LegalTeam');
    } finally {
      setLoading(false);
      setStreamingText('');
    }
  };

  const handleFeedback = async (msgIdx: number, feedback: 'positive' | 'negative') => {
    await recordFeedback(activeId, activeCase?.id ?? 'general', msgIdx, feedback, {
      specialistId: activeId,
      caseId: activeCase?.id,
    });
  };

  const handleReset = () => {
    setSessions(prev => ({ ...prev, [activeId]: { specialistId: activeId, messages: [] } }));
  };

  const handleClearAllMemory = () => {
    if (!window.confirm('Clear all consultation histories for all specialists? This cannot be undone.')) return;
    setSessions({});
    localStorage.removeItem(SESSIONS_KEY);
  };

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)]">
      <div className="mb-4 sm:mb-6 shrink-0">
        <div className="flex items-start justify-between gap-2 sm:gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-white font-serif flex items-center gap-2 sm:gap-3">
              <Scale className="text-gold-500" size={24} />
              Legal Team
            </h1>
            <p className="text-slate-400 mt-1 text-sm">Consult with AI lawyers in 12 practice areas.</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={handleClearAllMemory}
              className="hidden sm:flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-700 text-slate-400 hover:text-red-400 hover:border-red-500/40 text-xs transition-colors"
              title="Clear all specialist memories"
            >
              <Trash2 size={12} /> Clear All Memory
            </button>
            {activeCase && (
              <div className="hidden sm:flex items-center gap-2 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs">
                <Briefcase size={12} className="text-gold-400" />
                <span className="text-slate-300 font-medium max-w-[120px] truncate">{activeCase.title}</span>
                <span className="text-slate-500">· active</span>
              </div>
            )}
            <button onClick={() => setShowInfo(!showInfo)}
              className="p-2 text-slate-500 hover:text-slate-300 hover:bg-slate-800 rounded-lg transition-colors">
              <Info size={18} />
            </button>
          </div>
        </div>

        {showInfo && (
          <div className="mt-3 p-3 sm:p-4 bg-amber-500/10 border border-amber-500/30 rounded-xl text-xs sm:text-sm text-amber-200">
            <strong>Disclaimer:</strong> {DISCLAIMER} These AI lawyers provide educational guidance — not to replace licensed counsel.
            {activeCase && <span className="block mt-1 text-amber-300">Active case "{activeCase.title}" is being used as context.</span>}
          </div>
        )}
      </div>

      <div className="flex gap-4 flex-1 min-h-0">
        {/* Specialist list — full-width on mobile when chat is hidden */}
        <div className={`${mobileShowChat ? 'hidden md:block' : 'block'} w-full md:w-72 shrink-0 overflow-y-auto space-y-2 pr-1`}>
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-2">
            <MessageSquare size={12} />
            Select a Specialist
          </p>
          {LEGAL_SPECIALISTS.map(s => (
            <SpecialistCard
              key={s.id}
              specialist={s}
              isActive={s.id === activeId}
              onClick={() => { setActiveId(s.id); setMobileShowChat(true); }}
              hasHistory={(sessions[s.id]?.messages.length ?? 0) > 0}
            />
          ))}
        </div>

        {/* Chat panel — full-width on mobile when shown */}
        <div className={`${mobileShowChat ? 'flex flex-col' : 'hidden md:flex md:flex-col'} flex-1 min-w-0 bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden`}>
          <ChatPanel
            key={activeId}
            specialist={specialist}
            session={getSession(activeId)}
            onSend={handleSend}
            onReset={handleReset}
            loading={loading}
            onBack={() => setMobileShowChat(false)}
            activeCase={activeCase}
          />
        </div>
      </div>
    </div>
  );
};

export default LegalTeam;
