/**
 * Multi-provider AI service.
 *
 * All provider selection and permanent credentials live behind /api/ai/chat.
 * Browser code must not fall back to direct provider calls or VITE_* secrets.
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
  if (firstBrace !== -1 && firstBracket !== -1) start = Math.min(firstBrace, firstBracket);
  else if (firstBrace !== -1) start = firstBrace;
  else if (firstBracket !== -1) start = firstBracket;
  if (start > 0) cleaned = cleaned.slice(start);
  return cleaned;
}

async function callServerProxy(params: DeepSeekParams): Promise<string> {
  const messages = params.messages.map((message) => ({
    role: message.role,
    content: message.content,
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
  if (params.jsonMode) body.json_mode = true;

  const response = await fetch('/api/ai/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    // Do not echo provider/upstream response bodies into browser-visible errors.
    throw new Error(`AI service unavailable (${response.status})`);
  }

  const data = await response.json() as { text?: string };
  const text = String(data.text || '').trim();
  if (!text) throw new Error('AI service returned an empty response');
  return params.jsonMode ? cleanJsonResponse(text) : text;
}

export const deepseekChat = async (params: DeepSeekParams): Promise<string> => {
  const timeout = params.timeoutMs ?? 30000;
  try {
    return await retryWithBackoff(
      () => withTimeout(callServerProxy(params), timeout),
      2,
    );
  } catch (error) {
    console.warn('[ai] server proxy unavailable', {
      message: error instanceof Error ? error.message : 'unknown error',
    });
    throw new Error('AI service is temporarily unavailable. Please try again.');
  }
};

export const parseDeepSeekJson = <T>(text: string, fallback: T): T => {
  try {
    return JSON.parse(cleanJsonResponse(text)) as T;
  } catch {
    return fallback;
  }
};
