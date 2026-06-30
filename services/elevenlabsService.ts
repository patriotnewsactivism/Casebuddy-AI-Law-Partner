// ElevenLabs TTS streaming service
// Streams 16kHz PCM audio chunks for compatibility with existing audio pipeline

import { getElevenLabsKey } from './runtimeKeys';
import { handleError } from '../utils/errorHandler';

const ELEVENLABS_TTS_URL = 'https://api.elevenlabs.io/v1/text-to-speech';

// Default voice ID: Jessica — warm, mature, professional female (best for intake)
export const ELEVENLABS_VOICE_ID = 'cgSgspJ2msm6clMCkdW9';

// Voice profiles mapping agent IDs to voice IDs
export const voiceProfiles: Record<string, string> = {
  maya: 'cgSgspJ2msm6clMCkdW9',       // Jessica — warm, mature, professional female (best for intake)
  lex: 'EXAVITQu4vr4xnSDxMaL',        // Bella — confident young American female
  doc: '21m00Tcm4TlvDq8ikWAM',        // Rachel — calm, measured American female
  rex: 'TxGEqnHWrfWFTfGW9XjX',        // Josh — deep, authoritative American male
  sol: 'AZnzlk1XvdvUeBnXmlld',        // Domi — warm American female
  sierra: 'MF3mGyEYCl7XYWbV9V6O',     // Elli — young, energetic American female
  jules: 'VR6AewLTigWG4xSOukaG',      // Arnold — older, wise American male
  max: 'CYF1gP2qUTsFqyVYgFBP',        // Ethan — young, friendly American male
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