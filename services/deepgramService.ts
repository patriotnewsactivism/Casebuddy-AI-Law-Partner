// Deepgram Aura-2 TTS + STT service
// TTS: REST streaming → PCM audio chunks
// STT: WebSocket live transcription

export const DEEPGRAM_TTS_URL = 'https://api.deepgram.com/v1/speak';
export const DEEPGRAM_STT_WS_URL = 'wss://api.deepgram.com/v1/listen';

const getDeepgramKey = () =>
  import.meta.env.VITE_DEEPGRAM_API_KEY ||
  (window as any).__DEEPGRAM_API_KEY ||
  '';

/**
 * Stream TTS audio from Deepgram Aura-2.
 * Returns an async generator of Uint8Array PCM chunks (linear16, 24kHz).
 */
export async function* streamTTS(
  text: string,
  voiceModel: string, // e.g. "aura-2-thalia-en"
): AsyncGenerator<Uint8Array> {
  const key = getDeepgramKey();
  if (!key) throw new Error('Deepgram API key not found (VITE_DEEPGRAM_API_KEY).');

  const url = `${DEEPGRAM_TTS_URL}?model=${voiceModel}&encoding=linear16&sample_rate=24000&container=none`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Token ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ text }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Deepgram TTS error ${response.status}: ${err}`);
  }

  const reader = response.body!.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) yield value;
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

    // Convert raw linear16 bytes → float32
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
 * Open a Deepgram live STT WebSocket.
 * Returns controls to send audio and close the connection.
 */
export function openSTTSocket(
  onTranscript: (event: DeepgramTranscriptEvent) => void,
  onError: (err: string) => void,
): { sendAudio: (data: ArrayBuffer) => void; close: () => void } {
  const key = getDeepgramKey();
  if (!key) {
    onError('Deepgram API key not found (VITE_DEEPGRAM_API_KEY).');
    return { sendAudio: () => {}, close: () => {} };
  }

  const params = new URLSearchParams({
    model: 'nova-3',
    encoding: 'linear16',
    sample_rate: '16000',
    channels: '1',
    interim_results: 'true',
    smart_format: 'true',
    endpointing: '400',
  });

  const ws = new WebSocket(`${DEEPGRAM_STT_WS_URL}?${params}`, ['token', key]);

  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      const transcript = data?.channel?.alternatives?.[0]?.transcript ?? '';
      if (!transcript) return;
      const isFinal = data?.is_final === true;
      onTranscript({ type: isFinal ? 'final' : 'interim', text: transcript });
    } catch { /* ignore parse errors */ }
  };

  ws.onerror = () => onError('Deepgram STT connection error.');
  ws.onclose = () => {};

  return {
    sendAudio: (data: ArrayBuffer) => {
      if (ws.readyState === WebSocket.OPEN) ws.send(data);
    },
    close: () => {
      if (ws.readyState === WebSocket.OPEN) ws.close();
    },
  };
}
