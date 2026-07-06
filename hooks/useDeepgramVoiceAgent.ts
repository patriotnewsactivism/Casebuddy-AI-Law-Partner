import { useCallback, useEffect, useRef, useState } from 'react';
import { getSession } from '../services/authService';
import { setRuntimeKeys } from '../services/runtimeKeys';
import { getElevenLabsVoiceId } from '../agents/voiceProfiles';

// Live voice pipeline:
//   Deepgram Flux (ears) -> Gemini 2.5 Flash (brain) -> ElevenLabs (mouth, preferred)
//                                                     -> Deepgram Aura-2 (mouth, fallback)
// Single WebSocket at wss://agent.deepgram.com/v1/agent/converse.
// When an ElevenLabs key is available and useElevenLabs:true, the speak provider
// is switched to ElevenLabs inside the Settings message. Deepgram synthesises the
// response with ElevenLabs and streams PCM back to the client at the same sample rate.
//
// API keys are fetched at runtime from /api/ai/voice-keys (behind auth)
// or /api/ai/voice-keys-public (no auth, for public intake page)
// so they never appear in the JS bundle.

const AGENT_WS_URL = 'wss://agent.deepgram.com/v1/agent/converse';
const INPUT_RATE = 16000;
const OUTPUT_RATE = 24000;

// Turn-taking. We listen with Flux, Deepgram's conversational model, because
// Nova-3's turn detection cuts people off when they pause mid-thought. Flux lets
// us tune end-of-turn detection so a stressed, long-winded caller can gather
// their thoughts (or fully tell their story) without the agent jumping in.
//   eot_threshold    — higher = more certain the caller is done before we respond
//                      (fewer false "your turn" interruptions). Range 0.5–0.9.
//   eot_timeout_ms   — max silence we'll wait through before taking the turn.
//                      Raised well above the default so natural pauses are fine.
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
  /** Aura-2 voice model id, e.g. "aura-2-thalia-en". Used as fallback when ElevenLabs unavailable. */
  voiceModel: string;
  /** Agent id (e.g. "maya", "lex"). Used to look up the ElevenLabs voice ID from VOICE_PROFILES. */
  agentId?: string;
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
   * Deepgram supports 0.5–1.5. Only applies when falling back to Aura-2.
   */
  speakingRate?: number;
  /**
   * Set to true to use ElevenLabs TTS when a key is available.
   * Requires agentId so the correct ElevenLabs voice can be selected from VOICE_PROFILES.
   * Falls back to Deepgram Aura-2 if no ElevenLabs key is present.
   */
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

/**
 * Fetch API keys from the server at runtime (never baked into the bundle).
 * Falls back to env vars for local development only.
 */
const fetchVoiceKeys = async (
  publicEndpoint = false
): Promise<{ deepgramKey: string; geminiKey: string; elevenlabsKey?: string; groqKey?: string }> => {
  // Public intake path — no auth required
  if (publicEndpoint) {
    try {
      const resp = await fetch('/api/ai/voice-keys-public', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (resp.ok) {
        const data = await resp.json();
        if (data.deepgramKey) return {
          deepgramKey: data.deepgramKey,
          geminiKey: data.geminiKey || '',
          elevenlabsKey: data.elevenlabsKey || undefined,
          groqKey: data.groqKey || undefined
        };
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
          if (data.deepgramKey && data.geminiKey) return {
            deepgramKey: data.deepgramKey,
            geminiKey: data.geminiKey,
            elevenlabsKey: data.elevenlabsKey || undefined,
            groqKey: data.groqKey || undefined
          };
        }
      }
    } catch {
      // Fall through to env var fallback
    }
  }

  // Local dev fallback — reads from import.meta.env (only available in dev builds)
  const deepgramKey = (import.meta.env.VITE_DEEPGRAM_API_KEY || (window as any).__DEEPGRAM_API_KEY || '').trim();
  const geminiKey = (import.meta.env.VITE_GEMINI_API_KEY || import.meta.env.VITE_API_KEY || (window as any).__GEMINI_API_KEY || '').trim();
  const elevenlabsKey = (import.meta.env.VITE_ELEVENLABS_API_KEY || (window as any).__ELEVENLABS_API_KEY || '').trim();
  const groqKey = (import.meta.env.VITE_GROQ_API_KEY || (window as any).__GROQ_API_KEY || '').trim();
  return { deepgramKey, geminiKey, elevenlabsKey: elevenlabsKey || undefined, groqKey: groqKey || undefined };
};

/**
 * Check if ElevenLabs should be preferred for TTS based on key availability
 * and the useElevenLabs option flag.
 * Note: Deepgram Voice Agent uses Aura-2 internally for live calls.
 * This is for non-live scenarios or UI display purposes.
 */
export function shouldUseElevenLabs(useElevenLabs: boolean = false, elevenlabsAvailable: boolean = false): boolean {
  return useElevenLabs && elevenlabsAvailable;
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
  const [elevenLabsAvailable, setElevenLabsAvailable] = useState(false);
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

    // Check if this is the first chunk of a new utterance (no sources queued)
    const isFirstChunk = sourcesRef.current.size === 0;
    const outputRate = outputRateRef.current;

    const audioBuffer = outputCtx.createBuffer(1, int16.length, outputRate);
    const channel = audioBuffer.getChannelData(0);

    if (isFirstChunk) {
      // Only fade-in the very first chunk of a new utterance (6ms)
      // to prevent the initial pop/click. Mid-stream chunks play raw
      // so the voice stays smooth and continuous — no pulsing.
      const FADE_IN = Math.min(Math.floor(outputRate * 0.006), Math.floor(int16.length / 4));
      for (let i = 0; i < int16.length; i++) {
        let sample = int16[i] / 32768;
        if (i < FADE_IN) sample *= i / FADE_IN;
        channel[i] = sample;
      }
    } else {
      // Mid-stream chunks: straight PCM, no processing — keeps voice smooth
      for (let i = 0; i < int16.length; i++) channel[i] = int16[i] / 32768;
    }

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
    // Look-ahead buffer on the first chunk of an utterance so playback doesn't
    // begin right on the audio-context edge. On a freshly-resumed context — the
    // greeting — 30ms was too tight and the attack of her first word got clipped.
    // A larger cushion lets the audio pipeline spin up so the opening syllable is
    // never dropped; it only delays the very first chunk of each turn.
    const now = outputCtx.currentTime + (isFirstChunk ? 0.15 : 0);
    nextStartRef.current = Math.max(nextStartRef.current, now);
    const src = outputCtx.createBufferSource();
    src.buffer = audioBuffer;
    src.connect(outGain);
    src.addEventListener('ended', () => {
      sourcesRef.current.delete(src);
      if (sourcesRef.current.size === 0) {
        // Wait 350ms before declaring silence — prevents choppy gaps
        // between TTS chunks from prematurely ending the speaking state.
        setTimeout(() => { if (sourcesRef.current.size === 0) setAgentSpeaking(false); }, 350);
      }
    });
    src.start(nextStartRef.current);
    nextStartRef.current += audioBuffer.duration;
    sourcesRef.current.add(src);
  }, []);

  const handleServerMessage = useCallback((data: any) => {
    const type = data.type;
    if (type === 'UserStartedSpeaking') {
      // Debounce barge-in by 150ms — prevents ambient noise / false VAD
      // triggers from killing the agent's audio mid-sentence.
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
    let elevKey: string | undefined;
    let groqKey = '';
    try {
      const keys = await fetchVoiceKeys(opts.publicEndpoint ?? false);
      dgKey = keys.deepgramKey.trim();
      geminiKey = keys.geminiKey.trim();
      elevKey = keys.elevenlabsKey?.trim();
      groqKey = keys.groqKey?.trim() || '';
      // Cache keys for use by intakeService and other client-side services
      setRuntimeKeys({ deepgramKey: dgKey, geminiKey, elevenlabsKey: elevKey });
      // Track ElevenLabs availability for UI display
      setElevenLabsAvailable(!!elevKey);
      // Set output sample rate based on available provider:
      // ElevenLabs outputs 16kHz PCM, Deepgram Aura-2 outputs 24kHz
      if (elevKey && opts.useElevenLabs) {
        outputRateRef.current = 16000;
        setOutputSampleRate(16000);
      } else {
        outputRateRef.current = OUTPUT_RATE;
        setOutputSampleRate(OUTPUT_RATE);
      }
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
    if (!geminiKey && !groqKey) {
      // We'll use our proxy as the think provider — no external key needed
      console.warn('[VoiceAgent] No external AI keys — using CaseBuddy proxy for think provider');
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

      const ws = new WebSocket(AGENT_WS_URL, ['token', dgKey.trim()]);
      ws.binaryType = 'arraybuffer';
      wsRef.current = ws;

      const prompt = opts.caseContext
        ? `${opts.systemInstruction}\n\nACTIVE CASE CONTEXT (use naturally if relevant):\n${opts.caseContext}`
        : opts.systemInstruction;

      // Speaking rate: natural human pace — 1.0 sounds the most realistic
      const speakRate = opts.speakingRate ?? 1.0;

      ws.onopen = () => {
        // Resolve speak provider: ElevenLabs when key is available + opted in + voice mapped;
        // otherwise fall back to Deepgram Aura-2.
        const elVoiceId = opts.agentId ? getElevenLabsVoiceId(opts.agentId) : undefined;
        const useEl = !!(elevKey && opts.useElevenLabs && elVoiceId);

        // Output sample rate: ElevenLabs outputs 16 kHz natively (no upsampling needed);
        // Aura-2 outputs 24 kHz. Already set on outputRateRef in start() — read it here
        // so the Settings message matches what playAudioChunk expects.
        const outRate = outputRateRef.current;

        // Deepgram's schema is strict: for a BYO third-party TTS provider like
        // ElevenLabs, `type` must be "eleven_labs" (with underscore) — "elevenlabs"
        // isn't a recognized enum value and gets the ENTIRE Settings message
        // rejected as UNPARSABLE_CLIENT_MESSAGE. Also voice_id/api_key/model
        // don't belong inside `provider` at all — they go in a separate
        // top-level `endpoint` block (WS URL + xi-api-key header).
        const speakProvider = useEl
          ? {
              type: 'eleven_labs',
              model_id: 'eleven_turbo_v2_5',
              language_code: 'en-US',
            }
          : {
              type: 'deepgram',
              model: opts.voiceModel,
              speed: speakRate,
            };

        const speakEndpoint = useEl
          ? {
              url: `wss://api.elevenlabs.io/v1/text-to-speech/${elVoiceId}/multi-stream-input`,
              headers: { 'xi-api-key': elevKey },
            }
          : undefined;

        const settings = {
          type: 'Settings',
          audio: {
            input: { encoding: 'linear16', sample_rate: INPUT_RATE },
            output: { encoding: 'linear16', sample_rate: outRate, container: 'none' },
          },
          agent: {
            language: 'en',
            listen: {
              provider: {
                type: 'deepgram',
                model: LISTEN_MODEL,
                // Flux end-of-turn tuning is only accepted on the v2 listen API.
                // Audio encoding/sample_rate belong in audio.input (above) — the
                // agent rejects them here as an unparseable client message.
                version: 'v2',
                // Be patient: don't take the turn until we're confident the
                // caller is done, and tolerate long thinking pauses.
                eot_threshold: EOT_THRESHOLD,
                eot_timeout_ms: EOT_TIMEOUT_MS,
              },
            },
            think: groqKey
              ? {
                  provider: {
                    type: 'openai',
                    url: 'https://api.groq.com/openai/v1',
                    model: 'llama-3.3-70b-versatile',
                    api_key: groqKey,
                    temperature: 0.7,
                  },
                  prompt,
                }
              : geminiKey
              ? {
                  provider: { type: 'google', key: geminiKey, model: 'gemini-1.5-flash', temperature: 0.7 },
                  prompt,
                }
              : {
                  provider: {
                    type: 'openai',
                    url: 'https://casebuddy.live/api/ai/v1',
                    model: 'llama-3.3-70b-versatile',
                    temperature: 0.7,
                  },
                  prompt,
                },
            speak: speakEndpoint ? { provider: speakProvider, endpoint: speakEndpoint } : { provider: speakProvider },
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
