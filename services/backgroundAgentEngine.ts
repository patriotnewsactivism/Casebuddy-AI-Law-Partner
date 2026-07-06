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
import { getSupabase } from './supabaseClient';
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
  private drainHandle: ReturnType<typeof setInterval> | null = null;
  private pipelineChannel: any = null;
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

    // Resume any tasks that were queued before the last reload — the firm
    // keeps working across sessions instead of silently dropping its queue.
    this.rehydrateQueue();

    // Local drain loop: processes pending tasks (including daily/scheduled
    // ones enqueued without 'immediate') respecting the concurrency limit.
    this.drainHandle = setInterval(() => {
      this.rehydrateQueue();
      this.drain();
      void this.drainPipelineJobs();
    }, 60_000);

    // Drive the server-side document OCR queue. The trigger_queue_ocr
    // Postgres trigger enqueues a pipeline_jobs row for every uploaded
    // document, but nothing server-side drains that queue — this engine is
    // the processor: on each new job (and periodically) it claims pending
    // jobs and runs the ocr-document edge function against them.
    const sb = getSupabase();
    if (sb) {
      this.pipelineChannel = sb
        .channel('pipeline-jobs-listener')
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'pipeline_jobs' },
          () => { void this.drainPipelineJobs(); }
        )
        .subscribe();
      // Pick up anything left pending from previous sessions
      void this.drainPipelineJobs();
    }
  }

  stop(): void {
    if (this.drainHandle) {
      clearInterval(this.drainHandle);
      this.drainHandle = null;
    }
    if (this.pipelineChannel) {
      const sb = getSupabase();
      if (sb) sb.removeChannel(this.pipelineChannel);
      this.pipelineChannel = null;
    }
    this.started = false;
  }

  // ── Server-side OCR queue drain ───────────────────────────────────────────

  private pipelineDraining = false;

  /**
   * Claim pending pipeline_jobs (document OCR queue) and process them by
   * invoking the ocr-document edge function. Claims are atomic
   * (update … where status='pending') so multiple open tabs don't double-
   * process. Requires a signed-in session — RLS gates both the jobs table
   * and the documents the edge function updates.
   */
  private async drainPipelineJobs(): Promise<void> {
    if (this.pipelineDraining) return;
    const sb = getSupabase();
    if (!sb) return;

    this.pipelineDraining = true;
    try {
      const { data: { session } } = await sb.auth.getSession();
      if (!session) return; // anonymous visitor — not our queue to drain

      const { data: jobs } = await sb
        .from('pipeline_jobs')
        .select('id, document_id, job_type')
        .eq('status', 'pending')
        .eq('job_type', 'ocr')
        .order('created_at', { ascending: true })
        .limit(3);
      if (!jobs?.length) return;

      const { reanalyzeDocument } = await import('./documentPipeline');

      for (const job of jobs) {
        // Atomic claim — only one tab wins
        const { data: claimed } = await sb
          .from('pipeline_jobs')
          .update({ status: 'processing', started_at: new Date().toISOString() })
          .eq('id', job.id)
          .eq('status', 'pending')
          .select('id');
        if (!claimed?.length) continue;

        try {
          await reanalyzeDocument(job.document_id);
          await sb.from('pipeline_jobs')
            .update({ status: 'completed', completed_at: new Date().toISOString() })
            .eq('id', job.id);
        } catch (err) {
          await sb.from('pipeline_jobs')
            .update({
              status: 'failed',
              completed_at: new Date().toISOString(),
              error_log: err instanceof Error ? err.message.slice(0, 500) : String(err).slice(0, 500),
            })
            .eq('id', job.id);
        }
      }
    } catch { /* best-effort — retried on next interval */ }
    finally {
      this.pipelineDraining = false;
    }
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

    this.inFlight.add(task.id);
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

  /** Ids currently in the in-memory queue or executing — prevents the
   *  periodic rehydrate from double-enqueueing storage-pending tasks. */
  private inFlight = new Set<string>();

  private rehydrateQueue(): void {
    const pending = loadTasks().filter(t => t.status === 'pending' && !this.inFlight.has(t.id));
    for (const t of pending) {
      this.inFlight.add(t.id);
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
      this.inFlight.delete(task.id);

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
        this.inFlight.delete(task.id);
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
      case 'pipeline':
        await this.runPipelineTask(task);
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

  /** Full case file for prompts — everything the firm knows. Best-effort. */
  private async caseBriefFor(task: BackgroundTask, activeCase: Case): Promise<string> {
    try {
      const { buildCaseBrief } = await import('./caseContext');
      const brief = await buildCaseBrief(activeCase, { maxChars: 6000, forAgentId: task.agentId });
      if (brief) return brief;
    } catch { /* fall through */ }
    return `Case: ${activeCase.title}\nClient: ${activeCase.client}\nStatus: ${activeCase.status}\nSummary: ${activeCase.summary ?? ''}`;
  }

  /** Post background work product to the case's War Room thread so the
   *  whole team (human + agents) sees what got done autonomously. */
  private async postToWarRoom(caseId: string, agentId: string, agentName: string, body: string): Promise<void> {
    try {
      const { getOrCreateThread, sendAgentMessage } = await import('./caseThreadService');
      const cases = this.loadCasesFromStorage();
      const c = cases.find(cs => cs.id === caseId);
      const thread = await getOrCreateThread(caseId, c?.title ?? 'Case');
      await sendAgentMessage(thread.id, caseId, agentId, body);
    } catch {
      try {
        const msgs = JSON.parse(localStorage.getItem(`warroom_msgs_${caseId}`) ?? '[]');
        msgs.push({
          id: `local-bg-${Date.now()}`,
          created_at: new Date().toISOString(),
          thread_id: 'local',
          case_id: caseId,
          firm_id: 'default',
          sender_type: 'agent',
          sender_id: agentId,
          sender_name: agentName,
          direction: 'agent_to_user',
          body,
          read: false,
          triggers_automation: false,
          automation_status: 'none',
          automation_target: null,
          automation_result: null,
          attachment_url: null,
          attachment_name: null,
          attachment_type: null,
          metadata: { background: true },
        });
        localStorage.setItem(`warroom_msgs_${caseId}`, JSON.stringify(msgs));
      } catch { /* best-effort */ }
    }
  }

  private async runAnalyze(task: BackgroundTask): Promise<void> {
    const cases = this.loadCasesFromStorage();
    const activeCase = cases.find(c => c.id === task.caseId);
    if (!activeCase) return;

    const agent = getAgentById(task.agentId);
    if (!agent) return;

    const brief = await this.caseBriefFor(task, activeCase);
    const sysInstruction = `You are ${agent.name}, ${agent.title}. Analyze the following case and provide 3 critical insights.`;
    const response = await deepseekChat({
      systemInstruction: sysInstruction,
      messages: [
        {
          role: 'user',
          content: `${brief}\n\nTask context: ${task.description}\n\nProvide your top 3 strategic insights for this case. Be specific to the facts above — no generic advice.`,
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

    const brief = await this.caseBriefFor(task, activeCase);

    // Real precedent search via CourtListener first (when a key is
    // configured); the LLM then analyzes the actual authorities instead of
    // reciting from memory. Falls back to pure LLM research gracefully.
    let realAuthorities = '';
    try {
      const { searchCaseLaw } = await import('./integrationService');
      const query = `${activeCase.caseType ?? ''} ${(activeCase.summary ?? '').slice(0, 120)}`.trim();
      if (query) {
        const results = await searchCaseLaw(query);
        if (results?.length) {
          realAuthorities = results.slice(0, 5).map((r: any) =>
            `- ${r.caseName ?? r.case_name ?? 'Unknown'} (${r.court ?? r.court_citation_string ?? ''} ${r.dateFiled ?? r.date_filed ?? ''})${r.absolute_url ? ` — courtlistener.com${r.absolute_url}` : ''}`
          ).join('\n');
        }
      }
    } catch { /* no key or network issue — LLM-only research */ }

    const response = await deepseekChat({
      systemInstruction:
        'You are Lex, a legal research specialist at CaseBuddy Law Firm. Ground your analysis in the case file and, when provided, the real authorities found on CourtListener.',
      messages: [
        {
          role: 'user',
          content: `${brief}\n\n${realAuthorities ? `Authorities found on CourtListener:\n${realAuthorities}\n\n` : ''}Identify the 3 most important legal precedents or statutes for this case, explain in 1-2 sentences each why they matter to OUR facts, and flag any adverse authority the team should prepare for.`,
        },
      ],
      temperature: 0.3,
      maxTokens: 900,
      timeoutMs: 30_000,
    });

    const content = realAuthorities
      ? `${response}\n\nSources searched via CourtListener:\n${realAuthorities}`
      : response;

    await addInsight('lex', task.caseId, {
      agentId: 'lex',
      caseId: task.caseId,
      title: `Background Research — ${new Date().toLocaleDateString()}`,
      content: content.slice(0, 900),
      confidence: realAuthorities ? 80 : 65,
      type: 'recommendation',
      source: 'research',
    });

    await this.postToWarRoom(
      task.caseId, 'lex', 'Lex (Background Research)',
      `🔎 **Background Legal Research**\n\n${content.slice(0, 1500)}`
    );

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
    const brief = await this.caseBriefFor(task, activeCase);

    const response = await deepseekChat({
      systemInstruction: `You are ${agentName}, an expert legal document drafter at CaseBuddy Law Firm. Draft a complete, professional ${docTypeHint} for the following case. Be thorough and ready-to-use.`,
      messages: [
        {
          role: 'user',
          content: `${brief}\n\nDraft a complete ${docTypeHint}. Include all standard sections. Be specific to this case — use the facts, parties, and dates from the case file above.`,
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

  private async runPipelineTask(task: BackgroundTask): Promise<void> {
    // Dynamic import to avoid circular dependency at module load time
    const { resumeBackgroundPipeline, loadPipelineState } = await import('./casePipeline');

    const caseTitle = task.description?.replace('Case Pipeline: ', '') || 'Unknown Case';

    try {
      await resumeBackgroundPipeline(
        task.caseId,
        caseTitle,
        (_state) => {
          // Progress is auto-saved to localStorage by resumeBackgroundPipeline
          // The UI polls localStorage for updates
        },
        undefined // no abort signal for now
      );

      await this.patchTask(task.id, { status: 'completed', completedAt: Date.now() });

      pushTaskComplete(
        'maya',
        task.caseId,
        caseTitle,
        'Case Pipeline completed. View results in Case Pipeline.'
      );
    } catch (err) {
      console.error('[Pipeline] Background task failed:', err);
      await this.patchTask(task.id, {
        status: 'failed',
        completedAt: Date.now(),
        error: err instanceof Error ? err.message : String(err),
      });
    }
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
