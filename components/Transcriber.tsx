import React, { useState, useContext, useEffect, useRef, useCallback } from 'react';
import { AppContext } from '../App';
import { Transcription } from '../types';
import {
  Mic, Upload, Trash2, Download, Tag, FileAudio, Clock, Users, Save,
  Edit2, X, FileImage, FileText, Brain, ChevronDown, ChevronUp, AlertCircle,
  CheckCircle, Loader, Zap, Eye, Radio, Square
} from 'lucide-react';
import { toast } from 'react-toastify';
import { performOCR, analyzeTranscription } from '../services/geminiService';
import { transcribeWithDeeepgram, startDeepgramLiveSession } from '../services/integrationService';
import AgentHeader from './AgentHeader';
import { OPERATIONAL_AGENTS } from '../agents/personas';

const MAX = OPERATIONAL_AGENTS.find(a => a.id === 'max')!;

// ── Groq Whisper transcription helper ────────────────────────────────────────
async function transcribeWithGroq(file: File): Promise<string> {
  const groqKey = (import.meta as any).env?.VITE_GROQ_API_KEY || '';
  if (!groqKey) throw new Error('VITE_GROQ_API_KEY not configured. Add it in Settings or Vercel env vars.');

  const formData = new FormData();
  formData.append('file', file, file.name);
  formData.append('model', 'whisper-large-v3');
  formData.append('response_format', 'text');

  const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + groqKey },
    body: formData,
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error('Groq Whisper error: ' + err);
  }
  return res.text();
}

const DEEPGRAM_KEY_PRESENT = !!(import.meta as any).env?.VITE_DEEPGRAM_API_KEY;

type FileMode = 'audio' | 'ocr';
type TranscriptionEngine = 'gemini' | 'deepgram';

interface TranscriptionWithAnalysis extends Transcription {
  analysis?: {
    summary: string;
    keyPoints: string[];
    legalIssues: string[];
    speakers: string[];
    actionItems: string[];
  };
}

const Transcriber = () => {
  const { activeCase } = useContext(AppContext);
  const [transcriptions, setTranscriptions] = useState<TranscriptionWithAnalysis[]>([]);
  const [fileMode, setFileMode] = useState<FileMode>('audio');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedTranscription, setSelectedTranscription] = useState<TranscriptionWithAnalysis | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editedText, setEditedText] = useState('');
  const [editedNotes, setEditedNotes] = useState('');
  const [newTags, setNewTags] = useState('');
  const [showAnalysis, setShowAnalysis] = useState(true);
  const [progress, setProgress] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Deepgram engine toggle
  const [engine, setEngine] = useState<TranscriptionEngine>('deepgram');

  // Live transcription state
  const [isLive, setIsLive] = useState(false);
  const [liveText, setLiveText] = useState('');
  const liveStopRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (activeCase) {
      const saved = localStorage.getItem(`transcriptions_${activeCase.id}`);
      setTranscriptions(saved ? JSON.parse(saved) : []);
    }
  }, [activeCase]);

  const saveTranscriptions = (updated: TranscriptionWithAnalysis[]) => {
    if (activeCase) {
      localStorage.setItem(`transcriptions_${activeCase.id}`, JSON.stringify(updated));
      setTranscriptions(updated);
    }
  };

  const AUDIO_TYPES = ['audio/mpeg', 'audio/wav', 'audio/mp3', 'audio/m4a', 'audio/ogg', 'audio/webm', 'audio/x-m4a', 'video/mp4', 'video/webm', 'video/quicktime', 'video/x-msvideo', 'video/mpeg'];
  const AUDIO_EXTS = /\.(mp3|wav|m4a|ogg|webm|aac|flac|mp4|mov|avi|mkv|wmv)$/i;
  const OCR_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/bmp', 'image/tiff', 'application/pdf'];
  const OCR_EXTS = /\.(jpg|jpeg|png|gif|webp|bmp|tiff|tif|pdf)$/i;

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const isAudio = AUDIO_TYPES.includes(file.type) || AUDIO_EXTS.test(file.name);
    const isOCR = OCR_TYPES.includes(file.type) || OCR_EXTS.test(file.name);

    if (!isAudio && !isOCR) {
      toast.error('Unsupported file. Use audio (MP3, WAV, M4A) or image/document (JPG, PNG, PDF).');
      return;
    }
    if (file.size > 100 * 1024 * 1024) {
      toast.error('File must be under 100MB.');
      return;
    }

    const detectedMode: FileMode = isAudio ? 'audio' : 'ocr';
    setFileMode(detectedMode);
    setSelectedFile(file);
    toast.info(`${detectedMode === 'audio' ? '🎵 Audio' : '📄 Document/Image'} selected: ${file.name}`);
  };

  const processFile = async () => {
    if (!selectedFile || !activeCase) {
      toast.error('Please select a file and ensure a case is active.');
      return;
    }

    setIsProcessing(true);
    setProgress(fileMode === 'audio' ? 'Preparing transcription...' : 'Extracting text via OCR...');

    try {
      let extractedText = '';

      if (fileMode === 'audio') {
        const isVideo = selectedFile.type.startsWith('video/') || /\.(mp4|mov|avi|mkv|wmv)$/i.test(selectedFile.name);
        const mediaLabel = isVideo ? 'video' : 'audio';
        if (engine === 'deepgram') {
          setProgress(`Transcribing ${mediaLabel} via Deepgram — this may take a moment...`);
          try {
            extractedText = await transcribeWithDeeepgram(selectedFile, selectedFile.name);
          } catch (deepgramErr) {
            toast.error('Deepgram failed — falling back to Groq Whisper.');
            setProgress('Falling back to Groq Whisper transcription...');
            extractedText = await transcribeWithGroq(selectedFile);
          }
        } else {
          setProgress(`Transcribing ${mediaLabel} via Groq Whisper — this may take a moment...`);
          extractedText = await transcribeWithGroq(selectedFile);
        }
      } else {
        setProgress('Running OCR on document/image...');
        extractedText = await performOCR(selectedFile);
      }

      if (!extractedText.trim()) {
        throw new Error('No text could be extracted from this file.');
      }

      setProgress('Running AI legal analysis...');
      let analysis;
      try {
        analysis = await analyzeTranscription(
          extractedText,
          activeCase.summary || activeCase.title,
          selectedFile.name
        );
      } catch {
        analysis = undefined;
      }

      const newRecord: TranscriptionWithAnalysis = {
        id: Date.now().toString(),
        caseId: activeCase.id,
        fileName: selectedFile.name,
        text: extractedText,
        timestamp: Date.now(),
        tags: analysis?.legalIssues?.slice(0, 2).map(i => i.substring(0, 20)) || [],
        notes: '',
        speakers: analysis?.speakers || [],
        analysis,
      };

      const updated = [newRecord, ...transcriptions];
      saveTranscriptions(updated);
      setSelectedTranscription(newRecord);
      setShowAnalysis(true);
      toast.success(`${fileMode === 'audio' ? 'Transcription' : 'OCR'} complete with AI analysis!`);
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (error) {
      console.error('Processing error:', error);
      toast.error(error instanceof Error ? error.message : 'Processing failed. Please try again.');
    } finally {
      setIsProcessing(false);
      setProgress('');
    }
  };

  const runAnalysis = async (t: TranscriptionWithAnalysis) => {
    if (!activeCase) return;
    setIsAnalyzing(true);
    try {
      const analysis = await analyzeTranscription(t.text, activeCase.summary || activeCase.title, t.fileName);
      const updated = transcriptions.map(x => x.id === t.id ? { ...x, analysis } : x);
      saveTranscriptions(updated);
      const updatedT = { ...t, analysis };
      setSelectedTranscription(updatedT);
      setShowAnalysis(true);
      toast.success('AI analysis complete!');
    } catch (error) {
      toast.error('Analysis failed. Please try again.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const startLiveTranscription = useCallback(() => {
    setLiveText('');
    try {
      const session = startDeepgramLiveSession((chunk: string) => {
        setLiveText(prev => prev ? `${prev} ${chunk}` : chunk);
      });
      liveStopRef.current = session.stop;
      setIsLive(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to start live transcription.');
    }
  }, []);

  const stopLiveTranscription = useCallback(() => {
    if (liveStopRef.current) {
      liveStopRef.current();
      liveStopRef.current = null;
    }
    setIsLive(false);

    if (!activeCase || !liveText.trim()) {
      if (!liveText.trim()) toast.info('No live transcript captured.');
      return;
    }

    const newRecord: TranscriptionWithAnalysis = {
      id: Date.now().toString(),
      caseId: activeCase.id,
      fileName: `Live Recording ${new Date().toLocaleString()}`,
      text: liveText.trim(),
      timestamp: Date.now(),
      tags: ['live', 'deepgram'],
      notes: '',
      speakers: [],
    };

    const updated = [newRecord, ...transcriptions];
    saveTranscriptions(updated);
    setSelectedTranscription(newRecord);
    setShowAnalysis(true);
    setLiveText('');
    toast.success('Live transcript saved!');
  }, [activeCase, liveText, transcriptions]);

  const deleteTranscription = (id: string) => {
    if (!window.confirm('Delete this transcription?')) return;
    const updated = transcriptions.filter(t => t.id !== id);
    saveTranscriptions(updated);
    if (selectedTranscription?.id === id) setSelectedTranscription(null);
    toast.success('Deleted.');
  };

  const startEditing = (t: TranscriptionWithAnalysis) => {
    setSelectedTranscription(t);
    setEditedText(t.text);
    setEditedNotes(t.notes || '');
    setNewTags(t.tags?.join(', ') || '');
    setIsEditing(true);
  };

  const saveEdits = () => {
    if (!selectedTranscription) return;
    const updated = transcriptions.map(t =>
      t.id === selectedTranscription.id
        ? { ...t, text: editedText, notes: editedNotes, tags: newTags.split(',').map(s => s.trim()).filter(Boolean) }
        : t
    );
    saveTranscriptions(updated);
    const found = updated.find(t => t.id === selectedTranscription.id);
    setSelectedTranscription(found || null);
    setIsEditing(false);
    toast.success('Saved.');
  };

  const downloadTranscription = (t: TranscriptionWithAnalysis) => {
    const lines = [
      `TRANSCRIPTION: ${t.fileName}`,
      `Case: ${activeCase?.title || 'N/A'}`,
      `Date: ${new Date(t.timestamp).toLocaleString()}`,
      `Tags: ${t.tags?.join(', ') || 'None'}`,
      '',
    ];
    if (t.analysis) {
      lines.push('=== AI ANALYSIS ===');
      lines.push(`Summary: ${t.analysis.summary}`);
      lines.push('');
      lines.push('Key Points:');
      t.analysis.keyPoints.forEach(p => lines.push(`  • ${p}`));
      lines.push('');
      lines.push('Legal Issues:');
      t.analysis.legalIssues.forEach(i => lines.push(`  ⚠ ${i}`));
      lines.push('');
      lines.push('Action Items:');
      t.analysis.actionItems.forEach(a => lines.push(`  → ${a}`));
      lines.push('');
      lines.push('===================');
      lines.push('');
    }
    if (t.notes) { lines.push('NOTES:'); lines.push(t.notes); lines.push(''); }
    lines.push('TRANSCRIPT:');
    lines.push(t.text);

    const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${t.fileName.replace(/\.[^.]+$/, '')}_transcript.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success('Downloaded.');
  };

  if (!activeCase) {
    return (
      <div className="min-h-screen bg-slate-900 p-8 flex items-center justify-center">
        <div className="text-center">
          <FileAudio className="mx-auto mb-4 text-slate-500" size={64} />
          <h2 className="text-2xl font-bold text-white mb-2">No Active Case</h2>
          <p className="text-slate-400">Select a case to use the transcriber.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900 p-4 sm:p-6 md:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        <AgentHeader agent={MAX} compact />
        {/* Header */}
        <div>
          <div className="flex items-center gap-3 mb-1">
            <Mic className="text-gold-500" size={32} />
            <h1 className="text-3xl font-bold text-white font-serif">Transcriber & OCR</h1>
          </div>
          <p className="text-slate-400">
            AI-powered audio transcription, document OCR, and legal analysis for{' '}
            <span className="text-gold-400 font-semibold">{activeCase.title}</span>
          </p>
        </div>

        {/* Upload Panel */}
        <div className="bg-slate-800/60 border border-slate-700 rounded-xl p-6">
          <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
            <Upload size={18} /> Upload File
          </h2>

          {/* Mode Toggle */}
          <div className="flex gap-2 mb-4">
            <button
              onClick={() => setFileMode('audio')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                fileMode === 'audio' ? 'bg-gold-600 text-slate-900' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
              }`}
            >
              <FileAudio size={16} /> Audio Transcription
            </button>
            <button
              onClick={() => setFileMode('ocr')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                fileMode === 'ocr' ? 'bg-gold-600 text-slate-900' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
              }`}
            >
              <Eye size={16} /> OCR (Image / Document)
            </button>
          </div>

          {/* Transcription Engine Toggle — audio mode only */}
          {fileMode === 'audio' && (
            <div className="mb-4">
              <div className="flex items-center gap-3 flex-wrap">
                <span className="text-sm text-slate-400 font-medium">Transcription Engine:</span>
                <div className="flex gap-1 bg-slate-900/60 border border-slate-700 rounded-lg p-1">
                  <button
                    onClick={() => setEngine('gemini')}
                    className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                      engine === 'gemini'
                        ? 'bg-blue-600 text-white shadow'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Gemini AI
                  </button>
                  {DEEPGRAM_KEY_PRESENT ? (
                    <button
                      onClick={() => setEngine('deepgram')}
                      className={`flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                        engine === 'deepgram'
                          ? 'bg-emerald-600 text-white shadow'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      Deepgram {engine === 'deepgram' && <CheckCircle size={11} />}
                    </button>
                  ) : (
                    <span className="px-3 py-1.5 text-xs text-slate-600 cursor-not-allowed select-none">
                      Deepgram (locked)
                    </span>
                  )}
                </div>
              </div>
              {!DEEPGRAM_KEY_PRESENT && (
                <p className="mt-1.5 text-xs text-slate-500 flex items-center gap-1">
                  <AlertCircle size={11} className="text-amber-500 shrink-0" />
                  Add <code className="text-amber-400 font-mono">VITE_DEEPGRAM_API_KEY</code> to unlock Deepgram (better accuracy for depositions)
                </p>
              )}
            </div>
          )}

          <div className="space-y-3">
            <label className="block">
              <span className="text-sm text-slate-400 mb-1 block">
                {fileMode === 'audio'
                  ? 'Audio file: MP3, WAV, M4A, OGG, WebM (max 100MB)'
                  : 'Image or document: JPG, PNG, PDF, TIFF, WebP (max 100MB)'}
              </span>
              <input
                ref={fileInputRef}
                type="file"
                accept={fileMode === 'audio' ? 'audio/*,video/*,.mp4,.mov,.avi,.mkv,.wmv,.webm' : 'image/*,.pdf'}
                onChange={handleFileSelect}
                className="block w-full text-slate-300 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-gold-500 file:text-slate-900 hover:file:bg-gold-600 file:cursor-pointer bg-slate-700/50 border border-slate-600 rounded-lg cursor-pointer"
              />
            </label>

            {selectedFile && (
              <div className="flex items-center justify-between bg-slate-700/50 border border-slate-600 rounded-lg p-3">
                <div className="flex items-center gap-3">
                  {fileMode === 'audio' ? <FileAudio className="text-gold-400" size={20} /> : <FileImage className="text-blue-400" size={20} />}
                  <div>
                    <p className="text-white text-sm font-medium">{selectedFile.name}</p>
                    <p className="text-slate-400 text-xs">{(selectedFile.size / 1024 / 1024).toFixed(2)} MB</p>
                  </div>
                </div>
                <button onClick={() => setSelectedFile(null)} className="text-slate-500 hover:text-red-400">
                  <X size={18} />
                </button>
              </div>
            )}

            {isProcessing && (
              <div className="flex items-center gap-3 bg-blue-900/20 border border-blue-700/30 rounded-lg p-3">
                <Loader className="animate-spin text-blue-400" size={18} />
                <p className="text-blue-200 text-sm">{progress}</p>
              </div>
            )}

            <button
              onClick={processFile}
              disabled={!selectedFile || isProcessing}
              className="w-full bg-gold-500 hover:bg-gold-600 disabled:bg-slate-700 disabled:text-slate-500 text-slate-900 font-bold py-3 rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              {isProcessing ? (
                <><Loader className="animate-spin" size={18} /> Processing...</>
              ) : fileMode === 'audio' ? (
                <><Mic size={18} /> Transcribe Audio</>
              ) : (
                <><Eye size={18} /> Extract Text (OCR)</>
              )}
            </button>
          </div>

          {/* Live Transcription — Deepgram only */}
          {fileMode === 'audio' && engine === 'deepgram' && DEEPGRAM_KEY_PRESENT && (
            <div className="mt-4 border-t border-slate-700 pt-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {isLive && (
                    <span className="relative flex h-3 w-3">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                      <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500" />
                    </span>
                  )}
                  <span className="text-sm font-semibold text-white">
                    {isLive ? 'Live Recording...' : 'Live Transcription'}
                  </span>
                </div>
                <button
                  onClick={isLive ? stopLiveTranscription : startLiveTranscription}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all ${
                    isLive
                      ? 'bg-red-600 hover:bg-red-700 text-white'
                      : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                  }`}
                >
                  {isLive ? (
                    <><Square size={14} /> Stop Recording</>
                  ) : (
                    <><Radio size={14} /> Start Live</>
                  )}
                </button>
              </div>

              {(isLive || liveText) && (
                <div className="bg-slate-900/70 border border-slate-600 rounded-lg p-3 min-h-[80px] max-h-48 overflow-y-auto">
                  {liveText ? (
                    <p className="text-slate-200 text-sm whitespace-pre-wrap leading-relaxed">{liveText}</p>
                  ) : (
                    <p className="text-slate-500 text-sm italic animate-pulse">Listening... speak now</p>
                  )}
                </div>
              )}

              {isLive && liveText && (
                <p className="text-xs text-slate-500">
                  Click "Stop Recording" to save the transcript to this case.
                </p>
              )}
            </div>
          )}

          <p className="mt-3 text-xs text-slate-500">
            {engine === 'deepgram' && fileMode === 'audio'
              ? 'Powered by Deepgram nova-2 · Audio sent directly to Deepgram API'
              : 'Powered by Gemini AI · All processing is direct — no data leaves the Gemini API'}
          </p>
        </div>

        {/* Main Content */}
        <div className="grid lg:grid-cols-5 gap-6">

          {/* List — left 2 cols */}
          <div className="lg:col-span-2 space-y-3">
            <h2 className="text-lg font-bold text-white">
              Transcriptions ({transcriptions.length})
            </h2>

            {transcriptions.length === 0 ? (
              <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-8 text-center">
                <FileAudio className="mx-auto mb-3 text-slate-600" size={40} />
                <p className="text-slate-400 text-sm">No transcriptions yet.</p>
                <p className="text-slate-500 text-xs mt-1">Upload a file above to get started.</p>
              </div>
            ) : (
              transcriptions.map(t => (
                <div
                  key={t.id}
                  onClick={() => { setSelectedTranscription(t); setIsEditing(false); }}
                  className={`cursor-pointer bg-slate-800/50 border rounded-xl p-4 transition-all ${
                    selectedTranscription?.id === t.id
                      ? 'border-gold-500 shadow-lg shadow-gold-500/10'
                      : 'border-slate-700 hover:border-slate-600'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        {t.fileName.match(AUDIO_EXTS) ? (
                          <FileAudio size={14} className="text-gold-400 shrink-0" />
                        ) : (
                          <FileImage size={14} className="text-blue-400 shrink-0" />
                        )}
                        <h3 className="text-white text-sm font-semibold truncate">{t.fileName}</h3>
                      </div>
                      <p className="text-slate-500 text-xs flex items-center gap-1 mb-2">
                        <Clock size={11} /> {new Date(t.timestamp).toLocaleString()}
                      </p>
                      {t.analysis && (
                        <div className="flex items-center gap-1 mb-2">
                          <Zap size={11} className="text-gold-400" />
                          <span className="text-gold-400 text-xs font-semibold">AI Analyzed</span>
                        </div>
                      )}
                      {t.tags && t.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {t.tags.slice(0, 3).map((tag, i) => (
                            <span key={i} className="px-2 py-0.5 bg-gold-900/30 text-gold-400 text-xs rounded-full">
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <button
                      onClick={e => { e.stopPropagation(); deleteTranscription(t.id); }}
                      className="text-slate-600 hover:text-red-400 transition-colors shrink-0"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                  <p className="text-slate-400 text-xs mt-2 line-clamp-2">{t.text.substring(0, 100)}...</p>
                </div>
              ))
            )}
          </div>

          {/* Detail — right 3 cols */}
          <div className="lg:col-span-3">
            {selectedTranscription ? (
              <div className="bg-slate-800/50 border border-slate-700 rounded-xl overflow-hidden sticky top-4">
                {/* Detail Header */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700">
                  <h2 className="text-lg font-bold text-white truncate">{selectedTranscription.fileName}</h2>
                  <button onClick={() => setSelectedTranscription(null)} className="text-slate-400 hover:text-white">
                    <X size={18} />
                  </button>
                </div>

                <div className="p-5 space-y-5 max-h-[80vh] overflow-y-auto">

                  {/* AI Analysis Panel */}
                  {selectedTranscription.analysis ? (
                    <div className="bg-slate-900/60 border border-gold-700/40 rounded-xl overflow-hidden">
                      <button
                        onClick={() => setShowAnalysis(v => !v)}
                        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-slate-800/50 transition-colors"
                      >
                        <div className="flex items-center gap-2">
                          <Brain size={16} className="text-gold-400" />
                          <span className="text-gold-400 font-bold text-sm">AI Legal Analysis</span>
                        </div>
                        {showAnalysis ? <ChevronUp size={16} className="text-gold-400" /> : <ChevronDown size={16} className="text-gold-400" />}
                      </button>

                      {showAnalysis && (
                        <div className="px-4 pb-4 space-y-4 border-t border-slate-700/50">
                          {/* Summary */}
                          <div className="pt-3">
                            <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Summary</p>
                            <p className="text-slate-200 text-sm leading-relaxed">{selectedTranscription.analysis.summary}</p>
                          </div>

                          {/* Key Points */}
                          {selectedTranscription.analysis.keyPoints?.length > 0 && (
                            <div>
                              <p className="text-xs text-blue-400 uppercase tracking-wider mb-2 flex items-center gap-1">
                                <CheckCircle size={11} /> Key Points
                              </p>
                              <ul className="space-y-1">
                                {selectedTranscription.analysis.keyPoints.map((p, i) => (
                                  <li key={i} className="text-slate-300 text-sm flex gap-2">
                                    <span className="text-blue-400 mt-0.5 shrink-0">•</span> {p}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}

                          {/* Legal Issues */}
                          {selectedTranscription.analysis.legalIssues?.length > 0 && (
                            <div>
                              <p className="text-xs text-red-400 uppercase tracking-wider mb-2 flex items-center gap-1">
                                <AlertCircle size={11} /> Legal Issues / Risks
                              </p>
                              <ul className="space-y-1">
                                {selectedTranscription.analysis.legalIssues.map((issue, i) => (
                                  <li key={i} className="text-slate-300 text-sm flex gap-2">
                                    <span className="text-red-400 mt-0.5 shrink-0">⚠</span> {issue}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}

                          {/* Action Items */}
                          {selectedTranscription.analysis.actionItems?.length > 0 && (
                            <div>
                              <p className="text-xs text-green-400 uppercase tracking-wider mb-2 flex items-center gap-1">
                                <Zap size={11} /> Action Items
                              </p>
                              <ul className="space-y-1">
                                {selectedTranscription.analysis.actionItems.map((a, i) => (
                                  <li key={i} className="text-slate-300 text-sm flex gap-2">
                                    <span className="text-green-400 mt-0.5 shrink-0">→</span> {a}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}

                          {/* Speakers */}
                          {selectedTranscription.analysis.speakers?.length > 0 && (
                            <div>
                              <p className="text-xs text-slate-500 uppercase tracking-wider mb-1 flex items-center gap-1">
                                <Users size={11} /> Identified Speakers
                              </p>
                              <div className="flex flex-wrap gap-2">
                                {selectedTranscription.analysis.speakers.map((s, i) => (
                                  <span key={i} className="px-2 py-0.5 bg-slate-700 text-slate-300 text-xs rounded-full">{s}</span>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ) : (
                    <button
                      onClick={() => runAnalysis(selectedTranscription)}
                      disabled={isAnalyzing}
                      className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-gold-700/20 border border-gold-700/40 text-gold-300 hover:bg-gold-700/30 rounded-xl text-sm font-semibold transition-colors disabled:opacity-50"
                    >
                      {isAnalyzing ? (
                        <><Loader className="animate-spin" size={16} /> Analyzing...</>
                      ) : (
                        <><Brain size={16} /> Run AI Legal Analysis</>
                      )}
                    </button>
                  )}

                  {/* Tags */}
                  <div>
                    <p className="text-xs text-slate-500 mb-1 flex items-center gap-1"><Tag size={11} /> Tags</p>
                    {isEditing ? (
                      <input
                        value={newTags}
                        onChange={e => setNewTags(e.target.value)}
                        placeholder="tag1, tag2, tag3"
                        className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm placeholder-slate-500 focus:outline-none focus:border-gold-500"
                      />
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {selectedTranscription.tags?.length ? selectedTranscription.tags.map((tag, i) => (
                          <span key={i} className="px-2 py-0.5 bg-gold-900/30 text-gold-400 text-xs rounded-full">{tag}</span>
                        )) : <span className="text-slate-500 text-sm">No tags</span>}
                      </div>
                    )}
                  </div>

                  {/* Notes */}
                  <div>
                    <p className="text-xs text-slate-500 mb-1">Notes</p>
                    {isEditing ? (
                      <textarea
                        value={editedNotes}
                        onChange={e => setEditedNotes(e.target.value)}
                        placeholder="Add attorney notes..."
                        rows={3}
                        className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm placeholder-slate-500 focus:outline-none focus:border-gold-500 resize-none"
                      />
                    ) : (
                      <p className="text-slate-300 text-sm">
                        {selectedTranscription.notes || <span className="text-slate-500">No notes yet.</span>}
                      </p>
                    )}
                  </div>

                  {/* Transcript */}
                  <div>
                    <p className="text-xs text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1">
                      <FileText size={11} /> Transcript
                    </p>
                    {isEditing ? (
                      <textarea
                        value={editedText}
                        onChange={e => setEditedText(e.target.value)}
                        rows={14}
                        className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm font-mono focus:outline-none focus:border-gold-500 resize-none"
                      />
                    ) : (
                      <div className="bg-slate-900/60 border border-slate-700 rounded-lg p-4 max-h-72 overflow-y-auto">
                        <p className="text-slate-200 text-sm whitespace-pre-wrap leading-relaxed">
                          {selectedTranscription.text}
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Action Buttons */}
                  <div className="flex gap-2 pt-1">
                    {isEditing ? (
                      <>
                        <button onClick={saveEdits} className="flex-1 flex items-center justify-center gap-1 bg-gold-500 hover:bg-gold-600 text-slate-900 font-semibold py-2 rounded-lg text-sm">
                          <Save size={14} /> Save
                        </button>
                        <button onClick={() => setIsEditing(false)} className="flex-1 bg-slate-700 hover:bg-slate-600 text-white font-semibold py-2 rounded-lg text-sm">
                          Cancel
                        </button>
                      </>
                    ) : (
                      <>
                        <button onClick={() => startEditing(selectedTranscription)} className="flex-1 flex items-center justify-center gap-1 bg-slate-700 hover:bg-slate-600 text-white font-semibold py-2 rounded-lg text-sm">
                          <Edit2 size={14} /> Edit
                        </button>
                        {!selectedTranscription.analysis && (
                          <button
                            onClick={() => runAnalysis(selectedTranscription)}
                            disabled={isAnalyzing}
                            className="flex-1 flex items-center justify-center gap-1 bg-gold-700/30 hover:bg-gold-700/50 border border-gold-700/40 text-gold-300 font-semibold py-2 rounded-lg text-sm disabled:opacity-50"
                          >
                            {isAnalyzing ? <Loader className="animate-spin" size={14} /> : <Brain size={14} />}
                            Analyze
                          </button>
                        )}
                        <button onClick={() => downloadTranscription(selectedTranscription)} className="flex-1 flex items-center justify-center gap-1 bg-gold-500 hover:bg-gold-600 text-slate-900 font-semibold py-2 rounded-lg text-sm">
                          <Download size={14} /> Download
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-12 text-center">
                <FileAudio className="mx-auto mb-3 text-slate-600" size={40} />
                <p className="text-slate-400">Select a transcription to view details.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Transcriber;
