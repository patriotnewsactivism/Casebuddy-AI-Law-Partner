/**
 * Multi-provider AI chat proxy.
 *
 * Provider credentials are server-only. The browser submits messages and the
 * server walks the configured provider chain until one succeeds.
 */

export const config = { runtime: 'edge' };

const PROVIDER_TIMEOUT_MS = 45_000;

const GROQ_KEY = (process.env.GROQ_API_KEY || '').trim();
const GEMINI_KEY = (process.env.GEMINI_API_KEY || '').trim();
const OPENROUTER_KEY = (process.env.OPENROUTER_API_KEY || '').trim();
const GITHUB_TOKEN = (process.env.GITHUB_TOKEN || '').trim();
const COHERE_KEY = (process.env.COHERE_API_KEY || '').trim();
const OPENAI_KEY = (process.env.OPENAI_API_KEY || '').trim();

const GROQ_MODEL = 'llama-3.3-70b-versatile';
const GEMINI_MODEL = 'gemini-2.5-flash';
const OPENROUTER_MODEL = 'google/gemma-3-27b-it:free';
const GITHUB_MODEL = 'gpt-4o';
const COHERE_MODEL = 'command-a-plus-05-2026';
const OPENAI_MODEL = 'gpt-4o-mini';

function corsHeaders(req: Request): Record<string, string> {
  const configured = (process.env.ALLOWED_ORIGIN || 'https://casebuddy.live')
    .split(',')
    .map(value => value.trim())
    .filter(Boolean);
  const origin = req.headers.get('origin') || '';
  const allowedOrigin = configured.includes(origin) ? origin : configured[0];
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Cache-Control': 'no-store',
    Vary: 'Origin',
  };
}

const json = (req: Request, body: object, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
  });

function messagesFor(body: any) {
  return [
    ...(body.system ? [{ role: 'system', content: body.system }] : []),
    ...(Array.isArray(body.messages) ? body.messages : []),
  ];
}

function openAiCompatibleBody(body: any, model: string) {
  return {
    model,
    messages: messagesFor(body),
    temperature: body.temperature ?? 0.3,
    max_tokens: body.max_tokens ?? 2048,
    ...(body.json_mode ? { response_format: { type: 'json_object' } } : {}),
  };
}

async function checkedFetch(url: string, init: RequestInit, provider: string): Promise<Response> {
  const response = await fetch(url, {
    ...init,
    signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`${provider} ${response.status}${detail ? `: ${detail.slice(0, 200)}` : ''}`);
  }
  return response;
}

async function callCohere(body: any): Promise<Response> {
  if (!COHERE_KEY) throw new Error('Cohere not configured');
  return checkedFetch('https://api.cohere.com/v2/chat', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${COHERE_KEY}`,
      'Content-Type': 'application/json',
      'X-Client-Name': 'casebuddy-ai',
    },
    body: JSON.stringify({
      model: COHERE_MODEL,
      messages: messagesFor(body),
      temperature: body.temperature ?? 0.3,
      max_tokens: body.max_tokens ?? 4096,
      ...(body.json_mode ? { response_format: { type: 'json_object' } } : {}),
    }),
  }, 'Cohere');
}

async function callGemini(body: any): Promise<Response> {
  if (!GEMINI_KEY) throw new Error('Gemini not configured');

  const contents = (body.messages || []).map((message: any) => ({
    role: message.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: message.content }],
  }));
  const payload: any = {
    contents,
    generationConfig: {
      temperature: body.temperature ?? 0.3,
      maxOutputTokens: body.max_tokens ?? 2048,
      ...(body.json_mode ? { responseMimeType: 'application/json' } : {}),
    },
  };
  if (body.system) payload.systemInstruction = { parts: [{ text: body.system }] };

  return checkedFetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    },
    'Gemini',
  );
}

async function callGitHubModels(body: any): Promise<Response> {
  if (!GITHUB_TOKEN) throw new Error('GitHub Models not configured');
  return checkedFetch('https://models.inference.ai.azure.com/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${GITHUB_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(openAiCompatibleBody(body, GITHUB_MODEL)),
  }, 'GitHub Models');
}

async function callGroq(body: any): Promise<Response> {
  if (!GROQ_KEY) throw new Error('Groq not configured');
  return checkedFetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${GROQ_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(openAiCompatibleBody(body, GROQ_MODEL)),
  }, 'Groq');
}

async function callOpenRouter(body: any): Promise<Response> {
  if (!OPENROUTER_KEY) throw new Error('OpenRouter not configured');
  return checkedFetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${OPENROUTER_KEY}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://casebuddy.live',
      'X-Title': 'CaseBuddy AI Law Partner',
    },
    body: JSON.stringify(openAiCompatibleBody(body, OPENROUTER_MODEL)),
  }, 'OpenRouter');
}

async function callOpenAI(body: any): Promise<Response> {
  if (!OPENAI_KEY) throw new Error('OpenAI not configured');
  return checkedFetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${OPENAI_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(openAiCompatibleBody(body, OPENAI_MODEL)),
  }, 'OpenAI');
}

function parseOpenAI(data: any): string {
  return data?.choices?.[0]?.message?.content || '';
}

function parseGemini(data: any): string {
  return data?.candidates?.[0]?.content?.parts?.map((part: any) => part?.text || '').join('') || '';
}

function parseCohere(data: any): string {
  const parts = data?.message?.content || [];
  return parts
    .filter((part: any) => part?.type === 'text')
    .map((part: any) => part?.text || '')
    .join('')
    .trim();
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(req) });
  if (req.method !== 'POST') return json(req, { error: 'Method not allowed' }, 405);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json(req, { error: 'Invalid JSON' }, 400);
  }

  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return json(req, { error: 'Missing messages' }, 400);
  }

  const providers = [
    { name: 'cohere', key: COHERE_KEY, model: COHERE_MODEL, call: callCohere, parse: parseCohere },
    { name: 'gemini', key: GEMINI_KEY, model: GEMINI_MODEL, call: callGemini, parse: parseGemini },
    { name: 'github', key: GITHUB_TOKEN, model: GITHUB_MODEL, call: callGitHubModels, parse: parseOpenAI },
    { name: 'groq', key: GROQ_KEY, model: GROQ_MODEL, call: callGroq, parse: parseOpenAI },
    { name: 'openrouter', key: OPENROUTER_KEY, model: OPENROUTER_MODEL, call: callOpenRouter, parse: parseOpenAI },
    { name: 'openai', key: OPENAI_KEY, model: OPENAI_MODEL, call: callOpenAI, parse: parseOpenAI },
  ];

  for (const provider of providers) {
    if (!provider.key) continue;
    try {
      const startedAt = Date.now();
      const response = await provider.call(body);
      const data = await response.json();
      const text = provider.parse(data).trim();
      if (!text) {
        console.warn(`[chat] ${provider.name} returned empty response`);
        continue;
      }

      return json(req, {
        text,
        choices: [{ message: { role: 'assistant', content: text }, finish_reason: 'stop', index: 0 }],
        provider: provider.name,
        model: provider.model,
        latency_ms: Date.now() - startedAt,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`[chat] ${provider.name} failed: ${message.slice(0, 200)}`);
    }
  }

  return json(req, { error: 'All AI providers are unavailable. Please try again later.' }, 503);
}
