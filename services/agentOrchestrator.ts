/**
 * agentOrchestrator.ts — Multi-agent workflow execution engine.
 *
 * Executes pre-defined workflow templates step-by-step, passing context
 * between agents and persisting state so workflows survive page reloads.
 *
 * Each step calls the appropriate agent via deepseekChat, stores outputs,
 * and feeds them as inputs into the next step.
 */

import { deepseekChat } from './deepseek';
import { recordHandoff, recordAction, addInsight } from './agentMemory';
import { pushInsightAlert, pushTaskComplete } from './notificationManager';
import { getAgentById, getSpecialistById, getParalegalById, getParalegalsByAttorney, LEGAL_SPECIALISTS } from '../agents/personas';
import { backgroundEngine } from './backgroundAgentEngine';
import { AGENT_CONFIG } from '../config/agentConfig';
import { buildCaseBrief } from './caseContext';
import type { Workflow, WorkflowStep, Case } from '../types';
import { loadCases } from '../utils/storage';

// ── Persistence ────────────────────────────────────────────────────────────

const WORKFLOW_STORAGE_KEY = 'cb_workflows';

function loadWorkflows(): Workflow[] {
  try {
    return JSON.parse(localStorage.getItem(WORKFLOW_STORAGE_KEY) ?? '[]');
  } catch {
    return [];
  }
}

function saveWorkflows(workflows: Workflow[]): void {
  try {
    localStorage.setItem(WORKFLOW_STORAGE_KEY, JSON.stringify(workflows.slice(-50)));
  } catch { /* ignore */ }
}

// ── Listener infra ─────────────────────────────────────────────────────────

type WorkflowListener = (workflows: Workflow[]) => void;
const workflowListeners = new Set<WorkflowListener>();

function broadcastWorkflows(): void {
  const wfs = loadWorkflows();
  workflowListeners.forEach(fn => fn(wfs));
}

export function subscribeWorkflows(listener: WorkflowListener): () => void {
  workflowListeners.add(listener);
  return () => workflowListeners.delete(listener);
}

// ── Step execution ─────────────────────────────────────────────────────────

async function executeStep(
  step: WorkflowStep,
  workflow: Workflow,
  caseData: Case | undefined,
  caseBrief: string
): Promise<string> {
  let agentId = step.agentId;
  if (agentId === 'assigned-paralegal-1' || agentId === 'assigned-paralegal-2') {
    const attorneyId = caseData?.assignedSpecialistId || 'criminal-defense';
    const pls = getParalegalsByAttorney(attorneyId);
    const index = agentId === 'assigned-paralegal-1' ? 0 : 1;
    agentId = pls[index]?.id ?? (index === 0 ? 'paralegal-criminal-1' : 'paralegal-criminal-2');
  }

  const agent = getAgentById(agentId);
  const specialist = getSpecialistById(agentId);
  const paralegal = getParalegalById(agentId);
  const persona = agent ?? specialist ?? paralegal;
  if (!persona) throw new Error(`Unknown agent: ${agentId}`);

  const sysInstruction =
    (specialist ? specialist.systemInstruction :
     paralegal ? paralegal.systemInstruction :
     `You are ${persona.name}, ${(agent as any).title}. ${(agent as any).description}`) +
    '\n\nYou are operating autonomously as part of an automated workflow. Be thorough and practical.';

  // The full case file (intake narrative, documents, discovery, transcripts,
  // prior work product) — assembled once per workflow and shared by every
  // step so no agent works blind.
  const caseCtx = caseBrief
    ? `\n\n${caseBrief}`
    : caseData
      ? `\n\nCase Context:\nTitle: ${caseData.title}\nClient: ${caseData.client}\nStatus: ${caseData.status}\nSummary: ${caseData.summary ?? ''}\nJudge: ${caseData.judge ?? 'N/A'}\nOpposing Counsel: ${caseData.opposingCounsel ?? 'N/A'}\nNext Court Date: ${caseData.nextCourtDate ?? 'N/A'}`
      : '';

  // Build prompt incorporating prior step outputs
  const priorOutputs = Object.entries(step.inputs ?? {})
    .filter(([k]) => k !== 'caseContext')
    .map(([k, v]) => `${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`)
    .join('\n');

  const userPrompt = [
    `Task: ${step.description}`,
    priorOutputs ? `Prior workflow context:\n${priorOutputs}` : '',
    caseCtx,
    '\nExecute this task completely. Be specific and actionable.',
  ]
    .filter(Boolean)
    .join('\n\n');

  const response = await deepseekChat({
    systemInstruction: sysInstruction,
    messages: [{ role: 'user', content: userPrompt }],
    temperature: 0.45,
    maxTokens: 1200,
    timeoutMs: 45_000,
  });

  return response;
}

async function saveDocumentAndEmailDraft(
  step: WorkflowStep,
  workflow: Workflow,
  caseData: Case | undefined,
  output: string
) {
  const isDocAction = step.action.startsWith('draft') || 
                      step.action.includes('memo') || 
                      step.action.includes('letter') || 
                      step.action.includes('brief') || 
                      step.action.includes('document');
  if (!isDocAction) return;

  let agentId = step.agentId;
  if (agentId === 'assigned-paralegal-1' || agentId === 'assigned-paralegal-2') {
    const attorneyId = caseData?.assignedSpecialistId || 'criminal-defense';
    const pls = getParalegalsByAttorney(attorneyId);
    const index = agentId === 'assigned-paralegal-1' ? 0 : 1;
    agentId = pls[index]?.id ?? (index === 0 ? 'paralegal-criminal-1' : 'paralegal-criminal-2');
  }

  const agent = getAgentById(agentId) ?? getSpecialistById(agentId) ?? getParalegalById(agentId);
  const agentName = agent?.name ?? 'Doc';
  const docTypeHint = step.action.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  
  // 1. Save completed draft to cb_drafted_docs
  const DOCS_KEY = 'cb_drafted_docs';
  let docs: any[] = [];
  try {
    docs = JSON.parse(localStorage.getItem(DOCS_KEY) ?? '[]');
  } catch {}
  
  const docEntry = {
    id: `doc_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
    caseId: workflow.caseId ?? 'general',
    caseTitle: caseData?.title ?? 'General Matters',
    agentId,
    agentName,
    docType: docTypeHint,
    content: output,
    createdAt: Date.now(),
  };
  
  docs.unshift(docEntry);
  try {
    localStorage.setItem(DOCS_KEY, JSON.stringify(docs.slice(0, 100)));
  } catch {}

  // 2. Auto-draft email in MailRoom
  const MAIL_KEY = 'casebuddy_mailroom_v2';
  let emails: any[] = [];
  try {
    emails = JSON.parse(localStorage.getItem(MAIL_KEY) ?? '[]');
  } catch {}

  const draftEmail = {
    id: `draft-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    from: `${agentId}@casebuddy.live`,
    fromName: `${agentName} · CaseBuddy`,
    fromAgent: agentId,
    to: 'client@example.com',
    subject: `Draft: [${workflow.name}] ${docTypeHint}`,
    body: `Hi,\n\nHere is the generated ${docTypeHint} for your review:\n\n${output}\n\n— ${agentName}`,
    timestamp: new Date().toISOString(),
    read: true,
    starred: false,
    folder: 'drafts' as const,
    tag: 'client-update',
    priority: 'normal' as const,
    aiSummary: `Draft of ${docTypeHint} from workflow ${workflow.name}`,
    caseRef: caseData?.title ?? 'General Matters',
  };

  emails.unshift(draftEmail);
  try {
    localStorage.setItem(MAIL_KEY, JSON.stringify(emails));
  } catch {}
}

// ── Orchestrator ───────────────────────────────────────────────────────────

class AgentOrchestrator {
  private isDuplicateWorkflow(workflow: Workflow): boolean {
    if (!workflow.caseId) return false;
    const all = loadWorkflows();
    return all.some(w => {
      if (w.caseId !== workflow.caseId) return false;
      if (w.name !== workflow.name) return false;
      
      // If one is running or pending, it is a duplicate
      if (w.status === 'running' || w.status === 'pending') return true;

      // If it's completed, check if it had the exact same inputs (like witnessName) to prevent duplicate runs
      if (w.status === 'completed') {
        const wInputs = workflow.steps[0]?.inputs ?? {};
        const existingInputs = w.steps[0]?.inputs ?? {};
        const clean = (obj: any) => {
          const { caseContext, ...rest } = obj;
          return JSON.stringify(rest);
        };
        return clean(wInputs) === clean(existingInputs);
      }

      return false;
    });
  }

  /** Execute a workflow, persisting state at each step. */
  async executeWorkflow(
    workflow: Workflow,
    caseData?: Case
  ): Promise<Workflow> {
    if (!AGENT_CONFIG.workflows.enabled) return workflow;

    if (this.isDuplicateWorkflow(workflow)) {
      console.warn(`[Orchestrator] Duplicate workflow "${workflow.name}" skipped for case ${workflow.caseId}.`);
      return workflow;
    }

    // Most callers (case event hooks) fire workflows with only a caseId —
    // resolve the case ourselves so agents never run without their case.
    if (!caseData && workflow.caseId) {
      try {
        caseData = loadCases().find(c => c.id === workflow.caseId);
      } catch { /* offline/broken storage — proceed without */ }
    }

    // Assemble the complete case file once; every step shares it.
    let caseBrief = '';
    if (workflow.caseId) {
      try {
        caseBrief = await buildCaseBrief(caseData ?? workflow.caseId);
      } catch { /* brief is best-effort */ }
    }

    workflow.status = 'running';
    this.persistWorkflow(workflow);
    broadcastWorkflows();

    let cumulativeOutputs: Record<string, any> = {};

    let i = 0;
    while (i < workflow.steps.length) {
      // Find contiguous blocks of steps marked parallel
      const batch: { step: WorkflowStep; index: number }[] = [];
      
      // If the current step is parallel, grab it and any subsequent contiguous steps that are also parallel
      if (workflow.steps[i].parallel) {
        while (i < workflow.steps.length && workflow.steps[i].parallel && workflow.steps[i].status !== 'completed') {
          batch.push({ step: workflow.steps[i], index: i });
          i++;
        }
      }
      
      // If we didn't find any parallel steps or the first step wasn't parallel, just execute that single step sequentially
      if (batch.length === 0) {
        const step = workflow.steps[i];
        i++;
        if (step.status === 'completed') continue;
        
        // Execute single step sequentially
        step.status = 'running';
        step.startedAt = Date.now();
        step.inputs = { ...step.inputs, ...cumulativeOutputs };
        this.persistWorkflow(workflow);
        
        try {
          const output = await executeStep(step, workflow, caseData, caseBrief);
          step.outputs = { result: output };
          step.status = 'completed';
          step.completedAt = Date.now();
          
          await saveDocumentAndEmailDraft(step, workflow, caseData, output);
          
          cumulativeOutputs[`step_${i}_output`] = output.slice(0, 800);
          cumulativeOutputs[`${step.action}_result`] = output.slice(0, 400);
          
          await recordAction(step.agentId, workflow.caseId ?? '', {
            type: 'workflow-step',
            description: step.description,
            result: output.slice(0, 200),
          });
          
          // Record handoff if next step has a different agent
          if (i < workflow.steps.length) {
            const nextStep = workflow.steps[i];
            if (nextStep.agentId !== step.agentId) {
              await recordHandoff({
                fromAgentId: step.agentId,
                toAgentId: nextStep.agentId,
                reason: `Workflow: ${workflow.name}`,
                caseId: workflow.caseId ?? '',
                context: { workflowId: workflow.id, stepIndex: i - 1 },
              });
            }
          }
        } catch (err) {
          step.status = 'failed';
          step.error = err instanceof Error ? err.message : String(err);
          step.completedAt = Date.now();
          workflow.status = 'failed';
          this.persistWorkflow(workflow);
          broadcastWorkflows();
          throw err;
        }
      } else {
        // Execute batch of parallel steps
        batch.forEach(item => {
          item.step.status = 'running';
          item.step.startedAt = Date.now();
          item.step.inputs = { ...item.step.inputs, ...cumulativeOutputs };
        });
        this.persistWorkflow(workflow);
        
        try {
          const results = await Promise.all(
            batch.map(async (item) => {
              const output = await executeStep(item.step, workflow, caseData, caseBrief);
              item.step.outputs = { result: output };
              item.step.status = 'completed';
              item.step.completedAt = Date.now();
              
              await saveDocumentAndEmailDraft(item.step, workflow, caseData, output);
              
              await recordAction(item.step.agentId, workflow.caseId ?? '', {
                type: 'workflow-step',
                description: item.step.description,
                result: output.slice(0, 200),
              });
              
              return { index: item.index, action: item.step.action, output };
            })
          );
          
          // Add results to cumulative outputs
          results.forEach(res => {
            cumulativeOutputs[`step_${res.index + 1}_output`] = res.output.slice(0, 800);
            cumulativeOutputs[`${res.action}_result`] = res.output.slice(0, 400);
          });
          
          // Let's log handoffs to the step following the batch if different
          if (i < workflow.steps.length) {
            const nextStep = workflow.steps[i];
            const lastBatchStep = batch[batch.length - 1].step;
            if (nextStep.agentId !== lastBatchStep.agentId) {
              await recordHandoff({
                fromAgentId: lastBatchStep.agentId,
                toAgentId: nextStep.agentId,
                reason: `Workflow: ${workflow.name}`,
                caseId: workflow.caseId ?? '',
                context: { workflowId: workflow.id, stepIndex: i - 1 },
              });
            }
          }
        } catch (err) {
          // If any fails, mark running batch steps as failed
          batch.forEach(item => {
            if (item.step.status === 'running') {
              item.step.status = 'failed';
              item.step.error = err instanceof Error ? err.message : String(err);
              item.step.completedAt = Date.now();
            }
          });
          workflow.status = 'failed';
          this.persistWorkflow(workflow);
          broadcastWorkflows();
          throw err;
        }
      }
      this.persistWorkflow(workflow);
      broadcastWorkflows();
    }

    workflow.status = 'completed';
    workflow.completedAt = Date.now();

    // Build a combined result from all step outputs
    workflow.result = cumulativeOutputs;

    this.persistWorkflow(workflow);
    broadcastWorkflows();

    // Notify user
    if (workflow.caseId) {
      const cases: Case[] = loadCases();
      const c = cases.find(cs => cs.id === workflow.caseId);

      await addInsight('maya', workflow.caseId, {
        agentId: 'maya',
        caseId: workflow.caseId,
        title: `Workflow Complete: ${workflow.name}`,
        content: `All ${workflow.steps.length} steps completed for ${c?.title ?? 'the case'}.`,
        confidence: 85,
        type: 'recommendation',
        source: 'analysis',
      });

      pushInsightAlert(
        workflow.steps[workflow.steps.length - 1].agentId,
        workflow.caseId,
        c?.title ?? '',
        `Workflow Complete: ${workflow.name}`,
        `${workflow.steps.length} agent tasks completed. Review results in the War Room.`,
        'medium'
      );

      // F3: Auto-Post Workflow Summaries to War Room
      let stepsSummaryText = `🤖 **Workflow Complete: ${workflow.name}**\n\nAll tasks have been successfully processed:\n\n`;
      workflow.steps.forEach((step, idx) => {
        const agent = getAgentById(step.agentId) ?? getSpecialistById(step.agentId) ?? getParalegalById(step.agentId);
        const name = agent?.name ?? step.agentId;
        stepsSummaryText += `🔹 **Step ${idx + 1}: ${step.action}** (by ${name})\n*${step.description}*\n`;
        if (step.outputs && step.outputs.result) {
          const preview = step.outputs.result.length > 250 
            ? step.outputs.result.slice(0, 250) + '...'
            : step.outputs.result;
          stepsSummaryText += `> ${preview}\n\n`;
        } else {
          stepsSummaryText += `> Completed successfully.\n\n`;
        }
      });

      try {
        // Try sending to Supabase if we can get a thread
        const { getOrCreateThread, sendAgentMessage } = await import('./caseThreadService');
        const thread = await getOrCreateThread(workflow.caseId, c?.title ?? 'Case');
        await sendAgentMessage(thread.id, workflow.caseId, 'maya', stepsSummaryText);
      } catch {
        // Fallback to local storage (offline mode)
        try {
          const msgs = JSON.parse(localStorage.getItem(`warroom_msgs_${workflow.caseId}`) ?? '[]');
          const postMsg = {
            id: `local-wf-${Date.now()}`,
            created_at: new Date().toISOString(),
            thread_id: 'local',
            case_id: workflow.caseId,
            firm_id: 'default',
            sender_type: 'agent' as const,
            sender_id: 'maya',
            sender_name: 'Maya (Workflow Ops)',
            direction: 'agent_to_user' as const,
            body: stepsSummaryText,
            read: false,
            triggers_automation: false,
            automation_status: 'none' as const,
            automation_target: null,
            automation_result: null,
            attachment_url: null,
            attachment_name: null,
            attachment_type: null,
            metadata: { workflowId: workflow.id },
          };
          msgs.push(postMsg);
          localStorage.setItem(`warroom_msgs_${workflow.caseId}`, JSON.stringify(msgs));
        } catch {}
      }
    }

    return workflow;
  }

  /** Execute a workflow asynchronously in the background (fire & forget, with status update). */
  executeWorkflowAsync(workflow: Workflow, caseData?: Case): void {
    this.executeWorkflow(workflow, caseData).catch(err => {
      console.error('[Orchestrator] Workflow failed:', workflow.name, err);
    });
  }

  /** Persist workflow state to localStorage */
  private persistWorkflow(workflow: Workflow): void {
    const all = loadWorkflows();
    const idx = all.findIndex(w => w.id === workflow.id);
    if (idx >= 0) {
      all[idx] = workflow;
    } else {
      all.push(workflow);
    }
    saveWorkflows(all);
  }

  /** Get all workflows, optionally filtered by caseId */
  getWorkflows(caseId?: string): Workflow[] {
    const all = loadWorkflows();
    return caseId ? all.filter(w => w.caseId === caseId) : all;
  }

  /** Get running/pending workflows */
  getActiveWorkflows(): Workflow[] {
    return loadWorkflows().filter(w => w.status === 'running' || w.status === 'pending');
  }

  /** Clear completed workflows older than 7 days */
  cleanup(): void {
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const all = loadWorkflows().filter(
      w => w.status !== 'completed' || (w.completedAt ?? 0) > cutoff
    );
    saveWorkflows(all);
  }
}

export const orchestrator = new AgentOrchestrator();
