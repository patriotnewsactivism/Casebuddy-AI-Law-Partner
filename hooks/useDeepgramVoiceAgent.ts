import { useCallback, useEffect, useRef, useState } from 'react';
import { getSession } from '../services/authService';
import { getElevenLabsVoiceId } from '../agents/voiceProfiles';

// Live voice pipeline:
//   Deepgram Voice Agent (ears + managed LLM + Aura-2 mouth)
// Single WebSocket at wss://agent.deepgram.com/v1/agent/converse.
//
// Browser code never receives permanent provider credentials. Immediately before
// opening the WebSocket it requests a short-lived Deepgram bearer token from a
// same-origin server endpoint. The token is used only for the connection
// handshake and is not cached in window/localStorage/runtime key stores.

const AGENT_WS_URL = 'wss://agent.deepgram.com/v1/agent/converse';
const INPUT_RATE = 16000;
const OUTPUT_RATE = 24000;

// Turn-taking. We listen with Flux, Deepgram's conversational model, because
// Nova-3's turn detection cuts people off when they pause mid-thought. Flux lets
// us tune end-of-turn detection so a stressed, long-winded caller can gather
// their thoughts (or fully tell their story) without the agent jumping in.
const LISTEN_MODEL = 'flux-general-en';
const EOT_THRESHOLD = 0.8;
const EOT_TIMEOUT_MS = 8000;
const BARGE_FADE_MS = 90;

function resample(input: Float32Array, fromRate: number, toRate: number): Float32Array {
  if (fromRate === toRate) return input;
  const ratio = fromRate / toRate;
  const newLength = Math.round(input.length / ratio);
  const result = new Float32Array(newLength);
  for (let i = 0; i < newLength; i++) {
    const nextIndex = Math.floor(i * ratio);
    result[i] = input[nextIndex];
  }
  return result;
}

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
  /** Agent id retained for UI/profile compatibility. */
  agentId?: string;
  /** System prompt (persona). */
  systemInstruction: string;
  /** First line the agent speaks on connect. */
  greeting: string;
  caseContext?: string;
  /** Use the public short-lived-token endpoint for unauthenticated intake. */
  publicEndpoint?: boolean;
  /** Playback speed multiplier. Reserved for provider-specific tuning. */
  speakingRate?: number;
  /** Retained for API compatibility. Permanent ElevenLabs keys are no longer sent to browsers. */
  useElevenLabs?: boolean;
}

export interface UseDeepgramVoiceAgentResult {
  status: VoiceStatus;
  error: string | null;
  activeSpeaker: Speaker | null;
  liveCaption: { speaker: Speaker; text: string } | null;
  transcript: VoiceTurn[];
  inputLevel: number;
  agentSpeaking: boolean;
  elevenLabsAvailable: boolean;
  outputSampleRate: number;
  start: () => Promise<void>;
  stop: () => void;
}

interface VoiceCredential {
  token: string;
  tokenType: 'bearer';
}

/** Fetch a short-lived voice token. There is intentionally no VITE_* fallback. */
const fetchVoiceCredential = async (publicEndpoint = false): Promise<VoiceCredential> => {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (!publicEndpoint) {
    const session = await getSession();
    if (!session?.access_token) throw new Error('Sign in is required for voice access.');
    headers.Authorization = `Bearer ${session.access_token}`;
  }

  const response = await fetch(
    publicEndpoint ? '/api/ai/voice-keys-public' : '/api/ai/voice-keys',
    { method: 'POST', headers }
  );
  if (!response.ok) throw new Error('Could not retrieve voice credentials.');

  const data = await response.json() as { deepgramKey?: string; tokenType?: string };
  const token = String(data.deepgramKey || '').trim();
  if (!token || data.tokenType !== 'bearer') {
    throw new Error('Voice credential response was invalid.');
  }

  return { token, tokenType: 'bearer' };
};

/**
 * ElevenLabs BYO credentials are intentionally unavailable in the browser.
 * Re-enable this only through a server-side proxy or a provider-scoped ephemeral
 * credential flow that never exposes the account API key.
 */
export function shouldUseElevenLabs(_useElevenLabs: boolean = false, _elevenlabsAvailable: boolean = false): boolean {
  return false;
}

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
  const [elevenLabsAvailable] = useState(false);
  const [outputSampleRate, setOutputSampleRate] = useState(OUTPUT_RATE);

  const wsRef = useRef<WebSocket | null>(null);
  const inputCtxRef = useRef<AudioContext | null>(null);
  const outputCtxRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const outGainRef = useRef<GainNode | null>(null);
  const nextStartRef = useRef(0);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const captionTimer = useRef<any>(null);
  const bargeInTimer = useRef<any>(null);
  const outputRateRef = useRef(OUTPUT_RATE);

  const optsRef = useRef(options);
  optsRef.current = options;

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
    try { sourceRef.current?.disconnect(); } catch { /* noop */ }
    processorRef.current = null;
    sourceRef.current = null;
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    try { inputCtxRef.current?.close(); } catch { /* noop */ }
    try { outputCtxRef.current?.close(); } catch { /* noop */ }
    inputCtxRef.current = null;
    outputCtxRef.current = null;
    sourcesRef.current.forEach(s => { try { s.stop(); } catch { /* noop */ } });
    sourcesRef.current.clear();
    nextStartRef.current = 0;
    outputRateRef.current = OUTPUT_RATE;
    setOutputSampleRate(OUTPUT_RATE);
    clearTimeout(captionTimer.current);
    clearTimeout(bargeInTimer.current);
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

    const isFirstChunk = sourcesRef.current.size === 0;
    const outputRate = outputRateRef.current;

    const audioBuffer = outputCtx.createBuffer(1, int16.length, outputRate);
    const channel = audioBuffer.getChannelData(0);

    if (isFirstChunk) {
      const FADE_IN = Math.min(Math.floor(outputRate * 0.006), Math.floor(int16.length / 4));
      for (let i = 0; i < int16.length; i++) {
        let sample = int16[i] / 32768;
        if (i < FADE_IN) sample *= i / FADE_IN;
        channel[i] = sample;
      }
    } else {
      for (let i = 0; i < int16.length; i++) channel[i] = int16[i] / 32768;
    }

    if (sourcesRef.current.size === 0) {
      try {
        outGain.gain.cancelScheduledValues(outputCtx.currentTime);
        outGain.gain.setValueAtTime(1, outputCtx.currentTime);
      } catch { /* noop */ }
    }

    setAgentSpeaking(true);
    setActiveSpeaker('agent');
    const now = outputCtx.currentTime + (isFirstChunk ? 0.15 : 0);
    nextStartRef.current = Math.max(nextStartRef.current, now);
    const src = outputCtx.createBufferSource();
    src.buffer = audioBuffer;
    src.connect(outGain);
    src.addEventListener('ended', () => {
      sourcesRef.current.delete(src);
      if (sourcesRef.current.size === 0) {
        setTimeout(() => { if (sourcesRef.current.size === 0) setAgentSpeaking(false); }, 350);
      }
    });
    src.start(nextStartRef.current);
    nextStartRef.current += audioBuffer.duration;
    sourcesRef.current.add(src);
  }, []);

  const handleServerMessage = useCallback((data: any) => {
    const type = data.type;
    console.log('[VoiceAgent] Server →', type);
    if (type === 'Welcome' || type === 'SettingsApplied') return;
    if (type === 'UserStartedSpeaking') {
      clearTimeout(bargeInTimer.current);
      bargeInTimer.current = setTimeout(() => {
        clearPlayback();
        setActiveSpeaker('you');
      }, 150);
      return;
    }
    if (type === 'AgentStartedSpeaking') {
      clearTimeout(bargeInTimer.current);
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
    if (type === 'Warning') {
      console.warn('[VoiceAgent] Warning:', data.code || data.description || 'warning');
      return;
    }
    if (type === 'Error') {
      console.error('[VoiceAgent] Error event:', data.code || data.description || 'error');
      setError(data.description || data.message || 'Voice agent error.');
      setStatus('error');
    }
  }, [clearPlayback]);

  const start = useCallback(async () => {
    setError(null);
    setStatus('connecting');
    setTranscript([]);

    const opts = optsRef.current;
    let voiceToken: string;
    try {
      const credential = await fetchVoiceCredential(opts.publicEndpoint ?? false);
      voiceToken = credential.token;
      outputRateRef.current = OUTPUT_RATE;
      setOutputSampleRate(OUTPUT_RATE);
    } catch (credentialError) {
      setError(credentialError instanceof Error ? credentialError.message : 'Could not retrieve voice credentials.');
      setStatus('error');
      return;
    }

    try {
      const inputCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const outputCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
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

      // Temporary Deepgram JWTs authenticate with the Bearer scheme.
      const ws = new WebSocket(AGENT_WS_URL, ['bearer', voiceToken]);
      ws.binaryType = 'arraybuffer';
      wsRef.current = ws;

      const prompt = opts.caseContext
        ? `${opts.systemInstruction}\n\nACTIVE CASE CONTEXT (use naturally if relevant):\n${opts.caseContext}`
        : opts.systemInstruction;

      ws.onopen = () => {
        // Keep all permanent provider credentials server-side. Deepgram-managed
        // OpenAI and Aura-2 avoid placing OpenAI/Groq/Gemini/ElevenLabs secrets
        // in the browser or the Voice Agent Settings payload.
        const settings = {
          type: 'Settings',
          audio: {
            input: { encoding: 'linear16', sample_rate: INPUT_RATE },
            output: { encoding: 'linear16', sample_rate: OUTPUT_RATE, container: 'none' },
          },
          agent: {
            listen: {
              provider: {
                type: 'deepgram',
                model: LISTEN_MODEL,
                eot_threshold: EOT_THRESHOLD,
                eot_timeout_ms: EOT_TIMEOUT_MS,
              },
            },
            think: {
              provider: { type: 'open_ai', model: 'gpt-4o-mini', temperature: 0.7 },
              prompt,
            },
            speak: {
              provider: { type: 'deepgram', model: opts.voiceModel },
            },
            greeting: opts.greeting,
          },
        };

        ws.send(JSON.stringify(settings));
        setStatus('live');

        const source = inputCtx.createMediaStreamSource(micStream);
        sourceRef.current = source;
        const processor = inputCtx.createScriptProcessor(4096, 1, 1);
        processorRef.current = processor;
        processor.onaudioprocess = (e) => {
          const rawInput = e.inputBuffer.getChannelData(0);
          const resampledInput = resample(rawInput, inputCtx.sampleRate, INPUT_RATE);
          let sum = 0;
          const int16 = new Int16Array(resampledInput.length);
          for (let i = 0; i < resampledInput.length; i++) {
            const s = Math.max(-1, Math.min(1, resampledInput[i]));
            int16[i] = s < 0 ? s * 32768 : s * 32767;
            sum += resampledInput[i] * resampledInput[i];
          }
          setInputLevel(Math.min(100, Math.sqrt(sum / resampledInput.length) * 200));
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

  return { status, error, activeSpeaker, liveCaption, transcript, inputLevel, agentSpeaking, elevenLabsAvailable, outputSampleRate, start, stop };
}
