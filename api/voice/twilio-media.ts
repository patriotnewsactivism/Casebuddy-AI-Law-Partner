/**
 * Twilio Media Streams bidirectional WebSocket bridge for Maya Live Voice.
 *
 * Handles the Twilio Media Streams protocol:
 *   - Receives 8 kHz G.711 μ-law audio from the phone caller
 *   - Transcodes to 24 kHz 16-bit PCM and relays to the Gemini provider
 *   - Receives 24 kHz PCM from the provider, transcodes to 8 kHz G.711 μ-law
 *   - Streams encoded audio back to Twilio for the caller to hear
 *   - Supports barge-in via Twilio's `clear` message
 *
 * Twilio Media Streams protocol reference:
 *   https://www.twilio.com/docs/voice/media-streams
 *
 * This handler is mounted at /api/voice/twilio-media via server/index.ts
 * (Railway) or a Supabase Edge Function. It does NOT work on Vercel serverless
 * due to WebSocket lifetime limitations.
 */

import {
  createSession,
  getSession,
  touchSession,
  addTranscriptSegment,
  type SessionChannel,
} from '../ai/_shared/liveSession';
import {
  decodeTwilioPayload,
  encodeTwilioPayload,
  resample8kTo24k,
  resample24kTo8k,
} from './_shared/g711';
import {
  executeIntakeTool,
  INTAKE_TOOL_DECLARATIONS,
} from './_shared/intakeTools';
import { runPostCallSynthesis } from './_shared/postCallSynthesis';

// ── Gemini connection ────────────────────────────────────────────────────────

const GEMINI_WS_BASE = 'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent';
const GEMINI_MODEL = 'models/gemini-2.5-flash';
const VOICE_NAME = 'Aoede';

const MAYA_LIVE_SYSTEM_INSTRUCTION = `You are Maya, the legal intake partner at CaseBuddy, speaking on a phone call. Your role is to conduct a warm, professional intake interview.

CORE RULES — NON-NEGOTIABLE:
- You collect facts, dates, parties, evidence, and injuries for attorney review.
- You do NOT provide legal advice, predict settlement amounts, or assess case value.
- If the caller asks for advice, say: "That's something the attorney will evaluate once they review your intake."
- Never invent facts.

PHONE-SPECIFIC ADJUSTMENTS:
- Keep responses concise — phone callers lose attention with long monologues.
- Speak clearly and at a measured pace.
- Confirm spelled-out names and numbers by repeating them back.
- If audio quality is poor, ask the caller to repeat.

INTAKE PROCEDURE:
1. After the recording consent confirmation, greet warmly.
2. Collect: (a) full name, (b) phone AND email, then (c) invite story.
3. After the story, collect what's missing: when, who, injuries, damages, outcome, prior counsel, deadlines.
4. Ask ONE question at a time. Patience is essential.
5. Use record_case_fact progressively. Use check_conflict for opposing parties.
6. Offer schedule_attorney_consultation at the end.
7. Confirm and close.`;

function buildGeminiWsUrl(): string {
  const apiKey = (process.env.GEMINI_API_KEY || '').trim();
  if (!apiKey) throw new Error('GEMINI_API_KEY not configured');
  return `${GEMINI_WS_BASE}?key=${apiKey}`;
}

// ── Twilio WebSocket handler ─────────────────────────────────────────────────

/**
 * Handle an upgraded WebSocket connection from Twilio Media Streams.
 * Called from server/index.ts on the WebSocket upgrade event.
 */
export async function handleTwilioMedia(twilioWs: any): Promise<void> {
  let sessionId = '';
  let streamSid = '';
  let callerNumber = '';
  let providerWs: any = null;
  let markCounter = 0;

  const firmId = (process.env.CASEBUDDY_CANONICAL_FIRM_ID || process.env.VITE_FIRM_ID || '').trim();

  twilioWs.on('message', async (data: any) => {
    let msg: any;
    try {
      msg = JSON.parse(typeof data === 'string' ? data : data.toString());
    } catch {
      return;
    }

    const event = msg.event;

    // ── connected ──────────────────────────────────────────────────────────
    if (event === 'connected') {
      console.log('[twilio-media] Twilio connected');
      return;
    }

    // ── start ──────────────────────────────────────────────────────────────
    if (event === 'start') {
      streamSid = msg.start?.streamSid || '';
      callerNumber = msg.start?.callSid || '';
      const customParams = msg.start?.customParameters || {};
      console.log(`[twilio-media] stream started: sid=${streamSid} caller=${callerNumber}`);

      // Create session
      const session = createSession({
        channel: 'twilio' as SessionChannel,
        firmId: firmId || 'unknown',
        callerId: callerNumber,
        systemInstruction: MAYA_LIVE_SYSTEM_INSTRUCTION,
        recordingConsent: customParams.consent === 'true',
      });
      sessionId = session.sessionId;

      // Open upstream Gemini connection
      try {
        const WebSocketImpl = (await import('ws')).default;
        providerWs = new WebSocketImpl(buildGeminiWsUrl());
        session.providerWs = providerWs;

        providerWs.on('open', () => {
          console.log(`[twilio-media] upstream connected for ${sessionId.slice(0, 8)}…`);
          // Send setup
          providerWs.send(JSON.stringify({
            setup: {
              model: GEMINI_MODEL,
              generationConfig: {
                responseModalities: ['AUDIO'],
                speechConfig: {
                  voiceConfig: {
                    prebuiltVoiceConfig: { voiceName: VOICE_NAME },
                  },
                },
              },
              systemInstruction: {
                parts: [{ text: session.systemInstruction }],
              },
              tools: [{ functionDeclarations: INTAKE_TOOL_DECLARATIONS }],
            },
          }));
        });

        providerWs.on('message', async (providerData: any) => {
          touchSession(sessionId);

          try {
            const providerMsg = JSON.parse(
              typeof providerData === 'string' ? providerData : providerData.toString(),
            );

            // Audio from the model
            if (providerMsg.serverContent?.modelTurn?.parts) {
              for (const part of providerMsg.serverContent.modelTurn.parts) {
                if (part.inlineData?.mimeType?.startsWith('audio/') && part.inlineData.data) {
                  // Decode provider audio (24kHz PCM) → 8kHz μ-law for Twilio
                  const pcm24k = new Int16Array(
                    Buffer.from(part.inlineData.data, 'base64').buffer,
                  );
                  const pcm8k = resample24kTo8k(pcm24k);
                  const payload = encodeTwilioPayload(pcm8k);

                  if (twilioWs.readyState === 1) {
                    twilioWs.send(JSON.stringify({
                      event: 'media',
                      streamSid,
                      media: { payload },
                    }));
                  }
                }
                // Text from the model (transcript)
                if (part.text) {
                  addTranscriptSegment(sessionId, 'agent', part.text, true);
                }
              }
            }

            // Tool call
            if (providerMsg.toolCall) {
              const functionCalls = providerMsg.toolCall.functionCalls || [];
              const toolResponses: any[] = [];
              const currentSession = getSession(sessionId);

              for (const fc of functionCalls) {
                const result = await executeIntakeTool(
                  fc.name,
                  fc.args || {},
                  currentSession?.facts || [],
                );
                toolResponses.push({
                  id: fc.id,
                  name: fc.name,
                  response: result.content,
                });
              }

              if (providerWs.readyState === 1) {
                providerWs.send(JSON.stringify({
                  toolResponse: { functionResponses: toolResponses },
                }));
              }
            }
          } catch (err) {
            console.warn('[twilio-media] error processing provider message:', err);
          }
        });

        providerWs.on('close', () => {
          console.log(`[twilio-media] upstream closed for ${sessionId.slice(0, 8)}…`);
          runPostCallSynthesis(sessionId).catch(err =>
            console.error('[twilio-media] post-call synthesis failed:', err),
          );
        });

        providerWs.on('error', (err: Error) => {
          console.error('[twilio-media] upstream error:', err.message);
        });
      } catch (err) {
        console.error('[twilio-media] failed to open upstream:', err);
      }
      return;
    }

    // ── media (caller audio) ───────────────────────────────────────────────
    if (event === 'media' && msg.media?.payload) {
      touchSession(sessionId);

      if (providerWs && providerWs.readyState === 1) {
        // Decode Twilio μ-law → 16-bit PCM 8kHz → upsample to 24kHz
        const pcm8k = decodeTwilioPayload(msg.media.payload);
        const pcm24k = resample8kTo24k(pcm8k);
        const audioBase64 = Buffer.from(pcm24k.buffer).toString('base64');

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

    // ── mark (playback position marker) ────────────────────────────────────
    if (event === 'mark') {
      // Track mark for barge-in coordination
      return;
    }

    // ── stop ───────────────────────────────────────────────────────────────
    if (event === 'stop') {
      console.log(`[twilio-media] stream stopped: ${streamSid}`);
      if (providerWs && providerWs.readyState === 1) {
        providerWs.close(1000, 'Call ended');
      }
      runPostCallSynthesis(sessionId).catch(err =>
        console.error('[twilio-media] post-call synthesis failed:', err),
      );
      return;
    }
  });

  twilioWs.on('close', () => {
    console.log(`[twilio-media] Twilio WS closed for ${sessionId.slice(0, 8) || 'unknown'}`);
    if (providerWs && providerWs.readyState === 1) {
      providerWs.close(1000, 'Twilio disconnected');
    }
  });

  twilioWs.on('error', (err: Error) => {
    console.warn('[twilio-media] Twilio WS error:', err.message);
  });
}
