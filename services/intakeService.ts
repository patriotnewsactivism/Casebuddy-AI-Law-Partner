import { GoogleGenAI, Type } from '@google/genai';
import { IntakeData, IntakeScore } from '../types';
import { LEGAL_SPECIALISTS } from '../agents/personas';
import { retryWithBackoff, withTimeout } from '../utils/errorHandler';

const getApiKey = () =>
  import.meta.env.VITE_GEMINI_API_KEY || import.meta.env.VITE_API_KEY || (window as any).__GEMINI_API_KEY || '';

const ai = new GoogleGenAI({ apiKey: getApiKey() });

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
 * Distill a free-form intake conversation into a structured IntakeData record.
 */
export const extractIntake = async (transcript: Turn[]): Promise<IntakeData> => {
  const convo = transcriptToText(transcript);
  return retryWithBackoff(async () => {
    const response = await withTimeout(
      ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: {
          parts: [
            {
              text: `You are the intake processor for a law firm. Read the following intake conversation between MAYA (the firm's intake specialist) and a prospective CLIENT. Extract the facts into a structured record.

Rules:
- Use the client's own words where possible. Be concise.
- If something was never discussed, use an empty string "" — never invent facts.
- "matterType" should be the legal practice area in plain English (e.g. "Personal Injury", "Criminal Defense", "Family Law", "Employment", "Immigration", "Landlord-Tenant / Real Estate", "Civil Rights", "Contract Dispute"). If unclear, give your best single-label guess.

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
              incidentDate: { type: Type.STRING },
              opposingParties: { type: Type.STRING },
              deadlines: { type: Type.STRING },
              injuriesOrDamages: { type: Type.STRING },
              desiredOutcome: { type: Type.STRING },
              priorCounsel: { type: Type.STRING },
            },
            required: ['fullName', 'matterType', 'summary'],
          },
        },
      }),
      30000
    );
    const data = JSON.parse(response.text || '{}');
    return {
      fullName: data.fullName || 'Prospective Client',
      contact: data.contact || '',
      matterType: data.matterType || 'General Inquiry',
      jurisdiction: data.jurisdiction || '',
      summary: data.summary || '',
      incidentDate: data.incidentDate || '',
      opposingParties: data.opposingParties || '',
      deadlines: data.deadlines || '',
      injuriesOrDamages: data.injuriesOrDamages || '',
      desiredOutcome: data.desiredOutcome || '',
      priorCounsel: data.priorCounsel || '',
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
    const response = await withTimeout(
      ai.models.generateContent({
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
    const data = JSON.parse(response.text || '{}');
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
