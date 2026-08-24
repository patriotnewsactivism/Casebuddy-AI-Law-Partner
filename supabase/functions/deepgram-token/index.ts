import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Cache-Control': 'no-store',
};

const json = (body: object, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...CORS, 'Content-Type': 'application/json' },
});

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const apiKey = (Deno.env.get('DEEPGRAM_API_KEY') || '').trim();
  if (!apiKey) return json({ error: 'Voice service unavailable' }, 503);

  try {
    const response = await fetch('https://api.deepgram.com/v1/auth/grant', {
      method: 'POST',
      headers: {
        Authorization: `Token ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ttl_seconds: 60 }),
      signal: AbortSignal.timeout(5_000),
    });

    if (!response.ok) {
      console.error('[deepgram-token] grant failed', { status: response.status });
      return json({ error: 'Voice credential service unavailable' }, 503);
    }

    const payload = await response.json() as { access_token?: string; expires_in?: number };
    const token = String(payload.access_token || '').trim();
    if (!token) return json({ error: 'Voice credential service unavailable' }, 503);

    return json({
      deepgramToken: token,
      tokenType: 'bearer',
      expiresIn: Number(payload.expires_in) || 60,
    });
  } catch {
    return json({ error: 'Voice credential service unavailable' }, 503);
  }
});