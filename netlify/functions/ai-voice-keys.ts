import type { Handler } from '@netlify/functions';

const CORS = {
  'Access-Control-Allow-Origin': process.env.ALLOWED_ORIGIN || 'https://casebuddy.live',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Cache-Control': 'no-store',
};

async function grantDeepgramToken() {
  const apiKey = (process.env.DEEPGRAM_API_KEY || '').trim();
  if (!apiKey) throw new Error('Voice service not configured');

  const response = await fetch('https://api.deepgram.com/v1/auth/grant', {
    method: 'POST',
    headers: {
      Authorization: `Token ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ ttl_seconds: 60 }),
  });

  if (!response.ok) throw new Error('Voice credential service unavailable');
  const payload = await response.json() as { access_token?: string; expires_in?: number };
  if (!payload.access_token) throw new Error('Voice credential service returned no token');

  return {
    deepgramToken: payload.access_token,
    expiresIn: Number(payload.expires_in) || 60,
    elevenlabsAvailable: Boolean((process.env.ELEVENLABS_API_KEY || '').trim()),
  };
}

export const handler: Handler = async event => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS, body: '' };
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: CORS, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const authHeader = event.headers.authorization || '';
  if (!authHeader.startsWith('Bearer ')) {
    return { statusCode: 401, headers: CORS, body: JSON.stringify({ error: 'Unauthorized' }) };
  }

  const supabaseUrl = (process.env.SUPABASE_URL || '').trim();
  const anonKey = (process.env.SUPABASE_ANON_KEY || '').trim();
  if (!supabaseUrl || !anonKey) {
    return { statusCode: 503, headers: CORS, body: JSON.stringify({ error: 'Authentication service unavailable' }) };
  }

  try {
    const userResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: {
        Authorization: authHeader,
        apikey: anonKey,
      },
    });
    if (!userResponse.ok) {
      return { statusCode: 401, headers: CORS, body: JSON.stringify({ error: 'Invalid or expired session' }) };
    }
  } catch {
    return { statusCode: 503, headers: CORS, body: JSON.stringify({ error: 'Authentication service unavailable' }) };
  }

  try {
    const token = await grantDeepgramToken();
    return { statusCode: 200, headers: CORS, body: JSON.stringify(token) };
  } catch {
    return {
      statusCode: 503,
      headers: CORS,
      body: JSON.stringify({ error: 'Voice credential service unavailable' }),
    };
  }
};
