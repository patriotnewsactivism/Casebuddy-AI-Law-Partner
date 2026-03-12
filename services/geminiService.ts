
import { GoogleGenAI, Type } from "@google/genai";
import { DocumentType, StrategyInsight, CoachingAnalysis, TrialPhase, SimulationMode } from "../types";
import { retryWithBackoff, withTimeout } from "../utils/errorHandler";

const getApiKey = () => {
  const key = import.meta.env.VITE_GEMINI_API_KEY || import.meta.env.VITE_API_KEY || (window as any).__GEMINI_API_KEY || '';
  return key;
};

const createAI = () => new GoogleGenAI({ apiKey: getApiKey() });
const ai = createAI();

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

export const analyzeDocument = async (text: string, imagePart?: any) => {
  return retryWithBackoff(async () => {
    const model = 'gemini-2.5-flash';
    const prompt = `Analyze the following legal document content.
    Extract:
    1. A concise summary (max 3 sentences).
    2. Key legal entities (people, organizations, statutes).
    3. A list of potential risks or contradictions found in the text.

    Return the response in JSON format.
    `;

    const parts = [];
    if (imagePart) parts.push(imagePart);
    parts.push({ text: prompt + "\n\nDocument Content:\n" + text });

    const response = await withTimeout(
      ai.models.generateContent({
        model: model,
        contents: { parts },
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              summary: { type: Type.STRING },
              entities: { type: Type.ARRAY, items: { type: Type.STRING } },
              risks: { type: Type.ARRAY, items: { type: Type.STRING } }
            }
          }
        }
      }),
      30000
    );

    return JSON.parse(response.text || '{}');
  }, 3);
};

export const generateWitnessResponse = async (
  history: { role: string, parts: { text: string }[] }[],
  witnessName: string,
  personality: string,
  caseContext: string
) => {
  try {
    let guide = "Answer questions directly and honestly. Provide relevant details you know. Stay calm and professional.";
    if (personality && personality.toLowerCase().includes('hostile')) {
      guide = "Be evasive and defensive. Give short clipped responses. Say 'I don\\'t recall' frequently. Show frustration.";
    } else if (personality && personality.toLowerCase().includes('nervous')) {
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

    const chat = ai.chats.create({
      model: 'gemini-2.5-flash',
      config: {
        systemInstruction,
        temperature: 0.95,
      },
      history: history.map(h => ({
        role: h.role === 'user' ? 'user' : 'model',
        parts: h.parts
      }))
    });

    const lastMessage = history[history.length - 1].parts[0].text;
    const response = await withTimeout(
      chat.sendMessage({ message: lastMessage }),
      20000
    );

    if (!response.text) {
      throw new Error('Empty response from witness');
    }

    return response.text;

  } catch (error) {
    console.error('Witness response error:', error);
    throw new Error(`Witness simulation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
};

export const generateWitnessCoaching = async (
  userQuestion: string,
  witnessResponse: string,
  witnessName: string,
  personality: string,
  caseContext: string
): Promise<{ suggestion: string; followUp: string; fallback: string }> => {
  try {
    const tactics = personality && personality.toLowerCase().includes('hostile') 
      ? "For hostile witnesses, pin them down with specific facts. Stay cold and methodical. Trap contradictions."
      : personality && personality.toLowerCase().includes('nervous')
      ? "For nervous witnesses, their anxiety helps you. Follow up on inconsistencies. Give them time to ramble."
      : "For cooperative witnesses, build rapport. Get them to elaborate on helpful details. Use their words.";

    const response = await withTimeout(
      ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: `You are a trial coaching expert. Analyze this cross-examination moment.

Case: ${caseContext}
Witness: ${witnessName} (${personality})
Tactics: ${tactics}

Attorney asked: "${userQuestion}"
Witness answered: "${witnessResponse}"

Provide JSON response with:
1. "suggestion": Tactical advice on responding to this answer (2-3 sentences)
2. "followUp": Next specific question to ask (1-2 sentences)
3. "fallback": Alternative question if witness evades (1-2 sentences)

Return ONLY valid JSON, no markdown.`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              suggestion: { type: Type.STRING },
              followUp: { type: Type.STRING },
              fallback: { type: Type.STRING }
            },
            required: ['suggestion', 'followUp', 'fallback']
          }
        }
      }),
      15000
    );

    const parsed = JSON.parse(response.text || '{}');
    return {
      suggestion: parsed.suggestion || "Analyze what the witness revealed and what they evaded.",
      followUp: parsed.followUp || "Ask a more specific follow-up question.",
      fallback: parsed.fallback || "Try approaching from a different angle if they won't answer."
    };
  } catch (error) {
    console.error('Coaching generation error:', error);
    return {
      suggestion: "Consider what the witness revealed and what they avoided saying.",
      followUp: "Follow up with a more specific question to get details.",
      fallback: "If uncooperative, try a different approach or related topic."
    };
  }
};

export const predictStrategy = async (caseSummary: string, opponentProfile: string): Promise<StrategyInsight[]> => {
  try {
    const response = await withTimeout(
      ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: `Analyze this legal case and provide strategic insights.

Case: ${caseSummary}
Opponent: ${opponentProfile}

Provide 3 strategic insights (Risks, Opportunities, or Predictions) in JSON format.`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                title: { type: Type.STRING },
                description: { type: Type.STRING },
                confidence: { type: Type.NUMBER },
                type: { type: Type.STRING, enum: ['risk', 'opportunity', 'prediction'] }
              }
            }
          }
        }
      }),
      30000
    );

    return JSON.parse(response.text || '[]');
  } catch (error) {
    console.error('Strategy prediction error:', error);
    return [];
  }
};

export const getTrialSimSystemInstruction = (
  phase: TrialPhase,
  mode: string,
  opponentName: string,
  caseSummary: string
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

export const generateTrialCoaching = async (
  phase: TrialPhase,
  userStatement: string,
  opponentResponse: string
): Promise<CoachingAnalysis> => {
  try {
    const response = await withTimeout(
      ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: `You are a trial coaching expert analyzing an attorney's trial performance.

Phase: ${phase}
Attorney said: "${userStatement}"
Opponent responded: "${opponentResponse}"

Provide detailed coaching feedback in JSON.`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              critique: { type: Type.STRING },
              suggestion: { type: Type.STRING },
              sampleResponse: { type: Type.STRING },
              teleprompterScript: { type: Type.STRING },
              fallaciesIdentified: { type: Type.ARRAY, items: { type: Type.STRING } },
              rhetoricalEffectiveness: { type: Type.NUMBER },
              rhetoricalFeedback: { type: Type.STRING }
            }
          }
        }
      }),
      20000
    );

    const data = JSON.parse(response.text || '{}');
    return {
      critique: data.critique || '',
      suggestion: data.suggestion || '',
      sampleResponse: data.sampleResponse || '',
      teleprompterScript: data.teleprompterScript || '',
      fallaciesIdentified: data.fallaciesIdentified || [],
      rhetoricalEffectiveness: data.rhetoricalEffectiveness || 50,
      rhetoricalFeedback: data.rhetoricalFeedback || ''
    };
  } catch (error) {
    return {
      critique: '',
      suggestion: 'Strong argument. Consider emphasizing your strongest points.',
      sampleResponse: '',
      teleprompterScript: '',
      fallaciesIdentified: [],
      rhetoricalEffectiveness: 70,
      rhetoricalFeedback: 'Clear and persuasive.'
    };
  }
};

export const transcribeAudio = async (audioFile: File): Promise<string> => {
  try {
    const part = await fileToGenerativePart(audioFile);
    const response = await withTimeout(
      ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: {
          parts: [
            part,
            { text: `Transcribe this audio recording accurately and completely. 
If multiple speakers are present, label them as [Speaker 1], [Speaker 2], etc.
Include natural pauses as "..." and note any inaudible portions as [inaudible].
Return only the transcription text, no commentary.` }
          ]
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
          parts: [
            part,
            { text: `Extract and transcribe ALL text visible in this document or image.
Preserve the layout and structure where possible (headers, paragraphs, tables, bullet points).
If this is a legal document, preserve case numbers, dates, signatures, and all formal elements.
Return only the extracted text, faithfully representing the source.` }
          ]
        }
      }),
      45000
    );
    return response.text || '';
  } catch (error) {
    throw new Error(`OCR failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
};

export const generateDepositionQuestions = async (
  deponentName: string,
  deponentRole: string,
  caseContext: string,
  strategy: string
): Promise<{ topic: string; questions: string[]; purpose: string }[]> => {
  const response = await withTimeout(
    ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: `You are a seasoned trial attorney preparing for a deposition.

Deponent: ${deponentName} (${deponentRole})
Case: ${caseContext}
Strategy: ${strategy}

Generate a comprehensive deposition question outline organized by topic. Include foundational/background questions, fact questions, credibility questions, and closing/commitment questions. Each topic should have 4-8 specific questions.`,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              topic: { type: Type.STRING },
              purpose: { type: Type.STRING },
              questions: { type: Type.ARRAY, items: { type: Type.STRING } }
            },
            required: ['topic', 'purpose', 'questions']
          }
        }
      }
    }),
    30000
  );
  return JSON.parse(response.text || '[]');
};

export const analyzeJuror = async (
  jurorInfo: string,
  caseContext: string,
  caseType: string
): Promise<{
  biasScore: number;
  biasFactors: string[];
  favorableFactors: string[];
  recommendedQuestions: string[];
  recommendation: 'accept' | 'challenge-for-cause' | 'peremptory-strike';
  reasoning: string;
}> => {
  const response = await withTimeout(
    ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: `You are a jury consultant analyzing a potential juror for defense/plaintiff counsel.

Case Type: ${caseType}
Case Context: ${caseContext}
Juror Profile: ${jurorInfo}

Analyze this juror for potential bias, favorable/unfavorable factors, and provide a strike recommendation. Bias score: 0 = strongly favorable, 100 = strongly unfavorable/biased against client.`,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            biasScore: { type: Type.NUMBER },
            biasFactors: { type: Type.ARRAY, items: { type: Type.STRING } },
            favorableFactors: { type: Type.ARRAY, items: { type: Type.STRING } },
            recommendedQuestions: { type: Type.ARRAY, items: { type: Type.STRING } },
            recommendation: { type: Type.STRING, enum: ['accept', 'challenge-for-cause', 'peremptory-strike'] },
            reasoning: { type: Type.STRING }
          },
          required: ['biasScore', 'biasFactors', 'favorableFactors', 'recommendedQuestions', 'recommendation', 'reasoning']
        }
      }
    }),
    20000
  );
  return JSON.parse(response.text || '{}');
};

export const generateStatement = async (
  type: 'opening' | 'closing',
  caseContext: string,
  theory: string,
  keyEvidence: string,
  tone: string
): Promise<{ introduction: string; body: string[]; conclusion: string; fullText: string; talkingPoints: string[] }> => {
  const response = await withTimeout(
    ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: `You are an elite trial attorney crafting a powerful ${type} statement.

Case: ${caseContext}
Theory of the Case: ${theory}
Key Evidence/Facts: ${keyEvidence}
Tone: ${tone}

Write a compelling, jury-friendly ${type} statement. Structure it with a strong hook introduction, organized body paragraphs, and a memorable conclusion. Also provide a bulleted list of key talking points.`,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            introduction: { type: Type.STRING },
            body: { type: Type.ARRAY, items: { type: Type.STRING } },
            conclusion: { type: Type.STRING },
            fullText: { type: Type.STRING },
            talkingPoints: { type: Type.ARRAY, items: { type: Type.STRING } }
          },
          required: ['introduction', 'body', 'conclusion', 'fullText', 'talkingPoints']
        }
      }
    }),
    30000
  );
  return JSON.parse(response.text || '{}');
};

export const predictVerdictAndSettlement = async (
  caseContext: string,
  caseType: string,
  evidenceStrength: number,
  jurisdiction: string,
  additionalFactors: string
): Promise<{
  winProbability: number;
  verdictLikely: string;
  damagesLow: string;
  damagesMid: string;
  damagesHigh: string;
  settlementFloor: string;
  settlementSweet: string;
  settlementCeiling: string;
  keyRisks: string[];
  keyStrengths: string[];
  recommendation: string;
  timelineEstimate: string;
}> => {
  const response = await withTimeout(
    ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: `You are a senior litigation analyst providing a case outcome prediction.

Case Type: ${caseType}
Jurisdiction: ${jurisdiction}
Evidence Strength (0-100): ${evidenceStrength}
Case Summary: ${caseContext}
Additional Factors: ${additionalFactors}

Provide a detailed outcome analysis including win probability, verdict prediction, damages range (if applicable), settlement recommendations, and strategic recommendation. Be realistic and data-driven.`,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            winProbability: { type: Type.NUMBER },
            verdictLikely: { type: Type.STRING },
            damagesLow: { type: Type.STRING },
            damagesMid: { type: Type.STRING },
            damagesHigh: { type: Type.STRING },
            settlementFloor: { type: Type.STRING },
            settlementSweet: { type: Type.STRING },
            settlementCeiling: { type: Type.STRING },
            keyRisks: { type: Type.ARRAY, items: { type: Type.STRING } },
            keyStrengths: { type: Type.ARRAY, items: { type: Type.STRING } },
            recommendation: { type: Type.STRING },
            timelineEstimate: { type: Type.STRING }
          },
          required: ['winProbability', 'verdictLikely', 'keyRisks', 'keyStrengths', 'recommendation', 'settlementFloor', 'settlementSweet', 'settlementCeiling']
        }
      }
    }),
    25000
  );
  return JSON.parse(response.text || '{}');
};

export const generateClientUpdate = async (
  caseContext: string,
  updateType: string,
  recentDevelopments: string,
  clientName: string
): Promise<{ subject: string; salutation: string; body: string; closing: string; fullLetter: string }> => {
  const response = await withTimeout(
    ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: `You are a senior attorney writing a professional client update letter.

Client: ${clientName}
Update Type: ${updateType}
Case: ${caseContext}
Recent Developments: ${recentDevelopments}

Write a professional, clear, and reassuring client letter. Use plain language (avoid excessive legal jargon). Be direct about the situation. Include specific next steps. Maintain attorney-client privilege tone.`,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            subject: { type: Type.STRING },
            salutation: { type: Type.STRING },
            body: { type: Type.STRING },
            closing: { type: Type.STRING },
            fullLetter: { type: Type.STRING }
          },
          required: ['subject', 'salutation', 'body', 'closing', 'fullLetter']
        }
      }
    }),
    20000
  );
  return JSON.parse(response.text || '{}');
};

export const analyzeEvidence = async (
  file: File,
  caseContext: string
): Promise<{ summary: string; relevance: number; keyFacts: string[]; concerns: string[]; tags: string[] }> => {
  const part = await fileToGenerativePart(file);
  const response = await withTimeout(
    ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: {
        parts: [
          part,
          { text: `Analyze this evidence file in the context of the following case:

Case Context: ${caseContext}

Extract key facts, assess its relevance (0-100), identify any concerns or weaknesses with this evidence, and suggest tags for organization. Be concise but thorough.` }
        ]
      },
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            summary: { type: Type.STRING },
            relevance: { type: Type.NUMBER },
            keyFacts: { type: Type.ARRAY, items: { type: Type.STRING } },
            concerns: { type: Type.ARRAY, items: { type: Type.STRING } },
            tags: { type: Type.ARRAY, items: { type: Type.STRING } }
          },
          required: ['summary', 'relevance', 'keyFacts', 'concerns', 'tags']
        }
      }
    }),
    30000
  );
  return JSON.parse(response.text || '{}');
};

export const analyzeTranscription = async (
  transcriptText: string,
  caseContext: string,
  fileName: string
): Promise<{ summary: string; keyPoints: string[]; legalIssues: string[]; speakers: string[]; actionItems: string[] }> => {
  try {
    const response = await withTimeout(
      ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: `You are a legal AI assistant. Analyze this transcript in the context of the given case.

Case Context: ${caseContext}
Document: ${fileName}

TRANSCRIPT:
${transcriptText}

Provide a thorough legal analysis as JSON.`,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              summary: { type: Type.STRING, description: 'Executive summary of the transcript (3-5 sentences)' },
              keyPoints: { type: Type.ARRAY, items: { type: Type.STRING }, description: 'Key facts or statements relevant to the case' },
              legalIssues: { type: Type.ARRAY, items: { type: Type.STRING }, description: 'Legal issues, risks, or concerns identified' },
              speakers: { type: Type.ARRAY, items: { type: Type.STRING }, description: 'Identified speakers if detectable' },
              actionItems: { type: Type.ARRAY, items: { type: Type.STRING }, description: 'Recommended follow-up actions for the attorney' },
            },
            required: ['summary', 'keyPoints', 'legalIssues', 'speakers', 'actionItems']
          }
        }
      }),
      30000
    );
    return JSON.parse(response.text || '{}');
  } catch (error) {
    throw new Error(`Analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
};
