import React, { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckSquare,
  Clock3,
  FileSearch,
  Loader2,
  Network,
  RefreshCw,
  SearchCheck,
  Square,
} from 'lucide-react';
import { AppContext } from '../App';
import { getCaseDocuments, type DocumentRecord } from '../services/documentPipeline';
import {
  runDiscoveryIntelligence,
  type DiscoveryAnalysisType,
  type DiscoveryIntelligenceResult,
  type DiscoverySourceRef,
} from '../services/discoveryIntelligence';

const ANALYSIS_MODES: Array<{ id: DiscoveryAnalysisType; label: string; description: string }> = [
  { id: 'comprehensive', label: 'Comprehensive', description: 'Contradictions, chronology, recurring patterns, and a cross-record synthesis.' },
  { id: 'contradictions', label: 'Contradictions', description: 'Compare statements and findings across selected records.' },
  { id: 'timeline', label: 'Chronology', description: 'Build a cross-document event chronology with source references.' },
  { id: 'patterns', label: 'Patterns', description: 'Find repeated themes, conduct, entities, and evidentiary relationships.' },
];

function SourcePill({ source }: { source: DiscoverySourceRef }) {
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full border border-gold-500/20 bg-gold-500/10 text-[10px] text-gold-300">
      {source.citationLabel}
    </span>
  );
}

const DiscoveryIntelligence: React.FC = () => {
  const { activeCase } = useContext(AppContext);
  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [analysisType, setAnalysisType] = useState<DiscoveryAnalysisType>('comprehensive');
  const [loadingDocuments, setLoadingDocuments] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState<DiscoveryIntelligenceResult | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!activeCase?.id) {
      setDocuments([]);
      setSelected(new Set());
      return;
    }

    setLoadingDocuments(true);
    setError('');
    try {
      const docs = await getCaseDocuments(activeCase.id);
      setDocuments(docs);

      // Start with analyzed documents because cross-document synthesis is much
      // more useful when the pipeline has already extracted substantive text.
      const preferred = docs
        .filter(document => document.ai_analyzed || document.summary || document.extracted_text || document.ocr_text)
        .slice(0, 20)
        .map(document => document.id);
      const fallback = docs.slice(0, 20).map(document => document.id);
      setSelected(new Set(preferred.length >= 2 ? preferred : fallback));
    } catch {
      setError('Could not load this matter’s documents.');
    } finally {
      setLoadingDocuments(false);
    }
  }, [activeCase?.id]);

  useEffect(() => {
    setResult(null);
    void load();
  }, [load]);

  const selectedDocuments = useMemo(
    () => documents.filter(document => selected.has(document.id)),
    [documents, selected],
  );

  const toggle = (id: string) => {
    setSelected(previous => {
      const next = new Set(previous);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const selectAnalyzed = () => {
    const ids = documents
      .filter(document => document.ai_analyzed || document.summary || document.extracted_text || document.ocr_text)
      .slice(0, 20)
      .map(document => document.id);
    setSelected(new Set(ids));
  };

  const run = async () => {
    if (!activeCase?.id || selected.size < 2 || analyzing) return;
    setAnalyzing(true);
    setError('');
    setResult(null);
    try {
      const analysis = await runDiscoveryIntelligence(activeCase.id, Array.from(selected), analysisType);
      setResult(analysis);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Cross-document analysis failed.');
    } finally {
      setAnalyzing(false);
    }
  };

  if (!activeCase) {
    return (
      <div className="max-w-3xl mx-auto py-24 text-center">
        <FileSearch size={42} className="mx-auto text-slate-600" />
        <h2 className="text-xl font-semibold text-white mt-4">Select a matter first</h2>
        <p className="text-sm text-slate-500 mt-2">Evidence intelligence always runs inside a specific matter so sources and tenant boundaries stay attached.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-1 sm:p-2">
      <div className="flex flex-col xl:flex-row xl:items-start xl:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <SearchCheck size={23} className="text-gold-400" />
            <h2 className="text-xl font-bold text-white">Evidence Intelligence</h2>
          </div>
          <p className="text-sm text-slate-400 mt-1 max-w-3xl">
            Compare the record across documents while preserving the source identity behind each contradiction, event, and pattern. Unresolved model references stay visible instead of being silently guessed.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loadingDocuments}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-700 text-sm text-slate-300 hover:bg-slate-800 disabled:opacity-50"
        >
          <RefreshCw size={14} className={loadingDocuments ? 'animate-spin' : ''} /> Refresh documents
        </button>
      </div>

      <div className="grid xl:grid-cols-[minmax(0,1.05fr)_minmax(0,1.45fr)] gap-5">
        <section className="rounded-xl border border-slate-800 bg-slate-900/50 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-white">Record set</div>
              <div className="text-xs text-slate-500 mt-0.5">{selected.size} selected · max 20 recommended per run</div>
            </div>
            <button
              type="button"
              onClick={selectAnalyzed}
              className="text-xs text-gold-400 hover:text-gold-300"
            >
              Select analyzed
            </button>
          </div>

          <div className="max-h-[520px] overflow-y-auto divide-y divide-slate-800/70">
            {loadingDocuments && (
              <div className="py-16 flex items-center justify-center gap-2 text-sm text-slate-500">
                <Loader2 size={16} className="animate-spin" /> Loading matter documents…
              </div>
            )}

            {!loadingDocuments && documents.length === 0 && (
              <div className="py-16 px-6 text-center text-sm text-slate-500">
                No canonical documents are attached to this matter yet. Upload records through the Evidence Vault or bulk upload pipeline first.
              </div>
            )}

            {!loadingDocuments && documents.map(document => {
              const isSelected = selected.has(document.id);
              const ready = Boolean(document.ai_analyzed || document.summary || document.extracted_text || document.ocr_text);
              return (
                <button
                  type="button"
                  key={document.id}
                  onClick={() => toggle(document.id)}
                  className={`w-full text-left px-4 py-3 flex items-start gap-3 transition-colors ${isSelected ? 'bg-gold-500/5' : 'hover:bg-slate-800/50'}`}
                >
                  {isSelected
                    ? <CheckSquare size={17} className="text-gold-400 mt-0.5 shrink-0" />
                    : <Square size={17} className="text-slate-600 mt-0.5 shrink-0" />}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm text-white truncate">{document.name}</span>
                      {document.bates_formatted && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-gold-300 border border-slate-700">
                          {document.bates_formatted}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-1 text-[11px] text-slate-500">
                      <span>{document.document_type || document.file_type || 'document'}</span>
                      <span>·</span>
                      <span className={ready ? 'text-emerald-400' : 'text-amber-400'}>{ready ? 'analyzed' : document.status || 'pending'}</span>
                    </div>
                    {document.summary && <p className="text-xs text-slate-500 mt-1 line-clamp-2">{document.summary}</p>}
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        <section className="space-y-4">
          <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
            <div className="text-sm font-semibold text-white mb-3">Analysis mode</div>
            <div className="grid sm:grid-cols-2 gap-2">
              {ANALYSIS_MODES.map(mode => (
                <button
                  type="button"
                  key={mode.id}
                  onClick={() => setAnalysisType(mode.id)}
                  className={`text-left p-3 rounded-lg border transition-colors ${
                    analysisType === mode.id
                      ? 'border-gold-500/40 bg-gold-500/10'
                      : 'border-slate-800 bg-slate-950/30 hover:border-slate-700'
                  }`}
                >
                  <div className={`text-sm font-medium ${analysisType === mode.id ? 'text-gold-300' : 'text-white'}`}>{mode.label}</div>
                  <p className="text-[11px] text-slate-500 mt-1">{mode.description}</p>
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => void run()}
              disabled={analyzing || selected.size < 2}
              className="mt-4 w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-gold-500 text-slate-950 font-semibold text-sm hover:bg-gold-400 disabled:bg-slate-800 disabled:text-slate-600"
            >
              {analyzing ? <Loader2 size={15} className="animate-spin" /> : <Network size={15} />}
              {analyzing ? 'Analyzing selected record…' : `Analyze ${selected.size} documents`}
            </button>
            <p className="text-[10px] text-slate-600 text-center mt-2">Cross-document analysis is internal work product. Verify important conclusions against the cited source record.</p>
          </div>

          {error && (
            <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4 flex gap-3 text-sm text-red-200">
              <AlertTriangle size={17} className="shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {!result && !error && (
            <div className="rounded-xl border border-dashed border-slate-800 p-10 text-center">
              <Network size={30} className="mx-auto text-slate-700" />
              <p className="text-sm text-slate-500 mt-3">Select at least two records and run an analysis to build a sourced cross-document view.</p>
            </div>
          )}

          {result && (
            <div className="space-y-4">
              {result.summary && (
                <div className="rounded-xl border border-gold-500/20 bg-gold-500/5 p-4">
                  <div className="text-xs uppercase tracking-wider font-bold text-gold-400">Cross-record synthesis</div>
                  <p className="text-sm text-slate-200 whitespace-pre-wrap mt-2">{result.summary}</p>
                </div>
              )}

              {result.contradictions.length > 0 && (
                <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
                  <div className="flex items-center gap-2 text-white font-semibold text-sm mb-3">
                    <AlertTriangle size={16} className="text-amber-400" /> Contradictions
                  </div>
                  <div className="space-y-3">
                    {result.contradictions.map((item, index) => (
                      <div key={`${item.finding}-${index}`} className="rounded-lg bg-slate-950/50 border border-slate-800 p-3">
                        <div className="flex items-start justify-between gap-3">
                          <p className="text-sm text-slate-200">{item.finding}</p>
                          <span className="text-[10px] uppercase text-amber-400">{item.severity}</span>
                        </div>
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          {item.sources.map(source => <SourcePill key={source.documentId} source={source} />)}
                        </div>
                        {item.unresolvedSourceReferences.length > 0 && (
                          <p className="text-[10px] text-red-300 mt-2">Unresolved source reference: {item.unresolvedSourceReferences.join(', ')}</p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {result.timeline.length > 0 && (
                <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
                  <div className="flex items-center gap-2 text-white font-semibold text-sm mb-3">
                    <Clock3 size={16} className="text-blue-400" /> Cross-document chronology
                  </div>
                  <div className="space-y-3">
                    {result.timeline.map((item, index) => (
                      <div key={`${item.date}-${index}`} className="grid sm:grid-cols-[110px_minmax(0,1fr)] gap-2 sm:gap-4 border-l border-slate-700 pl-3">
                        <div className="text-xs font-medium text-blue-300">{item.date}</div>
                        <div>
                          <p className="text-sm text-slate-200">{item.event}</p>
                          <div className="mt-1.5">
                            {item.source && <SourcePill source={item.source} />}
                            {!item.source && item.unresolvedSourceReference && (
                              <span className="text-[10px] text-red-300">Unresolved source: {item.unresolvedSourceReference}</span>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {result.patterns.length > 0 && (
                <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
                  <div className="flex items-center gap-2 text-white font-semibold text-sm mb-3">
                    <Network size={16} className="text-violet-400" /> Patterns
                  </div>
                  <div className="space-y-3">
                    {result.patterns.map((item, index) => (
                      <div key={`${item.pattern}-${index}`} className="rounded-lg bg-slate-950/50 border border-slate-800 p-3">
                        <div className="text-sm font-medium text-white">{item.pattern}</div>
                        <p className="text-xs text-slate-400 mt-1">{item.significance}</p>
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          {item.sources.map(source => <SourcePill key={source.documentId} source={source} />)}
                        </div>
                        {item.unresolvedSourceReferences.length > 0 && (
                          <p className="text-[10px] text-red-300 mt-2">Unresolved source reference: {item.unresolvedSourceReferences.join(', ')}</p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-3">
                <div className="text-[10px] uppercase tracking-wider text-slate-600 font-bold">Record set used</div>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {result.sources.map(source => <SourcePill key={source.documentId} source={source} />)}
                </div>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
};

export default DiscoveryIntelligence;
