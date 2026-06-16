import { GoogleGenAI } from '@google/genai';
import { getAgentById, getSpecialistById, LEGAL_SPECIALISTS } from '../agents/personas';
import { retryWithBackoff, withTimeout } from '../utils/errorHandler';

// The firm's autonomous work engine. When a case is "deployed", the agents fire
// in conjunction: Maya summarizes and spots issues first, then Lex, Sol, Doc,
// the routed specialist, Jules and Rex all work the case in parallel off Maya's
// summary, and finally Sierra writes the client update from everyone's output.
// Each step streams its status so the UI can show the firm working live.

const getApiKey = () =>
  import.meta.env.VITE_GEMINI_API_KEY || import.meta.env.VITE_API_KEY || (window as any).__GEMINI_API_KEY || '';

// Lazy proxy so a fresh API key is used on every call (not stale from page load).
const ai = new Proxy({} as InstanceType<typeof GoogleGenAI>, {
  get(_target, prop) {
    return (new GoogleGenAI({ apiKey: getApiKey() }) as any)[prop];
  },
});

export type TaskStatus = 'queued' | 'working' | 'done' | 'error';

export interface WorkProduct {
  taskId: string;
  agentId: string;
  agentName: string;
  emoji: string;
  colorClass: string;
  title: string;
  status: TaskStatus;
  content: string;
  startedAt?: number;
  completedAt?: number;
}

const generate = async (prompt: string): Promise<string> => {
  return retryWithBackoff(async () => {
    const response = await withTimeout(
      ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: { parts: [{ text: prompt }] },
        config: { temperature: 0.6 },
      }),
      45000
    );
    return (response.text || '').trim();
  }, 2);
};

const FORMAT = `Format as tight, scannable markdown: a one-line takeaway, then short **bold** sub-headers with 2-4 bullet points each. No preamble, no sign-off, under 220 words. Be concrete and practical, not generic.`;

interface TaskDef {
  taskId: string;
  agentId: string;
  title: string;
  buildPrompt: (caseContext: string, maya: string) => string;
}

// Phase 1 — the root task everything else builds on.
const ROOT: TaskDef = {
  taskId: 'maya-summary',
  agentId: 'maya',
  title: 'Case Summary & Issue Spotting',
  buildPrompt: caseContext =>
    `You are Maya, the firm's intake specialist. Read this new case and produce an intake summary the rest of the firm will work from.\nCover: the core facts, the parties, the legal issues/claims you spot, what's strong, and what critical information is still missing.\n${FORMAT}\n\nCASE:\n${caseContext}`,
};

// Phase 2 — these run in parallel, each off Maya's summary.
const PARALLEL: TaskDef[] = [
  {
    taskId: 'lex-research',
    agentId: 'lex',
    title: 'Legal Research Memo',
    buildPrompt: (c, maya) =>
      `You are Lex, the firm's legal research lead. Based on the case and Maya's summary, give a research memo: the controlling law and doctrines, the elements that must be proven, and the kinds of leading cases/precedent that govern. Name doctrines specifically; flag the jurisdiction if known.\n${FORMAT}\n\nCASE:\n${c}\n\nMAYA'S SUMMARY:\n${maya}`,
  },
  {
    taskId: 'sol-deadlines',
    agentId: 'sol',
    title: 'Deadlines & Statute of Limitations',
    buildPrompt: (c, maya) =>
      `You are Sol, the firm's deadlines and statute-of-limitations tracker. Identify the applicable limitations period(s) for these claims, estimate the filing deadline window, and list any other looming dates. If the SOL may have run, say so loudly. Note assumptions where dates are unknown.\n${FORMAT}\n\nCASE:\n${c}\n\nMAYA'S SUMMARY:\n${maya}`,
  },
  {
    taskId: 'doc-draft',
    agentId: 'doc',
    title: 'First Draft on the Page',
    buildPrompt: (c, maya) =>
      `You are Doc, the firm's document lab director. Decide the single most useful first document for this case right now (e.g. demand letter, engagement memo, complaint outline, or preservation letter) and draft a strong opening of it — enough to show structure and the key arguments. Start by naming the document type in the takeaway line.\n${FORMAT}\n\nCASE:\n${c}\n\nMAYA'S SUMMARY:\n${maya}`,
  },
  {
    taskId: 'jules-jury',
    agentId: 'jules',
    title: 'Jury & Venue Read',
    buildPrompt: (c, maya) =>
      `You are Jules, the firm's jury psychologist. Give a read on how a jury/venue will hear this case: the sympathetic and unsympathetic angles, likely juror biases to manage, and the one narrative frame that wins. If it's unlikely to ever see a jury, say so and pivot to negotiation leverage.\n${FORMAT}\n\nCASE:\n${c}\n\nMAYA'S SUMMARY:\n${maya}`,
  },
  {
    taskId: 'rex-strategy',
    agentId: 'rex',
    title: 'Trial Strategy Outline',
    buildPrompt: (c, maya) =>
      `You are Rex, the firm's trial coach. Lay out an early strategy: the case theme in one sentence, the key witnesses/evidence to lock down, the biggest risks to neutralize, and the first three moves you'd make. Be direct and tactical.\n${FORMAT}\n\nCASE:\n${c}\n\nMAYA'S SUMMARY:\n${maya}`,
  },
];

// Phase 3 — synthesizes everyone's work for the client.
const CLOSER = {
  agentId: 'sierra',
  title: 'Client Update Letter',
};

const wpFromAgent = (taskId: string, agentId: string, title: string): WorkProduct => {
  const a = getAgentById(agentId);
  return {
    taskId,
    agentId,
    agentName: a?.name ?? agentId,
    emoji: a?.emoji ?? '⚖️',
    colorClass: a?.colorClass ?? 'text-gold-400',
    title,
    status: 'queued',
    content: '',
  };
};

const wpFromSpecialist = (specialistId: string): WorkProduct => {
  const s = getSpecialistById(specialistId) ?? LEGAL_SPECIALISTS[0];
  return {
    taskId: 'specialist-plan',
    agentId: s.id,
    agentName: s.name,
    emoji: s.emoji,
    colorClass: s.colorClass,
    title: `${s.practiceArea} Action Plan`,
    status: 'queued',
    content: '',
  };
};

/**
 * Run the full firm on a case. `onUpdate` fires every time any agent's status or
 * output changes, with a fresh snapshot of all work products.
 */
export const runOrchestration = async (
  caseContext: string,
  specialistId: string | undefined,
  onUpdate: (products: WorkProduct[]) => void
): Promise<WorkProduct[]> => {
  const specialist = getSpecialistById(specialistId || '') ?? LEGAL_SPECIALISTS.find(s => s.id === 'civil-litigation')!;

  const products: WorkProduct[] = [
    wpFromAgent(ROOT.taskId, ROOT.agentId, ROOT.title),
    ...PARALLEL.map(t => wpFromAgent(t.taskId, t.agentId, t.title)),
    wpFromSpecialist(specialist.id),
    wpFromAgent('sierra-update', CLOSER.agentId, CLOSER.title),
  ];
  const emit = () => onUpdate(products.map(p => ({ ...p })));
  const find = (id: string) => products.find(p => p.taskId === id)!;
  emit();

  const run = async (taskId: string, prompt: string) => {
    const wp = find(taskId);
    wp.status = 'working';
    wp.startedAt = Date.now();
    emit();
    try {
      wp.content = await generate(prompt);
      wp.status = 'done';
    } catch {
      wp.status = 'error';
      wp.content = 'This step hit an error. You can re-deploy the firm to retry.';
    }
    wp.completedAt = Date.now();
    emit();
  };

  // Phase 1 — Maya first.
  await run(ROOT.taskId, ROOT.buildPrompt(caseContext, ''));
  const maya = find(ROOT.taskId).content;

  // Phase 2 — the firm works in parallel off Maya's summary.
  const specialistPrompt = `You are ${specialist.name}, ${specialist.title}. ${specialist.systemInstruction.split('\n')[0]}\nBased on the case and Maya's summary, give YOUR department's action plan: the specific theories/claims to pursue in ${specialist.practiceArea}, the evidence to gather, and the next concrete steps. Speak in your voice.\n${FORMAT}\n\nCASE:\n${caseContext}\n\nMAYA'S SUMMARY:\n${maya}`;

  await Promise.all([
    ...PARALLEL.map(t => run(t.taskId, t.buildPrompt(caseContext, maya))),
    run('specialist-plan', specialistPrompt),
  ]);

  // Phase 3 — Sierra synthesizes a client-facing update.
  const others = products
    .filter(p => p.taskId !== 'sierra-update' && p.status === 'done')
    .map(p => `### ${p.agentName} — ${p.title}\n${p.content}`)
    .join('\n\n');
  const sierraPrompt = `You are Sierra, the firm's client-relations lead. Using the team's work below, write a warm, plain-English update letter to the client: what the firm has assessed, what it means for them, and the clear next steps. Reassuring and professional, no legalese, no false promises.\n${FORMAT}\n\nCASE:\n${caseContext}\n\nTEAM WORK:\n${others}`;
  await run('sierra-update', sierraPrompt);

  return products.map(p => ({ ...p }));
};

// ── Persistence (per case) ───────────────────────────────────────────────────
const runKey = (caseId: string) => `casebuddy_firm_run_${caseId}`;

export const saveRun = (caseId: string, products: WorkProduct[]) => {
  try {
    localStorage.setItem(runKey(caseId), JSON.stringify({ at: Date.now(), products }));
  } catch {
    /* storage full — ignore */
  }
};

export const loadRun = (caseId: string): { at: number; products: WorkProduct[] } | null => {
  try {
    const raw = localStorage.getItem(runKey(caseId));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};
