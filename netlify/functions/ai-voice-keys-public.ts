import type { Handler } from '@netlify/functions';

const CORS = {
  'Access-Control-Allow-Origin': process.env.ALLOWED_ORIGIN || 'https://casebuddy.live',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Cache-Control': 'no-store',
};

const RATE_WINDOW_MS = 60_000;
const RATE_LIMIT = 10;
const grantsByIp = new Map<string, { count: number; resetAt: number }>();

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
    signal: AbortSignal.timeout(5_000),
  });

  if (!response.ok) throw new Error('Voice credential service unavailable');
  const payload = await response.json() as { access_token?: string; expires_in?: number };
  if (!payload.access_token) throw new Error('Voice credential service returned no token');

  return {
    deepgramKey: payload.access_token,
    tokenType: 'bearer',
    expiresIn: Number(payload.expires_in) || 60,
  };
}

function takeGrantSlot(ip: string): { allowed: boolean; retryAfter: number } {
  const now = Date.now();
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

export const handler: Handler = async event => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS, body: '' };
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: CORS, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const forwarded = event.headers['x-forwarded-for'] || '';
  const ip = (event.headers['x-nf-client-connection-ip'] || forwarded.split(',')[0] || 'unknown').trim();
  const slot = takeGrantSlot(ip);
  if (!slot.allowed) {
    return {
      statusCode: 429,
      headers: { ...CORS, 'Retry-After': String(slot.retryAfter) },
      body: JSON.stringify({ error: 'Too many voice credential requests. Please try again shortly.' }),
    };
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
