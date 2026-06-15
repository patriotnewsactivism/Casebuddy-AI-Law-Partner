import React, { useContext, useEffect, useRef, useState } from 'react';
import {
  Sparkles,
  X,
  Send,
  Trash2,
  FileText,
  AlertTriangle,
  ListChecks,
  FilePlus2,
} from 'lucide-react';
import { AppContext } from '../App';
import { askCopilotStream } from '../services/geminiService';
import { Case } from '../types';

interface CopilotMessage {
  role: 'user' | 'model';
  text: string;
  timestamp: number;
}

const STORAGE_KEY = 'casebuddy_copilot_chat';
const MAX_STORED = 50;

const QUICK_ACTIONS: { label: string; prompt: string; icon: React.ReactNode }[] = [
  {
    label: 'Summarize my case',
    prompt: 'Give me a concise summary of my active case and where it stands.',
    icon: <FileText className="w-4 h-4" />,
  },
  {
    label: 'Draft a quick motion',
    prompt: 'Draft a short, well-structured motion appropriate for the current posture of my case.',
    icon: <FilePlus2 className="w-4 h-4" />,
  },
  {
    label: 'What are my risks?',
    prompt: 'What are the biggest legal and strategic risks in my active case right now?',
    icon: <AlertTriangle className="w-4 h-4" />,
  },
  {
    label: 'Suggest next steps',
    prompt: 'What concrete next steps should I take to move my case forward effectively?',
    icon: <ListChecks className="w-4 h-4" />,
  },
];

const buildCaseContext = (c: Case | null): string | undefined => {
  if (!c) return undefined;
  return [
    `Title: ${c.title}`,
    `Client: ${c.client}`,
    `Status: ${c.status}`,
    `Opposing Counsel: ${c.opposingCounsel}`,
    `Judge: ${c.judge}`,
    `Next Court Date: ${c.nextCourtDate}`,
    `Estimated Win Probability: ${c.winProbability}%`,
    `Summary: ${c.summary}`,
  ].join('\n');
};

const loadStoredMessages = (): CopilotMessage[] => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (m: any) =>
          m &&
          (m.role === 'user' || m.role === 'model') &&
          typeof m.text === 'string'
      )
      .slice(-MAX_STORED);
  } catch {
    return [];
  }
};

const CopilotSidebar: React.FC = () => {
  const { activeCase } = useContext(AppContext);
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<CopilotMessage[]>(loadStoredMessages);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [streamingText, setStreamingText] = useState('');

  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Persist conversation (last 50 messages)
  useEffect(() => {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(messages.slice(-MAX_STORED))
      );
    } catch {
      /* ignore quota / serialization errors */
    }
  }, [messages]);

  // Auto-scroll to bottom on new messages / typing indicator
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading]);

  // Focus input when panel opens
  useEffect(() => {
    if (isOpen) {
      const t = setTimeout(() => textareaRef.current?.focus(), 150);
      return () => clearTimeout(t);
    }
  }, [isOpen]);

  const send = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || loading) return;

    const userMsg: CopilotMessage = { role: 'user', text: trimmed, timestamp: Date.now() };
    const history = messages.map(m => ({ role: m.role, text: m.text }));

    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);
    setStreamingText('');

    try {
      let fullText = '';
      for await (const chunk of askCopilotStream(trimmed, history, buildCaseContext(activeCase))) {
        fullText += chunk;
        setStreamingText(fullText);
      }
      setMessages(prev => [...prev, { role: 'model', text: fullText, timestamp: Date.now() }]);
    } catch {
      setMessages(prev => [
        ...prev,
        { role: 'model', text: "I couldn't reach the AI service just now. Please check your connection or API key and try again.", timestamp: Date.now() },
      ]);
    } finally {
      setLoading(false);
      setStreamingText('');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send(input);
    }
  };

  const clearConversation = () => {
    setMessages([]);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
  };

  return (
    <>
      {/* Floating action button */}
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        aria-label="Open Legal Copilot"
        className={`fixed bottom-6 right-6 z-40 flex items-center justify-center w-14 h-14 rounded-full bg-gold-500 text-slate-950 shadow-lg shadow-gold-500/30 hover:bg-gold-400 hover:scale-105 active:scale-95 transition-all duration-200 ${
          isOpen ? 'opacity-0 pointer-events-none' : 'opacity-100'
        }`}
      >
        <Sparkles className="w-6 h-6" />
      </button>

      {/* Backdrop overlay (mobile) */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm sm:bg-black/30"
          onClick={() => setIsOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Slide-in panel */}
      <aside
        className={`fixed right-0 top-0 h-full w-full sm:w-96 z-50 flex flex-col bg-slate-950 border-l border-slate-800 shadow-2xl transition-transform duration-300 ease-out ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
        role="dialog"
        aria-label="Legal Copilot"
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 px-4 py-4 border-b border-slate-800 bg-slate-900">
          <div className="min-w-0">
            <h2 className="flex items-center gap-2 text-base font-semibold text-gold-500">
              <span aria-hidden="true">⚡</span>
              Legal Copilot
            </h2>
            <p className="mt-0.5 text-xs text-slate-400 truncate">
              {activeCase ? activeCase.title : 'No active case'}
            </p>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={clearConversation}
              aria-label="Clear conversation"
              className="flex items-center gap-1 px-2 py-1.5 text-xs text-slate-400 rounded-md hover:text-slate-200 hover:bg-slate-800 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Clear</span>
            </button>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              aria-label="Close Legal Copilot"
              className="p-1.5 text-slate-400 rounded-md hover:text-slate-200 hover:bg-slate-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Message list */}
        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto px-4 py-4 space-y-4"
        >
          {messages.length === 0 && !loading ? (
            <div className="flex flex-col items-center text-center pt-6">
              <div className="flex items-center justify-center w-12 h-12 rounded-full bg-gold-500/10 border border-gold-500/30 mb-3">
                <Sparkles className="w-6 h-6 text-gold-500" />
              </div>
              <h3 className="text-sm font-semibold text-slate-200">
                Your AI litigation partner
              </h3>
              <p className="mt-1 text-xs text-slate-400 max-w-[16rem]">
                Ask anything about your case, draft documents, or get tactical
                strategy. {activeCase ? 'Grounded in your active case.' : 'Select a case for tailored advice.'}
              </p>

              <div className="mt-5 w-full grid grid-cols-1 gap-2">
                {QUICK_ACTIONS.map(action => (
                  <button
                    key={action.label}
                    type="button"
                    onClick={() => send(action.prompt)}
                    className="flex items-center gap-2 px-3 py-2.5 text-left text-sm text-slate-200 bg-slate-900 border border-slate-800 rounded-lg hover:border-gold-500/50 hover:bg-slate-800 transition-colors"
                  >
                    <span className="text-gold-500">{action.icon}</span>
                    {action.label}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((m, i) => (
              <div
                key={`${m.timestamp}-${i}`}
                className={`flex ${
                  m.role === 'user' ? 'justify-end' : 'justify-start'
                }`}
              >
                <div
                  className={`max-w-[85%] px-3.5 py-2.5 rounded-2xl text-sm whitespace-pre-wrap break-words ${
                    m.role === 'user'
                      ? 'bg-slate-800 text-slate-100 rounded-br-sm'
                      : 'bg-gold-500/10 text-slate-100 border border-gold-500/30 rounded-bl-sm'
                  }`}
                >
                  {m.text}
                </div>
              </div>
            ))
          )}

          {/* Streaming / typing indicator */}
          {loading && (
            <div className="flex justify-start">
              {streamingText ? (
                <div className="max-w-[85%] px-3.5 py-2.5 rounded-2xl rounded-bl-sm bg-gold-500/10 text-slate-100 border border-gold-500/30 text-sm whitespace-pre-wrap break-words">
                  {streamingText}
                  <span className="inline-block w-1.5 h-4 ml-0.5 bg-gold-400 animate-pulse align-middle" />
                </div>
              ) : (
                <div className="flex items-center gap-1.5 px-4 py-3 rounded-2xl rounded-bl-sm bg-gold-500/10 border border-gold-500/30">
                  <span className="w-2 h-2 rounded-full bg-gold-500 animate-bounce [animation-delay:-0.3s]" />
                  <span className="w-2 h-2 rounded-full bg-gold-500 animate-bounce [animation-delay:-0.15s]" />
                  <span className="w-2 h-2 rounded-full bg-gold-500 animate-bounce" />
                </div>
              )}
            </div>
          )}
        </div>

        {/* Input */}
        <div className="border-t border-slate-800 bg-slate-900 px-3 py-3">
          <div className="flex items-end gap-2">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              rows={1}
              placeholder="Ask your Legal Copilot..."
              className="flex-1 resize-none max-h-32 px-3 py-2.5 text-sm text-slate-100 placeholder-slate-500 bg-slate-950 border border-slate-800 rounded-lg focus:outline-none focus:border-gold-500/50 focus:ring-1 focus:ring-gold-500/30"
            />
            <button
              type="button"
              onClick={() => send(input)}
              disabled={!input.trim() || loading}
              aria-label="Send message"
              className="flex items-center justify-center w-10 h-10 shrink-0 rounded-lg bg-gold-500 text-slate-950 hover:bg-gold-400 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <Send className="w-5 h-5" />
            </button>
          </div>
          <p className="mt-1.5 text-[10px] text-slate-500 text-center">
            AI guidance — verify against jurisdiction rules. Not legal advice.
          </p>
        </div>
      </aside>
    </>
  );
};

export default CopilotSidebar;
