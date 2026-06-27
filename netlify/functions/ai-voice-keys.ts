/**
 * Netlify Function — Voice key exchange (authenticated).
 * Ported from api/ai/voice-keys.ts
 *
 * POST /api/ai/voice-keys
 * Headers: { Authorization: Bearer <supabase_access_token> }
 * Response: { deepgramKey, geminiKey, elevenlabsKey }
 */

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

const json = (body: object, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });

export default async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer '))
    return json({ error: 'Unauthorized. Sign in first.' }, 401);

  const token = authHeader.slice(7);
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  if (!supabaseUrl) return json({ error: 'Supabase not configured.' }, 503);

  try {
    const userResp = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '',
      },
    });
    if (!userResp.ok) return json({ error: 'Invalid or expired session. Please sign in again.' }, 401);
  } catch {
    return json({ error: 'Could not verify authentication.' }, 500);
  }

  const deepgramKey = (process.env.DEEPGRAM_API_KEY || process.env.VITE_DEEPGRAM_API_KEY || '').trim();
  const geminiKey = (process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_KEY || '').trim();
  const elevenlabsKey = (
    process.env.ELEVENLABS_API_KEY ||
    process.env.VITE_ELEVENLABS_API_KEY ||
    ''
  ).trim();

  if (!deepgramKey && !geminiKey && !elevenlabsKey)
    return json({ error: 'No AI API keys configured on server.' }, 503);

  return json({ deepgramKey, geminiKey, elevenlabsKey });
}

export const config = { path: "/api/ai/voice-keys" };
