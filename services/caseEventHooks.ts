/**
 * caseEventHooks.ts — Automatically trigger workflows when case events occur.
 *
 * Import and call these hooks from the UI components that create/update cases.
 * They fire-and-forget workflow execution via the orchestrator.
 */

import { orchestrator } from './agentOrchestrator';
import { createWorkflow } from './workflows';
import { pushNotification } from './notificationManager';
import { deepseekChat } from './deepseek';
import type { Case, IntakeCase } from '../types';

// ── Helpers ────────────────────────────────────────────────────────────────

function daysBetween(a: number, b: number): number {
  return Math.ceil(Math.abs(b - a) / 86_400_000);
}

function parseDateSafe(d?: string | null): number | null {
  if (!d) return null;
  const ts = Date.parse(d);
  return Number.isNaN(ts) ? null : ts;
}

// ── Public hooks ──────────────────────────────────────────────────────────

/** Call when a new case is created */
export async function onCaseCreated(newCase: Case): Promise<void> {
  const wf = createWorkflow('new-case-intake', newCase.id);
  if (wf) {
    orchestrator.executeWorkflow(wf).catch(err => {
      console.warn('[caseEventHooks] new-case-intake workflow failed:', err);
    });
    pushNotification({
      agentId: 'maya',
      caseId: newCase.id,
      caseTitle: newCase.title,
      type: 'insight',
      priority: 'medium',
      title: 'New Case Workflow Started',
      message: `Agents are analyzing "${newCase.title}" — intake, deadlines, research, and engagement letter.`,
    });
  }
}

/** Call when a case is updated — checks for deadline-triggered workflows */
export async function onCaseUpdated(updated: Case, previous?: Case): Promise<void> {
  // Status transition checks
  if (previous && updated.status !== previous.status) {
    onCaseStatusChanged(updated, previous.status).catch(() => {});
  }

  // Win probability drop alert
  if (
    previous?.winProbability &&
    updated.winProbability &&
    previous.winProbability - updated.winProbability > 10
  ) {
    pushNotification({
      agentId: 'rex',
      caseId: updated.id,
      caseTitle: updated.title,
      type: 'warning',
      priority: 'critical',
      title: 'Case Strength Declined',
      message: `Win probability for "${updated.title}" dropped from ${previous.winProbability}% to ${updated.winProbability}%.`,
    });
  }

  const courtDate = parseDateSafe(updated.nextCourtDate);
  if (!courtDate) return;

  const daysOut = daysBetween(Date.now(), courtDate);

  // Trial prep at 30 days
  if (daysOut <= 30 && daysOut > 28) {
    const prevCourtDate = parseDateSafe(previous?.nextCourtDate);
    const prevDays = prevCourtDate ? daysBetween(Date.now(), prevCourtDate) : 999;
    // Only trigger if we just crossed the 30-day mark
    if (prevDays > 30 || !prevCourtDate) {
      const wf = createWorkflow('trial-prep-30-days', updated.id);
      if (wf) {
        orchestrator.executeWorkflow(wf).catch(err => {
          console.warn('[caseEventHooks] trial-prep workflow failed:', err);
        });
        pushNotification({
          agentId: 'rex',
          caseId: updated.id,
          caseTitle: updated.title,
          type: 'alert',
          priority: 'high',
          title: '30-Day Trial Prep Activated',
          message: `Trial for "${updated.title}" is ${daysOut} days away. Full prep workflow started.`,
        });
      }
    }
  }

  // Jury selection prep at 10 days
  if (daysOut <= 10 && daysOut > 8) {
    const wf = createWorkflow('jury-selection-prep', updated.id);
    if (wf) {
      orchestrator.executeWorkflow(wf).catch(() => {});
    }
  }
}

/** Call when discovery documents are uploaded */
export async function onDiscoveryReceived(caseId: string, caseTitle?: string): Promise<void> {
  const wf = createWorkflow('discovery-response', caseId);
  if (wf) {
    orchestrator.executeWorkflow(wf).catch(() => {});
    pushNotification({
      agentId: 'doc',
      caseId,
      caseTitle,
      type: 'task-complete',
      priority: 'medium',
      title: 'Discovery Response Pipeline',
      message: 'Agents analyzing incoming discovery requests and drafting responses.',
    });
  }
}

/** Call when a settlement offer is received/entered */
export async function onSettlementOfferReceived(caseId: string, caseTitle: string, offerAmount: string): Promise<void> {
  const wf = createWorkflow('settlement-analysis', caseId);
  if (wf) {
    orchestrator.executeWorkflow(wf).catch(err => {
      console.warn('[caseEventHooks] settlement-analysis workflow failed:', err);
    });
    pushNotification({
      agentId: 'doc',
      caseId,
      caseTitle,
      type: 'insight',
      priority: 'high',
      title: 'Settlement Offer Pipeline',
      message: `A settlement offer of ${offerAmount} was logged for "${caseTitle}". Settlement analysis workflow started.`,
    });
  }
}

/** Call when a deposition is scheduled */
export async function onDepositionScheduled(caseId: string, caseTitle: string, witnessName: string): Promise<void> {
  const wf = createWorkflow('witness-deposition-prep', caseId);
  if (wf) {
    orchestrator.executeWorkflow(wf).catch(err => {
      console.warn('[caseEventHooks] witness-deposition-prep workflow failed:', err);
    });
    pushNotification({
      agentId: 'rex',
      caseId,
      caseTitle,
      type: 'task-complete',
      priority: 'high',
      title: 'Deposition Prep Triggered',
      message: `Deposition scheduled for witness ${witnessName}. Launching preparation outline workflow.`,
    });
  }
}

/** Call when a case's status changes */
export async function onCaseStatusChanged(updated: Case, previousStatus: string): Promise<void> {
  const currentStatus = updated.status;
  if (currentStatus === previousStatus) return;

  pushNotification({
    agentId: 'maya',
    caseId: updated.id,
    caseTitle: updated.title,
    type: 'insight',
    priority: 'medium',
    title: `Case Status Changed`,
    message: `Case "${updated.title}" transitioned from ${previousStatus} to ${currentStatus}.`,
  });

  if (currentStatus === 'Discovery') {
    const wf = createWorkflow('discovery-paralegal-pack', updated.id);
    if (wf) {
      orchestrator.executeWorkflow(wf).catch(() => {});
    }
  } else if (currentStatus === 'Trial') {
    const wf = createWorkflow('trial-prep-30-days', updated.id);
    if (wf) {
      orchestrator.executeWorkflow(wf).catch(() => {});
    }
  }
}

/** Call when evidence analysis reveals concerns/weaknesses */
export async function onEvidenceConcernsFound(caseId: string, analysis: { concerns: string[]; summary?: string }, caseTitle?: string): Promise<void> {
  const wf = createWorkflow('evidence-intake', caseId);
  if (wf) {
    wf.steps[0].inputs = { ...wf.steps[0].inputs, concerns: analysis.concerns, summary: analysis.summary };
    orchestrator.executeWorkflow(wf).catch(err => {
      console.warn('[caseEventHooks] evidence-intake workflow failed:', err);
    });
    pushNotification({
      agentId: 'rex',
      caseId,
      caseTitle,
      type: 'warning',
      priority: 'high',
      title: 'Evidence Concerns Detected',
      message: `Rex is assessing credibility for concerning evidence in "${caseTitle ?? 'the case'}". Review required.`,
    });
  }
}

/** Call when a prospect's intake is received/submitted */
export async function onIntakeReceived(intake: IntakeCase): Promise<void> {
  let cases: Case[] = [];
  try {
    cases = JSON.parse(localStorage.getItem('lexsim_cases') ?? '[]');
  } catch {}
  const clientNames = cases.map(c => c.client).filter(Boolean);

  const sysInstruction = `You are Maya, the Case Intake Specialist at CaseBuddy Law Firm. Analyze new client intake submissions, identify potential legal claims, assess case fit and urgency, and check for conflicts against existing clients.`;

  const userPrompt = `
Analyze this new intake:
Client: ${intake.full_name}
Contact: ${intake.contact}
Matter Type: ${intake.matter_type}
Summary: ${intake.summary}

Our existing client list (for conflict checking):
${clientNames.length > 0 ? clientNames.join(', ') : 'None'}

Please provide a structured triage report with:
1. Urgency assessment and critical deadlines.
2. Conflict status: Clear or Potential Conflict (if client name matches or is similar to any existing client).
3. Recommended specialist attorney.
4. Triage Summary (2-3 sentences).
`;

  try {
    const report = await deepseekChat({
      systemInstruction: sysInstruction,
      messages: [{ role: 'user', content: userPrompt }],
      temperature: 0.3,
      maxTokens: 800,
    });

    pushNotification({
      agentId: 'maya',
      caseId: intake.id,
      caseTitle: `${intake.full_name} (Intake)`,
      type: 'insight',
      priority: intake.urgency === 'high' ? 'high' : 'medium',
      title: `Intake Triage: ${intake.full_name}`,
      message: report,
      actions: [{ label: 'Open Intake', route: '/app/cases' }],
    });
  } catch (err) {
    console.error('[caseEventHooks] Maya auto-triage failed:', err);
  }
}

/** Call when a deadline is added to trigger follow-up workflows */
export async function onDeadlineAdded(deadline: { caseId?: string; caseTitle?: string; type: string; dueDate: string }): Promise<void> {
  const { caseId, caseTitle, type, dueDate } = deadline;
  const daysUntilDue = daysBetween(Date.now(), new Date(dueDate).getTime());

  // Trial/hearing date triggers trial prep workflow
  if (type === 'trial-date' || type === 'hearing-date') {
    if (daysUntilDue <= 30 && daysUntilDue > 28) {
      const wf = createWorkflow('trial-prep-30-days', caseId!);
      if (wf) {
        orchestrator.executeWorkflowAsync(wf);
        pushNotification({
          agentId: 'rex',
          caseId,
          caseTitle,
          type: 'alert',
          priority: 'high',
          title: '30-Day Trial Prep Activated',
          message: `Trial for "${caseTitle ?? 'the case'}" is ${daysUntilDue} days away. Full prep workflow started.`,
        });
      }
    }
    // Jury selection prep at 10 days
    if (daysUntilDue <= 10 && daysUntilDue > 8) {
      const wf = createWorkflow('jury-selection-prep', caseId!);
      if (wf) orchestrator.executeWorkflowAsync(wf);
    }
  }

  // Statute of limitations triggers intake workflow if case is new
  if (type === 'statute-of-limitations' && daysUntilDue <= 60) {
    const wf = createWorkflow('new-case-intake', caseId!);
    if (wf) orchestrator.executeWorkflowAsync(wf);
  }
}
