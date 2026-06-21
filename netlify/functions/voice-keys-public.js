exports.handler = async (event) => {
  const CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: CORS, body: JSON.stringify({ error: 'Method not allowed' }) };

  const deepgramKey = (process.env.DEEPGRAM_API_KEY || process.env.VITE_DEEPGRAM_API_KEY || '').trim();
  const geminiKey   = (process.env.GEMINI_API_KEY   || process.env.VITE_GEMINI_API_KEY   || '').trim();

  if (!deepgramKey) {
    return { statusCode: 503, headers: CORS, body: JSON.stringify({ error: 'Voice service not configured.' }) };
  }
  return { statusCode: 200, headers: CORS, body: JSON.stringify({ deepgramKey, geminiKey }) };
};
