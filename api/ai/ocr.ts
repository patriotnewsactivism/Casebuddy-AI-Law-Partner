/**
 * POST /api/ai/ocr — Azure Computer Vision Read OCR proxy.
 *
 * Azure's Read API is the firm's primary OCR (5,000 free transactions/month,
 * purpose-built for documents — handles images AND PDFs, tables, handwriting).
 * The key stays server-side; the client sends the file and gets text back.
 *
 * Body: { data: string (base64, no data: prefix), mimeType?: string }
 * Response: { text, provider: 'azure_read', pages }
 *
 * Env: AZURE_VISION_ENDPOINT (e.g. https://<resource>.cognitiveservices.azure.com),
 *      AZURE_VISION_KEY
 */

export const config = { runtime: 'edge' };

const CORS = {
  'Access-Control-Allow-Origin': process.env.ALLOWED_ORIGIN || '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const json = (body: object, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });

const ENDPOINT = (process.env.AZURE_VISION_ENDPOINT || '').replace(/\/+$/, '');
const KEY = (process.env.AZURE_VISION_KEY || '').trim();

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

export default async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  if (!ENDPOINT || !KEY) return json({ error: 'Azure Vision not configured' }, 503);

  let body: { data?: string; mimeType?: string };
  try { body = await req.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }
  if (!body.data) return json({ error: 'Missing data (base64)' }, 400);

  let bytes: Uint8Array;
  try {
    const bin = atob(body.data);
    bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  } catch {
    return json({ error: 'Invalid base64' }, 400);
  }
  if (bytes.length > 4 * 1024 * 1024) {
    return json({ error: 'File too large for this endpoint (4MB max) — use the document pipeline' }, 413);
  }

  try {
    // Submit to the async Read API (v3.2 — supports images and PDFs)
    const submit = await fetch(`${ENDPOINT}/vision/v3.2/read/analyze`, {
      method: 'POST',
      headers: {
        'Ocp-Apim-Subscription-Key': KEY,
        'Content-Type': body.mimeType || 'application/octet-stream',
      },
      body: bytes,
    });

    if (!submit.ok) {
      const err = await submit.text().catch(() => '');
      return json({ error: `Azure Read submit ${submit.status}: ${err.slice(0, 200)}` }, 502);
    }

    const opUrl = submit.headers.get('Operation-Location');
    if (!opUrl) return json({ error: 'Azure Read: no Operation-Location' }, 502);

    // Poll for the result (Read usually completes in 1–3s per page)
    for (let attempt = 0; attempt < 20; attempt++) {
      await sleep(attempt < 3 ? 600 : 1000);
      const poll = await fetch(opUrl, { headers: { 'Ocp-Apim-Subscription-Key': KEY } });
      if (!poll.ok) continue;
      const result: any = await poll.json();

      if (result.status === 'succeeded') {
        const pages = result.analyzeResult?.readResults ?? [];
        const text = pages
          .map((p: any) => (p.lines ?? []).map((l: any) => l.text).join('\n'))
          .join('\n\n');
        return json({ text, provider: 'azure_read', pages: pages.length });
      }
      if (result.status === 'failed') {
        return json({ error: 'Azure Read analysis failed' }, 502);
      }
      // 'notStarted' | 'running' → keep polling
    }
    return json({ error: 'Azure Read timed out' }, 504);
  } catch (err: any) {
    return json({ error: `Azure Read error: ${err?.message || String(err)}` }, 502);
  }
}
