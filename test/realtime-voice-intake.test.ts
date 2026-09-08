/**
 * Realtime voice intake — test suite.
 *
 * Covers the Maya live voice pipeline end to end at the unit level:
 *   1. G.711 μ-law ↔ 24 kHz PCM codec and resamplers (telephony bridge)
 *   2. Live-token endpoint: auth verification + tenant boundary isolation
 *   3. Client WebSocket handshake: invalid/expired session rejection
 *   4. Mid-call tool execution: check_conflict (firm-scoped) + record_case_fact
 *   5. Post-call synthesis: intake_cases persistence with real schema fields
 *
 * All external I/O (Supabase REST, Gemini API) is mocked — no network, no keys.
 */

import { describe, it, expect, beforeEach, afterEach, afterAll, vi } from 'vitest';

import liveTokenHandler from '../api/ai/live-token';
import {
  createSession,
  getSession,
  destroySession,
  addTranscriptSegment,
  activeSessionCount,
  type LiveSession,
} from '../api/ai/_shared/liveSession';
import {
  executeIntakeTool,
  executeCheckConflict,
  type LiveSessionFact,
} from '../api/voice/_shared/intakeTools';
import { runPostCallSynthesis } from '../api/voice/_shared/postCallSynthesis';
import {
  encodeMulaw,
  decodeMulaw,
  resample8kTo24k,
  resample24kTo8k,
} from '../api/voice/_shared/g711';
import { handleClientStream } from '../api/voice/client-stream';

// ── helpers ──────────────────────────────────────────────────────────────────

const createdSessions: string[] = [];
function makeSession(overrides: Partial<Parameters<typeof createSession>[0]> = {}): LiveSession {
  const s = createSession({
    channel: 'browser',
    firmId: 'firm-test',
    callerId: 'caller-1',
    systemInstruction: 'test instruction',
    ...overrides,
  });
  createdSessions.push(s.sessionId);
  return s;
}

/** Minimal fake WebSocket for handler-level tests. */
function fakeWs() {
  const sent: any[] = [];
  return {
    sent,
    readyState: 1, // OPEN
    send: (data: any) => sent.push(data),
    close: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  };
}

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as any;
}

// ── 1. Codec ────────────────────────────────────────────────────────────────

describe('G.711 μ-law codec (Twilio media bridge)', () => {
  it('round-trips 16-bit PCM through μ-law within quantization tolerance', () => {
    const pcm = new Int16Array(4096);
    for (let i = 0; i < pcm.length; i++) {
      // deterministic signal spanning the full 16-bit range
      pcm[i] = Math.round(32767 * Math.sin((i / 64) * Math.PI) * (i % 2 === 0 ? 1 : -0.5));
    }
    const ulaw = encodeMulaw(pcm);
    expect(ulaw).toHaveLength(pcm.length);
    const restored = decodeMulaw(ulaw);
    for (let i = 0; i < pcm.length; i++) {
      // μ-law is 8-bit companded: worst-case error at high amplitudes ≈ 512
      expect(Math.abs(restored[i] - pcm[i])).toBeLessThanOrEqual(768);
    }
  });

  it('preserves silence exactly', () => {
    const restored = decodeMulaw(encodeMulaw(new Int16Array(256)));
    expect(restored.every(v => v === 0)).toBe(true);
  });

  it('resamples 8 kHz → 24 kHz (3×) and 24 kHz → 8 kHz (⅓) with correct lengths', () => {
    const eightK = new Int16Array(8000); // 1 second of 8 kHz
    for (let i = 0; i < eightK.length; i++) eightK[i] = Math.round(1000 * Math.sin(i / 50));
    const up = resample8kTo24k(eightK);
    expect(up).toHaveLength(24000);
    const down = resample24kTo8k(up);
    expect(down).toHaveLength(8000);
    // energy roughly preserved (no all-zero collapse)
    const rms = Math.sqrt(down.reduce((a, v) => a + v * v, 0) / down.length);
    expect(rms).toBeGreaterThan(100);
  });
});

// ── 2. Token endpoint: auth + tenant isolation ────────────────────────────────

describe('live-token endpoint: verification + tenant boundaries', () => {
  const originalEnv = { ...process.env };
  let fetchCalls: any[] = [];

  beforeEach(() => {
    fetchCalls = [];
    process.env.SUPABASE_URL = 'https://test.supabase.co';
    process.env.SUPABASE_ANON_KEY = 'test-anon-key';
    process.env.GEMINI_API_KEY = 'test-gemini-key-should-never-leak';
    delete process.env.CASEBUDDY_CANONICAL_FIRM_ID;
    delete process.env.VITE_FIRM_ID;
    vi.stubGlobal('fetch', vi.fn(async (url: any, init: any) => {
      fetchCalls.push({ url: String(url), init });
      if (String(url).endsWith('/auth/v1/user')) {
        const auth = (init?.headers as any)?.Authorization || '';
        if (auth.includes('token-firm-A')) {
          return jsonResponse({ id: 'user-A', app_metadata: { firm_id: 'firm-A' } });
        }
        if (auth.includes('token-firm-B')) {
          return jsonResponse({ id: 'user-B', app_metadata: { firm_id: 'firm-B' } });
        }
        return jsonResponse({ message: 'invalid token' }, 401);
      }
      return jsonResponse({}, 404);
    }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    for (const k of Object.keys(process.env)) {
      if (!(k in originalEnv)) delete (process.env as any)[k];
    }
    Object.assign(process.env, originalEnv);
  });

  it('rejects unauthenticated callers with 401 and creates no session', async () => {
    const before = activeSessionCount();
    const res = await liveTokenHandler(new Request('https://app.test/api/ai/live-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    }));
    expect(res.status).toBe(401);
    expect(activeSessionCount()).toBe(before);
  });

  it('rejects callers with an invalid Supabase token', async () => {
    const before = activeSessionCount();
    const res = await liveTokenHandler(new Request('https://app.test/api/ai/live-token', {
      method: 'POST',
      headers: { Authorization: 'Bearer bad-token', 'Content-Type': 'application/json' },
      body: '{}',
    }));
    expect(res.status).toBe(401);
    expect(activeSessionCount()).toBe(before);
  });

  it('returns 503 when the live voice engine is not configured', async () => {
    delete process.env.GEMINI_API_KEY;
    const res = await liveTokenHandler(new Request('https://app.test/api/ai/live-token', {
      method: 'POST',
      headers: { Authorization: 'Bearer token-firm-A', 'Content-Type': 'application/json' },
      body: '{}',
    }));
    expect(res.status).toBe(503);
  });

  it('issues a scoped session descriptor with no provider key material', async () => {
    const res = await liveTokenHandler(new Request('https://app.test/api/ai/live-token', {
      method: 'POST',
      headers: { Authorization: 'Bearer token-firm-A', 'Content-Type': 'application/json' },
      body: JSON.stringify({ intakeId: '11111111-1111-1111-1111-111111111111' }),
    }));
    expect(res.status).toBe(200);
    const body = await res.json() as any;

    expect(body.sessionId).toBeTruthy();
    expect(body.wsUrl).toBe('/api/voice/client-stream');
    expect(body.tools).toEqual(expect.arrayContaining([
      'check_conflict',
      'verify_court_jurisdiction',
      'record_case_fact',
      'schedule_attorney_consultation',
    ]));
    // The browser must never receive provider credentials.
    expect(JSON.stringify(body)).not.toContain('test-gemini-key-should-never-leak');

    const session = getSession(body.sessionId);
    expect(session).not.toBeNull();
    expect(session!.firmId).toBe('firm-A');
    expect(session!.intakeId).toBe('11111111-1111-1111-1111-111111111111');
  });

  it('enforces tenant boundaries between two firms', async () => {
    const reqFor = (token: string) => new Request('https://app.test/api/ai/live-token', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: '{}',
    });
    const resA = await liveTokenHandler(reqFor('token-firm-A'));
    const resB = await liveTokenHandler(reqFor('token-firm-B'));
    const a = await resA.json() as any;
    const b = await resB.json() as any;

    expect(a.sessionId).not.toBe(b.sessionId);
    const sessA = getSession(a.sessionId)!;
    const sessB = getSession(b.sessionId)!;
    expect(sessA.firmId).toBe('firm-A');
    expect(sessB.firmId).toBe('firm-B');
    // Session IDs are unguessable random credentials; one firm's ID can never
    // resolve another firm's session.
    expect(getSession(`${a.sessionId}x`)).toBeNull();
  });
});

// ── 3. Client WebSocket handshake ────────────────────────────────────────────

describe('client-stream WebSocket handshake', () => {
  it('rejects connections with an invalid or expired session ID', async () => {
    const ws = fakeWs();
    await handleClientStream(ws as any, 'definitely-not-a-real-session-id');
    const first = JSON.parse(ws.sent[0]);
    expect(first.type).toBe('error');
    expect(ws.close).toHaveBeenCalledWith(4001, 'Invalid session');
  });
});

// ── 4. Mid-call tool execution ──────────────────────────────────────────────

describe('mid-call intake tools', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('record_case_fact records progressively into the live session', async () => {
    const facts: LiveSessionFact[] = [];
    const r1 = await executeIntakeTool('record_case_fact', {
      category: 'incident_date',
      description: 'Slip and fall on 2026-08-30 at BigBox Mart',
    }, facts);
    expect((r1.content as any).recorded).toBe(true);
    expect(facts).toHaveLength(1);
    expect(facts[0].category).toBe('incident_date');

    const r2 = await executeIntakeTool('record_case_fact', {
      category: 'party',
      description: 'Opposing party: BigBox Mart LLC',
    }, facts);
    expect((r2.content as any).totalFacts).toBe(2);
    expect(facts[1].category).toBe('party');
  });

  it('check_conflict is firm-scoped and returns matched conflicts', async () => {
    const calls: any[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: any) => {
      calls.push(String(url));
      if (String(url).includes('rest/v1/intake_cases')) {
        return jsonResponse([
          { id: '22222222-2222-2222-2222-222222222222', full_name: 'BigBox Mart LLC', intake: {} },
        ]);
      }
      if (String(url).includes('rest/v1/cases')) {
        return jsonResponse([
          { id: '33333333-3333-3333-3333-333333333333', name: 'BigBox Mart v. Reardon', client_name: 'BigBox Mart LLC', opposing_party: '' },
        ]);
      }
      return jsonResponse([], 404);
    }));

    const result = await executeCheckConflict('BigBox Mart', 'firm-A');
    const content = result.content as any;

    // Tenant isolation: every Supabase query must carry the firm filter.
    const intakeQuery = calls.find(u => u.includes('intake_cases'));
    expect(intakeQuery).toContain('firm_id=eq.firm-A');
    const casesQuery = calls.find(u => u.includes('rest/v1/cases'));
    expect(casesQuery).toContain('firm_id=eq.firm-A');

    expect(content.hasConflict).toBe(true);
    expect(content.matches.some((m: string) => m.includes('Existing client'))).toBe(true);
    expect(content.matches.some((m: string) => m.includes('Active case'))).toBe(true);
  });

  it('check_conflict reports no conflicts for unknown parties', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse([])));
    const result = await executeCheckConflict('Unknown Party Inc.', 'firm-A');
    expect((result.content as any).hasConflict).toBe(false);
  });

  it('returns a structured error for unknown tools', async () => {
    const result = await executeIntakeTool('not_a_tool', {}, []);
    expect((result.content as any).error).toContain('Unknown tool');
  });
});

// ── 5. Post-call synthesis ───────────────────────────────────────────────────

describe('post-call intake synthesis', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('populates intake_cases with synthesized fields on the real schema', async () => {
    process.env.SUPABASE_URL = 'https://test.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role';
    process.env.GEMINI_API_KEY = 'test-gemini-key';

    const session = makeSession({ intakeId: '44444444-4444-4444-4444-444444444444' });
    addTranscriptSegment(session.sessionId, 'agent', 'Thank you for calling CaseBuddy, may I have your full name?', true);
    addTranscriptSegment(session.sessionId, 'caller', 'Jane Doe. I slipped at the grocery store last week.', true);
    executeIntakeTool('record_case_fact', {
      category: 'narrative',
      description: 'Slip and fall at grocery store',
      date: '2026-08-30',
    }, session.facts);

    const calls: any[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: any, init: any) => {
      calls.push({ url: String(url), init });
      if (String(url).includes('generativelanguage.googleapis.com')) {
        return jsonResponse({
          candidates: [{
            content: { parts: [{ text: JSON.stringify({
              summary: 'Personal injury intake — slip and fall at a grocery store.',
              memorandum: 'Detailed memorandum for attorney review.',
              matterType: 'Personal Injury',
              jurisdiction: 'Texas',
              score: 72,
              intakeData: { fullName: 'Jane Doe' },
            }) }] },
          }],
        });
      }
      return jsonResponse([]);
    }));

    await runPostCallSynthesis(session.sessionId);

    const factsPost = calls.find(c => c.url.includes('intake_call_facts'));
    expect(factsPost).toBeTruthy();
    const factsBody = JSON.parse(factsPost!.init.body);
    expect(factsBody).toHaveLength(1);
    expect(factsBody[0].category).toBe('narrative');

    const patch = calls.find(c => c.init?.method === 'PATCH' && c.url.includes('intake_cases?id=eq.'));
    expect(patch).toBeTruthy();
    const body = JSON.parse(patch!.init.body);

    // Required synthesis fields (task spec: intake_score→score, case_summary→summary,
    // intake_memorandum, live session linkage).
    expect(body.score).toBe(72);
    expect(body.summary).toContain('slip and fall');
    expect(body.intake_memorandum).toContain('memorandum');
    expect(body.live_voice_session_id).toBe(session.sessionId);
    expect(body.matter_type).toBe('Personal Injury');
    expect(body.transcript).toHaveLength(2);

    // Must NOT write columns that do not exist on the production table.
    expect(body).not.toHaveProperty('completion_state');
    expect(body).not.toHaveProperty('last_activity_at');
    expect(body).not.toHaveProperty('recording_consent');
  });

  it('creates a new intake row when no intake was attached', async () => {
    process.env.SUPABASE_URL = 'https://test.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role';
    process.env.GEMINI_API_KEY = 'test-gemini-key';

    const session = makeSession({ intakeId: undefined });
    addTranscriptSegment(session.sessionId, 'caller', 'This is John Smith calling about a landlord problem.', true);

    const calls: any[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: any, init: any) => {
      calls.push({ url: String(url), init });
      if (String(url).includes('generativelanguage.googleapis.com')) {
        return jsonResponse({
          candidates: [{ content: { parts: [{ text: JSON.stringify({
            summary: 'Landlord-tenant dispute.',
            memorandum: 'Memorandum.',
            matterType: 'Civil Litigation',
            jurisdiction: 'unspecified',
            score: 55,
            intakeData: { fullName: 'John Smith' },
          }) }] } }],
        });
      }
      // POST to intake_cases returns the created row.
      if (String(url).includes('rest/v1/intake_cases') && init?.method === 'POST') {
        return jsonResponse([{ id: '55555555-5555-5555-5555-555555555555' }]);
      }
      return jsonResponse([]);
    }));

    await runPostCallSynthesis(session.sessionId);

    const post = calls.find(c => c.init?.method === 'POST' && c.url.includes('rest/v1/intake_cases'));
    expect(post).toBeTruthy();
    const body = JSON.parse(post!.init.body);
    expect(body.firm_id).toBe('firm-test');
    expect(body.full_name).toBe('John Smith');
    expect(body.live_voice_session_id).toBe(session.sessionId);
    expect(body).not.toHaveProperty('completion_state');
  });
});

// ── cleanup registered sessions ──────────────────────────────────────────────

afterAll(() => {
  for (const id of createdSessions) destroySession(id);
});
