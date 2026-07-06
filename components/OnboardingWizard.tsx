import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppContext } from '../App';
import {
  Gavel, Upload, BrainCircuit, CheckCircle2, ChevronRight, ChevronLeft,
  ArrowRight, Zap, FileText, Shield, Star, Loader2, X, FileSearch, FileAudio,
  FileImage, File, Paperclip
} from 'lucide-react';
import { scheduleBackgroundPipeline, loadPipelineState } from '../services/casePipeline';
import { toast } from 'react-toastify';
import type { Case, CaseStatus, PipelineState } from '../types';
import { PIPELINE_STAGES } from '../types';

interface OnboardingWizardProps {
  onClose: () => void;
}

const CASE_TYPES = [
  'Personal Injury',
  'Criminal Defense',
  'Family Law',
  'Civil Litigation',
  'Employment',
  'Immigration',
  'Other',
];

const formatBytes = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
};

const ACCEPT_ATTRS = '.pdf,.doc,.docx,.jpg,.jpeg,.png,.gif,.webp,.bmp,.tiff,.mp3,.wav,.m4a,.ogg,.wma,.flac,.mp4,.mov,.avi,.wmv,.txt,.csv,.log,.md,.json,.xml,.html,.eml,.msg';

const getFileIcon = (file: File): React.ReactNode => {
  if (file.type.includes('pdf') || file.name.endsWith('.pdf')) return <FileText size={18} className="text-red-400" />;
  if (file.type.includes('word') || file.name.match(/\.(doc|docx)$/i)) return <FileText size={18} className="text-blue-400" />;
  if (file.type.includes('image') || file.name.match(/\.(jpg|jpeg|png|gif|webp|bmp|tiff)$/i)) return <FileImage size={18} className="text-green-400" />;
  if (file.type.includes('audio') || file.name.match(/\.(mp3|wav|m4a|ogg|wma|flac)$/i)) return <FileAudio size={18} className="text-purple-400" />;
  if (file.type.includes('video') || file.name.match(/\.(mp4|mov|avi|wmv)$/i)) return <FileSearch size={18} className="text-amber-400" />;
  return <File size={18} className="text-slate-400" />;
};

const STEPS = [
  { num: 1, label: 'Create Case' },
  { num: 2, label: 'Upload Evidence' },
  { num: 3, label: 'Run Pipeline' },
  { num: 4, label: 'Review' },
];

const PIPELINE_INFO_CARDS = [
  { icon: '📋', label: 'Document Inventory', desc: 'Catalog all uploaded files' },
  { icon: '🔍', label: 'OCR & Text Extraction', desc: 'Extract text from images and PDFs' },
  { icon: '👥', label: 'Entity Extraction', desc: 'Identify people, places, organizations' },
  { icon: '📅', label: 'Timeline Construction', desc: 'Build chronological event timeline' },
  { icon: '⚠️', label: 'Contradiction Detection', desc: 'Cross-reference for inconsistencies' },
  { icon: '🏛️', label: 'Constitutional Analysis', desc: 'Identify constitutional issues' },
  { icon: '📝', label: 'Motion Drafting', desc: 'Draft relevant legal motions' },
  { icon: '📊', label: 'Final Briefing', desc: 'Compile comprehensive case briefing' },
];

const OnboardingWizard: React.FC<OnboardingWizardProps> = ({ onClose }) => {
  const { addCase, setActiveCase } = React.useContext(AppContext);
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState(1);
  const [caseTitle, setCaseTitle] = useState('');
  const [clientName, setClientName] = useState('');
  const [caseType, setCaseType] = useState('');
  const [summary, setSummary] = useState('');
  const [nextCourtDate, setNextCourtDate] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [pipelineState, setPipelineState] = useState<PipelineState | null>(null);
  const [pipelineRunning, setPipelineRunning] = useState(false);
  const [createdCaseId, setCreatedCaseId] = useState<string>('');
  const [creating, setCreating] = useState(false);
  const pipelinePollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pipelineSkippedRef = useRef(false);

  useEffect(() => {
    return () => {
      if (pipelinePollRef.current) clearInterval(pipelinePollRef.current);
    };
  }, []);

  const canAdvanceStep1 = caseTitle.trim() && clientName.trim() && caseType.trim() && summary.trim();

  const generateId = () => `case-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const handleCreateCase = useCallback(async () => {
    if (!canAdvanceStep1) return;
    setCreating(true);
    const newId = generateId();
    const newCase: Case = {
      id: newId,
      title: caseTitle.trim(),
      client: clientName.trim(),
      status: CaseStatus.PRE_TRIAL,
      opposingCounsel: '',
      judge: '',
      nextCourtDate: nextCourtDate || 'TBD',
      summary: summary.trim(),
      winProbability: 50,
      caseType: caseType,
      updatedAt: new Date().toISOString(),
    };

    addCase(newCase);
    setActiveCase(newCase);
    setCreatedCaseId(newId);
    setCreating(false);
    setStep(2);
  }, [caseTitle, clientName, caseType, summary, nextCourtDate, canAdvanceStep1, addCase, setActiveCase]);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
  };

  const addNewFiles = (newFiles: File[]) => {
    const allowed = newFiles.filter((f) => {
      const ext = '.' + f.name.split('.').pop()?.toLowerCase();
      const valid =
        f.type.includes('pdf') ||
        f.type.includes('word') ||
        f.type.includes('image') ||
        f.type.includes('audio') ||
        f.type.includes('video') ||
        f.type.includes('text') ||
        f.type.includes('message') ||
        [
          '.pdf', '.doc', '.docx', '.jpg', '.jpeg', '.png', '.gif', '.webp',
          '.bmp', '.tiff', '.mp3', '.wav', '.m4a', '.ogg', '.wma', '.flac',
          '.mp4', '.mov', '.avi', '.wmv', '.txt', '.csv', '.log', '.md',
          '.json', '.xml', '.html', '.eml', '.msg',
        ].includes(ext);
      return valid;
    });
    if (allowed.length !== newFiles.length) {
      toast.warning(`${newFiles.length - allowed.length} file(s) skipped (unsupported format)`);
    }
    setFiles((prev) => [...prev, ...allowed].slice(0, 50));
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const dropped = Array.from(e.dataTransfer.files);
    addNewFiles(dropped);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      addNewFiles(Array.from(e.target.files));
    }
  };

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleAdvanceToStep3 = () => {
    setStep(3);
  };

  const handleStartPipeline = async () => {
    if (!createdCaseId || files.length === 0) {
      if (files.length === 0) {
        toast.info('No files to process. Skipping pipeline.');
        pipelineSkippedRef.current = true;
        setStep(4);
      }
      return;
    }

    setPipelineRunning(true);

    try {
      const { state: initialPipelineState } = await scheduleBackgroundPipeline(
        createdCaseId,
        caseTitle.trim(),
        files
      );
      setPipelineState(initialPipelineState);

      pipelinePollRef.current = setInterval(() => {
        const updated = loadPipelineState(createdCaseId);
        if (updated) {
          setPipelineState(updated);
          if (updated.status === 'completed' || updated.status === 'error' || updated.status === 'cancelled') {
            if (pipelinePollRef.current) {
              clearInterval(pipelinePollRef.current);
              pipelinePollRef.current = null;
            }
          }
        }
      }, 2000);
    } catch (err) {
      console.error('[OnboardingWizard] Pipeline start failed:', err);
      toast.error('Pipeline failed to start. You can run it later from the Case Pipeline page.');
      setPipelineRunning(false);
    }
  };

  const handleSkipPipeline = () => {
    if (pipelinePollRef.current) {
      clearInterval(pipelinePollRef.current);
      pipelinePollRef.current = null;
    }
    pipelineSkippedRef.current = true;
    setStep(4);
  };

  const handleFinish = () => {
    localStorage.setItem('casebuddy_onboarding_complete', '1');
    onClose();
  };

  const currentStageLabel = pipelineState?.stages.find((s) => s.status === 'running')?.label || '';

  const pipelineProgressDisplay = pipelineState
    ? Math.round(pipelineState.overallProgress)
    : 0;

  const pipelineIsAtIndexing = pipelineState?.stages.some(
    (s) => s.id === 'indexing' && (s.status === 'running' || s.status === 'pending')
  ) || pipelineState?.currentStageId === 'indexing';

  const pipelineHasResults =
    pipelineState && pipelineState.status !== 'idle' && pipelineState.status !== 'running';

  const renderProgressBar = () => (
    <div className="flex items-center gap-1 px-6 pt-6">
      {STEPS.map((s, i) => (
        <React.Fragment key={s.num}>
          {i > 0 && (
            <div className="flex-1 h-0.5 rounded-full bg-slate-700/50 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  step > s.num ? 'bg-gold-500' : 'bg-transparent'
                }`}
              />
            </div>
          )}
          <button
            onClick={() => {
              if (s.num < step || (s.num === step)) setStep(s.num);
            }}
            disabled={s.num > step}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-semibold transition-all duration-300 ${
              step === s.num
                ? 'bg-gold-500/20 text-gold-400 border border-gold-500/30'
                : step > s.num
                  ? 'bg-gold-500/10 text-gold-500/60 border border-gold-500/20'
                  : 'bg-slate-800/50 text-slate-600 border border-slate-700/30'
            }`}
          >
            <span
              className={`flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold ${
                step > s.num
                  ? 'bg-gold-500 text-slate-950'
                  : step === s.num
                    ? 'bg-gold-500 text-slate-950'
                    : 'bg-slate-700 text-slate-500'
              }`}
            >
              {step > s.num ? <CheckCircle2 size={12} /> : s.num}
            </span>
            <span className="hidden sm:inline">{s.label}</span>
          </button>
        </React.Fragment>
      ))}
    </div>
  );

  const renderStep1 = () => (
    <div className="px-8 pb-8">
      <div className="text-center mb-8">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gold-500/10 border border-gold-500/20 mb-4">
          <Gavel size={32} className="text-gold-500" />
        </div>
        <h2 className="text-2xl font-bold text-white font-serif mb-2">Create Your First Case</h2>
        <p className="text-slate-400">Every great case starts here</p>
      </div>

      <div className="space-y-4 max-w-lg mx-auto">
        <div>
          <label className="block text-sm font-semibold text-slate-300 mb-1.5">Case Title</label>
          <input
            type="text"
            value={caseTitle}
            onChange={(e) => setCaseTitle(e.target.value)}
            placeholder="e.g. Smith v. Johnson"
            className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:border-gold-500/50 focus:outline-none focus:ring-1 focus:ring-gold-500/25 transition-colors"
          />
        </div>

        <div>
          <label className="block text-sm font-semibold text-slate-300 mb-1.5">Client Name</label>
          <input
            type="text"
            value={clientName}
            onChange={(e) => setClientName(e.target.value)}
            placeholder="e.g. Robert Smith"
            className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:border-gold-500/50 focus:outline-none focus:ring-1 focus:ring-gold-500/25 transition-colors"
          />
        </div>

        <div>
          <label className="block text-sm font-semibold text-slate-300 mb-1.5">Case Type</label>
          <select
            value={caseType}
            onChange={(e) => setCaseType(e.target.value)}
            className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:border-gold-500/50 focus:outline-none focus:ring-1 focus:ring-gold-500/25 transition-colors appearance-none"
            style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2364748b' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`,
              backgroundRepeat: 'no-repeat',
              backgroundPosition: 'right 1rem center',
              paddingRight: '2.5rem',
            }}
          >
            <option value="" className="bg-slate-900 text-slate-400">
              Select case type...
            </option>
            {CASE_TYPES.map((t) => (
              <option key={t} value={t} className="bg-slate-900 text-white">
                {t}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-semibold text-slate-300 mb-1.5">Summary</label>
          <textarea
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            placeholder="Brief description of the matter..."
            rows={4}
            className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:border-gold-500/50 focus:outline-none focus:ring-1 focus:ring-gold-500/25 transition-colors resize-none"
          />
        </div>

        <div>
          <label className="block text-sm font-semibold text-slate-300 mb-1.5">
            Next Court Date <span className="text-slate-600 font-normal">(optional)</span>
          </label>
          <input
            type="date"
            value={nextCourtDate}
            onChange={(e) => setNextCourtDate(e.target.value)}
            className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:border-gold-500/50 focus:outline-none focus:ring-1 focus:ring-gold-500/25 transition-colors [color-scheme:dark]"
          />
        </div>
      </div>

      <div className="flex items-center justify-between mt-8 max-w-lg mx-auto">
        <button
          onClick={onClose}
          className="text-slate-500 hover:text-slate-400 text-sm transition-colors"
        >
          Close
        </button>
        <button
          onClick={handleCreateCase}
          disabled={!canAdvanceStep1 || creating}
          className={`flex items-center gap-2 px-6 py-3 rounded-xl font-bold text-sm transition-all ${
            canAdvanceStep1 && !creating
              ? 'bg-gold-500 hover:bg-gold-400 text-slate-950 shadow-lg shadow-gold-500/20'
              : 'bg-slate-800 text-slate-600 cursor-not-allowed'
          }`}
        >
          {creating ? (
            <>
              <Loader2 size={16} className="animate-spin" />
              Creating...
            </>
          ) : (
            <>
              Next
              <ChevronRight size={16} />
            </>
          )}
        </button>
      </div>
    </div>
  );

  const renderStep2 = () => (
    <div className="px-8 pb-8">
      <div className="text-center mb-8">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gold-500/10 border border-gold-500/20 mb-4">
          <Upload size={32} className="text-gold-500" />
        </div>
        <h2 className="text-2xl font-bold text-white font-serif mb-2">Upload Your Evidence</h2>
        <p className="text-slate-400">Drag and drop case files or select them</p>
      </div>

      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`relative max-w-xl mx-auto border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all duration-200 ${
          dragOver
            ? 'border-gold-500 bg-gold-500/5'
            : 'border-gold-500/30 hover:border-gold-500/60 bg-slate-800/30'
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={ACCEPT_ATTRS}
          onChange={handleFileSelect}
          className="hidden"
        />
        <Paperclip size={40} className="text-gold-500/50 mx-auto mb-3" />
        <p className="text-slate-300 font-semibold mb-1">
          {dragOver ? 'Drop files here' : 'Drop files here or click to browse'}
        </p>
        <p className="text-xs text-slate-500">
          PDFs, images, audio, video, documents, and text files accepted
        </p>
      </div>

      {files.length > 0 && (
        <div className="max-w-xl mx-auto mt-4 space-y-2">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
            {files.length} file{files.length !== 1 ? 's' : ''} selected
          </p>
          <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1">
            {files.map((file, i) => (
              <div
                key={`${file.name}-${i}`}
                className="flex items-center gap-3 p-2.5 bg-slate-800/60 border border-slate-700/40 rounded-lg group"
              >
                {getFileIcon(file)}
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white truncate">{file.name}</p>
                  <p className="text-xs text-slate-500">{formatBytes(file.size)}</p>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    removeFile(i);
                  }}
                  className="p-1 text-slate-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all"
                >
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex items-center justify-between mt-8 max-w-xl mx-auto">
        <button
          onClick={() => setStep(1)}
          className="flex items-center gap-1 text-slate-500 hover:text-slate-400 text-sm transition-colors"
        >
          <ChevronLeft size={14} />
          Back
        </button>
        <div className="flex items-center gap-4">
          <button
            onClick={handleAdvanceToStep3}
            className="text-sm text-slate-500 hover:text-slate-400 transition-colors"
          >
            Skip for now
          </button>
          <button
            onClick={handleAdvanceToStep3}
            className="flex items-center gap-2 px-6 py-3 rounded-xl font-bold text-sm bg-gold-500 hover:bg-gold-400 text-slate-950 shadow-lg shadow-gold-500/20 transition-all"
          >
            Next
            <ChevronRight size={16} />
          </button>
        </div>
      </div>
    </div>
  );

  const renderStep3 = () => (
    <div className="px-8 pb-8">
      <div className="text-center mb-8">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gold-500/10 border border-gold-500/20 mb-4">
          <BrainCircuit
            size={32}
            className={`text-gold-500 ${pipelineRunning ? 'animate-pulse' : ''}`}
          />
        </div>
        <h2 className="text-2xl font-bold text-white font-serif mb-2">Let CaseBuddy Work</h2>
        <p className="text-slate-400">
          Our AI will analyze everything and produce a comprehensive briefing
        </p>
      </div>

      {!pipelineRunning && !pipelineState ? (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 max-w-xl mx-auto mb-8">
            {PIPELINE_INFO_CARDS.map((card) => (
              <div
                key={card.label}
                className="p-3 bg-slate-800/50 border border-slate-700/30 rounded-xl text-center"
              >
                <div className="text-2xl mb-1">{card.icon}</div>
                <p className="text-xs font-semibold text-white mb-0.5">{card.label}</p>
                <p className="text-[10px] text-slate-500 leading-tight">{card.desc}</p>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between max-w-xl mx-auto">
            <button
              onClick={() => setStep(2)}
              className="flex items-center gap-1 text-slate-500 hover:text-slate-400 text-sm transition-colors"
            >
              <ChevronLeft size={14} />
              Back
            </button>
            <div className="flex items-center gap-4">
              <button
                onClick={handleSkipPipeline}
                className="text-sm text-slate-500 hover:text-slate-400 transition-colors"
              >
                Skip for now
              </button>
              <button
                onClick={handleStartPipeline}
                className="flex items-center gap-2 px-6 py-3 rounded-xl font-bold text-sm bg-gold-500 hover:bg-gold-400 text-slate-950 shadow-lg shadow-gold-500/20 transition-all"
              >
                <Zap size={16} />
                Start Pipeline
              </button>
            </div>
          </div>
        </>
      ) : (
        <>
          <div className="max-w-md mx-auto mb-8">
            <div className="text-center mb-4">
              <Loader2 size={40} className="text-gold-500 animate-spin mx-auto mb-3" />
              {currentStageLabel && (
                <p className="text-sm font-semibold text-gold-400">{currentStageLabel}</p>
              )}
              <p className="text-xs text-slate-500 mt-1">
                {pipelineProgressDisplay}% complete
              </p>
            </div>

            <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-gold-600 to-gold-400 rounded-full transition-all duration-700 ease-out"
                style={{ width: `${pipelineProgressDisplay}%` }}
              />
            </div>
          </div>

          {pipelineState && (
            <div className="max-w-md mx-auto space-y-1.5 mb-8 max-h-48 overflow-y-auto pr-1">
              {pipelineState.stages.slice(0, 8).map((stage) => (
                <div
                  key={stage.id}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs"
                >
                  {stage.status === 'running' && (
                    <Loader2 size={12} className="text-gold-500 animate-spin shrink-0" />
                  )}
                  {stage.status === 'completed' && (
                    <CheckCircle2 size={12} className="text-green-400 shrink-0" />
                  )}
                  {stage.status === 'error' && (
                    <X size={12} className="text-red-400 shrink-0" />
                  )}
                  {stage.status === 'pending' && (
                    <div className="w-3 h-3 rounded-full border border-slate-600 shrink-0" />
                  )}
                  {stage.status === 'skipped' && (
                    <div className="w-3 h-3 rounded-full border border-slate-800 shrink-0" />
                  )}
                  <span
                    className={`truncate ${
                      stage.status === 'running'
                        ? 'text-gold-400'
                        : stage.status === 'completed'
                          ? 'text-slate-400'
                          : stage.status === 'error'
                            ? 'text-red-400'
                            : 'text-slate-600'
                    }`}
                  >
                    {stage.label}
                  </span>
                </div>
              ))}
              {pipelineState.stages.length > 8 && (
                <p className="text-xs text-slate-600 text-center pt-1">
                  +{pipelineState.stages.length - 8} more stages...
                </p>
              )}
            </div>
          )}

          <div className="flex items-center justify-between max-w-xl mx-auto">
            <button
              onClick={() => setStep(2)}
              className="flex items-center gap-1 text-slate-500 hover:text-slate-400 text-sm transition-colors"
            >
              <ChevronLeft size={14} />
              Back
            </button>
            <button
              onClick={handleSkipPipeline}
              className="flex items-center gap-2 px-6 py-3 rounded-xl font-bold text-sm bg-gold-500 hover:bg-gold-400 text-slate-950 shadow-lg shadow-gold-500/20 transition-all"
            >
              Continue
              <ArrowRight size={16} />
            </button>
          </div>
        </>
      )}
    </div>
  );

  const renderStep4 = () => {
    const filesCount = files.length;
    const pipelineStatusLabel = pipelineSkippedRef.current
      ? 'Skipped'
      : pipelineState?.status === 'completed'
        ? 'Completed'
        : pipelineState?.status === 'error'
          ? 'Partially completed (with errors)'
          : pipelineState?.status === 'running' || pipelineRunning
            ? 'Running in background'
            : 'Not started';

    const pipelineStatusColor =
      pipelineSkippedRef.current || (!pipelineState && !pipelineRunning)
        ? 'text-slate-400'
        : pipelineState?.status === 'completed'
          ? 'text-green-400'
          : pipelineState?.status === 'error'
            ? 'text-amber-400'
            : 'text-gold-400';

    return (
      <div className="px-8 pb-8">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-green-500/10 border border-green-500/20 mb-4">
            <Star size={32} className="text-green-400" />
          </div>
          <h2 className="text-2xl font-bold text-white font-serif mb-2">You're All Set!</h2>
          <p className="text-slate-400">CaseBuddy is now working on your case</p>
        </div>

        <div className="max-w-md mx-auto bg-slate-800/50 border border-slate-700/30 rounded-2xl p-6 mb-8">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-400">Case</span>
              <span className="text-sm font-bold text-white">{caseTitle || 'Untitled'}</span>
            </div>
            <div className="border-t border-slate-700/30" />
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-400">Files Uploaded</span>
              <span className="text-sm font-bold text-white">
                {filesCount} file{filesCount !== 1 ? 's' : ''}
              </span>
            </div>
            <div className="border-t border-slate-700/30" />
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-400">Pipeline Status</span>
              <span className={`text-sm font-bold ${pipelineStatusColor}`}>
                {pipelineStatusLabel}
              </span>
            </div>
          </div>
        </div>

        <div className="max-w-md mx-auto space-y-2 mb-8">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
            Quick Links
          </p>

          <button
            onClick={() => {
              handleFinish();
              navigate('/app');
            }}
            className="w-full flex items-center gap-3 p-3 bg-slate-800/50 border border-slate-700/30 rounded-xl hover:border-gold-500/30 transition-all group text-left"
          >
            <div className="w-8 h-8 rounded-lg bg-gold-500/10 flex items-center justify-center">
              <Shield size={16} className="text-gold-500" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-white group-hover:text-gold-400 transition-colors">
                View Case Dashboard
              </p>
              <p className="text-xs text-slate-500">Monitor your case and AI activity</p>
            </div>
            <ArrowRight size={14} className="text-slate-600 group-hover:text-gold-400 transition-colors" />
          </button>

          {pipelineHasResults && (
            <button
              onClick={() => {
                handleFinish();
                navigate('/app/mapper');
              }}
              className="w-full flex items-center gap-3 p-3 bg-slate-800/50 border border-slate-700/30 rounded-xl hover:border-gold-500/30 transition-all group text-left"
            >
              <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center">
                <BrainCircuit size={16} className="text-blue-400" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-white group-hover:text-gold-400 transition-colors">
                  See Evidence Mapper
                </p>
                <p className="text-xs text-slate-500">
                  Explore document relationships and timeline
                </p>
              </div>
              <ArrowRight
                size={14}
                className="text-slate-600 group-hover:text-gold-400 transition-colors"
              />
            </button>
          )}

          <button
            onClick={() => {
              handleFinish();
              navigate('/app/cases');
            }}
            className="w-full flex items-center gap-3 p-3 bg-slate-800/50 border border-slate-700/30 rounded-xl hover:border-gold-500/30 transition-all group text-left"
          >
            <div className="w-8 h-8 rounded-lg bg-purple-500/10 flex items-center justify-center">
              <FileText size={16} className="text-purple-400" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-white group-hover:text-gold-400 transition-colors">
                View Case Files
              </p>
              <p className="text-xs text-slate-500">Manage all your cases and documents</p>
            </div>
            <ArrowRight size={14} className="text-slate-600 group-hover:text-gold-400 transition-colors" />
          </button>
        </div>

        <div className="flex items-center justify-between max-w-md mx-auto">
          <button
            onClick={() => setStep(3)}
            className="flex items-center gap-1 text-slate-500 hover:text-slate-400 text-sm transition-colors"
          >
            <ChevronLeft size={14} />
            Back
          </button>
          <button
            onClick={handleFinish}
            className="flex items-center gap-2 px-6 py-3 rounded-xl font-bold text-sm bg-gold-500 hover:bg-gold-400 text-slate-950 shadow-lg shadow-gold-500/20 transition-all"
          >
            <CheckCircle2 size={16} />
            Finish Setup
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 bg-slate-950/95 backdrop-blur-sm z-[110] flex items-center justify-center p-4">
      <div className="w-full max-w-2xl bg-slate-900 border border-slate-700/50 rounded-2xl shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          {renderProgressBar()}
          <button
            onClick={onClose}
            className="p-1.5 mr-6 mt-6 text-slate-500 hover:text-white transition-colors rounded-lg hover:bg-slate-800 shrink-0"
          >
            <X size={18} />
          </button>
        </div>

        <div className="py-6">
          {step === 1 && renderStep1()}
          {step === 2 && renderStep2()}
          {step === 3 && renderStep3()}
          {step === 4 && renderStep4()}
        </div>
      </div>
    </div>
  );
};

export default OnboardingWizard;
