/**
 * agentMemory.ts — Persistent memory manager for all AI agents.
 *
 * Architecture:
 *  • Short-term  : localStorage — fast, ephemeral, session-scoped
 *  • Long-term   : IndexedDB    — structured, queryable, persistent
 *
 * Memory key pattern:  `cb_mem_{agentId}_{caseId}`
 * Global patterns key: `cb_patterns_{agentId}`
 */

import { idbGet, idbSet, idbDelete, idbGetAllKeys } from '../utils/indexedDBAdapter';
import { AGENT_CONFIG } from '../config/agentConfig';
import type {
  AgentMemory,
  AgentAction,
  AgentInsight,
  AgentPattern,
  AgentHandoff,
  ShortTermMemory,
  LongTermMemory,
} from '../types';

// ── Key helpers ────────────────────────────────────────────────────────────

const memKey = (agentId: string, caseId: string) => `cb_mem_${agentId}_${caseId}`;
const patternKey = (agentId: string) => `cb_patterns_${agentId}`;
const lsKey = (agentId: string, caseId: string) => `lexsim_mem_${agentId}_${caseId}`;

// ── Default constructors ───────────────────────────────────────────────────

function makeDefaultMemory(agentId: string, caseId: string): AgentMemory {
  return {
    agentId,
    caseId,
    shortTerm: {
      recentActions: [],
      workingContext: {},
      pendingInsights: [],
    },
    longTerm: {
      insights: [],
      patterns: [],
      interactionCount: 0,
      lastActiveAt: Date.now(),
    },
    handoffs: [],
    updatedAt: Date.now(),
  };
}

// ── Load / Save ────────────────────────────────────────────────────────────

/**
 * Load agent memory. Merges localStorage short-term + IndexedDB long-term.
 * Returns a default empty memory if nothing is stored yet.
 */
export async function loadMemory(agentId: string, caseId: string): Promise<AgentMemory> {
  if (!AGENT_CONFIG.memory.enabled) return makeDefaultMemory(agentId, caseId);

  try {
    // Try IndexedDB first (authoritative long-term store)
    const stored = await idbGet<AgentMemory>(memKey(agentId, caseId));
    if (stored) return stored;

    // Fall back to localStorage (legacy or offline)
    const raw = localStorage.getItem(lsKey(agentId, caseId));
    if (raw) {
      const parsed = JSON.parse(raw) as AgentMemory;
      // Promote to IDB
      await idbSet(memKey(agentId, caseId), parsed);
      return parsed;
    }
  } catch {
    // IndexedDB unavailable — silently fall through
  }

  return makeDefaultMemory(agentId, caseId);
}

export async function saveMemory(memory: AgentMemory): Promise<void> {
  if (!AGENT_CONFIG.memory.enabled) return;

  memory.updatedAt = Date.now();

  // Enforce limits
  const cfg = AGENT_CONFIG.memory;
  if (memory.shortTerm.recentActions.length > cfg.shortTermActionLimit) {
    memory.shortTerm.recentActions = memory.shortTerm.recentActions.slice(-cfg.shortTermActionLimit);
  }
  if (memory.longTerm.insights.length > cfg.longTermInsightLimit) {
    memory.longTerm.insights = memory.longTerm.insights.slice(-cfg.longTermInsightLimit);
  }
  if (memory.longTerm.patterns.length > cfg.patternLimit) {
    memory.longTerm.patterns = memory.longTerm.patterns
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, cfg.patternLimit);
  }

  try {
    await idbSet(memKey(memory.agentId, memory.caseId), memory);
  } catch {
    // Fall back to localStorage
    try {
      localStorage.setItem(lsKey(memory.agentId, memory.caseId), JSON.stringify(memory));
    } catch {
      // Storage full — silently ignore
    }
  }
}

export async function deleteMemory(agentId: string, caseId: string): Promise<void> {
  await idbDelete(memKey(agentId, caseId));
  localStorage.removeItem(lsKey(agentId, caseId));
}

// ── Mutation helpers ───────────────────────────────────────────────────────

/**
 * Add an action to the agent's short-term memory.
 */
export async function recordAction(
  agentId: string,
  caseId: string,
  action: Omit<AgentAction, 'timestamp'>
): Promise<void> {
  const mem = await loadMemory(agentId, caseId);
  mem.shortTerm.recentActions.push({ ...action, timestamp: Date.now() });
  mem.longTerm.interactionCount += 1;
  mem.longTerm.lastActiveAt = Date.now();
  await saveMemory(mem);
}

/**
 * Add an insight to the agent's memory.
 * Stores in short-term (pending) and periodically consolidates to long-term.
 */
export async function addInsight(
  agentId: string,
  caseId: string,
  insight: Omit<AgentInsight, 'id' | 'timestamp' | 'read'>
): Promise<string> {
  const mem = await loadMemory(agentId, caseId);
  const id = `ins_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const full: AgentInsight = {
    ...insight,
    id,
    timestamp: Date.now(),
    read: false,
  };

  // Promote directly to long-term for high-confidence insights
  if (insight.confidence >= 70) {
    mem.longTerm.insights.push(full);
  } else {
    mem.shortTerm.pendingInsights.push(full);
  }

  await saveMemory(mem);
  return id;
}

/**
 * Record an agent hand-off event in both agents' memories.
 */
export async function recordHandoff(handoff: Omit<AgentHandoff, 'id' | 'timestamp'>): Promise<void> {
  const full: AgentHandoff = {
    ...handoff,
    id: `ho_${Date.now()}`,
    timestamp: Date.now(),
  };

  const [fromMem, toMem] = await Promise.all([
    loadMemory(handoff.fromAgentId, handoff.caseId),
    loadMemory(handoff.toAgentId, handoff.caseId),
  ]);

  fromMem.handoffs.push(full);
  toMem.handoffs.push(full);

  await Promise.all([saveMemory(fromMem), saveMemory(toMem)]);
}

// ── Context extraction ─────────────────────────────────────────────────────

/**
 * Build a compact context string to inject into agent system prompts.
 * Prioritises recent actions + high-confidence insights.
 */
export async function buildMemoryContext(agentId: string, caseId: string): Promise<string> {
  if (!AGENT_CONFIG.memory.enabled) return '';

  const mem = await loadMemory(agentId, caseId);
  const parts: string[] = [];

  // Recent actions (last 5)
  const recent = mem.shortTerm.recentActions.slice(-5);
  if (recent.length > 0) {
    parts.push(
      `Recent activity:\n${recent
        .map(a => `• [${new Date(a.timestamp).toLocaleDateString()}] ${a.type}: ${a.description}`)
        .join('\n')}`
    );
  }

  // Top insights (sorted by confidence)
  const topInsights = [...mem.longTerm.insights, ...mem.shortTerm.pendingInsights]
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 6);

  if (topInsights.length > 0) {
    parts.push(
      `Key insights:\n${topInsights
        .map(i => `• [${i.type.toUpperCase()} ${i.confidence}%] ${i.title}: ${i.content}`)
        .join('\n')}`
    );
  }

  // Top patterns (confidence ≥ threshold)
  const patterns = mem.longTerm.patterns
    .filter(p => p.confidence >= AGENT_CONFIG.learning.patternConfidenceThreshold)
    .slice(0, 4);

  if (patterns.length > 0) {
    parts.push(
      `Patterns observed:\n${patterns
        .map(p => `• ${p.pattern} (${p.confidence}% confidence, ${p.occurrences}x)`)
        .join('\n')}`
    );
  }

  if (parts.length === 0) return '';

  return `\n\n--- Agent Long-Term Memory ---\n${parts.join('\n\n')}\n--- End Memory ---`;
}

/**
 * Build a TEAM-WIDE context string for a case: what every agent on the case
 * has discovered and which handoffs happened. This is how agents communicate
 * across workflows and sessions — Lex's research becomes visible to Rex,
 * Doc's drafts to the specialists, and so on. Per-agent memory
 * (buildMemoryContext) stays private; this aggregates the shared knowledge.
 */
export async function buildTeamContext(
  caseId: string,
  excludeAgentId?: string,
  maxInsights = 10
): Promise<string> {
  if (!AGENT_CONFIG.memory.enabled || !caseId || caseId === 'general') return '';

  try {
    const { OPERATIONAL_AGENTS, LEGAL_SPECIALISTS, PARALEGALS } = await import('../agents/personas');
    const roster: { id: string; name: string }[] = [
      ...OPERATIONAL_AGENTS.map((a: any) => ({ id: a.id, name: a.name })),
      ...LEGAL_SPECIALISTS.map((a: any) => ({ id: a.id, name: a.name })),
      ...PARALEGALS.map((a: any) => ({ id: a.id, name: a.name })),
    ];
    const nameOf = (id: string) => roster.find(r => r.id === id)?.name ?? id;

    const mems = await Promise.all(
      roster
        .filter(r => r.id !== excludeAgentId)
        .map(r => loadMemory(r.id, caseId).catch(() => null))
    );

    // Collect insights from every teammate, newest + most confident first
    const insights: AgentInsight[] = [];
    const handoffs = new Map<string, AgentHandoff>(); // dedupe (stored on both sides)
    for (const mem of mems) {
      if (!mem) continue;
      insights.push(...mem.longTerm.insights, ...mem.shortTerm.pendingInsights);
      for (const h of mem.handoffs.slice(-5)) handoffs.set(h.id, h);
    }

    const parts: string[] = [];

    const topInsights = insights
      .sort((a, b) => (b.timestamp - a.timestamp) || (b.confidence - a.confidence))
      .slice(0, maxInsights);
    if (topInsights.length > 0) {
      parts.push(
        `What the team has found:\n${topInsights
          .map(i => `• ${nameOf(i.agentId)} [${i.type} ${i.confidence}%]: ${i.title} — ${i.content.slice(0, 220)}`)
          .join('\n')}`
      );
    }

    const recentHandoffs = Array.from(handoffs.values())
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, 5);
    if (recentHandoffs.length > 0) {
      parts.push(
        `Recent handoffs:\n${recentHandoffs
          .map(h => `• ${nameOf(h.fromAgentId)} → ${nameOf(h.toAgentId)}: ${h.reason}`)
          .join('\n')}`
      );
    }

    if (parts.length === 0) return '';
    return `\n\n--- Team Activity (shared across all agents) ---\n${parts.join('\n\n')}\n--- End Team Activity ---`;
  } catch {
    return '';
  }
}

// ── Pattern management ─────────────────────────────────────────────────────

export async function upsertPattern(
  agentId: string,
  pattern: Omit<AgentPattern, 'id' | 'lastSeen'>
): Promise<void> {
  const key = patternKey(agentId);
  let patterns: AgentPattern[] = [];
  try {
    const stored = await idbGet<AgentPattern[]>(key);
    if (stored) patterns = stored;
  } catch { /* ignore */ }

  const existing = patterns.find(p => p.pattern === pattern.pattern);
  if (existing) {
    existing.occurrences += 1;
    existing.confidence = Math.min(100, existing.confidence + 3);
    existing.lastSeen = Date.now();
  } else {
    patterns.push({
      ...pattern,
      id: `pat_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      lastSeen: Date.now(),
    });
  }

  await idbSet(key, patterns);
}

export async function getPatterns(agentId: string): Promise<AgentPattern[]> {
  try {
    return (await idbGet<AgentPattern[]>(patternKey(agentId))) ?? [];
  } catch {
    return [];
  }
}

// ── Bulk operations ────────────────────────────────────────────────────────

export async function getAllMemoryKeys(): Promise<string[]> {
  try {
    const keys = await idbGetAllKeys();
    return keys.filter(k => (k as string).startsWith('cb_mem_'));
  } catch {
    return [];
  }
}

export async function clearAllMemory(): Promise<void> {
  try {
    const keys = await getAllMemoryKeys();
    await Promise.all(keys.map(k => idbDelete(k as string)));
  } catch { /* ignore */ }

  // Also clear localStorage fallback entries
  const lsKeys = Object.keys(localStorage).filter(k => k.startsWith('lexsim_mem_'));
  lsKeys.forEach(k => localStorage.removeItem(k));
}

// ── Consolidation (short → long term) ────────────────────────────────────

/**
 * Promote pending short-term insights to long-term memory and compress old data.
 * Call periodically (e.g., on app resume or after 6 hours).
 */
export async function consolidateMemory(agentId: string, caseId: string): Promise<void> {
  const mem = await loadMemory(agentId, caseId);

  // Promote all short-term pending insights to long-term
  for (const insight of mem.shortTerm.pendingInsights) {
    mem.longTerm.insights.push(insight);
  }
  mem.shortTerm.pendingInsights = [];

  // Clear old short-term actions (keep last 10)
  mem.shortTerm.recentActions = mem.shortTerm.recentActions.slice(-10);

  await saveMemory(mem);
}
