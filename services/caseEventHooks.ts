/**
 * caseEventHooks.ts — Automatically trigger workflows when case events occur.
 *
 * Import and call these hooks from the UI components that create/update cases.
 * They fire-and-forget workflow execution via the orchestrator.
 */

import { orchestrator } from './agentOrchestrator';
import { createWorkflow } from './workflows';
import { pushNotification } from './notificationManager';
import type { Case } from '../types';

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
