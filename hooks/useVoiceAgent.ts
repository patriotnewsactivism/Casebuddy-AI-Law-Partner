import { useCallback, useEffect, useRef, useState } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality } from '@google/genai';
import { createBlob, decode, decodeAudioData } from '../utils/liveAudio';

const NATIVE_AUDIO_MODEL = 'gemini-2.5-flash-native-audio-preview-09-2025';

export type VoiceStatus = 'idle' | 'connecting' | 'live' | 'error';
export type Speaker = 'agent' | 'you';

export interface VoiceTurn {
  speaker: Speaker;
  text: string;
  timestamp: number;
}

export interface UseVoiceAgentOptions {
  voiceName: string;
  systemInstruction: string;
  openingDirective: string;
  caseContext?: string;
}

export interface UseVoiceAgentResult {
  status: VoiceStatus;
  error: string | null;
  /** Who is currently producing audio. null when nobody is mid-turn. */
  activeSpeaker: Speaker | null;
  /** Live, still-streaming caption for the current turn. */
  liveCaption: { speaker: Speaker; text: string } | null;
  /** Completed conversation turns, in order. */
  transcript: VoiceTurn[];
  /** Mic input level 0-100, for visualizing that you're being heard. */
  inputLevel: number;
  /** True while the agent's audio is actively playing. */
  agentSpeaking: boolean;
  start: () => Promise<void>;
  stop: () => void;
}

const getApiKey = () =>
  import.meta.env.VITE_GEMINI_API_KEY ||
  import.meta.env.VITE_API_KEY ||
  (window as any).__GEMINI_API_KEY ||
  '';

export function useVoiceAgent(options: UseVoiceAgentOptions): UseVoiceAgentResult {
  const { voiceName, systemInstruction, openingDirective, caseContext } = options;

  const [status, setStatus] = useState<VoiceStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [activeSpeaker, setActiveSpeaker] = useState<Speaker | null>(null);
  const [liveCaption, setLiveCaption] = useState<{ speaker: Speaker; text: string } | null>(null);
  const [transcript, setTranscript] = useState<VoiceTurn[]>([]);
  const [inputLevel, setInputLevel] = useState(0);
  const [agentSpeaking, setAgentSpeaking] = useState(false);

  const sessionRef = useRef<any>(null);
  const inputCtxRef = useRef<AudioContext | null>(null);
  const outputCtxRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const nextStartRef = useRef(0);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const inputBuf = useRef('');
  const outputBuf = useRef('');
  const captionTimer = useRef<any>(null);
  const speakingTimer = useRef<any>(null);

  // Keep latest options in refs so callbacks don't go stale.
  const optsRef = useRef(options);
  optsRef.current = options;

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
    inputBuf.current = '';
    outputBuf.current = '';
    clearTimeout(captionTimer.current);
    clearTimeout(speakingTimer.current);
    if (sessionRef.current) {
      sessionRef.current.then((s: any) => { try { s.close(); } catch { /* noop */ } });
      sessionRef.current = null;
    }
    setStatus('idle');
    setActiveSpeaker(null);
    setLiveCaption(null);
    setInputLevel(0);
    setAgentSpeaking(false);
  }, []);

  const start = useCallback(async () => {
    const apiKey = getApiKey();
    if (!apiKey) {
      setError('Gemini API key not found. The voice line needs VITE_GEMINI_API_KEY configured.');
      setStatus('error');
      return;
    }

    setError(null);
    setStatus('connecting');
    setTranscript([]);

    try {
      const inputCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      const outputCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      await inputCtx.resume();
      await outputCtx.resume();
      inputCtxRef.current = inputCtx;
      outputCtxRef.current = outputCtx;

      const outputNode = outputCtx.createGain();
      outputNode.connect(outputCtx.destination);

      let micStream: MediaStream;
      try {
        micStream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        });
        streamRef.current = micStream;
      } catch {
        throw new Error('Microphone access denied. Allow mic access (and make sure you are on HTTPS) to talk with the team.');
      }

      const ai = new GoogleGenAI({ apiKey });
      const fullSystem = caseContext
        ? `${systemInstruction}\n\nACTIVE CASE CONTEXT (use naturally if relevant):\n${caseContext}`
        : systemInstruction;

      const sessionPromise = ai.live.connect({
        model: NATIVE_AUDIO_MODEL,
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName } } },
          systemInstruction: fullSystem,
          inputAudioTranscription: {},
          outputAudioTranscription: {},
        },
        callbacks: {
          onopen: () => {
            setStatus('live');

            // Make the agent SPEAK FIRST — this is what makes it feel like a
            // real person greeting you, not a chatbot waiting for input.
            sessionPromise.then(session =>
              session.sendClientContent({
                turns: [{ role: 'user', parts: [{ text: optsRef.current.openingDirective }] }],
                turnComplete: true,
              })
            );

            // Stream mic audio up.
            const source = inputCtx.createMediaStreamSource(micStream);
            const processor = inputCtx.createScriptProcessor(4096, 1, 1);
            processorRef.current = processor;
            processor.onaudioprocess = (e) => {
              const data = e.inputBuffer.getChannelData(0);
              let sum = 0;
              for (let i = 0; i < data.length; i++) sum += data[i] * data[i];
              setInputLevel(Math.min(100, Math.sqrt(sum / data.length) * 200));
              const blob = createBlob(data);
              sessionPromise.then(s => s.sendRealtimeInput({ media: blob }));
            };
            source.connect(processor);
            processor.connect(inputCtx.destination);
          },
          onmessage: async (msg: LiveServerMessage) => {
            const audioData = msg.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
            if (audioData) {
              if (outputCtx.state === 'suspended') await outputCtx.resume();
              setAgentSpeaking(true);
              setActiveSpeaker('agent');
              nextStartRef.current = Math.max(nextStartRef.current, outputCtx.currentTime);
              const audioBuffer = await decodeAudioData(decode(audioData), outputCtx, 24000, 1);
              const src = outputCtx.createBufferSource();
              src.buffer = audioBuffer;
              src.connect(outputNode);
              src.addEventListener('ended', () => {
                sourcesRef.current.delete(src);
                // When the queue drains, the agent has stopped talking.
                clearTimeout(speakingTimer.current);
                speakingTimer.current = setTimeout(() => {
                  if (sourcesRef.current.size === 0) setAgentSpeaking(false);
                }, 150);
              });
              src.start(nextStartRef.current);
              nextStartRef.current += audioBuffer.duration;
              sourcesRef.current.add(src);
            }

            if (msg.serverContent?.inputTranscription?.text) {
              inputBuf.current += msg.serverContent.inputTranscription.text;
              setActiveSpeaker('you');
              setLiveCaption({ speaker: 'you', text: inputBuf.current });
            }
            if (msg.serverContent?.outputTranscription?.text) {
              outputBuf.current += msg.serverContent.outputTranscription.text;
              setLiveCaption({ speaker: 'agent', text: outputBuf.current });
            }

            if (msg.serverContent?.turnComplete) {
              if (inputBuf.current.trim()) {
                const text = inputBuf.current.trim();
                setTranscript(prev => [...prev, { speaker: 'you', text, timestamp: Date.now() }]);
                inputBuf.current = '';
              }
              if (outputBuf.current.trim()) {
                const text = outputBuf.current.trim();
                setTranscript(prev => [...prev, { speaker: 'agent', text, timestamp: Date.now() }]);
                outputBuf.current = '';
              }
              clearTimeout(captionTimer.current);
              captionTimer.current = setTimeout(() => setLiveCaption(null), 2500);
            }
          },
          onclose: () => stop(),
          onerror: (e: any) => {
            console.error('Voice session error:', e);
            setError('The voice line dropped. Please try again.');
            setStatus('error');
            stop();
          },
        },
      });
      sessionRef.current = sessionPromise;
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Could not connect the voice line.';
      setError(message);
      setStatus('error');
      stop();
    }
  }, [voiceName, systemInstruction, caseContext, stop]);

  // Clean up on unmount.
  useEffect(() => () => stop(), [stop]);

  return {
    status,
    error,
    activeSpeaker,
    liveCaption,
    transcript,
    inputLevel,
    agentSpeaking,
    start,
    stop,
  };
}
