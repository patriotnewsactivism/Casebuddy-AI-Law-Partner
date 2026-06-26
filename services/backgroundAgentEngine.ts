/**
 * backgroundAgentEngine.ts — Schedules and executes background AI tasks.
 *
 * The engine runs entirely in the browser using setInterval scheduling.
 * It processes a priority queue of tasks, respecting concurrency limits
 * and per-task timeouts.
 *
 * Task types:
 *  monitor  — check deadlines / case health
 *  analyze  — deep case analysis
 *  draft    — proactively draft documents
 *  alert    — send user notifications
 *  research — background legal research
 *  workflow — trigger a multi-step workflow
 */

import { PriorityQueue } from '../utils/priorityQueue';
import { deepseekChat } from './deepseek';
import { recordAction, addInsight, loadMemory } from './agentMemory';
import { pushInsightAlert, pushTaskComplete, pushDeadlineAlert } from './notificationManager';
import { AGENT_CONFIG } from '../config/agentConfig';
import { getAgentById, OPERATIONAL_AGENTS } from '../agents/personas';
import { loadCases } from '../utils/storage';
import type {
  BackgroundTask,
  BackgroundTaskType,
  BackgroundTaskStatus,
  AgentStatus,
  Case,
  TaskPriority,
} from '../types';

// ── Storage ────────────────────────────────────────────────────────────────

const TASKS_KEY = 'cb_bg_tasks';
const STATUS_KEY = 'cb_agent_statuses';

function loadTasks(): BackgroundTask[] {
  try {
    return JSON.parse(localStorage.getItem(TASKS_KEY) ?? '[]');
  } catch {
    return [];
  }
}

function saveTasks(tasks: BackgroundTask[]): void {
  try {
    // Keep only last 200 tasks
    const trimmed = tasks.slice(-200);
    localStorage.setItem(TASKS_KEY, JSON.stringify(trimmed));
  } catch { /* storage full */ }
}

function loadStatuses(): Record<string, AgentStatus> {
  try {
    return JSON.parse(localStorage.getItem(STATUS_KEY) ?? '{}');
  } catch {
    return {};
  }
}

function saveStatuses(s: Record<string, AgentStatus>): void {
  try {
    localStorage.setItem(STATUS_KEY, JSON.stringify(s));
  } catch { /* ignore */ }
}

// ── Status subscriber ──────────────────────────────────────────────────────

type StatusListener = (statuses: AgentStatus[]) => void;
const statusListeners = new Set<StatusListener>();

function broadcastStatuses(): void {
  const statuses = Object.values(loadStatuses());
  statusListeners.forEach(fn => fn(statuses));
}

export function subscribeAgentStatuses(listener: StatusListener): () => void {
  statusListeners.add(listener);
  return () => statusListeners.delete(listener);
}

function updateAgentStatus(
  agentId: string,
  patch: Partial<AgentStatus>
): void {
  const statuses = loadStatuses();
  const existing = statuses[agentId] ?? {
    agentId,
    isActive: false,
    tasksCompleted: 0,
    tasksToday: 0,
    insights: 0,
  };
  statuses[agentId] = { ...existing, ...patch };
  saveStatuses(statuses);
  broadcastStatuses();
}

// ── Engine class ───────────────────────────────────────────────────────────

class BackgroundAgentEngine {
  private queue = new PriorityQueue<BackgroundTask>();
  private running = 0;
  private schedulerHandle: ReturnType<typeof setInterval> | null = null;
  private started = false;

  /** Start the background scheduler. Safe to call multiple times. */
  start(): void {
    if (this.started) return;
    this.started = true;

    // Bootstrap all operational agents' status records
    for (const agent of OPERATIONAL_AGENTS) {
      const statuses = loadStatuses();
      if (!statuses[agent.id]) {
        updateAgentStatus(agent.id, {
          agentId: agent.id,
          isActive: false,
          tasksCompleted: 0,
          tasksToday: 0,
          insights: 0,
        });
      }
    }

    this.schedulerHandle = setInterval(
      () => this.drain(),
      AGENT_CONFIG.background.schedulerIntervalMs
    );

    // Drain any persisted pending tasks on startup
    this.rehydrateQueue();
  }

  stop(): void {
    if (this.schedulerHandle) {
      clearInterval(this.schedulerHandle);
      this.schedulerHandle = null;
    }
    this.started = false;
  }

  /** Enqueue a new background task. Returns the task id. */
  schedule(
    options: Omit<BackgroundTask, 'id' | 'status' | 'createdAt'>
  ): string {
    if (!AGENT_CONFIG.background.enabled) return '';

    const id = `task_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const task: BackgroundTask = {
      ...options,
      id,
      status: 'pending',
      createdAt: Date.now(),
      retryCount: 0,
    };

    const tasks = loadTasks();
    tasks.push(task);
    saveTasks(tasks);

    this.queue.enqueue(task, options.priority as any);

    // Immediate tasks bypass the scheduler interval
    if (options.schedule === 'immediate') {
      this.drain();
    }

    return id;
  }

  /** Get all tasks (optionally filtered) */
  getTasks(filter?: { agentId?: string; status?: BackgroundTaskStatus }): BackgroundTask[] {
    const all = loadTasks();
    if (!filter) return all;
    return all.filter(t => {
      if (filter.agentId && t.agentId !== filter.agentId) return false;
      if (filter.status && t.status !== filter.status) return false;
      return true;
    });
  }

  /** Get current statuses for all agents */
  getStatuses(): AgentStatus[] {
    return Object.values(loadStatuses());
  }

  // ── Private helpers ──────────────────────────────────────────────────────

  private rehydrateQueue(): void {
    const pending = loadTasks().filter(t => t.status === 'pending');
    for (const t of pending) {
      this.queue.enqueue(t, t.priority as any);
    }
    if (!this.queue.isEmpty()) this.drain();
  }

  private async drain(): Promise<void> {
    const max = AGENT_CONFIG.background.maxConcurrentTasks;

    while (this.running < max && !this.queue.isEmpty()) {
      const task = this.queue.dequeue();
      if (!task) break;
      this.running++;
      this.executeTask(task).finally(() => {
        this.running--;
        // Keep draining if there are more tasks
        if (!this.queue.isEmpty()) this.drain();
      });
    }
  }

  private async executeTask(task: BackgroundTask): Promise<void> {
    // Mark running
    this.patchTask(task.id, { status: 'running', startedAt: Date.now() });
    updateAgentStatus(task.agentId, { isActive: true, currentTask: task });

    try {
      await Promise.race([
        this.runTaskBody(task),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Task timeout')), AGENT_CONFIG.background.taskTimeoutMs)
        ),
      ]);

      this.patchTask(task.id, { status: 'completed', completedAt: Date.now() });

      // Update stats
      const statuses = loadStatuses();
      const cur = statuses[task.agentId];
      if (cur) {
        const today = new Date().toDateString();
        const storedDay = localStorage.getItem(`cb_agent_day_${task.agentId}`);
        const tasksToday = storedDay === today ? (cur.tasksToday ?? 0) + 1 : 1;
        localStorage.setItem(`cb_agent_day_${task.agentId}`, today);
        updateAgentStatus(task.agentId, {
          isActive: false,
          currentTask: undefined,
          tasksCompleted: (cur.tasksCompleted ?? 0) + 1,
          tasksToday,
          lastActiveAt: Date.now(),
        });
      }

      await recordAction(task.agentId, task.caseId, {
        type: task.taskType,
        description: task.description,
        result: 'completed',
      });
    } catch (err) {
      const retries = (task.retryCount ?? 0);
      if (retries < AGENT_CONFIG.background.maxRetries) {
        // Retry with backoff
        this.patchTask(task.id, { status: 'pending', retryCount: retries + 1 });
        setTimeout(() => {
          this.queue.enqueue({ ...task, retryCount: retries + 1 }, task.priority as any);
          this.drain();
        }, 5_000 * (retries + 1));
      } else {
        this.patchTask(task.id, {
          status: 'failed',
          completedAt: Date.now(),
          error: err instanceof Error ? err.message : String(err),
        });
        updateAgentStatus(task.agentId, { isActive: false, currentTask: undefined });
      }
    }
  }

  private async runTaskBody(task: BackgroundTask): Promise<void> {
    switch (task.taskType) {
      case 'monitor':
        await this.runMonitor(task);
        break;
      case 'analyze':
        await this.runAnalyze(task);
        break;
      case 'alert':
        await this.runAlert(task);
        break;
      case 'research':
        await this.runResearch(task);
        break;
      case 'draft':
        await this.runDraft(task);
        break;
      case 'summarize':
        await this.runSummarize(task);
        break;
      default:
        // workflow tasks are handled by the orchestrator
        break;
    }
  }

  private async runMonitor(task: BackgroundTask): Promise<void> {
    const cases = this.loadCasesFromStorage();
    const activeCase = cases.find(c => c.id === task.caseId);
    if (!activeCase) return;

    const daysUntil = this.daysUntilDate(activeCase.nextCourtDate);
    if (daysUntil !== null && daysUntil <= 14 && daysUntil >= 0) {
      pushDeadlineAlert(task.agentId, task.caseId, activeCase.title, daysUntil);
    }
  }

  private async runAnalyze(task: BackgroundTask): Promise<void> {
    const cases = this.loadCasesFromStorage();
    const activeCase = cases.find(c => c.id === task.caseId);
    if (!activeCase) return;

    const agent = getAgentById(task.agentId);
    if (!agent) return;

    const sysInstruction = `You are ${agent.name}, ${agent.title}. Analyze the following case and provide 3 critical insights.`;
    const response = await deepseekChat({
      systemInstruction: sysInstruction,
      messages: [
        {
          role: 'user',
          content: `Case: ${activeCase.title}\nClient: ${activeCase.client}\nStatus: ${activeCase.status}\nSummary: ${activeCase.summary}\n\nProvide your top 3 strategic insights for this case.`,
        },
      ],
      temperature: 0.5,
      maxTokens: 800,
      timeoutMs: 30_000,
    });

    await addInsight(task.agentId, task.caseId, {
      agentId: task.agentId,
      caseId: task.caseId,
      title: `${agent.name}'s Case Analysis`,
      content: response.slice(0, 500),
      confidence: 72,
      type: 'recommendation',
      source: 'analysis',
    });

    pushInsightAlert(
      task.agentId,
      task.caseId,
      activeCase.title,
      `${agent.name} completed case analysis`,
      `New insights available for ${activeCase.title}.`,
      'medium'
    );
  }

  private async runAlert(task: BackgroundTask): Promise<void> {
    const cases = this.loadCasesFromStorage();
    const c = cases.find(cs => cs.id === task.caseId);
    if (!c) return;

    pushInsightAlert(
      task.agentId,
      task.caseId,
      c.title,
      task.description,
      task.description,
      task.priority === 'urgent' ? 'critical' : task.priority as any
    );
  }

  private async runResearch(task: BackgroundTask): Promise<void> {
    const cases = this.loadCasesFromStorage();
    const activeCase = cases.find(c => c.id === task.caseId);
    if (!activeCase) return;

    const response = await deepseekChat({
      systemInstruction:
        'You are Lex, a legal research specialist. Identify 3 key precedents or statutes relevant to this case.',
      messages: [
        {
          role: 'user',
          content: `Case: ${activeCase.title}\nSummary: ${activeCase.summary}\n\nIdentify 3 key legal precedents or statutes most relevant to this case.`,
        },
      ],
      temperature: 0.3,
      maxTokens: 600,
      timeoutMs: 30_000,
    });

    await addInsight('lex', task.caseId, {
      agentId: 'lex',
      caseId: task.caseId,
      title: 'Background Research',
      content: response.slice(0, 400),
      confidence: 65,
      type: 'recommendation',
      source: 'research',
    });

    pushTaskComplete('lex', task.caseId, activeCase.title, 'Background legal research completed.');
  }

  private async runDraft(task: BackgroundTask): Promise<void> {
    const cases = this.loadCasesFromStorage();
    const activeCase = cases.find(c => c.id === task.caseId);
    if (!activeCase) return;

    const agent = getAgentById(task.agentId);
    const agentName = agent?.name ?? 'Doc';

    // Determine document type from the task description
    const docTypeHint = task.description || 'legal document';

    const response = await deepseekChat({
      systemInstruction: `You are ${agentName}, an expert legal document drafter at CaseBuddy Law Firm. Draft a complete, professional ${docTypeHint} for the following case. Be thorough and ready-to-use.`,
      messages: [
        {
          role: 'user',
          content: `Case: ${activeCase.title}\nClient: ${activeCase.client}\nStatus: ${activeCase.status}\nSummary: ${activeCase.summary ?? 'No summary provided.'}\n\nDraft a complete ${docTypeHint}. Include all standard sections. Be specific to this case.`,
        },
      ],
      temperature: 0.4,
      maxTokens: 2000,
      timeoutMs: 60_000,
    });

    // Save to drafted docs bucket
    const DOCS_KEY = 'cb_drafted_docs';
    let docs: any[] = [];
    try { docs = JSON.parse(localStorage.getItem(DOCS_KEY) ?? '[]'); } catch {}
    const docEntry = {
      id: `doc_${Date.now()}`,
      caseId: task.caseId,
      caseTitle: activeCase.title,
      agentId: task.agentId,
      agentName,
      docType: docTypeHint,
      content: response,
      createdAt: Date.now(),
    };
    docs.unshift(docEntry);
    try { localStorage.setItem(DOCS_KEY, JSON.stringify(docs.slice(0, 100))); } catch {}

    pushTaskComplete(
      task.agentId,
      task.caseId,
      activeCase.title,
      `${agentName} drafted a ${docTypeHint}. Review in Document Center.`
    );
  }

  private async runSummarize(task: BackgroundTask): Promise<void> {
    const cases = this.loadCasesFromStorage();
    const activeCase = cases.find(c => c.id === task.caseId);
    if (!activeCase) return;

    // Load messages
    let messages: any[] = [];
    try {
      messages = JSON.parse(localStorage.getItem(`warroom_msgs_${task.caseId}`) ?? '[]');
    } catch {}

    // Load evidence
    let evidence: any[] = [];
    try {
      evidence = JSON.parse(localStorage.getItem(`evidence_${task.caseId}`) ?? '[]');
    } catch {}

    // Load workflows
    let workflows: any[] = [];
    try {
      workflows = JSON.parse(localStorage.getItem('cb_workflows') ?? '[]');
    } catch {}
    const caseWorkflows = workflows.filter((w: any) => w.caseId === task.caseId);

    // Format inputs for the prompt
    const msgText = messages.slice(-20).map(m => `[${m.sender_name}]: ${m.body}`).join('\n');
    const evText = evidence.map(e => `- ${e.name} (${e.type}): ${e.summary || ''}`).join('\n');
    const wfText = caseWorkflows.map(w => `- Workflow "${w.name}" (${w.status}):\n` + (w.steps ?? []).map((s: any) => `  * ${s.description}: ${s.status}`).join('\n')).join('\n');

    const prompt = `You are Maya, CaseBuddy's operations supervisor. Produce a comprehensive, high-quality Weekly Case Digest for the case.

Case Details:
Title: ${activeCase.title}
Client: ${activeCase.client}
Status: ${activeCase.status}
Summary: ${activeCase.summary || 'None'}

Recent Messages:
${msgText || 'No recent messages.'}

Evidence Vault:
${evText || 'No evidence uploaded.'}

Recent Workflows:
${wfText || 'No workflows run.'}

Provide a structured weekly digest containing:
1. Executive Summary (2-3 sentences summarizing the current posture).
2. Key Recent Updates (bullet points of what occurred in messages, evidence, or workflows).
3. Critical Gaps & Urgent Next Steps (what is missing, deadlines, action items).
Be extremely concise, professional, and actionable. Do not use placeholders or generic phrases.`;

    const response = await deepseekChat({
      systemInstruction: `You are Maya, Case Intake Specialist & Internal Operations Supervisor at CaseBuddy Law Firm. Speak directly, concisely, and with legal precision.`,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.5,
      maxTokens: 1000,
      timeoutMs: 45_000,
    });

    // Save to agent memory as a weekly digest insight
    await addInsight('maya', task.caseId, {
      agentId: 'maya',
      caseId: task.caseId,
      title: `Weekly Case Digest - ${new Date().toLocaleDateString()}`,
      content: response,
      confidence: 85,
      type: 'recommendation',
      source: 'analysis',
    });

    // Post it as an automated update to the case's War Room thread!
    const summaryMsg: any = {
      id: `local-digest-${Date.now()}`,
      created_at: new Date().toISOString(),
      thread_id: 'local',
      case_id: task.caseId,
      firm_id: 'default',
      sender_type: 'agent',
      sender_id: 'maya',
      sender_name: 'Maya (Weekly Digest)',
      direction: 'agent_to_user',
      body: `📅 **Weekly Case Digest**\n\n${response}`,
      read: false,
      triggers_automation: false,
      automation_target: null,
      automation_status: 'none',
      automation_result: null,
      attachment_url: null,
      attachment_name: null,
      attachment_type: null,
      metadata: { isWeeklyDigest: true },
    };

    try {
      const savedMsgs = JSON.parse(localStorage.getItem(`warroom_msgs_${task.caseId}`) ?? '[]');
      savedMsgs.push(summaryMsg);
      localStorage.setItem(`warroom_msgs_${task.caseId}`, JSON.stringify(savedMsgs));
    } catch {}

    pushTaskComplete(
      'maya',
      task.caseId,
      activeCase.title,
      `Weekly case digest prepared by Maya. Check agent memory or War Room.`
    );
  }

  private patchTask(id: string, patch: Partial<BackgroundTask>): void {
    const tasks = loadTasks().map(t => (t.id === id ? { ...t, ...patch } : t));
    saveTasks(tasks);
  }

  private loadCasesFromStorage(): Case[] {
    try {
      return loadCases();
    } catch {
      return [];
    }
  }

  private daysUntilDate(dateStr?: string): number | null {
    if (!dateStr) return null;
    const target = new Date(dateStr).getTime();
    if (isNaN(target)) return null;
    return Math.ceil((target - Date.now()) / 86_400_000);
  }
}

// ── Singleton export ───────────────────────────────────────────────────────

export const backgroundEngine = new BackgroundAgentEngine();
