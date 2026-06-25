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
import type { Workflow, WorkflowStep, Case } from '../types';

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
  caseData: Case | undefined
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

  const caseCtx = caseData
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

// ── Orchestrator ───────────────────────────────────────────────────────────

class AgentOrchestrator {
  /** Execute a workflow, persisting state at each step. */
  async executeWorkflow(
    workflow: Workflow,
    caseData?: Case
  ): Promise<Workflow> {
    if (!AGENT_CONFIG.workflows.enabled) return workflow;

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
          const output = await executeStep(step, workflow, caseData);
          step.outputs = { result: output };
          step.status = 'completed';
          step.completedAt = Date.now();
          
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
              const output = await executeStep(item.step, workflow, caseData);
              item.step.outputs = { result: output };
              item.step.status = 'completed';
              item.step.completedAt = Date.now();
              
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
      const cases: Case[] = JSON.parse(localStorage.getItem('lexsim_cases') ?? '[]');
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
