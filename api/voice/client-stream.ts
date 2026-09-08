/**
 * Client-facing WebSocket relay for Maya Live Voice.
 *
 * This module provides the WebSocket upgrade handler for `/api/voice/client-stream`.
 * It bridges the browser's audio stream to the Gemini Multimodal Live API
 * server-side, keeping GEMINI_API_KEY entirely on the server.
 *
 * Protocol (browser → server):
 *   - Binary frames: 24 kHz 16-bit mono PCM audio chunks
 *   - JSON text frames: { type: 'interrupt' } | { type: 'text', content: string }
 *
 * Protocol (server → browser):
 *   - Binary frames: 24 kHz 16-bit mono PCM audio from the agent
 *   - JSON text frames:
 *     { type: 'transcript', speaker: 'agent'|'caller', text: string, isFinal: boolean }
 *     { type: 'tool_status', tool: string, status: 'executing'|'complete', result?: object }
 *     { type: 'state', state: 'listening'|'speaking'|'processing' }
 *     { type: 'error', message: string }
 *     { type: 'session_ready' }
 *
 * This file exports a handler function suitable for Express WebSocket upgrade
 * (used by server/index.ts on Railway) and for the Vite dev middleware.
 *
 * Gemini Multimodal Live API reference:
 *   wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent
 */

import {
  getSession,
  touchSession,
  addTranscriptSegment,
  destroySession,
  type LiveSession,
} from '../ai/_shared/liveSession';
import {
  executeIntakeTool,
  INTAKE_TOOL_DECLARATIONS,
  type LiveSessionFact,
} from './_shared/intakeTools';
import { runPostCallSynthesis } from './_shared/postCallSynthesis';

// ── Types ────────────────────────────────────────────────────────────────────

interface GeminiSetupConfig {
  model: string;
  generationConfig: {
    responseModalities: string[];
    speechConfig?: {
      voiceConfig?: {
        prebuiltVoiceConfig?: {
          voiceName: string;
        };
      };
    };
  };
  systemInstruction?: { parts: { text: string }[] };
  tools?: { functionDeclarations: typeof INTAKE_TOOL_DECLARATIONS }[];
}

// ── Constants ────────────────────────────────────────────────────────────────

const GEMINI_WS_BASE = 'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent';
const GEMINI_MODEL = 'models/gemini-2.5-flash';
// Maya's voice — a warm, professional female voice
const VOICE_NAME = 'Aoede';

// ── Upstream provider connection ─────────────────────────────────────────────

function buildGeminiWsUrl(): string {
  const apiKey = (process.env.GEMINI_API_KEY || '').trim();
  if (!apiKey) throw new Error('GEMINI_API_KEY not configured');
  return `${GEMINI_WS_BASE}?key=${apiKey}`;
}

function buildSetupMessage(session: LiveSession): GeminiSetupConfig {
  return {
    model: GEMINI_MODEL,
    generationConfig: {
      responseModalities: ['AUDIO'],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: {
            voiceName: VOICE_NAME,
          },
        },
      },
    },
    systemInstruction: {
      parts: [{ text: session.systemInstruction }],
    },
    tools: [{ functionDeclarations: INTAKE_TOOL_DECLARATIONS }],
  };
}

// ── WebSocket bridge logic ───────────────────────────────────────────────────

/**
 * Handle an upgraded WebSocket connection from the browser.
 * This is called from server/index.ts or vite middleware after the HTTP upgrade.
 *
 * @param clientWs - The browser-facing WebSocket
 * @param sessionId - The session ID from the query string or protocol
 */
export async function handleClientStream(
  clientWs: any, // WebSocket from 'ws' package on Node
  sessionId: string,
): Promise<void> {
  const session = getSession(sessionId);
  if (!session) {
    clientWs.send(JSON.stringify({ type: 'error', message: 'Invalid or expired session.' }));
    clientWs.close(4001, 'Invalid session');
    return;
  }

  session.clientWs = clientWs;
  console.log(`[client-stream] client connected to session ${sessionId.slice(0, 8)}…`);

  // Open upstream Gemini WebSocket
  let providerWs: any;
  try {
    const WebSocketImpl = (await import('ws')).default;
    const geminiUrl = buildGeminiWsUrl();
    providerWs = new WebSocketImpl(geminiUrl);
    session.providerWs = providerWs;
  } catch (err) {
    console.error('[client-stream] failed to connect to Gemini:', err);
    clientWs.send(JSON.stringify({ type: 'error', message: 'Voice service unavailable.' }));
    clientWs.close(4002, 'Provider unavailable');
    return;
  }

  // ── Provider WebSocket handlers ──────────────────────────────────────────

  providerWs.on('open', () => {
    console.log(`[client-stream] upstream connected for ${sessionId.slice(0, 8)}…`);
    // Send setup message
    const setup = buildSetupMessage(session);
    providerWs.send(JSON.stringify({ setup }));
  });

  providerWs.on('message', async (data: any) => {
    touchSession(sessionId);

    // Binary data = audio from provider
    if (data instanceof Buffer || data instanceof ArrayBuffer) {
      if (clientWs.readyState === 1) { // WebSocket.OPEN
        clientWs.send(data);
      }
      return;
    }

    // Text data = JSON events
    try {
      const msg = JSON.parse(typeof data === 'string' ? data : data.toString());

      // Setup complete
      if (msg.setupComplete) {
        clientWs.send(JSON.stringify({ type: 'session_ready' }));
        clientWs.send(JSON.stringify({ type: 'state', state: 'listening' }));
        return;
      }

      // Server content (audio and/or text)
      if (msg.serverContent) {
        const parts = msg.serverContent.modelTurn?.parts || [];
        for (const part of parts) {
          // Audio data inline
          if (part.inlineData?.mimeType?.startsWith('audio/')) {
            const audioBytes = Buffer.from(part.inlineData.data, 'base64');
            if (clientWs.readyState === 1) {
              clientWs.send(audioBytes);
            }
          }
          // Text transcript
          if (part.text) {
            addTranscriptSegment(sessionId, 'agent', part.text, true);
            if (clientWs.readyState === 1) {
              clientWs.send(JSON.stringify({
                type: 'transcript',
                speaker: 'agent',
                text: part.text,
                isFinal: true,
              }));
            }
          }
        }

        // Turn complete signals
        if (msg.serverContent.turnComplete) {
          if (clientWs.readyState === 1) {
            clientWs.send(JSON.stringify({ type: 'state', state: 'listening' }));
          }
        }

        // Interrupted (barge-in acknowledged)
        if (msg.serverContent.interrupted) {
          if (clientWs.readyState === 1) {
            clientWs.send(JSON.stringify({ type: 'state', state: 'listening' }));
          }
        }
        return;
      }

      // Tool call from the model
      if (msg.toolCall) {
        const functionCalls = msg.toolCall.functionCalls || [];
        const toolResponses: any[] = [];

        for (const fc of functionCalls) {
          const toolName = fc.name;
          const args = fc.args || {};

          // Notify client
          if (clientWs.readyState === 1) {
            clientWs.send(JSON.stringify({
              type: 'tool_status',
              tool: toolName,
              status: 'executing',
            }));
          }

          // Execute server-side
          const result = await executeIntakeTool(toolName, args, session.facts);

          // Notify client of completion
          if (clientWs.readyState === 1) {
            clientWs.send(JSON.stringify({
              type: 'tool_status',
              tool: toolName,
              status: 'complete',
              result: result.content,
            }));
          }

          toolResponses.push({
            id: fc.id,
            name: toolName,
            response: result.content,
          });
        }

        // Send tool results back to provider
        if (providerWs.readyState === 1) {
          providerWs.send(JSON.stringify({
            toolResponse: { functionResponses: toolResponses },
          }));
        }
        return;
      }
    } catch (err) {
      console.warn('[client-stream] failed to parse provider message:', err);
    }
  });

  providerWs.on('close', (code: number, reason: string) => {
    console.log(`[client-stream] upstream closed for ${sessionId.slice(0, 8)}… code=${code}`);
    if (clientWs.readyState === 1) {
      clientWs.send(JSON.stringify({ type: 'state', state: 'disconnected' }));
      clientWs.close(1000, 'Session ended');
    }
    // Trigger post-call synthesis
    runPostCallSynthesis(sessionId).catch(err =>
      console.error('[client-stream] post-call synthesis failed:', err),
    );
  });

  providerWs.on('error', (err: Error) => {
    console.error('[client-stream] upstream error:', err.message);
    if (clientWs.readyState === 1) {
      clientWs.send(JSON.stringify({ type: 'error', message: 'Voice service error.' }));
    }
  });

  // ── Client WebSocket handlers ────────────────────────────────────────────

  clientWs.on('message', (data: any) => {
    touchSession(sessionId);

    // Binary = audio from browser (24kHz 16-bit PCM)
    if (data instanceof Buffer || data instanceof ArrayBuffer) {
      if (providerWs && providerWs.readyState === 1) {
        // Gemini expects audio in base64-encoded realtime input
        const audioBase64 = Buffer.from(data).toString('base64');
        providerWs.send(JSON.stringify({
          realtimeInput: {
            mediaChunks: [{
              mimeType: 'audio/pcm;rate=24000',
              data: audioBase64,
            }],
          },
        }));
      }
      return;
    }

    // Text = JSON commands from browser
    try {
      const msg = JSON.parse(typeof data === 'string' ? data : data.toString());

      if (msg.type === 'interrupt') {
        // Barge-in: tell provider to stop generating
        if (providerWs && providerWs.readyState === 1) {
          providerWs.send(JSON.stringify({
            clientContent: { turnComplete: true },
          }));
        }
        return;
      }

      if (msg.type === 'text' && msg.content) {
        // Text input alongside audio (accessibility)
        addTranscriptSegment(sessionId, 'caller', msg.content, true);
        if (providerWs && providerWs.readyState === 1) {
          providerWs.send(JSON.stringify({
            clientContent: {
              turns: [{ role: 'user', parts: [{ text: msg.content }] }],
              turnComplete: true,
            },
          }));
        }
        return;
      }
    } catch {
      // Not JSON, ignore
    }
  });

  clientWs.on('close', () => {
    console.log(`[client-stream] client disconnected from session ${sessionId.slice(0, 8)}…`);
    // Close upstream
    if (providerWs && providerWs.readyState === 1) {
      providerWs.close(1000, 'Client disconnected');
    }
    // Trigger post-call synthesis if not already triggered
    runPostCallSynthesis(sessionId).catch(err =>
      console.error('[client-stream] post-call synthesis failed:', err),
    );
  });

  clientWs.on('error', (err: Error) => {
    console.warn('[client-stream] client error:', err.message);
  });
}
