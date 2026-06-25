import { GoogleGenAI, Type } from '@google/genai';
import { getGeminiKey } from './runtimeKeys';
import { IntakeData, IntakeScore } from '../types';
import { LEGAL_SPECIALISTS } from '../agents/personas';
import { retryWithBackoff, withTimeout } from '../utils/errorHandler';

// Intake AI calls go through the server-side proxy (/api/ai/gemini), which holds
// the GEMINI_API_KEY. This keeps the key out of the browser and avoids depending
// on a per-session client key that may be missing or restricted — the cause of
// intakes silently failing at the extraction step. If the proxy isn't reachable
// (e.g. a host without the edge function) we fall back to a direct browser call,
// but only when a runtime key is actually available.
const callGeminiProxy = async (params: {
  model: string;
  contents: unknown;
  config?: unknown;
}): Promise<string> => {
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
    throw new Error(message);
  }
  const data: any = await resp.json();
  const text: string = (data?.candidates?.[0]?.content?.parts ?? [])
    .map((p: any) => p?.text ?? '')
    .join('')
    .trim();
  if (!text) throw new Error('Gemini proxy returned an empty response');
  return text;
};

const generateStructured = async (params: {
  model: string;
  contents: any;
  config: any;
}): Promise<string> => {
  try {
    return await callGeminiProxy(params);
  } catch (proxyError) {
    // Fall back to a direct browser call only if we actually have a key to use.
    const key = getGeminiKey();
    if (!key) throw proxyError;
    const response = await new GoogleGenAI({ apiKey: key }).models.generateContent(params);
    const text = response.text;
    if (!text) throw proxyError;
    return text;
  }
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
 * Parse a model's JSON response defensively. Models occasionally wrap JSON in
 * markdown fences or emit a trailing note even under responseMimeType:json, and
 * a truncated response yields invalid JSON. For an intake — where a silent parse
 * failure means a client's entire story is lost — we strip fences, try to
 * recover the outermost JSON object, and THROW on real failure so retryWithBackoff
 * gets another attempt instead of persisting an empty record.
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
    // Last resort: grab the first '{' … last '}' span and try that.
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
 */
export const extractIntake = async (transcript: Turn[]): Promise<IntakeData> => {
  const convo = transcriptToText(transcript);
  return retryWithBackoff(async () => {
    const text = await withTimeout(
      generateStructured({
        // Pro, not Flash: this is the firm's case report. Pro captures more
        // detail from a long, rambling call and is far less prone to inventing
        // facts that weren't said.
        model: 'gemini-2.5-pro',
        contents: {
          parts: [
            {
              text: `You are the senior intake analyst for a law firm. Read the full intake call between MAYA (the firm's intake specialist) and a prospective CLIENT, and produce a thorough, faithful case report the attorneys can act on.

ABSOLUTE RULE — NO HALLUCINATION:
- Every single field must be grounded in what the CLIENT actually said in this transcript. Do NOT infer, assume, embellish, or fill gaps with plausible-sounding detail.
- If a detail was not stated, leave that field empty ("" or []). Never guess a date, a dollar amount, a name, or a legal conclusion that the client did not give.
- Do not diagnose the legal merits or state law. You are recording their story accurately, not advising.
- Prefer the client's own words. When you quote, quote exactly.

CAPTURE EVERYTHING — this caller may be long-winded, upset, or out of order. Pull every concrete detail out of the whole conversation, not just the last few turns. Losing information is a serious failure.

FIELD GUIDANCE:
- "summary": ONE tight sentence for a list view.
- "detailedNarrative": a complete, well-organized factual write-up (multiple short paragraphs) of what happened, in plain English, strictly from what the client said. This is the heart of the report — be thorough.
- "keyFacts": the concrete facts the client stated, each as its own short bullet.
- "timeline": events in chronological order with whatever date/time reference the client gave ("last March", "the next morning") — leave date empty if they didn't say.
- "parties": every person or entity named, with their role ("landlord", "the other driver", "my employer").
- "clientQuotes": a few short, exact verbatim quotes in the client's own words that capture the matter.
- "openQuestions": important things that are still unknown or unclear and the firm should follow up on. THIS is where uncertainty goes — list the gap here instead of inventing an answer.
- "matterType": the legal practice area in plain English (e.g. "Personal Injury", "Criminal Defense", "Family Law", "Employment", "Immigration", "Landlord-Tenant / Real Estate", "Civil Rights", "Contract Dispute"). If genuinely unclear, give your best single-label guess and note the uncertainty in openQuestions.

CONVERSATION:
${convo}`,
            },
          ],
        },
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              fullName: { type: Type.STRING },
              contact: { type: Type.STRING },
              matterType: { type: Type.STRING },
              jurisdiction: { type: Type.STRING },
              summary: { type: Type.STRING },
              detailedNarrative: { type: Type.STRING },
              incidentDate: { type: Type.STRING },
              opposingParties: { type: Type.STRING },
              deadlines: { type: Type.STRING },
              injuriesOrDamages: { type: Type.STRING },
              desiredOutcome: { type: Type.STRING },
              priorCounsel: { type: Type.STRING },
              witnesses: { type: Type.STRING },
              evidenceMentioned: { type: Type.STRING },
              financialImpact: { type: Type.STRING },
              priorLegalActions: { type: Type.STRING },
              emotionalState: { type: Type.STRING },
              keyFacts: { type: Type.ARRAY, items: { type: Type.STRING } },
              clientQuotes: { type: Type.ARRAY, items: { type: Type.STRING } },
              openQuestions: { type: Type.ARRAY, items: { type: Type.STRING } },
              timeline: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    date: { type: Type.STRING },
                    event: { type: Type.STRING },
                  },
                  required: ['event'],
                },
              },
              parties: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    name: { type: Type.STRING },
                    role: { type: Type.STRING },
                  },
                  required: ['name'],
                },
              },
            },
            required: ['fullName', 'matterType', 'summary', 'detailedNarrative'],
          },
        },
      }),
      45000
    );
    const data = safeParseJson<Partial<IntakeData>>(text, 'extractIntake');
    const arr = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
    return {
      fullName: data.fullName || 'Prospective Client',
      contact: data.contact || '',
      matterType: data.matterType || 'General Inquiry',
      jurisdiction: data.jurisdiction || '',
      summary: data.summary || '',
      detailedNarrative: data.detailedNarrative || '',
      incidentDate: data.incidentDate || '',
      opposingParties: data.opposingParties || '',
      deadlines: data.deadlines || '',
      injuriesOrDamages: data.injuriesOrDamages || '',
      desiredOutcome: data.desiredOutcome || '',
      priorCounsel: data.priorCounsel || '',
      witnesses: data.witnesses || '',
      evidenceMentioned: data.evidenceMentioned || '',
      financialImpact: data.financialImpact || '',
      priorLegalActions: data.priorLegalActions || '',
      emotionalState: data.emotionalState || '',
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
 * it to the right specialist department.
 */
export const scoreIntake = async (intake: IntakeData): Promise<IntakeScore> => {
  return retryWithBackoff(async () => {
    const text = await withTimeout(
      generateStructured({
        model: 'gemini-2.5-flash',
        contents: {
          parts: [
            {
              text: `You are the case evaluation committee for a law firm. Score this intake from 0-100 on overall case strength and firm fit, then route it.

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
- denied: kindly explain the firm may not be the right fit, encourage them to seek other counsel promptly (especially if deadlines apply), and stay respectful and supportive. Never be cold or dismissive.

INTAKE RECORD:
${JSON.stringify(intake, null, 2)}`,
            },
          ],
        },
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              score: { type: Type.NUMBER },
              recommendedDepartment: { type: Type.STRING },
              recommendedAgentId: { type: Type.STRING },
              urgency: { type: Type.STRING, enum: ['low', 'medium', 'high'] },
              reasoning: { type: Type.STRING },
              clientMessage: { type: Type.STRING },
              factors: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    label: { type: Type.STRING },
                    impact: { type: Type.STRING, enum: ['positive', 'negative', 'neutral'] },
                    note: { type: Type.STRING },
                  },
                  required: ['label', 'impact'],
                },
              },
            },
            required: ['score', 'recommendedAgentId', 'clientMessage', 'urgency'],
          },
        },
      }),
      30000
    );
    const data = safeParseJson<any>(text, 'scoreIntake');
    const rawScore = Math.max(0, Math.min(100, Math.round(Number(data.score) || 0)));
    const disposition =
      rawScore >= ACCEPT_BENCHMARK ? 'accepted' : rawScore >= REVIEW_BENCHMARK ? 'review' : 'denied';

    // Resolve the routed specialist (fall back gracefully if the model picked an unknown id).
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
