import { GoogleGenAI, Type } from '@google/genai';
import { getGeminiKey } from './runtimeKeys';
import { IntakeData, IntakeScore } from '../types';
import { LEGAL_SPECIALISTS } from '../agents/personas';
import { retryWithBackoff, withTimeout } from '../utils/errorHandler';
import { deepseekChat } from './deepseek';

// Intake text analysis uses DeepSeek as primary (per project architecture).
// Gemini is only used for multimodal (OCR/transcription).
const callDeepSeekJson = async (system: string, user: string, maxTokens = 3000): Promise<string> => {
  const text = await deepseekChat({
    systemInstruction: system,
    messages: [{ role: 'user', content: user }],
    temperature: 0.3,
    jsonMode: true,
    maxTokens,
    timeoutMs: 30000,
  });
  return text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
};

// Intake AI calls go through the server-side proxy (/api/ai/gemini), which holds
// the GEMINI_API_KEY. This keeps the key out of the browser and avoids depending
// on a per-session client key that may be missing or restricted — the cause of
// intakes silently failing at the extraction step. If the proxy isn't reachable
// (e.g. a host without the edge function) we fall back to direct browser call.
const callGeminiProxy = async (params: {
  model: string;
  contents: unknown;
  config?: unknown;
}): Promise<string> => {
  // Retry on rate limit or transient errors
  return retryWithBackoff(async () => {
    const resp = await fetch('/api/ai/gemini', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    if (!resp.ok) {
      let message = `Gemini proxy error (${resp.status})`;
      try {
        const body = await resp.json();
        if (body?.error) message = body.error;
      } catch { /* non-JSON error body */ }
      // Retry on rate limit, throw on other errors
      if (resp.status === 429) throw new Error(message);
      throw new Error(message);
    }
    const data: any = await resp.json();
    const text: string = (data?.candidates?.[0]?.content?.parts ?? [])
      .map((p: any) => p?.text ?? '')
      .join('')
      .trim();
    if (!text) throw new Error('Gemini proxy returned an empty response');
    return text;
  }, 3);
};

/** Export the proxy caller for use by IntakePage.tsx */
export { callGeminiProxy };

// Score at/above this is auto-accepted; below ACCEPT but at/above REVIEW goes to
// manual review; anything under REVIEW is politely declined.
export const ACCEPT_BENCHMARK = 65;
export const REVIEW_BENCHMARK = 45;

type Turn = { speaker: string; text: string };

const transcriptToText = (transcript: Turn[]): string =>
  transcript
    .map(t => `${t.speaker === 'you' || t.speaker === 'user' ? 'CLIENT' : 'MAYA'}: ${t.text}`)
    .join('\n');

/**
 * Parse a model's JSON response defensively.
 */
const safeParseJson = <T = any>(raw: string | undefined, context: string): T => {
  const text = (raw || '').trim();
  if (!text) throw new Error(`${context}: empty response from model`);

  const cleaned = text
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  try {
    return JSON.parse(cleaned) as T;
  } catch {
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start !== -1 && end > start) {
      try {
        return JSON.parse(cleaned.slice(start, end + 1)) as T;
      } catch { /* fall through */ }
    }
    throw new Error(`${context}: model did not return valid JSON`);
  }
};

/**
 * Distill a free-form intake conversation into a structured IntakeData record.
 * Uses DeepSeek as primary (per project architecture) with Gemini fallback.
 */
export const extractIntake = async (transcript: Turn[]): Promise<IntakeData> => {
  const convo = transcriptToText(transcript);
  return retryWithBackoff(async () => {
    // DeepSeek is the primary text model per project architecture
    const text = await callDeepSeekJson(
      `You are the senior intake analyst for a law firm. Read the full intake call between MAYA (the firm's intake specialist) and a prospective CLIENT, and produce a thorough, faithful case report the attorneys can act on.

ABSOLUTE RULE — NO HALLUCINATION:
- Every single field must be grounded in what the CLIENT actually said in this transcript. Do NOT infer, assume, embellish, or fill gaps with plausible-sounding detail.
- If a detail was not stated, leave that field empty ("" or []). Never guess a date, a dollar amount, a name, or a legal conclusion that the client did not give.
- Do not diagnose the legal merits or state law. You are recording their story accurately, not advising.
- Prefer the client's own words. When you quote, quote exactly.

CAPTURE EVERYTHING — this caller may be long-winded, upset, or out of order. Pull every concrete detail out of the whole conversation, not just the last few turns. Losing information is a serious failure.

FIELD GUIDANCE:
- "summary": ONE tight sentence for a list view.
- "detailedNarrative": a complete, well-organized factual write-up (multiple short paragraphs) of what happened, in plain English, strictly from what the client said.
- "keyFacts": the concrete facts the client stated, each as its own short bullet.
- "timeline": events in chronological order with whatever date/time reference the client gave.
- "parties": every person or entity named, with their role.
- "clientQuotes": a few short, exact verbatim quotes in the client's own words.
- "openQuestions": important things that are still unknown or unclear.
- "matterType": the legal practice area in plain English.

- "email": the client's email address, exactly as stated. Maya's call flow requires asking for both a phone number and an email — capture whichever/however many were actually given.
- "phone": the client's phone number, exactly as stated.

Return ONLY valid JSON with these fields: fullName, contact, email, phone, matterType, jurisdiction, summary, detailedNarrative, incidentDate, opposingParties, deadlines, injuriesOrDamages, desiredOutcome, priorCounsel, witnesses, evidenceMentioned, financialImpact, priorLegalActions, emotionalState, keyFacts, clientQuotes, openQuestions, timeline, parties.`,
      `CONVERSATION:\n${convo}`,
      4000
    );
    const data = safeParseJson<Partial<IntakeData>>(text, 'extractIntake');
    const arr = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
    // Coerce any field that MUST be a plain string — AI JSON output sometimes
    // returns an object (e.g. {name, role}) here instead of a string, which
    // crashes React with "Objects are not valid as a React child" if rendered
    // directly. Never trust the model's typing; always sanitize before use.
    const str = (v: unknown, fallback = ''): string => {
      if (typeof v === 'string') return v;
      if (v == null) return fallback;
      if (Array.isArray(v)) {
        return v
          .map(item => (typeof item === 'string' ? item : item?.name || item?.event || JSON.stringify(item)))
          .filter(Boolean)
          .join(', ') || fallback;
      }
      if (typeof v === 'object') {
        const obj = v as Record<string, unknown>;
        // Common shapes: {name, role}, {name}, {event, date}
        return String(obj.name || obj.event || obj.title || obj.value || JSON.stringify(obj)) || fallback;
      }
      return String(v) || fallback;
    };
    return {
      fullName: str(data.fullName, 'Prospective Client'),
      contact: str(data.contact),
      email: str(data.email),
      phone: str(data.phone),
      matterType: str(data.matterType, 'General Inquiry'),
      jurisdiction: str(data.jurisdiction),
      summary: str(data.summary),
      detailedNarrative: str(data.detailedNarrative),
      incidentDate: str(data.incidentDate),
      opposingParties: str(data.opposingParties),
      deadlines: str(data.deadlines),
      injuriesOrDamages: str(data.injuriesOrDamages),
      desiredOutcome: str(data.desiredOutcome),
      priorCounsel: str(data.priorCounsel),
      witnesses: str(data.witnesses),
      evidenceMentioned: str(data.evidenceMentioned),
      financialImpact: str(data.financialImpact),
      priorLegalActions: str(data.priorLegalActions),
      emotionalState: str(data.emotionalState),
      keyFacts: arr<string>(data.keyFacts),
      clientQuotes: arr<string>(data.clientQuotes),
      openQuestions: arr<string>(data.openQuestions),
      timeline: arr<{ date: string; event: string }>(data.timeline),
      parties: arr<{ name: string; role: string }>(data.parties),
    };
}, 3);
};

const specialistList = LEGAL_SPECIALISTS.map(
  s => `- id: "${s.id}" — ${s.practiceArea} (${s.title})`
).join('\n');

/**
 * Score the intake for case strength + firm fit, decide a disposition, and route
 * it to the right specialist department. Uses DeepSeek as primary.
 */
export const scoreIntake = async (intake: IntakeData): Promise<IntakeScore> => {
  return retryWithBackoff(async () => {
    const text = await callDeepSeekJson(
      `You are the case evaluation committee for a law firm. Score this intake from 0-100 on overall case strength and firm fit, then route it.

Scoring guidance:
- Strong liability/merits, clear damages, within deadlines, and a viable defendant → high score (75-100).
- Plausible but with weaknesses (unclear liability, modest damages, missing facts) → middle (45-74).
- Weak merits, no viable claim, expired statute of limitations, no damages, or clearly outside what a law firm handles → low (0-44).
- Reward urgency/looming deadlines with attention, but don't inflate a weak case.

Disposition rules (the system applies these benchmarks):
- score >= ${ACCEPT_BENCHMARK} → "accepted"
- score >= ${REVIEW_BENCHMARK} and < ${ACCEPT_BENCHMARK} → "review"
- score < ${REVIEW_BENCHMARK} → "denied"

Route to the single best-fit department by choosing one recommendedAgentId from this list:
${specialistList}

"clientMessage" is shown directly to the prospective client — make it warm, professional, and human:
- accepted: tell them the firm is taking a close look and the relevant team will reach out, reference their matter type.
- review: tell them their matter is under review and someone will follow up.
- denied: kindly explain the firm may not be the right fit, encourage them to seek other counsel promptly.

Return ONLY valid JSON with fields: score, recommendedDepartment, recommendedAgentId, urgency, reasoning, clientMessage, factors[].`,
      `INTAKE RECORD:\n${JSON.stringify(intake, null, 2)}`,
      3000
    );
    const data = safeParseJson<any>(text, 'scoreIntake');
    const rawScore = Math.max(0, Math.min(100, Math.round(Number(data.score) || 0)));
    const disposition =
      rawScore >= ACCEPT_BENCHMARK ? 'accepted' : rawScore >= REVIEW_BENCHMARK ? 'review' : 'denied';

    const matched = LEGAL_SPECIALISTS.find(s => s.id === data.recommendedAgentId);

    return {
      score: rawScore,
      disposition,
      recommendedDepartment:
        data.recommendedDepartment || matched?.practiceArea || 'General Practice',
      recommendedAgentId: matched?.id || 'civil-litigation',
      factors: Array.isArray(data.factors) ? data.factors : [],
      reasoning: data.reasoning || '',
      clientMessage:
        data.clientMessage ||
        'Thank you for sharing your situation with us. Our team will review the details and be in touch.',
      urgency: (data.urgency as IntakeScore['urgency']) || 'medium',
    };
  }, 3);
};
