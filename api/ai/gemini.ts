/**
 * Vercel Edge Function — Gemini API proxy.
 *
 * Keeps the Gemini API key server-side. Requests require either a valid
 * Supabase user session or a valid public-intake token.
 */

export const config = { runtime: 'edge' };

const SUPABASE_URL = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').trim();
const SUPABASE_ANON_KEY = (process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '').trim();
const AUTH_TIMEOUT_MS = 5_000;
const MAX_INPUT_CHARS = 120_000;

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

const RATE_LIMIT = { windowMs: 60_000, maxRequests: 120 };
const windows = new Map<string, number[]>();

function checkRateLimit(key: string): boolean {
  const now = Date.now();
  const cutoff = now - RATE_LIMIT.windowMs;
  let timestamps = windows.get(key) ?? [];
  timestamps = timestamps.filter(timestamp => timestamp > cutoff);
  timestamps.push(now);
  windows.set(key, timestamps);

  if (windows.size > 5_000) {
    const entries = [...windows.entries()];
    entries.sort((a, b) => (a[1][0] ?? 0) - (b[1][0] ?? 0));
    for (let i = 0; i < Math.min(1_000, entries.length); i += 1) windows.delete(entries[i][0]);
  }
  return timestamps.length <= RATE_LIMIT.maxRequests;
}

async function verifyUserAccessToken(token: string): Promise<boolean> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !token) return false;
  try {
    const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: SUPABASE_ANON_KEY,
      },
      signal: AbortSignal.timeout(AUTH_TIMEOUT_MS),
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
      signal: AbortSignal.timeout(AUTH_TIMEOUT_MS),
    });
    if (!response.ok) return false;
    const data = await response.json().catch(() => null) as any;
    if (Array.isArray(data)) return data.some(row => Boolean(row?.firm_id));
    return Boolean(data?.firm_id);
  } catch {
    return false;
  }
}

async function authorize(req: Request): Promise<{ ok: boolean; rateKey?: string; status?: number }> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return { ok: false, status: 503 };

  const auth = req.headers.get('Authorization') || '';
  if (auth.startsWith('Bearer ')) {
    const token = auth.slice(7).trim();
    const valid = await verifyUserAccessToken(token);
    return valid ? { ok: true, rateKey: `user:${token.slice(-8)}` } : { ok: false, status: 401 };
  }

  const intakeToken = (req.headers.get('X-Intake-Token') || '').trim();
  if (intakeToken) {
    const valid = await verifyPublicIntakeToken(intakeToken);
    return valid ? { ok: true, rateKey: `intake:${intakeToken.slice(-8)}` } : { ok: false, status: 401 };
  }

  return { ok: false, status: 401 };
}

function inputSize(value: unknown): number {
  try {
    return JSON.stringify(value).length;
  } catch {
    return MAX_INPUT_CHARS + 1;
  }
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(req) });
  if (req.method !== 'POST') return json(req, { error: 'Method not allowed' }, 405);

  const authorization = await authorize(req);
  if (!authorization.ok) {
    if (authorization.status === 503) return json(req, { error: 'Server authentication is not configured.' }, 503);
    return json(req, { error: 'Unauthorized.' }, 401);
  }

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    ?? req.headers.get('x-real-ip')
    ?? 'unknown';
  const rateKey = `${authorization.rateKey || 'unknown'}:${ip}`;
  if (!checkRateLimit(rateKey)) {
    return json(req, { error: 'Too many requests. Please try again shortly.' }, 429);
  }

  const geminiKey = process.env.GEMINI_API_KEY;
  if (!geminiKey) return json(req, { error: 'Gemini API key not configured on server.' }, 503);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json(req, { error: 'Invalid JSON body.' }, 400);
  }

  if (inputSize(body) > MAX_INPUT_CHARS) {
    return json(req, { error: 'Request context is too large.' }, 413);
  }

  const requestedModel = String(body.model || 'gemini-2.5-flash');
  // Do not let the browser turn this generic proxy into access to arbitrary
  // provider endpoints/models. Add models deliberately as the product needs them.
  const allowedModels = new Set([
    'gemini-2.5-flash',
    'gemini-2.5-pro',
    'gemini-2.5-flash-lite',
    'gemini-2.0-flash',
  ]);
  const model = allowedModels.has(requestedModel) ? requestedModel : 'gemini-2.5-flash';
  const contents = body.contents;
  const systemInstruction = body.systemInstruction;
  const generationConfig = body.config || {};

  if (!contents) return json(req, { error: 'Missing "contents" in request body.' }, 400);

  const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`;
  const geminiBody: any = { contents: Array.isArray(contents) ? contents : [contents] };
  if (systemInstruction) geminiBody.systemInstruction = systemInstruction;
  if (Object.keys(generationConfig).length > 0) geminiBody.generationConfig = generationConfig;

  try {
    const resp = await fetch(geminiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(geminiBody),
      signal: AbortSignal.timeout(45_000),
    });

    const result = await resp.json();
    if (!resp.ok) {
      return json(req, { error: result?.error?.message || 'Gemini API error', status: resp.status }, resp.status);
    }

    return json(req, result);
  } catch {
    return json(req, { error: 'Failed to reach Gemini API.' }, 502);
  }
}
