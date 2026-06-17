import { retryWithBackoff, withTimeout } from '../utils/errorHandler';

const DEEPSEEK_BASE = 'https://api.deepseek.com/v1/chat/completions';

const getDeepSeekKey = (): string => {
  const key =
    (import.meta as any).env?.VITE_DEEPSEEK_API_KEY ||
    (window as any).__DEEPSEEK_API_KEY ||
    process.env.DEEPSEEK_API_KEY ||
    '';
  return key;
};

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

/** Single-turn DeepSeek chat call. Returns raw text response. */
export const deepseekChat = async (params: DeepSeekParams): Promise<string> => {
  const key = getDeepSeekKey();
  if (!key) throw new Error('DEEPSEEK_API_KEY not found. Set it in .env.local.');

  const messages: { role: string; content: string }[] = [];
  if (params.systemInstruction) {
    messages.push({ role: 'system', content: params.systemInstruction });
  }
  if (params.jsonMode && !params.systemInstruction?.toLowerCase().includes('json')) {
    if (messages[0]?.role === 'system') {
      messages[0].content += "\n\nReturn ONLY valid JSON. No markdown, no explanation — just JSON.";
    }
  }
  messages.push(...params.messages);

  return retryWithBackoff(async () => {
    const res = await withTimeout(
      fetch(DEEPSEEK_BASE, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({
          model: 'deepseek-chat',
          messages,
          temperature: params.temperature ?? 0.7,
          max_tokens: params.maxTokens ?? 2048,
          ...(params.jsonMode ? { response_format: { type: 'json_object' } } : {}),
        }),
      }),
      params.timeoutMs ?? 30000
    );

    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      throw new Error(`DeepSeek API error ${res.status}: ${errBody.slice(0, 300)}`);
    }

    const data = await res.json();
    const text = data.choices?.[0]?.message?.content || '';
    if (!text) throw new Error('Empty response from DeepSeek');

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
