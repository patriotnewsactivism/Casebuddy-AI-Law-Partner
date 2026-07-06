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
import { loadCases as loadCasesFromStorage } from '../utils/storage';

// ── Helpers ────────────────────────────────────────────────────────────────

function daysBetween(from: number, toDateStr: string | undefined): number | null {
  if (!toDateStr) return null;
  const to = new Date(toDateStr).getTime();
  if (isNaN(to)) return null;
  return Math.ceil((to - from) / 86_400_000);
}

function loadCases(): Case[] {
  try {
    return loadCasesFromStorage();
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
          const agentId = c.assignedSpecialistId || 'lex';
          backgroundEngine.schedule({
            agentId,
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

  // ── Weekly case digest (Maya) ─────────────────────────────────────────
  // Every 7 days per open case, Maya compiles a digest of messages,
  // evidence, and workflow activity and posts it to the War Room.
  {
    id: 'weekly-case-digest',
    check: async (cases, now) => {
      const DIGEST_KEY = 'cb_last_digest';
      let last: Record<string, number> = {};
      try { last = JSON.parse(localStorage.getItem(DIGEST_KEY) ?? '{}'); } catch {}

      let changed = false;
      for (const c of cases) {
        if (c.status === 'Closed') continue;
        const prev = last[c.id] ?? 0;
        if (now - prev >= 7 * 86_400_000) {
          last[c.id] = now;
          changed = true;
          backgroundEngine.schedule({
            agentId: 'maya',
            caseId: c.id,
            taskType: 'summarize',
            schedule: 'immediate',
            priority: 'low',
            description: `Weekly case digest for ${c.title}`,
          });
        }
      }
      if (changed) {
        try { localStorage.setItem(DIGEST_KEY, JSON.stringify(last)); } catch {}
      }
    },
  },

  // ── Stale Case Monitor Rule (D1) ──────────────────────────────────────
  {
    id: 'stale-case-rule',
    check: async (cases, now) => {
      for (const c of cases) {
        if (c.status === 'Closed') continue;
        const lastUpdated = c.updatedAt ? new Date(c.updatedAt).getTime() : now;
        const diffDays = Math.ceil((now - lastUpdated) / 86_400_000);
        if (diffDays >= 30) {
          const key = `stale_${c.id}`;
          if (!hasFiredToday(key)) {
            fireTodayKey(key);
            backgroundEngine.schedule({
              agentId: 'maya',
              caseId: c.id,
              taskType: 'analyze',
              schedule: 'immediate',
              priority: 'medium',
              description: `Stale case review — no updates for ${diffDays} days`,
            });
            pushInsightAlert(
              'maya',
              c.id,
              c.title,
              'Stale Case Warning',
              `Case "${c.title}" has had no status updates for ${diffDays} days. Maya has scheduled a status review.`,
              'medium'
            );
          }
        }
      }
    },
  },

  // ── Deposition Approaching Rule (D3) ──────────────────────────────────
  {
    id: 'deposition-approaching-rule',
    check: async (cases, now) => {
      let deadlines: any[] = [];
      try {
        deadlines = JSON.parse(localStorage.getItem('casebuddy_deadlines') ?? '[]');
      } catch {}

      for (const d of deadlines) {
        if (d.completed) continue;
        const isDepo = d.label?.toLowerCase().includes('deposition') || d.label?.toLowerCase().includes('depo');
        if (!isDepo) continue;

        const due = new Date(d.dueDate).getTime();
        if (isNaN(due)) continue;
        const days = Math.ceil((due - now) / 86_400_000);

        if (days === 5) {
          const matchingCase = cases.find(c => c.title === d.caseTitle);
          if (!matchingCase) continue;

          const key = `depo_${d.id}_5`;
          if (!hasFiredToday(key)) {
            fireTodayKey(key);
            const wf = createWorkflow('witness-deposition-prep', matchingCase.id, {
              witnessName: d.label.replace(/deposition|depo/gi, '').trim(),
            });
            if (wf) {
              orchestrator.executeWorkflowAsync(wf, matchingCase);
            }
            pushInsightAlert(
              'rex',
              matchingCase.id,
              matchingCase.title,
              'Deposition Prep Triggered',
              `Deposition for "${d.label}" is in 5 days. Lex and Rex are preparing outlines and cross-examinations.`,
              'high'
            );
          }
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
