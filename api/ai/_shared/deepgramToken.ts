export interface DeepgramTokenGrant {
  accessToken: string;
  expiresIn: number;
}

const DEEPGRAM_GRANT_URL = 'https://api.deepgram.com/v1/auth/grant';
const DEFAULT_TTL_SECONDS = 60;

/**
 * Exchange the server-held Deepgram API key for a short-lived bearer token.
 * The permanent API key must never be returned to a browser or logged.
 */
export async function grantDeepgramToken(ttlSeconds = DEFAULT_TTL_SECONDS): Promise<DeepgramTokenGrant> {
  const apiKey = (process.env.DEEPGRAM_API_KEY || '').trim();
  if (!apiKey) {
    throw new Error('Voice service not configured');
  }

  const ttl = Math.min(300, Math.max(15, Math.floor(ttlSeconds)));
  const response = await fetch(DEEPGRAM_GRANT_URL, {
    method: 'POST',
    headers: {
      Authorization: `Token ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ ttl_seconds: ttl }),
  });

  if (!response.ok) {
    console.error('[voice-token] Deepgram grant failed', { status: response.status });
    throw new Error('Voice credential service unavailable');
  }

  const payload = await response.json() as { access_token?: string; expires_in?: number };
  const accessToken = String(payload.access_token || '').trim();
  if (!accessToken) {
    throw new Error('Voice credential service returned no token');
  }

  return {
    accessToken,
    expiresIn: Number(payload.expires_in) || ttl,
  };
}
