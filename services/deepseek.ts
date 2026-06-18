/**
 * deepseek.ts — compatibility shim
 *
 * DeepSeek credits are exhausted. This module preserves the exact same
 * exported interface (deepseekChat, parseDeepSeekJson) but routes all
 * calls through the Gemini API proxy (/api/ai/gemini) so every caller
 * works without any changes.
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

/**
 * Drop-in replacement for deepseekChat — now powered by Gemini 2.5 Flash.
 * Keeps the exact same signature so all callers work unchanged.
 */
export const deepseekChat = async (params: DeepSeekParams): Promise<string> => {
  // Build Gemini contents array from messages
  const contents = params.messages.map(m => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }));

  const systemInstruction = params.systemInstruction
    ? { parts: [{ text: params.jsonMode
        ? `${params.systemInstruction}\n\nReturn ONLY valid JSON. No markdown, no explanation — just JSON.`
        : params.systemInstruction }] }
    : undefined;

  const body: Record<string, unknown> = {
    model: 'gemini-2.5-flash',
    contents,
    ...(systemInstruction ? { systemInstruction } : {}),
    config: {
      temperature: params.temperature ?? 0.7,
      maxOutputTokens: params.maxTokens ?? 2048,
      ...(params.jsonMode ? { responseMimeType: 'application/json' } : {}),
    },
  };

  return retryWithBackoff(async () => {
    const res = await withTimeout(
      fetch('/api/ai/gemini', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }),
      params.timeoutMs ?? 30000
    );

    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      throw new Error(`Gemini API error ${res.status}: ${errBody.slice(0, 300)}`);
    }

    const data = await res.json();
    // Handle both streaming text and direct response shapes
    const text =
      data.text ||
      data.candidates?.[0]?.content?.parts?.[0]?.text ||
      data.choices?.[0]?.message?.content ||
      '';

    if (!text) throw new Error('Empty response from Gemini');
    return params.jsonMode ? cleanJsonResponse(text) : text;
  }, 3);
};

/** Helper: extract and parse JSON with cleanup. */
export const parseDeepSeekJson = <T>(text: string, fallback: T): T => {
  try {
    return JSON.parse(cleanJsonResponse(text)) as T;
  } catch {
    return fallback;
  }
};
