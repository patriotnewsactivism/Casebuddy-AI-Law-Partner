/**
 * Deprecated browser credential shim.
 *
 * Permanent provider credentials are server-only. This module remains only so
 * legacy imports compile while callers are migrated to authenticated server
 * proxies. It intentionally stores and returns no API keys.
 */

export function setRuntimeKeys(_keys: {
  deepgramKey?: string;
  geminiKey?: string;
  elevenlabsKey?: string;
  groqKey?: string;
}) {
  // Intentionally no-op. Never cache provider credentials in browser memory.
}

export function getGeminiKey(): string {
  return '';
}

export function getDeepgramKey(): string {
  return '';
}

export function getElevenLabsKey(): string {
  return '';
}

export function getGroqKey(): string {
  return '';
}
