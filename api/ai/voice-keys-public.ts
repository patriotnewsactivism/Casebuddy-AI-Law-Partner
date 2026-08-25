/**
 * Public intake voice credential broker.
 *
 * This endpoint never returns permanent provider credentials. It exchanges the
 * server-held Deepgram API key for a short-lived bearer token for CaseBuddy's
 * public intake experience. Client-specific links are validated through the
 * scoped intake RPC; the generic /intake entrypoint is limited to same-origin
 * browser requests and stricter IP-based grant pacing.
 */

import { grantDeepgramToken, grantFailureReason, DeepgramGrantError } from './_shared/deepgramToken';

export const config = { runtime: 'edge' };

const RATE_WINDOW_MS = 60_000;
const TOKEN_RATE_LIMIT = 10;
const GENERIC_RATE_LIMIT = 6;
const AUTH_TIMEOUT_MS = 5_000;
const grantsByKey = new Map<string, { count: number; resetAt: number }>();

const SUPABASE_URL = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').trim();
const SUPABASE_ANON_KEY = (process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '').trim();

function configuredOrigins(): string[] {
  return (process.env.ALLOWED_ORIGIN || 'https://casebuddy.live')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
}

function requestOrigin(req: Request): string {
  try {
    return new URL(req.url).origin;
  } catch {
    return '';
  }
}

function isSameOrigin(req: Request): boolean {
  const origin = (req.headers.get('origin') || '').trim();
  const ownOrigin = requestOrigin(req);
  return Boolean(origin && ownOrigin && origin === ownOrigin);
}

function corsHeaders(req: Request): Record<string, string> {
  const configured = configuredOrigins();
  const origin = (req.headers.get('origin') || '').trim();
  const ownOrigin = requestOrigin(req);
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

const json = (req: Request, body: object, status = 200, extraHeaders: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), ...extraHeaders, 'Content-Type': 'application/json' },
  });

function clientIp(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for') || '';
  return (forwarded.split(',')[0] || req.headers.get('x-real-ip') || 'unknown').trim();
}

function intakeTokenFromRequest(req: Request): string | null {
  const explicit = (req.headers.get('X-Intake-Token') || '').trim();
  if (explicit) return explicit;

  const referrer = req.headers.get('referer') || '';
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

function isGenericPublicIntakeRequest(req: Request): boolean {
  if (!isSameOrigin(req)) return false;

  const referrer = req.headers.get('referer') || '';
  if (!referrer) return false;
  try {
    const url = new URL(referrer);
    if (url.origin !== requestOrigin(req)) return false;
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
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ p_token: candidate }),
      signal: AbortSignal.timeout(AUTH_TIMEOUT_MS),
    });
    if (!response.ok) return false;
    const data = await response.json().catch(() => null) as any;
    if (Array.isArray(data)) return data.some(row => Boolean(row?.firm_id));
    return Boolean(data?.firm_id);
  } catch {
    return false;
  }
}

function takeGrantSlot(req: Request, scope: string, limit: number): { allowed: boolean; retryAfter: number } {
  const now = Date.now();
  const key = `${clientIp(req)}:${scope}`;
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

export default async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(req) });
  }
  if (req.method !== 'POST') return json(req, { error: 'Method not allowed' }, 405);

  const intakeToken = intakeTokenFromRequest(req);
  let scope = 'generic';
  let limit = GENERIC_RATE_LIMIT;

  if (intakeToken) {
    if (!(await validIntakeToken(intakeToken))) {
      return json(req, { error: 'A valid intake link is required for this voice session.' }, 401);
    }
    scope = `token:${intakeToken.slice(-8)}`;
    limit = TOKEN_RATE_LIMIT;
  } else if (!isGenericPublicIntakeRequest(req)) {
    return json(req, { error: 'Public voice access is limited to the CaseBuddy intake experience.' }, 401);
  }

  const slot = takeGrantSlot(req, scope, limit);
  if (!slot.allowed) {
    return json(
      req,
      { error: 'Too many voice credential requests. Please try again shortly.' },
      429,
      { 'Retry-After': String(slot.retryAfter) },
    );
  }

  try {
    const grant = await grantDeepgramToken();
    return json(req, {
      deepgramKey: grant.accessToken,
      tokenType: 'bearer',
      expiresIn: grant.expiresIn,
    });
  } catch (error) {
    // `reason` is a coarse operational code, never credential material. It lets
    // an operator separate "key missing from this deployment" from "Deepgram
    // refused the key" without dashboard access. The upstream status stays in
    // the server log only, since this endpoint is unauthenticated.
    const reason = grantFailureReason(error);
    console.error('[voice-token-public] grant failed', {
      reason,
      providerStatus: error instanceof DeepgramGrantError ? error.providerStatus : undefined,
      message: error instanceof Error ? error.message : 'unknown error',
    });
    return json(req, { error: 'Voice service is temporarily unavailable.', reason }, 503);
  }
}
