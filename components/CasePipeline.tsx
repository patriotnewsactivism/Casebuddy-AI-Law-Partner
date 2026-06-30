
import React, { useState, useEffect, useContext, useRef, useCallback, useMemo } from 'react';
import { AppContext } from '../App';
import {
  Upload, FileText, Play, Square, RefreshCw, CheckCircle2, XCircle,
  Clock, AlertTriangle, ChevronDown, ChevronUp, Copy,
  Loader2, BrainCircuit, Zap, FileSearch, Gavel, Users, Calendar,
  Shield, AlertOctagon, Search, Target, HelpCircle, BarChart3,
  ArrowRight, Trash2
} from 'lucide-react';
import { runPipeline, loadPipelineState, savePipelineState, deletePipelineState, PIPELINE_STAGES } from '../services/casePipeline';
import type {
  PipelineState, PipelineStage, PipelineStageStatus, PipelineBriefing,
  PipelineInventoryItem, PipelineEntity, PipelineChronologyEntry,
  PipelineContradiction, PipelineConstitutionalIssue, PipelineMotion,
  PipelineDiscoveryItem, PipelineGap, PipelineImpeachment,
  PipelineWitnessQuestions, PipelineStageId
} from '../types';

const SUPPORTED_FORMATS = ['PDF', 'DOCX', 'JPG', 'PNG', 'MP3', 'MP4', 'WAV', 'TXT', 'EML'];
const MAX_FILES = 50;

const FILE_TYPE_ICONS: Record<string, React.ReactNode> = {
  'application/pdf': <FileText size={16} className="text-red-400" />,
  'application/msword': <FileText size={16} className="text-blue-400" />,
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': <FileText size={16} className="text-blue-400" />,
  'image/jpeg': <FileSearch size={16} className="text-green-400" />,
  'image/png': <FileSearch size={16} className="text-green-400" />,
  'image/gif': <FileSearch size={16} className="text-green-400" />,
  'image/webp': <FileSearch size={16} className="text-green-400" />,
  'audio/mpeg': <FileSearch size={16} className="text-purple-400" />,
  'audio/wav': <FileSearch size={16} className="text-purple-400" />,
  'audio/mp4': <FileSearch size={16} className="text-purple-400" />,
  'video/mp4': <FileSearch size={16} className="text-amber-400" />,
  'video/quicktime': <FileSearch size={16} className="text-amber-400" />,
  'text/plain': <FileText size={16} className="text-slate-400" />,
  'message/rfc822': <FileText size={16} className="text-cyan-400" />,
};

const getFileIcon = (file: File): React.ReactNode => {
  if (FILE_TYPE_ICONS[file.type]) return FILE_TYPE_ICONS[file.type];
  const ext = file.name.split('.').pop()?.toLowerCase();
  if (ext === 'eml') return <FileText size={16} className="text-cyan-400" />;
  if (ext === 'pdf') return <FileText size={16} className="text-red-400" />;
  if (ext === 'docx' || ext === 'doc') return <FileText size={16} className="text-blue-400" />;
  if (ext === 'txt') return <FileText size={16} className="text-slate-400" />;
  if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext || '')) return <FileSearch size={16} className="text-green-400" />;
  if (['mp3', 'wav', 'ogg', 'm4a'].includes(ext || '')) return <FileSearch size={16} className="text-purple-400" />;
  if (['mp4', 'mov', 'avi', 'wmv'].includes(ext || '')) return <FileSearch size={16} className="text-amber-400" />;
  return <FileText size={16} className="text-slate-400" />;
};

const formatBytes = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
};

const getStageIcon = (stageId: PipelineStageId): string => {
  const found = PIPELINE_STAGES.find(s => s.id === stageId);
  return found?.icon || '📄';
};

// ── Utility Sub-Components ──────────────────────────────────────────────────────

const StageIndicator: React.FC<{ status: PipelineStageStatus }> = ({ status }) => {
  switch (status) {
    case 'running':
      return <Loader2 size={16} className="text-gold-500 animate-spin" />;
    case 'completed':
      return <CheckCircle2 size={16} className="text-green-400" />;
    case 'error':
      return <XCircle size={16} className="text-red-400" />;
    case 'skipped':
      return <span className="text-slate-600 text-xs font-mono">—</span>;
    default:
      return <div className="w-4 h-4 rounded-full border border-slate-600" />;
  }
};

const ProgressBar: React.FC<{ progress: number }> = ({ progress }) => (
  <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
    <div
      className="h-full rounded-full transition-all duration-700 ease-out"
      style={{
        width: `${Math.min(100, Math.max(0, progress))}%`,
        background: 'linear-gradient(90deg, #b8860b, #d4af37, #f0c75e)',
        backgroundSize: '200% 100%',
        animation: 'shimmer 2s linear infinite',
      }}
    />
    <style>{`@keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }`}</style>
  </div>
);

const PriorityBadge: React.FC<{ priority: 'critical' | 'high' | 'medium' | 'low' }> = ({ priority }) => {
  const colors: Record<string, string> = {
    critical: 'text-red-300 bg-red-500/15 border-red-500/40',
    high: 'text-amber-300 bg-amber-500/15 border-amber-500/40',
    medium: 'text-blue-300 bg-blue-500/15 border-blue-500/40',
    low: 'text-slate-400 bg-slate-700/50 border-slate-600/40',
  };
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full border font-semibold uppercase tracking-wider ${colors[priority]}`}>
      {priority}
    </span>
  );
};

const SeverityBadge: React.FC<{ severity: 'critical' | 'high' | 'medium' | 'low' }> = ({ severity }) => {
  const colors: Record<string, string> = {
    critical: 'text-red-300 bg-red-500/15 border-red-500/40',
    high: 'text-amber-300 bg-amber-500/15 border-amber-500/40',
    medium: 'text-blue-300 bg-blue-500/15 border-blue-500/40',
    low: 'text-slate-400 bg-slate-700/50 border-slate-600/40',
  };
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full border font-semibold uppercase tracking-wider ${colors[severity]}`}>
      {severity}
    </span>
  );
};

const CategoryBadge: React.FC<{ category: string }> = ({ category }) => {
  const colors: Record<string, string> = {
    'police-report': 'text-blue-300 bg-blue-500/15 border-blue-500/40',
    'witness-statement': 'text-purple-300 bg-purple-500/15 border-purple-500/40',
    'medical-record': 'text-red-300 bg-red-500/15 border-red-500/40',
    'photo': 'text-green-300 bg-green-500/15 border-green-500/40',
    'video': 'text-amber-300 bg-amber-500/15 border-amber-500/40',
    'audio': 'text-pink-300 bg-pink-500/15 border-pink-500/40',
    'correspondence': 'text-cyan-300 bg-cyan-500/15 border-cyan-500/40',
    'legal-filing': 'text-gold-300 bg-gold-500/15 border-gold-500/40',
    'evidence-log': 'text-teal-300 bg-teal-500/15 border-teal-500/40',
  };
  const color = colors[category] || 'text-slate-400 bg-slate-700/50 border-slate-600/40';
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${color}`}>
      {category.replace(/-/g, ' ')}
    </span>
  );
};

const ExpandableSection: React.FC<{ title: string; defaultOpen?: boolean; children: React.ReactNode; badge?: string }> = ({ title, defaultOpen = false, children, badge }) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-slate-700/60 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3 bg-slate-800/50 hover:bg-slate-800 transition-colors text-left"
      >
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-white">{title}</span>
          {badge && (
            <span className="text-xs px-1.5 py-0.5 rounded-full bg-gold-500/15 text-gold-400 border border-gold-500/30 font-medium">
              {badge}
            </span>
          )}
        </div>
        {open ? <ChevronUp size={16} className="text-slate-400" /> : <ChevronDown size={16} className="text-slate-400" />}
      </button>
      {open && <div className="px-4 py-3 border-t border-slate-700/60">{children}</div>}
    </div>
  );
};

const TabButton: React.FC<{ label: string; count?: number; active: boolean; onClick: () => void }> = ({ label, count, active, onClick }) => (
  <button
    onClick={onClick}
    className={`relative px-3 py-2 text-xs font-semibold whitespace-nowrap transition-all ${
      active
        ? 'text-gold-400 border-b-2 border-gold-500'
        : 'text-slate-400 hover:text-slate-200 border-b-2 border-transparent'
    }`}
  >
    {label}
    {count !== undefined && count > 0 && (
      <span className={`ml-1.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
        active ? 'bg-gold-500/20 text-gold-400' : 'bg-slate-700 text-slate-400'
      }`}>
        {count}
      </span>
    )}
  </button>
);

const StatCard: React.FC<{ icon: React.ReactNode; label: string; value: string | number; colorClass?: string }> = ({ icon, label, value, colorClass = 'text-gold-400' }) => (
  <div className="bg-slate-900/80 border border-slate-700/60 rounded-xl p-4 flex items-center gap-3">
    <div className={`shrink-0 p-2 rounded-lg bg-slate-800 ${colorClass}`}>{icon}</div>
    <div>
      <p className="text-xs text-slate-400">{label}</p>
      <p className="text-lg font-bold text-white">{value}</p>
    </div>
  </div>
);

// ── Main Component ──────────────────────────────────────────────────────────────

const CasePipeline: React.FC = () => {
  const { activeCase } = useContext(AppContext);
  const [files, setFiles] = useState<File[]>([]);
  const [pipelineState, setPipelineState] = useState<PipelineState | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [abortController, setAbortController] = useState<AbortController | null>(null);
  const [activeTab, setActiveTab] = useState<string>('briefing');
  const [dragOver, setDragOver] = useState(false);
  const [expandedMotions, setExpandedMotions] = useState<Set<string>>(new Set());
  const fileInputRef = useRef<HTMLInputElement>(null);
  const stageListRef = useRef<HTMLDivElement>(null);
  const [lastStageCount, setLastStageCount] = useState(0);

  useEffect(() => {
    if (activeCase?.id) {
      const existing = loadPipelineState(activeCase.id);
      if (existing) {
        setPipelineState(existing);
        setIsRunning(existing.status === 'running');
      } else {
        setPipelineState(null);
        setIsRunning(false);
        setFiles([]);
      }
    } else {
      setPipelineState(null);
      setIsRunning(false);
      setFiles([]);
    }
  }, [activeCase?.id]);

  useEffect(() => {
    if (pipelineState && isRunning) {
      const completedCount = pipelineState.stages.filter(s => s.status === 'completed').length;
      if (completedCount > lastStageCount) {
        setLastStageCount(completedCount);
        setTimeout(() => {
          const runningEl = stageListRef.current?.querySelector('[data-stage-running="true"]');
          runningEl?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 100);
      }
    }
  }, [pipelineState, isRunning, lastStageCount]);

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    if (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom) {
      setDragOver(false);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const addFiles = useCallback((newFiles: FileList | File[]) => {
    const incoming = Array.from(newFiles);
    setFiles(prev => {
      const merged = [...prev, ...incoming].slice(0, MAX_FILES);
      return merged;
    });
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      addFiles(e.dataTransfer.files);
    }
  }, [addFiles]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      addFiles(e.target.files);
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  const totalSize = useMemo(() => files.reduce((acc, f) => acc + f.size, 0), [files]);

  const startPipeline = async () => {
    if (!activeCase || files.length === 0) return;

    const controller = new AbortController();
    setAbortController(controller);
    setIsRunning(true);
    setLastStageCount(0);

    try {
      const finalState = await runPipeline(
        activeCase.id,
        activeCase.title,
        files,
        (state) => {
          setPipelineState({ ...state });
        },
        controller.signal
      );
      setPipelineState(finalState);
      setIsRunning(false);
      setFiles([]);
    } catch (err: any) {
      if (err.name === 'AbortError' || controller.signal.aborted) {
        setIsRunning(false);
      } else {
        console.error('[CasePipeline] Pipeline error:', err);
        setIsRunning(false);
      }
    }
  };

  const cancelPipeline = () => {
    abortController?.abort();
    setIsRunning(false);
  };

  const deleteResults = () => {
    if (activeCase?.id) {
      deletePipelineState(activeCase.id);
      setPipelineState(null);
      setFiles([]);
      setActiveTab('briefing');
    }
  };

  const runAgain = () => {
    deleteResults();
  };

  const copyBriefing = () => {
    if (!pipelineState?.briefing) return;
    const b = pipelineState.briefing;
    const md = [
      `# Case Briefing: ${pipelineState.caseTitle}`,
      '',
      '## Executive Summary',
      b.executiveSummary,
      '',
      '## Case Posture',
      b.casePosture,
      '',
      '## Top Risks',
      ...b.topRisks.map(r => `- ${r}`),
      '',
      '## Top Opportunities',
      ...b.topOpportunities.map(o => `- ${o}`),
      '',
      '## Key Findings',
      ...b.keyFindings.map(f => `- ${f}`),
      '',
      '## Recommended Actions',
      '| Action | Priority | Assigned To |',
      '|--------|----------|-------------|',
      ...b.recommendedActions.map(a => `| ${a.action} | ${a.priority} | ${a.assignedTo} |`),
      '',
      '## Next Steps',
      ...b.nextSteps.map((s, i) => `${i + 1}. ${s}`),
    ].join('\n');

    navigator.clipboard.writeText(md).catch(() => {});
  };

  const toggleMotion = (id: string) => {
    setExpandedMotions(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const getStageDescription = (stageId: PipelineStageId): string => {
    const found = PIPELINE_STAGES.find(s => s.id === stageId);
    return found?.description || '';
  };

  const getInventoryItemName = (id: string): string => {
    const item = pipelineState?.inventory.find(i => i.id === id);
    return item?.fileName || id;
  };

  // ── Derived state ──────────────────────────────────────────────────────────

  const isComplete = pipelineState?.status === 'completed';
  const hasResults = pipelineState && (isComplete || pipelineState.stages.some(s => s.status === 'completed'));
  const isRunningState = isRunning || pipelineState?.status === 'running';
  const completedStageCount = pipelineState?.stages.filter(s => s.status === 'completed').length || 0;
  const errorStageCount = pipelineState?.stages.filter(s => s.status === 'error').length || 0;

  // ── No active case ─────────────────────────────────────────────────────────

  if (!activeCase) {
    return (
      <div className="flex flex-col items-center justify-center py-32 text-center">
        <Gavel size={48} className="text-slate-600 mb-4" />
        <p className="text-slate-400 text-lg font-medium">Select a case to begin</p>
        <p className="text-slate-600 text-sm mt-1">Use the sidebar to choose an active case before using the pipeline</p>
      </div>
    );
  }

  // ── Tabs for results ───────────────────────────────────────────────────────

  const tabs = useMemo(() => {
    if (!pipelineState) return [];
    return [
      { id: 'briefing', label: 'Briefing', count: pipelineState.briefing ? 1 : 0 },
      { id: 'documents', label: 'Documents', count: pipelineState.inventory.length },
      { id: 'timeline', label: 'Timeline', count: pipelineState.chronology.length },
      { id: 'entities', label: 'Entities', count: pipelineState.entities.length },
      { id: 'contradictions', label: 'Contradictions', count: pipelineState.contradictions.length },
      { id: 'constitutional', label: 'Constitutional', count: pipelineState.constitutionalIssues.length },
      { id: 'motions', label: 'Motions', count: pipelineState.motions.length },
      { id: 'discovery', label: 'Discovery', count: pipelineState.discoveryItems.length },
      { id: 'gaps', label: 'Gaps', count: pipelineState.gaps.length },
      { id: 'impeachment', label: 'Impeachment', count: pipelineState.impeachments.length },
      { id: 'questions', label: 'Witness Qs', count: pipelineState.witnessQuestions.length },
    ];
  }, [pipelineState]);

  // ═══════════════════════════════════════════════════════════════════════════
  // UPLOAD STATE
  // ═══════════════════════════════════════════════════════════════════════════

  if (!hasResults && !isRunningState) {
    return (
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2 rounded-xl bg-gold-500/10 border border-gold-500/20">
            <BrainCircuit size={24} className="text-gold-500" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">Evidence Intelligence Pipeline</h1>
            <p className="text-sm text-slate-400">{activeCase.title}</p>
          </div>
        </div>

        <div
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          className={`relative border-2 border-dashed rounded-2xl p-12 text-center transition-all duration-300 cursor-pointer ${
            dragOver
              ? 'border-gold-500 bg-gold-500/5 scale-[1.01]'
              : 'border-slate-700 bg-slate-900/50 hover:border-gold-500/30 hover:bg-slate-900'
          }`}
          onClick={() => fileInputRef.current?.click()}
        >
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={handleFileSelect}
            accept=".pdf,.doc,.docx,.txt,.eml,.msg,.jpg,.jpeg,.png,.gif,.webp,.mp3,.wav,.m4a,.ogg,.mp4,.mov,.avi,.wmv"
          />
          <div className="flex flex-col items-center gap-3">
            <div className="p-4 rounded-full bg-gold-500/10 border border-gold-500/20">
              {dragOver ? (
                <Upload size={36} className="text-gold-400 animate-bounce" />
              ) : (
                <Upload size={36} className="text-gold-500" />
              )}
            </div>
            <div>
              <p className="text-lg font-semibold text-white">
                {dragOver ? 'Drop files here' : 'Drop case files here'}
              </p>
              <p className="text-sm text-slate-400 mt-1">
                PDFs, images, audio, video, emails, reports
              </p>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              CaseBuddy will OCR, index, analyze, and brief everything automatically
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 justify-center">
          {SUPPORTED_FORMATS.map(fmt => (
            <span key={fmt} className="text-xs px-2.5 py-1 rounded-full bg-slate-800 border border-slate-700 text-slate-400 font-mono">
              {fmt}
            </span>
          ))}
        </div>

        {files.length > 0 && (
          <div className="bg-slate-900/80 border border-slate-700/60 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-700/60 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileText size={16} className="text-gold-500" />
                <span className="text-sm font-semibold text-white">Files ({files.length}/{MAX_FILES})</span>
                <span className="text-xs text-slate-500">{formatBytes(totalSize)}</span>
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); setFiles([]); }}
                className="text-xs text-slate-500 hover:text-red-400 transition-colors"
              >
                Clear all
              </button>
            </div>
            <div className="max-h-64 overflow-y-auto">
              {files.map((file, idx) => (
                <div
                  key={`${file.name}-${idx}`}
                  className="flex items-center gap-3 px-4 py-2.5 border-b border-slate-800 last:border-b-0 hover:bg-slate-800/50 transition-colors"
                >
                  <div className="shrink-0 p-1.5 rounded bg-slate-800">
                    {getFileIcon(file)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white truncate">{file.name}</p>
                    <p className="text-xs text-slate-500">{formatBytes(file.size)}</p>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); removeFile(idx); }}
                    className="p-1 rounded hover:bg-red-500/10 text-slate-500 hover:text-red-400 transition-colors"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex items-center gap-3 justify-between">
          <div className="flex items-center gap-4 text-xs text-slate-500">
            <span className="flex items-center gap-1"><FileText size={12} /> {files.length} files</span>
            <span className="flex items-center gap-1"><BarChart3 size={12} /> {formatBytes(totalSize)} total</span>
            <span className="flex items-center gap-1"><Clock size={12} /> ~5-15 min estimated</span>
          </div>
          <button
            onClick={startPipeline}
            disabled={files.length === 0}
            className={`flex items-center gap-2 px-6 py-2.5 rounded-xl font-semibold text-sm transition-all ${
              files.length === 0
                ? 'bg-slate-800 text-slate-600 cursor-not-allowed border border-slate-700'
                : 'bg-gold-500 text-slate-950 hover:bg-gold-400 shadow-lg shadow-gold-500/20 active:scale-95'
            }`}
          >
            <Play size={16} />
            Start Pipeline
          </button>
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // RUNNING STATE
  // ═══════════════════════════════════════════════════════════════════════════

  if (isRunningState) {
    const currentStage = pipelineState?.stages.find(s => s.status === 'running');

    return (
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="relative">
              <BrainCircuit size={24} className="text-gold-500" />
              <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-gold-500 rounded-full animate-pulse" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white">Pipeline Running</h1>
              <p className="text-sm text-slate-400">{activeCase.title}</p>
            </div>
          </div>
          <button
            onClick={cancelPipeline}
            className="flex items-center gap-2 px-4 py-2 rounded-xl border border-red-500/40 text-red-400 hover:bg-red-500/10 text-sm font-medium transition-all"
          >
            <Square size={14} />
            Cancel
          </button>
        </div>

        <div className="bg-slate-900/80 border border-slate-700/60 rounded-xl p-5 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-400">Overall Progress</span>
            <span className="text-sm font-bold text-gold-400">{pipelineState?.overallProgress || 0}%</span>
          </div>
          <ProgressBar progress={pipelineState?.overallProgress || 0} />
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <span>{completedStageCount} of 13 stages complete</span>
            {errorStageCount > 0 && (
              <span className="flex items-center gap-1 text-red-400">
                <AlertTriangle size={12} />
                {errorStageCount} error{errorStageCount > 1 ? 's' : ''}
              </span>
            )}
          </div>
        </div>

        {currentStage && (
          <div className="bg-slate-900/80 border border-gold-500/20 rounded-xl p-4">
            <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Current Stage</p>
            <div className="flex items-center gap-2">
              <Loader2 size={18} className="text-gold-500 animate-spin" />
              <span className="text-lg font-bold text-white">
                {getStageIcon(currentStage.id)} {currentStage.label}
              </span>
            </div>
            <p className="text-sm text-slate-400 mt-1">{getStageDescription(currentStage.id)}</p>
          </div>
        )}

        <div className="bg-slate-900/80 border border-slate-700/60 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-700/60">
            <p className="text-sm font-semibold text-white">Stage Timeline</p>
          </div>
          <div ref={stageListRef} className="divide-y divide-slate-800/60 max-h-[500px] overflow-y-auto">
            {(pipelineState?.stages || []).map((stage) => {
              const isCurrent = stage.status === 'running';
              const def = PIPELINE_STAGES.find(s => s.id === stage.id);
              const duration = stage.completedAt && stage.startedAt
                ? Math.round((stage.completedAt - stage.startedAt) / 1000)
                : null;

              return (
                <div
                  key={stage.id}
                  data-stage-running={isCurrent ? 'true' : 'false'}
                  className={`flex items-start gap-3 px-4 py-3 transition-all ${
                    isCurrent ? 'bg-gold-500/5 border-l-2 border-l-gold-500' : ''
                  }`}
                >
                  <div className="shrink-0 mt-0.5">
                    <StageIndicator status={stage.status} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-sm font-medium ${
                        stage.status === 'completed' ? 'text-white' :
                        stage.status === 'error' ? 'text-red-400' :
                        stage.status === 'running' ? 'text-gold-400' :
                        stage.status === 'skipped' ? 'text-slate-600 line-through' :
                        'text-slate-500'
                      }`}>
                        {def?.icon} {stage.label}
                      </span>
                      {duration !== null && (
                        <span className="text-xs text-slate-500">
                          {duration < 60 ? `${duration}s` : `${Math.floor(duration / 60)}m ${duration % 60}s`}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">{def?.description}</p>
                    {stage.error && (
                      <p className="text-xs text-red-400 mt-1 flex items-center gap-1">
                        <AlertTriangle size={10} />
                        {stage.error}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // RESULTS STATE
  // ═══════════════════════════════════════════════════════════════════════════

  if (!pipelineState) return null;

  const briefing = pipelineState.briefing;
  const completedStages = pipelineState.stages.filter(s => s.status === 'completed').length;

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="p-2 rounded-xl bg-green-500/10 border border-green-500/20">
              <CheckCircle2 size={24} className="text-green-400" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white">Pipeline Complete</h1>
              <p className="text-sm text-slate-400">{activeCase.title}</p>
            </div>
          </div>
          <p className="text-sm text-slate-500 mt-1">
            CaseBuddy completed analysis — {pipelineState.inventory.length} document{pipelineState.inventory.length !== 1 ? 's' : ''} processed, {completedStages}/{pipelineState.stages.length} stages
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={copyBriefing}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-700 text-slate-400 hover:text-white hover:border-slate-600 text-xs font-medium transition-all"
            title="Copy briefing as Markdown"
          >
            <Copy size={14} />
            Export
          </button>
          <button
            onClick={runAgain}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-gold-500/10 border border-gold-500/30 text-gold-400 hover:bg-gold-500/20 text-xs font-medium transition-all"
          >
            <RefreshCw size={14} />
            Run Again
          </button>
          <button
            onClick={deleteResults}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-red-500/30 text-red-400 hover:bg-red-500/10 text-xs font-medium transition-all"
          >
            <Trash2 size={14} />
            Delete
          </button>
        </div>
      </div>

      {/* Stats Row */}
      {briefing && (
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
          <StatCard icon={<FileText size={18} />} label="Documents" value={pipelineState.inventory.length} colorClass="text-blue-400" />
          <StatCard icon={<Users size={18} />} label="Entities" value={pipelineState.entities.length} colorClass="text-emerald-400" />
          <StatCard icon={<AlertOctagon size={18} />} label="Contradictions" value={pipelineState.contradictions.length} colorClass="text-red-400" />
          <StatCard icon={<Shield size={18} />} label="Const. Issues" value={pipelineState.constitutionalIssues.length} colorClass="text-amber-400" />
          <StatCard icon={<Gavel size={18} />} label="Motions" value={pipelineState.motions.length} colorClass="text-purple-400" />
          <StatCard icon={<Search size={18} />} label="Discovery" value={pipelineState.discoveryItems.length} colorClass="text-cyan-400" />
          <StatCard icon={<AlertTriangle size={18} />} label="Gaps" value={pipelineState.gaps.length} colorClass="text-orange-400" />
          <StatCard icon={<Target size={18} />} label="Impeachment" value={pipelineState.impeachments.length} colorClass="text-pink-400" />
        </div>
      )}

      {/* Tab Navigation */}
      <div className="border-b border-slate-700/60 overflow-x-auto">
        <div className="flex gap-1 min-w-max">
          {tabs.map(tab => (
            <TabButton
              key={tab.id}
              label={tab.label}
              count={tab.count}
              active={activeTab === tab.id}
              onClick={() => setActiveTab(tab.id)}
            />
          ))}
        </div>
      </div>

      {/* Tab Content */}
      <div className="min-h-[400px]">
        {/* ── BRIEFING ──────────────────────────────────────────────────────── */}
        {activeTab === 'briefing' && briefing && (
          <div className="space-y-6">
            <div className="bg-slate-900/80 border border-gold-500/20 rounded-xl p-6">
              <h2 className="text-lg font-bold text-white flex items-center gap-2 mb-4">
                <Zap size={20} className="text-gold-500" />
                Executive Summary
              </h2>
              <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-line">{briefing.executiveSummary}</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-slate-900/80 border border-slate-700/60 rounded-xl p-5">
                <h3 className="text-sm font-semibold text-white flex items-center gap-2 mb-3">
                  <Shield size={16} className="text-gold-500" />
                  Case Posture
                </h3>
                <p className="text-sm text-slate-300 leading-relaxed">{briefing.casePosture}</p>
              </div>

              <div className="space-y-4">
                <div className="bg-red-500/5 border border-red-500/20 rounded-xl p-4">
                  <h3 className="text-sm font-semibold text-red-300 flex items-center gap-2 mb-2">
                    <AlertOctagon size={16} />
                    Top Risks
                  </h3>
                  <ul className="space-y-1.5">
                    {briefing.topRisks.map((risk, i) => (
                      <li key={`risk-${i}`} className="text-xs text-slate-300 flex items-start gap-2">
                        <span className="text-red-400 mt-0.5 shrink-0">•</span>
                        {risk}
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="bg-green-500/5 border border-green-500/20 rounded-xl p-4">
                  <h3 className="text-sm font-semibold text-green-300 flex items-center gap-2 mb-2">
                    <Target size={16} />
                    Top Opportunities
                  </h3>
                  <ul className="space-y-1.5">
                    {briefing.topOpportunities.map((opp, i) => (
                      <li key={`opp-${i}`} className="text-xs text-slate-300 flex items-start gap-2">
                        <span className="text-green-400 mt-0.5 shrink-0">•</span>
                        {opp}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>

            <div className="bg-slate-900/80 border border-slate-700/60 rounded-xl p-5">
              <h3 className="text-sm font-semibold text-white flex items-center gap-2 mb-3">
                <FileSearch size={16} className="text-gold-500" />
                Key Findings
              </h3>
              <ul className="space-y-2">
                {briefing.keyFindings.map((finding, i) => (
                  <li key={`finding-${i}`} className="text-sm text-slate-300 flex items-start gap-2">
                    <span className="text-gold-400 font-bold shrink-0">{i + 1}.</span>
                    {finding}
                  </li>
                ))}
              </ul>
            </div>

            <div className="bg-slate-900/80 border border-slate-700/60 rounded-xl overflow-hidden">
              <div className="px-5 py-3 border-b border-slate-700/60">
                <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                  <ArrowRight size={16} className="text-gold-500" />
                  Recommended Actions
                </h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-700/60">
                      <th className="text-left px-5 py-2.5 text-xs font-semibold text-slate-400 uppercase tracking-wider">Action</th>
                      <th className="text-left px-5 py-2.5 text-xs font-semibold text-slate-400 uppercase tracking-wider">Priority</th>
                      <th className="text-left px-5 py-2.5 text-xs font-semibold text-slate-400 uppercase tracking-wider">Assigned To</th>
                    </tr>
                  </thead>
                  <tbody>
                    {briefing.recommendedActions.map((action, i) => (
                      <tr key={`action-${i}`} className="border-b border-slate-800/60 hover:bg-slate-800/30 transition-colors">
                        <td className="px-5 py-2.5 text-slate-200">{action.action}</td>
                        <td className="px-5 py-2.5"><PriorityBadge priority={action.priority} /></td>
                        <td className="px-5 py-2.5 text-slate-400 text-xs">{action.assignedTo}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="bg-slate-900/80 border border-slate-700/60 rounded-xl p-5">
              <h3 className="text-sm font-semibold text-white flex items-center gap-2 mb-3">
                <Calendar size={16} className="text-gold-500" />
                Next Steps
              </h3>
              <ol className="space-y-2">
                {briefing.nextSteps.map((step, i) => (
                  <li key={`step-${i}`} className="text-sm text-slate-300 flex items-start gap-2">
                    <span className="text-gold-400 font-bold shrink-0 mt-0.5">{i + 1}.</span>
                    {step}
                  </li>
                ))}
              </ol>
            </div>
          </div>
        )}

        {activeTab === 'briefing' && !briefing && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <HelpCircle size={40} className="text-slate-600 mb-3" />
            <p className="text-slate-500">Briefing data not available</p>
          </div>
        )}

        {/* ── DOCUMENTS ─────────────────────────────────────────────────────── */}
        {activeTab === 'documents' && (
          <div className="space-y-4">
            <div className="bg-slate-900/80 border border-slate-700/60 rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-700/60">
                      <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-400 uppercase tracking-wider">File</th>
                      <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-400 uppercase tracking-wider">Type</th>
                      <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-400 uppercase tracking-wider">Bates #</th>
                      <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-400 uppercase tracking-wider">Category</th>
                      <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-400 uppercase tracking-wider">Summary</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pipelineState.inventory.map((item) => (
                      <tr key={item.id} className="border-b border-slate-800/60 hover:bg-slate-800/30 transition-colors">
                        <td className="px-4 py-2.5 text-white text-xs font-medium">{item.fileName}</td>
                        <td className="px-4 py-2.5 text-slate-400 text-xs font-mono">{item.fileType}</td>
                        <td className="px-4 py-2.5 text-gold-400 text-xs font-mono">{item.batesNumber || '—'}</td>
                        <td className="px-4 py-2.5">{item.category ? <CategoryBadge category={item.category} /> : <span className="text-slate-600 text-xs">—</span>}</td>
                        <td className="px-4 py-2.5 text-slate-300 text-xs max-w-xs truncate">{item.summary || item.extractedText || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            {pipelineState.inventory.length === 0 && (
              <p className="text-center text-slate-500 py-10">No documents in inventory</p>
            )}
          </div>
        )}

        {/* ── TIMELINE ──────────────────────────────────────────────────────── */}
        {activeTab === 'timeline' && (
          <div className="space-y-4">
            {pipelineState.chronology.length === 0 ? (
              <p className="text-center text-slate-500 py-10">No timeline entries</p>
            ) : (
              <div className="relative pl-6 border-l-2 border-slate-700 space-y-4">
                {pipelineState.chronology.map((entry, i) => (
                  <div key={`chrono-${i}`} className="relative pb-1">
                    <div className="absolute -left-[23px] w-4 h-4 rounded-full border-2 border-slate-600 bg-slate-900" />
                    <div className="bg-slate-900/80 border border-slate-700/60 rounded-xl p-4">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className="text-xs font-mono text-gold-400">{entry.date}</span>
                        <span className="text-xs px-1.5 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700">
                          {entry.confidence}
                        </span>
                      </div>
                      <p className="text-sm font-semibold text-white">{entry.title}</p>
                      <p className="text-xs text-slate-400 mt-1">{entry.description}</p>
                      <p className="text-xs text-slate-600 mt-1">Source: {getInventoryItemName(entry.source)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── ENTITIES ──────────────────────────────────────────────────────── */}
        {activeTab === 'entities' && (
          <div className="space-y-4">
            {pipelineState.entities.length === 0 ? (
              <p className="text-center text-slate-500 py-10">No entities extracted</p>
            ) : (
              (() => {
                const groups = {
                  person: pipelineState.entities.filter(e => e.type === 'person'),
                  organization: pipelineState.entities.filter(e => e.type === 'organization'),
                  location: pipelineState.entities.filter(e => e.type === 'location'),
                  statute: pipelineState.entities.filter(e => e.type === 'statute' || e.type === 'case-law'),
                  other: pipelineState.entities.filter(e => !['person', 'organization', 'location', 'statute', 'case-law'].includes(e.type)),
                };

                const groupConfig: Record<string, { icon: React.ReactNode; label: string; colorClass: string }> = {
                  person: { icon: <Users size={16} />, label: 'People', colorClass: 'text-blue-400' },
                  organization: { icon: <Shield size={16} />, label: 'Organizations', colorClass: 'text-purple-400' },
                  location: { icon: <FileSearch size={16} />, label: 'Locations', colorClass: 'text-green-400' },
                  statute: { icon: <Gavel size={16} />, label: 'Statutes & Case Law', colorClass: 'text-amber-400' },
                  other: { icon: <HelpCircle size={16} />, label: 'Other', colorClass: 'text-slate-400' },
                };

                return Object.entries(groups).map(([key, entities]) => {
                  if (entities.length === 0) return null;
                  const cfg = groupConfig[key];
                  return (
                    <div key={key} className="bg-slate-900/80 border border-slate-700/60 rounded-xl overflow-hidden">
                      <div className="px-4 py-3 border-b border-slate-700/60 flex items-center gap-2">
                        <span className={cfg.colorClass}>{cfg.icon}</span>
                        <span className="text-sm font-semibold text-white">{cfg.label}</span>
                        <span className="text-xs text-slate-500">({entities.length})</span>
                      </div>
                      <div className="divide-y divide-slate-800/60">
                        {entities.map((entity, i) => (
                          <div key={`${entity.name}-${i}`} className="px-4 py-3 flex items-center justify-between hover:bg-slate-800/30 transition-colors">
                            <div>
                              <p className="text-sm font-medium text-white">{entity.name}</p>
                              {entity.role && entity.role !== 'other' && (
                                <p className="text-xs text-slate-500 capitalize">{entity.role.replace(/-/g, ' ')}</p>
                              )}
                            </div>
                            <div className="flex items-center gap-3">
                              <span className="text-xs text-slate-600">{entity.mentions} mention{entity.mentions !== 1 ? 's' : ''}</span>
                              {entity.documents.length > 0 && (
                                <span className="text-xs text-slate-600">{entity.documents.length} doc{entity.documents.length !== 1 ? 's' : ''}</span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                });
              })()
            )}
          </div>
        )}

        {/* ── CONTRADICTIONS ────────────────────────────────────────────────── */}
        {activeTab === 'contradictions' && (
          <div className="space-y-4">
            {pipelineState.contradictions.length === 0 ? (
              <p className="text-center text-slate-500 py-10">No contradictions found</p>
            ) : (
              pipelineState.contradictions.map((c, i) => (
                <div key={`contra-${i}`} className="bg-red-500/5 border border-red-500/20 rounded-xl p-5">
                  <div className="flex items-center gap-2 mb-2">
                    <AlertOctagon size={16} className="text-red-400" />
                    <SeverityBadge severity={c.severity} />
                  </div>
                  <p className="text-sm font-semibold text-white mb-2">{c.description}</p>
                  <p className="text-xs text-slate-400 mb-2">{c.detail}</p>
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <span className="font-mono">{getInventoryItemName(c.sourceA)}</span>
                    <span className="text-red-500">vs</span>
                    <span className="font-mono">{getInventoryItemName(c.sourceB)}</span>
                  </div>
                  {c.implication && (
                    <p className="text-xs text-red-300/80 mt-2 italic">{c.implication}</p>
                  )}
                </div>
              ))
            )}
          </div>
        )}

        {/* ── CONSTITUTIONAL ────────────────────────────────────────────────── */}
        {activeTab === 'constitutional' && (
          <div className="space-y-4">
            {pipelineState.constitutionalIssues.length === 0 ? (
              <p className="text-center text-slate-500 py-10">No constitutional issues identified</p>
            ) : (
              (() => {
                const grouped: Record<string, PipelineConstitutionalIssue[]> = {};
                pipelineState.constitutionalIssues.forEach(ci => {
                  if (!grouped[ci.amendment]) grouped[ci.amendment] = [];
                  grouped[ci.amendment].push(ci);
                });

                const amendmentLabels: Record<string, string> = {
                  '4th': 'Fourth Amendment — Search & Seizure',
                  '5th': 'Fifth Amendment — Self-Incrimination & Due Process',
                  '6th': 'Sixth Amendment — Right to Counsel & Fair Trial',
                  '8th': 'Eighth Amendment — Cruel & Unusual Punishment',
                  '14th': 'Fourteenth Amendment — Equal Protection & Due Process',
                };

                return Object.entries(grouped).map(([amendment, issues]) => (
                  <ExpandableSection
                    key={amendment}
                    title={amendmentLabels[amendment] || `${amendment} Amendment`}
                    badge={`${issues.length}`}
                    defaultOpen={true}
                  >
                    <div className="space-y-3">
                      {issues.map((issue, i) => (
                        <div key={`const-${i}`} className="border border-slate-700/40 rounded-lg p-3">
                          <div className="flex items-center gap-2 mb-1">
                            <SeverityBadge severity={issue.severity} />
                            <span className="text-sm font-semibold text-white">{issue.issue}</span>
                          </div>
                          <p className="text-xs text-slate-400 mb-2">{issue.description}</p>
                          {issue.relevantFacts.length > 0 && (
                            <div className="mb-2">
                              <p className="text-xs text-slate-500 mb-1">Relevant Facts:</p>
                              <ul className="list-disc list-inside text-xs text-slate-400 space-y-0.5">
                                {issue.relevantFacts.map((f, fi) => (
                                  <li key={`fact-${fi}`}>{f}</li>
                                ))}
                              </ul>
                            </div>
                          )}
                          <p className="text-xs text-gold-400">
                            <span className="font-semibold">Recommendation:</span> {issue.recommendation}
                          </p>
                        </div>
                      ))}
                    </div>
                  </ExpandableSection>
                ));
              })()
            )}
          </div>
        )}

        {/* ── MOTIONS ───────────────────────────────────────────────────────── */}
        {activeTab === 'motions' && (
          <div className="space-y-4">
            {pipelineState.motions.length === 0 ? (
              <p className="text-center text-slate-500 py-10">No motions drafted</p>
            ) : (
              pipelineState.motions.map((motion, i) => {
                const motionId = `motion-${i}`;
                const expanded = expandedMotions.has(motionId);
                return (
                  <div key={motionId} className="bg-slate-900/80 border border-slate-700/60 rounded-xl overflow-hidden">
                    <button
                      onClick={() => toggleMotion(motionId)}
                      className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-800/50 transition-colors text-left"
                    >
                      <div className="flex items-center gap-2 flex-wrap">
                        <Gavel size={16} className="text-gold-500" />
                        <span className="text-sm font-semibold text-white">{motion.title}</span>
                        <PriorityBadge priority={motion.priority} />
                        <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700 capitalize">
                          {motion.type.replace(/-/g, ' ')}
                        </span>
                      </div>
                      {expanded ? <ChevronUp size={16} className="text-slate-400" /> : <ChevronDown size={16} className="text-slate-400" />}
                    </button>
                    {expanded && (
                      <div className="px-4 py-3 border-t border-slate-700/60 space-y-3">
                        <div>
                          <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Legal Basis</p>
                          <p className="text-sm text-slate-300">{motion.basis}</p>
                        </div>
                        {motion.draftContent && (
                          <div>
                            <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Draft Content</p>
                            <div className="bg-slate-800/50 border border-slate-700/40 rounded-lg p-4">
                              <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-line">{motion.draftContent}</p>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* ── DISCOVERY ─────────────────────────────────────────────────────── */}
        {activeTab === 'discovery' && (
          <div className="space-y-4">
            {pipelineState.discoveryItems.length === 0 ? (
              <p className="text-center text-slate-500 py-10">No discovery items</p>
            ) : (
              (() => {
                const typeLabels: Record<string, { icon: React.ReactNode; label: string }> = {
                  'interrogatory': { icon: <HelpCircle size={16} />, label: 'Interrogatories' },
                  'request-for-production': { icon: <FileText size={16} />, label: 'Requests for Production' },
                  'request-for-admission': { icon: <CheckCircle2 size={16} />, label: 'Requests for Admission' },
                  'subpoena': { icon: <Gavel size={16} />, label: 'Subpoenas' },
                  'deposition-notice': { icon: <Users size={16} />, label: 'Deposition Notices' },
                };

                const grouped: Record<string, PipelineDiscoveryItem[]> = {};
                pipelineState.discoveryItems.forEach(d => {
                  if (!grouped[d.type]) grouped[d.type] = [];
                  grouped[d.type].push(d);
                });

                return Object.entries(grouped).map(([type, items]) => {
                  const cfg = typeLabels[type] || { icon: <FileText size={16} />, label: type };
                  return (
                    <ExpandableSection key={type} title={`${cfg.label} (${items.length})`} defaultOpen={true}>
                      <div className="space-y-3">
                        {items.map((item, i) => (
                          <div key={`disc-${i}`} className="border border-slate-700/40 rounded-lg p-3">
                            <div className="flex items-center gap-2 mb-1 flex-wrap">
                              <PriorityBadge priority={item.priority} />
                              <span className="text-sm text-white font-medium">To: {item.target}</span>
                            </div>
                            <p className="text-xs text-slate-400 mb-2">{item.description}</p>
                            {item.draftContent && (
                              <div className="bg-slate-800/50 border border-slate-700/40 rounded-lg p-3">
                                <p className="text-xs text-slate-300 leading-relaxed whitespace-pre-line">{item.draftContent}</p>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </ExpandableSection>
                  );
                });
              })()
            )}
          </div>
        )}

        {/* ── GAPS ──────────────────────────────────────────────────────────── */}
        {activeTab === 'gaps' && (
          <div className="space-y-4">
            {pipelineState.gaps.length === 0 ? (
              <p className="text-center text-slate-500 py-10">No gaps identified</p>
            ) : (
              pipelineState.gaps.map((gap, i) => (
                <div key={`gap-${i}`} className="bg-orange-500/5 border border-orange-500/20 rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-2 flex-wrap">
                    <AlertTriangle size={16} className="text-orange-400" />
                    <SeverityBadge severity={gap.severity} />
                    <span className="text-xs px-2 py-0.5 rounded-full bg-orange-500/10 border border-orange-500/30 text-orange-300 capitalize">
                      {gap.category.replace(/-/g, ' ')}
                    </span>
                  </div>
                  <p className="text-sm text-white font-medium">{gap.description}</p>
                  {gap.recommendation && (
                    <p className="text-xs text-orange-300/80 mt-2">
                      <span className="font-semibold">Recommendation:</span> {gap.recommendation}
                    </p>
                  )}
                </div>
              ))
            )}
          </div>
        )}

        {/* ── IMPEACHMENT ───────────────────────────────────────────────────── */}
        {activeTab === 'impeachment' && (
          <div className="space-y-4">
            {pipelineState.impeachments.length === 0 ? (
              <p className="text-center text-slate-500 py-10">No impeachment material found</p>
            ) : (
              pipelineState.impeachments.map((imp, i) => (
                <div key={`impeach-${i}`} className="bg-pink-500/5 border border-pink-500/20 rounded-xl p-5">
                  <div className="flex items-center gap-2 mb-2 flex-wrap">
                    <Target size={16} className="text-pink-400" />
                    <span className="text-sm font-bold text-white">{imp.targetName}</span>
                    <span className="text-xs text-slate-400">({imp.targetRole})</span>
                    <SeverityBadge severity={imp.impeachmentValue} />
                  </div>
                  <div className="bg-slate-800/50 border border-slate-700/40 rounded-lg p-3 mb-3">
                    <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Statement</p>
                    <p className="text-sm text-slate-300 italic">"{imp.statement}"</p>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-slate-500 mb-3">
                    <span>Source: {getInventoryItemName(imp.source)}</span>
                  </div>
                  <p className="text-xs text-pink-300/80 mb-2">{imp.contradiction}</p>
                  {imp.suggestedQuestions.length > 0 && (
                    <div>
                      <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Suggested Cross-Examination Questions</p>
                      <ol className="list-decimal list-inside space-y-0.5">
                        {imp.suggestedQuestions.map((q, qi) => (
                          <li key={`q-${qi}`} className="text-xs text-slate-300">{q}</li>
                        ))}
                      </ol>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        )}

        {/* ── WITNESS QUESTIONS ─────────────────────────────────────────────── */}
        {activeTab === 'questions' && (
          <div className="space-y-4">
            {pipelineState.witnessQuestions.length === 0 ? (
              <p className="text-center text-slate-500 py-10">No witness questions generated</p>
            ) : (
              pipelineState.witnessQuestions.map((wq, i) => (
                <ExpandableSection
                  key={`wq-${i}`}
                  title={`${wq.witnessName} (${wq.witnessRole})`}
                  defaultOpen={i === 0}
                >
                  <div className="space-y-4">
                    {wq.keyTopics.length > 0 && (
                      <div>
                        <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Key Topics</p>
                        <div className="flex flex-wrap gap-1">
                          {wq.keyTopics.map((t, ti) => (
                            <span key={`topic-${ti}`} className="text-xs px-2 py-1 rounded-full bg-gold-500/10 border border-gold-500/20 text-gold-400">
                              {t}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="bg-slate-800/50 border border-slate-700/40 rounded-lg p-3">
                        <p className="text-xs text-slate-500 uppercase tracking-wider mb-2">Direct Examination</p>
                        <ol className="list-decimal list-inside space-y-1.5">
                          {wq.directExamination.map((q, qi) => (
                            <li key={`dir-${qi}`} className="text-sm text-slate-300">{q}</li>
                          ))}
                        </ol>
                      </div>
                      <div className="bg-slate-800/50 border border-slate-700/40 rounded-lg p-3">
                        <p className="text-xs text-slate-500 uppercase tracking-wider mb-2">Cross Examination</p>
                        <ol className="list-decimal list-inside space-y-1.5">
                          {wq.crossExamination.map((q, qi) => (
                            <li key={`cross-${qi}`} className="text-sm text-slate-300">{q}</li>
                          ))}
                        </ol>
                      </div>
                    </div>
                  </div>
                </ExpandableSection>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default CasePipeline;
