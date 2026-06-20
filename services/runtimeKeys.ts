/**
 * Runtime key store — keys fetched server-side at session start are cached here
 * so that client-side services (intakeService, etc.) can use them without
 * reading from import.meta.env (which is empty in production for private keys).
 *
 * This module is the single source of truth for runtime API keys on the client.
 */

let _geminiKey = '';
let _deepgramKey = '';

/** Called once by the voice hook after successfully fetching keys from the server. */
export function setRuntimeKeys(keys: { deepgramKey?: string; geminiKey?: string }) {
  if (keys.deepgramKey) _deepgramKey = keys.deepgramKey;
  if (keys.geminiKey)   _geminiKey   = keys.geminiKey;
}

/**
 * Returns the Gemini API key. Priority:
 * 1. Key fetched at runtime from the server (production)
 * 2. import.meta.env (local dev only)
 * 3. window.__GEMINI_API_KEY (legacy)
 */
export function getGeminiKey(): string {
  return (
    _geminiKey ||
    (import.meta.env.VITE_GEMINI_API_KEY as string) ||
    (import.meta.env.VITE_API_KEY as string) ||
    ((window as any).__GEMINI_API_KEY as string) ||
    ''
  );
}

export function getDeepgramKey(): string {
  return (
    _deepgramKey ||
    (import.meta.env.VITE_DEEPGRAM_API_KEY as string) ||
    ((window as any).__DEEPGRAM_API_KEY as string) ||
    ''
  );
}
