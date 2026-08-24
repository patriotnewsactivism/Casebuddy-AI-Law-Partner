import React, { useContext, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, BrainCircuit, FileSearch, Gavel, Loader2, Mic, RotateCcw, Send, ShieldCheck, Sparkles } from 'lucide-react';
import { Link } from 'react-router-dom';
import { AppContext } from '../App';
import { buildCaseBrief } from '../services/caseContext';
import { deepseekChat } from '../services/deepseek';
import { recordAction } from '../services/agentMemory';
import { CaseBuddyRoute, routeCaseBuddyRequest } from '../services/casebuddyRouter';
import AIDisclaimer from './AIDisclaimer';

interface ChatMessage {
  role: 'user' | 'assistant';
  text: string;
  timestamp: number;
  route?: Pick<CaseBuddyRoute, 'kind' | 'id' | 'agentId' | 'name' | 'title' | 'emoji' | 'workspaceRoute' | 'reason'>;
}

const STORAGE_KEY = 'casebuddy_universal_chat_v1';

const STARTERS = [
  {
    icon: FileSearch,
    label: 'Mine this case',
    prompt: 'Review the active matter and tell me the most important evidence, contradictions, missing records, and discovery work I should prioritize next.',
  },
  {
    icon: BrainCircuit,
    label: 'Build my strategy',
    prompt: 'Analyze the active matter from both sides. Give me the strongest arguments, biggest weaknesses, likely opposition, and the next five actions that would most improve my position.',
  },
  {
    icon: Gavel,
    label: 'Prepare me for court',
    prompt: 'Based on the active matter, prepare me for the next hearing or court appearance. Identify the issues I need to prove, likely questions or arguments from the other side, and a concise preparation checklist.',
  },
];

function loadMessages(): ChatMessage[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.slice(-60) : [];
  } catch {
    return [];
  }
}

function VoiceInput({ onTranscript, disabled }: { onTranscript: (text: string) => void; disabled?: boolean }) {
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<any>(null);

  const toggle = () => {
    if (disabled) return;
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    if (listening) {
      recognitionRef.current?.stop();
      setListening(false);
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = 'en-US';
    recognition.onresult = (event: any) => {
      const transcript = event.results?.[0]?.[0]?.transcript;
      if (transcript) onTranscript(transcript);
      setListening(false);
    };
    recognition.onerror = () => setListening(false);
    recognition.onend = () => setListening(false);
    recognition.start();
    recognitionRef.current = recognition;
    setListening(true);
  };

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={disabled}
      title={listening ? 'Stop listening' : 'Speak to CaseBuddy'}
      className={`p-2 rounded-lg transition-colors ${
        listening
          ? 'bg-red-500/10 text-red-400 animate-pulse'
          : 'text-slate-400 hover:text-white hover:bg-slate-700 disabled:opacity-40'
      }`}
    >
      <Mic size={18} />
    </button>
  );
}

const AskCaseBuddy: React.FC = () => {
  const { activeCase } = useContext(AppContext);
  const [messages, setMessages] = useState<ChatMessage[]>(loadMessages);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [currentRoute, setCurrentRoute] = useState<CaseBuddyRoute>(() => routeCaseBuddyRequest('general legal question'));
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-60)));
    } catch {
      // Local persistence is best-effort; matter data remains in its canonical stores.
    }
  }, [messages]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const matterLabel = activeCase?.title ?? 'No active matter selected';

  const recentContext = useMemo(
    () => messages.slice(-12).map(message => ({ role: message.role, content: message.text })),
    [messages],
  );

  const send = async (rawText?: string) => {
    const text = (rawText ?? input).trim();
    if (!text || loading) return;

    const route = routeCaseBuddyRequest(text);
    setCurrentRoute(route);
    setInput('');

    const userMessage: ChatMessage = {
      role: 'user',
      text,
      timestamp: Date.now(),
    };
    setMessages(prev => [...prev, userMessage]);
    setLoading(true);

    try {
      let caseContext = '';
      if (activeCase) {
        try {
          caseContext = await buildCaseBrief(activeCase, {
            maxChars: 9000,
            forAgentId: route.agentId,
          });
        } catch {
          caseContext = `Active matter: ${activeCase.title}. Client: ${activeCase.client ?? 'Not specified'}. Status: ${activeCase.status ?? 'Not specified'}. Summary: ${activeCase.summary ?? 'Not specified'}.`;
        }
      }

      const systemInstruction = `${route.systemInstruction}

ROUTING CONTEXT:
You were selected automatically by CaseBuddy because: ${route.reason}.
Respond to the user's actual request rather than discussing routing.
${caseContext ? `\nACTIVE MATTER CONTEXT:\n${caseContext}` : '\nNo active matter is selected. Ask for missing matter-specific facts only when they are necessary to answer safely and accurately.'}`;

      const reply = await deepseekChat({
        systemInstruction,
        messages: [...recentContext, { role: 'user', content: text }],
        temperature: 0.35,
        maxTokens: 2400,
        timeoutMs: 45_000,
      });

      const routeSnapshot: ChatMessage['route'] = {
        kind: route.kind,
        id: route.id,
        agentId: route.agentId,
        name: route.name,
        title: route.title,
        emoji: route.emoji,
        workspaceRoute: route.workspaceRoute,
        reason: route.reason,
      };

      setMessages(prev => [
        ...prev,
        {
          role: 'assistant',
          text: reply,
          timestamp: Date.now(),
          route: routeSnapshot,
        },
      ]);

      recordAction(route.agentId, activeCase?.id ?? 'general', {
        type: 'consultation',
        description: `Ask CaseBuddy routed request: ${text.slice(0, 100)}`,
        result: reply.slice(0, 180),
      }).catch(() => undefined);
    } catch {
      setMessages(prev => [
        ...prev,
        {
          role: 'assistant',
          text: 'CaseBuddy could not complete that request right now. Your question was not lost—please try again, or open the suggested workspace for a more focused workflow.',
          timestamp: Date.now(),
          route: {
            kind: route.kind,
            id: route.id,
            agentId: route.agentId,
            name: route.name,
            title: route.title,
            emoji: route.emoji,
            workspaceRoute: route.workspaceRoute,
            reason: route.reason,
          },
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const reset = () => {
    setMessages([]);
    setInput('');
    try { localStorage.removeItem(STORAGE_KEY); } catch {}
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void send();
    }
  };

  return (
    <div className="min-h-[calc(100vh-10rem)] flex flex-col bg-slate-950/30 rounded-2xl border border-slate-800 overflow-hidden">
      <div className="px-4 sm:px-6 py-4 border-b border-slate-800 bg-slate-900/70">
        <div className="flex flex-col lg:flex-row lg:items-center gap-3 lg:justify-between">
          <div>
            <div className="flex items-center gap-2 text-white">
              <Sparkles size={20} className="text-gold-400" />
              <h2 className="text-xl font-semibold">Ask CaseBuddy</h2>
            </div>
            <p className="text-sm text-slate-400 mt-1">
              Ask the legal question or describe the work. CaseBuddy routes it to the right specialty and keeps the matter context attached.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="px-3 py-1.5 rounded-full border border-slate-700 bg-slate-800/80 text-slate-300">
              Matter: <span className="text-white font-medium">{matterLabel}</span>
            </span>
            <span className="px-3 py-1.5 rounded-full border border-gold-500/20 bg-gold-500/10 text-gold-300">
              {currentRoute.emoji} {currentRoute.title}
            </span>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
        {messages.length === 0 && (
          <div className="max-w-3xl mx-auto py-8 sm:py-14">
            <div className="text-center mb-8">
              <div className="w-16 h-16 mx-auto rounded-2xl border border-gold-500/20 bg-gold-500/10 flex items-center justify-center mb-4">
                <Sparkles size={30} className="text-gold-400" />
              </div>
              <h3 className="text-2xl font-serif font-semibold text-white">Start with the problem, not the module.</h3>
              <p className="text-slate-400 mt-2 max-w-xl mx-auto">
                You do not need to know which tool or specialist to open. Tell CaseBuddy what happened, what you need, or what you want accomplished.
              </p>
            </div>

            <div className="grid md:grid-cols-3 gap-3">
              {STARTERS.map(({ icon: Icon, label, prompt }) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => void send(prompt)}
                  className="text-left p-4 rounded-xl border border-slate-800 bg-slate-900/60 hover:border-gold-500/30 hover:bg-slate-900 transition-colors"
                >
                  <Icon size={20} className="text-gold-400 mb-3" />
                  <div className="text-sm font-semibold text-white">{label}</div>
                  <div className="text-xs text-slate-500 mt-1 line-clamp-3">{prompt}</div>
                </button>
              ))}
            </div>

            <div className="mt-6 flex items-start gap-3 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
              <ShieldCheck size={18} className="text-emerald-400 mt-0.5 shrink-0" />
              <p className="text-xs text-slate-400 leading-relaxed">
                CaseBuddy is designed to preserve the difference between record facts, allegations, analysis, and items that still need verification. Consequential external actions should remain reviewable rather than silently autonomous.
              </p>
            </div>
          </div>
        )}

        {messages.map((message, index) => (
          <div key={`${message.timestamp}-${index}`} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[92%] lg:max-w-[78%] ${message.role === 'assistant' ? 'space-y-2' : ''}`}>
              {message.role === 'assistant' && message.route && (
                <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500 px-1">
                  <span className="text-slate-300">{message.route.emoji} {message.route.name}</span>
                  <span>·</span>
                  <span>{message.route.reason}</span>
                  <Link
                    to={message.route.workspaceRoute}
                    className="inline-flex items-center gap-1 text-gold-400 hover:text-gold-300"
                  >
                    Open workspace <ArrowRight size={11} />
                  </Link>
                </div>
              )}
              <div className={`rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${
                message.role === 'user'
                  ? 'bg-gold-500 text-slate-950 rounded-tr-sm'
                  : 'bg-slate-900 border border-slate-800 text-slate-200 rounded-tl-sm'
              }`}>
                {message.text}
              </div>
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className="rounded-2xl rounded-tl-sm px-4 py-3 border border-slate-800 bg-slate-900 text-sm text-slate-400 flex items-center gap-2">
              <Loader2 size={15} className="animate-spin text-gold-400" />
              CaseBuddy is working through the matter…
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="border-t border-slate-800 bg-slate-900/80 p-3 sm:p-4">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-end gap-2 rounded-xl border border-slate-700 bg-slate-950/70 p-2 focus-within:border-gold-500/50">
            <textarea
              value={input}
              onChange={event => setInput(event.target.value)}
              onKeyDown={handleKeyDown}
              rows={2}
              placeholder={activeCase ? `Ask anything about ${activeCase.title}, or tell CaseBuddy what to accomplish…` : 'Ask a legal question or describe what you need accomplished…'}
              className="flex-1 bg-transparent resize-none outline-none text-sm text-white placeholder:text-slate-600 px-2 py-1.5"
            />
            <VoiceInput
              disabled={loading}
              onTranscript={transcript => setInput(prev => `${prev}${prev ? ' ' : ''}${transcript}`)}
            />
            <button
              type="button"
              onClick={() => void send()}
              disabled={loading || !input.trim()}
              className="p-2 rounded-lg bg-gold-500 text-slate-950 hover:bg-gold-400 disabled:bg-slate-800 disabled:text-slate-600 transition-colors"
              title="Send"
            >
              <Send size={18} />
            </button>
          </div>
          <div className="mt-2 flex items-center justify-between gap-3">
            <AIDisclaimer variant="compact" />
            {messages.length > 0 && (
              <button
                type="button"
                onClick={reset}
                className="inline-flex items-center gap-1 text-[11px] text-slate-600 hover:text-slate-400"
              >
                <RotateCcw size={11} /> New conversation
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AskCaseBuddy;
