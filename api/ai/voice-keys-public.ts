/**
 * Public intake voice credential broker.
 *
 * This endpoint never returns permanent provider credentials. It exchanges the
 * server-held Deepgram API key for a short-lived bearer token that is valid for
 * the Voice Agent connection handshake.
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
    'Access-Control-Allow-Headers': 'Content-Type',
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

  try {
    const grant = await grantDeepgramToken();
    return json(req, {
      deepgramKey: grant.accessToken,
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
