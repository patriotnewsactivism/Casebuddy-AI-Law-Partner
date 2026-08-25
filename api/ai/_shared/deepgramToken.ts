export interface DeepgramTokenGrant {
  accessToken: string;
  expiresIn: number;
}

/**
 * Why a voice-credential grant failed. These are coarse operational codes, not
 * credential material — they are safe to return to a caller and exist so an
 * operator can tell a missing environment variable apart from a provider
 * rejection without needing dashboard access.
 */
export type DeepgramGrantReason =
  | 'not_configured'
  | 'provider_rejected'
  | 'provider_timeout'
  | 'provider_unreachable'
  | 'provider_no_token';

export class DeepgramGrantError extends Error {
  readonly reason: DeepgramGrantReason;
  /** Upstream HTTP status, when the provider actually answered. */
  readonly providerStatus?: number;

  constructor(reason: DeepgramGrantReason, message: string, providerStatus?: number) {
    super(message);
    this.name = 'DeepgramGrantError';
    this.reason = reason;
    this.providerStatus = providerStatus;
  }
}

const DEEPGRAM_GRANT_URL = 'https://api.deepgram.com/v1/auth/grant';
const DEFAULT_TTL_SECONDS = 60;
const GRANT_TIMEOUT_MS = 5_000;

/**
 * Exchange the server-held Deepgram API key for a short-lived bearer token.
 * The permanent API key must never be returned to a browser or logged.
 *
 * Deepgram requires the key to carry Member-or-higher project authorization for
 * this endpoint, so a key that works elsewhere can still be refused here — that
 * arrives as `provider_rejected` with a 401/403 providerStatus.
 */
export async function grantDeepgramToken(ttlSeconds = DEFAULT_TTL_SECONDS): Promise<DeepgramTokenGrant> {
  const apiKey = (process.env.DEEPGRAM_API_KEY || '').trim();
  if (!apiKey) {
    throw new DeepgramGrantError('not_configured', 'DEEPGRAM_API_KEY is not set on the server');
  }

  const ttl = Math.min(300, Math.max(15, Math.floor(ttlSeconds)));

  let response: Response;
  try {
    response = await fetch(DEEPGRAM_GRANT_URL, {
      method: 'POST',
      headers: {
        Authorization: `Token ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ttl_seconds: ttl }),
      signal: AbortSignal.timeout(GRANT_TIMEOUT_MS),
    });
  } catch (error) {
    const timedOut = error instanceof Error && error.name === 'TimeoutError';
    throw new DeepgramGrantError(
      timedOut ? 'provider_timeout' : 'provider_unreachable',
      timedOut
        ? `Deepgram grant timed out after ${GRANT_TIMEOUT_MS}ms`
        : 'Deepgram grant request could not be completed',
    );
  }

  if (!response.ok) {
    // Deepgram error bodies carry err_code/err_msg and never echo the API key,
    // so a truncated copy is safe to log and is usually the fastest diagnosis.
    let detail = '';
    try {
      detail = (await response.text()).slice(0, 300);
    } catch { /* body is optional diagnostic detail */ }

    console.error('[voice-token] Deepgram grant rejected', { status: response.status, detail });
    throw new DeepgramGrantError(
      'provider_rejected',
      `Deepgram refused the grant (HTTP ${response.status})`,
      response.status,
    );
  }

  const payload = await response.json() as { access_token?: string; expires_in?: number };
  const accessToken = String(payload.access_token || '').trim();
  if (!accessToken) {
    throw new DeepgramGrantError('provider_no_token', 'Deepgram returned no access_token');
  }

  return {
    accessToken,
    expiresIn: Number(payload.expires_in) || ttl,
  };
}

/** Narrow an unknown catch value to the operational reason code. */
export function grantFailureReason(error: unknown): DeepgramGrantReason | 'unknown' {
  return error instanceof DeepgramGrantError ? error.reason : 'unknown';
}
