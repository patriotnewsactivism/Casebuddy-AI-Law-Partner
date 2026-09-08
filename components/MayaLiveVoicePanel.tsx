import React, { useEffect, useRef } from 'react';
import { Mic, MicOff, Phone, PhoneOff, Square, Loader2, Volume2, Wrench } from 'lucide-react';
import { useMayaLiveVoice } from '../hooks/useMayaLiveVoice';

/**
 * MayaLiveVoicePanel — realtime bidirectional voice UI for Maya.
 *
 * Wraps the useMayaLiveVoice hook with:
 *   - a live waveform indicator driven by mic input / agent output levels
 *   - explicit "Maya is listening" vs "Maya is speaking" states
 *   - one-tap interrupt while Maya is speaking (true barge-in)
 *   - live captions, transcript tail, and in-call tool activity
 *
 * Two render modes:
 *   - compact  (FloatingVoiceButton popover)
 *   - full     (ClientIntake page section)
 */

const STATE_LABEL: Record<string, string> = {
  disconnected: 'Not connected',
  connecting: 'Connecting…',
  connected: 'Connected',
  speaking: 'Maya is speaking',
  listening: 'Maya is listening',
};

interface MayaLiveVoicePanelProps {
  /** Compact rendering for the floating button popover. */
  compact?: boolean;
  /** Attach the session to an existing intake row. */
  intakeId?: string;
  /** Auto-connect on mount (used by the public intake page). */
  autoConnect?: boolean;
}

const MayaLiveVoicePanel: React.FC<MayaLiveVoicePanelProps> = ({ compact = false, intakeId, autoConnect = false }) => {
  const {
    state,
    error,
    isMuted,
    inputLevel,
    volumeLevel,
    transcript,
    liveCaption,
    activeTool,
    activeModel,
    connect,
    disconnect,
    interrupt,
    toggleMute,
  } = useMayaLiveVoice();

  const transcriptRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (autoConnect && state === 'disconnected') {
      connect({ intakeId }).catch(() => { /* surfaced via error state */ });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoConnect]);

  useEffect(() => {
    if (transcriptRef.current) {
      transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight;
    }
  }, [transcript.length, liveCaption]);

  const isConnected = state === 'connected' || state === 'speaking' || state === 'listening';
  const isSpeaking = state === 'speaking';

  // Waveform: 9 bars. While Maya speaks, bars track her output level; while
  // listening, they track the caller's microphone level.
  const level = isSpeaking ? volumeLevel : inputLevel;
  const bars = Array.from({ length: 9 }, (_, i) => {
    const wave = Math.sin((Date.now() / 130) + i * 0.9) * 0.5 + 0.5;
    const h = isConnected ? Math.max(3, Math.round(level * 100 * wave)) : 3;
    return Math.min(100, h);
  });

  const stateColor = !isConnected
    ? 'bg-slate-600'
    : isSpeaking
      ? 'bg-violet-500'
      : 'bg-emerald-500';

  return (
    <div className={`rounded-2xl border border-slate-700 bg-slate-900/90 ${compact ? 'p-3 w-72' : 'p-4'}`}>
      {/* Header: title + state chip */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-lg">⚖️</span>
          <div>
            <p className="text-xs font-bold text-slate-200 uppercase tracking-wider">Maya Live Voice</p>
            <p className="text-[10px] text-slate-500">Realtime intake — tap to interrupt anytime</p>
          </div>
        </div>
        <span className={`flex items-center gap-1.5 px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${stateColor} text-white`}>
          <span className={`h-1.5 w-1.5 rounded-full bg-white ${isConnected ? 'animate-pulse' : ''}`} />
          {STATE_LABEL[state] || state}
        </span>
      </div>

      {/* Waveform */}
      <div className={`flex items-center justify-center gap-1 ${compact ? 'h-10' : 'h-14'} mt-3 rounded-xl bg-slate-950/60 px-3`} aria-label="Live audio level">
        {bars.map((h, i) => (
          <span
            key={i}
            className={`w-1.5 rounded-full transition-all duration-100 ${isSpeaking ? 'bg-violet-400' : isConnected ? 'bg-emerald-400' : 'bg-slate-700'}`}
            style={{ height: `${h}%` }}
          />
        ))}
      </div>

      {/* Controls */}
      <div className="flex items-center gap-2 mt-3">
        {!isConnected ? (
          <button
            onClick={() => connect({ intakeId }).catch(() => { /* surfaced via error state */ })}
            disabled={state === 'connecting'}
            className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-colors disabled:opacity-50"
          >
            {state === 'connecting' ? <Loader2 size={14} className="animate-spin" /> : <Phone size={14} />}
            {state === 'connecting' ? 'Connecting' : 'Talk to Maya'}
          </button>
        ) : (
          <>
            <button
              onClick={toggleMute}
              className={`flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-colors ${isMuted ? 'bg-red-500/20 text-red-400 border border-red-500/40' : 'bg-slate-800 text-slate-200 border border-slate-700 hover:bg-slate-700'}`}
              title={isMuted ? 'Unmute microphone' : 'Mute microphone'}
            >
              {isMuted ? <MicOff size={14} /> : <Mic size={14} />}
              {isMuted ? 'Muted' : 'Mic'}
            </button>
            <button
              onClick={interrupt}
              disabled={!isSpeaking}
              className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-colors ${isSpeaking ? 'bg-violet-600 hover:bg-violet-500 text-white animate-pulse' : 'bg-slate-800 text-slate-500 border border-slate-700'}`}
              title="Interrupt Maya and start talking"
            >
              <Square size={12} />
              {isSpeaking ? 'Tap to interrupt' : 'Interrupt'}
            </button>
            <button
              onClick={disconnect}
              className="flex items-center justify-center px-3 py-2 rounded-xl bg-red-600/90 hover:bg-red-500 text-white text-xs font-bold transition-colors"
              title="End the session"
            >
              <PhoneOff size={14} />
            </button>
          </>
        )}
      </div>

      {/* Tool activity + model */}
      {(activeTool || activeModel) && !compact && (
        <div className="flex items-center gap-2 mt-2 text-[10px] text-slate-500">
          {activeTool && (
            <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-sky-500/10 text-sky-400 border border-sky-500/30">
              <Wrench size={10} /> {activeTool.name} {activeTool.status === 'executing' ? '…' : '✓'}
            </span>
          )}
          {activeModel && (
            <span className="flex items-center gap-1">
              <Volume2 size={10} /> {activeModel}
            </span>
          )}
        </div>
      )}

      {/* Live caption */}
      {liveCaption && !compact && (
        <p className="mt-2 text-xs text-slate-300 italic truncate">
          <span className={liveCaption.speaker === 'agent' ? 'text-violet-400' : 'text-emerald-400'}>
            {liveCaption.speaker === 'agent' ? 'Maya' : 'Caller'}:
          </span>{' '}
          {liveCaption.text}
        </p>
      )}

      {/* Transcript tail */}
      {!compact && transcript.length > 0 && (
        <div ref={transcriptRef} className="mt-2 max-h-36 overflow-y-auto space-y-1.5 pr-1">
          {transcript.slice(-30).map((turn, i) => (
            <p key={i} className="text-xs leading-snug">
              <span className={`font-bold ${turn.speaker === 'agent' ? 'text-violet-400' : 'text-emerald-400'}`}>
                {turn.speaker === 'agent' ? 'Maya' : 'Caller'}:
              </span>{' '}
              <span className="text-slate-300">{turn.text}</span>
            </p>
          ))}
        </div>
      )}

      {error && (
        <p className="mt-2 text-[11px] text-red-400" role="alert">{error}</p>
      )}
    </div>
  );
};

export default MayaLiveVoicePanel;
