
import React, { useState, useRef, useEffect, useContext } from 'react';
import { Send, MessageSquare, ChevronRight, ChevronLeft, RotateCcw, Scale, Mic, MicOff, Info, Briefcase } from 'lucide-react';
import { LEGAL_SPECIALISTS, LegalSpecialist } from '../agents/personas';
import AgentHeader from './AgentHeader';
import { consultSpecialist } from '../services/geminiService';
import { AppContext } from '../App';
import { handleError } from '../utils/errorHandler';

interface ChatMessage {
  role: 'user' | 'model';
  text: string;
  timestamp: number;
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

const ChatPanel = ({ specialist, session, onSend, onReset, loading, onBack }: {
  specialist: LegalSpecialist;
  session: ConsultationSession;
  onSend: (text: string) => void;
  onReset: () => void;
  loading: boolean;
  onBack?: () => void;
}) => {
  const [input, setInput] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [session.messages, loading]);

  const submit = () => {
    const text = input.trim();
    if (!text || loading) return;
    setInput('');
    onSend(text);
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
            <div className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${
              msg.role === 'user'
                ? 'bg-slate-700 text-white rounded-tr-sm'
                : `${specialist.bgClass} border ${specialist.borderClass} text-slate-200 rounded-tl-sm`
            }`}>
              {msg.text}
            </div>
          </div>
        ))}

        {loading && (
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

      <div className="p-4 border-t border-slate-800 shrink-0">
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
        <p className="text-xs text-slate-600 mt-2 text-center">{DISCLAIMER}</p>
      </div>
    </div>
  );
};

const SpecialistCard = ({ specialist, isActive, onClick, hasHistory }: {
  specialist: LegalSpecialist;
  isActive: boolean;
  onClick: () => void;
  hasHistory: boolean;
}) => (
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
  const [showInfo, setShowInfo] = useState(false);
  const [mobileShowChat, setMobileShowChat] = useState(false);

  useEffect(() => {
    try { localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions)); } catch {}
  }, [sessions]);

  const specialist = LEGAL_SPECIALISTS.find(s => s.id === activeId)!

  const getSession = (id: string): ConsultationSession =>
    sessions[id] || { specialistId: id, messages: [] };

  const handleSend = async (text: string) => {
    const session = getSession(activeId);
    const userMsg: ChatMessage = { role: 'user', text, timestamp: Date.now() };
    const updatedMessages = [...session.messages, userMsg];

    setSessions(prev => ({
      ...prev,
      [activeId]: { ...session, messages: updatedMessages },
    }));

    setLoading(true);
    try {
      const history = updatedMessages.slice(0, -1).map(m => ({
        role: m.role as 'user' | 'model',
        parts: [{ text: m.text }],
      }));

      const caseCtx = activeCase
        ? `Case: ${activeCase.title} | Client: ${activeCase.client} | Status: ${activeCase.status} | Summary: ${activeCase.summary}`
        : undefined;

      const reply = await consultSpecialist(
        specialist.systemInstruction,
        history,
        text,
        caseCtx
      );

      const modelMsg: ChatMessage = { role: 'model', text: reply, timestamp: Date.now() };
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
    }
  };

  const handleReset = () => {
    setSessions(prev => ({ ...prev, [activeId]: { specialistId: activeId, messages: [] } }));
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
          />
        </div>
      </div>
    </div>
  );
};

export default LegalTeam;
