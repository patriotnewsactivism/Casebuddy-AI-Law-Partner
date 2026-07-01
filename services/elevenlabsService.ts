// ElevenLabs TTS streaming service
// Streams 16kHz PCM audio chunks for compatibility with existing audio pipeline

import { getElevenLabsKey } from './runtimeKeys';
import { handleError } from '../utils/errorHandler';

const ELEVENLABS_TTS_URL = 'https://api.elevenlabs.io/v1/text-to-speech';

// Default voice ID: Jessica — warm, mature, professional female (best for intake)
export const ELEVENLABS_VOICE_ID = '9BWtsw7tY7h4bXPiq3aY';

// Voice profiles mapping agent IDs to voice IDs
export const voiceProfiles: Record<string, string> = {
  maya: '9BWtsw7tY7h4bXPiq3aY',       // Aria — warm, natural American female
  lex: '9BWtsw7tY7h4bXPiq3aY',        // Aria
  doc: '9BWtsw7tY7h4bXPiq3aY',        // Aria
  rex: '9BWtsw7tY7h4bXPiq3aY',        // Aria
  sol: '9BWtsw7tY7h4bXPiq3aY',        // Aria
  sierra: '9BWtsw7tY7h4bXPiq3aY',     // Aria
  jules: '9BWtsw7tY7h4bXPiq3aY',      // Aria
  max: '9BWtsw7tY7h4bXPiq3aY',        // Aria
};

/**
 * Stream TTS audio from ElevenLabs.
 * Returns an async generator of Uint8Array PCM chunks (16kHz).
 */
export async function* streamElevenLabsTTS(
  text: string,
  voiceId: string = ELEVENLABS_VOICE_ID,
): AsyncGenerator<Uint8Array> {
  const key = getElevenLabsKey();
  if (!key) {
    const error = new Error('ElevenLabs API key not found. Set VITE_ELEVENLABS_API_KEY or fetch key at runtime.');
    handleError(error, 'ElevenLabs API key not configured');
    throw error;
  }

  const url = `${ELEVENLABS_TTS_URL}/${voiceId}/stream?output_format=pcm_16000`;

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'xi-api-key': key,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ text }),
    });
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    handleError(err, 'Failed to connect to ElevenLabs API');
    throw err;
  }

  if (!response.ok) {
    let errBody = '';
    try {
      errBody = await response.text();
    } catch {
      errBody = 'Unable to read error response';
    }
    const error = new Error(`ElevenLabs TTS error ${response.status}: ${errBody}`);
    handleError(error, `ElevenLabs API error (${response.status})`);
    throw error;
  }

  if (!response.body) {
    throw new Error('No response body from ElevenLabs');
  }

  const reader = response.body.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) yield value;
    }
  } finally {
    reader.releaseLock();
  }
}