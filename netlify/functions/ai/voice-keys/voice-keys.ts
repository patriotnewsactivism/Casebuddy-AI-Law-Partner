import { Handler } from '@netlify/functions';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export const handler: Handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: CORS, body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: CORS, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const authHeader = event.headers['authorization'];
  if (!authHeader?.startsWith('Bearer ')) {
    return { statusCode: 401, headers: CORS, body: JSON.stringify({ error: 'Unauthorized. Sign in first.' }) };
  }

  const token = authHeader.slice(7);
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  if (!supabaseUrl) {
    return { statusCode: 503, headers: CORS, body: JSON.stringify({ error: 'Supabase not configured.' }) };
  }

  try {
    const userResp = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '',
      },
    });
    if (!userResp.ok) {
      return { statusCode: 401, headers: CORS, body: JSON.stringify({ error: 'Invalid or expired session. Please sign in again.' }) };
    }
  } catch {
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: 'Could not verify authentication.' }) };
  }

  const deepgramKey = process.env.DEEPGRAM_API_KEY || process.env.VITE_DEEPGRAM_API_KEY || '';
  const geminiKey = process.env.GEMINI_API_KEY || '';

  if (!deepgramKey || !geminiKey) {
    return { statusCode: 503, headers: CORS, body: JSON.stringify({ error: 'Voice API keys not configured on server.' }) };
  }

  return {
    statusCode: 200,
    headers: CORS,
    body: JSON.stringify({ deepgramKey, geminiKey })
  };
};
