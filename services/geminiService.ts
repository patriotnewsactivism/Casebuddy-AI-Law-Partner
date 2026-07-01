import { GoogleGenAI } from "@google/genai";
import { DocumentType, StrategyInsight, CoachingAnalysis, TrialPhase, SimulationMode, WarRoomBriefing, WarRoomTask, Message } from "../types";
import { retryWithBackoff, withTimeout } from "../utils/errorHandler";
import { deepseekChat, parseDeepSeekJson } from "./deepseek";

const getApiKey = () => {
  const key = import.meta.env.VITE_GEMINI_API_KEY || import.meta.env.VITE_API_KEY || (window as any).__GEMINI_API_KEY || '';
  return key;
};
const createAI = () => new GoogleGenAI({ apiKey: getApiKey() });

const getAI = () => createAI();
const ai = new Proxy({} as GoogleGenAI, {
  get(_target, prop) { return (getAI() as any)[prop]; },
});

// ── Helpers ──────────────────────────────────────────────────────────────────

const jsonInst = (fields: string) =>
  `Return ONLY valid JSON. No markdown, no explanation.\nExpected structure:\n${fields}`;

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

export const fileToGenerativePart = async (file: File): Promise<{ inlineData: { data: string; mimeType: string } }> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64data = reader.result as string;
      const base64Content = base64data.split(',')[1];
      resolve({ inlineData: { data: base64Content, mimeType: file.type } });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};

// ── Document analysis ───────────────────────────────────────────────────────

export const analyzeDocument = async (text: string, imagePart?: any) => {
  if (imagePart) {
    return retryWithBackoff(async () => {
      const prompt = `Analyze the following legal document content. Extract: 1. A concise summary (max 3 sentences). 2. Key legal entities. 3. A list of potential risks or contradictions. Return JSON.`;
      const parts = [imagePart, { text: prompt + "\n\nDocument Content:\n" + text }];
      const response = await withTimeout(
        ai.models.generateContent({ model: 'gemini-2.5-flash', contents: { parts }, config: { responseMimeType: "application/json" } }),
        30000
      );
      return JSON.parse(response.text || '{}');
    }, 3);
  }
  return dsJson<{ summary: string; entities: string[]; risks: string[] }>(
    'You are a legal document analyst. Return { summary, entities[], risks[] }.',
    `Document Content:\n${text}`
  );
};

// ── Witness simulation ──────────────────────────────────────────────────────

export const generateWitnessResponse = async (
  history: { role: string; parts: { text: string }[] }[], witnessName: string, personality: string, caseContext: string
): Promise<string> => {
  try {
    let guide = "Answer questions directly and honestly. Provide relevant details you know. Stay calm and professional.";
    if (personality?.toLowerCase().includes('hostile')) guide = "Be evasive and defensive. Give short clipped responses. Say 'I don\\'t recall' frequently. Show frustration.";
    else if (personality?.toLowerCase().includes('nervous')) guide = "Stutter and use filler words. Show uncertainty. Ramble. Contradict yourself slightly.";

    const systemInstruction = `You are a witness named ${witnessName} in a legal trial cross-examination.
${guide}
Case Context: ${caseContext}
CRITICAL RULES: Stay in character. Keep responses 1-3 sentences. Respond as a real person in a courtroom. Use natural speech patterns with imperfections. Maintain consistency with previous answers.`;

    const messages = history.filter(h => h.role !== 'system').map(h => ({
      role: h.role === 'user' ? 'user' as const : 'assistant' as const,
      content: h.parts.map(p => p.text).join('\n'),
    }));

    return await deepseekChat({ systemInstruction, messages, temperature: 0.95, maxTokens: 300, timeoutMs: 20000 });
  } catch (error) {
    console.error('Witness response error:', error);
    throw new Error(`Witness simulation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
};

export const generateWitnessCoaching = async (
  userQuestion: string, witnessResponse: string, witnessName: string, personality: string, caseContext: string
): Promise<{ suggestion: string; followUp: string; fallback: string }> => {
  try {
    const tactics = personality?.toLowerCase().includes('hostile')
      ? "Pin them down with specific facts. Trap contradictions."
      : personality?.toLowerCase().includes('nervous')
        ? "Follow up on inconsistencies. Give them time to ramble."
        : "Build rapport. Get them to elaborate on helpful details.";
    return await dsJson(
      'You are a trial coaching expert. Return { suggestion, followUp, fallback }.',
      `Case: ${caseContext}\nWitness: ${witnessName} (${personality})\nTactics: ${tactics}\nAttorney asked: "${userQuestion}"\nWitness answered: "${witnessResponse}"`,
      0.7, 15000
    );
  } catch {
    return { suggestion: "Consider what the witness revealed and avoided.", followUp: "Follow up with a more specific question.", fallback: "Try a different approach." };
  }
};

// ── Strategy ────────────────────────────────────────────────────────────────

export const predictStrategy = async (caseSummary: string, opponentProfile: string): Promise<StrategyInsight[]> => {
  try {
    const result = await dsJson<StrategyInsight[]>(
      'Return a JSON array of 3 objects: { title, description, confidence (0-100), type ("risk"|"opportunity"|"prediction") }.',
      `Case: ${caseSummary}\nOpponent: ${opponentProfile}`,
      0.7, 30000
    );
    return Array.isArray(result) ? result : [];
  } catch { return []; }
};

export const getTrialSimSystemInstruction = (phase: TrialPhase, mode: string, opponentName: string, caseSummary: string): string => {
  const phaseDescriptions: Record<TrialPhase, string> = {
    'pre-trial-motions': 'You are opposing counsel in pre-trial motions.',
    'voir-dire': 'You are the court questioning jurors.',
    'opening-statement': 'You are opposing counsel giving opening.',
    'direct-examination': 'You are opposing counsel cross-examining.',
    'cross-examination': 'You are opposing counsel conducting cross.',
    'defendant-testimony': 'You are the prosecutor questioning defendant.',
    'closing-argument': 'You are opposing counsel. Summarize persuasively.',
    'sentencing': 'You are the prosecutor arguing for sentence.'
  };
  const modeInstructions: Record<string, string> = {
    'learn': 'Provide coaching. Be educational.',
    'practice': 'Be realistic. Balanced opposition.',
    'trial': 'Be aggressive. No hand-holding.'
  };
  return `You are ${opponentName}, opposing counsel.\nPhase: ${phaseDescriptions[phase]}\nMode: ${modeInstructions[mode] || 'Be realistic'}\nCase: ${caseSummary}\nRespond naturally. Use tools for coaching tips and objections.`;
};

// ── Transcript / OCR / Evidence (Gemini multimodal) ─────────────────────────

// ── Audio transcription: Groq Whisper → Deepgram → Gemini fallback ──────────

const transcribeWithGroqWhisper = async (audioFile: File): Promise<string> => {
  const groqKey = import.meta.env.VITE_GROQ_API_KEY || '';
  if (!groqKey) throw new Error('No Groq key');
  const form = new FormData();
  form.append('file', audioFile, audioFile.name);
  form.append('model', 'whisper-large-v3');
  form.append('response_format', 'verbose_json');
  form.append('language', 'en');
  const resp = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
    method: 'POST', headers: { Authorization: `Bearer ${groqKey}` }, body: form,
  });
  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Groq Whisper error ${resp.status}: ${err}`);
  }
  const data = await resp.json();
  return data.text || '';
};

const transcribeWithDeepgram = async (audioFile: File): Promise<string> => {
  const dgKey = import.meta.env.VITE_DEEPGRAM_API_KEY || '';
  if (!dgKey) throw new Error('No Deepgram key');
  const arrayBuffer = await audioFile.arrayBuffer();
  const resp = await fetch('https://api.deepgram.com/v1/listen?model=nova-3&smart_format=true&diarize=true&punctuate=true', {
    method: 'POST',
    headers: { Authorization: `Token ${dgKey}`, 'Content-Type': audioFile.type || 'audio/wav' },
    body: arrayBuffer,
  });
  if (!resp.ok) throw new Error(`Deepgram error ${resp.status}`);
  const data = await resp.json();
  const words = data?.results?.channels?.[0]?.alternatives?.[0]?.words ?? [];
  if (words.length > 0) {
    // Build diarized transcript
    let transcript = '';
    let currentSpeaker = -1;
    for (const w of words) {
      if (w.speaker !== currentSpeaker) {
        currentSpeaker = w.speaker;
        transcript += `\n[Speaker ${currentSpeaker + 1}] `;
      }
      transcript += w.punctuated_word + ' ';
    }
    return transcript.trim();
  }
  return data?.results?.channels?.[0]?.alternatives?.[0]?.transcript || '';
};

export const transcribeAudio = async (audioFile: File): Promise<string> => {
  // 1. Deepgram Nova-3 — primary (best accuracy for legal audio, $200 credit available)
  try {
    const text = await withTimeout(transcribeWithDeepgram(audioFile), 90000);
    if (text) return text;
  } catch (e) {
    console.warn('[transcribeAudio] Deepgram failed, trying Groq Whisper:', e);
  }
  // 2. Groq Whisper large-v3 — fallback (free tier)
  try {
    const text = await withTimeout(transcribeWithGroqWhisper(audioFile), 60000);
    if (text) return text;
  } catch (e) {
    console.warn('[transcribeAudio] Groq Whisper failed, trying Gemini:', e);
  }
  // 3. Gemini — last resort, with retry for 429 rate limits
  try {
    const part = await fileToGenerativePart(audioFile);
    const response = await retryWithBackoff(async () => {
      return await withTimeout(
        ai.models.generateContent({ model: 'gemini-2.5-flash', contents: { parts: [part, { text: 'Transcribe this audio accurately. Label speakers [Speaker 1], etc. Note inaudible as [inaudible]. Return only transcription.' }] } }),
        60000
      );
    }, 3);
    return response.text || '';
  } catch (error) { throw new Error(`Transcription failed: ${error instanceof Error ? error.message : 'Unknown error'}`); }
};

// ── OCR: PDF.js text extraction (PDFs) → GitHub Models GPT-4o (images) → Gemini fallback ──

// Extract text from PDFs using PDF.js CDN — no bundling needed
const extractPdfText = async (file: File): Promise<string> => {
  const arrayBuffer = await file.arrayBuffer();
  // Load PDF.js from CDN to avoid Rollup bundle issues
  const PDFJS_VERSION = '4.4.168';
  const cdnBase = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VERSION}`;

  // Inject script tag if not already loaded
  if (!(window as any).pdfjsLib) {
    await new Promise<void>((resolve, reject) => {
      const script = document.createElement('script');
      script.src = `${cdnBase}/pdf.min.mjs`;
      script.type = 'module';
      script.onload = () => resolve();
      script.onerror = reject;
      document.head.appendChild(script);
      // Fallback: if pdf.min.mjs fails to load after 3s, proceed (PDF.js will throw clear error later)
      setTimeout(resolve, 3000);
    });
  }

  const pdfjsLib = (window as any).pdfjsLib;
  if (!pdfjsLib) throw new Error('PDF.js failed to load from CDN');

  pdfjsLib.GlobalWorkerOptions.workerSrc = `${cdnBase}/pdf.worker.min.mjs`;

  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  let fullText = '';
  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const textContent = await page.getTextContent();
    const pageText = (textContent.items as any[])
      .map((item: any) => ('str' in item ? item.str : ''))
      .join(' ');
    fullText += `\n--- Page ${pageNum} ---\n${pageText}`;
  }
  return fullText.trim();
};

// GitHub Models GPT-4o vision — images only (not PDFs)
const ocrWithGitHubModels = async (imageFile: File): Promise<string> => {
  const ghToken = import.meta.env.VITE_GITHUB_TOKEN || import.meta.env.VITE_GITHUB_MODELS_TOKEN || '';
  if (!ghToken) throw new Error('No GitHub Models token');
  // Only handle image types — GPT-4o vision rejects PDFs
  const mime = imageFile.type || '';
  if (!mime.startsWith('image/')) throw new Error('GitHub Models: images only');
  const part = await fileToGenerativePart(imageFile);
  const resp = await fetch('https://models.inference.ai.azure.com/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${ghToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'gpt-4o',
      messages: [{
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: `data:${mime};base64,${part.inlineData.data}` } },
          { type: 'text', text: 'Extract ALL text from this image exactly as it appears. Preserve layout. Return only the extracted text.' }
        ]
      }],
      max_tokens: 4096,
    }),
  });
  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`GitHub Models GPT-4o error ${resp.status}: ${err}`);
  }
  const data = await resp.json();
  return data.choices?.[0]?.message?.content || '';
};

export const performOCR = async (imageOrDocFile: File): Promise<string> => {
  const mime = imageOrDocFile.type || imageOrDocFile.name.toLowerCase();
  const isPdf = mime.includes('pdf');
  const isImage = !isPdf && (mime.startsWith('image/') || /\.(jpg|jpeg|png|gif|webp|bmp|tiff)$/i.test(imageOrDocFile.name));

  // 1a. PDFs: extract text directly with PDF.js (free, no API, works offline)
  if (isPdf) {
    try {
      const text = await withTimeout(extractPdfText(imageOrDocFile), 30000);
      if (text && text.length > 50) return text;
      console.warn('[performOCR] PDF.js extracted minimal text (scanned PDF?), trying Gemini');
    } catch (e) {
      console.warn('[performOCR] PDF.js failed:', e);
    }
  }

  // 1b. Images: GitHub Models GPT-4o vision (free)
  if (isImage) {
    try {
      const text = await withTimeout(ocrWithGitHubModels(imageOrDocFile), 45000);
      if (text) return text;
    } catch (e) {
      console.warn('[performOCR] GitHub Models failed, trying Gemini:', e);
    }
  }

  // 2. Gemini fallback (handles scanned PDFs, complex images) — with retry for 429 rate limits
  try {
    const part = await fileToGenerativePart(imageOrDocFile);
    const response = await retryWithBackoff(async () => {
      return await withTimeout(
        ai.models.generateContent({ model: 'gemini-2.5-flash', contents: { parts: [part, { text: 'Extract ALL text from this document. Preserve layout. Return only extracted text.' }] } }),
        45000
      );
    }, 3);
    return response.text || '';
  } catch (error) { throw new Error(`OCR failed: ${error instanceof Error ? error.message : 'Unknown error'}`); }
};

export const analyzeEvidence = async (file: File, caseContext: string): Promise<{ summary: string; relevance: number; keyFacts: string[]; concerns: string[]; tags: string[] }> => {
  // Read file as text for Groq (text-based analysis)
  const fileText = await new Promise<string>((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.readAsText(file);
  }).catch(() => `[Binary file: ${file.name}, type: ${file.type}, size: ${file.size} bytes]`);

  const prompt = `Analyze this evidence file for a legal case.
File name: ${file.name}
File type: ${file.type}
Case context: ${caseContext}
File content: ${fileText.slice(0, 4000)}

Return ONLY valid JSON with this exact structure:
{
  "summary": "brief summary of the evidence",
  "relevance": 75,
  "keyFacts": ["fact 1", "fact 2", "fact 3"],
  "concerns": ["concern 1", "concern 2"],
  "tags": ["tag1", "tag2", "tag3"]
}`;

  const groqKey = import.meta.env.VITE_GROQ_API_KEY || '';
  if (!groqKey) {
    return { summary: 'Evidence uploaded (AI analysis unavailable — set VITE_GROQ_API_KEY)', relevance: 50, keyFacts: [], concerns: [], tags: ['uploaded'] };
  }

  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + groqKey },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      temperature: 0.3,
      max_tokens: 1000,
      messages: [
        { role: 'system', content: 'You are a legal evidence analyst. Always respond with valid JSON only.' },
        { role: 'user', content: prompt }
      ]
    })
  });

  if (!res.ok) {
    return { summary: 'Evidence uploaded (analysis failed)', relevance: 50, keyFacts: [], concerns: [], tags: ['uploaded'] };
  }

  const data = await res.json();
  try {
    const text = data.choices?.[0]?.message?.content?.trim() || '{}';
    const parsed = JSON.parse(text);
    return {
      summary: parsed.summary || '',
      relevance: parsed.relevance || 50,
      keyFacts: Array.isArray(parsed.keyFacts) ? parsed.keyFacts : [],
      concerns: Array.isArray(parsed.concerns) ? parsed.concerns : [],
      tags: Array.isArray(parsed.tags) ? parsed.tags : [],
    };
  } catch {
    return { summary: 'Evidence uploaded', relevance: 50, keyFacts: [], concerns: [], tags: ['uploaded'] };
  }
};

// ── Text functions → DeepSeek ──────────────────────────────────────────────

export const generateTrialCoaching = async (phase: TrialPhase, userStatement: string, opponentResponse: string): Promise<CoachingAnalysis> => {
  try {
    return await dsJson<CoachingAnalysis>(
      'Return { critique, suggestion, sampleResponse, teleprompterScript, fallaciesIdentified[], rhetoricalEffectiveness (0-100), rhetoricalFeedback }.',
      `Phase: ${phase}\nAttorney: "${userStatement}"\nOpponent: "${opponentResponse}"`, 0.5, 20000
    );
  } catch { return { critique: '', suggestion: '', sampleResponse: '', teleprompterScript: '', fallaciesIdentified: [], rhetoricalEffectiveness: 70, rhetoricalFeedback: '' }; }
};

export const generateDepositionQuestions = async (deponentName: string, deponentRole: string, caseContext: string, strategy: string): Promise<{ topic: string; questions: string[]; purpose: string }[]> =>
  dsJson('Return array of { topic, purpose, questions[] }.', `Deponent: ${deponentName} (${deponentRole})\nCase: ${caseContext}\nStrategy: ${strategy}`, 0.4, 30000);

export const analyzeJuror = async (jurorInfo: string, caseContext: string, caseType: string): Promise<{ biasScore: number; biasFactors: string[]; favorableFactors: string[]; recommendedQuestions: string[]; recommendation: 'accept' | 'challenge-for-cause' | 'peremptory-strike'; reasoning: string }> =>
  dsJson('Return { biasScore (0-100), biasFactors[], favorableFactors[], recommendedQuestions[], recommendation ("accept"|"challenge-for-cause"|"peremptory-strike"), reasoning }.', `Case Type: ${caseType}\nCase: ${caseContext}\nJuror: ${jurorInfo}`, 0.3, 20000);

export const generateStatement = async (type: 'opening' | 'closing', caseContext: string, theory: string, keyEvidence: string, tone: string): Promise<{ introduction: string; body: string[]; conclusion: string; fullText: string; talkingPoints: string[] }> =>
  dsJson('Return { introduction, body[], conclusion, fullText, talkingPoints[] }.', `Type: ${type}\nCase: ${caseContext}\nTheory: ${theory}\nEvidence: ${keyEvidence}\nTone: ${tone}`, 0.5, 30000);

export const predictVerdictAndSettlement = async (caseContext: string, caseType: string, evidenceStrength: number, jurisdiction: string, additionalFactors: string): Promise<{ winProbability: number; verdictLikely: string; damagesLow: string; damagesMid: string; damagesHigh: string; settlementFloor: string; settlementSweet: string; settlementCeiling: string; keyRisks: string[]; keyStrengths: string[]; recommendation: string; timelineEstimate: string }> =>
  dsJson('Return { winProbability, verdictLikely, damagesLow, damagesMid, damagesHigh, settlementFloor, settlementSweet, settlementCeiling, keyRisks[], keyStrengths[], recommendation, timelineEstimate }.', `Case Type: ${caseType}\nJurisdiction: ${jurisdiction}\nEvidence: ${evidenceStrength}/100\nCase: ${caseContext}\nFactors: ${additionalFactors}`, 0.3, 25000);

export const generateClientUpdate = async (caseContext: string, updateType: string, recentDevelopments: string, clientName: string): Promise<{ subject: string; salutation: string; body: string; closing: string; fullLetter: string }> =>
  dsJson('Return { subject, salutation, body, closing, fullLetter }. Use plain language.', `Client: ${clientName}\nUpdate: ${updateType}\nCase: ${caseContext}\nDevelopments: ${recentDevelopments}`, 0.4, 20000);

// ── Specialist consulting ───────────────────────────────────────────────────

export const consultSpecialist = async (
  specialistSystemInstruction: string,
  history: { role: 'user' | 'model'; parts: { text: string }[] }[],
  newMessage: string,
  caseContext?: string,
  memoryContext?: string
): Promise<string> => {
  const contextPrefix = caseContext ? `\n\nACTIVE CASE CONTEXT:\n${caseContext}\n` : '';
  const memCtx = memoryContext ?? '';
  const messages = history.map(h => ({
    role: h.role === 'user' ? 'user' as const : 'assistant' as const,
    content: h.parts.map(p => p.text).join('\n'),
  }));
  messages.push({ role: 'user' as const, content: newMessage });
  return deepseekChat({
    systemInstruction: specialistSystemInstruction + contextPrefix + memCtx,
    messages,
    temperature: 0.85,
    maxTokens: 2048,
    timeoutMs: 30000,
  });
};

/** Streaming version of consultSpecialist for real-time token delivery */
export async function* consultSpecialistStream(
  specialistSystemInstruction: string,
  history: { role: 'user' | 'model'; parts: { text: string }[] }[],
  newMessage: string,
  caseContext?: string,
  memoryContext?: string
): AsyncGenerator<string, void, unknown> {
  const contextPrefix = caseContext ? `\n\nACTIVE CASE CONTEXT:\n${caseContext}\n` : '';
  const memCtx = memoryContext ?? '';
  const sysInstruction = specialistSystemInstruction + contextPrefix + memCtx;

  const historyForChat = history.map(h => ({
    role: h.role as 'user' | 'model',
    parts: h.parts,
  }));

  const chat = ai.chats.create({
    model: 'gemini-2.5-flash',
    config: { systemInstruction: sysInstruction, temperature: 0.85 },
    history: historyForChat,
  });

  const stream = await chat.sendMessageStream({ message: newMessage });
  for await (const chunk of stream) {
    if (chunk.text) yield chunk.text;
  }
}

// ── Witness prep ────────────────────────────────────────────────────────────

export const generateWitnessPrepPackage = async (witnessName: string, witnessRole: string, witnessRelationship: string, caseContext: string, strategy: string): Promise<{
  directExam: { topic: string; questions: string[] }[];
  crossExam: { topic: string; questions: string[] }[];
  impeachmentStrategy: string;
  credibilityAssessment: { strengths: string[]; vulnerabilities: string[]; dangerZones: string[]; openingGambit: string; closingQuestion: string };
  overallAssessment: string;
}> => dsJson('Return { directExam[], crossExam[], impeachmentStrategy, credibilityAssessment { strengths[], vulnerabilities[], dangerZones[], openingGambit, closingQuestion }, overallAssessment }.', `Witness: ${witnessName} (${witnessRole}, ${witnessRelationship})\nCase: ${caseContext}\nStrategy: ${strategy}`, 0.4, 45000);

// ── Jury simulation ─────────────────────────────────────────────────────────

export const simulateJurorReaction = async (jurors: { id: number; name: string; background: string; personality: string }[], argumentText: string, argumentType: string, caseContext: string): Promise<{ jurorReactions: { id: number; reaction: string; persuasionDelta: number; internalThought: string }[]; overallImpact: string }> => {
  const jurorsDesc = jurors.map(j => `Juror ${j.id} (${j.name}): ${j.background}. ${j.personality}`).join('\n');
  return dsJson('Return { jurorReactions: [{ id, reaction, persuasionDelta (-20..+20), internalThought }], overallImpact }.', `Case: ${caseContext}\nArgument: "${argumentText}" (${argumentType})\nJury:\n${jurorsDesc}`, 0.7, 30000);
};

export const runJuryDeliberation = async (jurors: { id: number; name: string; background: string; personality: string; persuasionLevel: number }[], caseContext: string, evidenceSummary: string): Promise<{ deliberationExchanges: { jurorId: number; jurorName: string; statement: string }[]; finalVote: { guilty: number; notGuilty: number; undecided: number }; verdict: string; verdictConfidence: number; keyFactors: string[] }> => {
  const jurorsDesc = jurors.map(j => `Juror ${j.id} (${j.name}): ${j.background}. ${j.personality}. ${j.persuasionLevel}/100`).join('\n');
  return dsJson('Return { deliberationExchanges (8-12 of { jurorId, jurorName, statement }), finalVote { guilty, notGuilty, undecided }, verdict, verdictConfidence, keyFactors[] }.', `Case: ${caseContext}\nEvidence: ${evidenceSummary}\nJury:\n${jurorsDesc}`, 0.7, 45000);
};

// ── Transcript analysis ─────────────────────────────────────────────────────

export const analyzeTranscription = async (transcriptText: string, caseContext: string, fileName: string): Promise<{ summary: string; keyPoints: string[]; legalIssues: string[]; speakers: string[]; actionItems: string[] }> => {
  try {
    return await dsJson('Return { summary, keyPoints[], legalIssues[], speakers[], actionItems[] }.', `Case: ${caseContext}\nDocument: ${fileName}\nTranscript:\n${transcriptText}`, 0.3, 30000);
  } catch (error) { throw new Error(`Analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`); }
};

// ── Copilot streaming (Gemini — used by AICopilot legacy path) ─────────────

export async function* copilotStream(
  question: string,
  history: { role: string; text: string }[],
  caseContext?: string
): AsyncGenerator<string, void, unknown> {
  const contextBlock = caseContext
    ? `\n\nACTIVE CASE CONTEXT:\n${caseContext}\n`
    : '\n\nNo active case selected. Answer generally.\n';
  const systemInstruction = "You are the CaseBuddy Legal Copilot. Be concise, practical, tactical. Ground in case context when provided." + contextBlock;
  const chat = ai.chats.create({ model: 'gemini-2.5-flash', config: { systemInstruction, temperature: 0.7 }, history: history.map(h => ({ role: h.role, parts: [{ text: h.text }] })) });
  const stream = await chat.sendMessageStream({ message: question });
  for await (const chunk of stream) { if (chunk.text) yield chunk.text; }
}

// Legacy alias used by CopilotSidebar
export const askCopilotStream = copilotStream;

/**
 * Chat with a specific AI employee in their own voice/persona. Powers the
 * text-message path so you can message any team member, not just call them.
 */
export const chatWithAgent = async (
  systemInstruction: string,
  question: string,
  history: { role: 'user' | 'model'; text: string }[],
  caseContext?: string
): Promise<string> => {
  return retryWithBackoff(async () => {
    const sys = caseContext
      ? `${systemInstruction}\n\nACTIVE CASE CONTEXT (use naturally when relevant):\n${caseContext}`
      : systemInstruction;
    const chat = ai.chats.create({
      model: 'gemini-2.5-flash',
      config: { systemInstruction: sys, temperature: 0.7 },
      history: history.map(h => ({ role: h.role, parts: [{ text: h.text }] })),
    });
    const response = await withTimeout(chat.sendMessage({ message: question }), 30000);
    if (!response.text) throw new Error('Empty response');
    return response.text;
  }, 3);
};

// ── War Room briefing ──────────────────────────────────────────────────────

export const generateWarRoomBriefing = async (
  caseTitle: string,
  caseSummary: string,
  caseStatus: string,
  nextCourtDate: string
): Promise<WarRoomBriefing> => {
  return dsJson<WarRoomBriefing>(
    'You are a senior trial strategist. Return JSON: { riskLevel ("low"|"medium"|"high"|"critical"), estimatedTrialReadiness (number 0-100), topPriority, keyRisks[], summary, tasks: [{ id, agent, title, status ("pending"|"working"|"done"|"error"), priority ("low"|"medium"|"high"), category, description, done: false }] }. Generate 10-15 tasks across categories: pre-trial, discovery, witnesses, jury, evidence, drafting, strategy.',
    `Case: ${caseTitle}\nSummary: ${caseSummary}\nStatus: ${caseStatus}\nNext Court Date: ${nextCourtDate}`,
    0.5, 30000
  );
};

// ── Simple text generation helper ────────────────────────────────────────────
export const generateText = async (prompt: string, temperature = 0.7): Promise<string> => {
  const response = await retryWithBackoff(async () => {
    return await withTimeout(
      ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: { parts: [{ text: prompt }] },
        config: { temperature },
      }),
      30000
    );
  }, 3);
  return response.text || '';
};
