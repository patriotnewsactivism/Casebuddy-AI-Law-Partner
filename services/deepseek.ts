/**
 * deepseek.ts — Multi-Provider AI Service
 *
 * Routes AI calls through the best available free-tier provider.
 * Primary: /api/ai/chat (Groq → Gemini → OpenRouter fallback chain)
 * Fallback: Direct Groq client-side call (if API key available)
 * 
 * Same exported interface (deepseekChat, parseDeepSeekJson) — all callers unchanged.
 */

import { retryWithBackoff, withTimeout } from '../utils/errorHandler';

export interface DeepSeekParams {
  systemInstruction?: string;
  messages: { role: 'user' | 'assistant'; content: string }[];
  temperature?: number;
  maxTokens?: number;
  jsonMode?: boolean;
  timeoutMs?: number;
}

function cleanJsonResponse(text: string): string {
  let cleaned = text.trim();
  const codeBlockMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) cleaned = codeBlockMatch[1].trim();
  const firstBrace = cleaned.indexOf('{');
  const firstBracket = cleaned.indexOf('[');
  let start = -1;
  if (firstBrace !== -1 && firstBracket !== -1) {
    start = Math.min(firstBrace, firstBracket);
  } else if (firstBrace !== -1) {
    start = firstBrace;
  } else if (firstBracket !== -1) {
    start = firstBracket;
  }
  if (start > 0) cleaned = cleaned.slice(start);
  return cleaned;
}

// ── Primary: Server-side proxy with multi-provider fallback ────────────────

async function callServerProxy(params: DeepSeekParams): Promise<string> {
  const messages = params.messages.map(m => ({
    role: m.role,
    content: m.content,
  }));

  const body: Record<string, unknown> = {
    messages,
    temperature: params.temperature ?? (params.jsonMode ? 0.2 : 0.7),
    max_tokens: params.maxTokens ?? (params.jsonMode ? 1024 : 2048),
  };

  if (params.systemInstruction) {
    body.system = params.jsonMode
      ? `${params.systemInstruction}\n\nReturn ONLY valid JSON. No markdown, no explanation — just JSON.`
      : params.systemInstruction;
  }

  if (params.jsonMode) {
    body.json_mode = true;
  }

  const res = await fetch('/api/ai/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errBody = await res.text().catch(() => '');
    throw new Error(`AI proxy error ${res.status}: ${errBody.slice(0, 300)}`);
  }

  const data = await res.json();
  const text = data.text || '';

  if (!text) throw new Error('Empty response from AI provider');
  return params.jsonMode ? cleanJsonResponse(text) : text;
}

// ── Fallback: Direct Groq client-side call ─────────────────────────────────

function getGroqKey(): string {
  return (
    (window as any).__GROQ_API_KEY ||
    import.meta.env.VITE_GROQ_API_KEY ||
    ''
  ).trim();
}

async function callGroqDirect(params: DeepSeekParams): Promise<string> {
  const key = getGroqKey();
  if (!key) throw new Error('No Groq API key available');

  const messages: any[] = [];
  if (params.systemInstruction) {
    messages.push({
      role: 'system',
      content: params.jsonMode
        ? `${params.systemInstruction}\n\nReturn ONLY valid JSON. No markdown, no explanation — just JSON.`
        : params.systemInstruction,
    });
  }
  messages.push(...params.messages.map(m => ({
    role: m.role,
    content: m.content,
  })));

  const body = {
    model: 'llama-3.3-70b-versatile',
    messages,
    temperature: params.temperature ?? (params.jsonMode ? 0.2 : 0.7),
    max_tokens: params.maxTokens ?? (params.jsonMode ? 1024 : 2048),
    ...(params.jsonMode ? { response_format: { type: 'json_object' } } : {}),
  };

  const resp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const errBody = await resp.text().catch(() => '');
    throw new Error(`Groq API error ${resp.status}: ${errBody.slice(0, 300)}`);
  }

  const data = await resp.json();
  const text = data?.choices?.[0]?.message?.content || '';

  if (!text) throw new Error('Empty response from Groq');
  return params.jsonMode ? cleanJsonResponse(text) : text;
}

// ── Main export: try server proxy first, fall back to direct Groq ──────────

export const deepseekChat = async (params: DeepSeekParams): Promise<string> => {
  const timeout = params.timeoutMs ?? 30000;

  // Try server proxy (has Groq → Gemini → OpenRouter fallback chain)
  try {
    return await retryWithBackoff(async () => {
      return await withTimeout(callServerProxy(params), timeout);
    }, 1);
  } catch (serverErr: any) {
    const msg = serverErr?.message || String(serverErr);
    console.warn('[deepseek] Server proxy failed:', msg.slice(0, 150));
  }

  // Try direct Groq call (if key is available client-side)
  if (getGroqKey()) {
    try {
      return await retryWithBackoff(async () => {
        return await withTimeout(callGroqDirect(params), timeout);
      }, 2);
    } catch (groqErr: any) {
      const msg = groqErr?.message || String(groqErr);
      console.warn('[deepseek] Direct Groq failed:', msg.slice(0, 150));
    }
  }

  throw new Error('All AI providers unavailable. Please check your API keys and network connection.');
};

/** Helper: extract and parse JSON with cleanup. */
export const parseDeepSeekJson = <T>(text: string, fallback: T): T => {
  try {
    return JSON.parse(cleanJsonResponse(text)) as T;
  } catch {
    return fallback;
  }
};
