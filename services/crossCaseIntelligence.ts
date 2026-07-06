/**
 * crossCaseIntelligence.ts — Find similar past cases and extract cross-case insights.
 *
 * Compares the active case against all stored cases using scoring heuristics,
 * then generates strategic benchmarks ("similar cases settled for $X").
 */

import { deepseekChat } from './deepseek';
import { AGENT_CONFIG } from '../config/agentConfig';
import type { Case, CrossCaseInsight } from '../types';
import { loadCases } from '../utils/storage';

// ── Helpers ────────────────────────────────────────────────────────────────

function loadAllCases(): Case[] {
  try {
    return loadCases();
  } catch {
    return [];
  }
}

/** Simple keyword extraction: strip common stopwords, take top words */
function extractKeywords(text: string): string[] {
  const stopwords = new Set([
    'the', 'a', 'an', 'and', 'or', 'for', 'in', 'of', 'to', 'with',
    'is', 'was', 'are', 'were', 'has', 'have', 'had', 'that', 'this',
    'case', 'client', 'legal', 'court', 'attorney',
  ]);
  return text
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 3 && !stopwords.has(w));
}

function similarity(a: Case, b: Case): number {
  let score = 0;

  // Same status → +20
  if (a.status === b.status) score += 20;

  // Close win probability (within 15%) → up to +20
  const wpDiff = Math.abs((a.winProbability ?? 50) - (b.winProbability ?? 50));
  score += Math.max(0, 20 - wpDiff);

  // Same opposing counsel firm (partial match) → +15
  if (
    a.opposingCounsel &&
    b.opposingCounsel &&
    a.opposingCounsel.split(' ')[0].toLowerCase() === b.opposingCounsel.split(' ')[0].toLowerCase()
  ) {
    score += 15;
  }

  // Keyword overlap in summaries → up to +30
  const kwA = new Set(extractKeywords(a.summary ?? ''));
  const kwB = extractKeywords(b.summary ?? '');
  const overlap = kwB.filter(k => kwA.has(k)).length;
  score += Math.min(30, overlap * 4);

  // Same judge → +15
  if (a.judge && b.judge && a.judge === b.judge) score += 15;

  return score;
}

// ── Public API ─────────────────────────────────────────────────────────────

/** Find cases most similar to the target, sorted by similarity score */
export function findSimilarCases(targetId: string, limit?: number): { case: Case; score: number }[] {
  if (!AGENT_CONFIG.crossCase.enabled) return [];

  const all = loadAllCases();
  const target = all.find(c => c.id === targetId);
  if (!target) return [];

  const maxResults = limit ?? AGENT_CONFIG.crossCase.maxSimilarCases;
  const threshold = AGENT_CONFIG.crossCase.similarityThreshold;

  return all
    .filter(c => c.id !== targetId)
    .map(c => ({ case: c, score: similarity(target, c) }))
    .filter(r => r.score >= threshold)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxResults);
}

/** Generate cross-case insights by comparing the target to similar cases */
export async function generateCrossCaseInsights(caseId: string): Promise<CrossCaseInsight[]> {
  if (!AGENT_CONFIG.crossCase.enabled) return [];

  const similar = findSimilarCases(caseId, AGENT_CONFIG.crossCase.maxSimilarCases);
  if (similar.length === 0) return [];

  const cases = similar.map(r => r.case);

  // Statistical benchmarks
  const avgWinProb =
    cases.reduce((sum, c) => sum + (c.winProbability ?? 50), 0) / cases.length;

  const insights: CrossCaseInsight[] = [
    {
      type: 'benchmark',
      title: 'Similar Case Win Rate',
      description: `Among ${cases.length} similar case${cases.length > 1 ? 's' : ''} in your history, the average win probability is ${avgWinProb.toFixed(0)}%.`,
      confidence: Math.min(85, 50 + cases.length * 5),
      basedOnCases: cases.length,
    },
  ];

  // Status distribution
  const statusCounts: Record<string, number> = {};
  for (const c of cases) {
    statusCounts[c.status] = (statusCounts[c.status] ?? 0) + 1;
  }
  const dominantStatus = Object.entries(statusCounts).sort((a, b) => b[1] - a[1])[0];
  if (dominantStatus) {
    insights.push({
      type: 'pattern',
      title: 'Common Case Stage',
      description: `${dominantStatus[1]} of ${cases.length} similar cases are at "${dominantStatus[0]}" stage.`,
      confidence: 65,
      basedOnCases: cases.length,
    });
  }

  // AI-generated strategic insight (only if we have enough data)
  if (cases.length >= 2) {
    try {
      const caseDescriptions = cases
        .slice(0, 5)
        .map(c => `- ${c.title}: ${c.status}, ${c.winProbability}% win prob, ${c.summary?.slice(0, 100) ?? ''}`)
        .join('\n');

      const current = loadAllCases().find(c => c.id === caseId);

      const aiInsight = await deepseekChat({
        systemInstruction:
          'You are a senior legal strategist with access to case history. In 2-3 sentences, identify the single most actionable lesson from these similar past cases for the current case.',
        messages: [
          {
            role: 'user',
            content: `Current case: ${current?.title ?? 'Unknown'} (${current?.status ?? ''}, ${current?.winProbability ?? 50}% win prob)\n\nSimilar past cases:\n${caseDescriptions}\n\nWhat is the single most valuable lesson from these cases?`,
          },
        ],
        temperature: 0.4,
        maxTokens: 300,
        timeoutMs: 20_000,
      });

      insights.push({
        type: 'strategy',
        title: 'Cross-Case Strategic Lesson',
        description: aiInsight,
        confidence: 70,
        basedOnCases: cases.length,
      });
    } catch { /* non-critical */ }
  }

  return insights;
}

/** Quick summary line: "3 similar cases found" */
export function getSimilarCaseSummary(caseId: string): string {
  const similar = findSimilarCases(caseId, 3);
  if (similar.length === 0) return 'No similar cases found in history.';
  return `${similar.length} similar case${similar.length > 1 ? 's' : ''} found. Avg similarity: ${Math.round(similar.reduce((s, r) => s + r.score, 0) / similar.length)}%.`;
}
