/**
 * Multi-provider AI service.
 *
 * All provider selection and permanent credentials live behind /api/ai/chat.
 * Browser code must not fall back to direct provider calls or VITE_* secrets.
 *
 * Trust paths:
 * - signed-in CaseBuddy users send their Supabase access token;
 * - public intake pages send only the scoped intake-link token from the URL.
 */

import { retryWithBackoff, withTimeout } from '../utils/errorHandler';
import { getSession } from './authService';

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

function publicIntakeTokenFromPath(): string | null {
  if (typeof window === 'undefined') return null;
  const match = window.location.pathname.match(/^\/intake\/([^/]+)\/?$/i);
  if (!match?.[1]) return null;
  try {
    return decodeURIComponent(match[1]).trim() || null;
  } catch {
    return match[1].trim() || null;
  }
}

/**
 * Authorization headers shared by all browser → CaseBuddy AI proxy calls.
 * Only a short-lived Supabase access token or a scoped public-intake token is
 * sent. Permanent provider credentials never enter the browser.
 */
export async function buildAIProxyHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };

  try {
    const session = await getSession();
    if (session?.access_token) {
      headers.Authorization = `Bearer ${session.access_token}`;
      return headers;
    }
  } catch {
    // Public intake has no authenticated session; fall through to its scoped token.
  }

  const intakeToken = publicIntakeTokenFromPath();
  if (intakeToken) headers['X-Intake-Token'] = intakeToken;
  return headers;
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
    headers: await buildAIProxyHeaders(),
    body: JSON.stringify(body),
  });

  if (!response.ok) {
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
