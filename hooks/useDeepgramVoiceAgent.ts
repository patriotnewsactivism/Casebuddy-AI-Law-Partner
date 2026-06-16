import { useCallback, useEffect, useRef, useState } from 'react';
import { getSession } from '../services/authService';

// Live voice via the Deepgram Voice Agent API:
//   Deepgram Nova (ears) -> Gemini 2.5 Flash (brain) -> Aura-2 (mouth)
// Single WebSocket at wss://agent.deepgram.com/v1/agent/converse.
//
// API keys are fetched at runtime from /api/ai/voice-keys (behind auth)
// so they never appear in the JS bundle.

const AGENT_WS_URL = 'wss://agent.deepgram.com/v1/agent/converse';
const INPUT_RATE = 16000;
const OUTPUT_RATE = 24000;

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

/**
 * Fetch API keys from the server at runtime (never baked into the bundle).
 * Falls back to env vars for local development only.
 */
const fetchVoiceKeys = async (): Promise<{ deepgramKey: string; geminiKey: string }> => {
  // Try server endpoint first (production path)
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

  // Local dev fallback — reads from import.meta.env (only available in dev builds)
  const deepgramKey = import.meta.env.VITE_DEEPGRAM_API_KEY || (window as any).__DEEPGRAM_API_KEY || '';
  const geminiKey = import.meta.env.VITE_GEMINI_API_KEY || import.meta.env.VITE_API_KEY || (window as any).__GEMINI_API_KEY || '';
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

  const clearPlayback = useCallback(() => {
    sourcesRef.current.forEach(s => { try { s.stop(); } catch { /* noop */ } });
    sourcesRef.current.clear();
    nextStartRef.current = 0;
    setAgentSpeaking(false);
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
      setError(data.description || data.message || 'Voice agent error.');
      setStatus('error');
    }
  }, [clearPlayback]);

  const start = useCallback(async () => {
    setError(null);
    setStatus('connecting');
    setTranscript([]);

    // Fetch keys from server (never baked into bundle)
    let dgKey: string;
    let geminiKey: string;
    try {
      const keys = await fetchVoiceKeys();
      dgKey = keys.deepgramKey;
      geminiKey = keys.geminiKey;
    } catch {
      setError('Could not retrieve voice credentials. Please sign in and try again.');
      setStatus('error');
      return;
    }

    if (!dgKey) {
      setError('Deepgram key not available. Check your configuration.');
      setStatus('error');
      return;
    }
    if (!geminiKey) {
      setError('Gemini key not available. Check your configuration.');
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

      const ws = new WebSocket(AGENT_WS_URL, ['token', dgKey]);
      ws.binaryType = 'arraybuffer';
      wsRef.current = ws;

      const opts = optsRef.current;
      const prompt = opts.caseContext
        ? `${opts.systemInstruction}\n\nACTIVE CASE CONTEXT (use naturally if relevant):\n${opts.caseContext}`
        : opts.systemInstruction;

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
              provider: { type: 'deepgram', model: 'nova-3' },
            },
            think: {
              provider: { type: 'google' },
              endpoint: {
                url: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:streamGenerateContent?alt=sse',
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
