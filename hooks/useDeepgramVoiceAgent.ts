import { useCallback, useEffect, useRef, useState } from 'react';
import { playRingback, Ringback } from '../utils/phoneSound';

// Live voice via the Deepgram Voice Agent API:
//   Deepgram Nova (ears) -> Gemini 2.5 Pro (brain, your key) -> Aura-2 (mouth)
// Single WebSocket at wss://agent.deepgram.com/v1/agent/converse.

const AGENT_WS_URL = 'wss://agent.deepgram.com/v1/agent/converse';
const INPUT_RATE = 16000;
const OUTPUT_RATE = 24000;
// Minimum time the line "rings" before the agent picks up — even on a fast
// connection, so it reads like a real phone call rather than an instant answer.
const RING_MIN_MS = 2200;

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
// How quickly we fade the agent's voice out when the caller barges in. A short
// ramp instead of a hard cut means her words are never abruptly clipped.
const BARGE_FADE_MS = 90;

export type VoiceStatus = 'idle' | 'connecting' | 'live' | 'error';
export type Speaker = 'agent' | 'you';

export interface VoiceTurn {
  speaker: Speaker;
  text: string;
  timestamp: number;
}

export interface UseDeepgramVoiceAgentOptions {
  /** Aura-2 voice model id, e.g. "aura-2-helena-en". */
  voiceModel: string;
  /** Gemini system prompt (persona). */
  systemInstruction: string;
  /** First line the agent speaks on connect. */
  greeting: string;
  caseContext?: string;
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

const getDeepgramKey = () =>
  import.meta.env.VITE_DEEPGRAM_API_KEY || (window as any).__DEEPGRAM_API_KEY || '';
const getGeminiKey = () =>
  import.meta.env.VITE_GEMINI_API_KEY || import.meta.env.VITE_API_KEY || (window as any).__GEMINI_API_KEY || '';

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
  const ringRef = useRef<Ringback | null>(null);
  const pickupTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const optsRef = useRef(options);
  optsRef.current = options;

  const clearRing = useCallback(() => {
    if (pickupTimerRef.current) { clearTimeout(pickupTimerRef.current); pickupTimerRef.current = null; }
    ringRef.current?.stop();
    ringRef.current = null;
  }, []);

  // Stop the agent's voice gracefully. Instead of hard-stopping every buffer
  // (which clips her mid-word and sounds jarring), ramp the gain down fast, then
  // stop the now-silent sources. The gain is restored to full for the next turn
  // in playAudioChunk, so a brief false barge-in (a cough, an "mm-hmm") never
  // leaves her permanently muted.
  const clearPlayback = useCallback(() => {
    const outputCtx = outputCtxRef.current;
    const outGain = outGainRef.current;
    const toStop = Array.from(sourcesRef.current);
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
    clearRing();
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
  }, [clearRing]);

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
      // Barge-in: stop the agent immediately so you can interrupt.
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
      setError(data.description || data.message || 'Voice agent error.');
      setStatus('error');
    }
  }, [clearPlayback]);

  const start = useCallback(async () => {
    const dgKey = getDeepgramKey();
    const geminiKey = getGeminiKey();
    if (!dgKey) {
      setError('Deepgram key not found. Set VITE_DEEPGRAM_API_KEY to enable live voice.');
      setStatus('error');
      return;
    }
    if (!geminiKey) {
      setError('Gemini key not found. Set VITE_GEMINI_API_KEY to power the conversation.');
      setStatus('error');
      return;
    }

    setError(null);
    setStatus('connecting');
    setTranscript([]);

    // Starting the ring here — inside the click gesture — also unlocks audio
    // output on iOS Safari before any of the setup below.
    clearRing();
    const ringback = playRingback();
    ringRef.current = ringback;
    const ringStartedAt = Date.now();

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

      // Browser-safe auth: pass the key via the Sec-WebSocket-Protocol subprotocols.
      const ws = new WebSocket(AGENT_WS_URL, ['token', dgKey]);
      ws.binaryType = 'arraybuffer';
      wsRef.current = ws;

      const opts = optsRef.current;
      const prompt = opts.caseContext
        ? `${opts.systemInstruction}\n\nACTIVE CASE CONTEXT (use naturally if relevant):\n${opts.caseContext}`
        : opts.systemInstruction;

      // "Picks up" the line: stop the ring, hand the agent its configuration
      // (which makes it speak the greeting), and open the mic. Held until the
      // socket is actually open AND the minimum ring time has elapsed, so a
      // fast connection still feels like a real call instead of an instant answer.
      const pickUp = () => {
        if (pickupTimerRef.current) { clearTimeout(pickupTimerRef.current); pickupTimerRef.current = null; }
        ringback.stop();
        if (ringRef.current === ringback) ringRef.current = null;
        if (ws.readyState !== WebSocket.OPEN) return;

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
                encoding: 'linear16',
                sample_rate: INPUT_RATE,
                // Be patient: don't take the turn until we're confident the
                // caller is done, and tolerate long thinking pauses.
                eot_threshold: EOT_THRESHOLD,
                eot_timeout_ms: EOT_TIMEOUT_MS,
              },
            },
            think: {
              provider: { type: 'google' },
              endpoint: {
                url: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:streamGenerateContent?alt=sse',
                headers: { 'x-goog-api-key': geminiKey },
              },
              prompt,
            },
            speak: { provider: { type: 'deepgram', model: opts.voiceModel } },
            greeting: opts.greeting,
          },
        };
        ws.send(JSON.stringify(settings));
        setStatus('live');

        // Stream mic audio up as raw linear16 PCM frames.
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

      ws.onopen = () => {
        const remaining = Math.max(0, RING_MIN_MS - (Date.now() - ringStartedAt));
        if (remaining === 0) pickUp();
        else pickupTimerRef.current = setTimeout(pickUp, remaining);
      };

      ws.onmessage = (event) => {
        if (event.data instanceof ArrayBuffer) {
          playAudioChunk(event.data);
        } else {
          try { handleServerMessage(JSON.parse(event.data)); } catch { /* ignore non-JSON */ }
        }
      };

      ws.onerror = () => {
        clearRing();
        setError('The voice line hit an error. Please try again.');
        setStatus('error');
      };
      ws.onclose = () => {
        clearRing();
        if (status !== 'error') stop();
      };
    } catch (e) {
      clearRing();
      const message = e instanceof Error ? e.message : 'Could not connect the voice line.';
      setError(message);
      setStatus('error');
      stop();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clearRing, handleServerMessage, playAudioChunk, stop]);

  useEffect(() => () => stop(), [stop]);

  return { status, error, activeSpeaker, liveCaption, transcript, inputLevel, agentSpeaking, start, stop };
}
