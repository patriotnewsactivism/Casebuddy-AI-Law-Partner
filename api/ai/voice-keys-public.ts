/**
 * Vercel Edge Function — Public voice key exchange (no auth required).
 * Used by the public intake page where visitors are not signed in.
 * Only returns the Deepgram key — Gemini key is NOT exposed here.
 * The Deepgram key is rate-limited per IP by Vercel edge middleware.
 *
 * POST /api/ai/voice-keys-public
 * Response: { deepgramKey }
 */

export const config = { runtime: 'edge' };

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const json = (body: object, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });

export default async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const deepgramKey = (
    process.env.DEEPGRAM_API_KEY ||
    process.env.VITE_DEEPGRAM_API_KEY ||
    process.env.VITE_DEEPGRAM_KEY ||
    ''
  ).trim();

  if (!deepgramKey) {
    return json({ error: 'Voice service not configured.' }, 503);
  }

  // Only return the Deepgram key — Gemini key must NOT be exposed publicly.
  return json({ deepgramKey });
}
