/**
 * caseMonitor.ts — Real-time case monitoring with rule-based alerts.
 *
 * Runs a periodic monitoring cycle checking all active cases against
 * a set of configurable rules. When a rule fires, it schedules a
 * background task and/or pushes a notification.
 *
 * Rules are pure functions: (cases) → void (side effects via pushNotification)
 */

import { AGENT_CONFIG } from '../config/agentConfig';
import { pushDeadlineAlert, pushInsightAlert } from './notificationManager';
import { backgroundEngine } from './backgroundAgentEngine';
import { orchestrator } from './agentOrchestrator';
import { createWorkflow } from './workflows';
import type { Case } from '../types';

// ── Helpers ────────────────────────────────────────────────────────────────

function daysBetween(from: number, toDateStr: string | undefined): number | null {
  if (!toDateStr) return null;
  const to = new Date(toDateStr).getTime();
  if (isNaN(to)) return null;
  return Math.ceil((to - from) / 86_400_000);
}

function loadCases(): Case[] {
  try {
    return JSON.parse(localStorage.getItem('lexsim_cases') ?? '[]');
  } catch {
    return [];
  }
}

// ── Tracking helpers (prevent duplicate alerts) ───────────────────────────

const FIRED_KEY = 'cb_monitor_fired';

function getFiredSet(): Set<string> {
  try {
    const raw = localStorage.getItem(FIRED_KEY);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
}

function markFired(key: string): void {
  const s = getFiredSet();
  s.add(key);
  // Keep only last 500 entries
  const arr = Array.from(s).slice(-500);
  try {
    localStorage.setItem(FIRED_KEY, JSON.stringify(arr));
  } catch { /* ignore */ }
}

function hasFiredToday(key: string): boolean {
  const today = new Date().toDateString();
  return getFiredSet().has(`${key}_${today}`);
}

function fireTodayKey(key: string): void {
  markFired(`${key}_${new Date().toDateString()}`);
}

// ── Monitoring rules ───────────────────────────────────────────────────────

interface Rule {
  id: string;
  check: (cases: Case[], now: number) => Promise<void>;
}

const rules: Rule[] = [
  // ── Deadline proximity alerts ─────────────────────────────────────────
  {
    id: 'deadline-30',
    check: async (cases, now) => {
      if (!AGENT_CONFIG.monitoring.rules.deadlineAlerts) return;
      for (const c of cases) {
        const days = daysBetween(now, c.nextCourtDate);
        if (days === null) continue;

        for (const threshold of [30, 14, 7, 3, 1]) {
          if (days === threshold) {
            const key = `dl_${c.id}_${threshold}`;
            if (!hasFiredToday(key)) {
              fireTodayKey(key);
              pushDeadlineAlert('sol', c.id, c.title, days);

              // Schedule a deeper analysis at 14 and 7 day marks
              if (threshold <= 14) {
                backgroundEngine.schedule({
                  agentId: 'rex',
                  caseId: c.id,
                  taskType: 'analyze',
                  schedule: 'immediate',
                  priority: threshold <= 7 ? 'high' : 'medium',
                  description: `Trial readiness check — ${days}d until court date`,
                });
              }

              // Trigger trial-prep workflow at 30-day mark
              if (
                threshold === 30 &&
                AGENT_CONFIG.workflows.enabled &&
                AGENT_CONFIG.workflows.trialPrepLeadDays >= 30
              ) {
                const wf = createWorkflow('trial-prep-30-days', c.id, {
                  caseTitle: c.title,
                  daysUntilTrial: days,
                });
                if (wf) {
                  const cases_ = loadCases();
                  orchestrator.executeWorkflowAsync(wf, cases_.find(cs => cs.id === c.id));
                }
              }

              // Trigger jury-prep workflow at 14-day mark
              if (
                threshold === 14 &&
                AGENT_CONFIG.workflows.enabled &&
                AGENT_CONFIG.workflows.juryPrepLeadDays >= 14
              ) {
                const wf = createWorkflow('jury-selection-prep', c.id);
                if (wf) {
                  const cases_ = loadCases();
                  orchestrator.executeWorkflowAsync(wf, cases_.find(cs => cs.id === c.id));
                }
              }
            }
          }
        }
      }
    },
  },

  // ── Case strength drop alert ──────────────────────────────────────────
  {
    id: 'case-strength-drop',
    check: async (cases, now) => {
      if (!AGENT_CONFIG.monitoring.rules.caseStrengthDrop) return;

      const HIST_KEY = 'cb_win_prob_history';
      let hist: Record<string, number> = {};
      try {
        hist = JSON.parse(localStorage.getItem(HIST_KEY) ?? '{}');
      } catch { /* ignore */ }

      for (const c of cases) {
        const prev = hist[c.id];
        if (prev !== undefined && prev - c.winProbability >= 10) {
          const key = `wpDrop_${c.id}`;
          if (!hasFiredToday(key)) {
            fireTodayKey(key);
            pushInsightAlert(
              'rex',
              c.id,
              c.title,
              'Case Strength Decline Detected',
              `Win probability for "${c.title}" dropped from ${prev}% to ${c.winProbability}%. Requesting analysis.`,
              'high'
            );

            backgroundEngine.schedule({
              agentId: 'rex',
              caseId: c.id,
              taskType: 'analyze',
              schedule: 'immediate',
              priority: 'high',
              description: `Investigate win-probability drop from ${prev}% → ${c.winProbability}%`,
            });
          }
        }
        // Update history
        hist[c.id] = c.winProbability;
      }

      try {
        localStorage.setItem(HIST_KEY, JSON.stringify(hist));
      } catch { /* ignore */ }
    },
  },

  // ── Proactive background analysis (once per day per case) ─────────────
  {
    id: 'daily-case-analysis',
    check: async (cases, now) => {
      for (const c of cases) {
        if (c.status === 'Closed') continue;
        const key = `daily_${c.id}`;
        if (!hasFiredToday(key)) {
          fireTodayKey(key);
          backgroundEngine.schedule({
            agentId: 'lex',
            caseId: c.id,
            taskType: 'research',
            schedule: 'daily',
            priority: 'low',
            description: `Daily background legal research for ${c.title}`,
          });
        }
      }
    },
  },
];

// ── Monitor class ──────────────────────────────────────────────────────────

class CaseMonitor {
  private handle: ReturnType<typeof setInterval> | null = null;
  private started = false;

  start(): void {
    if (this.started || !AGENT_CONFIG.monitoring.enabled) return;
    this.started = true;

    // Run once immediately (with a small delay to let the app settle)
    setTimeout(() => this.runCycle(), 5_000);

    this.handle = setInterval(
      () => this.runCycle(),
      AGENT_CONFIG.monitoring.checkIntervalMs
    );
  }

  stop(): void {
    if (this.handle) {
      clearInterval(this.handle);
      this.handle = null;
    }
    this.started = false;
  }

  private async runCycle(): Promise<void> {
    const cases = loadCases().filter(c => c.status !== 'Closed');
    const now = Date.now();

    for (const rule of rules) {
      try {
        await rule.check(cases, now);
      } catch (err) {
        // Individual rule failures must not crash the entire cycle
        console.warn(`[CaseMonitor] Rule "${rule.id}" failed:`, err);
      }
    }
  }
}

export const caseMonitor = new CaseMonitor();
