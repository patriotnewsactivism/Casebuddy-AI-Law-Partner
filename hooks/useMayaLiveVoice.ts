/**
 * useMayaLiveVoice — React hook for Maya's realtime bidirectional voice pipeline.
 *
 * Provides a full-duplex, low-latency voice connection to Maya via a server-side
 * WebSocket relay. The browser streams microphone audio and receives synthesized
 * speech, with true barge-in support and real-time tool call feedback.
 *
 * Key design decisions:
 *   - All provider credentials stay server-side. The browser holds only a scoped
 *     session ID obtained from /api/ai/live-token.
 *   - iOS/Safari AudioContext guard: never hardcodes sampleRate on the constructor.
 *     Uses the browser's native rate and resamples in software.
 *   - Barge-in: when user speech is detected while Maya is speaking, the playback
 *     buffer is drained with a fast fade and an interrupt signal is sent upstream.
 *   - Recording stream: exposes the same onRecordingStream callback contract as
 *     useDeepgramVoiceAgent for intakeRecording.ts compatibility.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { getSession } from '../services/authService';

// ── Constants ────────────────────────────────────────────────────────────────

const TARGET_SAMPLE_RATE = 24000;
const BARGE_FADE_MS = 90;
const CAPTION_CLEAR_MS = 3000;
const VAD_THRESHOLD = 0.015; // RMS threshold for voice activity detection

// ── Types ────────────────────────────────────────────────────────────────────

export type LiveVoiceState =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'speaking'   // Maya is speaking
  | 'listening'; // Maya is listening

export type LiveSpeaker = 'agent' | 'caller';

export interface LiveVoiceTurn {
  speaker: LiveSpeaker;
  text: string;
  timestamp: number;
}

export interface ActiveTool {
  name: string;
  status: 'executing' | 'complete';
  result?: Record<string, unknown>;
}

export interface MayaLiveVoiceOptions {
  /** Use public intake token authentication (no Supabase session required). */
  publicEndpoint?: boolean;
  /** Existing intake ID to attach to the session. */
  intakeId?: string;
  /** Callback for recording both sides of the call. */
  onRecordingStream?: (stream: MediaStream) => void;
  /** Called when a tool execution completes. */
  onToolComplete?: (tool: ActiveTool) => void;
}

export interface UseMayaLiveVoiceResult {
  state: LiveVoiceState;
  error: string | null;
  isMuted: boolean;
  inputLevel: number;
  volumeLevel: number;
  transcript: LiveVoiceTurn[];
  liveCaption: { speaker: LiveSpeaker; text: string } | null;
  activeTool: ActiveTool | null;
  activeIntakeId: string | null;
  activeModel: string | null;

  connect: (opts?: MayaLiveVoiceOptions) => Promise<void>;
  disconnect: () => void;
  interrupt: () => void;
  toggleMute: () => void;
  sendTextMessage: (text: string) => void;
}

// ── Resampling ───────────────────────────────────────────────────────────────

function resampleFloat(input: Float32Array, fromRate: number, toRate: number): Float32Array {
  if (fromRate === toRate) return input;
  const ratio = fromRate / toRate;
  const newLength = Math.round(input.length / ratio);
  const result = new Float32Array(newLength);
  for (let i = 0; i < newLength; i++) {
    const srcIndex = i * ratio;
    const floor = Math.floor(srcIndex);
    const ceil = Math.min(floor + 1, input.length - 1);
    const frac = srcIndex - floor;
    result[i] = input[floor] * (1 - frac) + input[ceil] * frac;
  }
  return result;
}

function floatToPcm16(float32: Float32Array): ArrayBuffer {
  const int16 = new Int16Array(float32.length);
  for (let i = 0; i < float32.length; i++) {
    const s = Math.max(-1, Math.min(1, float32[i]));
    int16[i] = s < 0 ? s * 32768 : s * 32767;
  }
  return int16.buffer;
}

function pcm16ToFloat(buffer: ArrayBuffer): Float32Array {
  const int16 = new Int16Array(buffer);
  const float32 = new Float32Array(int16.length);
  for (let i = 0; i < int16.length; i++) {
    float32[i] = int16[i] / 32768;
  }
  return float32;
}

// ── Fetch session token ──────────────────────────────────────────────────────

function currentPublicIntakeToken(): string | null {
  if (typeof window === 'undefined') return null;
  const match = window.location.pathname.match(/^\/intake\/([^/]+)\/?$/i);
  if (!match?.[1]) return null;
  try { return decodeURIComponent(match[1]).trim() || null; }
  catch { return match[1].trim() || null; }
}

interface SessionDescriptor {
  sessionId: string;
  wsUrl: string;
  tools: string[];
  expiresIn: number;
}

async function fetchLiveToken(publicEndpoint: boolean, intakeId?: string): Promise<SessionDescriptor> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };

  if (!publicEndpoint) {
    const session = await getSession();
    if (!session?.access_token) throw new Error('Sign in is required for live voice access.');
    headers.Authorization = `Bearer ${session.access_token}`;
  } else {
    const intakeToken = currentPublicIntakeToken();
    if (intakeToken) headers['X-Intake-Token'] = intakeToken;
  }

  const response = await fetch('/api/ai/live-token', {
    method: 'POST',
    headers,
    body: JSON.stringify({ intakeId, publicEndpoint }),
  });

  if (!response.ok) {
    let detail = '';
    try { detail = ((await response.json()) as any)?.error || ''; } catch { /* */ }
    throw new Error(detail || 'Could not start live voice session.');
  }

  return response.json() as Promise<SessionDescriptor>;
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useMayaLiveVoice(): UseMayaLiveVoiceResult {
  const [state, setState] = useState<LiveVoiceState>('disconnected');
  const [error, setError] = useState<string | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [inputLevel, setInputLevel] = useState(0);
  const [volumeLevel, setVolumeLevel] = useState(0);
  const [transcript, setTranscript] = useState<LiveVoiceTurn[]>([]);
  const [liveCaption, setLiveCaption] = useState<{ speaker: LiveSpeaker; text: string } | null>(null);
  const [activeTool, setActiveTool] = useState<ActiveTool | null>(null);
  const [activeIntakeId, setActiveIntakeId] = useState<string | null>(null);
  const [activeModel, setActiveModel] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const outGainRef = useRef<GainNode | null>(null);
  const nextStartRef = useRef(0);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const captionTimer = useRef<any>(null);
  const bargeInTimer = useRef<any>(null);
  const mutedRef = useRef(false);
  const optsRef = useRef<MayaLiveVoiceOptions | null>(null);
  const mixDestRef = useRef<MediaStreamAudioDestinationNode | null>(null);
  const mixMicSrcRef = useRef<MediaStreamAudioSourceNode | null>(null);

  // Keep muted ref in sync
  useEffect(() => { mutedRef.current = isMuted; }, [isMuted]);

  // ── Playback ─────────────────────────────────────────────────────────────

  const clearPlayback = useCallback(() => {
    const ctx = audioCtxRef.current;
    const gain = outGainRef.current;
    const toStop: AudioBufferSourceNode[] = [];
    sourcesRef.current.forEach(s => toStop.push(s));
    sourcesRef.current.clear();
    nextStartRef.current = 0;

    if (ctx && gain) {
      const now = ctx.currentTime;
      try {
        gain.gain.cancelScheduledValues(now);
        gain.gain.setValueAtTime(gain.gain.value, now);
        gain.gain.linearRampToValueAtTime(0.0001, now + BARGE_FADE_MS / 1000);
      } catch { /* noop */ }
      setTimeout(() => {
        toStop.forEach(s => { try { s.stop(); } catch { /* noop */ } });
      }, BARGE_FADE_MS + 20);
    } else {
      toStop.forEach(s => { try { s.stop(); } catch { /* noop */ } });
    }
  }, []);

  const playAudioChunk = useCallback((buffer: ArrayBuffer) => {
    const ctx = audioCtxRef.current;
    const gain = outGainRef.current;
    if (!ctx || !gain) return;
    if (ctx.state === 'suspended') ctx.resume();

    const float32 = pcm16ToFloat(buffer);
    if (float32.length === 0) return;

    // Resample from 24kHz to the AudioContext's native rate
    const resampled = resampleFloat(float32, TARGET_SAMPLE_RATE, ctx.sampleRate);
    const audioBuffer = ctx.createBuffer(1, resampled.length, ctx.sampleRate);
    audioBuffer.getChannelData(0).set(resampled);

    const isFirst = sourcesRef.current.size === 0;
    if (isFirst) {
      try {
        gain.gain.cancelScheduledValues(ctx.currentTime);
        gain.gain.setValueAtTime(1, ctx.currentTime);
      } catch { /* noop */ }
    }

    setState('speaking');
    const now = ctx.currentTime + (isFirst ? 0.1 : 0);
    nextStartRef.current = Math.max(nextStartRef.current, now);

    const src = ctx.createBufferSource();
    src.buffer = audioBuffer;
    src.connect(gain);
    src.addEventListener('ended', () => {
      sourcesRef.current.delete(src);
      if (sourcesRef.current.size === 0) {
        setTimeout(() => {
          if (sourcesRef.current.size === 0) setState(prev =>
            prev === 'speaking' ? 'listening' : prev
          );
        }, 250);
      }
    });
    src.start(nextStartRef.current);
    nextStartRef.current += audioBuffer.duration;
    sourcesRef.current.add(src);

    // Update volume level for UI
    setVolumeLevel(Math.min(100, resampled.reduce((sum, v) => sum + v * v, 0) / resampled.length * 500));
  }, []);

  // ── Interrupt ────────────────────────────────────────────────────────────

  const interrupt = useCallback(() => {
    clearPlayback();
    setState('listening');
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'interrupt' }));
    }
  }, [clearPlayback]);

  // ── Disconnect ───────────────────────────────────────────────────────────

  const disconnect = useCallback(() => {
    try { processorRef.current?.disconnect(); } catch { /* noop */ }
    try { sourceRef.current?.disconnect(); } catch { /* noop */ }
    try { mixMicSrcRef.current?.disconnect(); } catch { /* noop */ }
    try { mixDestRef.current?.disconnect(); } catch { /* noop */ }
    mixMicSrcRef.current = null;
    mixDestRef.current = null;
    processorRef.current = null;
    sourceRef.current = null;
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    try { audioCtxRef.current?.close(); } catch { /* noop */ }
    audioCtxRef.current = null;
    sourcesRef.current.forEach(s => { try { s.stop(); } catch { /* noop */ } });
    sourcesRef.current.clear();
    nextStartRef.current = 0;
    clearTimeout(captionTimer.current);
    clearTimeout(bargeInTimer.current);
    if (wsRef.current) {
      try { wsRef.current.close(); } catch { /* noop */ }
      wsRef.current = null;
    }
    setState('disconnected');
    setLiveCaption(null);
    setInputLevel(0);
    setVolumeLevel(0);
    setActiveTool(null);
  }, []);

  // ── Connect ──────────────────────────────────────────────────────────────

  const connect = useCallback(async (opts: MayaLiveVoiceOptions = {}) => {
    optsRef.current = opts;
    setError(null);
    setState('connecting');
    setTranscript([]);

    // 1. Fetch session token
    let session: SessionDescriptor;
    try {
      session = await fetchLiveToken(opts.publicEndpoint ?? false, opts.intakeId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start live voice session.');
      setState('disconnected');
      return;
    }

    try {
      // 2. Set up audio context (iOS-safe: no sampleRate in constructor)
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      const audioCtx = new AudioCtx();
      await audioCtx.resume();
      audioCtxRef.current = audioCtx;

      const outGain = audioCtx.createGain();
      outGain.connect(audioCtx.destination);
      outGainRef.current = outGain;

      // 3. Microphone
      let micStream: MediaStream;
      try {
        micStream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        });
        streamRef.current = micStream;
      } catch {
        throw new Error('Microphone access denied. Allow mic access to talk with Maya.');
      }

      // 4. Recording mix (same pattern as useDeepgramVoiceAgent)
      if (opts.onRecordingStream) {
        try {
          const mixDest = audioCtx.createMediaStreamDestination();
          outGain.connect(mixDest);
          const mixMicSrc = audioCtx.createMediaStreamSource(micStream);
          mixMicSrc.connect(mixDest);
          mixDestRef.current = mixDest;
          mixMicSrcRef.current = mixMicSrc;
          opts.onRecordingStream(mixDest.stream);
        } catch (err) {
          console.warn('[useMayaLiveVoice] recording unavailable:', err);
        }
      }

      // 5. Open WebSocket to server relay
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}${session.wsUrl}?session=${encodeURIComponent(session.sessionId)}`;
      const ws = new WebSocket(wsUrl);
      ws.binaryType = 'arraybuffer';
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('[useMayaLiveVoice] WebSocket connected');
      };

      ws.onmessage = (event) => {
        // Binary = audio from Maya
        if (event.data instanceof ArrayBuffer) {
          playAudioChunk(event.data);
          return;
        }

        // Text = JSON events
        try {
          const msg = JSON.parse(event.data as string);

          if (msg.type === 'session_ready') {
            setState('listening');
            return;
          }

          if (msg.type === 'model_info') {
            setActiveModel(msg.model);
            return;
          }

          if (msg.type === 'model_fallback') {
            setActiveModel(msg.toModel);
            console.warn('[useMayaLiveVoice] Fallback engaged:', msg.fromModel, '->', msg.toModel, msg.reason);
            return;
          }

          if (msg.type === 'state') {
            if (msg.state === 'listening') setState('listening');
            else if (msg.state === 'speaking') setState('speaking');
            else if (msg.state === 'disconnected') disconnect();
            return;
          }

          if (msg.type === 'transcript') {
            const speaker: LiveSpeaker = msg.speaker === 'caller' ? 'caller' : 'agent';
            const text = (msg.text || '').trim();
            if (!text) return;
            setTranscript(prev => [...prev, { speaker, text, timestamp: Date.now() }]);
            setLiveCaption({ speaker, text });
            clearTimeout(captionTimer.current);
            captionTimer.current = setTimeout(() => setLiveCaption(null), CAPTION_CLEAR_MS);
            return;
          }

          if (msg.type === 'tool_status') {
            const tool: ActiveTool = {
              name: msg.tool,
              status: msg.status,
              result: msg.result,
            };
            setActiveTool(tool);
            if (msg.status === 'complete') {
              optsRef.current?.onToolComplete?.(tool);
              setTimeout(() => setActiveTool(null), 2000);
            }
            return;
          }

          if (msg.type === 'error') {
            console.error('[useMayaLiveVoice] server error:', msg.message);
            setError(msg.message || 'Voice session error.');
            setState('disconnected');
            return;
          }
        } catch { /* ignore non-JSON */ }
      };

      ws.onerror = () => {
        setError('The voice connection hit an error. Please try again.');
        setState('disconnected');
      };

      ws.onclose = () => {
        if (state !== 'disconnected') disconnect();
      };

      // 6. Audio input pipeline
      const source = audioCtx.createMediaStreamSource(micStream);
      sourceRef.current = source;
      const processor = audioCtx.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;

      processor.onaudioprocess = (e) => {
        const rawInput = e.inputBuffer.getChannelData(0);
        const resampled = resampleFloat(rawInput, audioCtx.sampleRate, TARGET_SAMPLE_RATE);

        // Calculate input level
        let sum = 0;
        for (let i = 0; i < resampled.length; i++) {
          sum += resampled[i] * resampled[i];
        }
        const rms = Math.sqrt(sum / resampled.length);
        setInputLevel(Math.min(100, rms * 300));

        // VAD-based barge-in
        if (rms > VAD_THRESHOLD && sourcesRef.current.size > 0) {
          clearTimeout(bargeInTimer.current);
          bargeInTimer.current = setTimeout(() => {
            if (sourcesRef.current.size > 0) {
              interrupt();
            }
          }, 150);
        }

        // Send audio (skip if muted)
        if (!mutedRef.current && ws.readyState === WebSocket.OPEN) {
          const pcmBuffer = floatToPcm16(resampled);
          ws.send(pcmBuffer);
        }
      };

      source.connect(processor);
      processor.connect(audioCtx.destination);

    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not connect the voice line.';
      setError(message);
      setState('disconnected');
      disconnect();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [disconnect, interrupt, playAudioChunk]);

  // ── Text input ───────────────────────────────────────────────────────────

  const sendTextMessage = useCallback((text: string) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({ type: 'text', content: text }));
    setTranscript(prev => [...prev, { speaker: 'caller', text, timestamp: Date.now() }]);
  }, []);

  // ── Mute toggle ──────────────────────────────────────────────────────────

  const toggleMute = useCallback(() => {
    setIsMuted(prev => !prev);
  }, []);

  // ── Cleanup on unmount ───────────────────────────────────────────────────

  useEffect(() => () => disconnect(), [disconnect]);

  return {
    state,
    error,
    isMuted,
    inputLevel,
    volumeLevel,
    transcript,
    liveCaption,
    activeTool,
    activeIntakeId,
    activeModel,
    connect,
    disconnect,
    interrupt,
    toggleMute,
    sendTextMessage,
  };
}
