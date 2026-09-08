/**
 * Gemini Live Voice Configuration & Automatic Fallback Engine
 *
 * Primary: models/gemini-3.1-flash-live-preview (low-latency, A2A Live model)
 * Fallback: models/gemini-2.5-flash-native-audio-preview-09-2025 (production stability fallback)
 *
 * Configurable via environment variables:
 * - GEMINI_LIVE_MODEL
 * - GEMINI_LIVE_FALLBACK_MODEL
 * - GEMINI_LIVE_VOICE
 */

export const GEMINI_WS_BASE =
  'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent';

export const PRIMARY_LIVE_MODEL =
  process.env.GEMINI_LIVE_MODEL || 'models/gemini-3.1-flash-live-preview';

export const FALLBACK_LIVE_MODEL =
  process.env.GEMINI_LIVE_FALLBACK_MODEL || 'models/gemini-2.5-flash-native-audio-preview-09-2025';

export const DEFAULT_VOICE_NAME =
  process.env.GEMINI_LIVE_VOICE || 'Aoede';

export interface LiveConnectionOptions {
  systemInstruction: string;
  tools?: any[];
  voiceName?: string;
  onSetupComplete?: (activeModel: string) => void;
  onServerContent?: (serverContent: any) => void;
  onToolCall?: (toolCall: any) => void;
  onError?: (err: any) => void;
  onClose?: (code: number, reason: string) => void;
  onFallbackEngaged?: (fromModel: string, toModel: string, reason: string) => void;
}

export interface LiveConnectionHandle {
  ws: any;
  activeModel: string;
  isReady: boolean;
  sendRealtimeAudio: (base64Pcm16k: string) => void;
  sendRealtimeInput: (mediaChunks: { mimeType: string; data: string }[]) => void;
  sendToolResponse: (functionResponses: any[]) => void;
  close: (code?: number, reason?: string) => void;
}

/**
 * Format model string to include 'models/' prefix required by BidiGenerateContent setup.
 */
export function normalizeModelName(model: string): string {
  const trimmed = model.trim();
  return trimmed.startsWith('models/') ? trimmed : `models/${trimmed}`;
}

/**
 * Build setup payload for Gemini Live API, adapting parameters based on model family.
 */
export function buildGeminiSetupPayload(
  modelName: string,
  systemInstruction: string,
  tools: any[] = [],
  voiceName = DEFAULT_VOICE_NAME,
): any {
  const normalized = normalizeModelName(modelName);
  const isGemini31 = normalized.includes('3.1');

  const generationConfig: any = {
    responseModalities: ['AUDIO'],
    speechConfig: {
      voiceConfig: {
        prebuiltVoiceConfig: {
          voiceName,
        },
      },
    },
  };

  // 3.1 Live supports thinkingLevel config; minimal optimizes for lowest latency
  if (isGemini31) {
    generationConfig.thinkingConfig = {
      thinkingLevel: 'minimal',
    };
  }

  const setupPayload: any = {
    model: normalized,
    generationConfig,
    systemInstruction: {
      parts: [{ text: systemInstruction }],
    },
  };

  if (tools && tools.length > 0) {
    setupPayload.tools = tools;
  }

  return setupPayload;
}

/**
 * Establish a Gemini Live WebSocket connection with automatic fallback.
 * If the primary model fails during handshake or setup, it automatically
 * reconnects using the fallback model.
 */
export async function connectGeminiLiveWithFallback(
  options: LiveConnectionOptions,
): Promise<LiveConnectionHandle> {
  const apiKey = (process.env.GEMINI_API_KEY || '').trim();
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured on the server.');
  }

  const { default: WebSocketImpl } = await import('ws');
  const wsUrl = `${GEMINI_WS_BASE}?key=${apiKey}`;

  let currentModel = PRIMARY_LIVE_MODEL;
  let fallbackAttempted = false;
  let isClosed = false;

  return new Promise<LiveConnectionHandle>((resolve, reject) => {
    let ws: any = null;
    let isReady = false;

    const handle: LiveConnectionHandle = {
      get ws() {
        return ws;
      },
      get activeModel() {
        return currentModel;
      },
      get isReady() {
        return isReady;
      },
      sendRealtimeAudio: (base64Pcm16k: string) => {
        if (!ws || ws.readyState !== 1) return;
        ws.send(
          JSON.stringify({
            realtimeInput: {
              mediaChunks: [
                {
                  mimeType: 'audio/pcm;rate=16000',
                  data: base64Pcm16k,
                },
              ],
            },
          }),
        );
      },
      sendRealtimeInput: (mediaChunks: { mimeType: string; data: string }[]) => {
        if (!ws || ws.readyState !== 1) return;
        ws.send(
          JSON.stringify({
            realtimeInput: {
              mediaChunks,
            },
          }),
        );
      },
      sendToolResponse: (functionResponses: any[]) => {
        if (!ws || ws.readyState !== 1) return;
        ws.send(
          JSON.stringify({
            toolResponse: {
              functionResponses,
            },
          }),
        );
      },
      close: (code = 1000, reason = 'Normal closure') => {
        isClosed = true;
        if (ws && (ws.readyState === 1 || ws.readyState === 0)) {
          ws.close(code, reason);
        }
      },
    };

    function attemptConnection(modelToUse: string) {
      currentModel = modelToUse;
      console.log(`[GeminiLive] Connecting to upstream Live API with model: ${currentModel}…`);

      try {
        ws = new WebSocketImpl(wsUrl);
      } catch (err) {
        if (!fallbackAttempted && currentModel !== FALLBACK_LIVE_MODEL) {
          triggerFallback(`Failed to create WebSocket instance: ${err}`);
          return;
        }
        reject(err);
        return;
      }

      ws.on('open', () => {
        console.log(`[GeminiLive] Upstream socket opened, sending setup for ${currentModel}…`);
        const setup = buildGeminiSetupPayload(
          currentModel,
          options.systemInstruction,
          options.tools,
          options.voiceName,
        );
        ws.send(JSON.stringify({ setup }));
      });

      ws.on('message', (data: any) => {
        try {
          // If binary audio arrived directly
          if (data instanceof Buffer || data instanceof ArrayBuffer) {
            options.onServerContent?.({ rawBinary: data });
            return;
          }

          const msg = JSON.parse(typeof data === 'string' ? data : data.toString());

          // Setup completion acknowledgement
          if (msg.setupComplete) {
            isReady = true;
            console.log(`[GeminiLive] Setup completed successfully on ${currentModel}`);
            options.onSetupComplete?.(currentModel);
            resolve(handle);
            return;
          }

          if (msg.serverContent) {
            options.onServerContent?.(msg.serverContent);
          }

          if (msg.toolCall) {
            options.onToolCall?.(msg.toolCall);
          }
        } catch (parseErr) {
          console.warn('[GeminiLive] Error parsing incoming message:', parseErr);
        }
      });

      ws.on('error', (err: any) => {
        console.warn(`[GeminiLive] Upstream error on ${currentModel}:`, err?.message || err);

        // If error happens before setup completes, trigger fallback
        if (!isReady && !fallbackAttempted && currentModel !== FALLBACK_LIVE_MODEL && !isClosed) {
          triggerFallback(`WebSocket error before setup completion: ${err?.message || 'unknown'}`);
          return;
        }

        options.onError?.(err);
      });

      ws.on('close', (code: number, reason: string) => {
        console.log(`[GeminiLive] Upstream socket closed on ${currentModel}: ${code} ${reason}`);

        // If socket closed abnormally before setup completed, trigger fallback
        if (!isReady && !fallbackAttempted && currentModel !== FALLBACK_LIVE_MODEL && !isClosed) {
          triggerFallback(`Socket closed before setup: ${code} ${reason}`);
          return;
        }

        options.onClose?.(code, reason);
      });
    }

    function triggerFallback(reason: string) {
      if (fallbackAttempted || isClosed) return;
      fallbackAttempted = true;
      const failedModel = currentModel;
      const targetModel = FALLBACK_LIVE_MODEL;

      console.warn(
        `[GeminiLive] ⚠️ Primary model ${failedModel} failed (${reason}). Falling back to ${targetModel}…`,
      );
      options.onFallbackEngaged?.(failedModel, targetModel, reason);

      try {
        if (ws && (ws.readyState === 1 || ws.readyState === 0)) {
          ws.removeAllListeners();
          ws.close();
        }
      } catch {}

      attemptConnection(targetModel);
    }

    // Start with primary model
    attemptConnection(PRIMARY_LIVE_MODEL);
  });
}
