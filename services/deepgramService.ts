import { getSupabase } from './supabaseClient';
import { streamElevenLabsTTS } from './elevenlabsService';

// Deepgram Aura-2 TTS + STT service. Permanent provider credentials never enter
// the browser; authenticated clients receive a short-lived Deepgram JWT.

export const DEEPGRAM_TTS_URL = 'https://api.deepgram.com/v1/speak';
export const DEEPGRAM_STT_WS_URL = 'wss://api.deepgram.com/v1/listen';

async function getDeepgramToken(): Promise<string> {
  const supabase = getSupabase();
  if (!supabase) throw new Error('Voice service requires a signed-in CaseBuddy session.');

  const { data, error } = await supabase.functions.invoke('deepgram-token', { body: {} });
  const token = String(data?.deepgramToken || '').trim();
  if (error || !token || data?.tokenType !== 'bearer') {
    throw new Error('Could not retrieve a temporary voice credential.');
  }
  return token;
}

/**
 * Stream TTS audio from Deepgram Aura-2 using a short-lived bearer token.
 * Returns an async generator of Uint8Array PCM chunks (linear16, 24kHz).
 */
export async function* streamTTS(
  text: string,
  voiceModel: string,
): AsyncGenerator<Uint8Array> {
  const token = await getDeepgramToken();
  const url = `${DEEPGRAM_TTS_URL}?model=${encodeURIComponent(voiceModel)}&encoding=linear16&sample_rate=24000&container=none&speed=1.15`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ text }),
  });

  if (!response.ok || !response.body) {
    throw new Error(`Deepgram TTS unavailable (${response.status}).`);
  }

  const reader = response.body.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) yield value;
  }
}

/**
 * Stream TTS with server-proxied ElevenLabs as primary when a voice id is
 * supplied, then fall back to Deepgram temporary-token TTS.
 */
export async function* streamTTSWithFallback(
  text: string,
  elevenlabsVoiceId?: string,
  fallbackAuraVoice: string = 'aura-2-thalia-en',
): AsyncGenerator<Uint8Array> {
  if (elevenlabsVoiceId) {
    try {
      for await (const chunk of streamElevenLabsTTS(text, elevenlabsVoiceId)) {
        yield chunk;
      }
      return;
    } catch (err) {
      console.warn('Server-proxied ElevenLabs TTS failed; falling back to Deepgram.', err);
    }
  }

  for await (const chunk of streamTTS(text, fallbackAuraVoice)) {
    yield chunk;
  }
}

/**
 * Play PCM (linear16, 24kHz mono) Uint8Array chunks via Web Audio API.
 * Returns a function to stop playback.
 */
export function createPCMPlayer(onSpeakingChange: (speaking: boolean) => void) {
  const ctx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
  let nextStart = 0;
  let activeSources = 0;

  const playChunk = async (chunk: Uint8Array) => {
    if (ctx.state === 'suspended') await ctx.resume();

    const samples = chunk.length / 2;
    const float32 = new Float32Array(samples);
    const view = new DataView(chunk.buffer, chunk.byteOffset, chunk.byteLength);
    for (let i = 0; i < samples; i++) {
      float32[i] = view.getInt16(i * 2, true) / 32768;
    }

    const buffer = ctx.createBuffer(1, float32.length, 24000);
    buffer.copyToChannel(float32, 0);

    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(ctx.destination);

    nextStart = Math.max(nextStart, ctx.currentTime);
    src.start(nextStart);
    nextStart += buffer.duration;
    activeSources++;
    onSpeakingChange(true);

    src.onended = () => {
      activeSources--;
      if (activeSources === 0) onSpeakingChange(false);
    };
  };

  const stop = () => {
    try { ctx.close(); } catch { /* noop */ }
    activeSources = 0;
    onSpeakingChange(false);
  };

  return { playChunk, stop, ctx };
}

export interface DeepgramTranscriptEvent {
  type: 'interim' | 'final';
  text: string;
}

/**
 * Open a Deepgram live STT WebSocket. Token retrieval happens asynchronously
 * inside this function so legacy callers can keep the synchronous control API.
 */
export function openSTTSocket(
  onTranscript: (event: DeepgramTranscriptEvent) => void,
  onError: (err: string) => void,
): { sendAudio: (data: ArrayBuffer) => void; close: () => void } {
  let ws: WebSocket | null = null;
  let closed = false;

  const params = new URLSearchParams({
    model: 'nova-3',
    encoding: 'linear16',
    sample_rate: '16000',
    channels: '1',
    interim_results: 'true',
    smart_format: 'true',
    endpointing: '400',
  });

  void getDeepgramToken()
    .then(token => {
      if (closed) return;
      ws = new WebSocket(`${DEEPGRAM_STT_WS_URL}?${params}`, ['bearer', token]);

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          const transcript = data?.channel?.alternatives?.[0]?.transcript ?? '';
          if (!transcript) return;
          onTranscript({ type: data?.is_final === true ? 'final' : 'interim', text: transcript });
        } catch { /* ignore malformed provider events */ }
      };

      ws.onerror = () => onError('Deepgram STT connection error.');
    })
    .catch(() => onError('Could not retrieve a temporary Deepgram token.'));

  return {
    sendAudio: (data: ArrayBuffer) => {
      if (ws?.readyState === WebSocket.OPEN) ws.send(data);
    },
    close: () => {
      closed = true;
      if (ws?.readyState === WebSocket.OPEN || ws?.readyState === WebSocket.CONNECTING) ws.close();
    },
  };
}
