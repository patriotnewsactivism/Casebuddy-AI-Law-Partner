import React, { useEffect, useState, useContext } from 'react';
import { GitBranch, Loader2 } from 'lucide-react';
import { findSimilarCases, generateCrossCaseInsights } from '../services/crossCaseIntelligence';
import { AppContext } from '../App';
import type { CrossCaseInsight, Case } from '../types';

const INSIGHT_STYLES: Record<string, string> = {
  benchmark: 'border-cyan-500/20 bg-cyan-500/5',
  strategy:  'border-gold-500/20 bg-gold-500/5',
  risk:      'border-red-500/20 bg-red-500/5',
  pattern:   'border-slate-700 bg-slate-800/30',
};

const SimilarCases: React.FC = () => {
  const { activeCase } = useContext(AppContext);
  const [similar, setSimilar] = useState<{ case: Case; score: number }[]>([]);
  const [insights, setInsights] = useState<CrossCaseInsight[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!activeCase) { setSimilar([]); setInsights([]); return; }

    const found = findSimilarCases(activeCase.id, 3);
    setSimilar(found);

    if (found.length >= 2) {
      setLoading(true);
      generateCrossCaseInsights(activeCase.id)
        .then(setInsights)
        .catch(() => {})
        .finally(() => setLoading(false));
    } else {
      setInsights([]);
    }
  }, [activeCase?.id]);

  if (!activeCase || similar.length === 0) return null;

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
      <div className="flex items-center gap-2 mb-4">
        <GitBranch size={17} className="text-cyan-400" />
        <h3 className="text-sm font-bold text-white">Cross-Case Intelligence</h3>
        <span className="ml-auto text-xs text-slate-500">
          {similar.length} similar case{similar.length !== 1 ? 's' : ''}
        </span>
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-slate-400 text-sm py-2">
          <Loader2 size={14} className="animate-spin" /> Generating insights…
        </div>
      )}

      {insights.length > 0 && (
        <div className="space-y-2 mb-4">
          {insights.map((insight, i) => (
            <div
              key={i}
              className={`rounded-xl border p-3 ${INSIGHT_STYLES[insight.type] ?? INSIGHT_STYLES.pattern}`}
            >
              <p className="text-xs font-semibold text-slate-200 mb-0.5">{insight.title}</p>
              <p className="text-xs text-slate-400 leading-relaxed">{insight.description}</p>
              <div className="flex items-center gap-2 mt-1.5">
                <span className="text-[10px] text-slate-500">{insight.confidence}% confidence</span>
                <span className="text-[10px] text-slate-600">·</span>
                <span className="text-[10px] text-slate-500">
                  Based on {insight.basedOnCases} case{insight.basedOnCases !== 1 ? 's' : ''}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="space-y-1.5">
        {similar.map(({ case: c, score }) => (
          <div
            key={c.id}
            className="flex items-center gap-3 p-2.5 rounded-lg border border-slate-800 bg-slate-800/30 hover:border-slate-700 transition-colors"
          >
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-slate-200 truncate">{c.title}</p>
              <p className="text-[10px] text-slate-500">
                {c.status} · {c.winProbability}% win prob
              </p>
            </div>
            <div className="text-right shrink-0">
              <div className="text-xs font-bold text-cyan-400">{score}%</div>
              <div className="text-[9px] text-slate-600">match</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default SimilarCases;
