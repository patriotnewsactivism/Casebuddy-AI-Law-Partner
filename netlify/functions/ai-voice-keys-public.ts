/**
 * Public intake voice credential broker (Netlify parity implementation).
 *
 * Mirrors `api/ai/voice-keys-public.ts`. This endpoint never returns permanent
 * provider credentials: it exchanges the server-held Deepgram API key for a
 * short-lived bearer token. Client/firm-specific intake links are validated
 * through the scoped Supabase RPC; the generic /intake entrypoint is limited to
 * same-origin browser requests and stricter IP-based grant pacing.
 *
 * Netlify and Vercel must stay behaviourally equivalent — see CLAUDE.md. Do not
 * relax the caller checks here to make a preview deploy work.
 */

import type { Handler, HandlerEvent } from '@netlify/functions';
import {
  grantDeepgramToken,
  grantFailureReason,
  DeepgramGrantError,
} from '../../api/ai/_shared/deepgramToken';

const RATE_WINDOW_MS = 60_000;
const TOKEN_RATE_LIMIT = 10;
const GENERIC_RATE_LIMIT = 6;
const AUTH_TIMEOUT_MS = 5_000;
const GRANT_TTL_SECONDS = 60;

// Best-effort pacing. Netlify may run several concurrent function instances, so
// this bounds abuse per instance rather than acting as a global quota; the
// 60-second token TTL remains the primary blast-radius control.
const grantsByKey = new Map<string, { count: number; resetAt: number }>();

const SUPABASE_URL = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').trim();
const SUPABASE_ANON_KEY = (process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '').trim();

function configuredOrigins(): string[] {
  return (process.env.ALLOWED_ORIGIN || 'https://casebuddy.live')
    .split(',')
    .map(value => value.trim())
    .filter(Boolean);
}

function header(event: HandlerEvent, name: string): string {
  return (event.headers[name] || event.headers[name.toLowerCase()] || '').trim();
}

function requestOrigin(event: HandlerEvent): string {
  try {
    return new URL(event.rawUrl).origin;
  } catch {
    return '';
  }
}

function isSameOrigin(event: HandlerEvent): boolean {
  const origin = header(event, 'origin');
  const ownOrigin = requestOrigin(event);
  return Boolean(origin && ownOrigin && origin === ownOrigin);
}

function corsHeaders(event: HandlerEvent): Record<string, string> {
  const configured = configuredOrigins();
  const origin = header(event, 'origin');
  const ownOrigin = requestOrigin(event);
  const allowedOrigin = origin && (origin === ownOrigin || configured.includes(origin))
    ? origin
    : configured[0];

  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Intake-Token',
    'Cache-Control': 'no-store',
    Vary: 'Origin',
  };
}

const json = (
  event: HandlerEvent,
  body: object,
  statusCode = 200,
  extraHeaders: Record<string, string> = {},
) => ({
  statusCode,
  headers: { ...corsHeaders(event), ...extraHeaders, 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

function clientIp(event: HandlerEvent): string {
  const forwarded = header(event, 'x-forwarded-for');
  return (
    header(event, 'x-nf-client-connection-ip') ||
    forwarded.split(',')[0]?.trim() ||
    'unknown'
  );
}

function intakeTokenFromRequest(event: HandlerEvent): string | null {
  const explicit = header(event, 'x-intake-token');
  if (explicit) return explicit;

  const referrer = header(event, 'referer');
  if (!referrer) return null;
  try {
    const url = new URL(referrer);
    const match = url.pathname.match(/^\/intake\/([^/]+)\/?$/i);
    if (!match?.[1]) return null;
    return decodeURIComponent(match[1]).trim() || null;
  } catch {
    return null;
  }
}

function isGenericPublicIntakeRequest(event: HandlerEvent): boolean {
  if (!isSameOrigin(event)) return false;

  const referrer = header(event, 'referer');
  if (!referrer) return false;
  try {
    const url = new URL(referrer);
    if (url.origin !== requestOrigin(event)) return false;
    return /^\/intake\/?$/i.test(url.pathname);
  } catch {
    return false;
  }
}

async function validIntakeToken(token: string): Promise<boolean> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return false;
  const candidate = token.trim();
  if (candidate.length < 5 || candidate.length > 64) return false;

  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/resolve_public_intake_token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({ p_token: candidate }),
      signal: AbortSignal.timeout(AUTH_TIMEOUT_MS),
    });
    if (!response.ok) return false;

    const payload = await response.json() as unknown;
    const row = Array.isArray(payload) ? payload[0] : payload;
    return Boolean(row && typeof row === 'object' && (row as { firm_id?: string }).firm_id);
  } catch {
    return false;
  }
}

function takeGrantSlot(event: HandlerEvent, scope: string, limit: number): { allowed: boolean; retryAfter: number } {
  const now = Date.now();
  const key = `${clientIp(event)}:${scope}`;
  const current = grantsByKey.get(key);

  if (!current || current.resetAt <= now) {
    grantsByKey.set(key, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return { allowed: true, retryAfter: 0 };
  }

  if (current.count >= limit) {
    return { allowed: false, retryAfter: Math.max(1, Math.ceil((current.resetAt - now) / 1000)) };
  }

  current.count += 1;
  return { allowed: true, retryAfter: 0 };
}

export const handler: Handler = async event => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders(event), body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return json(event, { error: 'Method not allowed' }, 405);
  }

  const intakeToken = intakeTokenFromRequest(event);
  let scope = 'generic';
  let limit = GENERIC_RATE_LIMIT;

  if (intakeToken) {
    if (!(await validIntakeToken(intakeToken))) {
      return json(event, { error: 'A valid intake link is required for this voice session.' }, 401);
    }
    scope = `token:${intakeToken.slice(-8)}`;
    limit = TOKEN_RATE_LIMIT;
  } else if (!isGenericPublicIntakeRequest(event)) {
    return json(event, { error: 'Public voice access is limited to the CaseBuddy intake experience.' }, 401);
  }

  const slot = takeGrantSlot(event, scope, limit);
  if (!slot.allowed) {
    return json(
      event,
      { error: 'Too many voice credential requests. Please try again shortly.' },
      429,
      { 'Retry-After': String(slot.retryAfter) },
    );
  }

  try {
    const grant = await grantDeepgramToken(GRANT_TTL_SECONDS);
    return json(event, {
      deepgramKey: grant.accessToken,
      tokenType: 'bearer',
      expiresIn: grant.expiresIn,
    });
  } catch (error) {
    const reason = grantFailureReason(error);
    console.error('[voice-token-public] grant failed', {
      reason,
      providerStatus: error instanceof DeepgramGrantError ? error.providerStatus : undefined,
      message: error instanceof Error ? error.message : 'unknown error',
    });
    return json(event, { error: 'Voice service is temporarily unavailable.', reason }, 503);
  }
};
