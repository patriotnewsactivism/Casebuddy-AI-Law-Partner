/**
 * Public intake voice credential broker.
 *
 * This endpoint never returns permanent provider credentials. It exchanges the
 * server-held Deepgram API key for a short-lived bearer token that is valid for
 * the Voice Agent connection handshake.
 */

import { grantDeepgramToken } from './_shared/deepgramToken';

export const config = { runtime: 'edge' };

const RATE_WINDOW_MS = 60_000;
const RATE_LIMIT = 10;
const grantsByIp = new Map<string, { count: number; resetAt: number }>();

function corsHeaders(req: Request): Record<string, string> {
  const configured = (process.env.ALLOWED_ORIGIN || 'https://casebuddy.live')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  const origin = req.headers.get('origin') || '';
  const allowedOrigin = configured.includes(origin) ? origin : configured[0];
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
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

function takeGrantSlot(req: Request): { allowed: boolean; retryAfter: number } {
  const now = Date.now();
  const ip = clientIp(req);
  const current = grantsByIp.get(ip);

  if (!current || current.resetAt <= now) {
    grantsByIp.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return { allowed: true, retryAfter: 0 };
  }

  if (current.count >= RATE_LIMIT) {
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

  const slot = takeGrantSlot(req);
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
      deepgramToken: grant.accessToken,
      tokenType: 'bearer',
      expiresIn: grant.expiresIn,
    });
  } catch (error) {
    console.error('[voice-token-public] grant failed', {
      message: error instanceof Error ? error.message : 'unknown error',
    });
    return json(req, { error: 'Voice service is temporarily unavailable.' }, 503);
  }
}
