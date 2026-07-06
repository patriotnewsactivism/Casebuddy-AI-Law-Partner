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

  'evidence-intake': {
    name: 'Evidence Intake Pipeline',
    description: 'Catalog exhibits, prepare chain of custody logs, and compile evidence binders',
    triggerEvent: 'evidence-uploaded',
    steps: [
      makeStep('1', 'max', 'catalog-exhibits', 'Max: catalog and tag incoming evidence'),
      makeStep('2', 'paralegal-criminal-1', 'chain-of-custody', 'Marcus Webb Jr.: prepare chain of custody logs'),
      makeStep('3', 'paralegal-criminal-2', 'evidence-binder', 'Tanya Reid: assemble and organize evidence binder'),
    ],
  },

  'client-onboarding': {
    name: 'Client Onboarding Package',
    description: 'Maya fact extraction, paralegal intake packet, Sierra scheduling, and Doc retainer drafting',
    triggerEvent: 'case-created',
    steps: [
      makeStep('1', 'maya', 'extract-facts', 'Maya: extract and summarize initial case facts'),
      makeStep('2', 'assigned-paralegal-1', 'intake-packet', 'Paralegal: prepare specific intake questionnaire and client instructions'),
      makeStep('3', 'sierra', 'schedule-consultation', 'Sierra: coordinate and schedule initial client consultation'),
      makeStep('4', 'doc', 'draft-retainer', 'Doc: draft formal client representation agreement / retainer'),
    ],
  },

  'medical-records-demand': {
    name: 'Medical Records Demand',
    description: 'Medical record requests, damages calculation, insurance follow-up logs, and deadline tracking',
    triggerEvent: 'personal-injury-intake',
    steps: [
      makeStep('1', 'paralegal-pi-1', 'request-records', 'Sofia Cruz: prepare HIPAA authorizations and records requests'),
      makeStep('2', 'paralegal-pi-2', 'insurance-demand', 'Derek Shaw: compile medical bills and drafts demand letter package'),
      makeStep('3', 'sol', 'track-response-deadline', 'Sol: calendar insurance response deadline and follow-up alerts'),
    ],
  },

  'discovery-paralegal-pack': {
    name: 'Discovery Paralegal Pack',
    description: 'ESI cataloging, deposition scheduling, and trial exhibit layout coordination',
    triggerEvent: 'litigation-discovery',
    steps: [
      makeStep('1', 'paralegal-civil-1', 'esi-inventory', 'Rachel Burns: review and inventory ESI database'),
      makeStep('2', 'paralegal-employment-2', 'deposition-schedule', 'Tyler Mann: coordinate witness/opposing counsel schedules for depositions'),
      makeStep('3', 'paralegal-civil-2', 'exhibit-list', 'Aaron King: organize draft trial exhibit lists'),
    ],
  },

  'immigration-petition-prep': {
    name: 'Immigration Petition Prep',
    description: 'USCIS form validation, receipt tracking, and final attorney legal review',
    triggerEvent: 'immigration-intake',
    steps: [
      makeStep('1', 'paralegal-immigration-1', 'uscis-forms', 'Priya Patel: compile USCIS forms and supporting document checklists'),
      makeStep('2', 'paralegal-immigration-2', 'court-exhibits', 'Carlos Reyes: prepare removal defense country conditions and court declarations'),
      makeStep('3', 'immigration', 'attorney-review', 'Amir Hassan: perform final legal review of petition package'),
    ],
  },

  'estate-inventory': {
    name: 'Estate Inventory',
    description: 'Asset cataloging, beneficiary conflicts check, and draft trust distribution action plan',
    triggerEvent: 'estate-planning-start',
    steps: [
      makeStep('1', 'paralegal-estate-2', 'asset-inventory', 'Oliver Park: audit and valuate estate asset inventory'),
      makeStep('2', 'paralegal-estate-1', 'beneficiary-review', 'Mei Chen: review beneficiary designations and check for probate conflicts'),
      makeStep('3', 'estate-planning', 'draft-action-plan', 'Grace Liu: draft client trust distribution action plan'),
    ],
  },

  'client-milestone-update': {
    name: 'Client Milestone Update',
    description: 'Sierra drafts milestone update, attorney reviews it, and Sierra sends it to the client',
    triggerEvent: 'milestone-reached',
    steps: [
      makeStep('1', 'sol', 'detect-milestone', 'Sol: check recent case actions and identify milestone'),
      makeStep('2', 'sierra', 'draft-client-update', 'Sierra: draft clear, reassuring email update for client review'),
      makeStep('3', 'assigned-paralegal-1', 'review-details', 'Paralegal: verify case billing or document references'),
    ],
  },

  'foia-pipeline': {
    name: 'FOIA Public Records Request Pipeline',
    description: 'Maya analyzes request scope, Lex identifies agencies, Doc drafts request, and Sol sets follow-up deadline',
    triggerEvent: 'foia-requested',
    steps: [
      makeStep('1', 'maya', 'analyze-foia-scope', 'Maya: analyze scope of public records sought'),
      makeStep('2', 'lex', 'identify-agencies', 'Lex: identify responsive government agencies and controlling statutes'),
      makeStep('3', 'doc', 'draft-foia-request', 'Doc: draft formal FOIA public records request'),
      makeStep('4', 'sol', 'set-foia-deadline', 'Sol: set follow-up response deadline alert'),
    ],
  },

  'post-trial-wrap': {
    name: 'Post-Trial Settlement & Wrap',
    description: 'Rex documents outcome, Lex flags appeal windows, Doc drafts fee petition, and Sol closes pending deadlines',
    triggerEvent: 'post-trial-reached',
    steps: [
      makeStep('1', 'rex', 'document-trial-outcome', 'Rex: summarize trial verdict and outcome details'),
      makeStep('2', 'lex', 'flag-appeal-deadlines', 'Lex: identify post-trial appeal windows and deadlines'),
      makeStep('3', 'doc', 'draft-fee-petition', 'Doc: draft attorney fee petition or final judgment proposal'),
      makeStep('4', 'sol', 'close-deadlines', 'Sol: close all open deadlines and archive calendar'),
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
