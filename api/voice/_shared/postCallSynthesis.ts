/**
 * Post-call intake synthesis for Maya Live Voice sessions.
 *
 * Triggered when a live voice session ends (WebSocket close or call hangup).
 * Assembles the full transcript, synthesizes structured intake data from the
 * accumulated facts and conversation, and persists to intake_cases.
 *
 * All operations use Supabase service-role credentials server-side.
 * Recording storage follows MAYA_INTAKE_RECORDING_PRIVACY.md custody rules.
 */

import {
  getSession,
  getFullTranscript,
  markFinalized,
  type LiveSession,
} from '../../ai/_shared/liveSession';
import { type LiveSessionFact } from './intakeTools';

// ── Supabase helpers ─────────────────────────────────────────────────────────

const SB_URL = () => (process.env.SUPABASE_URL || '').trim();
const SB_KEY = () => (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
const GEMINI_KEY = () => (process.env.GEMINI_API_KEY || '').trim();

async function sbFetch(path: string, opts: RequestInit = {}) {
  const url = SB_URL();
  const key = SB_KEY();
  if (!url || !key) return null;
  return fetch(`${url}/rest/v1/${path}`, {
    ...opts,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      ...(opts.headers || {}),
    },
    signal: AbortSignal.timeout(15_000),
  });
}

// ── AI synthesis ─────────────────────────────────────────────────────────────

async function synthesizeWithGemini(
  transcript: { speaker: string; text: string }[],
  facts: LiveSessionFact[],
): Promise<{
  summary: string;
  memorandum: string;
  intakeData: Record<string, unknown>;
  score: number;
  matterType: string;
  jurisdiction: string;
}> {
  const apiKey = GEMINI_KEY();
  if (!apiKey) {
    console.warn('[postCallSynthesis] GEMINI_API_KEY not configured, skipping synthesis');
    return {
      summary: 'Synthesis unavailable — API key not configured.',
      memorandum: '',
      intakeData: {},
      score: 50,
      matterType: 'unspecified',
      jurisdiction: 'unspecified',
    };
  }

  const transcriptText = transcript
    .map(t => `${t.speaker === 'agent' ? 'Maya' : 'Caller'}: ${t.text}`)
    .join('\n');

  const factsText = facts.length > 0
    ? '\n\nFacts recorded during call:\n' + facts.map(f =>
      `- [${f.category}] ${f.description}${f.factDate ? ` (date: ${f.factDate})` : ''}`
    ).join('\n')
    : '';

  const prompt = `You are a legal intake analyst. Analyze this intake call transcript and produce a structured JSON report.

TRANSCRIPT:
${transcriptText}
${factsText}

Produce JSON with these fields:
{
  "summary": "One-paragraph plain-language summary of the matter",
  "memorandum": "Detailed intake memorandum suitable for attorney review (2-4 paragraphs). Include: facts, parties, timeline, injuries/damages, jurisdiction, and open questions. Ground everything in what the caller actually said. Note anything the caller did NOT cover that an attorney would need.",
  "matterType": "The primary practice area (e.g., 'Personal Injury', 'Family Law', 'Employment')",
  "jurisdiction": "State and county/city if mentioned",
  "score": <integer 0-100 representing case strength/fit>,
  "intakeData": {
    "fullName": "",
    "contact": "",
    "email": "",
    "phone": "",
    "matterType": "",
    "jurisdiction": "",
    "summary": "",
    "incidentDate": "",
    "opposingParties": "",
    "deadlines": "",
    "injuriesOrDamages": "",
    "desiredOutcome": "",
    "priorCounsel": "",
    "detailedNarrative": "",
    "keyFacts": [],
    "timeline": [],
    "parties": [],
    "witnesses": "",
    "evidenceMentioned": "",
    "financialImpact": "",
    "priorLegalActions": "",
    "openQuestions": [],
    "emotionalState": ""
  }
}

CRITICAL RULES:
- Ground every statement in what the caller actually said. Never invent facts.
- Where information is missing, list it under openQuestions.
- Never provide legal advice or case valuations.
- The score reflects how complete and actionable the intake is, NOT case merit.`;

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.3, responseMimeType: 'application/json' },
        }),
        signal: AbortSignal.timeout(30_000),
      },
    );

    if (!response.ok) {
      console.error('[postCallSynthesis] Gemini synthesis failed:', response.status);
      return { summary: 'Synthesis failed.', memorandum: '', intakeData: {}, score: 50, matterType: 'unspecified', jurisdiction: 'unspecified' };
    }

    const data = await response.json() as any;
    const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
    const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const parsed = JSON.parse(cleaned);
    return {
      summary: parsed.summary || '',
      memorandum: parsed.memorandum || '',
      intakeData: parsed.intakeData || {},
      score: typeof parsed.score === 'number' ? parsed.score : 50,
      matterType: parsed.matterType || 'unspecified',
      jurisdiction: parsed.jurisdiction || 'unspecified',
    };
  } catch (err) {
    console.error('[postCallSynthesis] Gemini call failed:', err);
    return { summary: 'Synthesis error.', memorandum: '', intakeData: {}, score: 50, matterType: 'unspecified', jurisdiction: 'unspecified' };
  }
}

// ── Main synthesis pipeline ──────────────────────────────────────────────────

/**
 * Run post-call synthesis for a completed live voice session.
 * Safe to call multiple times — idempotent via the `finalized` flag.
 */
export async function runPostCallSynthesis(sessionId: string): Promise<void> {
  const session = getSession(sessionId);
  if (!session) {
    console.warn(`[postCallSynthesis] session ${sessionId.slice(0, 8)}… not found`);
    return;
  }
  if (session.finalized) {
    console.log(`[postCallSynthesis] session ${sessionId.slice(0, 8)}… already finalized`);
    return;
  }

  markFinalized(sessionId);
  const transcript = getFullTranscript(sessionId);

  if (transcript.length === 0) {
    console.log(`[postCallSynthesis] session ${sessionId.slice(0, 8)}… has no transcript, skipping`);
    return;
  }

  console.log(`[postCallSynthesis] synthesizing session ${sessionId.slice(0, 8)}… (${transcript.length} segments, ${session.facts.length} facts)`);

  // 1. AI synthesis
  const synthesis = await synthesizeWithGemini(transcript, session.facts);

  // 2. Persist facts to intake_call_facts (if table exists)
  if (session.intakeId && session.facts.length > 0) {
    try {
      await sbFetch('intake_call_facts', {
        method: 'POST',
        body: JSON.stringify(
          session.facts.map(f => ({
            intake_id: session.intakeId,
            category: f.category,
            description: f.description,
            fact_date: f.factDate || null,
            created_at: f.recordedAt,
          })),
        ),
      });
    } catch (err) {
      console.warn('[postCallSynthesis] failed to persist call facts:', err);
    }
  }

  // 3. Update or create intake_cases row
  if (session.intakeId) {
    try {
      await sbFetch(`intake_cases?id=eq.${session.intakeId}`, {
        method: 'PATCH',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({
          completion_state: 'complete',
          summary: synthesis.summary,
          intake_memorandum: synthesis.memorandum,
          score: synthesis.score,
          matter_type: synthesis.matterType,
          jurisdiction: synthesis.jurisdiction,
          intake: synthesis.intakeData,
          transcript,
          live_voice_session_id: sessionId,
          last_activity_at: new Date().toISOString(),
        }),
      });
      console.log(`[postCallSynthesis] updated intake ${session.intakeId}`);
    } catch (err) {
      console.warn('[postCallSynthesis] failed to update intake_cases:', err);
    }
  } else {
    // Create a new intake row
    try {
      const fullName =
        (synthesis.intakeData as any)?.fullName ||
        transcript.find(t => t.speaker === 'caller')?.text?.split(' ').slice(0, 3).join(' ') ||
        'Unknown Caller';

      const result = await sbFetch('intake_cases', {
        method: 'POST',
        body: JSON.stringify({
          firm_id: session.firmId,
          full_name: fullName,
          contact: (synthesis.intakeData as any)?.contact || session.callerId || '',
          summary: synthesis.summary,
          intake_memorandum: synthesis.memorandum,
          score: synthesis.score,
          matter_type: synthesis.matterType,
          jurisdiction: synthesis.jurisdiction,
          intake: synthesis.intakeData,
          transcript,
          completion_state: 'complete',
          status: 'new',
          disposition: synthesis.score >= 60 ? 'accepted' : 'review',
          recommended_department: synthesis.matterType,
          recommended_agent_id: '',
          urgency: synthesis.score >= 80 ? 'high' : synthesis.score >= 50 ? 'medium' : 'low',
          score_detail: {},
          recording_consent: session.recordingConsent,
          live_voice_session_id: sessionId,
          last_activity_at: new Date().toISOString(),
        }),
      });
      if (result) {
        const rows = await result.json() as any[];
        if (rows?.[0]?.id) {
          console.log(`[postCallSynthesis] created intake ${rows[0].id}`);
        }
      }
    } catch (err) {
      console.warn('[postCallSynthesis] failed to create intake_cases row:', err);
    }
  }

  console.log(`[postCallSynthesis] session ${sessionId.slice(0, 8)}… synthesis complete`);
}
