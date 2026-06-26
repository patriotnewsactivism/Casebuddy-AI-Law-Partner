/**
 * BulkDocumentUpload — drag-and-drop file upload with OCR processing
 * 
 * Features:
 * - Drag & drop or click to select files
 * - Automatic Bates numbering
 * - OCR + AI analysis via edge functions
 * - Progress tracking for each file
 * - Support for PDF, DOC, DOCX, TXT, JPG, PNG, TIFF
 */

import React, { useState, useCallback, useContext, useRef } from 'react';
import { AppContext } from '../App';
import {
  Upload, FileText, CheckCircle, XCircle, Loader,
  Trash2, Eye, RefreshCw, Hash, ChevronDown, ChevronUp,
  File, Image, AlertCircle, Sparkles
} from 'lucide-react';
import { bulkUploadDocuments, UploadProgress, reanalyzeDocument, getCaseDocuments, DocumentRecord } from '../services/documentPipeline';

const ACCEPTED_TYPES: Record<string, string[]> = {
  'application/pdf': ['.pdf'],
  'application/msword': ['.doc'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
  'text/plain': ['.txt'],
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
  'image/tiff': ['.tiff', '.tif'],
};

const ACCEPTED_EXTENSIONS = Object.values(ACCEPTED_TYPES).flat();
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

interface QueuedFile {
  file: File;
  id: string;
}

const BulkDocumentUpload: React.FC = () => {
  const { cases, activeCase } = useContext(AppContext);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [queuedFiles, setQueuedFiles] = useState<QueuedFile[]>([]);
  const [uploadProgress, setUploadProgress] = useState<UploadProgress[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [batesPrefix, setBatesPrefix] = useState('DOC');
  const [enableBates, setEnableBates] = useState(true);
  const [autoAnalyze, setAutoAnalyze] = useState(true);
  const [isDragOver, setIsDragOver] = useState(false);
  const [showOptions, setShowOptions] = useState(false);
  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [showDocuments, setShowDocuments] = useState(false);
  const [selectedCase, setSelectedCase] = useState<string>(activeCase?.id || '');

  // Resolve the case ID
  const caseId = selectedCase || activeCase?.id;

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);

    const droppedFiles = Array.from(e.dataTransfer.files).filter(f => {
      const ext = '.' + f.name.split('.').pop()?.toLowerCase();
      return ACCEPTED_EXTENSIONS.includes(ext) && f.size <= MAX_FILE_SIZE;
    });

    setQueuedFiles(prev => [
      ...prev,
      ...droppedFiles.map(f => ({ file: f, id: `${Date.now()}-${Math.random()}` })),
    ]);
  }, []);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files || []).filter(f => f.size <= MAX_FILE_SIZE);
    setQueuedFiles(prev => [
      ...prev,
      ...selected.map(f => ({ file: f, id: `${Date.now()}-${Math.random()}` })),
    ]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, []);

  const removeFile = useCallback((id: string) => {
    setQueuedFiles(prev => prev.filter(f => f.id !== id));
  }, []);

  const clearQueue = useCallback(() => {
    setQueuedFiles([]);
    setUploadProgress([]);
  }, []);

  const handleUpload = async () => {
    if (!caseId || queuedFiles.length === 0) return;

    setIsUploading(true);
    setUploadProgress(queuedFiles.map(f => ({
      fileName: f.file.name,
      status: 'pending',
      progress: 0,
    })));

    try {
      const results = await bulkUploadDocuments(
        queuedFiles.map(f => f.file),
        {
          caseId,
          batesPrefix: enableBates ? batesPrefix : undefined,
          autoAnalyze,
          onProgress: setUploadProgress,
        }
      );

      setUploadProgress(results);
      setQueuedFiles([]);

      // Refresh document list
      const docs = await getCaseDocuments(caseId);
      setDocuments(docs);
      setShowDocuments(true);
    } catch (err) {
      console.error('Upload error:', err);
    } finally {
      setIsUploading(false);
    }
  };

  const loadDocuments = async () => {
    if (!caseId) return;
    const docs = await getCaseDocuments(caseId);
    setDocuments(docs);
    setShowDocuments(true);
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const getFileIcon = (name: string) => {
    const ext = name.split('.').pop()?.toLowerCase();
    if (['jpg', 'jpeg', 'png', 'tiff', 'tif'].includes(ext || '')) return <Image size={16} />;
    return <FileText size={16} />;
  };

  const statusIcon = (status: UploadProgress['status']) => {
    switch (status) {
      case 'pending': return <File size={14} className="text-gray-400" />;
      case 'uploading': return <Loader size={14} className="text-blue-400 animate-spin" />;
      case 'processing': return <Loader size={14} className="text-yellow-400 animate-spin" />;
      case 'analyzing': return <Sparkles size={14} className="text-purple-400 animate-pulse" />;
      case 'complete': return <CheckCircle size={14} className="text-green-400" />;
      case 'error': return <XCircle size={14} className="text-red-400" />;
    }
  };

  const statusLabel = (status: UploadProgress['status']) => {
    switch (status) {
      case 'pending': return 'Queued';
      case 'uploading': return 'Uploading...';
      case 'processing': return 'OCR Processing...';
      case 'analyzing': return 'AI Analyzing...';
      case 'complete': return 'Complete';
      case 'error': return 'Failed';
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Upload size={22} /> Document Upload & OCR
          </h2>
          <p className="text-gray-400 text-sm mt-1">
            Drag & drop files for automatic OCR extraction, AI analysis, and Bates numbering
          </p>
        </div>
        {caseId && (
          <button
            onClick={loadDocuments}
            className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-sm rounded-lg text-gray-300 flex items-center gap-1.5"
          >
            <Eye size={14} /> View Documents ({documents.length})
          </button>
        )}
      </div>

      {/* Case Selector */}
      {!activeCase && (
        <div>
          <label className="text-sm text-gray-400 block mb-1">Select Case</label>
          <select
            value={selectedCase}
            onChange={(e) => setSelectedCase(e.target.value)}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm"
          >
            <option value="">— Select a case —</option>
            {cases.map((c: any) => (
              <option key={c.id} value={c.id}>{c.title || c.name || c.id}</option>
            ))}
          </select>
        </div>
      )}

      {/* Drop Zone */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`
          border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all
          ${isDragOver
            ? 'border-blue-400 bg-blue-400/10'
            : 'border-gray-600 hover:border-gray-500 bg-gray-800/50 hover:bg-gray-800/70'
          }
        `}
      >
        <Upload size={36} className={`mx-auto mb-3 ${isDragOver ? 'text-blue-400' : 'text-gray-500'}`} />
        <p className="text-gray-300 font-medium">
          {isDragOver ? 'Drop files here' : 'Drag & drop files or click to browse'}
        </p>
        <p className="text-gray-500 text-sm mt-1">
          PDF, DOC, DOCX, TXT, JPG, PNG, TIFF — up to 50MB each
        </p>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={ACCEPTED_EXTENSIONS.join(',')}
          onChange={handleFileSelect}
          className="hidden"
        />
      </div>

      {/* Options */}
      {queuedFiles.length > 0 && (
        <div className="bg-gray-800/50 rounded-lg p-4">
          <button
            onClick={() => setShowOptions(!showOptions)}
            className="flex items-center gap-2 text-sm text-gray-400 hover:text-gray-300 w-full"
          >
            {showOptions ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            Upload Options
          </button>

          {showOptions && (
            <div className="mt-3 space-y-3">
              <label className="flex items-center gap-3 text-sm text-gray-300">
                <input
                  type="checkbox"
                  checked={enableBates}
                  onChange={(e) => setEnableBates(e.target.checked)}
                  className="rounded bg-gray-700 border-gray-600"
                />
                <Hash size={14} /> Auto-assign Bates numbers
              </label>

              {enableBates && (
                <div className="ml-7">
                  <label className="text-xs text-gray-500 block mb-1">Bates Prefix</label>
                  <input
                    type="text"
                    value={batesPrefix}
                    onChange={(e) => setBatesPrefix(e.target.value.toUpperCase())}
                    placeholder="DOC"
                    className="bg-gray-700 border border-gray-600 rounded px-2 py-1 text-sm text-white w-32"
                  />
                  <span className="text-xs text-gray-500 ml-2">
                    e.g., {batesPrefix}-000001
                  </span>
                </div>
              )}

              <label className="flex items-center gap-3 text-sm text-gray-300">
                <input
                  type="checkbox"
                  checked={autoAnalyze}
                  onChange={(e) => setAutoAnalyze(e.target.checked)}
                  className="rounded bg-gray-700 border-gray-600"
                />
                <Sparkles size={14} /> Auto-run OCR + AI analysis
              </label>
            </div>
          )}
        </div>
      )}

      {/* File Queue */}
      {queuedFiles.length > 0 && !isUploading && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-400">{queuedFiles.length} file(s) queued</span>
            <button onClick={clearQueue} className="text-xs text-red-400 hover:text-red-300">
              Clear All
            </button>
          </div>

          {queuedFiles.map((qf) => (
            <div key={qf.id} className="flex items-center gap-3 bg-gray-800/60 rounded-lg px-3 py-2">
              {getFileIcon(qf.file.name)}
              <span className="text-sm text-gray-300 flex-1 truncate">{qf.file.name}</span>
              <span className="text-xs text-gray-500">{formatSize(qf.file.size)}</span>
              <button onClick={() => removeFile(qf.id)} className="text-gray-500 hover:text-red-400">
                <Trash2 size={14} />
              </button>
            </div>
          ))}

          <button
            onClick={handleUpload}
            disabled={!caseId}
            className="w-full mt-3 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded-lg font-medium flex items-center justify-center gap-2 transition-colors"
          >
            <Upload size={16} /> Upload & Process {queuedFiles.length} File(s)
          </button>
          {!caseId && (
            <p className="text-xs text-yellow-400 text-center">⚠️ Select a case first</p>
          )}
        </div>
      )}

      {/* Upload Progress */}
      {uploadProgress.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-gray-300">Processing Status</h3>
          {uploadProgress.map((up, i) => (
            <div key={i} className="bg-gray-800/60 rounded-lg px-3 py-2">
              <div className="flex items-center gap-2">
                {statusIcon(up.status)}
                <span className="text-sm text-gray-300 flex-1 truncate">{up.fileName}</span>
                <span className={`text-xs ${up.status === 'error' ? 'text-red-400' : 'text-gray-500'}`}>
                  {statusLabel(up.status)}
                </span>
              </div>
              {up.status !== 'pending' && up.status !== 'complete' && up.status !== 'error' && (
                <div className="mt-1.5 bg-gray-700 rounded-full h-1.5 overflow-hidden">
                  <div
                    className="h-full bg-blue-500 rounded-full transition-all duration-300"
                    style={{ width: `${up.progress}%` }}
                  />
                </div>
              )}
              {up.error && (
                <p className="text-xs text-red-400 mt-1 flex items-center gap-1">
                  <AlertCircle size={12} /> {up.error}
                </p>
              )}
              {up.status === 'complete' && up.ocrResult?.summary && (
                <p className="text-xs text-gray-500 mt-1 line-clamp-2">
                  📝 {up.ocrResult.summary}
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Document List */}
      {showDocuments && documents.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-gray-300">
              Case Documents ({documents.length})
            </h3>
            <button
              onClick={() => setShowDocuments(false)}
              className="text-xs text-gray-500 hover:text-gray-400"
            >
              Hide
            </button>
          </div>

          <div className="max-h-96 overflow-y-auto space-y-1.5">
            {documents.map((doc) => (
              <div key={doc.id} className="bg-gray-800/60 rounded-lg px-3 py-2">
                <div className="flex items-center gap-2">
                  {getFileIcon(doc.name)}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-300 truncate">{doc.name}</p>
                    <div className="flex items-center gap-2 text-xs text-gray-500">
                      {doc.bates_formatted && (
                        <span className="text-blue-400 font-mono">{doc.bates_formatted}</span>
                      )}
                      <span>{doc.document_type || doc.file_type}</span>
                      {doc.ai_analyzed && <span className="text-green-400">✓ Analyzed</span>}
                      {doc.status === 'processing' && <span className="text-yellow-400 animate-pulse">Processing...</span>}
                    </div>
                  </div>
                  {doc.file_url && (
                    <a
                      href={doc.file_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-gray-500 hover:text-blue-400"
                    >
                      <Eye size={14} />
                    </a>
                  )}
                  {!doc.ai_analyzed && doc.status !== 'processing' && (
                    <button
                      onClick={() => reanalyzeDocument(doc.id).then(loadDocuments)}
                      className="text-gray-500 hover:text-yellow-400"
                      title="Re-analyze with AI"
                    >
                      <RefreshCw size={14} />
                    </button>
                  )}
                </div>
                {doc.summary && (
                  <p className="text-xs text-gray-500 mt-1 line-clamp-2">{doc.summary}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default BulkDocumentUpload;
