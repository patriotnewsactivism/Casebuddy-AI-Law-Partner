/**
 * Netlify Function — Public voice key exchange (no auth).
 * Ported from api/ai/voice-keys-public.ts
 *
 * POST /api/ai/voice-keys-public
 * Response: { deepgramKey }
 */

const CORS: Record<string, string> = {
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
    ''
  ).trim();

  if (!deepgramKey) return json({ error: 'Voice service not configured.' }, 503);

  return json({ deepgramKey });
}

export const config = { path: "/api/ai/voice-keys-public" };
