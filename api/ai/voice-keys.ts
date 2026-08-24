/**
 * Authenticated voice credential broker.
 *
 * Validates the caller's Supabase session, then returns only a short-lived
 * Deepgram bearer token. Permanent AI/provider credentials remain server-side.
 */

import { grantDeepgramToken } from './_shared/deepgramToken';

export const config = { runtime: 'edge' };

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
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Cache-Control': 'no-store',
    Vary: 'Origin',
  };
}

const json = (req: Request, body: object, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
  });

export default async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(req) });
  }
  if (req.method !== 'POST') return json(req, { error: 'Method not allowed' }, 405);

  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return json(req, { error: 'Unauthorized. Sign in first.' }, 401);
  }

  const supabaseUrl = (process.env.SUPABASE_URL || '').trim();
  const supabaseAnonKey = (process.env.SUPABASE_ANON_KEY || '').trim();
  if (!supabaseUrl || !supabaseAnonKey) {
    console.error('[voice-token] Supabase server configuration missing');
    return json(req, { error: 'Authentication service unavailable.' }, 503);
  }

  const sessionToken = authHeader.slice(7).trim();
  try {
    const userResp = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: {
        Authorization: `Bearer ${sessionToken}`,
        apikey: supabaseAnonKey,
      },
    });
    if (!userResp.ok) {
      return json(req, { error: 'Invalid or expired session. Please sign in again.' }, 401);
    }
  } catch {
    return json(req, { error: 'Could not verify authentication.' }, 503);
  }

  try {
    const grant = await grantDeepgramToken();
    return json(req, {
      deepgramKey: grant.accessToken,
      tokenType: 'bearer',
      expiresIn: grant.expiresIn,
    });
  } catch (error) {
    console.error('[voice-token] grant failed', {
      message: error instanceof Error ? error.message : 'unknown error',
    });
    return json(req, { error: 'Voice service is temporarily unavailable.' }, 503);
  }
}
