import { useCallback, useEffect, useRef, useState } from 'react';
import { GoogleGenAI } from '@google/genai';
import { streamTTS, createPCMPlayer, openSTTSocket, DeepgramTranscriptEvent } from '../services/deepgramService';

// Gemini 2.5 Flash for the brain — Deepgram Aura-2 for the voice.
const GEMINI_TEXT_MODEL = 'gemini-2.5-flash';

export type VoiceStatus = 'idle' | 'connecting' | 'live' | 'error';
export type Speaker = 'agent' | 'you';

export interface VoiceTurn {
  speaker: Speaker;
  text: string;
  timestamp: number;
}

export interface UseVoiceAgentOptions {
  voiceName: string;          // Deepgram Aura-2 model name, e.g. "aura-2-harmonia-en"
  systemInstruction: string;
  openingDirective: string;
  caseContext?: string;
}

export interface UseVoiceAgentResult {
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

const getGeminiKey = () =>
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

  const optsRef = useRef(options);
  optsRef.current = options;

  // Refs for cleanup
  const micStreamRef = useRef<MediaStream | null>(null);
  const inputCtxRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const sttRef = useRef<{ sendAudio: (d: ArrayBuffer) => void; close: () => void } | null>(null);
  const playerRef = useRef<{ playChunk: (c: Uint8Array) => Promise<void>; stop: () => void } | null>(null);
  const chatRef = useRef<any>(null); // Gemini chat session
  const captionTimer = useRef<any>(null);
  const isListeningRef = useRef(false);
  const interimBuf = useRef('');
  const finalBuf = useRef('');
  const agentBusy = useRef(false); // prevent overlapping agent responses

  const stop = useCallback(() => {
    isListeningRef.current = false;
    try { processorRef.current?.disconnect(); } catch { /* noop */ }
    processorRef.current = null;
    micStreamRef.current?.getTracks().forEach(t => t.stop());
    micStreamRef.current = null;
    try { inputCtxRef.current?.close(); } catch { /* noop */ }
    inputCtxRef.current = null;
    sttRef.current?.close();
    sttRef.current = null;
    playerRef.current?.stop();
    playerRef.current = null;
    chatRef.current = null;
    clearTimeout(captionTimer.current);
    interimBuf.current = '';
    finalBuf.current = '';
    agentBusy.current = false;
    setStatus('idle');
    setActiveSpeaker(null);
    setLiveCaption(null);
    setInputLevel(0);
    setAgentSpeaking(false);
  }, []);

  /** Send user text to Gemini 2.5, stream reply, speak via Deepgram Aura-2 */
  const agentRespond = useCallback(async (userText: string) => {
    if (agentBusy.current || !chatRef.current || !playerRef.current) return;
    agentBusy.current = true;

    // Add user turn to transcript
    setTranscript(prev => [...prev, { speaker: 'you', text: userText, timestamp: Date.now() }]);
    setActiveSpeaker('agent');

    try {
      // Stream text from Gemini
      const result = await chatRef.current.sendMessageStream(userText);

      let fullResponse = '';
      let chunkBuffer = '';

      for await (const chunk of result.stream) {
        const text = chunk.text();
        if (!text) continue;
        chunkBuffer += text;
        fullResponse += text;
        setLiveCaption({ speaker: 'agent', text: fullResponse });

        // Send to Deepgram TTS when we hit a sentence boundary (natural chunking)
        const sentenceEnd = chunkBuffer.search(/[.!?]\s/);
        if (sentenceEnd !== -1 && playerRef.current) {
          const sentence = chunkBuffer.slice(0, sentenceEnd + 1).trim();
          chunkBuffer = chunkBuffer.slice(sentenceEnd + 2);
          if (sentence) {
            try {
              for await (const pcmChunk of streamTTS(sentence, optsRef.current.voiceName)) {
                playerRef.current?.playChunk(pcmChunk);
              }
            } catch (ttsErr) {
              console.error('TTS chunk error:', ttsErr);
            }
          }
        }
      }

      // Speak any remaining buffer text
      const remaining = chunkBuffer.trim();
      if (remaining && playerRef.current) {
        try {
          for await (const pcmChunk of streamTTS(remaining, optsRef.current.voiceName)) {
            playerRef.current?.playChunk(pcmChunk);
          }
        } catch (ttsErr) {
          console.error('TTS tail error:', ttsErr);
        }
      }

      if (fullResponse.trim()) {
        setTranscript(prev => [...prev, { speaker: 'agent', text: fullResponse.trim(), timestamp: Date.now() }]);
      }

      clearTimeout(captionTimer.current);
      captionTimer.current = setTimeout(() => setLiveCaption(null), 2500);
    } catch (e) {
      console.error('Agent respond error:', e);
    } finally {
      agentBusy.current = false;
      setActiveSpeaker(null);
    }
  }, []);

  const start = useCallback(async () => {
    const geminiKey = getGeminiKey();
    if (!geminiKey) {
      setError('Gemini API key not found (VITE_GEMINI_API_KEY).');
      setStatus('error');
      return;
    }

    setError(null);
    setStatus('connecting');
    setTranscript([]);

    try {
      // 1. Mic access
      let micStream: MediaStream;
      try {
        micStream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        });
        micStreamRef.current = micStream;
      } catch {
        throw new Error('Microphone access denied. Allow mic access (and make sure you are on HTTPS).');
      }

      // 2. Audio input context (16kHz for STT)
      const inputCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      await inputCtx.resume();
      inputCtxRef.current = inputCtx;

      // 3. Gemini 2.5 Flash chat session
      const ai = new GoogleGenAI({ apiKey: geminiKey });
      const fullSystem = caseContext
        ? `${systemInstruction}\n\nACTIVE CASE CONTEXT (use naturally if relevant):\n${caseContext}`
        : systemInstruction;

      const chat = ai.chats.create({
        model: GEMINI_TEXT_MODEL,
        config: { systemInstruction: fullSystem },
        history: [],
      });
      chatRef.current = chat;

      // 4. Deepgram PCM player (24kHz output)
      const player = createPCMPlayer((speaking) => {
        setAgentSpeaking(speaking);
        if (!speaking) setActiveSpeaker(null);
      });
      playerRef.current = player;

      // 5. Deepgram STT WebSocket
      let finalSentence = '';
      const stt = openSTTSocket(
        (event: DeepgramTranscriptEvent) => {
          if (event.type === 'interim') {
            interimBuf.current = event.text;
            setActiveSpeaker('you');
            setLiveCaption({ speaker: 'you', text: event.text });
          } else {
            // Final transcript — send to Gemini
            finalSentence = event.text;
            interimBuf.current = '';
            if (finalSentence.trim() && isListeningRef.current && !agentBusy.current) {
              agentRespond(finalSentence.trim());
            }
          }
        },
        (err) => {
          setError(err);
          setStatus('error');
          stop();
        }
      );
      sttRef.current = stt;

      // 6. Wire mic → ScriptProcessor → Deepgram STT
      const source = inputCtx.createMediaStreamSource(micStream);
      const processor = inputCtx.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;

      processor.onaudioprocess = (e) => {
        const float32 = e.inputBuffer.getChannelData(0);

        // Input level for visualizer
        let sum = 0;
        for (let i = 0; i < float32.length; i++) sum += float32[i] * float32[i];
        setInputLevel(Math.min(100, Math.sqrt(sum / float32.length) * 200));

        // Convert float32 → int16 for Deepgram
        const int16 = new Int16Array(float32.length);
        for (let i = 0; i < float32.length; i++) {
          int16[i] = Math.max(-32768, Math.min(32767, float32[i] * 32768));
        }
        stt.sendAudio(int16.buffer);
      };

      source.connect(processor);
      processor.connect(inputCtx.destination);

      isListeningRef.current = true;
      setStatus('live');

      // 7. Agent speaks first (opening directive)
      await agentRespond(openingDirective);

    } catch (e) {
      const message = e instanceof Error ? e.message : 'Could not connect the voice line.';
      setError(message);
      setStatus('error');
      stop();
    }
  }, [voiceName, systemInstruction, caseContext, openingDirective, agentRespond, stop]);

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
