import React, { useState, useEffect, useCallback, useContext } from 'react';
import { AppContext } from '../App';
import {
  Youtube, Search, Play, Loader2, CheckCircle2, XCircle, Clock,
  FileText, Quote, Users, Calendar, AlertTriangle, ChevronRight,
  Download, Copy, ExternalLink, Zap, Shield, Hash, Eye, ArrowUpRight
} from 'lucide-react';
import {
  extractVideoId, createAnalysis, getAnalysis, pollAnalysis,
  getAllAnalysisData, importAnalysisToCase, simulateAnalysis,
  type TubeScribeAnalysis, type TubeScribeFact, type TubeScribeQuote,
  type TubeScribeEntity, type TubeScribeTimelineEvent, type TubeScribeContradiction
} from '../services/tubescribeService';
import { toast } from 'react-toastify';

const STATUS_ICONS: Record<string, React.FC<{ size?: number; className?: string }>> = {
  queued: Clock,
  downloading: Loader2,
  transcribing: Loader2,
  analyzing: Loader2,
  completed: CheckCircle2,
  failed: XCircle,
};

const STATUS_LABELS: Record<string, string> = {
  queued: 'Queued',
  downloading: 'Downloading',
  transcribing: 'Transcribing',
  analyzing: 'Analyzing',
  completed: 'Completed',
  failed: 'Failed',
};

const STATUS_ORDER = ['queued', 'downloading', 'transcribing', 'analyzing', 'completed'];

const formatDate = (ts: string) => {
  try { return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }); } catch { return ts; }
};

const CONFIDENCE_COLORS: Record<string, string> = {
  high: 'bg-green-500/15 text-green-400 border-green-500/30',
  medium: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  low: 'bg-red-500/15 text-red-400 border-red-500/30',
};

const getConfidenceLevel = (confidence: number) => {
  if (confidence >= 80) return 'high';
  if (confidence >= 50) return 'medium';
  return 'low';
};

const CATEGORY_COLORS: Record<string, string> = {
  filing: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  hearing: 'bg-purple-500/15 text-purple-400 border-purple-500/30',
  incident: 'bg-red-500/15 text-red-400 border-red-500/30',
  claim: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  testimony: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30',
  evidence: 'bg-green-500/15 text-green-400 border-green-500/30',
  discovery: 'bg-indigo-500/15 text-indigo-400 border-indigo-500/30',
  deposition: 'bg-pink-500/15 text-pink-400 border-pink-500/30',
};

const ENTITY_COLORS: Record<string, string> = {
  person: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  organization: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  location: 'bg-green-500/15 text-green-400 border-green-500/30',
  statute: 'bg-purple-500/15 text-purple-400 border-purple-500/30',
  case_number: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30',
  constitutional_provision: 'bg-red-500/15 text-red-400 border-red-500/30',
};

const SEVERITY_COLORS: Record<string, string> = {
  high: 'bg-red-500/15 text-red-400 border-red-500/40',
  medium: 'bg-amber-500/15 text-amber-400 border-amber-500/40',
  low: 'bg-slate-500/15 text-slate-400 border-slate-500/40',
};

const TubeScribe: React.FC = () => {
  const { activeCase, updateCase, cases } = useContext(AppContext);
  const [url, setUrl] = useState('');
  const [videoId, setVideoId] = useState<string | null>(null);
  const [status, setStatus] = useState<'input' | 'processing' | 'results'>('input');
  const [currentAnalysis, setCurrentAnalysis] = useState<TubeScribeAnalysis | null>(null);
  const [currentStatus, setCurrentStatus] = useState<TubeScribeAnalysis['status']>('queued');
  const [activeTab, setActiveTab] = useState<'transcript' | 'summary' | 'facts' | 'quotes' | 'entities' | 'timeline' | 'contradictions'>('transcript');

  const [facts, setFacts] = useState<TubeScribeFact[]>([]);
  const [quotes, setQuotes] = useState<TubeScribeQuote[]>([]);
  const [entities, setEntities] = useState<TubeScribeEntity[]>([]);
  const [timeline, setTimeline] = useState<TubeScribeTimelineEvent[]>([]);
  const [contradictions, setContradictions] = useState<TubeScribeContradiction[]>([]);

  const [history, setHistory] = useState<TubeScribeAnalysis[]>(() => {
    try { return JSON.parse(localStorage.getItem('casebuddy_tubescribe_analyses') || '[]'); } catch { return []; }
  });
  const [importing, setImporting] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [historyView, setHistoryView] = useState<TubeScribeAnalysis | null>(null);

  useEffect(() => {
    const vid = extractVideoId(url);
    setVideoId(vid);
  }, [url]);

  const handleAnalyze = useCallback(async () => {
    if (!url.trim()) { toast.error('Please enter a YouTube URL'); return; }
    const vid = extractVideoId(url);
    if (!vid) { toast.error('Invalid YouTube URL. Paste a full URL like https://youtube.com/watch?v=...'); return; }

    setProcessing(true);
    setStatus('processing');
    setCurrentStatus('queued');

    try {
      const result = await createAnalysis(url);
      if (!result) { toast.error('Failed to create analysis. Try again.'); setStatus('input'); setProcessing(false); return; }

      const cleanup = pollAnalysis(result.id, (analysis) => {
        setCurrentStatus(analysis.status);
        if (analysis.status === 'completed' || analysis.status === 'failed') {
          setCurrentAnalysis(analysis);
          setStatus('results');
          setProcessing(false);
          if (analysis.status === 'completed') {
            loadAnalysisData(result.id);
            refreshHistory();
          }
        }
      }, 2000);

      return () => cleanup();
    } catch {
      toast.error('Analysis failed. Please try again.');
      setStatus('input');
      setProcessing(false);
    }
  }, [url]);

  const loadAnalysisData = async (analysisId: string) => {
    try {
      const data = await getAllAnalysisData(analysisId);
      setFacts(data.facts);
      setQuotes(data.quotes);
      setEntities(data.entities);
      setTimeline(data.timeline);
      setContradictions(data.contradictions);
      setCurrentAnalysis(data.analysis);
    } catch { /* handled silently */ }
  };

  const refreshHistory = () => {
    try {
      const h = JSON.parse(localStorage.getItem('casebuddy_tubescribe_analyses') || '[]');
      setHistory(h);
    } catch { setHistory([]); }
  };

  const handleViewHistory = async (analysis: TubeScribeAnalysis) => {
    setHistoryView(analysis);
    setCurrentAnalysis(analysis);
    setStatus('results');
    setCurrentStatus(analysis.status);
    await loadAnalysisData(analysis.id);
  };

  const handleImport = async () => {
    if (!currentAnalysis || !activeCase) {
      toast.error('No active case selected. Open a case first.');
      return;
    }

    setImporting(true);
    try {
      const result = await importAnalysisToCase(currentAnalysis.id, activeCase.id);
      const parts: string[] = [];
      if (result.importedFacts > 0) parts.push(`${result.importedFacts} facts → evidence`);
      if (result.importedQuotes > 0) parts.push(`${result.importedQuotes} quotes → statements`);
      if (result.importedTimeline > 0) parts.push(`${result.importedTimeline} events → timeline`);

      if (parts.length === 0) {
        toast.info('All items already imported.');
      } else {
        toast.success(`Imported to ${activeCase.title}: ${parts.join(', ')}`);

        const updatedCase = { ...activeCase, updatedAt: new Date().toISOString() };
        try {
          const caseList = cases.map(c => c.id === updatedCase.id ? updatedCase : c);
          localStorage.setItem('casebuddy_cases', JSON.stringify(caseList));
        } catch { /* ignore */ }
      }
    } catch (e: any) {
      toast.error(e?.message || 'Import failed');
    } finally {
      setImporting(false);
    }
  };

  const handleCopyTranscript = () => {
    if (!currentAnalysis?.polished_transcript) { toast.error('No transcript to copy'); return; }
    navigator.clipboard.writeText(currentAnalysis.polished_transcript).then(() => {
      setCopied(true);
      toast.success('Transcript copied to clipboard');
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => toast.error('Failed to copy'));
  };

  const handleNewAnalysis = () => {
    setStatus('input');
    setUrl('');
    setVideoId(null);
    setCurrentAnalysis(null);
    setCurrentStatus('queued');
    setFacts([]);
    setQuotes([]);
    setEntities([]);
    setTimeline([]);
    setContradictions([]);
    setHistoryView(null);
  };

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) setUrl(text);
    } catch { /* clipboard access denied */ }
  };

  const TAB_ITEMS = [
    { id: 'transcript', label: 'Transcript', icon: FileText },
    { id: 'summary', label: 'Summary', icon: Eye },
    { id: 'facts', label: 'Facts', icon: Hash, count: facts.length },
    { id: 'quotes', label: 'Quotes', icon: Quote, count: quotes.length },
    { id: 'entities', label: 'Entities', icon: Users, count: entities.length },
    { id: 'timeline', label: 'Timeline', icon: Calendar, count: timeline.length },
    { id: 'contradictions', label: 'Contradictions', icon: AlertTriangle, count: contradictions.length },
  ];

  const ProcessingTimeline = () => {
    const currentIdx = STATUS_ORDER.indexOf(currentStatus);
    return (
      <div className="flex items-center gap-1 sm:gap-2">
        {STATUS_ORDER.map((s, i) => {
          const Icon = STATUS_ICONS[s];
          const isDone = i < currentIdx || (s === currentStatus && s === 'completed');
          const isCurrent = s === currentStatus && s !== 'completed' && s !== 'failed';
          const isFailed = currentStatus === 'failed' && i === STATUS_ORDER.indexOf(currentStatus);

          return (
            <React.Fragment key={s}>
              <div className={`flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium transition-colors ${
                isDone ? 'bg-green-500/10 text-green-400 border border-green-500/20' :
                isCurrent ? 'bg-gold-500/10 text-gold-400 border border-gold-500/20' :
                isFailed ? 'bg-red-500/10 text-red-400 border border-red-500/20' :
                'bg-slate-800 text-slate-500 border border-slate-700'
              }`}>
                <Icon size={12} className={isCurrent && s !== 'completed' ? 'animate-spin' : ''} />
                <span className="hidden sm:inline">{STATUS_LABELS[s]}</span>
              </div>
              {i < STATUS_ORDER.length - 1 && (
                <ChevronRight size={12} className="text-slate-600 shrink-0" />
              )}
            </React.Fragment>
          );
        })}
      </div>
    );
  };

  if (status === 'processing') {
    return (
      <div className="min-h-[70vh] flex items-center justify-center">
        <div className="bg-slate-900 border border-slate-700/50 rounded-2xl p-8 sm:p-12 max-w-lg w-full text-center">
          <Loader2 size={40} className="text-gold-500 animate-spin mx-auto mb-6" />
          <h2 className="text-xl font-serif font-bold text-white mb-2">Analyzing Video</h2>
          <p className="text-slate-400 text-sm mb-8">
            TubeScribe is downloading, transcribing, and analyzing your video. This typically takes 10-30 seconds.
          </p>
          <ProcessingTimeline />
          {videoId && (
            <a
              href={`https://youtube.com/watch?v=${videoId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 mt-6 text-xs text-slate-500 hover:text-slate-300 transition-colors"
            >
              <ExternalLink size={12} />
              View source on YouTube
            </a>
          )}
        </div>
      </div>
    );
  }

  if (status === 'results' && currentAnalysis) {
    const isCompleted = currentAnalysis.status === 'completed';
    const StatusIcon = STATUS_ICONS[currentAnalysis.status] || Clock;

    return (
      <div className="space-y-6">
        <div className={`rounded-2xl border p-6 ${
          isCompleted ? 'bg-green-500/5 border-green-500/20' :
          currentAnalysis.status === 'failed' ? 'bg-red-500/5 border-red-500/20' :
          'bg-slate-900 border-slate-700/50'
        }`}>
          <div className="flex items-start justify-between flex-wrap gap-4">
            <div className="flex items-start gap-4">
              <div className={`p-3 rounded-xl ${
                isCompleted ? 'bg-green-500/10' : 'bg-slate-800'
              }`}>
                <StatusIcon size={24} className={isCompleted ? 'text-green-400' : 'text-slate-400'} />
              </div>
              <div>
                <h2 className="text-xl font-serif font-bold text-white">{currentAnalysis.title || 'Untitled Video'}</h2>
                <div className="flex items-center gap-3 mt-1 text-sm text-slate-400">
                  <span>{currentAnalysis.channel || 'Unknown Channel'}</span>
                  {currentAnalysis.transcript_source && (
                    <>
                      <span className="text-slate-600">·</span>
                      <span className="text-xs bg-slate-800 px-2 py-0.5 rounded-full border border-slate-700">
                        {currentAnalysis.transcript_source === 'deepgram_nova2' ? 'Deepgram Nova-2' : currentAnalysis.transcript_source}
                      </span>
                    </>
                  )}
                  <span className="text-slate-600">·</span>
                  <span>{formatDate(currentAnalysis.created_at)}</span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={handleImport}
                disabled={importing || !isCompleted || !activeCase}
                className="flex items-center gap-2 px-4 py-2 bg-gold-500 text-slate-950 rounded-xl text-sm font-bold hover:bg-gold-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {importing ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
                Import to {activeCase ? activeCase.title.slice(0, 20) + (activeCase.title.length > 20 ? '...' : '') : 'Case'}
              </button>
              <button
                onClick={handleCopyTranscript}
                className="flex items-center gap-2 px-4 py-2 bg-slate-800 border border-slate-700 rounded-xl text-sm text-slate-300 hover:text-white transition-colors"
              >
                {copied ? <CheckCircle2 size={15} className="text-green-400" /> : <Copy size={15} />}
                Copy Transcript
              </button>
              {videoId && (
                <a
                  href={`https://youtube.com/watch?v=${videoId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 px-4 py-2 bg-slate-800 border border-slate-700 rounded-xl text-sm text-slate-300 hover:text-white transition-colors"
                >
                  <ExternalLink size={15} />
                  YouTube
                </a>
              )}
              <button
                onClick={handleNewAnalysis}
                className="flex items-center gap-2 px-4 py-2 bg-slate-800 border border-slate-700 rounded-xl text-sm text-slate-400 hover:text-white transition-colors"
              >
                <Zap size={15} />
                New
              </button>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1 border-b border-slate-800 overflow-x-auto pb-0">
          {TAB_ITEMS.map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex items-center gap-1.5 px-3 py-2.5 text-xs font-medium border-b-2 whitespace-nowrap transition-colors ${
                  active ? 'border-gold-500 text-gold-400' : 'border-transparent text-slate-500 hover:text-slate-300'
                }`}
              >
                <Icon size={13} />
                {tab.label}
                {tab.count != null && tab.count > 0 && (
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                    active ? 'bg-gold-500/20 text-gold-400' : 'bg-slate-800 text-slate-500'
                  }`}>{tab.count}</span>
                )}
              </button>
            );
          })}
        </div>

        <div className="min-h-[400px]">
          {activeTab === 'transcript' && (
            <div className="bg-slate-900 border border-slate-700/50 rounded-2xl p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-bold text-slate-300 flex items-center gap-2">
                  <FileText size={15} className="text-gold-400" />
                  Polished Transcript
                </h3>
                <button
                  onClick={handleCopyTranscript}
                  className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-300 transition-colors"
                >
                  <Copy size={11} />
                  Copy
                </button>
              </div>
              {currentAnalysis.polished_transcript ? (
                <pre className="font-mono text-xs text-slate-400 bg-slate-800 p-4 rounded-xl max-h-96 overflow-y-auto whitespace-pre-wrap leading-relaxed">
                  {currentAnalysis.polished_transcript}
                </pre>
              ) : (
                <div className="text-center py-12 text-slate-600">
                  <FileText size={32} className="mx-auto mb-3 opacity-50" />
                  <p className="text-sm">Transcript not available</p>
                </div>
              )}
            </div>
          )}

          {activeTab === 'summary' && (
            <div className="bg-slate-900 border border-slate-700/50 rounded-2xl p-6">
              <h3 className="text-sm font-bold text-slate-300 flex items-center gap-2 mb-4">
                <Eye size={15} className="text-gold-400" />
                AI Summary
              </h3>
              {currentAnalysis.ai_summary ? (
                <div className="text-sm text-slate-300 leading-relaxed whitespace-pre-wrap">
                  {currentAnalysis.ai_summary}
                </div>
              ) : (
                <div className="text-center py-12 text-slate-600">
                  <Eye size={32} className="mx-auto mb-3 opacity-50" />
                  <p className="text-sm">Summary not available</p>
                </div>
              )}
            </div>
          )}

          {activeTab === 'facts' && (
            <div className="space-y-2">
              {facts.length === 0 ? (
                <div className="bg-slate-900 border border-slate-700/50 rounded-2xl p-6 text-center py-12 text-slate-600">
                  <Hash size={32} className="mx-auto mb-3 opacity-50" />
                  <p className="text-sm">No facts extracted</p>
                </div>
              ) : (
                facts.map((fact) => {
                  const level = getConfidenceLevel(fact.confidence);
                  return (
                    <div key={fact.id} className="bg-slate-900 border border-slate-700/50 rounded-xl p-4 hover:border-slate-600/50 transition-colors">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1">
                          <p className="text-sm text-slate-200 leading-relaxed">{fact.text}</p>
                          <div className="flex items-center gap-2 mt-2 flex-wrap">
                            {fact.category && (
                              <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${CATEGORY_COLORS[fact.category] || 'bg-slate-800 text-slate-400 border-slate-700'}`}>
                                {fact.category}
                              </span>
                            )}
                            {fact.speaker && (
                              <span className="text-[10px] text-slate-500 flex items-center gap-1">
                                <Users size={10} />
                                {fact.speaker}
                              </span>
                            )}
                            {fact.timestamp && (
                              <span className="text-[10px] text-slate-600 flex items-center gap-1">
                                <Clock size={10} />
                                {fact.timestamp}
                              </span>
                            )}
                          </div>
                        </div>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full border font-bold shrink-0 ${CONFIDENCE_COLORS[level]}`}>
                          {fact.confidence}%
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}

          {activeTab === 'quotes' && (
            <div className="space-y-3">
              {quotes.length === 0 ? (
                <div className="bg-slate-900 border border-slate-700/50 rounded-2xl p-6 text-center py-12 text-slate-600">
                  <Quote size={32} className="mx-auto mb-3 opacity-50" />
                  <p className="text-sm">No quotes extracted</p>
                </div>
              ) : (
                quotes.map((quote) => (
                  <blockquote key={quote.id} className="bg-slate-900 border-l-2 border-gold-500/50 rounded-r-xl p-4 hover:border-gold-500 transition-colors">
                    <p className="text-sm text-slate-200 italic leading-relaxed mb-2">
                      &ldquo;{quote.text}&rdquo;
                    </p>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs text-gold-400 font-medium">— {quote.speaker}</span>
                      {quote.timestamp && (
                        <span className="text-[10px] text-slate-600 flex items-center gap-1">
                          <Clock size={10} />
                          {quote.timestamp}
                        </span>
                      )}
                    </div>
                    {quote.context && (
                      <p className="text-[10px] text-slate-500 mt-1">{quote.context}</p>
                    )}
                  </blockquote>
                ))
              )}
            </div>
          )}

          {activeTab === 'entities' && (
            <div className="space-y-2">
              {entities.length === 0 ? (
                <div className="bg-slate-900 border border-slate-700/50 rounded-2xl p-6 text-center py-12 text-slate-600">
                  <Users size={32} className="mx-auto mb-3 opacity-50" />
                  <p className="text-sm">No entities extracted</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {entities.map((entity) => (
                    <div key={entity.id} className="bg-slate-900 border border-slate-700/50 rounded-xl p-3 flex items-center justify-between hover:border-slate-600/50 transition-colors">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full border font-medium shrink-0 ${ENTITY_COLORS[entity.entity_type] || 'bg-slate-800 text-slate-400 border-slate-700'}`}>
                          {entity.entity_type.replace(/_/g, ' ')}
                        </span>
                        <span className="text-sm text-slate-200 truncate">{entity.name}</span>
                      </div>
                      <span className="text-[10px] text-slate-500 shrink-0 ml-2">
                        {entity.mentions}x mentioned
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'timeline' && (
            <div className="space-y-0">
              {timeline.length === 0 ? (
                <div className="bg-slate-900 border border-slate-700/50 rounded-2xl p-6 text-center py-12 text-slate-600">
                  <Calendar size={32} className="mx-auto mb-3 opacity-50" />
                  <p className="text-sm">No timeline events</p>
                </div>
              ) : (
                <div className="relative pl-8 border-l border-slate-700/50 ml-3 space-y-4">
                  {[...timeline].sort((a, b) => a.date.localeCompare(b.date)).map((event) => (
                    <div key={event.id} className="relative">
                      <div className={`absolute -left-[26px] top-1.5 w-3 h-3 rounded-full border-2 ${
                        event.precision === 'exact' ? 'bg-green-500 border-green-400' :
                        event.precision === 'approximate' ? 'bg-amber-500 border-amber-400' :
                        'bg-slate-600 border-slate-500'
                      }`} />
                      <div className="bg-slate-900 border border-slate-700/50 rounded-xl p-4">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <span className="text-xs text-gold-400 font-mono font-bold">{event.date}</span>
                          {event.precision && (
                            <span className={`text-[10px] px-1.5 py-0.5 rounded-full border ${
                              event.precision === 'exact' ? 'bg-green-500/10 text-green-400 border-green-500/30' :
                              event.precision === 'approximate' ? 'bg-amber-500/10 text-amber-400 border-amber-500/30' :
                              'bg-slate-800 text-slate-400 border-slate-700'
                            }`}>
                              {event.precision}
                            </span>
                          )}
                          {event.category && (
                            <span className={`text-[10px] px-1.5 py-0.5 rounded-full border font-medium ${CATEGORY_COLORS[event.category] || 'bg-slate-800 text-slate-400 border-slate-700'}`}>
                              {event.category}
                            </span>
                          )}
                        </div>
                        <h4 className="text-sm font-bold text-white">{event.title}</h4>
                        {event.description && (
                          <p className="text-xs text-slate-400 mt-1 leading-relaxed">{event.description}</p>
                        )}
                        {event.source_context && (
                          <p className="text-[10px] text-slate-600 mt-1.5 italic">Source: {event.source_context}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'contradictions' && (
            <div className="space-y-3">
              {contradictions.length === 0 ? (
                <div className="bg-slate-900 border border-slate-700/50 rounded-2xl p-6 text-center py-12 text-slate-600">
                  <AlertTriangle size={32} className="mx-auto mb-3 opacity-50" />
                  <p className="text-sm">No contradictions detected</p>
                </div>
              ) : (
                contradictions.map((con) => (
                  <div key={con.id} className="bg-slate-900 border border-red-500/20 rounded-xl p-4 hover:border-red-500/40 transition-colors">
                    <div className="flex items-center justify-between mb-3">
                      <span className={`text-[10px] px-2 py-0.5 rounded-full border font-bold ${SEVERITY_COLORS[con.severity]}`}>
                        {con.severity.toUpperCase()} SEVERITY
                      </span>
                      {con.resolved && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-green-500/10 text-green-400 border border-green-500/30">
                          Resolved
                        </span>
                      )}
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="bg-slate-800 rounded-lg p-3">
                        <p className="text-xs text-slate-500 mb-1">Claim A</p>
                        <p className="text-sm text-slate-200">&ldquo;{con.claim_a}&rdquo;</p>
                        <p className="text-[10px] text-slate-600 mt-1">— {con.source_a}</p>
                      </div>
                      <div className="bg-slate-800 rounded-lg p-3">
                        <p className="text-xs text-slate-500 mb-1">Claim B</p>
                        <p className="text-sm text-slate-200">&ldquo;{con.claim_b}&rdquo;</p>
                        <p className="text-[10px] text-slate-600 mt-1">— {con.source_b}</p>
                      </div>
                    </div>
                    {con.explanation && (
                      <div className="mt-3 flex items-start gap-2">
                        <AlertTriangle size={12} className="text-amber-400 mt-0.5 shrink-0" />
                        <p className="text-xs text-slate-400">{con.explanation}</p>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        <div className="mt-8">
          <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
            <Clock size={14} />
            Previous Analyses
          </h3>
          {history.length === 0 ? (
            <div className="bg-slate-900 border border-slate-700/50 rounded-xl p-8 text-center">
              <Clock size={32} className="mx-auto mb-3 text-slate-600" />
              <p className="text-sm text-slate-600">No previous analyses</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {history.filter(a => a.id !== (currentAnalysis?.id || '')).slice(0, 9).map((item) => {
                const HistIcon = STATUS_ICONS[item.status] || Clock;
                return (
                  <button
                    key={item.id}
                    onClick={() => handleViewHistory(item)}
                    className="bg-slate-900 border border-slate-700/50 rounded-xl p-4 text-left hover:border-slate-600/50 transition-all group"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${
                        item.status === 'completed' ? 'bg-green-500/10 text-green-400 border-green-500/20' :
                        item.status === 'failed' ? 'bg-red-500/10 text-red-400 border-red-500/20' :
                        'bg-slate-800 text-slate-500 border-slate-700'
                      }`}>
                        {STATUS_LABELS[item.status]}
                      </span>
                      <HistIcon size={12} className={`${
                        item.status === 'completed' ? 'text-green-400' : 'text-slate-600'
                      }`} />
                    </div>
                    <h4 className="text-sm font-medium text-slate-200 truncate group-hover:text-white transition-colors">
                      {item.title || `Video ${item.video_id?.slice(0, 8) || 'Unknown'}`}
                    </h4>
                    <p className="text-[10px] text-slate-600 mt-1">{formatDate(item.created_at)}</p>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto py-8 sm:py-16 px-4">
      <div className="text-center mb-8">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gold-500/10 border border-gold-500/20 mb-4">
          <Youtube size={32} className="text-gold-500" />
        </div>
        <h1 className="text-2xl sm:text-3xl font-serif font-bold text-white mb-2">YouTube Evidence Analysis</h1>
        <p className="text-sm text-slate-400 max-w-lg mx-auto leading-relaxed">
          Powered by TubeScribe — paste a YouTube link to extract transcripts, facts, quotes, and timelines
        </p>
      </div>

      <div className="bg-slate-900 border border-slate-700/50 rounded-2xl p-6">
        <div className="relative mb-4">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search size={16} className="text-slate-500" />
          </div>
          <input
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAnalyze()}
            placeholder="https://youtube.com/watch?v=... or https://youtu.be/..."
            className="w-full bg-slate-800 border border-slate-700 rounded-xl py-2.5 pl-9 pr-20 text-sm text-white placeholder-slate-600 focus:border-gold-500/50 focus:outline-none transition-colors"
          />
          <button
            onClick={handlePaste}
            className="absolute right-1.5 top-1/2 -translate-y-1/2 px-3 py-1 text-[10px] font-bold text-slate-400 bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors"
          >
            Paste
          </button>
        </div>

        {videoId && (
          <div className="flex items-center gap-2 mb-4 p-3 bg-slate-800 rounded-xl border border-slate-700/50">
            <div className="w-10 h-7 bg-red-600 rounded overflow-hidden flex items-center justify-center shrink-0">
              <Play size={10} className="text-white" fill="white" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-slate-500">Video ID detected</p>
              <p className="text-sm text-slate-200 font-mono">{videoId}</p>
            </div>
            <ArrowUpRight size={14} className="text-slate-600" />
          </div>
        )}

        <button
          onClick={handleAnalyze}
          disabled={processing || !url.trim()}
          className="w-full flex items-center justify-center gap-2 py-3 bg-gold-500 text-slate-950 rounded-xl font-bold text-sm hover:bg-gold-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {processing ? (
            <>
              <Loader2 size={16} className="animate-spin" />
              Analyzing...
            </>
          ) : (
            <>
              <Zap size={16} />
              Analyze Video
            </>
          )}
        </button>

        <p className="text-[10px] text-slate-600 mt-3 text-center leading-relaxed">
          Audio is transcribed via Deepgram Nova-2 with speaker diarization. AI extracts facts, quotes, entities, and contradictions.
        </p>
      </div>

      {history.length > 0 && (
        <div className="mt-10">
          <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
            <Clock size={14} />
            Previous Analyses
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {history.filter(a => a.status === 'completed').slice(0, 6).map((item) => {
              const HistIcon = STATUS_ICONS[item.status] || Clock;
              return (
                <button
                  key={item.id}
                  onClick={() => handleViewHistory(item)}
                  className="bg-slate-900 border border-slate-700/50 rounded-xl p-4 text-left hover:border-slate-600/50 transition-all group"
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-green-500/10 text-green-400 border border-green-500/20 font-medium">
                      Completed
                    </span>
                    <HistIcon size={12} className="text-green-400" />
                  </div>
                  <h4 className="text-sm font-medium text-slate-200 truncate group-hover:text-white transition-colors">
                    {item.title || `Video ${item.video_id?.slice(0, 8) || 'Unknown'}`}
                  </h4>
                  <p className="text-[10px] text-slate-600 mt-1">{formatDate(item.created_at)}</p>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default TubeScribe;
