/**
 * Multi-provider AI chat proxy.
 *
 * Provider credentials are server-only. Requests must be authorized by either:
 * - a valid Supabase user access token; or
 * - a valid public-intake token resolved through the scoped intake RPC.
 *
 * The public Supabase URL/anon key are safe to reuse server-side for JWT/token
 * verification and may fall back to their VITE_* aliases when Vercel has not
 * configured duplicate server-only aliases.
 */

export const config = { runtime: 'edge' };

const PROVIDER_TIMEOUT_MS = 45_000;
const MAX_MESSAGES = 40;
const MAX_TOTAL_INPUT_CHARS = 120_000;
const MAX_OUTPUT_TOKENS = 4096;

const SUPABASE_URL = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').trim();
const SUPABASE_ANON_KEY = (process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '').trim();

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

const publicIntakeLimits = new Map<string, { count: number; resetAt: number }>();

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
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Intake-Token',
    'Cache-Control': 'no-store',
    Vary: 'Origin',
  };
}

const json = (req: Request, body: object, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
  });

function normalizedMessages(body: any): Array<{ role: 'user' | 'assistant'; content: string }> {
  if (!Array.isArray(body?.messages)) return [];
  return body.messages
    .filter((message: any) => message?.role === 'user' || message?.role === 'assistant')
    .map((message: any) => ({
      role: message.role as 'user' | 'assistant',
      content: String(message.content ?? ''),
    }))
    .filter(message => message.content.trim().length > 0);
}

function messagesFor(body: any) {
  return [
    ...(body.system ? [{ role: 'system', content: String(body.system) }] : []),
    ...normalizedMessages(body),
  ];
}

function boundedBody(body: any) {
  return {
    ...body,
    messages: normalizedMessages(body),
    system: typeof body.system === 'string' ? body.system : undefined,
    temperature: Number.isFinite(Number(body.temperature))
      ? Math.max(0, Math.min(1.5, Number(body.temperature)))
      : 0.3,
    max_tokens: Math.max(64, Math.min(MAX_OUTPUT_TOKENS, Number(body.max_tokens) || 2048)),
    json_mode: body.json_mode === true,
  };
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

async function verifyUserAccessToken(token: string): Promise<boolean> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !token) return false;
  try {
    const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${token}`,
      },
      signal: AbortSignal.timeout(5_000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

async function verifyPublicIntakeToken(token: string): Promise<boolean> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return false;
  const candidate = token.trim();
  if (candidate.length < 5 || candidate.length > 64) return false;

  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/resolve_public_intake_token`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ p_token: candidate }),
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) return false;
    const data = await response.json().catch(() => null) as any;
    if (Array.isArray(data)) return data.some(row => Boolean(row?.firm_id));
    return Boolean(data?.firm_id);
  } catch {
    return false;
  }
}

function publicIntakeRateAllowed(req: Request, token: string): boolean {
  const now = Date.now();
  const forwarded = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  // Avoid storing the actual bearer token in process memory/loggable keys.
  const tokenTail = token.slice(-8);
  const key = `${forwarded}:${tokenTail}`;
  const existing = publicIntakeLimits.get(key);

  if (!existing || existing.resetAt <= now) {
    publicIntakeLimits.set(key, { count: 1, resetAt: now + 10 * 60_000 });
    return true;
  }

  if (existing.count >= 40) return false;
  existing.count += 1;

  if (publicIntakeLimits.size > 2_000) {
    for (const [entryKey, value] of publicIntakeLimits) {
      if (value.resetAt <= now) publicIntakeLimits.delete(entryKey);
    }
  }
  return true;
}

async function authorize(req: Request): Promise<{ ok: boolean; kind?: 'user' | 'intake'; status?: number }> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return { ok: false, status: 503 };

  const auth = req.headers.get('Authorization') || '';
  if (auth.startsWith('Bearer ')) {
    const valid = await verifyUserAccessToken(auth.slice(7));
    return valid ? { ok: true, kind: 'user' } : { ok: false, status: 401 };
  }

  const intakeToken = req.headers.get('X-Intake-Token') || '';
  if (intakeToken) {
    if (!publicIntakeRateAllowed(req, intakeToken)) return { ok: false, status: 429 };
    const valid = await verifyPublicIntakeToken(intakeToken);
    return valid ? { ok: true, kind: 'intake' } : { ok: false, status: 401 };
  }

  return { ok: false, status: 401 };
}

async function callCohere(body: any): Promise<Response> {
  if (!COHERE_KEY) throw new Error('Cohere not configured');
  return checkedFetch('https://api.cohere.com/v2/chat', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${COHERE_KEY}`,
      'Content-Type': 'application/json',
      'X-Client-Name': 'casebuddy',
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

  const contents = normalizedMessages(body).map((message: any) => ({
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
      'X-Title': 'CaseBuddy',
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

  const authorization = await authorize(req);
  if (!authorization.ok) {
    if (authorization.status === 503) return json(req, { error: 'Server authentication is not configured.' }, 503);
    if (authorization.status === 429) return json(req, { error: 'Too many intake requests. Please try again shortly.' }, 429);
    return json(req, { error: 'Unauthorized.' }, 401);
  }

  let rawBody: any;
  try {
    rawBody = await req.json();
  } catch {
    return json(req, { error: 'Invalid JSON' }, 400);
  }

  const body = boundedBody(rawBody);
  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return json(req, { error: 'Missing messages' }, 400);
  }
  if (body.messages.length > MAX_MESSAGES) {
    return json(req, { error: 'Too many messages in one request.' }, 413);
  }

  const totalChars =
    (body.system?.length ?? 0) +
    body.messages.reduce((sum: number, message: { content: string }) => sum + message.content.length, 0);
  if (totalChars > MAX_TOTAL_INPUT_CHARS) {
    return json(req, { error: 'Request context is too large.' }, 413);
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
