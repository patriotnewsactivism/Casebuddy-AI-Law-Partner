import type { Handler } from '@netlify/functions';
import {
  grantDeepgramToken,
  grantFailureReason,
  DeepgramGrantError,
} from '../../api/ai/_shared/deepgramToken';

const CORS = {
  'Access-Control-Allow-Origin': process.env.ALLOWED_ORIGIN || 'https://casebuddy.live',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Cache-Control': 'no-store',
};

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
      signal: AbortSignal.timeout(5_000),
    });
    if (!userResponse.ok) {
      return { statusCode: 401, headers: CORS, body: JSON.stringify({ error: 'Invalid or expired session' }) };
    }
  } catch {
    return { statusCode: 503, headers: CORS, body: JSON.stringify({ error: 'Authentication service unavailable' }) };
  }

  try {
    const grant = await grantDeepgramToken();
    return {
      statusCode: 200,
      headers: CORS,
      body: JSON.stringify({
        deepgramKey: grant.accessToken,
        tokenType: 'bearer',
        expiresIn: grant.expiresIn,
      }),
    };
  } catch (error) {
    const reason = grantFailureReason(error);
    const providerStatus = error instanceof DeepgramGrantError ? error.providerStatus : undefined;
    console.error('[voice-token] grant failed', {
      reason,
      providerStatus,
      message: error instanceof Error ? error.message : 'unknown error',
    });
    return {
      statusCode: 503,
      headers: CORS,
      body: JSON.stringify({ error: 'Voice service is temporarily unavailable.', reason, providerStatus }),
    };
  }
};
