// Transitional compatibility bridge for legacy UI modules that still construct
// Gemini generateContent URLs. Vite intentionally gives those callers no API
// key; this bridge intercepts only that exact provider request and forwards the
// payload to CaseBuddy's same-origin server proxy. No provider credential is
// present in the browser request, response, or bundle.

import { buildAIProxyHeaders } from './deepseek';

const GEMINI_HOST = 'generativelanguage.googleapis.com';
const MODEL_RE = /\/v1beta\/models\/([^/:]+):generateContent$/;

let installed = false;

export function installLegacyGeminiProxyBridge(): void {
  if (installed || typeof window === 'undefined') return;
  installed = true;

  const originalFetch = window.fetch.bind(window);

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const rawUrl = input instanceof Request ? input.url : String(input);

    let url: URL;
    try {
      url = new URL(rawUrl, window.location.origin);
    } catch {
      return originalFetch(input, init);
    }

    const modelMatch = url.hostname === GEMINI_HOST ? url.pathname.match(MODEL_RE) : null;
    if (!modelMatch) return originalFetch(input, init);

    if ((init?.method || 'GET').toUpperCase() !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), {
        status: 405,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    let body: any = {};
    try {
      if (typeof init?.body === 'string') body = JSON.parse(init.body);
      else if (input instanceof Request) body = await input.clone().json();
    } catch {
      return new Response(JSON.stringify({ error: 'Invalid AI request' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return originalFetch('/api/ai/gemini', {
      method: 'POST',
      headers: await buildAIProxyHeaders(),
      body: JSON.stringify({
        model: decodeURIComponent(modelMatch[1]),
        contents: body.contents,
        systemInstruction: body.systemInstruction,
        config: body.generationConfig || body.config,
      }),
      credentials: 'same-origin',
    });
  };
}
