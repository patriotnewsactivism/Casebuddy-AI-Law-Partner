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

import {
  connectGeminiLiveWithFallback,
  DEFAULT_VOICE_NAME,
  PRIMARY_LIVE_MODEL,
  FALLBACK_LIVE_MODEL,
  type LiveConnectionHandle,
} from './_shared/geminiLiveConfig';

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

  // Open upstream Gemini WebSocket with 3.1 Live primary and 2.5 Live fallback
  let liveHandle: LiveConnectionHandle;
  try {
    liveHandle = await connectGeminiLiveWithFallback({
      systemInstruction: session.systemInstruction,
      tools: [{ functionDeclarations: INTAKE_TOOL_DECLARATIONS }],
      voiceName: DEFAULT_VOICE_NAME,
      onSetupComplete: (activeModel) => {
        touchSession(sessionId);
        if (clientWs.readyState === 1) {
          clientWs.send(JSON.stringify({ type: 'session_ready' }));
          clientWs.send(JSON.stringify({ type: 'model_info', model: activeModel }));
          clientWs.send(JSON.stringify({ type: 'state', state: 'listening' }));
        }
      },
      onFallbackEngaged: (fromModel, toModel, reason) => {
        console.warn(`[client-stream] Fallback triggered: ${fromModel} -> ${toModel} (${reason})`);
        if (clientWs.readyState === 1) {
          clientWs.send(JSON.stringify({
            type: 'model_fallback',
            fromModel,
            toModel,
            reason,
          }));
        }
      },
      onServerContent: async (content) => {
        touchSession(sessionId);

        // Binary audio chunk directly
        if (content.rawBinary) {
          if (clientWs.readyState === 1) {
            clientWs.send(content.rawBinary);
          }
          return;
        }

        // Multi-part model turn (Gemini 3.1 may send audio + transcripts simultaneously)
        const parts = content.modelTurn?.parts || [];
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
        if (content.turnComplete) {
          if (clientWs.readyState === 1) {
            clientWs.send(JSON.stringify({ type: 'state', state: 'listening' }));
          }
        }

        // Interrupted (barge-in acknowledged by model)
        if (content.interrupted) {
          if (clientWs.readyState === 1) {
            clientWs.send(JSON.stringify({ type: 'state', state: 'listening' }));
          }
        }
      },
      onToolCall: async (toolCall) => {
        touchSession(sessionId);
        const functionCalls = toolCall.functionCalls || [];
        const toolResponses: any[] = [];

        for (const fc of functionCalls) {
          const toolName = fc.name;
          const args = fc.args || {};

          // Notify client tool execution started
          if (clientWs.readyState === 1) {
            clientWs.send(JSON.stringify({
              type: 'tool_status',
              tool: toolName,
              status: 'executing',
            }));
          }

          // Execute server-side intake tool
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

        // Return tool results back to Gemini Live
        liveHandle.sendToolResponse(toolResponses);
      },
      onClose: (code, reason) => {
        console.log(`[client-stream] upstream closed for ${sessionId.slice(0, 8)}… code=${code}`);
        if (clientWs.readyState === 1) {
          clientWs.send(JSON.stringify({ type: 'state', state: 'disconnected' }));
          clientWs.close(1000, 'Session ended');
        }
        runPostCallSynthesis(sessionId).catch(err =>
          console.error('[client-stream] post-call synthesis failed:', err),
        );
      },
      onError: (err) => {
        console.error('[client-stream] upstream error:', err?.message || err);
        if (clientWs.readyState === 1) {
          clientWs.send(JSON.stringify({ type: 'error', message: 'Voice service error.' }));
        }
      },
    });

    session.providerWs = liveHandle.ws;
  } catch (err) {
    console.error('[client-stream] failed to connect to Gemini Live engine:', err);
    clientWs.send(JSON.stringify({ type: 'error', message: 'Voice service unavailable.' }));
    clientWs.close(4002, 'Provider unavailable');
    return;
  }

  // ── Client WebSocket handlers ────────────────────────────────────────────

  clientWs.on('message', (data: any) => {
    touchSession(sessionId);

    // Binary = audio from browser (24kHz 16-bit PCM)
    if (data instanceof Buffer || data instanceof ArrayBuffer) {
      const audioBase64 = Buffer.from(data).toString('base64');
      liveHandle.sendRealtimeInput([{
        mimeType: 'audio/pcm;rate=24000',
        data: audioBase64,
      }]);
      return;
    }

    // Text = JSON commands from browser
    try {
      const msg = JSON.parse(typeof data === 'string' ? data : data.toString());

      if (msg.type === 'interrupt') {
        // Barge-in: tell provider to stop generating
        if (liveHandle.ws && liveHandle.ws.readyState === 1) {
          liveHandle.ws.send(JSON.stringify({
            clientContent: { turnComplete: true },
          }));
        }
        return;
      }

      if (msg.type === 'text' && msg.content) {
        // Text input alongside audio (accessibility)
        addTranscriptSegment(sessionId, 'caller', msg.content, true);
        if (liveHandle.ws && liveHandle.ws.readyState === 1) {
          liveHandle.ws.send(JSON.stringify({
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
    liveHandle.close(1000, 'Client disconnected');
    // Trigger post-call synthesis if not already triggered
    runPostCallSynthesis(sessionId).catch(err =>
      console.error('[client-stream] post-call synthesis failed:', err),
    );
  });

  clientWs.on('error', (err: Error) => {
    console.warn('[client-stream] client error:', err.message);
  });
}
