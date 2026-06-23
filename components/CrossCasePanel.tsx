/**
 * CrossCasePanel — shows similar cases + AI-generated cross-case insights
 * in the CaseManager sidebar when a case is selected.
 */

import React, { useEffect, useState, useCallback } from 'react';
import { Sparkles, Loader2, ChevronDown, AlertTriangle, TrendingUp, Target, BookOpen } from 'lucide-react';
import { findSimilarCases, generateCrossCaseInsights, getSimilarCaseSummary } from '../services/crossCaseIntelligence';
import type { Case, CrossCaseInsight } from '../types';

const INSIGHT_ICONS: Record<CrossCaseInsight['type'], React.ReactNode> = {
  benchmark: <TrendingUp size={14} className="text-blue-400" />,
  pattern: <Target size={14} className="text-amber-400" />,
  risk: <AlertTriangle size={14} className="text-rose-400" />,
  strategy: <BookOpen size={14} className="text-emerald-400" />,
};

const INSIGHT_COLORS: Record<CrossCaseInsight['type'], string> = {
  benchmark: 'border-blue-500/30 bg-blue-500/5',
  pattern: 'border-amber-500/30 bg-amber-500/5',
  risk: 'border-rose-500/30 bg-rose-500/5',
  strategy: 'border-emerald-500/30 bg-emerald-500/5',
};

interface Props {
  activeCase: Case;
}

const CrossCasePanel: React.FC<Props> = ({ activeCase }) => {
  const [insights, setInsights] = useState<CrossCaseInsight[]>([]);
  const [summary, setSummary] = useState('');
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [similarCases, setSimilarCases] = useState<{ case: Case; score: number }[]>([]);

  const load = useCallback(async () => {
    if (!activeCase?.id) return;

    // Quick sync summary
    const s = getSimilarCaseSummary(activeCase.id);
    setSummary(s);

    const similar = findSimilarCases(activeCase.id, 5);
    setSimilarCases(similar);

    if (similar.length === 0) {
      setInsights([]);
      return;
    }

    // Async AI insights
    setLoading(true);
    try {
      const result = await generateCrossCaseInsights(activeCase.id);
      setInsights(result);
    } catch {
      setInsights([]);
    } finally {
      setLoading(false);
    }
  }, [activeCase?.id]);

  useEffect(() => {
    load();
  }, [load]);

  if (!summary || summary.includes('No similar')) {
    return (
      <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-4">
        <div className="flex items-center gap-2 text-slate-500 text-sm">
          <Sparkles size={14} />
          <span>No similar cases found yet. Add more cases to unlock cross-case intelligence.</span>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full text-left p-4 flex items-center gap-3 hover:bg-slate-700/30 transition-colors"
      >
        <div className="w-8 h-8 rounded-lg bg-gold-500/15 border border-gold-500/30 flex items-center justify-center shrink-0">
          <Sparkles size={16} className="text-gold-400" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-white">Cross-Case Intelligence</p>
          <p className="text-xs text-slate-400">{summary}</p>
        </div>
        <ChevronDown
          size={16}
          className={`text-slate-400 transition-transform ${expanded ? 'rotate-180' : ''}`}
        />
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-3 border-t border-slate-700">
          {/* Similar Cases */}
          {similarCases.length > 0 && (
            <div className="mt-3">
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-2">
                Similar Cases
              </p>
              <div className="space-y-1.5">
                {similarCases.map(({ case: c, score }) => (
                  <div
                    key={c.id}
                    className="flex items-center justify-between text-xs bg-slate-900/50 rounded-lg px-3 py-2"
                  >
                    <span className="text-slate-300 truncate mr-2">{c.title}</span>
                    <span className="shrink-0 text-gold-400 font-medium">{score}% match</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* AI Insights */}
          {loading ? (
            <div className="flex items-center gap-2 text-slate-400 text-sm py-3">
              <Loader2 size={14} className="animate-spin" />
              Analyzing cross-case patterns…
            </div>
          ) : insights.length > 0 ? (
            <div className="mt-3">
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-2">
                Insights
              </p>
              <div className="space-y-2">
                {insights.map((insight, i) => (
                  <div
                    key={i}
                    className={`rounded-lg border p-3 ${INSIGHT_COLORS[insight.type]}`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      {INSIGHT_ICONS[insight.type]}
                      <span className="text-xs font-semibold text-white">
                        {insight.title}
                      </span>
                      <span className="ml-auto text-[10px] text-slate-500">
                        {insight.confidence}% conf
                      </span>
                    </div>
                    <p className="text-xs text-slate-300 leading-relaxed">
                      {insight.description}
                    </p>
                    <p className="text-[10px] text-slate-500 mt-1">
                      Based on {insight.basedOnCases} case{insight.basedOnCases !== 1 ? 's' : ''}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
};

export default CrossCasePanel;
