/**
 * Vercel Edge Function — Gemini API proxy.
 *
 * Keeps the Gemini API key server-side. The client sends the prompt, model,
 * and config; this endpoint adds the key and forwards to Gemini, streaming
 * the response back.
 *
 * POST /api/ai/gemini
 * Body: { model, contents, config? }
 *
 * Includes edge-compatible rate limiting (per-IP sliding window).
 */

export const config = { runtime: 'edge' };

const CORS = {
  'Access-Control-Allow-Origin': process.env.ALLOWED_ORIGIN || 'https://casebuddy.live',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

const json = (body: object, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });

// ── Rate limiting (per-isolate in-memory, resets on cold start) ──────────────

// Raised to 120 req/min to support parallel agent calls (War Room fires 7 at once)
const RATE_LIMIT = { windowMs: 60_000, maxRequests: 120 };
const windows = new Map<string, number[]>();

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const cutoff = now - RATE_LIMIT.windowMs;
  let timestamps = windows.get(ip) ?? [];
  timestamps = timestamps.filter(t => t > cutoff);
  timestamps.push(now);
  windows.set(ip, timestamps);
  // Prevent memory leak
  if (windows.size > 5_000) {
    const entries = [...windows.entries()];
    entries.sort((a, b) => (a[1][0] ?? 0) - (b[1][0] ?? 0));
    for (let i = 0; i < 1_000; i++) windows.delete(entries[i][0]);
  }
  return timestamps.length <= RATE_LIMIT.maxRequests;
}

// ── Handler ──────────────────────────────────────────────────────────────────

export default async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  // Rate limit check
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    ?? req.headers.get('x-real-ip')
    ?? 'unknown';
  if (!checkRateLimit(ip)) {
    return json({ error: 'Too many requests. Please try again shortly.' }, 429);
  }

  const geminiKey = process.env.GEMINI_API_KEY;
  if (!geminiKey) return json({ error: 'Gemini API key not configured on server.' }, 503);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid JSON body.' }, 400);
  }

  const model = body.model || 'gemini-2.5-flash';
  const contents = body.contents;
  const systemInstruction = body.systemInstruction;
  const generationConfig = body.config || {};

  if (!contents) return json({ error: 'Missing "contents" in request body.' }, 400);

  // Build the Gemini REST API request
  const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`;

  const geminiBody: any = { contents: Array.isArray(contents) ? contents : [contents] };
  if (systemInstruction) geminiBody.systemInstruction = systemInstruction;
  if (Object.keys(generationConfig).length > 0) geminiBody.generationConfig = generationConfig;

  try {
    const resp = await fetch(geminiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(geminiBody),
    });

    const result = await resp.json();
    if (!resp.ok) {
      return json({ error: result?.error?.message || 'Gemini API error', status: resp.status }, resp.status);
    }

    return json(result);
  } catch (err: any) {
    return json({ error: 'Failed to reach Gemini API.', detail: err?.message }, 502);
  }
}

