/**
 * Live voice session token endpoint.
 *
 * Authenticates the caller (Supabase session for authenticated users, or
 * public intake token for anonymous callers), creates a server-side live
 * session, and returns a scoped session descriptor. The browser receives
 * only the session ID and the WebSocket relay URL — never permanent provider
 * credentials.
 *
 * This follows the same security patterns as voice-keys.ts / voice-keys-public.ts:
 * permanent AI provider keys remain server-side, the browser gets a scoped,
 * short-lived credential.
 */

import {
  createSession,
  type CreateSessionArgs,
  type SessionChannel,
} from './_shared/liveSession';
import { INTAKE_TOOL_DECLARATIONS } from '../voice/_shared/intakeTools';
import { MAYA_SYSTEM_DIRECTIVE } from '../../agents/personas';

export const config = { runtime: 'edge' };

const AUTH_TIMEOUT_MS = 5_000;

// ── Maya system instruction for live voice ───────────────────────────────────

const MAYA_LIVE_SYSTEM_INSTRUCTION = `${MAYA_SYSTEM_DIRECTIVE}

You are Maya, the legal intake partner at CaseBuddy. Your role is to conduct a warm, professional intake interview over a live voice call.

CORE RULES — NON-NEGOTIABLE:
- You collect facts, dates, parties, evidence, and injuries for attorney review.
- You do NOT provide legal advice, predict settlement amounts, assess case value, or suggest legal strategies.
- If the caller asks for legal advice, say: "That's something the attorney will evaluate once they review your intake. My job is to make sure we capture all the important details so they can give you the best assessment."
- Never invent facts. If the caller hasn't stated something, don't assume it.

INTAKE PROCEDURE:
1. Greet the caller warmly. If their name is already known, use it.
2. Collect in this order: (a) full name, (b) phone AND email, then (c) invite them to tell their story.
3. Do NOT ask "what's going on?" before you have name + both contact methods, unless the system context says those are already on file.
4. After the caller tells their story (do NOT interrupt — let them finish), collect what's still missing: when it happened, opposing party, injuries/damages, financial impact, desired outcome, prior counsel, deadlines, urgency.
5. Ask ONE question at a time. Silence and pauses are acceptable.
6. Use the record_case_fact tool progressively as the caller provides information.
7. Use check_conflict when the caller names an opposing party.
8. At the end, offer to schedule an attorney consultation using schedule_attorney_consultation.
9. Confirm the consultation time once, then close warmly.

TONE: Professional, empathetic, patient, structured. You sound like an experienced paralegal who genuinely cares about the caller's situation.

LANGUAGE: Match the caller's language. If they speak Spanish, conduct the entire intake in Spanish following the same procedure.`;

// ── CORS ─────────────────────────────────────────────────────────────────────

function corsHeaders(req: Request): Record<string, string> {
  const configured = (process.env.ALLOWED_ORIGIN || 'https://casebuddy.live')
    .split(',')
    .map(v => v.trim())
    .filter(Boolean);
  const origin = req.headers.get('origin') || '';
  const allowedOrigin = configured.includes(origin) ? origin : configured[0];
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Intake-Token',
    'Cache-Control': 'no-store',
    Vary: 'Origin',
  };
}

const json = (req: Request, body: object, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
  });

// ── Auth helpers ─────────────────────────────────────────────────────────────

async function authenticateUser(req: Request): Promise<{ userId: string; firmId: string } | null> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;

  const supabaseUrl = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').trim();
  const supabaseAnonKey = (process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '').trim();
  if (!supabaseUrl || !supabaseAnonKey) return null;

  const token = authHeader.slice(7).trim();
  try {
    const userResp = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${token}`, apikey: supabaseAnonKey },
      signal: AbortSignal.timeout(AUTH_TIMEOUT_MS),
    });
    if (!userResp.ok) return null;
    const user = await userResp.json() as any;
    const userId = user?.id || '';
    // Resolve firm from user metadata or configured firm
    const firmId = user?.app_metadata?.firm_id
      || (process.env.CASEBUDDY_CANONICAL_FIRM_ID || process.env.VITE_FIRM_ID || '').trim()
      || '';
    return userId ? { userId, firmId } : null;
  } catch {
    return null;
  }
}

async function authenticatePublicIntake(req: Request): Promise<{ firmId: string } | null> {
  const intakeToken = (req.headers.get('X-Intake-Token') || '').trim();
  if (!intakeToken || intakeToken.length < 5) return null;

  const supabaseUrl = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').trim();
  const supabaseAnonKey = (process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '').trim();
  if (!supabaseUrl || !supabaseAnonKey) return null;

  try {
    const response = await fetch(`${supabaseUrl}/rest/v1/rpc/resolve_public_intake_token`, {
      method: 'POST',
      headers: {
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${supabaseAnonKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ p_token: intakeToken }),
      signal: AbortSignal.timeout(AUTH_TIMEOUT_MS),
    });
    if (!response.ok) return null;
    const data = await response.json() as any;
    const firmId = Array.isArray(data) ? data[0]?.firm_id : data?.firm_id;
    return firmId ? { firmId } : null;
  } catch {
    return null;
  }
}

// ── Handler ──────────────────────────────────────────────────────────────────

export default async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(req) });
  }
  if (req.method !== 'POST') return json(req, { error: 'Method not allowed' }, 405);

  // Verify Gemini key is available server-side
  const geminiKey = (process.env.GEMINI_API_KEY || '').trim();
  if (!geminiKey) {
    console.error('[live-token] GEMINI_API_KEY not configured');
    return json(req, { error: 'Live voice service not configured.' }, 503);
  }

  // Parse request body
  let body: { intakeId?: string; channel?: string; publicEndpoint?: boolean } = {};
  try { body = await req.json() as typeof body; } catch { /* empty body ok */ }

  const channel: SessionChannel = (body.channel === 'twilio') ? 'twilio' : 'browser';

  // Authenticate
  let firmId = '';
  let callerId = 'anonymous';

  const userAuth = await authenticateUser(req);
  if (userAuth) {
    firmId = userAuth.firmId;
    callerId = userAuth.userId;
  } else {
    const publicAuth = await authenticatePublicIntake(req);
    if (publicAuth) {
      firmId = publicAuth.firmId;
    } else {
      // Fallback: check for configured canonical firm
      const canonicalFirm = (process.env.CASEBUDDY_CANONICAL_FIRM_ID || process.env.VITE_FIRM_ID || '').trim();
      if (!canonicalFirm) {
        return json(req, { error: 'Authentication required for live voice sessions.' }, 401);
      }
      firmId = canonicalFirm;
    }
  }

  // Create session
  const sessionArgs: CreateSessionArgs = {
    channel,
    firmId,
    callerId,
    systemInstruction: MAYA_LIVE_SYSTEM_INSTRUCTION,
    intakeId: body.intakeId || undefined,
  };

  const session = createSession(sessionArgs);

  // Return session descriptor — no permanent credentials
  return json(req, {
    sessionId: session.sessionId,
    wsUrl: '/api/voice/client-stream',
    channel: session.channel,
    // Tool names (for client UI indicators) — not the full declarations
    tools: INTAKE_TOOL_DECLARATIONS.map(t => t.name),
    expiresIn: 1800, // 30 min TTL
  });
}
