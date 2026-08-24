// ElevenLabs TTS service. Permanent provider credentials stay in Supabase;
// the browser only receives generated PCM audio.

import { getSupabase } from './supabaseClient';
import { handleError } from '../utils/errorHandler';

export const ELEVENLABS_VOICE_ID = '9BWtsw7tY7h4bXPiq3aY';

export const voiceProfiles: Record<string, string> = {
  maya: '9BWtsw7tY7h4bXPiq3aY',
  lex: '9BWtsw7tY7h4bXPiq3aY',
  doc: '9BWtsw7tY7h4bXPiq3aY',
  rex: '9BWtsw7tY7h4bXPiq3aY',
  sol: '9BWtsw7tY7h4bXPiq3aY',
  sierra: '9BWtsw7tY7h4bXPiq3aY',
  jules: '9BWtsw7tY7h4bXPiq3aY',
  max: '9BWtsw7tY7h4bXPiq3aY',
};

/**
 * Generate ElevenLabs PCM audio through the authenticated Supabase proxy.
 * The async-generator contract is preserved for existing callers.
 */
export async function* streamElevenLabsTTS(
  text: string,
  voiceId: string = ELEVENLABS_VOICE_ID,
): AsyncGenerator<Uint8Array> {
  const supabase = getSupabase();
  if (!supabase) throw new Error('TTS requires a signed-in CaseBuddy session.');

  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error('Sign in is required for TTS.');

  const supabaseUrl = String(import.meta.env.VITE_SUPABASE_URL || '').replace(/\/$/, '');
  const anonKey = String(import.meta.env.VITE_SUPABASE_ANON_KEY || '');
  if (!supabaseUrl || !anonKey) throw new Error('TTS service is not configured.');

  let response: Response;
  try {
    response = await fetch(`${supabaseUrl}/functions/v1/tts-generate`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        apikey: anonKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ text, voiceId, outputFormat: 'pcm_24000' }),
    });
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    handleError(err, 'Failed to connect to the TTS service');
    throw err;
  }

  if (!response.ok || !response.body) {
    const error = new Error(`TTS service unavailable (${response.status}).`);
    handleError(error, 'TTS generation failed');
    throw error;
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
