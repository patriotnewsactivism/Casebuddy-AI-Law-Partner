/**
 * BulkDocumentUpload — drag-and-drop file upload with OCR + AI analysis
 * 
 * Features:
 * - Drag-and-drop or click to upload
 * - Automatic OCR via edge function (Gemini vision → Tesseract → OCR.space)
 * - AI analysis: summary, key facts, favorable/adverse findings
 * - Bates numbering with custom prefix
 * - Per-file progress tracking
 * - Document list with re-analyze capability
 */

import React, { useState, useEffect, useContext, useCallback, useRef } from 'react';
import { AppContext } from '../App';
import {
  Upload, FileText, CheckCircle, XCircle, Loader, RefreshCw,
  Trash2, Eye, Search, X, ChevronDown, ChevronUp, Sparkles,
  FileImage, FileArchive, File, AlertTriangle
} from 'lucide-react';
import {
  uploadDocument,
  bulkUploadDocuments,
  getCaseDocuments,
  reanalyzeDocument,
  deleteDocument,
  DocumentRecord,
  UploadProgress,
} from '../services/documentPipeline';
import { getSupabase } from '../services/supabaseClient';

const FILE_ICONS: Record<string, React.FC<{ size?: number; className?: string }>> = {
  'application/pdf': FileText,
  'image/': FileImage,
  'application/zip': FileArchive,
};

function getFileIcon(mimeType: string) {
  for (const [prefix, Icon] of Object.entries(FILE_ICONS)) {
    if (mimeType.startsWith(prefix)) return Icon;
  }
  return File;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const BulkDocumentUpload: React.FC = () => {
  const { cases, activeCase } = useContext(AppContext);

  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedCase, setSelectedCase] = useState<string>(activeCase?.id || '');
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<UploadProgress[]>([]);
  const [expandedDoc, setExpandedDoc] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Bates options
  const [enableBates, setEnableBates] = useState(false);
  const [batesPrefix, setBatesPrefix] = useState('');
  const [autoAnalyze, setAutoAnalyze] = useState(true);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const caseId = selectedCase || activeCase?.id;

  const loadDocuments = useCallback(async () => {
    if (!caseId) return;
    setLoading(true);
    try {
      const docs = await getCaseDocuments(caseId);
      setDocuments(docs);
    } finally {
      setLoading(false);
    }
  }, [caseId]);

  useEffect(() => { loadDocuments(); }, [loadDocuments]);

  // Realtime subscription for automatic UI updates
  useEffect(() => {
    const sb = getSupabase();
    if (!sb || !caseId) return;
    
    const channel = sb
      .channel('public:documents')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'documents' },
        () => loadDocuments()
      )
      .subscribe();
      
    return () => { sb.removeChannel(channel); };
  }, [caseId, loadDocuments]);

  // ── File handling ────────────────────────────────────────────────

  const handleFiles = async (files: FileList | File[]) => {
    if (!caseId || uploading) return;
    const fileArr = Array.from(files);
    if (fileArr.length === 0) return;

    setUploading(true);
    try {
      await bulkUploadDocuments(fileArr, {
        caseId,
        batesPrefix: enableBates ? batesPrefix : undefined,
        autoAnalyze,
        onProgress: (p) => setProgress([...p]),
      });
      // Refresh documents list
      await loadDocuments();
    } finally {
      setUploading(false);
      // Clear progress after a delay
      setTimeout(() => setProgress([]), 3000);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    handleFiles(e.dataTransfer.files);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = () => setDragOver(false);

  const handleReanalyze = async (docId: string) => {
    try {
      await reanalyzeDocument(docId);
      loadDocuments();
    } catch (err) {
      console.error('Re-analyze error:', err);
    }
  };

  const handleDelete = async (docId: string) => {
    if (!confirm('Delete this document and its file?')) return;
    await deleteDocument(docId);
    loadDocuments();
  };

  // Filter documents
  const filteredDocs = documents.filter(d => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      d.name.toLowerCase().includes(q) ||
      d.summary?.toLowerCase().includes(q) ||
      d.bates_formatted?.toLowerCase().includes(q) ||
      d.ocr_text?.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-xl font-bold text-white flex items-center gap-2">
          <Upload size={22} /> Document Upload & OCR
        </h2>
        <p className="text-gray-400 text-sm mt-1">
          Upload documents for automatic OCR processing and AI analysis
        </p>
      </div>

      {/* Case Selector */}
      {!activeCase && (
        <select
          value={selectedCase}
          onChange={(e) => { setSelectedCase(e.target.value); setDocuments([]); }}
          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm"
        >
          <option value="">— Select a case —</option>
          {cases.map((c: any) => (
            <option key={c.id} value={c.id}>{c.title || c.name || c.id}</option>
          ))}
        </select>
      )}

      {/* Upload Options */}
      <div className="flex items-center gap-4 flex-wrap">
        <label className="flex items-center gap-2 text-sm text-gray-400">
          <input
            type="checkbox"
            checked={autoAnalyze}
            onChange={(e) => setAutoAnalyze(e.target.checked)}
            className="rounded bg-gray-700 border-gray-600"
          />
          <Sparkles size={14} className="text-purple-400" />
          Auto-analyze with AI
        </label>

        <label className="flex items-center gap-2 text-sm text-gray-400">
          <input
            type="checkbox"
            checked={enableBates}
            onChange={(e) => setEnableBates(e.target.checked)}
            className="rounded bg-gray-700 border-gray-600"
          />
          Bates Numbering
        </label>

        {enableBates && (
          <input
            value={batesPrefix}
            onChange={(e) => setBatesPrefix(e.target.value.toUpperCase())}
            placeholder="Prefix (e.g. DEF)"
            className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm text-white w-32"
          />
        )}
      </div>

      {/* Drop Zone */}
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => fileInputRef.current?.click()}
        className={`border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-colors ${
          dragOver
            ? 'border-blue-400 bg-blue-900/20'
            : uploading
            ? 'border-gray-600 bg-gray-800/50 cursor-wait'
            : 'border-gray-700 hover:border-gray-500 bg-gray-800/30'
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => e.target.files && handleFiles(e.target.files)}
          accept=".pdf,.doc,.docx,.txt,.png,.jpg,.jpeg,.gif,.tiff,.bmp,.xlsx,.csv"
        />

        {uploading ? (
          <div>
            <Loader size={36} className="mx-auto mb-3 text-blue-400 animate-spin" />
            <p className="text-gray-300">Processing {progress.length} files...</p>
          </div>
        ) : (
          <div>
            <Upload size={36} className="mx-auto mb-3 text-gray-500" />
            <p className="text-gray-300">Drop files here or click to upload</p>
            <p className="text-gray-500 text-sm mt-1">
              PDF, Word, Images, Excel, CSV • Up to 500MB per file
            </p>
          </div>
        )}
      </div>

      {/* Upload Progress */}
      {progress.length > 0 && (
        <div className="space-y-2">
          {progress.map((p, i) => (
            <div key={i} className="bg-gray-800/60 rounded-lg px-4 py-2 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm text-gray-300 truncate">{p.fileName}</p>
                <div className="mt-1 h-1.5 bg-gray-700 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      p.status === 'error' ? 'bg-red-500' :
                      p.status === 'complete' ? 'bg-green-500' : 'bg-blue-500'
                    }`}
                    style={{ width: `${p.progress}%` }}
                  />
                </div>
              </div>
              {p.status === 'complete' && <CheckCircle size={16} className="text-green-400" />}
              {p.status === 'error' && (
                <span className="text-xs text-red-400 flex items-center gap-1">
                  <XCircle size={14} /> {p.error}
                </span>
              )}
              {p.status !== 'complete' && p.status !== 'error' && (
                <span className="text-xs text-gray-500 capitalize">{p.status}</span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Document List Header */}
      {documents.length > 0 && (
        <div className="flex items-center gap-3">
          <div className="relative flex-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search documents..."
              className="w-full bg-gray-800 border border-gray-700 rounded-lg pl-9 pr-3 py-1.5 text-sm text-white"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500"
              >
                <X size={14} />
              </button>
            )}
          </div>
          <span className="text-xs text-gray-500">
            {filteredDocs.length} of {documents.length} documents
          </span>
          <button onClick={loadDocuments} className="text-gray-500 hover:text-gray-400 p-1">
            <RefreshCw size={14} />
          </button>
        </div>
      )}

      {/* Document List */}
      {loading ? (
        <div className="text-center py-12 text-gray-500">
          <Loader size={24} className="animate-spin mx-auto mb-2" />
          Loading documents...
        </div>
      ) : filteredDocs.length === 0 && documents.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          <FileText size={36} className="mx-auto mb-3 opacity-50" />
          <p>No documents uploaded yet</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filteredDocs.map((doc) => {
            const Icon = getFileIcon(doc.file_type);
            const expanded = expandedDoc === doc.id;

            return (
              <div
                key={doc.id}
                className="bg-gray-800/60 rounded-lg border border-gray-700/50"
              >
                {/* Row */}
                <div className="px-4 py-3 flex items-center gap-3">
                  <Icon size={18} className="text-gray-400 flex-shrink-0" />

                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-300 truncate">{doc.name}</p>
                    <div className="flex items-center gap-2 mt-0.5 text-xs text-gray-500">
                      <span>{formatFileSize(doc.file_size)}</span>
                      {doc.bates_formatted && (
                        <span className="text-blue-400 font-mono">{doc.bates_formatted}</span>
                      )}
                      <span>{new Date(doc.created_at).toLocaleDateString()}</span>
                    </div>
                  </div>

                  {/* Status */}
                  {doc.ai_analyzed ? (
                    <span className="text-xs text-green-400 flex items-center gap-1">
                      <Sparkles size={12} /> Analyzed
                    </span>
                  ) : doc.status === 'processing' ? (
                    <span className="text-xs text-blue-400 flex items-center gap-1">
                      <Loader size={12} className="animate-spin" /> Processing
                    </span>
                  ) : doc.status === 'error' ? (
                    <span className="text-xs text-red-400 flex items-center gap-1">
                      <AlertTriangle size={12} /> Error
                    </span>
                  ) : (
                    <span className="text-xs text-gray-500">Uploaded</span>
                  )}

                  <button
                    onClick={() => handleReanalyze(doc.id)}
                    className="text-gray-600 hover:text-purple-400 p-1"
                    title="Re-analyze with AI"
                  >
                    <RefreshCw size={14} />
                  </button>

                  <button
                    onClick={() => setExpandedDoc(expanded ? null : doc.id)}
                    className="text-gray-500 hover:text-gray-400"
                  >
                    {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  </button>

                  <button
                    onClick={() => handleDelete(doc.id)}
                    className="text-gray-600 hover:text-red-400 p-1"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>

                {/* Expanded Details */}
                {expanded && (
                  <div className="px-4 pb-3 border-t border-gray-700/50 pt-3 space-y-3">
                    {doc.summary && (
                      <div>
                        <label className="text-xs text-gray-500 block mb-1">AI Summary</label>
                        <p className="text-sm text-gray-300">{doc.summary}</p>
                      </div>
                    )}

                    {doc.key_facts && doc.key_facts.length > 0 && (
                      <div>
                        <label className="text-xs text-gray-500 block mb-1">Key Facts</label>
                        <ul className="space-y-1">
                          {doc.key_facts.map((fact, i) => (
                            <li key={i} className="text-xs text-gray-400 flex items-start gap-1.5">
                              <span className="text-blue-400 mt-0.5">•</span>
                              {fact}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {doc.favorable_findings && doc.favorable_findings.length > 0 && (
                      <div>
                        <label className="text-xs text-green-400/70 block mb-1">✅ Favorable</label>
                        <ul className="space-y-1">
                          {doc.favorable_findings.map((f, i) => (
                            <li key={i} className="text-xs text-green-300/80">{f}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {doc.adverse_findings && doc.adverse_findings.length > 0 && (
                      <div>
                        <label className="text-xs text-red-400/70 block mb-1">⚠️ Adverse</label>
                        <ul className="space-y-1">
                          {doc.adverse_findings.map((f, i) => (
                            <li key={i} className="text-xs text-red-300/80">{f}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {doc.action_items && doc.action_items.length > 0 && (
                      <div>
                        <label className="text-xs text-yellow-400/70 block mb-1">📋 Action Items</label>
                        <ul className="space-y-1">
                          {doc.action_items.map((a, i) => (
                            <li key={i} className="text-xs text-yellow-300/80">{a}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {doc.file_url && (
                      <a
                        href={doc.file_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1"
                      >
                        <Eye size={12} /> View original file
                      </a>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default BulkDocumentUpload;
