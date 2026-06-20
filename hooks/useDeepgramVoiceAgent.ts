import { useCallback, useEffect, useRef, useState } from 'react';
import { getSession } from '../services/authService';
import { setRuntimeKeys } from '../services/runtimeKeys';

// Live voice via the Deepgram Voice Agent API:
//   Deepgram Nova (ears) -> Gemini 2.5 Flash (brain) -> Aura-2 (mouth)
// Single WebSocket at wss://agent.deepgram.com/v1/agent/converse.
//
// API keys are fetched at runtime from /api/ai/voice-keys (behind auth)
// or /api/ai/voice-keys-public (no auth, for public intake page)
// so they never appear in the JS bundle.

const AGENT_WS_URL = 'wss://agent.deepgram.com/v1/agent/converse';
const INPUT_RATE = 16000;
const OUTPUT_RATE = 24000;

// Turn-taking. We listen with Nova-3, Deepgram's latest STT model.
// utterance_end_ms: 1500ms of silence signals end-of-turn — long enough that
// a stressed caller can pause mid-thought without the agent jumping in.
// vad_events: true enables voice-activity detection events for smoother barge-in.
const LISTEN_MODEL = 'nova-3';
const EOT_THRESHOLD = 0.8;   // kept for reference, not used with nova-3
const EOT_TIMEOUT_MS = 8000; // kept for reference, not used with nova-3
// How quickly we fade the agent's voice out when the caller barges in. A short
// ramp instead of a hard cut means her words are never abruptly clipped.
const BARGE_FADE_MS = 90;
const SPEAKING_RATE_DEFAULT = 1.05; // slightly more natural than 1.1

export type VoiceStatus = 'idle' | 'connecting' | 'live' | 'error';
export type Speaker = 'agent' | 'you';

export interface VoiceTurn {
  speaker: Speaker;
  text: string;
  timestamp: number;
}

export interface UseDeepgramVoiceAgentOptions {
  /** Aura-2 voice model id, e.g. "aura-2-thalia-en". */
  voiceModel: string;
  /** Gemini system prompt (persona). */
  systemInstruction: string;
  /** First line the agent speaks on connect. */
  greeting: string;
  caseContext?: string;
  /**
   * Set to true to use the public (no-auth) key endpoint.
   * Use this for pages accessible without login (e.g. PublicIntake).
   */
  publicEndpoint?: boolean;
  /**
   * Playback speed multiplier for Aura-2 TTS. 1.0 = normal, 1.15 = slightly faster.
   * Deepgram supports 0.5–1.5. Defaults to 1.1 for a natural, quick pace.
   */
  speakingRate?: number;
}

export interface UseDeepgramVoiceAgentResult {
  status: VoiceStatus;
  error: string | null;
  activeSpeaker: Speaker | null;
  liveCaption: { speaker: Speaker; text: string } | null;
  transcript: VoiceTurn[];
  inputLevel: number;
  agentSpeaking: boolean;
  start: () => Promise<void>;
  stop: () => void;
}

/**
 * Fetch API keys from the server at runtime (never baked into the bundle).
 * Falls back to env vars for local development only.
 */
const fetchVoiceKeys = async (
  publicEndpoint = false
): Promise<{ deepgramKey: string; geminiKey: string }> => {
  // Public intake path — no auth required
  if (publicEndpoint) {
    try {
      const resp = await fetch('/api/ai/voice-keys-public', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (resp.ok) {
        const data = await resp.json();
        if (data.deepgramKey) return { deepgramKey: data.deepgramKey, geminiKey: data.geminiKey || '' };
      }
    } catch {
      // Fall through to env var fallback below
    }
  } else {
    // Authenticated path — verify Supabase session first
    try {
      const session = await getSession();
      if (session?.access_token) {
        const resp = await fetch('/api/ai/voice-keys', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
        });
        if (resp.ok) {
          const data = await resp.json();
          if (data.deepgramKey && data.geminiKey) return data;
        }
      }
    } catch {
      // Fall through to env var fallback
    }
  }

  // Local dev fallback — reads from import.meta.env (only available in dev builds)
  const deepgramKey = (import.meta.env.VITE_DEEPGRAM_API_KEY || (window as any).__DEEPGRAM_API_KEY || '').trim();
  const geminiKey = (import.meta.env.VITE_GEMINI_API_KEY || import.meta.env.VITE_API_KEY || (window as any).__GEMINI_API_KEY || '').trim();
  return { deepgramKey, geminiKey };
};

export function useDeepgramVoiceAgent(
  options: UseDeepgramVoiceAgentOptions
): UseDeepgramVoiceAgentResult {
  const [status, setStatus] = useState<VoiceStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [activeSpeaker, setActiveSpeaker] = useState<Speaker | null>(null);
  const [liveCaption, setLiveCaption] = useState<{ speaker: Speaker; text: string } | null>(null);
  const [transcript, setTranscript] = useState<VoiceTurn[]>([]);
  const [inputLevel, setInputLevel] = useState(0);
  const [agentSpeaking, setAgentSpeaking] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const inputCtxRef = useRef<AudioContext | null>(null);
  const outputCtxRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const outGainRef = useRef<GainNode | null>(null);
  const nextStartRef = useRef(0);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const captionTimer = useRef<any>(null);

  const optsRef = useRef(options);
  optsRef.current = options;

  // Stop the agent's voice gracefully. Instead of hard-stopping every buffer
  // (which clips her mid-word and sounds jarring), ramp the gain down fast, then
  // stop the now-silent sources. The gain is restored to full for the next turn
  // in playAudioChunk, so a brief false barge-in (a cough, an "mm-hmm") never
  // leaves her permanently muted.
  const clearPlayback = useCallback(() => {
    const outputCtx = outputCtxRef.current;
    const outGain = outGainRef.current;
    const toStop: AudioBufferSourceNode[] = [];
    sourcesRef.current.forEach(s => toStop.push(s));
    sourcesRef.current.clear();
    nextStartRef.current = 0;
    setAgentSpeaking(false);

    if (outputCtx && outGain) {
      const now = outputCtx.currentTime;
      try {
        outGain.gain.cancelScheduledValues(now);
        outGain.gain.setValueAtTime(outGain.gain.value, now);
        outGain.gain.linearRampToValueAtTime(0.0001, now + BARGE_FADE_MS / 1000);
      } catch { /* noop */ }
      setTimeout(() => {
        toStop.forEach(s => { try { s.stop(); } catch { /* noop */ } });
      }, BARGE_FADE_MS + 20);
    } else {
      toStop.forEach(s => { try { s.stop(); } catch { /* noop */ } });
    }
  }, []);

  const stop = useCallback(() => {
    try { processorRef.current?.disconnect(); } catch { /* noop */ }
    processorRef.current = null;
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    try { inputCtxRef.current?.close(); } catch { /* noop */ }
    try { outputCtxRef.current?.close(); } catch { /* noop */ }
    inputCtxRef.current = null;
    outputCtxRef.current = null;
    sourcesRef.current.forEach(s => { try { s.stop(); } catch { /* noop */ } });
    sourcesRef.current.clear();
    nextStartRef.current = 0;
    clearTimeout(captionTimer.current);
    if (wsRef.current) {
      try { wsRef.current.close(); } catch { /* noop */ }
      wsRef.current = null;
    }
    setStatus('idle');
    setActiveSpeaker(null);
    setLiveCaption(null);
    setInputLevel(0);
    setAgentSpeaking(false);
  }, []);

  const playAudioChunk = useCallback(async (buffer: ArrayBuffer) => {
    const outputCtx = outputCtxRef.current;
    const outGain = outGainRef.current;
    if (!outputCtx || !outGain) return;
    if (outputCtx.state === 'suspended') await outputCtx.resume();

    const int16 = new Int16Array(buffer);
    if (int16.length === 0) return;
    const audioBuffer = outputCtx.createBuffer(1, int16.length, OUTPUT_RATE);
    const channel = audioBuffer.getChannelData(0);
    for (let i = 0; i < int16.length; i++) channel[i] = int16[i] / 32768;

    // Start of a fresh agent turn — restore full volume in case a prior barge-in
    // faded it out, so she's never left muted by an earlier false interruption.
    if (sourcesRef.current.size === 0) {
      try {
        outGain.gain.cancelScheduledValues(outputCtx.currentTime);
        outGain.gain.setValueAtTime(1, outputCtx.currentTime);
      } catch { /* noop */ }
    }

    setAgentSpeaking(true);
    setActiveSpeaker('agent');
    nextStartRef.current = Math.max(nextStartRef.current, outputCtx.currentTime);
    const src = outputCtx.createBufferSource();
    src.buffer = audioBuffer;
    src.connect(outGain);
    src.addEventListener('ended', () => {
      sourcesRef.current.delete(src);
      if (sourcesRef.current.size === 0) {
        setTimeout(() => { if (sourcesRef.current.size === 0) setAgentSpeaking(false); }, 120);
      }
    });
    src.start(nextStartRef.current);
    nextStartRef.current += audioBuffer.duration;
    sourcesRef.current.add(src);
  }, []);

  const handleServerMessage = useCallback((data: any) => {
    const type = data.type;
    if (type === 'UserStartedSpeaking') {
      clearPlayback();
      setActiveSpeaker('you');
      return;
    }
    if (type === 'AgentStartedSpeaking') {
      setAgentSpeaking(true);
      setActiveSpeaker('agent');
      return;
    }
    if (type === 'AgentAudioDone') {
      setAgentSpeaking(false);
      return;
    }
    if (type === 'ConversationText') {
      const speaker: Speaker = data.role === 'user' ? 'you' : 'agent';
      const text = (data.content || '').trim();
      if (!text) return;
      setTranscript(prev => [...prev, { speaker, text, timestamp: Date.now() }]);
      setLiveCaption({ speaker, text });
      clearTimeout(captionTimer.current);
      captionTimer.current = setTimeout(() => setLiveCaption(null), 3000);
      return;
    }
    if (type === 'Error') {
      console.error('[VoiceAgent] Error event:', JSON.stringify(data));
      setError(data.description || data.message || 'Voice agent error.');
      setStatus('error');
    }
  }, [clearPlayback]);

  const start = useCallback(async () => {
    setError(null);
    setStatus('connecting');
    setTranscript([]);

    const opts = optsRef.current;

    // Fetch keys from server (never baked into bundle)
    let dgKey: string;
    let geminiKey: string;
    try {
      const keys = await fetchVoiceKeys(opts.publicEndpoint ?? false);
      dgKey = keys.deepgramKey.trim();
      geminiKey = keys.geminiKey.trim();
      // Cache keys for use by intakeService and other client-side services
      setRuntimeKeys({ deepgramKey: dgKey, geminiKey });
    } catch {
      setError('Could not retrieve voice credentials. Please try again.');
      setStatus('error');
      return;
    }

    if (!dgKey) {
      setError('Voice service is not available right now. Please try again shortly.');
      setStatus('error');
      return;
    }
    if (!geminiKey) {
      setError('AI service is not available right now. Please try again shortly.');
      setStatus('error');
      return;
    }

    try {
      const inputCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: INPUT_RATE });
      const outputCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: OUTPUT_RATE });
      await inputCtx.resume();
      await outputCtx.resume();
      inputCtxRef.current = inputCtx;
      outputCtxRef.current = outputCtx;
      const outGain = outputCtx.createGain();
      outGain.connect(outputCtx.destination);
      outGainRef.current = outGain;

      let micStream: MediaStream;
      try {
        micStream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        });
        streamRef.current = micStream;
      } catch {
        throw new Error('Microphone access denied. Allow mic access (and use HTTPS) to talk with the team.');
      }

      const ws = new WebSocket(AGENT_WS_URL, ['token', dgKey.trim()]);
      ws.binaryType = 'arraybuffer';
      wsRef.current = ws;

      const prompt = opts.caseContext
        ? `${opts.systemInstruction}\n\nACTIVE CASE CONTEXT (use naturally if relevant):\n${opts.caseContext}`
        : opts.systemInstruction;

      // Speaking rate: slightly faster than default for a more natural, quick pace
      const speakRate = opts.speakingRate ?? SPEAKING_RATE_DEFAULT;

      ws.onopen = () => {
        const settings = {
          type: 'Settings',
          audio: {
            input: { encoding: 'linear16', sample_rate: INPUT_RATE },
            output: { encoding: 'linear16', sample_rate: OUTPUT_RATE, container: 'none' },
          },
          agent: {
            language: 'en',
            listen: {
              provider: {
                type: 'deepgram',
                model: LISTEN_MODEL,
                // encoding + sample_rate are set in audio.input above, not here
              },
            },
            think: {
              provider: { type: 'google', model: 'gemini-2.5-flash', temperature: 0.6 },
              prompt,
            },
            speak: {
              provider: {
                type: 'deepgram',
                model: opts.voiceModel,
                // speed: slightly faster than default, keeps voice natural without sounding rushed
                speed: speakRate,
              },
            },
            greeting: opts.greeting,
          },
        };
        ws.send(JSON.stringify(settings));
        setStatus('live');

        const source = inputCtx.createMediaStreamSource(micStream);
        const processor = inputCtx.createScriptProcessor(4096, 1, 1);
        processorRef.current = processor;
        processor.onaudioprocess = (e) => {
          const input = e.inputBuffer.getChannelData(0);
          let sum = 0;
          const int16 = new Int16Array(input.length);
          for (let i = 0; i < input.length; i++) {
            const s = Math.max(-1, Math.min(1, input[i]));
            int16[i] = s < 0 ? s * 32768 : s * 32767;
            sum += input[i] * input[i];
          }
          setInputLevel(Math.min(100, Math.sqrt(sum / input.length) * 200));
          if (ws.readyState === WebSocket.OPEN) ws.send(int16.buffer);
        };
        source.connect(processor);
        processor.connect(inputCtx.destination);
      };

      ws.onmessage = (event) => {
        if (event.data instanceof ArrayBuffer) {
          playAudioChunk(event.data);
        } else {
          try { handleServerMessage(JSON.parse(event.data)); } catch { /* ignore non-JSON */ }
        }
      };

      ws.onerror = () => {
        setError('The voice line hit an error. Please try again.');
        setStatus('error');
      };
      ws.onclose = () => {
        if (status !== 'error') stop();
      };
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Could not connect the voice line.';
      setError(message);
      setStatus('error');
      stop();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handleServerMessage, playAudioChunk, stop]);

  useEffect(() => () => stop(), [stop]);

  return { status, error, activeSpeaker, liveCaption, transcript, inputLevel, agentSpeaking, start, stop };
}
