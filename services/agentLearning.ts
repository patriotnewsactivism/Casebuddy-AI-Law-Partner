/**
 * agentLearning.ts — Learning engine for AI agents.
 *
 * Records user feedback (+/-) and case outcomes, extracts patterns,
 * and improves agent memory context over time.
 */

import { upsertPattern, getPatterns } from './agentMemory';
import { AGENT_CONFIG } from '../config/agentConfig';
import type { LearningEvent, AgentPattern } from '../types';

// ── Persistence ────────────────────────────────────────────────────────────

const EVENTS_KEY = 'cb_learning_events';
const FEEDBACK_KEY = 'cb_feedback';

function loadEvents(): LearningEvent[] {
  try {
    return JSON.parse(localStorage.getItem(EVENTS_KEY) ?? '[]');
  } catch {
    return [];
  }
}

function saveEvent(event: LearningEvent): void {
  const events = loadEvents();
  events.push(event);
  try {
    localStorage.setItem(EVENTS_KEY, JSON.stringify(events.slice(-500)));
  } catch { /* ignore */ }
}

// ── Pattern extraction ─────────────────────────────────────────────────────

const PATTERN_TEMPLATES = [
  {
    id: 'high-win-prob-settled',
    test: (e: LearningEvent) =>
      e.context.winProbability !== undefined && e.context.winProbability >= 70 && e.outcome === 'success',
    pattern: 'Cases with 70%+ win probability tend to resolve favorably',
    category: 'outcome-prediction',
  },
  {
    id: 'hostile-witness-contradicts',
    test: (e: LearningEvent) =>
      e.context.witnessPersonality?.toLowerCase().includes('hostile') &&
      e.context.questionCount !== undefined && e.context.questionCount >= 10,
    pattern: 'Hostile witnesses often contradict themselves after 10+ focused questions',
    category: 'witness-strategy',
  },
  {
    id: 'aggressive-counsel-low-settle',
    test: (e: LearningEvent) =>
      e.context.opponentAggressiveness !== undefined && e.context.opponentAggressiveness >= 80,
    pattern: 'Aggressive opposing counsel (80%+) rarely settle without significant concessions',
    category: 'negotiation',
  },
  {
    id: 'user-positive-feedback',
    test: (e: LearningEvent) => e.userFeedback === 'positive',
    pattern: 'User-approved responses: detailed, specific, actionable',
    category: 'response-quality',
  },
  {
    id: 'user-negative-feedback',
    test: (e: LearningEvent) => e.userFeedback === 'negative',
    pattern: 'User-rejected responses: insufficient detail or off-topic',
    category: 'response-quality',
  },
];

async function extractAndStorePatterns(event: LearningEvent): Promise<void> {
  for (const template of PATTERN_TEMPLATES) {
    if (template.test(event)) {
      await upsertPattern(event.agentId, {
        agentId: event.agentId,
        pattern: template.pattern,
        confidence: event.userFeedback === 'positive' ? 75 : event.userFeedback === 'negative' ? 40 : 55,
        occurrences: 1,
        category: template.category,
      });
    }
  }
}

// ── Public API ─────────────────────────────────────────────────────────────

/** Record any learning event (agent action + outcome) */
export async function recordLearningEvent(
  event: Omit<LearningEvent, 'id' | 'timestamp'>
): Promise<void> {
  if (!AGENT_CONFIG.learning.enabled) return;

  const full: LearningEvent = {
    ...event,
    id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    timestamp: Date.now(),
  };

  saveEvent(full);
  await extractAndStorePatterns(full);
}

/** Record explicit user feedback on an agent response */
export async function recordFeedback(
  agentId: string,
  caseId: string,
  messageIndex: number,
  feedback: 'positive' | 'negative',
  context: Record<string, any> = {}
): Promise<void> {
  if (!AGENT_CONFIG.learning.enabled) return;

  // Save in quick-access feedback store
  const feedbacks: Array<{ agentId: string; caseId: string; messageIndex: number; feedback: string; timestamp: number }> = (() => {
    try { return JSON.parse(localStorage.getItem(FEEDBACK_KEY) ?? '[]'); } catch { return []; }
  })();
  feedbacks.push({ agentId, caseId, messageIndex, feedback, timestamp: Date.now() });
  try { localStorage.setItem(FEEDBACK_KEY, JSON.stringify(feedbacks.slice(-1000))); } catch { /* ignore */ }

  await recordLearningEvent({
    agentId,
    caseId,
    action: 'agent-response',
    outcome: feedback === 'positive' ? 'success' : 'failure',
    userFeedback: feedback,
    context,
  });
}

/** Get patterns for an agent (above threshold confidence) */
export async function getAgentPatterns(agentId: string): Promise<AgentPattern[]> {
  const all = await getPatterns(agentId);
  return all
    .filter(
      p =>
        p.confidence >= AGENT_CONFIG.learning.patternConfidenceThreshold &&
        p.occurrences >= AGENT_CONFIG.learning.patternMinOccurrences
    )
    .sort((a, b) => b.confidence - a.confidence);
}

/** Build a patterns context string for injection into agent prompts */
export async function buildPatternsContext(agentId: string): Promise<string> {
  const patterns = await getAgentPatterns(agentId);
  if (patterns.length === 0) return '';

  return `\n\n--- Learned Patterns ---\n${patterns
    .slice(0, 5)
    .map(p => `• ${p.pattern} (${p.confidence}% confidence)`)
    .join('\n')}\n--- End Patterns ---`;
}
