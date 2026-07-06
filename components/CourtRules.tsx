import React, { useState, useEffect, useCallback } from 'react';
import {
  BookOpen, Search, Calendar, Clock, Star, ExternalLink, ChevronRight,
  ChevronDown, ChevronUp, Plus, Trash2, Loader2, Zap, Filter, X,
  MapPin, Building2, Gavel, FileText, AlertTriangle, CheckCircle2
} from 'lucide-react';
import {
  getCourtRules, saveCourtRule, deleteCourtRule, searchCourtRules,
  getRulesByCategory, starRule, calculateDeadlines, getCommonDeadlines,
  getJurisdictions, getJurisdictionById, searchJurisdictions, seedCommonRules,
  type CourtRule, type CourtLevel, type RuleCategory, type DeadlineCalculation,
  type JurisdictionInfo
} from '../services/courtRulesService';
import { deepseekChat } from '../services/deepseek';

const ALL_CATEGORIES: { id: RuleCategory | 'all'; label: string; icon: string }[] = [
  { id: 'all', label: 'All Categories', icon: '📋' },
  { id: 'deadlines', label: 'Deadlines', icon: '⏰' },
  { id: 'filing', label: 'Filing', icon: '📄' },
  { id: 'service', label: 'Service', icon: '📬' },
  { id: 'discovery', label: 'Discovery', icon: '🔍' },
  { id: 'motions', label: 'Motions', icon: '⚡' },
  { id: 'evidence', label: 'Evidence', icon: '🔎' },
  { id: 'appeals', label: 'Appeals', icon: '📚' },
  { id: 'local-rules', label: 'Local Rules', icon: '🏛️' },
];

const CATEGORY_COLORS: Record<RuleCategory | 'all', string> = {
  'all': 'bg-slate-800 border-slate-600 text-slate-300',
  'deadlines': 'bg-red-500/15 border-red-500/30 text-red-400',
  'filing': 'bg-blue-500/15 border-blue-500/30 text-blue-400',
  'service': 'bg-purple-500/15 border-purple-500/30 text-purple-400',
  'discovery': 'bg-cyan-500/15 border-cyan-500/30 text-cyan-400',
  'motions': 'bg-amber-500/15 border-amber-500/30 text-amber-400',
  'evidence': 'bg-green-500/15 border-green-500/30 text-green-400',
  'appeals': 'bg-violet-500/15 border-violet-500/30 text-violet-400',
  'local-rules': 'bg-pink-500/15 border-pink-500/30 text-pink-400',
};

const LEVEL_LABELS: Record<CourtLevel, { label: string; color: string }> = {
  'federal-district': { label: 'Federal District', color: 'text-blue-400 bg-blue-500/10 border-blue-500/20' },
  'federal-appellate': { label: 'Federal Appellate', color: 'text-indigo-400 bg-indigo-500/10 border-indigo-500/20' },
  'state-trial': { label: 'State Trial', color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' },
  'state-appellate': { label: 'State Appellate', color: 'text-teal-400 bg-teal-500/10 border-teal-500/20' },
  'supreme-court': { label: 'Supreme Court', color: 'text-gold-400 bg-gold-500/10 border-gold-500/20' },
  'bankruptcy': { label: 'Bankruptcy', color: 'text-orange-400 bg-orange-500/10 border-orange-500/20' },
  'tax-court': { label: 'Tax Court', color: 'text-rose-400 bg-rose-500/10 border-rose-500/20' },
};

const EVENT_TYPES = [
  'Complaint Filed',
  'Answer Filed',
  'Notice of Removal',
  'Discovery Conference',
  'Trial Date Set',
  'Judgment Entered',
  'Notice of Appeal',
  'Motion Filed',
];

const TagPill: React.FC<{ label: string }> = ({ label }) => (
  <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-slate-800 border border-slate-700 text-slate-300">
    {label}
  </span>
);

const CategoryBadge: React.FC<{ category: RuleCategory }> = ({ category }) => {
  const info = ALL_CATEGORIES.find(c => c.id === category);
  const cls = CATEGORY_COLORS[category] || 'bg-slate-800 border-slate-600 text-slate-300';
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${cls}`}>
      {info?.icon} {info?.label || category}
    </span>
  );
};

const LevelBadge: React.FC<{ level: CourtLevel }> = ({ level }) => {
  const info = LEVEL_LABELS[level] || { label: level, color: 'text-slate-400 bg-slate-800 border-slate-600' };
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${info.color}`}>
      {info.label}
    </span>
  );
};

const RuleCard: React.FC<{
  rule: CourtRule;
  expanded: boolean;
  onToggle: () => void;
  onStar: () => void;
  onDelete: () => void;
}> = ({ rule, expanded, onToggle, onStar, onDelete }) => (
  <div className={`p-4 rounded-xl bg-slate-900 border transition-all duration-200 ${expanded ? 'border-gold-500/40' : 'border-slate-700/50 hover:border-gold-500/30'}`}>
    <div className="flex items-start gap-3">
      <button
        onClick={onStar}
        className={`mt-0.5 shrink-0 transition-colors ${rule.important ? 'text-gold-400 hover:text-gold-300' : 'text-slate-600 hover:text-gold-400'}`}
        title={rule.important ? 'Unstar rule' : 'Star rule'}
      >
        <Star size={16} fill={rule.important ? 'currentColor' : 'none'} />
      </button>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap mb-1">
          <span className="text-xs font-bold text-gold-400 font-mono">{rule.citation}</span>
          <CategoryBadge category={rule.category} />
          {rule.jurisdiction && rule.jurisdiction !== 'Federal' && (
            <span className="text-xs text-slate-500 flex items-center gap-1">
              <MapPin size={10} /> {rule.jurisdiction}
            </span>
          )}
        </div>
        <h3 className="text-sm font-semibold text-slate-200 mb-1">{rule.title}</h3>
        <p className="text-xs text-slate-400 italic mb-2 line-clamp-2">{rule.aiSummary}</p>
        <div className="flex items-center gap-2 flex-wrap mb-2">
          {rule.tags.slice(0, 5).map(t => (
            <TagPill key={t} label={t} />
          ))}
          {rule.tags.length > 5 && (
            <span className="text-xs text-slate-600">+{rule.tags.length - 5}</span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <button
          onClick={onToggle}
          className="p-1.5 rounded-lg bg-slate-800 border border-slate-700 hover:border-gold-500/30 text-slate-400 hover:text-gold-400 transition-colors"
        >
          {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>
        <button
          onClick={onDelete}
          className="p-1.5 rounded-lg bg-slate-800 border border-slate-700 hover:border-red-500/30 text-slate-500 hover:text-red-400 transition-colors"
          title="Delete rule"
        >
          <Trash2 size={14} />
        </button>
      </div>
    </div>
    {expanded && (
      <div className="mt-4 pt-4 border-t border-slate-700/50">
        <div className="mb-3">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Full Rule Text</span>
          <pre className="mt-1 p-3 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-300 whitespace-pre-wrap leading-relaxed max-h-64 overflow-y-auto">
            {rule.fullText}
          </pre>
        </div>
        <div>
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Description</span>
          <p className="mt-1 text-sm text-slate-400 leading-relaxed">{rule.description}</p>
        </div>
        <div className="mt-3 flex items-center gap-4 text-xs text-slate-500">
          <span className="flex items-center gap-1"><Building2 size={12} /> {rule.court}</span>
          <LevelBadge level={rule.level} />
        </div>
      </div>
    )}
  </div>
);

const CourtRules: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'library' | 'calculator'>('library');

  // ── Rules Library State ─────────────────────────────────────────────────
  const [rules, setRules] = useState<CourtRule[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<RuleCategory | 'all'>('all');
  const [selectedJurisdiction, setSelectedJurisdiction] = useState<string>('');
  const [expandedRuleId, setExpandedRuleId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showSidebar, setShowSidebar] = useState(false);

  // ── Deadline Calculator State ───────────────────────────────────────────
  const [calcJurisdiction, setCalcJurisdiction] = useState('');
  const [eventType, setEventType] = useState('Complaint Filed');
  const [triggerDate, setTriggerDate] = useState('');
  const [calculating, setCalculating] = useState(false);
  const [deadlineResults, setDeadlineResults] = useState<DeadlineCalculation[]>([]);
  const [commonDeadlines, setCommonDeadlines] = useState<DeadlineCalculation[]>([]);
  const [jurisdictionInfo, setJurisdictionInfo] = useState<JurisdictionInfo | null>(null);

  const jurisdictions = getJurisdictions();

  const loadRules = useCallback(() => {
    let results: CourtRule[];
    if (searchQuery.trim()) {
      results = searchCourtRules(searchQuery);
    } else {
      results = getCourtRules(selectedJurisdiction || undefined, categoryFilter === 'all' ? undefined : categoryFilter);
    }
    if (selectedJurisdiction && !searchQuery.trim()) {
      results = results.filter(r =>
        r.jurisdiction.toLowerCase() === selectedJurisdiction.toLowerCase()
      );
    }
    setRules(results);
  }, [searchQuery, categoryFilter, selectedJurisdiction]);

  useEffect(() => {
    loadRules();
  }, [loadRules]);

  const handleSearch = useCallback(() => {
    loadRules();
  }, [loadRules]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSearch();
  };

  const handleStar = useCallback((id: string) => {
    starRule(id);
    loadRules();
  }, [loadRules]);

  const handleDelete = useCallback((id: string) => {
    deleteCourtRule(id);
    loadRules();
  }, [loadRules]);

  const handleSeed = useCallback(() => {
    seedCommonRules();
    loadRules();
  }, [loadRules]);

  const handleAddRule = async () => {
    const newRule: CourtRule = {
      id: '',
      jurisdiction: 'Federal',
      court: 'Custom Rule',
      level: 'federal-district',
      category: 'motions',
      title: 'New Rule',
      description: '',
      citation: '',
      fullText: '',
      aiSummary: '',
      important: false,
      tags: [],
      createdAt: Date.now(),
    };
    saveCourtRule(newRule);
    loadRules();
  };

  // ── Deadline Calculator Handlers ────────────────────────────────────────
  const handleCalculate = async () => {
    if (!triggerDate || !calcJurisdiction || !eventType) return;
    setCalculating(true);
    setDeadlineResults([]);
    const results = await calculateDeadlines(triggerDate, calcJurisdiction, eventType);
    setDeadlineResults(results);
    const cd = getCommonDeadlines(calcJurisdiction);
    setCommonDeadlines(cd);
    const info = getJurisdictionById(calcJurisdiction);
    setJurisdictionInfo(info || null);
    setCalculating(false);
  };

  useEffect(() => {
    if (calcJurisdiction) {
      const cd = getCommonDeadlines(calcJurisdiction);
      setCommonDeadlines(cd);
      const info = getJurisdictionById(calcJurisdiction);
      setJurisdictionInfo(info || null);
    }
  }, [calcJurisdiction]);

  const getUrgencyClass = (days: number) => {
    if (days < 7) return 'text-red-400 bg-red-500/10';
    if (days < 30) return 'text-amber-400 bg-amber-500/10';
    return 'text-green-400 bg-green-500/10';
  };

  const formatDate = (iso: string) => {
    if (!iso) return '—';
    try {
      const d = new Date(iso);
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    } catch {
      return iso;
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-1">
          <BookOpen className="text-gold-400" size={24} />
          <h1 className="text-2xl font-bold text-slate-100">Court Rules Library</h1>
        </div>
        <p className="text-sm text-slate-400 ml-9">
          Jurisdiction-specific rules, plain-English summaries, and deadline references
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-slate-900 rounded-xl p-1 border border-slate-700/50 w-fit">
        <button
          onClick={() => setActiveTab('library')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            activeTab === 'library'
              ? 'bg-gold-500/20 text-gold-400 border border-gold-500/30'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <BookOpen size={16} className="inline mr-1.5" />
          Rules Library
        </button>
        <button
          onClick={() => setActiveTab('calculator')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            activeTab === 'calculator'
              ? 'bg-gold-500/20 text-gold-400 border border-gold-500/30'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Calendar size={16} className="inline mr-1.5" />
          Deadline Calculator
        </button>
      </div>

      {/* ── TAB 1: RULES LIBRARY ──────────────────────────────────────────── */}
      {activeTab === 'library' && (
        <div className="flex gap-6">
          {/* Main Content */}
          <div className="flex-1 min-w-0">
            {/* Search + Filter Bar */}
            <div className="flex items-center gap-3 mb-4 flex-wrap">
              <div className="relative flex-1 min-w-[240px]">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Search rules by title, citation, description, or full text..."
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-800 border border-slate-700 focus:border-gold-500/50 focus:outline-none focus:ring-1 focus:ring-gold-500/20 text-sm text-slate-200 placeholder-slate-500 transition-colors"
                />
              </div>

              <select
                value={categoryFilter}
                onChange={e => setCategoryFilter(e.target.value as RuleCategory | 'all')}
                className="px-3 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-sm text-slate-200 focus:border-gold-500/50 focus:outline-none cursor-pointer"
              >
                {ALL_CATEGORIES.map(c => (
                  <option key={c.id} value={c.id}>{c.icon} {c.label}</option>
                ))}
              </select>

              <button
                onClick={() => setShowSidebar(!showSidebar)}
                className={`px-3 py-2.5 rounded-xl border text-sm font-medium flex items-center gap-2 transition-colors ${
                  showSidebar
                    ? 'bg-gold-500/20 border-gold-500/30 text-gold-400'
                    : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200'
                }`}
              >
                <Filter size={14} />
                {selectedJurisdiction ? getJurisdictionById(selectedJurisdiction)?.name?.split(' ').slice(-1)[0] || 'Filter' : 'Jurisdiction'}
              </button>

              <button
                onClick={handleAddRule}
                className="px-3 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-slate-400 hover:text-gold-400 hover:border-gold-500/30 transition-colors flex items-center gap-2"
              >
                <Plus size={14} />
                Add Rule
              </button>
            </div>

            {/* Empty State / Seed Button */}
            {rules.length === 0 && !searchQuery && (
              <div className="text-center py-16 rounded-xl bg-slate-900 border border-slate-700/50">
                <BookOpen size={40} className="mx-auto text-slate-600 mb-4" />
                <h3 className="text-lg font-semibold text-slate-300 mb-2">No Court Rules Yet</h3>
                <p className="text-sm text-slate-500 mb-6 max-w-md mx-auto">
                  Load common federal and state court rules to get started with jurisdiction-specific deadlines and procedural requirements.
                </p>
                <button
                  onClick={handleSeed}
                  className="px-5 py-2.5 rounded-xl bg-gold-500/20 border border-gold-500/30 text-gold-400 hover:bg-gold-500/30 font-medium text-sm flex items-center gap-2 mx-auto transition-colors"
                >
                  <Zap size={16} />
                  Load Common Rules
                </button>
              </div>
            )}

            {/* Rules List */}
            {rules.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-slate-500">{rules.length} rule{rules.length !== 1 ? 's' : ''} found</span>
                  {rules.length === 0 && searchQuery && (
                    <span className="text-xs text-slate-600">No rules match your search</span>
                  )}
                </div>
                {rules.map(rule => (
                  <RuleCard
                    key={rule.id}
                    rule={rule}
                    expanded={expandedRuleId === rule.id}
                    onToggle={() => setExpandedRuleId(expandedRuleId === rule.id ? null : rule.id)}
                    onStar={() => handleStar(rule.id)}
                    onDelete={() => handleDelete(rule.id)}
                  />
                ))}
              </div>
            )}

            {rules.length === 0 && searchQuery && (
              <div className="text-center py-12 rounded-xl bg-slate-900 border border-slate-700/50">
                <Search size={32} className="mx-auto text-slate-600 mb-3" />
                <p className="text-sm text-slate-500">No rules match "{searchQuery}"</p>
              </div>
            )}
          </div>

          {/* Jurisdiction Sidebar */}
          <div className={`${showSidebar ? 'w-72' : 'w-0 overflow-hidden'} shrink-0 transition-all duration-200`}>
            {showSidebar && (
              <div className="rounded-xl bg-slate-900 border border-slate-700/50 p-4 sticky top-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-slate-300 flex items-center gap-2">
                    <MapPin size={14} className="text-gold-400" />
                    Jurisdictions
                  </h3>
                  {selectedJurisdiction && (
                    <button
                      onClick={() => setSelectedJurisdiction('')}
                      className="text-xs text-slate-500 hover:text-gold-400 transition-colors flex items-center gap-1"
                    >
                      <X size={12} /> Clear
                    </button>
                  )}
                </div>
                <div className="space-y-1 max-h-[60vh] overflow-y-auto">
                  {jurisdictions.map(j => (
                    <button
                      key={j.id}
                      onClick={() => setSelectedJurisdiction(j.id === selectedJurisdiction ? '' : j.id)}
                      className={`w-full text-left px-3 py-2 rounded-lg text-xs transition-colors ${
                        j.id === selectedJurisdiction
                          ? 'bg-gold-500/15 border border-gold-500/30 text-gold-300'
                          : 'bg-slate-800 border border-slate-700/50 text-slate-400 hover:text-slate-200 hover:border-slate-600'
                      }`}
                    >
                      <div className="font-medium">{j.name}</div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-slate-500">{j.state}</span>
                        <LevelBadge level={j.level} />
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── TAB 2: DEADLINE CALCULATOR ────────────────────────────────────── */}
      {activeTab === 'calculator' && (
        <div className="flex gap-6 flex-wrap lg:flex-nowrap">
          {/* Left: Calculator Form */}
          <div className="flex-1 min-w-0">
            <div className="rounded-xl bg-slate-900 border border-slate-700/50 p-5 mb-6">
              <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2 mb-4">
                <Clock size={16} className="text-gold-400" />
                Calculate Deadlines
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1.5">Jurisdiction</label>
                  <select
                    value={calcJurisdiction}
                    onChange={e => setCalcJurisdiction(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-sm text-slate-200 focus:border-gold-500/50 focus:outline-none cursor-pointer"
                  >
                    <option value="">Select jurisdiction...</option>
                    {jurisdictions.map(j => (
                      <option key={j.id} value={j.id}>{j.name} ({j.state})</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1.5">Event Type</label>
                  <select
                    value={eventType}
                    onChange={e => setEventType(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-sm text-slate-200 focus:border-gold-500/50 focus:outline-none cursor-pointer"
                  >
                    {EVENT_TYPES.map(et => (
                      <option key={et} value={et}>{et}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1.5">Trigger Date</label>
                  <input
                    type="date"
                    value={triggerDate}
                    onChange={e => setTriggerDate(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-sm text-slate-200 focus:border-gold-500/50 focus:outline-none focus:ring-1 focus:ring-gold-500/20 transition-colors"
                  />
                </div>
              </div>

              <button
                onClick={handleCalculate}
                disabled={calculating || !triggerDate || !calcJurisdiction || !eventType}
                className="px-5 py-2.5 rounded-xl bg-gold-500/20 border border-gold-500/30 text-gold-400 hover:bg-gold-500/30 disabled:opacity-40 disabled:cursor-not-allowed font-medium text-sm flex items-center gap-2 transition-colors"
              >
                {calculating ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    Calculating...
                  </>
                ) : (
                  <>
                    <Zap size={16} />
                    Calculate Deadlines
                  </>
                )}
              </button>
            </div>

            {/* Results Table */}
            {deadlineResults.length > 0 && (
              <div className="rounded-xl bg-slate-900 border border-slate-700/50 overflow-hidden mb-6">
                <div className="px-5 py-3 border-b border-slate-700/50 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
                    <FileText size={16} className="text-gold-400" />
                    Deadline Results
                  </h3>
                  <span className="text-xs text-slate-500">{deadlineResults.length} deadlines</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-700/50 bg-slate-950/50">
                        <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-400">Event</th>
                        <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-400">Trigger Date</th>
                        <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-400">Deadline</th>
                        <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-400">Days</th>
                        <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-400">Type</th>
                        <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-400">Citation</th>
                        <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-400">Notes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {deadlineResults.map((dl, i) => (
                        <tr key={i} className="border-b border-slate-800 hover:bg-slate-800/30 transition-colors">
                          <td className="px-4 py-3 text-slate-200">{dl.event}</td>
                          <td className="px-4 py-3 text-slate-400 font-mono text-xs">{formatDate(dl.triggerDate)}</td>
                          <td className="px-4 py-3 text-slate-100 font-semibold font-mono text-xs">{formatDate(dl.deadline)}</td>
                          <td className="px-4 py-3">
                            <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${getUrgencyClass(dl.days)}`}>
                              {dl.days}d
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                              dl.calendarDays
                                ? 'bg-slate-800 border border-slate-600 text-slate-400'
                                : 'bg-blue-500/10 border border-blue-500/20 text-blue-400'
                            }`}>
                              {dl.calendarDays ? 'Calendar' : 'Business'}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-gold-400 font-mono text-xs">{dl.rule}</td>
                          <td className="px-4 py-3 text-slate-500 text-xs max-w-[200px] truncate" title={dl.notes}>{dl.notes}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Common Deadlines */}
            {commonDeadlines.length > 0 && calcJurisdiction && !calculating && (
              <div className="rounded-xl bg-slate-900 border border-slate-700/50 p-5">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
                    <CheckCircle2 size={16} className="text-gold-400" />
                    Common Deadlines — {getJurisdictionById(calcJurisdiction)?.name || calcJurisdiction}
                  </h3>
                  <span className="text-xs text-slate-500">Pre-loaded</span>
                </div>
                <div className="space-y-2">
                  {commonDeadlines.map((cd, i) => (
                    <div key={i} className="flex items-center justify-between px-3 py-2 rounded-lg bg-slate-800/50 border border-slate-700/30">
                      <div className="flex items-center gap-3">
                        <span className="text-sm text-slate-300">{cd.event}</span>
                        <span className="text-xs text-gold-400 font-mono">{cd.citation}</span>
                      </div>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${getUrgencyClass(cd.days)}`}>
                        {cd.days}d {cd.calendarDays ? '(calendar)' : '(business)'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right: Jurisdiction Info */}
          <div className="w-72 shrink-0">
            {jurisdictionInfo && (
              <div className="rounded-xl bg-slate-900 border border-slate-700/50 p-5 sticky top-4">
                <div className="flex items-center gap-2 mb-4">
                  <Gavel size={16} className="text-gold-400" />
                  <h3 className="text-sm font-semibold text-slate-200">Jurisdiction Info</h3>
                </div>

                <div className="space-y-3">
                  <div>
                    <span className="text-xs text-slate-500">Court</span>
                    <p className="text-sm text-slate-200 font-medium">{jurisdictionInfo.name}</p>
                  </div>

                  <div>
                    <span className="text-xs text-slate-500">Level</span>
                    <div className="mt-1">
                      <LevelBadge level={jurisdictionInfo.level} />
                    </div>
                  </div>

                  <div>
                    <span className="text-xs text-slate-500">State</span>
                    <p className="text-sm text-slate-200">{jurisdictionInfo.state}</p>
                  </div>

                  {jurisdictionInfo.localRulesUrl && (
                    <div>
                      <a
                        href={jurisdictionInfo.localRulesUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-gold-400 hover:text-gold-300 flex items-center gap-1 transition-colors"
                      >
                        <ExternalLink size={12} /> Local Rules
                      </a>
                    </div>
                  )}

                  {jurisdictionInfo.cmEcfUrl && (
                    <div>
                      <a
                        href={jurisdictionInfo.cmEcfUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-gold-400 hover:text-gold-300 flex items-center gap-1 transition-colors"
                      >
                        <ExternalLink size={12} /> CM/ECF Portal
                      </a>
                    </div>
                  )}

                  {jurisdictionInfo.judges.length > 0 && (
                    <div>
                      <span className="text-xs text-slate-500">Known Judges</span>
                      <ul className="mt-1 space-y-1">
                        {jurisdictionInfo.judges.map((judge, i) => (
                          <li key={i} className="text-xs text-slate-400 pl-2 border-l border-slate-700">
                            {judge}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {jurisdictionInfo.commonDeadlines.length > 0 && (
                    <div>
                      <span className="text-xs text-slate-500">Key Deadlines</span>
                      <div className="mt-1 text-xs text-slate-400">
                        {jurisdictionInfo.commonDeadlines.map((d, i) => (
                          <div key={i} className="flex items-center justify-between py-0.5">
                            <span className="truncate mr-2">{d.event}</span>
                            <span className="font-mono text-gold-400 shrink-0">{d.days}d</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {!jurisdictionInfo && (
              <div className="rounded-xl bg-slate-900 border border-slate-700/50 p-5 text-center">
                <Building2 size={28} className="mx-auto text-slate-600 mb-3" />
                <p className="text-xs text-slate-500">
                  Select a jurisdiction above to view court information, local rules links, and known judges.
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default CourtRules;
