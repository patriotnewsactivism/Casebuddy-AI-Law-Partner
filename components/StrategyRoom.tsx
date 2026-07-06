import React, { useContext, useState, useEffect, useMemo} from 'react';
import { AppContext } from '../App';
import { MOCK_OPPONENT } from '../constants';
import { predictStrategy } from '../services/geminiService';
import { searchCaseLaw } from '../services/integrationService';
import { runReasoning } from '../services/agentReasoning';
import { addInsight } from '../services/agentMemory';
import { buildCaseBrief } from '../services/caseContext';
import { StrategyInsight, ReasoningMode } from '../types';
import { BrainCircuit, Target, Shield, AlertOctagon, Lightbulb, RefreshCw, Search, ExternalLink, BookOpen, Loader } from 'lucide-react';
import AgentHeader from './AgentHeader';
import AIDisclaimer from './AIDisclaimer';
import { OPERATIONAL_AGENTS } from '../agents/personas';
import { ReasoningModeSelector, ReasoningResultBadge } from './ReasoningIndicator';
import type { ReasoningResult } from '../types';

const LEX = OPERATIONAL_AGENTS.find(a => a.id === 'lex')!;

const StrategyRoom = () => {
  const { activeCase } = useContext(AppContext);
  const [insights, setInsights] = useState<StrategyInsight[]>([]);
  const sortedInsights = useMemo(() => [...insights].sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0)), [insights]);
  const [loading, setLoading] = useState(false);
  const [reasoningMode, setReasoningMode] = useState<ReasoningMode>('standard');
  const [reasoningResult, setReasoningResult] = useState<ReasoningResult | null>(null);

  // Case law search state
  const [caseLawQuery, setCaseLawQuery] = useState('');
  const [caseLawResults, setCaseLawResults] = useState<any[]>([]);
  const [caseLawLoading, setCaseLawLoading] = useState(false);
  const [caseLawError, setCaseLawError] = useState<string | null>(null);
  const [caseLawNotConfigured, setCaseLawNotConfigured] = useState(false);

  // Initial load
  useEffect(() => {
    if (activeCase && insights.length === 0) {
      handleGenerateStrategy();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCase]);

  const handleGenerateStrategy = async () => {
    if (!activeCase) return;
    setLoading(true);
    setReasoningResult(null);

    try {
      // Strategy runs on the complete case file — intake narrative, analyzed
      // documents/discovery, transcripts — not just the one-line summary.
      let caseCtx = '';
      try {
        caseCtx = await buildCaseBrief(activeCase, { maxChars: 8000 });
      } catch { /* fall back below */ }
      if (!caseCtx) {
        caseCtx = `Title: ${activeCase.title}\nClient: ${activeCase.client}\nStatus: ${activeCase.status}\nSummary: ${activeCase.summary}\nOpposing Counsel: ${activeCase.opposingCounsel}\nJudge: ${activeCase.judge}`;
      }

      let finalInsights: StrategyInsight[] = [];
      if (reasoningMode === 'standard') {
        // Gemini with thinking budget for standard mode
        const result = await predictStrategy(caseCtx, JSON.stringify(MOCK_OPPONENT));
        setInsights(result);
        finalInsights = result;
      } else {
        // Extended reasoning modes via DeepSeek
        const result = await runReasoning({
          mode: reasoningMode,
          agentId: 'lex',
          caseId: activeCase.id,
          systemInstruction: `You are Lex, a senior legal strategist at CaseBuddy. Provide deep strategic analysis identifying risks, opportunities, and predictions for this case.`,
          task: `Analyze the trial strategy for case "${activeCase.title}" against opposing counsel ${activeCase.opposingCounsel}. Identify risks, opportunities, and strategic predictions.`,
          caseContext: caseCtx,
        });
        setReasoningResult(result);
        // Convert to StrategyInsight format for display
        const lines = result.synthesis.split('\n').filter(Boolean);
        const converted: StrategyInsight[] = lines.slice(0, 4).map((line, i) => ({
          title: line.startsWith('-') || line.startsWith('•') ? line.slice(2, 60) : `Insight ${i + 1}`,
          description: line,
          confidence: result.confidence - i * 3,
          type: i === 0 ? 'risk' : i === 1 ? 'opportunity' : 'prediction',
        }));
        finalInsights = converted.length > 0 ? converted : [{ title: 'Strategic Analysis', description: result.synthesis, confidence: result.confidence, type: 'prediction' }];
        setInsights(finalInsights);
      }

      // N1: Strategy outputs -> agent memory
      for (const insight of finalInsights) {
        await addInsight('lex', activeCase.id, {
          agentId: 'lex',
          caseId: activeCase.id,
          title: insight.title,
          content: insight.description,
          confidence: insight.confidence ?? 80,
          type: insight.type === 'opportunity' ? 'opportunity' : insight.type === 'risk' ? 'risk' : 'prediction',
          source: 'research',
        });
      }
    } catch {
      // silent failure
    } finally {
      setLoading(false);
    }
  };

  const handleCaseLawSearch = async () => {
    const q = caseLawQuery.trim();
    if (!q) return;
    setCaseLawLoading(true);
    setCaseLawError(null);
    setCaseLawNotConfigured(false);
    setCaseLawResults([]);
    try {
      const results = await searchCaseLaw(q);
      setCaseLawResults(results);
    } catch (err: any) {
      if (err?.message?.includes('CourtListener is not configured')) {
        setCaseLawNotConfigured(true);
      } else {
        setCaseLawError(err?.message ?? 'Search failed. Please try again.');
      }
    } finally {
      setCaseLawLoading(false);
    }
  };

  return (
    <div className="space-y-8">
      <AgentHeader agent={LEX} compact />
      <AIDisclaimer variant="full" className="mt-4" />
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
            <h1 className="text-3xl font-bold font-serif text-white">War Room Strategy</h1>
            <p className="text-slate-400 mt-1">Deep-thought analysis against {MOCK_OPPONENT.name}</p>
        </div>
        <div className="flex flex-col sm:flex-row items-end gap-2">
          <ReasoningModeSelector
            value={reasoningMode}
            onChange={setReasoningMode}
            disabled={loading}
            compact
          />
          <button
            onClick={handleGenerateStrategy}
            disabled={loading}
            className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-gold-500 border border-gold-500/30 px-4 py-2 rounded-lg transition-all whitespace-nowrap"
          >
            <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
            {loading ? 'AI Thinking...' : 'Regenerate Strategy'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Opponent Profile Card */}
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 h-fit">
           <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
             <Target className="text-red-500" size={20} />
             Opponent Profile
           </h3>
           
           <div className="flex items-center gap-4 mb-6">
              <div className="w-16 h-16 bg-slate-700 rounded-full flex items-center justify-center text-2xl font-bold text-slate-400">
                 {MOCK_OPPONENT.name.charAt(0)}
              </div>
              <div>
                 <div className="font-bold text-white text-lg">{MOCK_OPPONENT.name}</div>
                 <div className="text-sm text-slate-400">{MOCK_OPPONENT.firm}</div>
              </div>
           </div>

           <div className="space-y-4">
              <div>
                 <div className="flex justify-between text-sm mb-1">
                    <span className="text-slate-400">Aggressiveness</span>
                    <span className="text-white">{MOCK_OPPONENT.aggressiveness}%</span>
                 </div>
                 <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                    <div className="h-full bg-red-500 rounded-full" style={{ width: `${MOCK_OPPONENT.aggressiveness}%` }}></div>
                 </div>
              </div>
              <div>
                 <div className="flex justify-between text-sm mb-1">
                    <span className="text-slate-400">Settlement Tendency</span>
                    <span className="text-white">{MOCK_OPPONENT.settlementTendency}%</span>
                 </div>
                 <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                    <div className="h-full bg-green-500 rounded-full" style={{ width: `${MOCK_OPPONENT.settlementTendency}%` }}></div>
                 </div>
              </div>
           </div>

           <div className="mt-6">
              <h4 className="text-sm font-semibold text-slate-300 mb-2">Known Tactics</h4>
              <ul className="space-y-2">
                 {MOCK_OPPONENT.commonTactics.map((t, i) => (
                    <li key={i} className="text-xs bg-slate-900/50 px-3 py-2 rounded border border-slate-700 text-slate-400">
                       {t}
                    </li>
                 ))}
              </ul>
           </div>
        </div>

        {/* AI Insights Feed */}
        <div className="lg:col-span-2 space-y-6">
           {reasoningResult && !loading && (
             <div className="flex items-center gap-2">
               <ReasoningResultBadge result={reasoningResult} />
             </div>
           )}
           {loading ? (
             <div className="h-64 bg-slate-800/50 rounded-xl border border-slate-700 flex flex-col items-center justify-center animate-pulse">
                <BrainCircuit size={48} className="text-gold-500 mb-4" />
                <p className="text-slate-300 font-medium">Analyzing case precedents and opponent psychology...</p>
                <p className="text-slate-500 text-sm mt-2">Thinking Budget: 2048 tokens</p>
             </div>
           ) : (
             insights.length > 0 ? (
               sortedInsights.map((insight, idx) => (
                 <div key={idx} className="bg-slate-800 border border-slate-700 rounded-xl p-6 hover:border-slate-500 transition-colors">
                    <div className="flex items-start gap-4">
                       <div className={`p-3 rounded-lg shrink-0 ${
                          insight.type === 'risk' ? 'bg-red-500/20 text-red-400' :
                          insight.type === 'opportunity' ? 'bg-green-500/20 text-green-400' :
                          'bg-blue-500/20 text-blue-400'
                       }`}>
                          {insight.type === 'risk' && <AlertOctagon size={24} />}
                          {insight.type === 'opportunity' && <Lightbulb size={24} />}
                          {insight.type === 'prediction' && <Shield size={24} />}
                       </div>
                       <div className="flex-1">
                          <h3 className="text-lg font-bold text-white mb-2">{insight.title}</h3>
                          
                          <p className="text-slate-300 leading-relaxed mb-4">{insight.description}</p>
                          
                          <div className="flex items-center gap-3">
                             <span className="text-xs text-slate-400 font-medium whitespace-nowrap">Confidence Score:</span>
                             <div className="flex-1 bg-slate-900 rounded-full h-2">
                                <div 
                                  className={`h-2 rounded-full transition-all duration-1000 ${
                                    insight.confidence >= 80 ? 'bg-green-500' :
                                    insight.confidence >= 50 ? 'bg-gold-500' :
                                    'bg-red-500'
                                  }`} 
                                  style={{ width: `${insight.confidence}%` }}
                                ></div>
                             </div>
                             <span className={`text-xs font-bold ${
                                insight.confidence >= 80 ? 'text-green-400' :
                                insight.confidence >= 50 ? 'text-gold-500' :
                                'text-red-400'
                             }`}>
                                {insight.confidence}%
                             </span>
                          </div>
                       </div>
                    </div>
                 </div>
               ))
             ) : (
               <div className="h-64 bg-slate-800/50 rounded-xl border border-slate-700 flex items-center justify-center text-slate-500">
                  No insights generated yet.
               </div>
             )
           )}
        </div>
      </div>

      {/* Case Law Search */}
      <div className="bg-slate-800 border border-slate-700 rounded-xl p-6">
        <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <BookOpen className="text-blue-400" size={20} />
          Case Law Search
          <span className="ml-auto text-xs text-slate-500 font-normal">Powered by CourtListener</span>
        </h3>

        <div className="flex gap-3 mb-5">
          <div className="flex-1 relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              value={caseLawQuery}
              onChange={e => setCaseLawQuery(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleCaseLawSearch()}
              placeholder="Search case law, e.g. 'fourth amendment exclusionary rule'…"
              className="w-full bg-slate-900 border border-slate-700 rounded-lg pl-9 pr-4 py-2.5 text-sm text-white placeholder-slate-500 outline-none focus:border-blue-500/60 transition-colors"
            />
          </div>
          <button
            onClick={handleCaseLawSearch}
            disabled={caseLawLoading || !caseLawQuery.trim()}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white px-4 py-2.5 rounded-lg text-sm font-medium transition-colors shrink-0"
          >
            {caseLawLoading
              ? <><Loader size={15} className="animate-spin" /> Searching…</>
              : <><Search size={15} /> Search</>}
          </button>
        </div>

        {/* Not configured */}
        {caseLawNotConfigured && (
          <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-lg">
            <p className="text-amber-300 font-semibold text-sm mb-1">CourtListener not configured</p>
            <p className="text-amber-200/70 text-xs mb-3">
              Add your API key to unlock real case law search. CourtListener has a generous free tier.
            </p>
            <div className="bg-slate-900 border border-slate-700 rounded p-2 font-mono text-xs text-amber-400">
              VITE_COURTLISTENER_API_KEY=your_key_here
            </div>
            <p className="text-xs text-amber-200/50 mt-2">
              Add to <code className="bg-amber-500/10 px-1 rounded">.env.local</code> and restart the dev server.{' '}
              <a href="https://www.courtlistener.com/register/" target="_blank" rel="noopener noreferrer"
                className="text-amber-300 underline hover:text-amber-200">
                Get a free key →
              </a>
            </p>
          </div>
        )}

        {/* Error */}
        {caseLawError && (
          <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
            {caseLawError}
          </div>
        )}

        {/* Results */}
        {caseLawResults.length > 0 && (
          <div className="space-y-3">
            <p className="text-xs text-slate-500">{caseLawResults.length} result{caseLawResults.length !== 1 ? 's' : ''} found</p>
            {caseLawResults.map((result: any, idx: number) => (
              <div key={idx} className="bg-slate-900/60 border border-slate-700 rounded-lg p-4 hover:border-slate-600 transition-colors">
                <div className="flex items-start justify-between gap-3 mb-2">
                  <h4 className="text-sm font-semibold text-white leading-snug">
                    {result.caseName ?? result.case_name ?? 'Untitled Case'}
                  </h4>
                  {result.absoluteUrl && (
                    <a href={`https://www.courtlistener.com${result.absoluteUrl}`}
                      target="_blank" rel="noopener noreferrer"
                      className="text-blue-400 hover:text-blue-300 shrink-0 transition-colors" title="View on CourtListener">
                      <ExternalLink size={14} />
                    </a>
                  )}
                </div>
                <div className="flex flex-wrap gap-3 text-xs text-slate-400 mb-2">
                  {(result.court ?? result.court_id) && (
                    <span className="bg-slate-800 border border-slate-700 px-2 py-0.5 rounded-full">
                      {result.court ?? result.court_id}
                    </span>
                  )}
                  {(result.dateFiled ?? result.date_filed) && (
                    <span>{result.dateFiled ?? result.date_filed}</span>
                  )}
                  {result.citation && (
                    <span className="text-slate-500 italic">{result.citation}</span>
                  )}
                </div>
                {result.snippet && (
                  <p className="text-xs text-slate-400 leading-relaxed line-clamp-3"
                    dangerouslySetInnerHTML={{ __html: result.snippet }} />
                )}
              </div>
            ))}
          </div>
        )}

        {/* Empty state after search */}
        {!caseLawLoading && !caseLawNotConfigured && !caseLawError && caseLawResults.length === 0 && caseLawQuery && (
          <div className="text-center py-8 text-slate-500 text-sm">
            No results found for "{caseLawQuery}". Try broader search terms.
          </div>
        )}

        {/* Idle state */}
        {!caseLawLoading && !caseLawNotConfigured && !caseLawError && caseLawResults.length === 0 && !caseLawQuery && (
          <p className="text-slate-500 text-xs text-center py-4">
            Search CourtListener's database of millions of federal and state court opinions.
          </p>
        )}
      </div>
    </div>
  );
};

export default StrategyRoom;