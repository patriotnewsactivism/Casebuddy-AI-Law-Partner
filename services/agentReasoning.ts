/**
 * agentReasoning.ts — Extended reasoning modes for maximal legal analysis.
 *
 * Four modes:
 *  1. standard     — single-shot, fast
 *  2. deep-think   — multi-step chain-of-thought with optional self-critique
 *  3. expert-panel — parallel consultation of multiple legal specialists
 *  4. adversarial  — red-team (prosecution) vs blue-team (defense) analysis
 */

import { deepseekChat, parseDeepSeekJson } from './deepseek';
import { LEGAL_SPECIALISTS, getSpecialistById } from '../agents/personas';
import { buildMemoryContext, addInsight } from './agentMemory';
import { AGENT_CONFIG } from '../config/agentConfig';
import type { ReasoningMode, ReasoningResult, ReasoningStep } from '../types';

// ── Helpers ────────────────────────────────────────────────────────────────

function generateId(): string {
  return `rsn_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function selectRelevantSpecialists(task: string, count: number) {
  const taskLower = task.toLowerCase();
  const scored = LEGAL_SPECIALISTS.map(s => {
    let score = 0;
    if (taskLower.includes(s.practiceArea.toLowerCase())) score += 30;
    s.commonTopics.forEach(t => {
      if (taskLower.includes(t.toLowerCase().split(' ').slice(0, 2).join(' '))) score += 5;
    });
    return { specialist: s, score };
  });

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, count)
    .map(s => s.specialist);
}

// ── Standard reasoning (single-shot) ──────────────────────────────────────

async function standardReasoning(
  systemInstruction: string,
  task: string,
  memCtx: string,
  maxTokens: number
): Promise<ReasoningResult> {
  const start = Date.now();
  const synthesis = await deepseekChat({
    systemInstruction: systemInstruction + memCtx,
    messages: [{ role: 'user', content: task }],
    temperature: 0.7,
    maxTokens,
    timeoutMs: 30_000,
  });

  return {
    mode: 'standard',
    synthesis,
    confidence: 70,
    durationMs: Date.now() - start,
  };
}

// ── Deep-think (chain-of-thought) ─────────────────────────────────────────

async function deepThinkReasoning(
  systemInstruction: string,
  task: string,
  memCtx: string,
  steps: number,
  maxTokens: number,
  selfCritique: boolean
): Promise<ReasoningResult> {
  const start = Date.now();
  const reasoningSteps: ReasoningStep[] = [];

  // Step 1: Decompose the task into sub-questions
  const decompText = await deepseekChat({
    systemInstruction: systemInstruction + memCtx,
    messages: [
      {
        role: 'user',
        content: `Break down this legal task into exactly ${steps} sequential analysis steps. Return as a JSON array of strings.\n\nTask: ${task}`,
      },
    ],
    temperature: 0.3,
    maxTokens: 512,
    jsonMode: true,
    timeoutMs: 20_000,
  });

  const subtasks: string[] = parseDeepSeekJson<string[]>(decompText, [
    'Identify the key legal issues.',
    'Research relevant statutes and case law.',
    'Analyze strengths and weaknesses.',
    'Develop strategic recommendations.',
  ]).slice(0, steps);

  // Step 2: Execute each sub-task sequentially, feeding prior answers back
  const conversationHistory: { role: 'user' | 'assistant'; content: string }[] = [];

  for (const subtask of subtasks) {
    const stepStart = Date.now();

    conversationHistory.push({ role: 'user', content: subtask });

    const reasoning = await deepseekChat({
      systemInstruction: systemInstruction + memCtx + '\n\nThink carefully, step by step.',
      messages: conversationHistory,
      temperature: 0.4,
      maxTokens: Math.floor(maxTokens / steps),
      timeoutMs: 35_000,
    });

    conversationHistory.push({ role: 'assistant', content: reasoning });
    reasoningSteps.push({ subtask, reasoning, timestamp: stepStart });
  }

  // Step 3: Final synthesis from all reasoning steps
  const synthPrompt = `Based on the step-by-step analysis above, provide a comprehensive final recommendation with:\n1. Key conclusions\n2. Strategic action items\n3. Risk warnings\n\nOriginal task: ${task}`;

  conversationHistory.push({ role: 'user', content: synthPrompt });

  const synthesis = await deepseekChat({
    systemInstruction: systemInstruction + memCtx,
    messages: conversationHistory,
    temperature: 0.3,
    maxTokens: 1024,
    timeoutMs: 30_000,
  });

  // Step 4: Optional self-critique
  let critique: string | undefined;
  if (selfCritique) {
    critique = await deepseekChat({
      systemInstruction:
        'You are a critical legal reviewer with 30 years of experience. Identify weaknesses, gaps, incorrect assumptions, and overlooked risks in this analysis. Be direct and specific.',
      messages: [
        {
          role: 'user',
          content: `Review this legal analysis and identify its weaknesses:\n\nTask: ${task}\n\nAnalysis:\n${synthesis}`,
        },
      ],
      temperature: 0.6,
      maxTokens: 600,
      timeoutMs: 25_000,
    });
  }

  // Confidence scales with step count — more steps = higher confidence
  const confidence = Math.min(92, 60 + steps * 7 + (selfCritique ? 5 : 0));

  return {
    mode: 'deep-think',
    steps: reasoningSteps,
    synthesis,
    critique,
    confidence,
    durationMs: Date.now() - start,
  };
}

// ── Expert panel (multi-specialist parallel) ──────────────────────────────

async function expertPanelReasoning(
  task: string,
  caseContext: string,
  maxSpecialists: number
): Promise<ReasoningResult> {
  const start = Date.now();

  // Pick top relevant specialists
  const specialists = selectRelevantSpecialists(task, maxSpecialists);

  // Consult all specialists in parallel
  const perspectiveResults = await Promise.allSettled(
    specialists.map(s =>
      deepseekChat({
        systemInstruction: s.systemInstruction,
        messages: [
          {
            role: 'user',
            content: `${task}\n\nCase Context: ${caseContext}\n\nProvide your expert analysis from the perspective of your specific practice area.`,
          },
        ],
        temperature: 0.7,
        maxTokens: AGENT_CONFIG.reasoning.expertPanel.maxTokens,
        timeoutMs: 40_000,
      })
    )
  );

  const perspectives = perspectiveResults
    .map((r, i) => ({
      specialistId: specialists[i].id,
      specialistName: specialists[i].name,
      response: r.status === 'fulfilled' ? r.value : `${specialists[i].name} was unavailable.`,
    }))
    .filter(p => !p.response.includes('was unavailable'));

  // Synthesize panel consensus
  const panelDebate = perspectives
    .map(p => `**${p.specialistName} (${getSpecialistById(p.specialistId)?.practiceArea}):**\n${p.response}`)
    .join('\n\n---\n\n');

  const synthesis = await deepseekChat({
    systemInstruction:
      'You are the senior managing partner synthesizing input from your legal team. Distill the panel\'s diverse perspectives into one strategic recommendation. Identify consensus, flag conflicts, and provide a clear action plan.',
    messages: [
      {
        role: 'user',
        content: `Task: ${task}\n\nExpert Panel Analysis:\n\n${panelDebate}\n\nSynthesize into a unified strategic recommendation.`,
      },
    ],
    temperature: 0.35,
    maxTokens: 1024,
    timeoutMs: 30_000,
  });

  return {
    mode: 'expert-panel',
    synthesis,
    perspectives,
    confidence: Math.min(90, 65 + perspectives.length * 6),
    durationMs: Date.now() - start,
  };
}

// ── Adversarial (red vs blue) ──────────────────────────────────────────────

async function adversarialReasoning(
  systemInstruction: string,
  task: string,
  caseContext: string,
  memCtx: string,
  maxTokens: number
): Promise<ReasoningResult> {
  const start = Date.now();

  // Red team: find vulnerabilities / opposing arguments
  const [redTeam, blueTeam] = await Promise.all([
    deepseekChat({
      systemInstruction:
        'You are the most aggressive opposing counsel imaginable. Your job is to ATTACK this legal position. Find every weakness, every vulnerability, every argument the other side will use against us. Be ruthless.',
      messages: [
        {
          role: 'user',
          content: `Attack this legal position as thoroughly as possible:\n\nTask: ${task}\n\nCase: ${caseContext}`,
        },
      ],
      temperature: 0.8,
      maxTokens: Math.floor(maxTokens / 2),
      timeoutMs: 35_000,
    }),
    deepseekChat({
      systemInstruction: systemInstruction + memCtx,
      messages: [
        {
          role: 'user',
          content: `Build the strongest possible defense of this position:\n\n${task}\n\nCase: ${caseContext}`,
        },
      ],
      temperature: 0.6,
      maxTokens: Math.floor(maxTokens / 2),
      timeoutMs: 35_000,
    }),
  ]);

  // Synthesis: what survives adversarial scrutiny?
  const synthesis = await deepseekChat({
    systemInstruction:
      'You are a senior trial strategist who has heard both attack and defense arguments. Synthesize:\n1. What vulnerabilities must be addressed before trial\n2. What arguments are strong\n3. Overall risk assessment\n4. Recommended strategy',
    messages: [
      {
        role: 'user',
        content: `Task: ${task}\n\nOpposing Attack:\n${redTeam}\n\nOur Defense:\n${blueTeam}\n\nSynthesize a pragmatic strategy.`,
      },
    ],
    temperature: 0.3,
    maxTokens: 800,
    timeoutMs: 30_000,
  });

  return {
    mode: 'adversarial',
    steps: [
      { subtask: 'Opposing attack analysis', reasoning: redTeam, timestamp: start },
      { subtask: 'Defense position', reasoning: blueTeam, timestamp: start + 100 },
    ],
    synthesis,
    confidence: 85,
    durationMs: Date.now() - start,
  };
}

// ── Public API ─────────────────────────────────────────────────────────────

export interface ReasoningRequest {
  mode: ReasoningMode;
  agentId: string;
  caseId: string;
  systemInstruction: string;
  task: string;
  caseContext?: string;
}

/**
 * Main entry point. Dispatches to the appropriate reasoning mode.
 * Saves the resulting insight to agent memory automatically.
 */
export async function runReasoning(req: ReasoningRequest): Promise<ReasoningResult> {
  const {
    mode,
    agentId,
    caseId,
    systemInstruction,
    task,
    caseContext = '',
  } = req;

  // Inject long-term memory context
  const memCtx = await buildMemoryContext(agentId, caseId);

  const cfg = AGENT_CONFIG.reasoning;
  let result: ReasoningResult;

  switch (mode) {
    case 'deep-think':
      result = await deepThinkReasoning(
        systemInstruction,
        task,
        memCtx,
        cfg.deepThink.steps ?? 4,
        cfg.deepThink.maxTokens,
        cfg.deepThink.selfCritique ?? true
      );
      break;

    case 'expert-panel':
      result = await expertPanelReasoning(task, caseContext, 3);
      break;

    case 'adversarial':
      result = await adversarialReasoning(
        systemInstruction,
        task,
        caseContext,
        memCtx,
        cfg.adversarial.maxTokens
      );
      break;

    default:
      result = await standardReasoning(
        systemInstruction,
        task,
        memCtx,
        cfg.standard.maxTokens
      );
  }

  // Persist insight from this reasoning run
  await addInsight(agentId, caseId, {
    agentId,
    caseId,
    title: `${mode.charAt(0).toUpperCase() + mode.slice(1)} Analysis`,
    content: result.synthesis.slice(0, 500),
    confidence: result.confidence,
    type: 'recommendation',
    source: 'analysis',
  });

  return result;
}

/**
 * Pick the best reasoning mode for a given task description automatically.
 */
export function selectReasoningMode(task: string, explicitMode?: ReasoningMode): ReasoningMode {
  if (explicitMode) return explicitMode;

  const t = task.toLowerCase();

  if (/settl|risk assess|adversar|vulnerab|attack|oppose/.test(t)) return 'adversarial';
  if (/multiple|all|team|perspective|panel|review committee/.test(t)) return 'expert-panel';
  if (
    /strateg|complu|compre|deep|thorough|analyz|motion|trial plan|full analysis/.test(t) &&
    task.length > 100
  )
    return 'deep-think';

  return 'standard';
}
