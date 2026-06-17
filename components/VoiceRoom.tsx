import React, { useContext, useEffect, useRef } from 'react';
import { Phone, PhoneOff, ArrowLeft, Mic, Volume2, AlertCircle } from 'lucide-react';
import { OperationalAgent } from '../agents/personas';
import { getVoiceProfile } from '../agents/voiceProfiles';
import { useDeepgramVoiceAgent } from '../hooks/useDeepgramVoiceAgent';
import { AppContext } from '../App';

interface VoiceRoomProps {
  agent: OperationalAgent;
  onBack: () => void;
}

const buildCaseContext = (c: any): string | undefined => {
  if (!c) return undefined;
  return [
    `Title: ${c.title}`,
    `Client: ${c.client}`,
    `Status: ${c.status}`,
    `Opposing Counsel: ${c.opposingCounsel}`,
    `Judge: ${c.judge}`,
    `Next Court Date: ${c.nextCourtDate}`,
    `Summary: ${c.summary}`,
  ].join('\n');
};

const VoiceRoom: React.FC<VoiceRoomProps> = ({ agent, onBack }) => {
  const { activeCase } = useContext(AppContext);
  const profile = getVoiceProfile(agent.id);

  const voice = useDeepgramVoiceAgent({
    voiceModel: profile?.auraVoice ?? 'aura-2-thalia-en',
    systemInstruction: profile?.systemInstruction ?? `You are ${agent.name}, ${agent.title}.`,
    greeting:
      profile?.greeting ?? `Hi, this is ${agent.name}. How can I help you today?`,
    caseContext: buildCaseContext(activeCase),
  });

  const { status, error, liveCaption, transcript, inputLevel, agentSpeaking, start, stop } = voice;
  const transcriptEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [transcript, liveCaption]);

  const statusLine =
    status === 'connecting'
      ? `Connecting to ${agent.name}…`
      : status === 'error'
        ? 'Line dropped'
        : agentSpeaking
          ? `${agent.name} is speaking…`
          : status === 'live'
            ? 'Listening — go ahead and talk'
            : `Tap to call ${agent.name}`;

  return (
    <div className="max-w-3xl mx-auto">
      <button
        onClick={() => { stop(); onBack(); }}
        className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors mb-6 text-sm"
      >
        <ArrowLeft size={16} /> Back to the firm
      </button>

      <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl">
        {/* Stage */}
        <div className="relative flex flex-col items-center justify-center px-6 pt-12 pb-8 bg-gradient-to-b from-slate-900 to-slate-950 min-h-[22rem]">
          {/* Avatar */}
          <div className="relative mb-6">
            {agentSpeaking && (
              <>
                <span className={`absolute inset-0 rounded-full ${agent.bgClass} animate-ping opacity-40`} />
                <span className={`absolute -inset-3 rounded-full border ${agent.borderClass} animate-pulse`} />
              </>
            )}
            <div
              className={`relative w-32 h-32 rounded-full flex items-center justify-center text-6xl border-2 transition-transform duration-300 ${agent.bgClass} ${agent.borderClass} ${
                agentSpeaking ? 'scale-110' : 'scale-100'
              }`}
            >
              {agent.emoji}
            </div>
            {status === 'live' && (
              <div className={`absolute -bottom-1 -right-1 w-9 h-9 rounded-full flex items-center justify-center border-2 border-slate-900 ${agentSpeaking ? 'bg-gold-500 text-slate-950' : 'bg-slate-700 text-slate-300'}`}>
                {agentSpeaking ? <Volume2 size={16} /> : <Mic size={16} />}
              </div>
            )}
          </div>

          <h2 className={`text-2xl font-serif font-bold ${agent.colorClass}`}>{agent.name}</h2>
          <p className="text-slate-400 text-sm mt-0.5">{agent.title}</p>
          <p className="text-slate-500 text-sm mt-4 italic h-5">{statusLine}</p>

          {/* Your mic level */}
          {status === 'live' && !agentSpeaking && (
            <div className="flex items-end gap-1 h-6 mt-3">
              {[0, 1, 2, 3, 4].map(i => (
                <span
                  key={i}
                  className="w-1.5 bg-gold-500/70 rounded-full transition-all duration-100"
                  style={{ height: `${Math.max(4, Math.min(24, (inputLevel - i * 8) * 1.2))}px` }}
                />
              ))}
            </div>
          )}

          {/* Live caption */}
          <div className="absolute bottom-3 left-0 right-0 px-4 pointer-events-none">
            {liveCaption && (
              <div
                className={`mx-auto max-w-lg px-4 py-2.5 rounded-2xl backdrop-blur-md border text-sm leading-snug ${
                  liveCaption.speaker === 'you'
                    ? 'bg-blue-950/70 border-blue-500/40 text-blue-50'
                    : 'bg-slate-800/80 border-gold-500/30 text-slate-50'
                }`}
              >
                <span className={`text-[10px] font-bold uppercase tracking-wider mr-2 ${liveCaption.speaker === 'you' ? 'text-blue-400' : 'text-gold-400'}`}>
                  {liveCaption.speaker === 'you' ? 'You' : agent.name}
                </span>
                {liveCaption.text}
              </div>
            )}
          </div>
        </div>

        {/* Transcript */}
        {transcript.length > 0 && (
          <div className="max-h-56 overflow-y-auto px-5 py-4 space-y-3 border-t border-slate-800 bg-slate-950/50">
            {transcript.map((t, i) => (
              <div key={i} className={`flex ${t.speaker === 'you' ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[80%] px-3.5 py-2 rounded-2xl text-sm ${
                    t.speaker === 'you'
                      ? 'bg-blue-600/20 border border-blue-500/30 text-blue-50 rounded-br-sm'
                      : 'bg-slate-800 border border-slate-700 text-slate-100 rounded-bl-sm'
                  }`}
                >
                  <span className={`block text-[10px] font-bold uppercase tracking-wider mb-0.5 ${t.speaker === 'you' ? 'text-blue-400' : agent.colorClass}`}>
                    {t.speaker === 'you' ? 'You' : agent.name}
                  </span>
                  {t.text}
                </div>
              </div>
            ))}
            <div ref={transcriptEndRef} />
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="px-5 py-3 bg-red-950/40 border-t border-red-500/30 flex items-start gap-2 text-sm text-red-200">
            <AlertCircle size={16} className="shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {/* Call control */}
        <div className="px-6 py-6 border-t border-slate-800 bg-slate-900 flex items-center justify-center">
          {status === 'idle' || status === 'error' ? (
            <button
              onClick={start}
              className="flex items-center gap-3 px-8 py-4 rounded-full bg-green-600 hover:bg-green-500 text-white font-bold text-lg shadow-lg hover:scale-105 transition-all"
            >
              <Phone size={22} /> Call {agent.name}
            </button>
          ) : (
            <button
              onClick={stop}
              className="flex items-center gap-3 px-8 py-4 rounded-full bg-red-600 hover:bg-red-500 text-white font-bold text-lg shadow-lg hover:scale-105 transition-all"
            >
              <PhoneOff size={22} /> End call
            </button>
          )}
        </div>
      </div>

      <p className="text-center text-xs text-slate-600 mt-4 max-w-md mx-auto">
        Live voice powered by Gemini native audio. {agent.name} speaks first and drives the conversation — just talk back naturally.
      </p>
    </div>
  );
};

export default VoiceRoom;
