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
import { getAgentById, getSpecialistById, LEGAL_SPECIALISTS } from '../agents/personas';
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
  const agent = getAgentById(step.agentId);
  const specialist = getSpecialistById(step.agentId);
  const persona = agent ?? specialist;
  if (!persona) throw new Error(`Unknown agent: ${step.agentId}`);

  const sysInstruction =
    (specialist ? specialist.systemInstruction : `You are ${persona.name}, ${(agent as any).title}. ${(agent as any).description}`) +
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

    for (let i = 0; i < workflow.steps.length; i++) {
      const step = workflow.steps[i];

      // Skip already-completed steps (resume safety)
      if (step.status === 'completed') continue;

      step.status = 'running';
      step.startedAt = Date.now();
      step.inputs = { ...step.inputs, ...cumulativeOutputs };
      this.persistWorkflow(workflow);

      try {
        const output = await executeStep(step, workflow, caseData);

        step.outputs = { result: output };
        step.status = 'completed';
        step.completedAt = Date.now();

        // Feed this step's output to subsequent steps
        cumulativeOutputs[`step_${i + 1}_output`] = output.slice(0, 800);
        cumulativeOutputs[`${step.action}_result`] = output.slice(0, 400);

        // Record in agent memory
        await recordAction(step.agentId, workflow.caseId ?? '', {
          type: 'workflow-step',
          description: step.description,
          result: output.slice(0, 200),
        });

        // Record handoff if next step has a different agent
        if (i < workflow.steps.length - 1) {
          const nextStep = workflow.steps[i + 1];
          if (nextStep.agentId !== step.agentId) {
            await recordHandoff({
              fromAgentId: step.agentId,
              toAgentId: nextStep.agentId,
              reason: `Workflow: ${workflow.name}`,
              caseId: workflow.caseId ?? '',
              context: { workflowId: workflow.id, stepIndex: i },
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
