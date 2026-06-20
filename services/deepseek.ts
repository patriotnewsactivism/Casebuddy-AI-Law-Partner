/**
 * deepseek.ts — Gemini-powered compatibility shim
 *
 * DeepSeek credits exhausted. Same exported interface (deepseekChat,
 * parseDeepSeekJson) — all callers work unchanged.
 *
 * Model routing strategy:
 *   • JSON extraction / structured output  → gemini-2.0-flash-lite  (fastest)
 *   • Complex legal reasoning / drafting   → gemini-2.5-flash        (smartest)
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

// Keywords that indicate complex legal reasoning — use the smarter model
const HEAVY_KEYWORDS = /strateg|analyz|analys|draft|argument|deposition|witness|predict|jury|verdict|research|motion|brief|summariz/i;

function pickModel(params: DeepSeekParams): string {
  const hint = (params.systemInstruction || '') + (params.messages[0]?.content || '');
  // JSON-only calls that don't need deep reasoning → fastest model
  if (params.jsonMode && !HEAVY_KEYWORDS.test(hint)) return 'gemini-2.0-flash-lite';
  // Everything else → best flash model
  return 'gemini-2.5-flash';
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

/** Drop-in replacement for deepseekChat — now powered by Gemini. */
export const deepseekChat = async (params: DeepSeekParams): Promise<string> => {
  const model = pickModel(params);

  const contents = params.messages.map(m => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }));

  const systemInstruction = params.systemInstruction
    ? {
        parts: [{
          text: params.jsonMode
            ? `${params.systemInstruction}\n\nReturn ONLY valid JSON. No markdown, no explanation — just JSON.`
            : params.systemInstruction,
        }],
      }
    : undefined;

  // JSON calls rarely need more than 1024 tokens; save latency
  const maxOutputTokens = params.maxTokens ?? (params.jsonMode ? 1024 : 2048);

  const body: Record<string, unknown> = {
    model,
    contents,
    ...(systemInstruction ? { systemInstruction } : {}),
    config: {
      temperature: params.temperature ?? (params.jsonMode ? 0.2 : 0.7),
      maxOutputTokens,
      ...(params.jsonMode ? { responseMimeType: 'application/json' } : {}),
    },
  };

  // 2 retries is enough — fail fast, callers handle gracefully
  return retryWithBackoff(async () => {
    const res = await withTimeout(
      fetch('/api/ai/gemini', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }),
      params.timeoutMs ?? 25000
    );

    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      throw new Error(`Gemini API error ${res.status}: ${errBody.slice(0, 300)}`);
    }

    const data = await res.json();
    const text =
      data.text ||
      data.candidates?.[0]?.content?.parts?.[0]?.text ||
      '';

    if (!text) throw new Error('Empty response from Gemini');
    return params.jsonMode ? cleanJsonResponse(text) : text;
  }, 2);
};

/** Helper: extract and parse JSON with cleanup. */
export const parseDeepSeekJson = <T>(text: string, fallback: T): T => {
  try {
    return JSON.parse(cleanJsonResponse(text)) as T;
  } catch {
    return fallback;
  }
};
