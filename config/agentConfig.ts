/**
 * agentConfig.ts — Feature flags and configuration for the AI automation system.
 *
 * Disable individual subsystems here without touching business logic.
 */

export interface ReasoningModeConfig {
  enabled: boolean;
  maxTokens: number;
  steps?: number;
  selfCritique?: boolean;
}

export const AGENT_CONFIG = {
  // ── Memory ─────────────────────────────────────────────────────────────────
  memory: {
    enabled: true,
    // Max recent actions kept in short-term memory per agent/case
    shortTermActionLimit: 50,
    // Max insights kept in long-term memory per agent/case
    longTermInsightLimit: 200,
    // Max patterns kept globally per agent
    patternLimit: 100,
    // How often to consolidate short→long-term (ms)
    consolidationIntervalMs: 6 * 60 * 60 * 1000, // 6 hours
    // IndexedDB database name
    dbName: 'casebuddy_agent_memory',
    dbVersion: 1,
  },

  // ── Reasoning modes ────────────────────────────────────────────────────────
  reasoning: {
    standard: {
      enabled: true,
      maxTokens: 2048,
    } as ReasoningModeConfig,
    deepThink: {
      enabled: true,
      maxTokens: 4096,
      steps: 4,
      selfCritique: true,
    } as ReasoningModeConfig,
    expertPanel: {
      enabled: true,
      maxTokens: 2048,
      maxSpecialists: 3,
    } as ReasoningModeConfig,
    adversarial: {
      enabled: true,
      maxTokens: 3072,
      selfCritique: true,
    } as ReasoningModeConfig,
  },

  // ── Background task engine ─────────────────────────────────────────────────
  background: {
    enabled: true,
    // How often the scheduler polls for due tasks (ms)
    schedulerIntervalMs: 2 * 60 * 1000, // 2 minutes
    // Max concurrent tasks running at once
    maxConcurrentTasks: 3,
    // Per-task timeout (ms)
    taskTimeoutMs: 90_000,
    // Max retries per failed task
    maxRetries: 2,
    // How long completed task results are kept in storage (ms)
    resultRetentionMs: 7 * 24 * 60 * 60 * 1000, // 7 days
  },

  // ── Case monitoring ────────────────────────────────────────────────────────
  monitoring: {
    enabled: true,
    // How often to run the monitoring cycle (ms) — default 5 min
    checkIntervalMs: 5 * 60 * 1000,
    rules: {
      deadlineAlerts: true,
      caseStrengthDrop: true,
      juryPrepReminder: true,
    },
  },

  // ── Notifications ──────────────────────────────────────────────────────────
  notifications: {
    enabled: true,
    // Non-critical notifications are batched for this long before delivery
    batchIntervalMs: 3 * 60 * 1000, // 3 minutes
    maxBatchSize: 6,
    // Max notifications kept in storage
    maxStored: 200,
    // Quiet hours (24h, user's local time) — no toasts during this window
    quietHoursStart: 22,
    quietHoursEnd: 7,
  },

  // ── Agent learning ─────────────────────────────────────────────────────────
  learning: {
    enabled: true,
    // Minimum occurrences before a pattern is considered reliable
    patternMinOccurrences: 3,
    // Minimum confidence before a pattern is surfaced to recommendations
    patternConfidenceThreshold: 65,
  },

  // ── Cross-case intelligence ────────────────────────────────────────────────
  crossCase: {
    enabled: true,
    // Minimum similarity score (0-100) for a case to be considered "similar"
    similarityThreshold: 50,
    // Max similar cases returned
    maxSimilarCases: 8,
  },

  // ── Workflows ──────────────────────────────────────────────────────────────
  workflows: {
    enabled: true,
    // Automatically trigger intake workflow when a case is created
    autoTriggerIntake: true,
    // Days before trial to trigger trial prep workflow
    trialPrepLeadDays: 30,
    // Days before trial to trigger jury prep workflow
    juryPrepLeadDays: 14,
  },
} as const;
