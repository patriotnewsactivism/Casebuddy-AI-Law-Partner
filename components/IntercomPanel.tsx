import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Phone, PhoneOff, Mic, MicOff, X, MessageSquare, Loader2 } from 'lucide-react';
import { streamTTS, createPCMPlayer, openSTTSocket } from '../services/deepgramService';

interface Message { role: 'user' | 'agent'; text: string; ts: number; }

interface AgentConfig {
  id: string; name: string; emoji: string; role: string;
  colorClass: string; personality: string; voiceModel: string;
}

const INTERCOM_AGENTS: AgentConfig[] = [
  { id: 'maya',   name: 'Maya',   emoji: '👩‍💼', role: 'Intake Specialist',
    colorClass: 'from-blue-600 to-blue-800',
    personality: 'Warm, efficient, gets to the point fast. Short sentences. No filler.',
    voiceModel: 'aura-2-thalia-en' },
  { id: 'sol',    name: 'Sol',    emoji: '⏱️',  role: 'Deadline Tracker',
    colorClass: 'from-amber-600 to-orange-800',
    personality: 'Precise, urgent when needed. Sharp. No fluff.',
    voiceModel: 'aura-2-orion-en' },
  { id: 'lex',    name: 'Lex',    emoji: '📚',  role: 'Legal Researcher',
    colorClass: 'from-purple-600 to-purple-900',
    personality: 'Analytical but accessible. Confident. Summarizes complex things simply.',
    voiceModel: 'aura-2-orion-en' },
  { id: 'rex',    name: 'Rex',    emoji: '⚔️',  role: 'Trial Strategist',
    colorClass: 'from-red-700 to-red-900',
    personality: 'Confident, assertive, strategic. Bold but not arrogant.',
    voiceModel: 'aura-2-orion-en' },
  { id: 'sierra', name: 'Sierra', emoji: '💬',  role: 'Client Relations',
    colorClass: 'from-green-600 to-green-800',
    personality: 'Warm, empathetic. Makes everyone feel heard.',
    voiceModel: 'aura-2-thalia-en' },
  { id: 'doc',    name: 'Doc',    emoji: '📝',  role: 'Legal Drafter',
    colorClass: 'from-slate-600 to-slate-800',
    personality: 'Methodical, clear, thorough.',
    voiceModel: 'aura-2-orion-en' },
];

const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

const IntercomPanel: React.FC<{ onClose?: () => void }> = ({ onClose }) => {
  const [activeAgent, setActiveAgent] = useState<AgentConfig | null>(null);
  const [callActive,  setCallActive]  = useState(false);
  const [messages,    setMessages]    = useState<Message[]>([]);
  const [muted,       setMuted]       = useState(false);
  const [speaking,    setSpeaking]    = useState(false);
  const [listening,   setListening]   = useState(false);
  const [textMode,    setTextMode]    = useState(false);
  const [textInput,   setTextInput]   = useState('');
  const [loading,     setLoading]     = useState(false);
  const [callDuration,setCallDuration]= useState(0);

  const playerRef    = useRef<ReturnType<typeof createPCMPlayer> | null>(null);
  const sttRef       = useRef<{ sendAudio:(d:ArrayBuffer)=>void; close:()=>void } | null>(null);
  const micRef       = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const audioCtxRef  = useRef<AudioContext | null>(null);
  const timerRef     = useRef<ReturnType<typeof setInterval> | null>(null);
  const bottomRef    = useRef<HTMLDivElement>(null);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  useEffect(() => {
    if (callActive) {
      timerRef.current = setInterval(() => setCallDuration(d => d + 1), 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
      setCallDuration(0);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [callActive]);

  const fmt = (s: number) =>
    String(Math.floor(s / 60)).padStart(2,'0') + ':' + String(s % 60).padStart(2,'0');

  const getKey = () =>
    (window as any).__GEMINI_API_KEY || import.meta.env.VITE_GEMINI_API_KEY || '';

  const speak = useCallback(async (text: string, agent: AgentConfig) => {
    if (!playerRef.current) return;
    setSpeaking(true);
    try {
      for await (const chunk of streamTTS(text, agent.voiceModel)) {
        await playerRef.current.playChunk(chunk);
      }
    } catch {}
    setSpeaking(false);
  }, []);

  const getReply = useCallback(async (userText: string, agent: AgentConfig, history: Message[]) => {
    const key = getKey();
    if (!key) return "No AI connection right now — try text mode.";
    const sys = `You are ${agent.name}, ${agent.role} at CaseBuddy AI Law Firm, on a live intercom call with the attorney.
Personality: ${agent.personality}
Rules: Keep responses to 1-3 sentences max. Sound like a real colleague on a quick call. Get to the point immediately. No filler phrases.`;
    const contents = [
      { role: 'user',  parts: [{ text: sys }] },
      { role: 'model', parts: [{ text: `Got it — ${agent.name} here.` }] },
      ...history.slice(-8).map(m => ({
        role: m.role === 'user' ? 'user' : 'model',
        parts: [{ text: m.text }],
      })),
      { role: 'user', parts: [{ text: userText }] },
    ];
    const res = await fetch(`${GEMINI_URL}?key=${key}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents, generationConfig: { temperature: 0.8, maxOutputTokens: 120 } }),
    });
    const data = await res.json() as any;
    return (data.candidates?.[0]?.content?.parts?.[0]?.text || '').trim();
  }, []);

  const handleSpeech = useCallback(async (text: string) => {
    if (!text.trim() || !activeAgent) return;
    const userMsg: Message = { role: 'user', text, ts: Date.now() };
    setMessages(prev => {
      const next = [...prev, userMsg];
      (async () => {
        setLoading(true);
        try {
          const reply = await getReply(text, activeAgent, next);
          const agentMsg: Message = { role: 'agent', text: reply, ts: Date.now() };
          setMessages(pp => [...pp, agentMsg]);
          await speak(reply, activeAgent);
        } catch {
          const errMsg: Message = { role: 'agent', text: 'Connection issue — please try again.', ts: Date.now() };
          setMessages(pp => [...pp, errMsg]);
        } finally {
          setLoading(false);
        }
      })();
      return next;
    });
  }, [activeAgent, getReply, speak]);

  const startCall = useCallback(async (agent: AgentConfig) => {
    setActiveAgent(agent);
    setMessages([]);
    setCallActive(true);
    setListening(false);
    playerRef.current = createPCMPlayer(setSpeaking);

    const greeting = `Hey, ${agent.name} here. What do you need?`;
    setMessages([{ role: 'agent', text: greeting, ts: Date.now() }]);
    setTimeout(() => speak(greeting, agent), 300);

    if (!textMode) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        micRef.current = stream;
        const ctx = new AudioContext({ sampleRate: 16000 });
        audioCtxRef.current = ctx;
        const source = ctx.createMediaStreamSource(stream);
        const processor = ctx.createScriptProcessor(4096, 1, 1);
        processorRef.current = processor;
        sttRef.current = openSTTSocket(
          (event) => {
            if (event.type === 'final' && event.text.trim()) handleSpeech(event.text.trim());
          },
          (err) => console.warn('STT:', err)
        );
        processor.onaudioprocess = (e) => {
          if (muted || speaking) return;
          const input = e.inputBuffer.getChannelData(0);
          const int16 = new Int16Array(input.length);
          for (let i = 0; i < input.length; i++)
            int16[i] = Math.max(-32768, Math.min(32767, input[i] * 32768));
          sttRef.current?.sendAudio(int16.buffer);
        };
        source.connect(processor);
        processor.connect(ctx.destination);
        setListening(true);
      } catch { setTextMode(true); }
    }
  }, [textMode, speak, handleSpeech, muted, speaking]);

  const endCall = useCallback(() => {
    sttRef.current?.close();
    playerRef.current?.stop();
    processorRef.current?.disconnect();
    audioCtxRef.current?.close().catch(() => {});
    micRef.current?.getTracks().forEach(t => t.stop());
    sttRef.current = null; playerRef.current = null;
    processorRef.current = null; micRef.current = null;
    setCallActive(false); setActiveAgent(null);
    setListening(false); setSpeaking(false); setMessages([]);
  }, []);

  const sendText = async () => {
    if (!textInput.trim() || !activeAgent || loading) return;
    const t = textInput.trim(); setTextInput('');
    await handleSpeech(t);
  };

  return (
    <div className="flex flex-col h-full bg-slate-900">
      <div className="flex items-center justify-between p-4 border-b border-slate-700 bg-slate-800">
        <div className="flex items-center gap-3">
          <Phone className="text-gold-500" size={20} />
          <div>
            <h2 className="text-white font-bold">Firm Intercom</h2>
            <p className="text-xs text-slate-400">Direct line to your AI team</p>
          </div>
        </div>
        {callActive && (
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
            <span className="text-green-400 text-sm font-mono">{fmt(callDuration)}</span>
          </div>
        )}
        {onClose && (
          <button onClick={onClose} className="text-slate-400 hover:text-white p-1"><X size={18} /></button>
        )}
      </div>

      {!callActive ? (
        <div className="flex-1 overflow-y-auto p-4">
          <p className="text-slate-400 text-sm mb-4 text-center">Tap an agent to open a direct line</p>
          <div className="grid grid-cols-2 gap-3">
            {INTERCOM_AGENTS.map(agent => (
              <button key={agent.id} onClick={() => startCall(agent)}
                className={"relative bg-gradient-to-br " + agent.colorClass + " rounded-2xl p-4 text-left border border-white/10 hover:scale-105 active:scale-95 transition-all shadow-lg"}>
                <div className="text-3xl mb-2">{agent.emoji}</div>
                <p className="text-white font-bold text-sm">{agent.name}</p>
                <p className="text-white/60 text-xs">{agent.role}</p>
                <div className="absolute top-3 right-3 w-2.5 h-2.5 rounded-full bg-green-400 shadow-[0_0_6px_2px_rgba(74,222,128,0.4)]" />
              </button>
            ))}
          </div>
          <div className="mt-4 p-3 bg-slate-800 rounded-xl border border-slate-700">
            <label className="flex items-center gap-3 cursor-pointer">
              <MessageSquare size={16} className="text-slate-400" />
              <span className="text-slate-300 text-sm">Text-only mode</span>
              <input type="checkbox" checked={textMode} onChange={e => setTextMode(e.target.checked)}
                className="ml-auto w-4 h-4 accent-gold-500" />
            </label>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col overflow-hidden">
          {activeAgent && (
            <div className={"flex items-center gap-3 p-4 bg-gradient-to-r " + activeAgent.colorClass + " border-b border-white/10"}>
              <span className="text-3xl">{activeAgent.emoji}</span>
              <div>
                <p className="text-white font-bold">{activeAgent.name}</p>
                <p className="text-white/70 text-xs">{activeAgent.role}</p>
              </div>
              {speaking && (
                <div className="ml-auto flex items-end gap-0.5">
                  {[8,14,10,16,8].map((h,i) => (
                    <div key={i} className="w-1.5 bg-white/80 rounded-full animate-bounce"
                      style={{ height: h, animationDelay: i * 0.1 + 's' }} />
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {messages.map((msg, i) => (
              <div key={i} className={"flex " + (msg.role === 'user' ? 'justify-end' : 'justify-start')}>
                <div className={"max-w-[80%] px-4 py-2.5 rounded-2xl text-sm " +
                  (msg.role === 'user'
                    ? 'bg-gold-500 text-slate-900 rounded-br-sm'
                    : 'bg-slate-700 text-white rounded-bl-sm')}>
                  {msg.text}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="bg-slate-700 px-4 py-3 rounded-2xl rounded-bl-sm">
                  <div className="flex gap-1">
                    {[0,1,2].map(i => (
                      <div key={i} className="w-2 h-2 bg-slate-400 rounded-full animate-bounce"
                        style={{ animationDelay: i * 0.15 + 's' }} />
                    ))}
                  </div>
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          <div className="p-4 border-t border-slate-700 bg-slate-800">
            {(textMode || !listening) && (
              <div className="flex gap-2 mb-3">
                <input value={textInput} onChange={e => setTextInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && sendText()}
                  placeholder="Type your message…"
                  className="flex-1 bg-slate-700 text-white text-sm rounded-xl px-4 py-2.5 border border-slate-600 focus:border-gold-500 focus:outline-none placeholder:text-slate-500" />
                <button onClick={sendText} disabled={!textInput.trim() || loading}
                  className="bg-gold-500 hover:bg-gold-400 disabled:opacity-40 text-slate-900 font-bold px-4 py-2.5 rounded-xl text-sm">
                  Send
                </button>
              </div>
            )}
            {!textMode && listening && (
              <div className="flex items-center justify-center gap-2 mb-3 text-sm">
                <div className={"w-2 h-2 rounded-full " + (muted ? 'bg-slate-500' : 'bg-green-400 animate-pulse')} />
                <span className={muted ? 'text-slate-400' : 'text-green-400'}>{muted ? 'Muted' : 'Listening…'}</span>
              </div>
            )}
            <div className="flex items-center justify-center gap-6">
              <button onClick={() => setMuted(m => !m)}
                className={"flex flex-col items-center gap-1 p-3 rounded-2xl transition-colors " +
                  (muted ? 'bg-red-500/20 text-red-400' : 'bg-slate-700 text-slate-300 hover:bg-slate-600')}>
                {muted ? <MicOff size={20} /> : <Mic size={20} />}
                <span className="text-xs">{muted ? 'Unmute' : 'Mute'}</span>
              </button>
              <button onClick={endCall}
                className="flex flex-col items-center gap-1 p-4 bg-red-600 hover:bg-red-500 text-white rounded-full transition-colors shadow-lg">
                <PhoneOff size={24} />
                <span className="text-xs">End</span>
              </button>
              <button onClick={() => setTextMode(m => !m)}
                className={"flex flex-col items-center gap-1 p-3 rounded-2xl transition-colors " +
                  (textMode ? 'bg-gold-500/20 text-gold-400' : 'bg-slate-700 text-slate-300 hover:bg-slate-600')}>
                <MessageSquare size={20} />
                <span className="text-xs">Text</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default IntercomPanel;
