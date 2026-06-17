
import { GoogleGenAI } from "@google/genai";
import { DocumentType, StrategyInsight, CoachingAnalysis, TrialPhase, SimulationMode } from "../types";
import { retryWithBackoff, withTimeout } from "../utils/errorHandler";
import { deepseekChat, parseDeepSeekJson } from "./deepseek";

// ── Gemini client – kept only for multimodal (audio/image/file) + live ──
const getApiKey = () => {
  const key = import.meta.env.VITE_GEMINI_API_KEY || import.meta.env.VITE_API_KEY || (window as any).__GEMINI_API_KEY || '';
  return key;
};
const createAI = () => new GoogleGenAI({ apiKey: getApiKey() });
<<<<<<< Updated upstream

// Lazy-init: create a fresh GoogleGenAI instance on each call so that if
// the user updates their API key in Settings mid-session, the next call
// picks it up. The old module-scope `const ai = createAI()` would cache
// the key from page load and never refresh.
const getAI = () => createAI();

// Legacy alias — existing call sites use `ai.models.generateContent(…)`.
// This proxy delegates to a fresh instance each time.
const ai = new Proxy({} as GoogleGenAI, {
  get(_target, prop) {
    return (getAI() as any)[prop];
  },
});
=======
const ai = createAI();
const DS_MODEL = 'deepseek-chat';

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Build a JSON schema instruction string for the system prompt. */
const jsonInst = (fields: string) =>
  `Return ONLY valid JSON. No markdown, no explanation.\nExpected structure:\n${fields}`;

/** Ask DeepSeek for structured JSON, parse with fallback. */
async function dsJson<T>(system: string, user: string, temp = 0.3, timeoutMs = 30000): Promise<T> {
  const text = await deepseekChat({
    systemInstruction: `${system}\n\n${jsonInst(typeof ({} as T))}`,
    messages: [{ role: 'user', content: user }],
    temperature: temp,
    maxTokens: 3000,
    jsonMode: true,
    timeoutMs,
  });
  return JSON.parse(text) as T;
}

// ── Multimodal helpers (Gemini only) ─────────────────────────────────────────
>>>>>>> Stashed changes

export const fileToGenerativePart = async (file: File): Promise<{ inlineData: { data: string; mimeType: string } }> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64data = reader.result as string;
      const base64Content = base64data.split(',')[1];
      resolve({
        inlineData: {
          data: base64Content,
          mimeType: file.type,
        },
      });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};

// ── Document analysis ───────────────────────────────────────────────────────

export const analyzeDocument = async (text: string, imagePart?: any) => {
  // Image → keep Gemini
  if (imagePart) {
    return retryWithBackoff(async () => {
      const prompt = `Analyze the following legal document content.
Extract:
1. A concise summary (max 3 sentences).
2. Key legal entities (people, organizations, statutes).
3. A list of potential risks or contradictions found in the text.

Return the response in JSON format.`;

      const parts = [imagePart, { text: prompt + "\n\nDocument Content:\n" + text }];
      const response = await withTimeout(
        ai.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: { parts },
          config: { responseMimeType: "application/json" },
        }),
        30000
      );
      return JSON.parse(response.text || '{}');
    }, 3);
  }

  // Text → DeepSeek
  return dsJson<{ summary: string; entities: string[]; risks: string[] }>(
    'You are a legal document analyst. Extract a concise summary (max 3 sentences), key legal entities (people, organizations, statutes), and a list of potential risks or contradictions.',
    `Document Content:\n${text}\n\nReturn a JSON object with fields: summary (string), entities (string array), risks (string array).`
  );
};

// ── Witness simulation ──────────────────────────────────────────────────────

export const generateWitnessResponse = async (
  history: { role: string; parts: { text: string }[] }[],
  witnessName: string,
  personality: string,
  caseContext: string
): Promise<string> => {
  try {
    let guide = "Answer questions directly and honestly. Provide relevant details you know. Stay calm and professional.";
    if (personality?.toLowerCase().includes('hostile')) {
      guide = "Be evasive and defensive. Give short clipped responses. Say 'I don\\'t recall' frequently. Show frustration.";
    } else if (personality?.toLowerCase().includes('nervous')) {
      guide = "Stutter and use filler words like 'um' and 'uh'. Show uncertainty. Ramble. Contradict yourself slightly.";
    }

    const systemInstruction = `You are a witness named ${witnessName} in a legal trial cross-examination.
${guide}
Case Context: ${caseContext}

CRITICAL RULES:
1. Stay in character at all times. Never break character or acknowledge you are an AI.
2. Keep responses realistic and conversational - typically 1-3 sentences.
3. Respond as a real person would in a courtroom.
4. Show emotional continuity matching your personality type.
5. Make answers specific and contextual.
6. Use appropriate evasion techniques if needed.
7. Use natural speech patterns with imperfections.
8. Maintain consistency with previous answers given in this examination.`;

    const messages = history
      .filter(h => h.role !== 'system')
      .map(h => ({
        role: h.role === 'user' ? 'user' as const : 'assistant' as const,
        content: h.parts.map(p => p.text).join('\n'),
      }));

    const text = await deepseekChat({
      systemInstruction,
      messages,
      temperature: 0.95,
      maxTokens: 300,
      timeoutMs: 20000,
    });
    return text;
  } catch (error) {
    console.error('Witness response error:', error);
    throw new Error(`Witness simulation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
};

// ── Coaching ────────────────────────────────────────────────────────────────

export const generateWitnessCoaching = async (
  userQuestion: string,
  witnessResponse: string,
  witnessName: string,
  personality: string,
  caseContext: string
): Promise<{ suggestion: string; followUp: string; fallback: string }> => {
  try {
    const tactics = personality?.toLowerCase().includes('hostile')
      ? "For hostile witnesses, pin them down with specific facts. Stay cold and methodical. Trap contradictions."
      : personality?.toLowerCase().includes('nervous')
        ? "For nervous witnesses, their anxiety helps you. Follow up on inconsistencies. Give them time to ramble."
        : "For cooperative witnesses, build rapport. Get them to elaborate on helpful details. Use their words.";

    return await dsJson(
      'You are a trial coaching expert. Respond with a JSON object containing "suggestion", "followUp", and "fallback" strings.',
      `Case: ${caseContext}\nWitness: ${witnessName} (${personality})\nTactics: ${tactics}\n\nAttorney asked: "${userQuestion}"\nWitness answered: "${witnessResponse}"\n\nProvide tactical advice: suggestion (2-3 sentences), followUp (next question, 1-2 sentences), fallback (alternative if witness evades, 1-2 sentences).`,
      0.7, 15000
    );
  } catch (error) {
    console.error('Coaching generation error:', error);
    return {
      suggestion: "Consider what the witness revealed and what they avoided saying.",
      followUp: "Follow up with a more specific question to get details.",
      fallback: "If uncooperative, try a different approach or related topic."
    };
  }
};

// ── Strategy ────────────────────────────────────────────────────────────────

export const predictStrategy = async (caseSummary: string, opponentProfile: string): Promise<StrategyInsight[]> => {
  try {
    const result = await dsJson<StrategyInsight[]>(
      'You are a legal strategy analyst. Return a JSON array of 3 objects with fields: title (string), description (string), confidence (number 0-100), type ("risk"|"opportunity"|"prediction").',
      `Case: ${caseSummary}\nOpponent: ${opponentProfile}\n\nProvide 3 strategic insights.`,
      0.7, 30000
    );
    return Array.isArray(result) ? result : [];
  } catch (error) {
    console.error('Strategy prediction error:', error);
    return [];
  }
};

// ── Trial sim system instruction (pure string builder, no API call) ─────────

export const getTrialSimSystemInstruction = (
  phase: TrialPhase, mode: string, opponentName: string, caseSummary: string
): string => {
  const phaseDescriptions: Record<TrialPhase, string> = {
    'pre-trial-motions': 'You are opposing counsel in pre-trial motions. Argue procedural positions.',
    'voir-dire': 'You are the court questioning jurors. Be neutral and probing.',
    'opening-statement': 'You are opposing counsel giving opening. Set your narrative.',
    'direct-examination': 'You are the opposing counsel cross-examining your witness.',
    'cross-examination': 'You are the opposing counsel conducting cross-examination. Be strategic.',
    'defendant-testimony': 'You are the prosecutor. Question the defendant witness.',
    'closing-argument': 'You are opposing counsel. Summarize your case persuasively.',
    'sentencing': 'You are the prosecutor. Argue for appropriate sentence.'
  };
  const modeInstructions: Record<string, string> = {
    'learn': 'Provide helpful coaching. Be educational. Go slowly.',
    'practice': 'Be realistic. Give balanced opposition.',
    'trial': 'Be aggressive. Challenging. No hand-holding.'
  };
  return `You are ${opponentName}, opposing counsel in a trial simulation.
Phase: ${phaseDescriptions[phase]}
Mode: ${modeInstructions[mode] || 'Be realistic'}
Case: ${caseSummary}
Respond naturally. Use tools to provide coaching tips and objections.`;
};

// ── Transcript / OCR / Evidence analysis (Gemini multimodal) ────────────────

export const transcribeAudio = async (audioFile: File): Promise<string> => {
  try {
    const part = await fileToGenerativePart(audioFile);
    const response = await withTimeout(
      ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: {
          parts: [part, {
            text: `Transcribe this audio recording accurately and completely.
If multiple speakers are present, label them as [Speaker 1], [Speaker 2], etc.
Include natural pauses as "..." and note any inaudible portions as [inaudible].
Return only the transcription text, no commentary.`
          }]
        }
      }),
      60000
    );
    return response.text || '';
  } catch (error) {
    throw new Error(`Transcription failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
};

export const performOCR = async (imageOrDocFile: File): Promise<string> => {
  try {
    const part = await fileToGenerativePart(imageOrDocFile);
    const response = await withTimeout(
      ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: {
          parts: [part, {
            text: `Extract and transcribe ALL text visible in this document or image.
Preserve the layout and structure where possible (headers, paragraphs, tables, bullet points).
If this is a legal document, preserve case numbers, dates, signatures, and all formal elements.
Return only the extracted text, faithfully representing the source.`
          }]
        }
      }),
      45000
    );
    return response.text || '';
  } catch (error) {
    throw new Error(`OCR failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
};

// ── Evidence analysis (file → Gemini, text → DeepSeek) ──────────────────────

export const analyzeEvidence = async (
  file: File, caseContext: string
): Promise<{ summary: string; relevance: number; keyFacts: string[]; concerns: string[]; tags: string[] }> => {
  const part = await fileToGenerativePart(file);
  const response = await withTimeout(
    ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: {
        parts: [part, {
          text: `Analyze this evidence file in the context of the following case:
Case Context: ${caseContext}
Extract key facts, assess its relevance (0-100), identify any concerns or weaknesses with this evidence, and suggest tags for organization. Be concise but thorough.`
        }]
      },
      config: { responseMimeType: 'application/json' }
    }),
    30000
  );
  return JSON.parse(response.text || '{}');
};

// ── Pure text functions → DeepSeek ──────────────────────────────────────────

export const generateTrialCoaching = async (
  phase: TrialPhase, userStatement: string, opponentResponse: string
): Promise<CoachingAnalysis> => {
  try {
    return await dsJson<CoachingAnalysis>(
      'You are a trial coaching expert. Return a JSON object with fields: critique, suggestion, sampleResponse, teleprompterScript, fallaciesIdentified (string array), rhetoricalEffectiveness (number 0-100), rhetoricalFeedback.',
      `Phase: ${phase}\nAttorney said: "${userStatement}"\nOpponent responded: "${opponentResponse}"\nProvide detailed coaching feedback.`,
      0.5, 20000
    );
  } catch {
    return { critique: '', suggestion: 'Strong argument. Consider emphasizing your strongest points.', sampleResponse: '', teleprompterScript: '', fallaciesIdentified: [], rhetoricalEffectiveness: 70, rhetoricalFeedback: 'Clear and persuasive.' };
  }
};

export const generateDepositionQuestions = async (
  deponentName: string, deponentRole: string, caseContext: string, strategy: string
): Promise<{ topic: string; questions: string[]; purpose: string }[]> => {
  return dsJson(
    'You are a senior trial attorney preparing for a deposition. Return a JSON array of objects with fields: topic, purpose, questions (string array, 4-8 each). Include foundational, fact, credibility, and closing/commitment topics.',
    `Deponent: ${deponentName} (${deponentRole})\nCase: ${caseContext}\nStrategy: ${strategy}`,
    0.4, 30000
  );
};

export const analyzeJuror = async (
  jurorInfo: string, caseContext: string, caseType: string
): Promise<{
  biasScore: number; biasFactors: string[]; favorableFactors: string[];
  recommendedQuestions: string[]; recommendation: 'accept' | 'challenge-for-cause' | 'peremptory-strike'; reasoning: string;
}> => {
  return dsJson(
    'You are a jury consultant. Return JSON with fields: biasScore (0-100, 0=favorable 100=biased against client), biasFactors (string array), favorableFactors (string array), recommendedQuestions (string array), recommendation ("accept"|"challenge-for-cause"|"peremptory-strike"), reasoning.',
    `Case Type: ${caseType}\nCase: ${caseContext}\nJuror: ${jurorInfo}`,
    0.3, 20000
  );
};

export const generateStatement = async (
  type: 'opening' | 'closing', caseContext: string, theory: string, keyEvidence: string, tone: string
): Promise<{ introduction: string; body: string[]; conclusion: string; fullText: string; talkingPoints: string[] }> => {
  return dsJson(
    'You are an elite trial attorney. Return JSON with: introduction, body (string array of paragraphs), conclusion, fullText, talkingPoints (string array). Make it compelling and jury-friendly.',
    `Type: ${type}\nCase: ${caseContext}\nTheory: ${theory}\nKey Evidence: ${keyEvidence}\nTone: ${tone}`,
    0.5, 30000
  );
};

export const predictVerdictAndSettlement = async (
  caseContext: string, caseType: string, evidenceStrength: number, jurisdiction: string, additionalFactors: string
): Promise<{
  winProbability: number; verdictLikely: string; damagesLow: string; damagesMid: string; damagesHigh: string;
  settlementFloor: string; settlementSweet: string; settlementCeiling: string;
  keyRisks: string[]; keyStrengths: string[]; recommendation: string; timelineEstimate: string;
}> => {
  return dsJson(
    'You are a senior litigation analyst. Return JSON with: winProbability (0-100), verdictLikely, damagesLow, damagesMid, damagesHigh, settlementFloor, settlementSweet, settlementCeiling, keyRisks (string array), keyStrengths (string array), recommendation, timelineEstimate.',
    `Case Type: ${caseType}\nJurisdiction: ${jurisdiction}\nEvidence Strength: ${evidenceStrength}\nCase: ${caseContext}\nFactors: ${additionalFactors}`,
    0.3, 25000
  );
};

export const generateClientUpdate = async (
  caseContext: string, updateType: string, recentDevelopments: string, clientName: string
): Promise<{ subject: string; salutation: string; body: string; closing: string; fullLetter: string }> => {
  return dsJson(
    'You are a senior attorney writing a client update letter. Return JSON with: subject, salutation, body, closing, fullLetter. Use plain language, be direct, include specific next steps.',
    `Client: ${clientName}\nUpdate: ${updateType}\nCase: ${caseContext}\nDevelopments: ${recentDevelopments}`,
    0.4, 20000
  );
};

// ── Specialist consulting (chat with history) ───────────────────────────────

export const consultSpecialist = async (
  specialistSystemInstruction: string,
  history: { role: 'user' | 'model'; parts: { text: string }[] }[],
  newMessage: string,
  caseContext?: string
): Promise<string> => {
  const contextPrefix = caseContext
    ? `\n\nACTIVE CASE CONTEXT (use this to inform your advice):\n${caseContext}\n\n`
    : '';
  const fullInstruction = specialistSystemInstruction + contextPrefix;

  const messages = history.map(h => ({
    role: h.role === 'user' ? 'user' as const : 'assistant' as const,
    content: h.parts.map(p => p.text).join('\n'),
  }));
  messages.push({ role: 'user' as const, content: newMessage });

  return deepseekChat({
    systemInstruction: fullInstruction,
    messages,
    temperature: 0.85,
    maxTokens: 2048,
    timeoutMs: 30000,
  });
};

// ── Witness prep ────────────────────────────────────────────────────────────

export const generateWitnessPrepPackage = async (
  witnessName: string, witnessRole: string, witnessRelationship: string,
  caseContext: string, strategy: string
): Promise<{
  directExam: { topic: string; questions: string[] }[];
  crossExam: { topic: string; questions: string[] }[];
  impeachmentStrategy: string;
  credibilityAssessment: { strengths: string[]; vulnerabilities: string[]; dangerZones: string[]; openingGambit: string; closingQuestion: string };
  overallAssessment: string;
}> => {
  return dsJson(
    'You are a senior trial attorney preparing a witness prep package. Return JSON with: directExam (array of {topic, questions[]}), crossExam (same), impeachmentStrategy (string), credibilityAssessment ({strengths[], vulnerabilities[], dangerZones[], openingGambit, closingQuestion}), overallAssessment.',
    `Witness: ${witnessName} (${witnessRole}, ${witnessRelationship})\nCase: ${caseContext}\nStrategy: ${strategy}`,
    0.4, 45000
  );
};

// ── Jury simulation ─────────────────────────────────────────────────────────

export const simulateJurorReaction = async (
  jurors: { id: number; name: string; background: string; personality: string }[],
  argumentText: string, argumentType: 'opening' | 'evidence' | 'closing' | 'rebuttal', caseContext: string
): Promise<{
  jurorReactions: { id: number; reaction: string; persuasionDelta: number; internalThought: string }[];
  overallImpact: string;
}> => {
  const jurorsDesc = jurors.map(j => `Juror ${j.id} (${j.name}): ${j.background}. Personality: ${j.personality}`).join('\n');
  return dsJson(
    'You are simulating a jury reaction. Return JSON with: jurorReactions (array of {id, reaction, persuasionDelta (-20 to +20), internalThought}), overallImpact.',
    `Case: ${caseContext}\nArgument: "${argumentText}" (${argumentType})\n\nJury:\n${jurorsDesc}`,
    0.7, 30000
  );
};

export const runJuryDeliberation = async (
  jurors: { id: number; name: string; background: string; personality: string; persuasionLevel: number }[],
  caseContext: string, evidenceSummary: string
): Promise<{
  deliberationExchanges: { jurorId: number; jurorName: string; statement: string }[];
  finalVote: { guilty: number; notGuilty: number; undecided: number };
  verdict: string; verdictConfidence: number; keyFactors: string[];
}> => {
  const jurorsDesc = jurors.map(j =>
    `Juror ${j.id} (${j.name}): ${j.background}. Personality: ${j.personality}. Persuasion: ${j.persuasionLevel}/100`
  ).join('\n');
  return dsJson(
    'You are simulating a realistic jury deliberation. Return JSON with: deliberationExchanges (8-12 entries of {jurorId, jurorName, statement}), finalVote ({guilty, notGuilty, undecided}), verdict ("guilty"|"not guilty"|"hung"), verdictConfidence (0-100), keyFactors (string array).',
    `Case: ${caseContext}\nEvidence: ${evidenceSummary}\n\nJury:\n${jurorsDesc}`,
    0.7, 45000
  );
};

<<<<<<< Updated upstream
export const askCopilot = async (
  question: string,
  history: { role: 'user' | 'model'; text: string }[],
  caseContext?: string
): Promise<string> => {
  return retryWithBackoff(async () => {
    const contextBlock = caseContext
      ? `\n\nACTIVE CASE CONTEXT (ground your answers in this when relevant):\n${caseContext}\n`
      : '\n\nNo active case is currently selected. Answer generally and suggest the attorney select a case for tailored advice.\n';

    const systemInstruction =
      "You are the CaseBuddy Legal Copilot, a senior litigation partner AI. You help attorneys with case strategy, legal questions, drafting, and analysis. Be concise, practical, and tactical. When a case context is provided, ground your answers in it. Always note when something needs attorney review or jurisdiction-specific verification." +
      contextBlock;

    const chat = ai.chats.create({
      model: 'gemini-2.5-flash',
      config: {
        systemInstruction,
        temperature: 0.7,
      },
      history: history.map(h => ({
        role: h.role,
        parts: [{ text: h.text }],
      })),
    });

    const response = await withTimeout(
      chat.sendMessage({ message: question }),
      30000
    );

    if (!response.text) throw new Error('Empty response from Legal Copilot');
    return response.text;
  }, 3);
};

export async function* askCopilotStream(
  question: string,
  history: { role: 'user' | 'model'; text: string }[],
  caseContext?: string
): AsyncGenerator<string> {
  const contextBlock = caseContext
    ? `\n\nACTIVE CASE CONTEXT (ground your answers in this when relevant):\n${caseContext}\n`
    : '\n\nNo active case is currently selected. Answer generally and suggest the attorney select a case for tailored advice.\n';

  const systemInstruction =
    "You are the CaseBuddy Legal Copilot, a senior litigation partner AI. You help attorneys with case strategy, legal questions, drafting, and analysis. Be concise, practical, and tactical. When a case context is provided, ground your answers in it. Always note when something needs attorney review or jurisdiction-specific verification." +
    contextBlock;

  const chat = ai.chats.create({
    model: 'gemini-2.5-flash',
    config: { systemInstruction, temperature: 0.7 },
    history: history.map(h => ({ role: h.role, parts: [{ text: h.text }] })),
  });

  const stream = await chat.sendMessageStream({ message: question });
  for await (const chunk of stream) {
    if (chunk.text) yield chunk.text;
  }
}
=======
// ── Transcript analysis (text only → DeepSeek) ─────────────────────────────
>>>>>>> Stashed changes

export const analyzeTranscription = async (
  transcriptText: string, caseContext: string, fileName: string
): Promise<{ summary: string; keyPoints: string[]; legalIssues: string[]; speakers: string[]; actionItems: string[] }> => {
  try {
    return await dsJson(
      'You are a legal AI assistant. Return JSON with: summary (3-5 sentences), keyPoints (string array), legalIssues (string array), speakers (string array), actionItems (string array).',
      `Case: ${caseContext}\nDocument: ${fileName}\n\nTranscript:\n${transcriptText}`,
      0.3, 30000
    );
  } catch (error) {
    throw new Error(`Analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
};

// ─── War Room Briefing ────────────────────────────────────────────────────────

export interface WarRoomTask {
  id: string;
  title: string;
  description: string;
  category: 'pre-trial' | 'discovery' | 'witnesses' | 'jury' | 'evidence' | 'drafting' | 'strategy';
  priority: 'critical' | 'high' | 'medium' | 'low';
  agent: string;
  done: boolean;
}

export interface WarRoomBriefing {
  tasks: WarRoomTask[];
  riskLevel: 'critical' | 'elevated' | 'moderate' | 'low';
  keyRisks: string[];
  topPriority: string;
  estimatedTrialReadiness: number;
}

export const generateWarRoomBriefing = async (
  caseTitle: string,
  caseSummary: string,
  caseStatus: string,
  nextCourtDate: string,
): Promise<WarRoomBriefing> => {
  return retryWithBackoff(async () => {
    const prompt = `You are a senior trial attorney conducting a War Room briefing for the following case.

Case: ${caseTitle}
Status: ${caseStatus}
Next Court Date: ${nextCourtDate || 'Not set'}
Summary: ${caseSummary || 'No summary provided'}

Generate a comprehensive trial preparation briefing including:
1. 15-25 specific, actionable preparation tasks organized by category
2. Priority level for each task (critical, high, medium, low)
3. Which AI agent should handle each task (maya, lex, doc, rex, sol, jules, sierra, max)
4. Overall case risk level
5. Top 3-5 key risks that could derail the case
6. The single most important thing to do first
7. Trial readiness percentage (0-100)

Categories: pre-trial (motions, hearings), discovery (depositions, document requests), witnesses (prep, cross strategy), jury (analysis, simulator), evidence (organization, authentication), drafting (motions, briefs, letters), strategy (overall planning)

Be specific and practical — these are real tasks the attorney needs to execute.`;

    const response = await withTimeout(
      ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              tasks: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    id: { type: Type.STRING },
                    title: { type: Type.STRING },
                    description: { type: Type.STRING },
                    category: { type: Type.STRING },
                    priority: { type: Type.STRING },
                    agent: { type: Type.STRING },
                    done: { type: Type.BOOLEAN },
                  },
                  required: ['id', 'title', 'description', 'category', 'priority', 'agent', 'done'],
                },
              },
              riskLevel: { type: Type.STRING },
              keyRisks: { type: Type.ARRAY, items: { type: Type.STRING } },
              topPriority: { type: Type.STRING },
              estimatedTrialReadiness: { type: Type.NUMBER },
            },
            required: ['tasks', 'riskLevel', 'keyRisks', 'topPriority', 'estimatedTrialReadiness'],
          },
        },
      }),
      45000
    );

    const parsed = JSON.parse(response.text || '{}') as WarRoomBriefing;
    // Ensure each task has a unique id and done=false by default
    parsed.tasks = parsed.tasks.map((t, i) => ({ ...t, id: t.id || `task-${i}`, done: false }));
    return parsed;
  });
};

