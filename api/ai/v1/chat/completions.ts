/**
 * OpenAI-compatible chat completions endpoint for Deepgram voice agent.
 * 
 * Deepgram's agent infrastructure calls {url}/chat/completions with OpenAI format.
 * This endpoint delegates to our multi-provider proxy and returns OpenAI-compatible format.
 *
 * POST /api/ai/v1/chat/completions
 */

export const config = { runtime: 'edge' };

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

const json = (body: object, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });

// ── Provider configs ──────────────────────────────────────────────────────
const GROQ_KEY = (process.env.GROQ_API_KEY || process.env.VITE_GROQ_API_KEY || '').trim();
const GEMINI_KEY = (process.env.GEMINI_API_KEY || '').trim();
const GITHUB_TOKEN = (process.env.GITHUB_TOKEN || process.env.VITE_GITHUB_TOKEN || '').trim();
const OPENROUTER_KEY = (process.env.OPENROUTER_API_KEY || process.env.VITE_OPENROUTER_API_KEY || '').trim();

const GROQ_MODEL = 'llama-3.3-70b-versatile';
const GEMINI_MODEL = 'gemini-2.0-flash';
const OPENROUTER_MODEL = 'google/gemma-3-27b-it:free';
const GITHUB_MODEL = 'gpt-4o-mini';

async function tryGroq(body: any): Promise<string | null> {
  if (!GROQ_KEY) return null;
  const resp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${GROQ_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: body.model || GROQ_MODEL,
      messages: [...(body.messages || [])],
      temperature: body.temperature ?? 0.7,
      max_tokens: body.max_tokens ?? 2048,
    }),
  });
  if (!resp.ok) return null;
  const data = await resp.json();
  return data?.choices?.[0]?.message?.content || null;
}

async function tryGitHub(body: any): Promise<string | null> {
  if (!GITHUB_TOKEN) return null;
  const resp = await fetch('https://models.inference.ai.azure.com/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${GITHUB_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: GITHUB_MODEL,
      messages: [...(body.messages || [])],
      temperature: body.temperature ?? 0.7,
      max_tokens: body.max_tokens ?? 2048,
    }),
  });
  if (!resp.ok) return null;
  const data = await resp.json();
  return data?.choices?.[0]?.message?.content || null;
}

async function tryGemini(body: any): Promise<string | null> {
  if (!GEMINI_KEY) return null;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_KEY}`;
  const contents = (body.messages || []).map((m: any) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }));
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents, generationConfig: { temperature: body.temperature ?? 0.7, maxOutputTokens: body.max_tokens ?? 2048 } }),
  });
  if (!resp.ok) return null;
  const data = await resp.json();
  return data?.candidates?.[0]?.content?.parts?.[0]?.text || null;
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }

  const providers = [tryGroq, tryGitHub, tryGemini];
  for (const fn of providers) {
    try {
      const text = await fn(body);
      if (text) {
        return json({
          id: 'chatcmpl-' + Date.now(),
          object: 'chat.completion',
          created: Math.floor(Date.now() / 1000),
          model: GROQ_MODEL,
          choices: [{ index: 0, message: { role: 'assistant', content: text }, finish_reason: 'stop' }],
        });
      }
    } catch { /* try next */ }
  }
  return json({ error: 'All AI providers exhausted' }, 503);
}
