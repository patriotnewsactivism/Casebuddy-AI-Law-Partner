
import React, { useContext, useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  Shield, ArrowRight, CheckCircle, AlertCircle, Users, TrendingUp, Zap,
  Loader2, RefreshCw, ChevronDown, ChevronUp, AlertTriangle, Target, BarChart3,
  BrainCircuit, AlertOctagon, Lightbulb, Search, ExternalLink, BookOpen, Loader
} from 'lucide-react';
import { AppContext } from '../App';
import { OPERATIONAL_AGENTS } from '../agents/personas';
import { generateWarRoomBriefing, predictStrategy } from '../services/geminiService';
import { searchCaseLaw } from '../services/integrationService';
import { WarRoomBriefing, WarRoomTask, StrategyInsight } from '../types';
import { MOCK_OPPONENT } from '../constants';
import { toast } from 'react-toastify';
import AgentHeader from './AgentHeader';
import AIDisclaimer from './AIDisclaimer';
import Breadcrumb from './Breadcrumb';

const LEX = OPERATIONAL_AGENTS.find(a => a.id === 'lex')!;

const STORAGE_KEY = (caseId: string) => `warroom_briefing_${caseId}`;

const CATEGORY_LABELS: Record<string, string> = {
  'pre-trial': 'Pre-Trial', discovery: 'Discovery', witnesses: 'Witnesses',
  jury: 'Jury', evidence: 'Evidence', drafting: 'Drafting', strategy: 'Strategy',
};

const CATEGORY_COLORS: Record<string, string> = {
  'pre-trial': 'text-blue-400 bg-blue-500/10 border-blue-500/30',
  discovery: 'text-violet-400 bg-violet-500/10 border-violet-500/30',
  witnesses: 'text-amber-400 bg-amber-500/10 border-amber-500/30',
  jury: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/30',
  evidence: 'text-orange-400 bg-orange-500/10 border-orange-500/30',
  drafting: 'text-pink-400 bg-pink-500/10 border-pink-500/30',
  strategy: 'text-green-400 bg-green-500/10 border-green-500/30',
};

const PRIORITY_COLORS: Record<string, string> = {
  critical: 'text-red-400 bg-red-500/10 border-red-500/40',
  high: 'text-amber-400 bg-amber-500/10 border-amber-500/30',
  medium: 'text-blue-400 bg-blue-500/10 border-blue-500/30',
  low: 'text-slate-400 bg-slate-800 border-slate-700',
};

const RISK_CONFIG: Record<string, { color: string; bg: string; label: string }> = {
  critical: { color: 'text-red-400', bg: 'bg-red-500/10 border-red-500/30', label: 'Critical Risk' },
  elevated: { color: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/30', label: 'Elevated Risk' },
  moderate: { color: 'text-yellow-400', bg: 'bg-yellow-500/10 border-yellow-500/30', label: 'Moderate Risk' },
  low: { color: 'text-green-400', bg: 'bg-green-500/10 border-green-500/30', label: 'Low Risk' },
};

type TabId = 'briefing' | 'strategy' | 'research';

const TABS: { id: TabId; label: string; icon: React.ElementType }[] = [
  { id: 'briefing', label: 'War Room Briefing', icon: Shield },
  { id: 'strategy', label: 'Strategy Analysis', icon: BrainCircuit },
  { id: 'research', label: 'Case Law Search', icon: BookOpen },
];

const TaskRow: React.FC<{ task: WarRoomTask; onToggle: (id: string) => void }> = ({ task, onToggle }) => {
  const agent = OPERATIONAL_AGENTS.find(a => a.id === task.agent);
  return (
    <div className={`flex items-start gap-3 p-3 rounded-xl border transition-all ${
      task.done ? 'bg-slate-900/30 border-slate-800 opacity-60' : 'bg-slate-800/60 border-slate-700'
    }`}>
      <button
        onClick={() => onToggle(task.id)}
        className={`mt-0.5 w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-all ${
          task.done ? 'bg-green-500 border-green-500' : 'border-slate-600 hover:border-gold-500'
        }`}
      >
        {task.done && <CheckCircle size={12} className="text-white" />}
      </button>
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-1.5 mb-0.5">
          <p className={`text-sm font-semibold ${task.done ? 'line-through text-slate-500' : 'text-white'}`}>
            {task.title}
          </p>
          <span className={`text-xs px-1.5 py-0.5 rounded-full border font-medium ${PRIORITY_COLORS[task.priority]}`}>
            {task.priority}
          </span>
          <span className={`text-xs px-1.5 py-0.5 rounded-full border ${CATEGORY_COLORS[task.category]}`}>
            {CATEGORY_LABELS[task.category]}
          </span>
        </div>
        <p className="text-xs text-slate-400">{task.description}</p>
      </div>
      {agent && (
        <Link to={agent.route} title={`Brief ${agent.name}`}
          className={`shrink-0 flex items-center gap-1 text-xs px-2 py-1 rounded-lg border ${agent.bgClass} ${agent.colorClass} ${agent.borderClass} hover:opacity-80 transition-opacity`}>
          <span>{agent.emoji}</span>
          {agent.name}
        </Link>
      )}
    </div>
  );
};

/* ─── Strategy Tab Content ──────────────────────────────────────────────── */
const StrategyTab: React.FC = () => {
  const { activeCase } = useContext(AppContext);
  const [insights, setInsights] = useState<StrategyInsight[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (activeCase && insights.length === 0) {
      handleGenerateStrategy();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCase]);

  const handleGenerateStrategy = async () => {
    if (!activeCase) return;
    setLoading(true);
    const result = await predictStrategy(
      activeCase.summary,
      JSON.stringify(MOCK_OPPONENT)
    );
    setInsights(result);
    setLoading(false);
  };

  return (
    <div className="space-y-6">
      <AgentHeader agent={LEX} compact />
      <AIDisclaimer variant="full" className="mt-4" />

      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <p className="text-slate-400 mt-1">Deep-thought analysis against {MOCK_OPPONENT.name}</p>
        </div>
        <button
          onClick={handleGenerateStrategy}
          disabled={loading}
          className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-gold-500 border border-gold-500/30 px-4 py-2 rounded-lg transition-all"
        >
          <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
          {loading ? 'AI Thinking...' : 'Regenerate Strategy'}
        </button>
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
                <div className="h-full bg-red-500 rounded-full" style={{ width: `${MOCK_OPPONENT.aggressiveness}%` }} />
              </div>
            </div>
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-slate-400">Settlement Tendency</span>
                <span className="text-white">{MOCK_OPPONENT.settlementTendency}%</span>
              </div>
              <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                <div className="h-full bg-green-500 rounded-full" style={{ width: `${MOCK_OPPONENT.settlementTendency}%` }} />
              </div>
            </div>
          </div>
          <div className="mt-6">
            <h4 className="text-sm font-semibold text-slate-300 mb-2">Known Tactics</h4>
            <ul className="space-y-2">
              {MOCK_OPPONENT.commonTactics.map((t: string, i: number) => (
                <li key={i} className="text-xs bg-slate-900/50 px-3 py-2 rounded border border-slate-700 text-slate-400">
                  {t}
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* AI Insights Feed */}
        <div className="lg:col-span-2 space-y-6">
          {loading ? (
            <div className="h-64 bg-slate-800/50 rounded-xl border border-slate-700 flex flex-col items-center justify-center animate-pulse">
              <BrainCircuit size={48} className="text-gold-500 mb-4" />
              <p className="text-slate-300 font-medium">Analyzing case precedents and opponent psychology...</p>
              <p className="text-slate-500 text-sm mt-2">Thinking Budget: 2048 tokens</p>
            </div>
          ) : (
            insights.length > 0 ? (
              insights.map((insight, idx) => (
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
                          />
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
                No insights generated yet. Click "Regenerate Strategy" to analyze your case.
              </div>
            )
          )}
        </div>
      </div>
    </div>
  );
};

/* ─── Research Tab Content ──────────────────────────────────────────────── */
const ResearchTab: React.FC = () => {
  const [caseLawQuery, setCaseLawQuery] = useState('');
  const [caseLawResults, setCaseLawResults] = useState<any[]>([]);
  const [caseLawLoading, setCaseLawLoading] = useState(false);
  const [caseLawError, setCaseLawError] = useState<string | null>(null);
  const [caseLawNotConfigured, setCaseLawNotConfigured] = useState(false);

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
    <div className="space-y-6">
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

        {caseLawError && (
          <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
            {caseLawError}
          </div>
        )}

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

        {!caseLawLoading && !caseLawNotConfigured && !caseLawError && caseLawResults.length === 0 && caseLawQuery && (
          <div className="text-center py-8 text-slate-500 text-sm">
            No results found for "{caseLawQuery}". Try broader search terms.
          </div>
        )}

        {!caseLawLoading && !caseLawNotConfigured && !caseLawError && caseLawResults.length === 0 && !caseLawQuery && (
          <p className="text-slate-500 text-xs text-center py-4">
            Search CourtListener's database of millions of federal and state court opinions.
          </p>
        )}
      </div>
    </div>
  );
};

/* ─── Main Component ────────────────────────────────────────────────────── */
const CommandCenter: React.FC = () => {
  const { activeCase } = useContext(AppContext);
  const [briefing, setBriefing] = useState<WarRoomBriefing | null>(null);
  const [loading, setLoading] = useState(false);
  const [collapsedCats, setCollapsedCats] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState<TabId>('briefing');

  // Load saved briefing on case change
  useEffect(() => {
    if (!activeCase) { setBriefing(null); return; }
    try {
      const saved = localStorage.getItem(STORAGE_KEY(activeCase.id));
      setBriefing(saved ? JSON.parse(saved) : null);
    } catch {
      setBriefing(null);
    }
  }, [activeCase?.id]);

  const activate = useCallback(async () => {
    if (!activeCase) return;
    setLoading(true);
    try {
      const result = await generateWarRoomBriefing(
        activeCase.title,
        activeCase.summary || '',
        activeCase.status,
        activeCase.nextCourtDate || '',
      );
      setBriefing(result);
      localStorage.setItem(STORAGE_KEY(activeCase.id), JSON.stringify(result));
      toast.success('Command Center activated — briefing ready.');
    } catch {
      toast.error('Briefing generation failed. Check your API key.');
    } finally {
      setLoading(false);
    }
  }, [activeCase]);

  const toggleTask = (taskId: string) => {
    if (!briefing || !activeCase) return;
    const updated = {
      ...briefing,
      tasks: briefing.tasks.map(t => t.id === taskId ? { ...t, done: !t.done } : t),
    };
    setBriefing(updated);
    localStorage.setItem(STORAGE_KEY(activeCase.id), JSON.stringify(updated));
  };

  const toggleCat = (cat: string) =>
    setCollapsedCats(prev => { const n = new Set(prev); n.has(cat) ? n.delete(cat) : n.add(cat); return n; });

  const done = briefing?.tasks.filter(t => t.done).length ?? 0;
  const total = briefing?.tasks.length ?? 0;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  const tasksByCategory = briefing
    ? Object.keys(CATEGORY_LABELS).map(cat => ({
        cat,
        tasks: briefing.tasks.filter(t => t.category === cat),
      })).filter(g => g.tasks.length > 0)
    : [];

  return (
    <div className="space-y-6 max-w-5xl">
      <Breadcrumb items={[
        { label: 'AI & Tools' },
        { label: 'Command Center' },
      ]} />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-red-500/10 border border-red-500/30">
            <Shield size={24} className="text-red-400" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-white font-serif">Command Center</h1>
            <p className="text-slate-400 mt-0.5 text-sm">
              {activeCase
                ? <>Briefing, strategy & research for <span className="text-gold-400 font-semibold">{activeCase.title}</span></>
                : 'Select a case to activate the Command Center'}
            </p>
          </div>
        </div>
        <div className="sm:ml-auto flex items-center gap-2">
          {activeTab === 'briefing' && briefing && (
            <button onClick={activate} disabled={loading}
              className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors">
              <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
              Refresh
            </button>
          )}
          {activeTab === 'briefing' && activeCase && (
            <button onClick={activate} disabled={loading}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-red-500 hover:bg-red-400 text-white font-bold text-sm transition-colors disabled:opacity-60">
              {loading ? <Loader2 size={16} className="animate-spin" /> : <Zap size={16} />}
              {briefing ? 'Re-brief the Firm' : 'Activate Command Center'}
            </button>
          )}
        </div>
      </div>

      {/* Tab Bar */}
      <div className="flex gap-1 p-1 bg-slate-900 rounded-xl border border-slate-800">
        {TABS.map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
                isActive
                  ? 'bg-slate-800 text-gold-400 border border-slate-700 shadow-sm'
                  : 'text-slate-500 hover:text-slate-300 border border-transparent'
              }`}
            >
              <Icon size={15} />
              <span className="hidden sm:inline">{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* ─── Tab: Briefing ──────────────────────────────────────────── */}
      {activeTab === 'briefing' && (
        <>
          {/* No case */}
          {!activeCase && (
            <div className="bg-slate-800 border border-slate-700 rounded-2xl p-10 text-center space-y-4">
              <AlertCircle size={36} className="text-slate-500 mx-auto" />
              <div>
                <p className="text-lg font-semibold text-white">No Active Case</p>
                <p className="text-sm text-slate-400 mt-1">Select or create a case to brief all agents and activate the Command Center.</p>
              </div>
              <Link to="/app/cases" className="inline-flex items-center gap-2 px-5 py-2.5 bg-gold-500 hover:bg-gold-400 text-slate-900 font-semibold rounded-xl transition-colors">
                Go to Case Files <ArrowRight size={16} />
              </Link>
            </div>
          )}

          {/* Loading */}
          {loading && (
            <div className="border border-slate-800 rounded-2xl p-12 text-center space-y-3">
              <Loader2 size={32} className="animate-spin text-red-400 mx-auto" />
              <p className="text-white font-semibold">Briefing all agents on {activeCase?.title}...</p>
              <p className="text-slate-400 text-sm">Generating your full trial preparation checklist.</p>
            </div>
          )}

          {/* Not yet activated */}
          {activeCase && !briefing && !loading && (
            <div className="border border-dashed border-red-500/30 rounded-2xl p-10 text-center space-y-4 bg-red-500/5">
              <Shield size={36} className="text-red-400 mx-auto" />
              <div>
                <p className="text-lg font-semibold text-white">Command Center Not Active</p>
                <p className="text-sm text-slate-400 mt-1">Click "Activate Command Center" to generate an AI-powered trial preparation briefing for this case — complete with a prioritized task list, risk assessment, and agent assignments.</p>
              </div>
              <button onClick={activate}
                className="inline-flex items-center gap-2 px-6 py-3 bg-red-500 hover:bg-red-400 text-white font-bold rounded-xl transition-colors">
                <Zap size={16} /> Activate Command Center
              </button>
            </div>
          )}

          {/* Briefing */}
          {briefing && !loading && (
            <div className="space-y-5">
              {/* Summary bar */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className={`col-span-1 rounded-xl border p-4 ${RISK_CONFIG[briefing.riskLevel]?.bg ?? 'bg-slate-800 border-slate-700'}`}>
                  <p className="text-xs text-slate-500 mb-1 uppercase tracking-wide">Risk Level</p>
                  <p className={`font-bold text-base ${RISK_CONFIG[briefing.riskLevel]?.color ?? 'text-white'}`}>
                    {RISK_CONFIG[briefing.riskLevel]?.label ?? briefing.riskLevel}
                  </p>
                </div>
                <div className="col-span-1 rounded-xl border border-slate-700 bg-slate-800 p-4">
                  <p className="text-xs text-slate-500 mb-1 uppercase tracking-wide">Trial Readiness</p>
                  <p className="font-bold text-base text-gold-400">{briefing.estimatedTrialReadiness}%</p>
                </div>
                <div className="col-span-1 rounded-xl border border-slate-700 bg-slate-800 p-4">
                  <p className="text-xs text-slate-500 mb-1 uppercase tracking-wide">Tasks Done</p>
                  <p className="font-bold text-base text-white">{done} / {total}</p>
                </div>
                <div className="col-span-1 rounded-xl border border-slate-700 bg-slate-800 p-4 flex flex-col justify-between">
                  <p className="text-xs text-slate-500 mb-2 uppercase tracking-wide">Progress</p>
                  <div>
                    <div className="h-2 bg-slate-700 rounded-full">
                      <div className="h-2 bg-green-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
                    </div>
                    <p className="text-xs text-slate-400 mt-1">{pct}% complete</p>
                  </div>
                </div>
              </div>

              {/* Top priority + key risks */}
              <div className="grid md:grid-cols-2 gap-4">
                <div className="rounded-xl border border-gold-500/30 bg-gold-500/5 p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Target size={15} className="text-gold-400" />
                    <span className="text-xs font-bold text-gold-400 uppercase tracking-wide">Top Priority</span>
                  </div>
                  <p className="text-sm text-slate-200">{briefing.topPriority}</p>
                </div>
                <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <AlertTriangle size={15} className="text-red-400" />
                    <span className="text-xs font-bold text-red-400 uppercase tracking-wide">Key Risks</span>
                  </div>
                  <ul className="space-y-1">
                    {briefing.keyRisks.map((r, i) => (
                      <li key={i} className="flex items-start gap-2 text-xs text-slate-300">
                        <span className="text-red-400 mt-0.5 shrink-0">•</span>{r}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              {/* Task checklist by category */}
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-xs font-bold text-slate-400 uppercase tracking-wide">
                  <BarChart3 size={13} />
                  Preparation Checklist
                </div>
                {tasksByCategory.map(({ cat, tasks }) => {
                  const catDone = tasks.filter(t => t.done).length;
                  const collapsed = collapsedCats.has(cat);
                  return (
                    <div key={cat} className="border border-slate-800 rounded-xl overflow-hidden">
                      <button
                        onClick={() => toggleCat(cat)}
                        className="w-full flex items-center gap-3 px-4 py-3 bg-slate-900/60 hover:bg-slate-800 transition-colors"
                      >
                        <span className={`text-xs px-2 py-0.5 rounded-full border font-semibold ${CATEGORY_COLORS[cat]}`}>
                          {CATEGORY_LABELS[cat]}
                        </span>
                        <span className="text-xs text-slate-500">{catDone}/{tasks.length} done</span>
                        <div className="flex-1 mx-2 h-1.5 bg-slate-700 rounded-full">
                          <div className="h-1.5 bg-green-500 rounded-full transition-all"
                            style={{ width: `${tasks.length > 0 ? (catDone / tasks.length) * 100 : 0}%` }} />
                        </div>
                        {collapsed ? <ChevronDown size={14} className="text-slate-500 shrink-0" /> : <ChevronUp size={14} className="text-slate-500 shrink-0" />}
                      </button>
                      {!collapsed && (
                        <div className="p-3 space-y-2">
                          {tasks
                            .sort((a, b) => {
                              const order: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
                              return (order[a.priority] ?? 4) - (order[b.priority] ?? 4);
                            })
                            .map(task => (
                              <TaskRow key={task.id} task={task} onToggle={toggleTask} />
                            ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Agent quick-links */}
              <div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-3 flex items-center gap-2">
                  <Users size={13} /> Agent Roster
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {OPERATIONAL_AGENTS.map(agent => (
                    <Link key={agent.id} to={agent.route}
                      className={`flex items-center gap-2 p-3 rounded-xl border transition-all hover:opacity-80 ${agent.bgClass} ${agent.borderClass}`}>
                      <span className="text-xl">{agent.emoji}</span>
                      <div className="min-w-0">
                        <p className={`text-xs font-bold ${agent.colorClass}`}>{agent.name}</p>
                        <p className="text-xs text-slate-500 truncate">{agent.title}</p>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* ─── Tab: Strategy ──────────────────────────────────────────── */}
      {activeTab === 'strategy' && <StrategyTab />}

      {/* ─── Tab: Research ──────────────────────────────────────────── */}
      {activeTab === 'research' && <ResearchTab />}
    </div>
  );
};

export default CommandCenter;
