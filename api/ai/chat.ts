/**
 * Multi-Provider AI Chat Proxy
 * 
 * Accepts OpenAI-compatible chat completion requests and routes through
 * free-tier providers with automatic fallback.
 * 
 * Fallback chain: Groq (fast, 100K tokens/day free) → Gemini (existing) → OpenRouter (27 free models)
 *
 * POST /api/ai/chat
 * Body: { messages, model?, temperature?, max_tokens?, json_mode?, system? }
 */

export const config = { runtime: 'edge' };

const CORS = {
  'Access-Control-Allow-Origin': process.env.ALLOWED_ORIGIN || '*',
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
const OPENROUTER_KEY = (process.env.OPENROUTER_API_KEY || process.env.VITE_OPENROUTER_API_KEY || '').trim();
const GITHUB_TOKEN = (process.env.GITHUB_TOKEN || process.env.VITE_GITHUB_TOKEN || '').trim();

// Free-tier models
const GROQ_MODEL = 'llama-3.3-70b-versatile';        // 100K tokens/day free
const GROQ_FALLBACK = 'meta-llama/llama-4-scout-17b-16e-instruct'; // smaller, faster
const GEMINI_MODEL = 'gemini-2.0-flash';              // free tier on AI Studio
const OPENROUTER_MODEL = 'google/gemma-3-27b-it:free'; // free on OpenRouter
const GITHUB_MODEL = 'gpt-4o';                        // free via GitHub Models
const GITHUB_FALLBACK = 'gpt-4o-mini';                 // cheaper, faster

// ── Groq (OpenAI-compatible) ──────────────────────────────────────────────

async function callGroq(body: any): Promise<Response> {
  if (!GROQ_KEY) throw new Error('Groq not configured');
  
  const groqBody = {
    model: body.model || GROQ_MODEL,
    messages: [
      ...(body.system ? [{ role: 'system', content: body.system }] : []),
      ...(body.messages || []),
    ],
    temperature: body.temperature ?? 0.3,
    max_tokens: body.max_tokens ?? 2048,
  };

  const resp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${GROQ_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(groqBody),
  });

  if (!resp.ok) {
    const err = await resp.text().catch(() => 'Unknown error');
    throw new Error(`Groq ${resp.status}: ${err.slice(0, 300)}`);
  }

  return resp;
}

// ── Gemini (Google AI Studio) ─────────────────────────────────────────────

async function callGemini(body: any): Promise<Response> {
  if (!GEMINI_KEY) throw new Error('Gemini not configured');

  const model = body.model || GEMINI_MODEL;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_KEY}`;

  const contents = (body.messages || []).map((m: any) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }));

  const geminiBody: any = { contents };
  if (body.system) {
    geminiBody.systemInstruction = { parts: [{ text: body.system }] };
  }
  geminiBody.generationConfig = {
    temperature: body.temperature ?? 0.7,
    maxOutputTokens: body.max_tokens ?? 2048,
    ...(body.json_mode ? { responseMimeType: 'application/json' } : {}),
  };

  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(geminiBody),
  });

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(`Gemini ${resp.status}: ${err?.error?.message || 'Unknown error'}`);
  }

  return resp;
}

// ── OpenRouter (free models) ──────────────────────────────────────────────

async function callOpenRouter(body: any): Promise<Response> {
  if (!OPENROUTER_KEY) throw new Error('OpenRouter not configured');

  const orBody = {
    model: body.model || OPENROUTER_MODEL,
    messages: [
      ...(body.system ? [{ role: 'system', content: body.system }] : []),
      ...(body.messages || []),
    ],
    temperature: body.temperature ?? 0.3,
    max_tokens: body.max_tokens ?? 2048,
  };

  const resp = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENROUTER_KEY}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://casebuddy.live',
      'X-Title': 'CaseBuddy AI Law Partner',
    },
    body: JSON.stringify(orBody),
  });

  if (!resp.ok) {
    const err = await resp.text().catch(() => 'Unknown error');
    throw new Error(`OpenRouter ${resp.status}: ${err.slice(0, 300)}`);
  }

  return resp;
}

// ── GitHub Models (free GPT-4o via GitHub Marketplace) ────────────────────

async function callGitHubModels(body: any): Promise<Response> {
  if (!GITHUB_TOKEN) throw new Error('GitHub token not configured');

  const ghBody = {
    model: body.model || GITHUB_MODEL,
    messages: [
      ...(body.system ? [{ role: 'system', content: body.system }] : []),
      ...(body.messages || []),
    ],
    temperature: body.temperature ?? 0.3,
    max_tokens: body.max_tokens ?? 2048,
  };

  const resp = await fetch('https://models.inference.ai.azure.com/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${GITHUB_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(ghBody),
  });

  if (!resp.ok) {
    const err = await resp.text().catch(() => 'Unknown error');
    throw new Error(`GitHub Models ${resp.status}: ${err.slice(0, 300)}`);
  }

  return resp;
}

// ── Parsing helpers ───────────────────────────────────────────────────────

function parseGroqResponse(data: any): string {
  return data?.choices?.[0]?.message?.content || '';
}

function parseGeminiResponse(data: any): string {
  return data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

function parseOpenRouterResponse(data: any): string {
  return data?.choices?.[0]?.message?.content || '';
}

// ── Main handler ──────────────────────────────────────────────────────────

export default async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }
  if (!body.messages?.length) return json({ error: 'Missing messages' }, 400);

  // Provider chain: Groq → GitHub (gpt-4o) → Gemini → OpenRouter
  const providers = [
    // Gemini first — valid key, no burst rate limits on 46-file batches
    { name: 'gemini', fn: callGemini, parse: parseGeminiResponse, key: GEMINI_KEY },
    { name: 'github', fn: callGitHubModels, parse: parseOpenRouterResponse, key: GITHUB_TOKEN },
    { name: 'groq', fn: callGroq, parse: parseGroqResponse, key: GROQ_KEY },
    { name: 'openrouter', fn: callOpenRouter, parse: parseOpenRouterResponse, key: OPENROUTER_KEY },
  ];

  for (const provider of providers) {
    if (!provider.key) continue;
    try {
      const t0 = Date.now();
      const resp = await provider.fn(body);
      const data = await resp.json();
      const text = provider.parse(data);

      if (!text) {
        console.warn(`[chat] ${provider.name} returned empty response`);
        continue;
      }

      return json({
        text,
        choices: [{
          message: { role: 'assistant', content: text },
          finish_reason: 'stop',
          index: 0,
        }],
        provider: provider.name,
        model: body.model || (provider.name === 'groq' ? GROQ_MODEL : provider.name === 'gemini' ? GEMINI_MODEL : OPENROUTER_MODEL),
        latency_ms: Date.now() - t0,
      });
    } catch (err: any) {
      const msg = err?.message || String(err);
      console.warn(`[chat] ${provider.name} failed: ${msg.slice(0, 200)}`);
      
      // If credit exhaustion (429), try next provider
      if (msg.includes('429') || msg.includes('quota') || msg.includes('exhausted') || msg.includes('credits')) {
        continue;
      }
      // For Groq rate limits, try next
      if (msg.includes('rate_limit') || msg.includes('Rate limit')) {
        continue;
      }
      // For other errors, also try next provider
      continue;
    }
  }

  return json({ error: 'All AI providers exhausted. Try again later or configure additional API keys.' }, 503);
}
