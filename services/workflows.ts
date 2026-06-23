/**
 * workflows.ts — Pre-defined multi-agent workflow definitions.
 *
 * These are the automation blueprints. The orchestrator executes them
 * step-by-step, passing outputs from each agent to the next.
 */

import type { Workflow, WorkflowStep } from '../types';

function makeStep(
  id: string,
  agentId: string,
  action: string,
  description: string,
  inputs: Record<string, any> = {}
): WorkflowStep {
  return {
    id,
    agentId,
    action,
    description,
    inputs,
    status: 'pending',
  };
}

// ── Workflow templates (clone before executing) ───────────────────────────

export const WORKFLOW_TEMPLATES: Record<string, Omit<Workflow, 'id' | 'createdAt' | 'status' | 'caseId'>> = {
  'new-case-intake': {
    name: 'New Case Full Intake',
    description: 'Comprehensive intake: extract details, calc SOL, research, draft engagement letter',
    triggerEvent: 'case-created',
    steps: [
      makeStep('1', 'maya', 'extract-case-details', 'Maya: extract and summarize case facts'),
      makeStep('2', 'sol',  'calculate-deadlines',  'Sol: calculate statute of limitations & key deadlines'),
      makeStep('3', 'lex',  'preliminary-research', 'Lex: identify controlling law and initial precedents'),
      makeStep('4', 'doc',  'draft-engagement-letter', 'Doc: draft client engagement letter'),
      makeStep('5', 'sierra','schedule-kickoff',    'Sierra: prepare client onboarding checklist'),
    ],
  },

  'trial-prep-30-days': {
    name: '30-Day Trial Preparation',
    description: 'Full trial readiness assessment + brief + jury analysis + witness schedule',
    triggerEvent: 'trial-date-30-days',
    steps: [
      makeStep('1', 'rex',  'assess-trial-readiness',  'Rex: score trial readiness & identify gaps'),
      makeStep('2', 'doc',  'draft-trial-brief',       'Doc: draft pre-trial brief'),
      makeStep('3', 'jules','analyze-jury-pool',       'Jules: analyze anticipated jury demographics'),
      makeStep('4', 'rex',  'witness-prep-schedule',   'Rex: generate witness preparation schedule'),
      makeStep('5', 'max',  'organize-exhibits',       'Max: assemble and number exhibit list'),
      makeStep('6', 'lex',  'trial-research-update',   'Lex: update case law for trial arguments'),
    ],
  },

  'discovery-response': {
    name: 'Discovery Response Pipeline',
    description: 'Analyze incoming discovery, identify responsive docs, draft responses & objections',
    triggerEvent: 'discovery-received',
    steps: [
      makeStep('1', 'doc', 'analyze-discovery',      'Doc: analyze incoming discovery requests'),
      makeStep('2', 'max', 'identify-documents',     'Max: identify responsive documents'),
      makeStep('3', 'doc', 'draft-responses',        'Doc: draft discovery responses'),
      makeStep('4', 'doc', 'draft-objections',       'Doc: draft discovery objections'),
      makeStep('5', 'sol', 'set-response-deadline',  'Sol: set discovery response deadline alert'),
    ],
  },

  'settlement-analysis': {
    name: 'Comprehensive Settlement Analysis',
    description: 'Multi-specialist settlement valuation: precedent + jury prediction + damages + counteroffer',
    triggerEvent: 'settlement-offer-received',
    steps: [
      makeStep('1', 'lex',  'analyze-precedent-value', 'Lex: analyze settlement vs comparable verdicts'),
      makeStep('2', 'jules','predict-trial-outcome',   'Jules: probability-weighted trial outcome'),
      makeStep('3', 'rex',  'assess-trial-strength',   'Rex: trial-readiness impact on negotiation'),
      makeStep('4', 'doc',  'draft-counteroffer',      'Doc: draft counteroffer letter'),
    ],
  },

  'jury-selection-prep': {
    name: 'Jury Selection Preparation',
    description: 'Deep jury analysis: demographic profiling, bias detection, voir dire questions',
    triggerEvent: 'jury-selection-approaching',
    steps: [
      makeStep('1', 'jules','profile-jury-pool',     'Jules: profile anticipated jury demographics'),
      makeStep('2', 'jules','bias-analysis',         'Jules: identify likely biases for this case type'),
      makeStep('3', 'rex',  'voir-dire-questions',   'Rex: draft voir dire question bank'),
      makeStep('4', 'jules','strike-strategy',       'Jules: recommend challenge/strike strategy'),
    ],
  },

  'witness-deposition-prep': {
    name: 'Witness Deposition Preparation',
    description: 'Full witness analysis: credibility, prep questions, anticipated cross-exam',
    triggerEvent: 'deposition-scheduled',
    steps: [
      makeStep('1', 'rex', 'credibility-assessment', 'Rex: assess witness credibility and vulnerabilities'),
      makeStep('2', 'rex', 'direct-exam-questions',  'Rex: draft direct examination question outline'),
      makeStep('3', 'rex', 'cross-exam-prep',        'Rex: prepare for opposing cross-examination'),
      makeStep('4', 'doc', 'witness-prep-memo',      'Doc: draft witness preparation memo'),
    ],
  },
};

/** Clone a workflow template and bind it to a specific case */
export function createWorkflow(
  templateKey: string,
  caseId: string,
  extraInputs?: Record<string, any>
): Workflow | null {
  const template = WORKFLOW_TEMPLATES[templateKey];
  if (!template) return null;

  return {
    ...template,
    id: `wf_${templateKey}_${Date.now()}`,
    caseId,
    status: 'pending',
    createdAt: Date.now(),
    steps: template.steps.map(s => ({
      ...s,
      inputs: { ...s.inputs, ...extraInputs },
      status: 'pending' as const,
    })),
  };
}
