import React, { useState, useRef, useEffect, useContext } from 'react';
import { AppContext } from '../App';
import { MessageSquare, X, Send, Minimize2, Maximize2, Sparkles, Loader } from 'lucide-react';
import { deepseekChat } from '../services/deepseek';

interface Message {
  role: 'user' | 'assistant';
  text: string;
  timestamp: number;
}

const SYSTEM_PROMPT = `You are a senior AI legal partner at CaseBuddy. You have access to the user's current case context and can:
- Answer legal questions across all practice areas
- Draft any legal document on command
- Suggest case strategy and tactics
- Identify risks and opportunities
- Explain legal procedures and deadlines
Be concise, precise, and practical. Always note when the user should consult a licensed attorney for jurisdiction-specific advice.`;

const AICopilot: React.FC = () => {
  const { cases, activeCase } = useContext(AppContext);
  const [open, setOpen] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      text: `Hello! I'm your AI Legal Copilot 🏛️\n\n${activeCase ? `I can see you're working on **${activeCase.title}**. Ask me anything about this case, request a document draft, or get strategic advice.` : 'Open or select a case and I\'ll have full context. Ask me anything — strategy, documents, legal questions.'}\n\nHow can I help you today?`,
      timestamp: Date.now(),
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const buildContext = () => {
    if (!activeCase) return '';
    return `\n\nCurrent Case Context:\n- Title: ${activeCase.title}\n- Client: ${activeCase.client}\n- Status: ${activeCase.status}\n- Judge: ${activeCase.judge || 'N/A'}\n- Opposing Counsel: ${activeCase.opposingCounsel || 'N/A'}\n- Next Court Date: ${activeCase.nextCourtDate || 'N/A'}\n- Summary: ${activeCase.summary || 'N/A'}\n- Win Probability: ${activeCase.winProbability ? activeCase.winProbability + '%' : 'N/A'}`;
  };

  const sendMessage = async () => {
    if (!input.trim() || loading) return;
    const userMsg: Message = { role: 'user', text: input.trim(), timestamp: Date.now() };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const history = messages.map(m => ({
        role: m.role === 'assistant' ? 'assistant' as const : 'user' as const,
        content: m.text,
      }));

      const reply = await deepseekChat({
        systemInstruction: SYSTEM_PROMPT + buildContext(),
        messages: history,
        temperature: 0.7,
        maxTokens: 2048,
      });
      setMessages(prev => [...prev, { role: 'assistant', text: reply, timestamp: Date.now() }]);
    } catch (e) {
      setMessages(prev => [...prev, { role: 'assistant', text: 'Connection error. Please check your API key and try again.', timestamp: Date.now() }]);
    } finally {
      setLoading(false);
    }
  };

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  const quickPrompts = [
    '📋 Summarize my case strengths',
    '⚠️ What are the biggest risks?',
    '📝 Draft an opening statement',
    '🔍 What discovery should I request?',
  ];

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 z-50 flex items-center gap-2 bg-gradient-to-r from-gold-500 to-amber-500 text-slate-900 font-bold px-4 py-3 rounded-full shadow-2xl hover:scale-105 transition-transform"
        title="AI Legal Copilot"
      >
        <Sparkles size={20} />
        <span className="hidden sm:inline">AI Copilot</span>
      </button>
    );
  }

  return (
    <div className={`fixed bottom-6 right-6 z-50 flex flex-col bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl transition-all duration-300 ${minimized ? 'w-72 h-14' : 'w-96 h-[600px] max-h-[90vh]'}`}>
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 bg-gradient-to-r from-gold-600/20 to-amber-600/20 border-b border-slate-700 rounded-t-2xl">
        <Sparkles size={18} className="text-gold-400" />
        <span className="font-bold text-white flex-1">AI Legal Copilot</span>
        {activeCase && <span className="text-xs text-gold-400 truncate max-w-[100px]">{activeCase.title}</span>}
        <button onClick={() => setMinimized(!minimized)} className="text-slate-400 hover:text-white ml-1">
          {minimized ? <Maximize2 size={16} /> : <Minimize2 size={16} />}
        </button>
        <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-red-400 ml-1">
          <X size={16} />
        </button>
      </div>

      {!minimized && (
        <>
          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] rounded-xl px-3 py-2 text-sm whitespace-pre-wrap ${m.role === 'user' ? 'bg-gold-500/20 text-gold-100 border border-gold-500/30' : 'bg-slate-800 text-slate-200 border border-slate-700'}`}>
                  {m.text}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 flex items-center gap-2 text-slate-400 text-sm">
                  <Loader size={14} className="animate-spin" /> Thinking...
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Quick prompts */}
          {messages.length <= 1 && (
            <div className="px-4 pb-2 flex flex-wrap gap-1">
              {quickPrompts.map((p, i) => (
                <button key={i} onClick={() => { setInput(p); inputRef.current?.focus(); }}
                  className="text-xs bg-slate-800 border border-slate-700 text-slate-300 rounded-full px-2 py-1 hover:border-gold-500/50 hover:text-gold-300 transition-colors">
                  {p}
                </button>
              ))}
            </div>
          )}

          {/* Input */}
          <div className="p-3 border-t border-slate-700 flex gap-2 items-end">
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKey}
              placeholder="Ask anything — strategy, drafts, legal questions..."
              rows={2}
              className="flex-1 bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white placeholder-slate-500 resize-none focus:outline-none focus:border-gold-500/50"
            />
            <button onClick={sendMessage} disabled={!input.trim() || loading}
              className="bg-gold-500 hover:bg-gold-400 disabled:opacity-40 text-slate-900 rounded-xl p-2 transition-colors">
              <Send size={16} />
            </button>
          </div>
        </>
      )}
    </div>
  );
};

export default AICopilot;
