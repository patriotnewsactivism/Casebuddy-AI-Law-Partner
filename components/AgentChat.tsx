import React, { useContext, useEffect, useRef, useState } from 'react';
import { ArrowLeft, Send, Loader2, Mail } from 'lucide-react';
import { OperationalAgent } from '../agents/personas';
import { getVoiceProfile } from '../agents/voiceProfiles';
import { agentEmail } from '../agents/firmEmail';
import { chatWithAgent } from '../services/geminiService';
import { AppContext } from '../App';

// Text-message any AI employee. Same persona as their voice line, but typed —
// for when you'd rather message than call.

interface Msg { role: 'user' | 'model'; text: string }

const AgentChat: React.FC<{ agent: OperationalAgent; onBack: () => void }> = ({ agent, onBack }) => {
  const { activeCase } = useContext(AppContext);
  const profile = getVoiceProfile(agent.id);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  const systemInstruction =
    profile?.systemInstruction ||
    `You are ${agent.name}, the firm's ${agent.title}. ${agent.description} Be warm, concise, and genuinely helpful. Stay in character; never mention being an AI unless asked directly.`;

  const caseContext = activeCase
    ? `Case: ${activeCase.title}\nClient: ${activeCase.client}\nStatus: ${activeCase.status}\nSummary: ${activeCase.summary}`
    : undefined;

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, sending]);

  const send = async () => {
    const text = input.trim();
    if (!text || sending) return;
    const history = messages;
    setMessages(prev => [...prev, { role: 'user', text }]);
    setInput('');
    setSending(true);
    try {
      const reply = await chatWithAgent(systemInstruction, text, history, caseContext);
      setMessages(prev => [...prev, { role: 'model', text: reply }]);
    } catch {
      setMessages(prev => [...prev, { role: 'model', text: "Sorry — I couldn't get back to you just then. Mind sending that again?" }]);
    } finally {
      setSending(false);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  return (
    <div className="max-w-2xl mx-auto flex flex-col h-[calc(100vh-8rem)]">
      {/* Header */}
      <div className="flex items-center gap-3 pb-4 border-b border-slate-800">
        <button onClick={onBack} aria-label="Back to firm reception" className="p-2 rounded-lg hover:bg-slate-800 text-slate-400 transition-colors">
          <ArrowLeft size={18} />
        </button>
        <div className={`text-3xl w-12 h-12 rounded-full flex items-center justify-center ${agent.bgClass} ${agent.borderClass} border`}>
          {agent.emoji}
        </div>
        <div className="min-w-0">
          <h2 className={`text-lg font-bold ${agent.colorClass}`}>{agent.name}</h2>
          <p className="text-xs text-slate-500 flex items-center gap-1.5 truncate">
            <Mail size={11} /> {agentEmail(agent.id)}
          </p>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto py-4 space-y-3">
        {messages.length === 0 && (
          <div className="text-center text-slate-500 mt-10 px-6">
            <div className="text-4xl mb-3">{agent.emoji}</div>
            <p className="text-sm">
              Message <span className={agent.colorClass}>{agent.name}</span> — {agent.title}.
              {activeCase ? <> They have <span className="text-gold-400">{activeCase.title}</span> in front of them.</> : ' Ask anything to get started.'}
            </p>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[82%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${
                m.role === 'user'
                  ? 'bg-gold-500/15 border border-gold-500/30 text-gold-50 rounded-br-sm'
                  : 'bg-slate-800 border border-slate-700 text-slate-100 rounded-bl-sm'
              }`}
            >
              {m.text}
            </div>
          </div>
        ))}
        {sending && (
          <div className="flex justify-start">
            <div className="px-4 py-2.5 rounded-2xl rounded-bl-sm bg-slate-800 border border-slate-700 text-slate-400">
              <Loader2 size={15} className="animate-spin" />
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      {/* Composer */}
      <div className="pt-3 border-t border-slate-800">
        <div className="flex items-end gap-2">
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            rows={1}
            aria-label={`Message ${agent.name}`}
            placeholder={`Message ${agent.name}…`}
            className="flex-1 resize-none bg-slate-900 border border-slate-700 focus:border-gold-500/60 rounded-xl px-4 py-3 text-sm text-slate-100 placeholder:text-slate-600 outline-none max-h-32"
          />
          <button
            onClick={send}
            disabled={!input.trim() || sending}
            aria-label="Send message"
            className="p-3 rounded-xl bg-gold-500 hover:bg-gold-400 disabled:opacity-40 disabled:cursor-not-allowed text-slate-950 transition-colors"
          >
            <Send size={18} />
          </button>
        </div>
      </div>
    </div>
  );
};

export default AgentChat;
