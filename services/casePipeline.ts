import type { Case, PipelineState, PipelineStage, PipelineStageId, PipelineStageStatus, PipelineInventoryItem, PipelineEntity, PipelineChronologyEntry, PipelineContradiction, PipelineConstitutionalIssue, PipelineMotion, PipelineDiscoveryItem, PipelineGap, PipelineImpeachment, PipelineWitnessQuestions, PipelineBriefing } from '../types';
import { PIPELINE_STAGES } from '../types';
import { deepseekChat, parseDeepSeekJson } from './deepseek';
import { performOCR, transcribeAudio, fileToGenerativePart } from './geminiService';
import { backgroundEngine } from './backgroundAgentEngine';

// ── Storage ───────────────────────────────────────────────────────────────────

const storageKey = (caseId: string) => `casebuddy_pipeline_${caseId}`;

export const savePipelineState = (caseId: string, state: PipelineState): void => {
  try {
    localStorage.setItem(storageKey(caseId), JSON.stringify(state));
  } catch (e) {
    console.error('[Pipeline] Failed to save state', e);
  }
};

export const loadPipelineState = (caseId: string): PipelineState | null => {
  try {
    const raw = localStorage.getItem(storageKey(caseId));
    if (!raw) return null;
    return JSON.parse(raw) as PipelineState;
  } catch (e) {
    console.error('[Pipeline] Failed to load state', e);
    return null;
  }
};

export const deletePipelineState = (caseId: string): void => {
  try {
    localStorage.removeItem(storageKey(caseId));
  } catch (e) {
    console.error('[Pipeline] Failed to delete state', e);
  }
};

// ── Create / Update ───────────────────────────────────────────────────────────

export const createPipelineState = (caseId: string, caseTitle: string): PipelineState => {
  const stages: PipelineStage[] = PIPELINE_STAGES.map((def) => ({
    id: def.id,
    label: def.label,
    status: 'pending' as PipelineStageStatus,
  }));

  return {
    id: `pipeline-${caseId}-${Date.now()}`,
    caseId,
    caseTitle,
    status: 'idle',
    stages,
    inventory: [],
    entities: [],
    chronology: [],
    contradictions: [],
    constitutionalIssues: [],
    motions: [],
    discoveryItems: [],
    gaps: [],
    impeachments: [],
    witnessQuestions: [],
    overallProgress: 0,
  };
};

export const updateStage = (
  state: PipelineState,
  stageId: PipelineStageId,
  patch: Partial<PipelineStage>
): PipelineState => {
  const stages = state.stages.map((s) =>
    s.id === stageId ? { ...s, ...patch } : s
  );
  const completedCount = stages.filter((s) => s.status === 'completed').length;
  const overallProgress = Math.round((completedCount / stages.length) * 100);

  return {
    ...state,
    stages,
    overallProgress,
    currentStageId: stageId,
  };
};

// ── Context Builder ───────────────────────────────────────────────────────────

export const buildCaseContext = (c: Case, state: PipelineState): string => {
  const parts: string[] = [];

  parts.push(`CASE: ${c.title}`);
  parts.push(`Client: ${c.client}`);
  parts.push(`Status: ${c.status}`);
  parts.push(`Opposing Counsel: ${c.opposingCounsel}`);
  parts.push(`Judge: ${c.judge}`);
  parts.push(`Next Court Date: ${c.nextCourtDate}`);
  parts.push(`Case Type: ${c.caseType || 'Not specified'}`);
  parts.push(`Summary: ${c.summary}`);

  if (state.inventory.length > 0) {
    parts.push('\n--- DOCUMENT INVENTORY ---');
    state.inventory.forEach((item) => {
      parts.push(
        `  [${item.id}] ${item.fileName} (${item.fileType}, ${item.fileSize}B)` +
        (item.category ? ` | Category: ${item.category}` : '') +
        (item.batesNumber ? ` | Bates: ${item.batesNumber}` : '') +
        (item.summary ? `\n    Summary: ${item.summary}` : '') +
        (item.extractedText ? `\n    Text: ${item.extractedText.slice(0, 500)}` : '')
      );
    });
  }

  if (state.entities.length > 0) {
    parts.push('\n--- EXTRACTED ENTITIES ---');
    state.entities.forEach((e) => {
      parts.push(
        `  ${e.name} (${e.type}${e.role ? `, ${e.role}` : ''}) — ${e.mentions} mentions in [${e.documents.join(', ')}]`
      );
    });
  }

  if (state.chronology.length > 0) {
    parts.push('\n--- CHRONOLOGY ---');
    state.chronology.forEach((entry) => {
      parts.push(`  ${entry.date}: ${entry.title} — ${entry.description} (${entry.confidence})`);
    });
  }

  if (state.contradictions.length > 0) {
    parts.push('\n--- CONTRADICTIONS ---');
    state.contradictions.forEach((c) => {
      parts.push(`  ${c.id}: ${c.description} [${c.severity}]`);
    });
  }

  if (state.constitutionalIssues.length > 0) {
    parts.push('\n--- CONSTITUTIONAL ISSUES ---');
    state.constitutionalIssues.forEach((ci) => {
      parts.push(`  ${ci.amendment}: ${ci.issue} [${ci.severity}]`);
    });
  }

  if (state.entities.length > 0) {
    parts.push('\n--- ENTITY DETAIL ---');
    state.entities.forEach((e) => {
      parts.push(`${e.name}: ${e.type}${e.role ? ` (${e.role})` : ''}, mentioned ${e.mentions} times`);
    });
  }

  return parts.join('\n');
};

// ── Inventory Text Aggregator ─────────────────────────────────────────────────

const aggregateInventoryText = (state: PipelineState): string => {
  return state.inventory
    .map((item) => {
      const text = item.extractedText || item.summary || '';
      return `[${item.id}] ${item.fileName} (${item.category || 'uncategorized'}): ${text}`;
    })
    .join('\n\n');
};

// ── Stage Helpers ─────────────────────────────────────────────────────────────

const stageError = (state: PipelineState, stageId: PipelineStageId, error: string): PipelineState => {
  return updateStage(state, stageId, {
    status: 'error',
    error,
    completedAt: Date.now(),
  });
};

const stageComplete = (state: PipelineState, stageId: PipelineStageId, output?: any): PipelineState => {
  return updateStage(state, stageId, {
    status: 'completed',
    output,
    completedAt: Date.now(),
  });
};

// ── Stage 0: Inventory ────────────────────────────────────────────────────────

const FILE_CATEGORY_MAP: Record<string, string> = {
  pdf: 'legal-filing',
  doc: 'legal-filing',
  docx: 'legal-filing',
  txt: 'correspondence',
  eml: 'correspondence',
  msg: 'correspondence',
  jpg: 'photo',
  jpeg: 'photo',
  png: 'photo',
  gif: 'photo',
  webp: 'photo',
  mp4: 'video',
  mov: 'video',
  avi: 'video',
  wmv: 'video',
  mp3: 'audio',
  wav: 'audio',
  m4a: 'audio',
  ogg: 'audio',
  xls: 'evidence-log',
  xlsx: 'evidence-log',
  csv: 'evidence-log',
  pst: 'correspondence',
};

const detectCategory = (fileName: string): string => {
  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  return FILE_CATEGORY_MAP[ext] || 'other';
};

export const runInventoryStage = (
  state: PipelineState,
  files: File[]
): PipelineState => {
  const items: PipelineInventoryItem[] = files.map((file, idx) => ({
    id: `inv-${idx.toString(36)}-${Date.now()}`,
    fileName: file.name,
    fileSize: file.size,
    fileType: file.type || file.name.split('.').pop() || 'unknown',
    category: detectCategory(file.name),
    batesNumber: `CASEBUDDY-${String(idx + 1).padStart(5, '0')}`,
  }));

  return stageComplete(
    { ...state, inventory: items },
    'inventory',
    { itemCount: items.length }
  );
};

// ── Stage 1: Extraction (REAL OCR/Audio) ─────────────────────────────────────

const isAudioFile = (type: string): boolean =>
  type.includes('audio') || /\.(mp3|wav|m4a|ogg|wma|flac)$/i.test(type);

const isImageOrPdf = (type: string): boolean =>
  type.includes('image') || type.includes('pdf') || /\.(jpg|jpeg|png|gif|webp|bmp|tiff|pdf)$/i.test(type);

const isTextFile = (type: string): boolean =>
  type.includes('text') || /\.(txt|csv|log|md|json|xml|html|eml)$/i.test(type);

export const runExtractionStage = async (
  state: PipelineState,
  files: File[]
): Promise<PipelineState> => {
  const updatedItems = [...state.inventory];
  let processedCount = 0;
  const totalCount = files.length;

  // Small inter-file delay to be a good API citizen (Deepgram is primary, very fast)
  const INTER_FILE_DELAY_MS = 300;

  // Circuit breaker: abort extraction after N consecutive AI provider failures
  let consecutiveProviderFailures = 0;
  const MAX_CONSECUTIVE_PROVIDER_FAILURES = 2;
  const isProviderExhausted = (err: unknown): boolean => {
    const msg = err instanceof Error ? err.message : String(err);
    return /(429|503|quota|exhausted|rate.?limit|unavailable|All AI providers)/i.test(msg);
  };

  // Shared breaker helper: call from any catch block (inner or outer) to feed the counter.
  // Returns true if the breaker fired and remaining files were marked — caller should break.
  const registerProviderFailure = (err: unknown, currentIndex: number): boolean => {
    if (!isProviderExhausted(err)) {
      consecutiveProviderFailures = 0;
      return false;
    }
    consecutiveProviderFailures++;
    if (consecutiveProviderFailures >= MAX_CONSECUTIVE_PROVIDER_FAILURES) {
      console.warn(`[Pipeline] Circuit breaker: ${consecutiveProviderFailures} consecutive AI provider failures. Stopping extraction.`);
      for (let j = currentIndex + 1; j < files.length; j++) {
        const remainingFile = files[j];
        const remainingIndex = updatedItems.findIndex(
          (item) => item.fileName === remainingFile.name && item.fileSize === remainingFile.size
        );
        if (remainingIndex !== -1) {
          updatedItems[remainingIndex] = {
            ...updatedItems[remainingIndex],
            extractedText: '[Skipped: AI provider exhausted]',
            summary: 'Skipped — AI API quota or rate limit reached. Try again later when quotas reset.',
          };
        }
      }
      return true;
    }
    return false;
  };

  for (let i = 0; i < files.length; i++) {
    // Throttle: brief pause between files to avoid burst rate limits
    if (i > 0) await new Promise(resolve => setTimeout(resolve, INTER_FILE_DELAY_MS));

    const file = files[i];
    const itemIndex = updatedItems.findIndex(
      (item) => item.fileName === file.name && item.fileSize === file.size
    );
    if (itemIndex === -1) continue;

    console.log(`[Pipeline] Processing ${i + 1}/${files.length}: ${file.name}`);

    try {
      let extractedText = '';
      let summary = '';
      let providerFailureInFile = false; // Tracks whether any inner catch registered a provider failure

      if (isImageOrPdf(file.type || file.name)) {
        // OCR: PDF.js (free) → GitHub Models GPT-4o → Gemini fallback
        extractedText = await performOCR(file);
        // Generate summary via AI — if providers are exhausted, use fallback but feed the breaker
        try {
          const { generateText } = await import('./geminiService');
          const summaryPrompt = `Summarize this legal document in 2-3 sentences. Be specific about key facts, dates, and parties. Document: ${extractedText.slice(0, 3000)}`;
          summary = await generateText(summaryPrompt, 0.3);
        } catch (summaryErr) {
          summary = `Document processed (${extractedText.length} chars extracted)`;
          providerFailureInFile = true;
          if (registerProviderFailure(summaryErr, i)) {
            // Persist current item before breaking out of the loop
            updatedItems[itemIndex] = {
              ...updatedItems[itemIndex],
              extractedText: extractedText.slice(0, 50000),
              summary,
            };
            processedCount++;
            break;
          }
        }
      } else if (isAudioFile(file.type || file.name)) {
        // Deepgram Nova-3 → Groq Whisper → Gemini fallback
        extractedText = await transcribeAudio(file);
        const wordCount = extractedText.split(/\s+/).filter(Boolean).length;
        const speakerCount = (extractedText.match(/\[Speaker \d+\]/g) || []).length;
        summary = `Audio transcription: ${wordCount} words${speakerCount > 0 ? `, ${speakerCount} speaker segments` : ''}`;
      } else if (isTextFile(file.type || file.name)) {
        // Read text files directly
        extractedText = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve((reader.result as string) || '');
          reader.onerror = () => resolve('');
          reader.readAsText(file);
        });
        summary = `Text file (${extractedText.length} chars)`;
      } else {
        // Fallback: try OCR anyway
        try {
          extractedText = await performOCR(file);
          summary = `Processed via OCR (${extractedText.length} chars)`;
        } catch (ocrErr) {
          extractedText = `[Unable to extract text from: ${file.name}]`;
          summary = 'Text extraction failed';
          // This inner catch is for unsupported formats, but feed the breaker just in case
          providerFailureInFile = true;
          registerProviderFailure(ocrErr, i);
        }
      }

      updatedItems[itemIndex] = {
        ...updatedItems[itemIndex],
        extractedText: extractedText.slice(0, 50000), // Truncate very long texts
        summary: summary || `Document processed (${extractedText.length} chars extracted)`,
      };

      processedCount++;
      // Reset breaker only when this file had zero provider failures
      if (!providerFailureInFile) {
        consecutiveProviderFailures = 0;
      }
    } catch (err) {
      console.error(`[Pipeline] OCR failed for ${file.name}:`, err);
      updatedItems[itemIndex] = {
        ...updatedItems[itemIndex],
        extractedText: `[OCR failed: ${err instanceof Error ? err.message : 'Unknown error'}]`,
        summary: 'Text extraction failed — document may be corrupted or unsupported format',
      };

      // Circuit breaker for outer catch (transcription / OCR primary failures)
      if (registerProviderFailure(err, i)) break;
    }
  }

  return {
    ...state,
    inventory: updatedItems,
    stages: state.stages.map((s) =>
      s.id === 'extraction'
        ? {
            ...s,
            status: 'completed' as const,
            completedAt: Date.now(),
            output: { processedCount, totalCount },
          }
        : s
    ),
  };
};

// ── Stage 2: Indexing ─────────────────────────────────────────────────────────

export const runIndexingStage = async (state: PipelineState): Promise<PipelineState> => {
  try {
    const itemsPayload = state.inventory.map((item) => ({
      id: item.id,
      fileName: item.fileName,
      currentCategory: item.category,
      summary: item.summary || '',
    }));

    const prompt = `You are a legal document indexing specialist. Review these documents and assign each the most accurate category.

Categories: police-report, witness-statement, medical-record, photo, video, audio, correspondence, legal-filing, evidence-log, other

Documents:
${JSON.stringify(itemsPayload, null, 2)}

Return JSON: { "items": [{ "id": string, "category": string, "confidence": number }] }`;

    const response = await deepseekChat({
      systemInstruction: 'You are a legal document indexing AI. Categorize documents accurately.',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.2,
      maxTokens: 2048,
      jsonMode: true,
      timeoutMs: 45000,
    });

    const parsed = parseDeepSeekJson<{ items?: { id: string; category: string; confidence: number }[] }>(
      response,
      { items: [] }
    );

    const catMap = new Map<string, string>();
    if (parsed.items) {
      parsed.items.forEach((item) => {
        catMap.set(item.id, item.category);
      });
    }

    const updatedInventory = state.inventory.map((item) => {
      const newCat = catMap.get(item.id);
      return newCat ? { ...item, category: newCat } : item;
    });

    return stageComplete(
      { ...state, inventory: updatedInventory },
      'indexing',
      { recategorizedCount: catMap.size }
    );
  } catch (e) {
    return stageError(state, 'indexing', e instanceof Error ? e.message : String(e));
  }
};

// ── Stage 3: Entity Extraction ────────────────────────────────────────────────

export const runEntityExtractionStage = async (state: PipelineState): Promise<PipelineState> => {
  try {
    const textBlock = aggregateInventoryText(state);

    const prompt = `Extract all people, organizations, locations, statutes, and key dates from the following legal documents.

Text:
${textBlock.slice(0, 8000)}

Return JSON: { "entities": [{ "name": string, "type": "person"|"organization"|"location"|"date"|"statute"|"case-law", "role": string, "mentions": number, "documents": string[] }] }
- role: "witness"|"opposing-party"|"victim"|"officer"|"expert"|"judge"|"other"
- documents: array of inventory item IDs from the text`;

    const response = await deepseekChat({
      systemInstruction: 'You are an entity extraction AI for legal documents. Extract all named entities.',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.2,
      maxTokens: 2048,
      jsonMode: true,
      timeoutMs: 45000,
    });

    const parsed = parseDeepSeekJson<{ entities?: PipelineEntity[] }>(
      response,
      { entities: [] }
    );

    const entities = (parsed.entities || []).map((e) => ({
      name: e.name,
      type: e.type,
      role: e.role || 'other',
      mentions: e.mentions || 1,
      documents: e.documents || [],
    }));

    return stageComplete(
      { ...state, entities },
      'entities',
      { entityCount: entities.length }
    );
  } catch (e) {
    return stageError(state, 'entities', e instanceof Error ? e.message : String(e));
  }
};

// ── Stage 4: Chronology ───────────────────────────────────────────────────────

export const runChronologyStage = async (state: PipelineState): Promise<PipelineState> => {
  try {
    const textBlock = aggregateInventoryText(state);

    const prompt = `Build a chronological timeline from the following legal document texts. Identify each event with a date, title, and description.

Text:
${textBlock.slice(0, 8000)}

Return JSON: { "entries": [{ "date": string, "title": string, "description": string, "source": string, "confidence": "high"|"medium"|"low" }] }
- date: ISO format or "YYYY-MM-DD" or approximate like "June 2024"
- source: inventory item ID from the text
- confidence: how certain the date is`;

    const response = await deepseekChat({
      systemInstruction: 'You are a legal chronology AI. Build accurate timelines from document evidence.',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.2,
      maxTokens: 2048,
      jsonMode: true,
      timeoutMs: 45000,
    });

    const parsed = parseDeepSeekJson<{ entries?: PipelineChronologyEntry[] }>(
      response,
      { entries: [] }
    );

    const entries = (parsed.entries || []).sort((a, b) => {
      const da = new Date(a.date).getTime();
      const db = new Date(b.date).getTime();
      if (isNaN(da) && isNaN(db)) return 0;
      if (isNaN(da)) return 1;
      if (isNaN(db)) return -1;
      return da - db;
    });

    return stageComplete(
      { ...state, chronology: entries },
      'chronology',
      { entryCount: entries.length }
    );
  } catch (e) {
    return stageError(state, 'chronology', e instanceof Error ? e.message : String(e));
  }
};

// ── Stage 5: Contradictions ───────────────────────────────────────────────────

export const runContradictionStage = async (state: PipelineState): Promise<PipelineState> => {
  try {
    const textBlock = aggregateInventoryText(state);

    const prompt = `Cross-reference all documents below and identify factual contradictions and inconsistencies.

Documents:
${textBlock.slice(0, 8000)}

Return JSON: { "contradictions": [{ "id": string, "description": string, "severity": "critical"|"high"|"medium"|"low", "sourceA": string, "sourceB": string, "detail": string, "implication": string }] }
- id: a short kebab-case identifier
- sourceA/sourceB: inventory item IDs
- detail: specific facts that conflict
- implication: what this contradiction means for the case`;

    const response = await deepseekChat({
      systemInstruction: 'You are a legal contradiction detection AI. Find inconsistencies in evidence.',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
      maxTokens: 2048,
      jsonMode: true,
      timeoutMs: 45000,
    });

    const parsed = parseDeepSeekJson<{ contradictions?: PipelineContradiction[] }>(
      response,
      { contradictions: [] }
    );

    return stageComplete(
      { ...state, contradictions: parsed.contradictions || [] },
      'contradictions',
      { count: (parsed.contradictions || []).length }
    );
  } catch (e) {
    return stageError(state, 'contradictions', e instanceof Error ? e.message : String(e));
  }
};

// ── Stage 6: Constitutional Issues ─────────────────────────────────────────────

export const runConstitutionalStage = async (state: PipelineState): Promise<PipelineState> => {
  try {
    const textBlock = aggregateInventoryText(state);

    const prompt = `Analyze the following case documents for constitutional issues related to:
- 4th Amendment: Search and seizure
- 5th Amendment: Self-incrimination, due process, double jeopardy
- 6th Amendment: Right to counsel, speedy trial, confrontation
- 8th Amendment: Excessive bail, cruel and unusual punishment
- 14th Amendment: Equal protection, due process

Documents:
${textBlock.slice(0, 6000)}

Context: ${state.caseTitle}

Return JSON: { "issues": [{ "amendment": string, "issue": string, "description": string, "severity": "critical"|"high"|"medium"|"low", "recommendation": string, "relevantFacts": string[] }] }
- amendment: "4th", "5th", "6th", "8th", or "14th"
- relevantFacts: specific facts from documents supporting the issue`;

    const response = await deepseekChat({
      systemInstruction: 'You are a constitutional law expert AI. Identify constitutional issues in criminal and civil cases.',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
      maxTokens: 2048,
      jsonMode: true,
      timeoutMs: 45000,
    });

    const parsed = parseDeepSeekJson<{ issues?: PipelineConstitutionalIssue[] }>(
      response,
      { issues: [] }
    );

    return stageComplete(
      { ...state, constitutionalIssues: parsed.issues || [] },
      'constitutional',
      { count: (parsed.issues || []).length }
    );
  } catch (e) {
    return stageError(state, 'constitutional', e instanceof Error ? e.message : String(e));
  }
};

// ── Stage 7: Motions ──────────────────────────────────────────────────────────

export const runMotionsStage = async (state: PipelineState): Promise<PipelineState> => {
  try {
    const textBlock = aggregateInventoryText(state);

    const contradictionsSummary = state.contradictions
      .map((c) => `[${c.severity}] ${c.description}`)
      .join('\n');

    const constitutionalSummary = state.constitutionalIssues
      .map((ci) => `[${ci.amendment}] ${ci.issue}: ${ci.description}`)
      .join('\n');

    const knownEntities = state.entities
      .map((e) => `${e.name} (${e.type}${e.role ? `, ${e.role}` : ''})`)
      .join(', ');

    const prompt = `Based on the case analysis below, draft relevant legal motions. For each motion, provide a title, type, priority, legal basis, and 2-4 paragraphs of substantive legal argument as draft content.

Case: ${state.caseTitle}
Entities: ${knownEntities}

Documents:
${textBlock.slice(0, 5000)}

Contradictions found:
${contradictionsSummary || 'None identified'}

Constitutional issues:
${constitutionalSummary || 'None identified'}

Return JSON: { "motions": [{ "title": string, "type": "motion-to-suppress"|"motion-to-dismiss"|"motion-in-limine"|"motion-for-summary-judgment"|"other", "priority": "critical"|"high"|"medium"|"low", "basis": string, "draftContent": string }] }
- draftContent: 2-4 paragraphs of substantive legal argument and citations`;

    const response = await deepseekChat({
      systemInstruction: 'You are a senior trial attorney AI. Draft substantive legal motions based on case analysis.',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.5,
      maxTokens: 3072,
      jsonMode: true,
      timeoutMs: 45000,
    });

    const parsed = parseDeepSeekJson<{ motions?: PipelineMotion[] }>(
      response,
      { motions: [] }
    );

    return stageComplete(
      { ...state, motions: parsed.motions || [] },
      'motions',
      { count: (parsed.motions || []).length }
    );
  } catch (e) {
    return stageError(state, 'motions', e instanceof Error ? e.message : String(e));
  }
};

// ── Stage 8: Discovery Planning ───────────────────────────────────────────────

export const runDiscoveryPlanningStage = async (state: PipelineState): Promise<PipelineState> => {
  try {
    const textBlock = aggregateInventoryText(state);
    const entityNames = state.entities.map((e) => e.name).join(', ');

    const gapsSummary = state.gaps.length > 0
      ? state.gaps.map((g) => `[${g.severity}] ${g.description}`).join('\n')
      : 'No gaps identified yet';

    const prompt = `Based on this legal case, recommend discovery items including interrogatories, requests for production, requests for admission, subpoenas, and deposition notices.

Case: ${state.caseTitle}
Known entities: ${entityNames}
Evidence gaps: ${gapsSummary}

Documents:
${textBlock.slice(0, 4000)}

Return JSON: { "items": [{ "type": "interrogatory"|"request-for-production"|"request-for-admission"|"subpoena"|"deposition-notice", "target": string, "description": string, "priority": "critical"|"high"|"medium"|"low", "draftContent": string }] }
- target: who or what the discovery is directed at
- draftContent: 1-2 paragraphs of actual discovery request language`;

    const response = await deepseekChat({
      systemInstruction: 'You are a discovery planning AI for litigation. Draft discovery requests.',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.5,
      maxTokens: 2048,
      jsonMode: true,
      timeoutMs: 45000,
    });

    const parsed = parseDeepSeekJson<{ items?: PipelineDiscoveryItem[] }>(
      response,
      { items: [] }
    );

    return stageComplete(
      { ...state, discoveryItems: parsed.items || [] },
      'discovery-plan',
      { count: (parsed.items || []).length }
    );
  } catch (e) {
    return stageError(state, 'discovery-plan', e instanceof Error ? e.message : String(e));
  }
};

// ── Stage 9: Gap Analysis ─────────────────────────────────────────────────────

export const runGapAnalysisStage = async (state: PipelineState): Promise<PipelineState> => {
  try {
    const textBlock = aggregateInventoryText(state);
    const entityNames = state.entities.map((e) => e.name).join(', ');

    const prompt = `Analyze this legal case for missing evidence, witnesses, documents, or incomplete records. Identify what is needed but absent.

Case: ${state.caseTitle}
Entities: ${entityNames}

Documents:
${textBlock.slice(0, 6000)}

Return JSON: { "gaps": [{ "description": string, "category": "missing-evidence"|"missing-witness"|"missing-document"|"incomplete-record"|"chain-of-custody"|"other", "severity": "critical"|"high"|"medium"|"low", "recommendation": string }] }`;

    const response = await deepseekChat({
      systemInstruction: 'You are an evidence gap analysis AI for litigation. Identify what is missing from the case file.',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.5,
      maxTokens: 2048,
      jsonMode: true,
      timeoutMs: 45000,
    });

    const parsed = parseDeepSeekJson<{ gaps?: PipelineGap[] }>(
      response,
      { gaps: [] }
    );

    return stageComplete(
      { ...state, gaps: parsed.gaps || [] },
      'gap-analysis',
      { count: (parsed.gaps || []).length }
    );
  } catch (e) {
    return stageError(state, 'gap-analysis', e instanceof Error ? e.message : String(e));
  }
};

// ── Stage 10: Impeachment ─────────────────────────────────────────────────────

export const runImpeachmentStage = async (state: PipelineState): Promise<PipelineState> => {
  try {
    const textBlock = aggregateInventoryText(state);

    const contradictionsSummary = state.contradictions
      .map((c) => `[${c.severity}|${c.sourceA}/${c.sourceB}] ${c.description}: ${c.detail}`)
      .join('\n');

    const prompt = `Based on the case documents and identified contradictions, find impeachment material — prior inconsistent statements, biases, credibility issues that can be used to impeach witnesses.

Documents:
${textBlock.slice(0, 6000)}

Contradictions:
${contradictionsSummary || 'None identified'}

Return JSON: { "impeachments": [{ "targetName": string, "targetRole": string, "statement": string, "source": string, "contradiction": string, "impeachmentValue": "critical"|"high"|"medium"|"low", "suggestedQuestions": string[] }] }
- statement: the statement that can be used for impeachment
- source: inventory item ID
- contradiction: what it contradicts
- suggestedQuestions: 3-5 cross-examination questions to impeach`;

    const response = await deepseekChat({
      systemInstruction: 'You are a cross-examination and impeachment AI for trial attorneys. Find impeachment material.',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.5,
      maxTokens: 2048,
      jsonMode: true,
      timeoutMs: 45000,
    });

    const parsed = parseDeepSeekJson<{ impeachments?: PipelineImpeachment[] }>(
      response,
      { impeachments: [] }
    );

    return stageComplete(
      { ...state, impeachments: parsed.impeachments || [] },
      'impeachment',
      { count: (parsed.impeachments || []).length }
    );
  } catch (e) {
    return stageError(state, 'impeachment', e instanceof Error ? e.message : String(e));
  }
};

// ── Stage 11: Witness Questions ───────────────────────────────────────────────

export const runWitnessQuestionsStage = async (state: PipelineState): Promise<PipelineState> => {
  try {
    const textBlock = aggregateInventoryText(state);

    const entityNames = state.entities
      .filter((e) => e.type === 'person')
      .map((e) => `${e.name} (${e.role || 'unknown role'})`)
      .join('\n');

    const contradictionsSummary = state.contradictions
      .slice(0, 10)
      .map((c) => `- ${c.description} [${c.severity}]`)
      .join('\n');

    const prompt = `Generate examination questions for all witnesses in this case. Include both direct examination and cross-examination questions.

Case: ${state.caseTitle}

Witnesses/People:
${entityNames || 'No entities extracted'}

Contradictions:
${contradictionsSummary || 'None'}

Documents:
${textBlock.slice(0, 4000)}

Return JSON: { "witnessQuestions": [{ "witnessName": string, "witnessRole": string, "directExamination": string[], "crossExamination": string[], "keyTopics": string[] }] }
- directExamination: 5-8 questions for direct
- crossExamination: 5-8 questions for cross
- keyTopics: 3-5 key topic areas for this witness`;

    const response = await deepseekChat({
      systemInstruction: 'You are a trial preparation AI. Generate examination questions for witnesses.',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.5,
      maxTokens: 3072,
      jsonMode: true,
      timeoutMs: 45000,
    });

    const parsed = parseDeepSeekJson<{ witnessQuestions?: PipelineWitnessQuestions[] }>(
      response,
      { witnessQuestions: [] }
    );

    return stageComplete(
      { ...state, witnessQuestions: parsed.witnessQuestions || [] },
      'witness-questions',
      { witnessCount: (parsed.witnessQuestions || []).length }
    );
  } catch (e) {
    return stageError(state, 'witness-questions', e instanceof Error ? e.message : String(e));
  }
};

// ── Stage 12: Final Briefing ──────────────────────────────────────────────────

export const runBriefingStage = async (state: PipelineState): Promise<PipelineState> => {
  try {
    const textBlock = aggregateInventoryText(state);

    const contradictionsSummary = state.contradictions
      .slice(0, 15)
      .map((c) => `- [${c.severity}] ${c.description}\n  Detail: ${c.detail}\n  Implication: ${c.implication}`)
      .join('\n\n');

    const constitutionalSummary = state.constitutionalIssues
      .slice(0, 10)
      .map((ci) => `- [${ci.severity}] ${ci.amendment} Amendment: ${ci.issue}\n  ${ci.description}`)
      .join('\n');

    const motionsSummary = state.motions
      .slice(0, 8)
      .map((m) => `- [${m.priority}] ${m.title} (${m.type}): ${m.basis}`)
      .join('\n');

    const gapsSummary = state.gaps
      .slice(0, 10)
      .map((g) => `- [${g.severity}] ${g.category}: ${g.description}`)
      .join('\n');

    const impeachmentsSummary = state.impeachments
      .slice(0, 8)
      .map((i) => `- [${i.impeachmentValue}] ${i.targetName} (${i.targetRole}): ${i.contradiction}`)
      .join('\n');

    const entityNames = state.entities.map((e) => `${e.name} (${e.type}${e.role ? `, ${e.role}` : ''})`).join(', ');

    const chronologySummary = state.chronology
      .slice(0, 10)
      .map((e) => `${e.date}: ${e.title}`)
      .join('\n');

    const prompt = `You are the lead trial attorney preparing your morning briefing. Compile a comprehensive final briefing from ALL pipeline outputs below.

Case: ${state.caseTitle}
Documents analyzed: ${state.inventory.length}
Entities: ${entityNames}

--- CHRONOLOGY ---
${chronologySummary || 'N/A'}

--- CONTRADICTIONS ---
${contradictionsSummary || 'None identified'}

--- CONSTITUTIONAL ISSUES ---
${constitutionalSummary || 'None identified'}

--- RECOMMENDED MOTIONS ---
${motionsSummary || 'None drafted'}

--- EVIDENCE GAPS ---
${gapsSummary || 'None identified'}

--- IMPEACHMENT MATERIAL ---
${impeachmentsSummary || 'None identified'}

--- DOCUMENT SUMMARIES ---
${textBlock.slice(0, 3000)}

Return JSON: {
  "executiveSummary": string,
  "casePosture": string,
  "topRisks": string[],
  "topOpportunities": string[],
  "keyFindings": string[],
  "recommendedActions": [{ "action": string, "priority": "critical"|"high"|"medium"|"low", "assignedTo": string }],
  "nextSteps": string[]
}

- executiveSummary: 2-3 paragraphs overview of the case and key insights from the pipeline
- casePosture: honest assessment of where the case stands
- topRisks: 3-5 most significant risks
- topOpportunities: 3-5 best opportunities
- keyFindings: 5-8 most important findings from all analysis
- recommendedActions: concrete actions with priority and assignment
- nextSteps: 3-5 immediate next steps`;

    const response = await deepseekChat({
      systemInstruction: 'You are a senior trial attorney AI compiling a comprehensive case briefing. Be thorough, strategic, and actionable.',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.6,
      maxTokens: 4096,
      jsonMode: true,
      timeoutMs: 90000,
    });

    const parsed = parseDeepSeekJson<Partial<PipelineBriefing>>(response, {
      executiveSummary: 'Briefing generation failed. Please review pipeline stages manually.',
      casePosture: 'Unable to determine',
      topRisks: [],
      topOpportunities: [],
      keyFindings: [],
      recommendedActions: [],
      nextSteps: [],
      generatedAt: Date.now(),
    });

    const briefing: PipelineBriefing = {
      executiveSummary: parsed.executiveSummary || 'No summary available.',
      casePosture: parsed.casePosture || 'Undetermined',
      topRisks: parsed.topRisks || [],
      topOpportunities: parsed.topOpportunities || [],
      keyFindings: parsed.keyFindings || [],
      recommendedActions: parsed.recommendedActions || [],
      nextSteps: parsed.nextSteps || [],
      generatedAt: Date.now(),
    };

    return stageComplete(
      { ...state, briefing },
      'briefing',
      { generated: true }
    );
  } catch (e) {
    return stageError(state, 'briefing', e instanceof Error ? e.message : String(e));
  }
};

// ── Main Orchestrator ─────────────────────────────────────────────────────────

const STAGE_TIMEOUTS: Partial<Record<PipelineStageId, number>> = {
  briefing: 90000,
};

const DEFAULT_STAGE_TIMEOUT = 45000;

export const runPipeline = async (
  caseId: string,
  caseTitle: string,
  files: File[],
  onProgress: (state: PipelineState) => void,
  signal?: AbortSignal
): Promise<PipelineState> => {
  let state = createPipelineState(caseId, caseTitle);
  state.status = 'running';
  state.startedAt = Date.now();
  savePipelineState(caseId, state);
  onProgress(state);

  const stageOrder: PipelineStageId[] = [
    'inventory',
    'extraction',
    'indexing',
    'entities',
    'chronology',
    'contradictions',
    'constitutional',
    'motions',
    'discovery-plan',
    'gap-analysis',
    'impeachment',
    'witness-questions',
    'briefing',
  ];

  for (const stageId of stageOrder) {
    if (signal?.aborted) {
      state = updateStage(state, stageId, { status: 'skipped' });
      continue;
    }

    state = updateStage(state, stageId, { status: 'running', startedAt: Date.now() });
    savePipelineState(caseId, state);
    onProgress(state);

    try {
      switch (stageId) {
        case 'inventory':
          state = runInventoryStage(state, files);
          break;

        case 'extraction':
          state = await runExtractionStage(state, files);
          break;

        case 'indexing':
          state = await runIndexingStage(state);
          break;

        case 'entities':
          state = await runEntityExtractionStage(state);
          break;

        case 'chronology':
          state = await runChronologyStage(state);
          break;

        case 'contradictions':
          state = await runContradictionStage(state);
          break;

        case 'constitutional':
          state = await runConstitutionalStage(state);
          break;

        case 'motions':
          state = await runMotionsStage(state);
          break;

        case 'discovery-plan':
          state = await runDiscoveryPlanningStage(state);
          break;

        case 'gap-analysis':
          state = await runGapAnalysisStage(state);
          break;

        case 'impeachment':
          state = await runImpeachmentStage(state);
          break;

        case 'witness-questions':
          state = await runWitnessQuestionsStage(state);
          break;

        case 'briefing':
          state = await runBriefingStage(state);
          break;

        default:
          state = stageError(state, stageId, `Unknown stage: ${stageId}`);
      }
    } catch (e) {
      state = stageError(state, stageId, e instanceof Error ? e.message : String(e));
    }

    savePipelineState(caseId, state);
    onProgress(state);
  }

  if (signal?.aborted) {
    state.status = 'cancelled';
  } else {
    const hasErrors = state.stages.some((s) => s.status === 'error');
    state.status = hasErrors ? 'error' : 'completed';
  }
  state.completedAt = Date.now();
  savePipelineState(caseId, state);
  onProgress(state);

  return state;
};

// ── Re-export for convenience ─────────────────────────────────────────────────

// ── Understanding Synthesis ────────────────────────────────────────────────────

export interface UnderstandingReport {
  executiveSummary: string;
  confidenceScore: number;
  whatWeKnow: {
    category: string;
    items: { finding: string; confidence: number; source: string }[];
  }[];
  keyPlayers: {
    name: string;
    role: string;
    relevance: string;
    connections: string[];
  }[];
  timelineNarrative: string;
  contradictions: {
    description: string;
    significance: string;
    resolution: string;
  }[];
  whatWeDontKnow: string[];
  recommendedInvestigations: {
    action: string;
    reason: string;
    priority: 'critical' | 'high' | 'medium' | 'low';
  }[];
  generatedAt: number;
}

export const generateUnderstandingReport = async (
  state: PipelineState
): Promise<UnderstandingReport> => {
  const context = buildCaseContext(
    { title: state.caseTitle, client: '', status: '' as any, opposingCounsel: '', judge: '', nextCourtDate: '', summary: '', winProbability: 0 } as any,
    state
  );

  const prompt = `You are an intelligence analyst for CaseBuddy. You have just finished processing a legal case through a multi-stage AI pipeline. Synthesize EVERYTHING into a single comprehensive understanding report.

Your job: tell me what the system actually UNDERSTOOD from all these documents.

CASE DATA:
${context}

Produce a JSON object with these exact fields:
{
  "executiveSummary": "2-3 paragraph executive summary of what we know about this case",
  "confidenceScore": 65,
  "whatWeKnow": [
    {
      "category": "string",
      "items": [
        { "finding": "string", "confidence": 85, "source": "which doc/entity" }
      ]
    }
  ],
  "keyPlayers": [
    {
      "name": "string",
      "role": "string",
      "relevance": "string",
      "connections": ["other player names"]
    }
  ],
  "timelineNarrative": "narrative prose telling the story of this case chronologically",
  "contradictions": [
    {
      "description": "string",
      "significance": "string",
      "resolution": "string"
    }
  ],
  "whatWeDontKnow": ["string", "string"],
  "recommendedInvestigations": [
    {
      "action": "string",
      "reason": "string",
      "priority": "critical"
    }
  ]
}

IMPORTANT RULES:
- Base everything on the actual pipeline data provided. Do NOT invent facts.
- If the pipeline data is sparse or low-quality, reflect that in lower confidence scores.
- whatWeKnow should be organized by category (Incident, Witnesses, Evidence, Timeline, Legal Issues, etc.)
- whatWeDontKnow is just as important as whatWeKnow — be honest about gaps.
- recommendedInvestigations should be specific and actionable.
- confidenceScore should reflect how complete and consistent the evidence is.
`;

  const response = await deepseekChat({
    systemInstruction: 'You are a legal intelligence analyst. Synthesize evidence into actionable understanding reports. Be precise, honest about gaps, and never invent facts.',
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.4,
    maxTokens: 4096,
    jsonMode: true,
    timeoutMs: 60000,
  });

  const parsed = parseDeepSeekJson<UnderstandingReport>(response, {
    executiveSummary: 'Unable to generate understanding report.',
    confidenceScore: 30,
    whatWeKnow: [],
    keyPlayers: [],
    timelineNarrative: '',
    contradictions: [],
    whatWeDontKnow: ['Report generation failed — try again.'],
    recommendedInvestigations: [],
    generatedAt: Date.now(),
  });

  parsed.generatedAt = Date.now();
  return parsed;
};

export { PIPELINE_STAGES };

// ── Background Pipeline Scheduler ──────────────────────────────────────────────

/**
 * Schedule the pipeline to run in the background via the background agent engine.
 * Stages 0-1 (inventory + real OCR) run immediately on the UI thread.
 * Stages 2-12 run asynchronously in the background engine.
 * The UI polls localStorage for progress updates.
 */
export const scheduleBackgroundPipeline = (
  caseId: string,
  caseTitle: string,
  files: File[]
): Promise<{ taskId: string; state: PipelineState }> => {
  return new Promise(async (resolve, reject) => {
    try {
      // Phase 1: Run inventory + real OCR on the UI thread
      let state = createPipelineState(caseId, caseTitle);
      state.status = 'running';
      state.startedAt = Date.now();

      // Stage 0: Inventory (sync)
      state = updateStage(state, 'inventory', { status: 'running', startedAt: Date.now() });
      state = runInventoryStage(state, files);
      state = updateStage(state, 'inventory', {
        status: 'completed',
        completedAt: Date.now(),
        output: { itemCount: state.inventory.length },
      });
      savePipelineState(caseId, state);

      // Stage 1: Real OCR extraction (async, UI thread)
      state = updateStage(state, 'extraction', { status: 'running', startedAt: Date.now() });
      state = await runExtractionStage(state, files);
      savePipelineState(caseId, state);

      // Phase 2: Schedule remaining stages 2-12 in the background
      state.currentStageId = 'indexing';
      savePipelineState(caseId, state);

      const taskId = backgroundEngine.schedule({
        agentId: 'maya',
        caseId,
        taskType: 'workflow' as any, // Use existing workflow type — engine handles it
        schedule: 'immediate',
        priority: 'high',
        description: `Case Pipeline: ${caseTitle}`,
        // Store the pipeline metadata so the engine can resume
        result: {
          pipelineState: state,
          files: [], // Files already processed, not needed for remaining stages
          onProgressKey: storageKey(caseId),
        },
      });

      resolve({ taskId, state });
    } catch (err) {
      reject(err);
    }
  });
};

/**
 * Resume a background pipeline from stages 2-12.
 * Called by the background agent engine when it picks up the task.
 */
export const resumeBackgroundPipeline = async (
  caseId: string,
  caseTitle: string,
  onProgress: (state: PipelineState) => void,
  signal?: AbortSignal
): Promise<PipelineState> => {
  let state = loadPipelineState(caseId);
  if (!state) throw new Error('No pipeline state found');

  state.status = 'running';
  savePipelineState(caseId, state);
  onProgress(state);

  const stageOrder: PipelineStageId[] = [
    'indexing',
    'entities',
    'chronology',
    'contradictions',
    'constitutional',
    'motions',
    'discovery-plan',
    'gap-analysis',
    'impeachment',
    'witness-questions',
    'briefing',
  ];

  for (const stageId of stageOrder) {
    if (signal?.aborted) {
      state = updateStage(state, stageId, { status: 'skipped' });
      continue;
    }

    // Skip already-completed stages
    const existingStage = state.stages.find(s => s.id === stageId);
    if (existingStage?.status === 'completed') continue;

    state = updateStage(state, stageId, { status: 'running', startedAt: Date.now() });
    state.currentStageId = stageId;
    savePipelineState(caseId, state);
    onProgress(state);

    try {
      switch (stageId) {
        case 'indexing':
          state = await runIndexingStage(state);
          break;
        case 'entities':
          state = await runEntityExtractionStage(state);
          break;
        case 'chronology':
          state = await runChronologyStage(state);
          break;
        case 'contradictions':
          state = await runContradictionStage(state);
          break;
        case 'constitutional':
          state = await runConstitutionalStage(state);
          break;
        case 'motions':
          state = await runMotionsStage(state);
          break;
        case 'discovery-plan':
          state = await runDiscoveryPlanningStage(state);
          break;
        case 'gap-analysis':
          state = await runGapAnalysisStage(state);
          break;
        case 'impeachment':
          state = await runImpeachmentStage(state);
          break;
        case 'witness-questions':
          state = await runWitnessQuestionsStage(state);
          break;
        case 'briefing':
          state = await runBriefingStage(state);
          break;
        default:
          state = stageError(state, stageId, `Unknown stage: ${stageId}`);
      }
    } catch (e) {
      state = stageError(state, stageId, e instanceof Error ? e.message : String(e));
    }

    savePipelineState(caseId, state);
    onProgress(state);
  }

  if (signal?.aborted) {
    state.status = 'cancelled';
  } else {
    const hasErrors = state.stages.some((s) => s.status === 'error');
    state.status = hasErrors ? 'error' : 'completed';
  }
  state.completedAt = Date.now();
  state.currentStageId = undefined;
  savePipelineState(caseId, state);
  onProgress(state);

  return state;
};
