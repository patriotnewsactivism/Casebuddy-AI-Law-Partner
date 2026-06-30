import React, { useState, useEffect } from 'react';
import {
  Download, Upload, FileText, Database, CheckCircle2, AlertTriangle,
  Loader2, Copy, Eye, FileDown, FileUp, Trash2, Plus, ChevronRight
} from 'lucide-react';
import {
  exportData, downloadExport, copyExportToClipboard, exportAllPipelineData,
  type ExportOptions, type ExportFormat, type ExportResult
} from '../services/exportService';
import {
  parseImportData, previewImport, importCases, generateCaseTemplate,
  type ImportPreview, type ImportResult, type ImportFormat
} from '../services/importService';
import { AppContext } from '../App';
import { loadCases } from '../utils/storage';
import { loadPipelineState } from '../services/casePipeline';
import { toast } from 'react-toastify';

type Tab = 'export' | 'import';
type ImportSubTab = 'paste' | 'upload';

const EXPORT_FORMATS: { key: ExportFormat; label: string }[] = [
  { key: 'csv', label: 'CSV' },
  { key: 'json', label: 'JSON' },
  { key: 'markdown', label: 'Markdown' },
  { key: 'text', label: 'Text' },
];

interface RecentExport {
  result: ExportResult;
  timestamp: number;
}

const triggerDownload = (content: string, filename: string, mime: string = 'text/plain') => {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 100);
};

const ExportImport = () => {
  const { cases, addCase } = React.useContext(AppContext);
  const [tab, setTab] = useState<Tab>('export');
  const [importSubTab, setImportSubTab] = useState<ImportSubTab>('paste');

  // Export state
  const [exportFormat, setExportFormat] = useState<ExportFormat>('json');
  const [includeCases, setIncludeCases] = useState(true);
  const [includeInvoices, setIncludeInvoices] = useState(true);
  const [includePipeline, setIncludePipeline] = useState(true);
  const [includeAnalytics, setIncludeAnalytics] = useState(true);
  const [includeAuditLog, setIncludeAuditLog] = useState(true);
  const [exportCaseId, setExportCaseId] = useState<string>('');
  const [exportDateFrom, setExportDateFrom] = useState('');
  const [exportDateTo, setExportDateTo] = useState('');
  const [exportPreview, setExportPreview] = useState<string | null>(null);
  const [exportResult, setExportResult] = useState<ExportResult | null>(null);
  const [recentExports, setRecentExports] = useState<RecentExport[]>([]);

  // Pipeline export state
  const [pipelineCaseId, setPipelineCaseId] = useState<string>('');

  // Import state
  const [importRaw, setImportRaw] = useState('');
  const [importPreviewData, setImportPreviewData] = useState<ImportPreview | null>(null);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [importDetectedFormat, setImportDetectedFormat] = useState<ImportFormat>('csv');
  const [importFile, setImportFile] = useState<File | null>(null);

  // ─── Export handlers ────────────────────────────────────────────────────────

  const handlePreview = () => {
    const options: ExportOptions = {
      format: exportFormat,
      includeCases,
      includeInvoices,
      includePipeline,
      includeAnalytics,
      includeAuditLog,
      caseId: exportCaseId || undefined,
      dateFrom: exportDateFrom || undefined,
      dateTo: exportDateTo || undefined,
    };
    const result = exportData(options);
    setExportResult(result);
    setExportPreview(result.content.slice(0, 500));
  };

  const handleDownloadExport = () => {
    if (!exportResult) return;
    downloadExport(exportResult);
    setRecentExports(prev => {
      const updated = [{ result: exportResult, timestamp: Date.now() }, ...prev].slice(0, 3);
      return updated;
    });
    toast.success(`Downloaded ${exportResult.filename}`);
  };

  const handleCopyExport = async () => {
    if (!exportResult) return;
    try {
      await copyExportToClipboard(exportResult);
      toast.success('Copied to clipboard');
    } catch {
      toast.error('Clipboard copy failed');
    }
  };

  const handlePipelineExport = () => {
    const caseId = pipelineCaseId || cases[0]?.id;
    if (!caseId) {
      toast.error('No case selected for pipeline report');
      return;
    }
    const content = exportAllPipelineData(caseId);
    const caseTitle = cases.find(c => c.id === caseId)?.title || caseId;
    triggerDownload(content, `pipeline-report-${caseTitle.replace(/\s+/g, '-').toLowerCase()}.md`, 'text/markdown');
    toast.success('Pipeline report downloaded');
  };

  const handleReDownload = (exp: RecentExport) => {
    downloadExport(exp.result);
    toast.success(`Downloaded ${exp.result.filename}`);
  };

  // ─── Import handlers ────────────────────────────────────────────────────────

  const detectFormat = (raw: string): ImportFormat => {
    const trimmed = raw.trim();
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try {
        JSON.parse(trimmed);
        return 'json';
      } catch {}
    }
    return 'csv';
  };

  const handleImportPreview = () => {
    const format = detectFormat(importRaw);
    setImportDetectedFormat(format);
    const preview = previewImport(importRaw, format);
    setImportPreviewData(preview);
    setImportResult(null);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportFile(file);
    const text = await file.text();
    setImportRaw(text);
    const format = file.name.endsWith('.json') ? 'json' : 'csv';
    setImportDetectedFormat(format);
    const preview = previewImport(text, format);
    setImportPreviewData(preview);
    setImportResult(null);
  };

  const handleImportCases = () => {
    if (!importPreviewData) return;
    const existingCases = loadCases();
    // Use full parse data (not just the 5-row preview) for actual import
    const fullPreview = parseImportData(importRaw, importDetectedFormat);
    const result = importCases(fullPreview, existingCases);
    setImportResult(result);
    for (const item of result.items) {
      addCase(item);
    }
    toast.success(`Imported ${result.imported} case${result.imported !== 1 ? 's' : ''}${result.skipped > 0 ? `, ${result.skipped} skipped` : ''}`);
  };

  const handleDownloadTemplate = (format: ImportFormat) => {
    const content = generateCaseTemplate(format);
    const ext = format === 'csv' ? 'csv' : 'json';
    triggerDownload(content, `casebuddy-template.${ext}`, format === 'csv' ? 'text/csv' : 'application/json');
    toast.success(`${format.toUpperCase()} template downloaded`);
  };

  // ─── Render ─────────────────────────────────────────────────────────────────

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center gap-2">
        <FileUp size={24} className="text-gold-500" />
        <h1 className="text-2xl font-serif font-bold text-white">Import / Export</h1>
      </div>

      {/* Tab toggles */}
      <div className="flex gap-1 bg-slate-900 rounded-lg p-1 w-fit">
        {(['export', 'import'] as Tab[]).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-5 py-2 rounded-md text-sm font-medium transition-all ${
              tab === t ? 'bg-gold-500 text-slate-950' : 'text-slate-400 hover:text-white'
            }`}
          >
            {t === 'export' ? 'Export' : 'Import'}
          </button>
        ))}
      </div>

      {/* ═══════════ EXPORT TAB ═══════════ */}
      {tab === 'export' && (
        <div className="space-y-6">
          {/* Format selector */}
          <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-5 space-y-4">
            <h3 className="text-sm font-bold text-slate-300 uppercase tracking-wider">Export Format</h3>
            <div className="flex gap-2">
              {EXPORT_FORMATS.map(f => (
                <button
                  key={f.key}
                  onClick={() => setExportFormat(f.key)}
                  className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all ${
                    exportFormat === f.key
                      ? 'bg-gold-500/20 border border-gold-500/50 text-gold-400'
                      : 'bg-slate-800 text-slate-400 border border-slate-700 hover:border-slate-600'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {/* Data selection */}
          <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-5 space-y-4">
            <h3 className="text-sm font-bold text-slate-300 uppercase tracking-wider">Include Data</h3>
            <div className="flex flex-wrap gap-4">
              {[
                { key: 'cases', label: 'Cases', state: includeCases, set: setIncludeCases },
                { key: 'invoices', label: 'Invoices', state: includeInvoices, set: setIncludeInvoices },
                { key: 'pipeline', label: 'Pipeline Briefings', state: includePipeline, set: setIncludePipeline },
                { key: 'analytics', label: 'Firm Analytics', state: includeAnalytics, set: setIncludeAnalytics },
                { key: 'audit', label: 'Audit Log', state: includeAuditLog, set: setIncludeAuditLog },
              ].map(item => (
                <label key={item.key} className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={item.state}
                    onChange={e => item.set(e.target.checked)}
                    className="rounded bg-slate-800 border-slate-600 text-gold-500 focus:ring-gold-500/30"
                  />
                  {item.label}
                </label>
              ))}
            </div>

            {/* Case filter dropdown */}
            <div className="flex gap-4 items-end flex-wrap">
              <div className="space-y-1">
                <label className="text-xs text-slate-500 uppercase tracking-wider">Case Filter</label>
                <select
                  value={exportCaseId}
                  onChange={e => setExportCaseId(e.target.value)}
                  className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:border-gold-500/50 focus:outline-none"
                >
                  <option value="">All Cases</option>
                  {cases.map(c => (
                    <option key={c.id} value={c.id}>{c.title}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs text-slate-500 uppercase tracking-wider">Date From</label>
                <input
                  type="date"
                  value={exportDateFrom}
                  onChange={e => setExportDateFrom(e.target.value)}
                  className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:border-gold-500/50 focus:outline-none"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-slate-500 uppercase tracking-wider">Date To</label>
                <input
                  type="date"
                  value={exportDateTo}
                  onChange={e => setExportDateTo(e.target.value)}
                  className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:border-gold-500/50 focus:outline-none"
                />
              </div>
            </div>
          </div>

          {/* Preview & Actions */}
          <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-300 uppercase tracking-wider">Preview & Export</h3>
              <button
                onClick={handlePreview}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-sm text-slate-300 hover:text-white transition-colors"
              >
                <Eye size={14} /> Preview
              </button>
            </div>

            {exportPreview && (
              <pre className="bg-slate-800 font-mono text-xs text-slate-300 max-h-64 overflow-auto p-4 rounded-lg border border-slate-700 whitespace-pre-wrap break-all">
                {exportPreview}
                {exportResult && exportResult.content.length > 500 && (
                  <span className="text-slate-500 italic">... (truncated)</span>
                )}
              </pre>
            )}

            {exportResult && (
              <div className="flex items-center gap-4 text-xs text-slate-500">
                <span>Rows: {exportResult.content.split('\n').filter(l => l.trim()).length}</span>
                <span>Size: {formatSize(exportResult.sizeBytes)}</span>
              </div>
            )}

            <div className="flex items-center gap-3 flex-wrap">
              <button
                onClick={handleDownloadExport}
                disabled={!exportResult}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gold-500 text-slate-950 text-sm font-bold hover:bg-gold-400 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Download size={16} /> Download Export
              </button>
              <button
                onClick={handleCopyExport}
                disabled={!exportResult}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-300 text-sm hover:border-slate-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Copy size={14} /> Copy to Clipboard
              </button>
            </div>
          </div>

          {/* Pipeline Report */}
          <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-5 space-y-4">
            <h3 className="text-sm font-bold text-slate-300 uppercase tracking-wider">Pipeline Report</h3>
            <p className="text-xs text-slate-500">Export a full pipeline report (markdown) for a specific case.</p>
            <div className="flex items-center gap-3 flex-wrap">
              <select
                value={pipelineCaseId}
                onChange={e => setPipelineCaseId(e.target.value)}
                className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:border-gold-500/50 focus:outline-none"
              >
                <option value="">Select a case...</option>
                {cases.map(c => (
                  <option key={c.id} value={c.id}>{c.title}</option>
                ))}
              </select>
              <button
                onClick={handlePipelineExport}
                disabled={!pipelineCaseId && cases.length === 0}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gold-500 text-slate-950 text-sm font-bold hover:bg-gold-400 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <FileText size={16} /> Export Pipeline Report
              </button>
            </div>
          </div>

          {/* Recent exports */}
          {recentExports.length > 0 && (
            <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-5 space-y-3">
              <h3 className="text-sm font-bold text-slate-300 uppercase tracking-wider">Recent Exports</h3>
              <div className="space-y-2">
                {recentExports.map((exp, i) => (
                  <div key={i} className="flex items-center justify-between bg-slate-800/50 rounded-lg px-3 py-2">
                    <div className="flex items-center gap-3 text-sm">
                      <FileDown size={14} className="text-gold-500" />
                      <span className="text-slate-200">{exp.result.filename}</span>
                      <span className="text-xs text-slate-500 uppercase bg-slate-700 px-1.5 py-0.5 rounded">{exp.result.format}</span>
                      <span className="text-xs text-slate-500">{formatSize(exp.result.sizeBytes)}</span>
                      <span className="text-xs text-slate-600">{new Date(exp.timestamp).toLocaleString()}</span>
                    </div>
                    <button
                      onClick={() => handleReDownload(exp)}
                      className="text-slate-400 hover:text-gold-400 transition-colors"
                      title="Download again"
                    >
                      <Download size={14} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ═══════════ IMPORT TAB ═══════════ */}
      {tab === 'import' && (
        <div className="space-y-6">
          {/* Import method sub-tabs */}
          <div className="flex gap-1 bg-slate-900 rounded-lg p-1 w-fit">
            {(['paste', 'upload'] as ImportSubTab[]).map(st => (
              <button
                key={st}
                onClick={() => { setImportSubTab(st); setImportPreviewData(null); setImportResult(null); }}
                className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${
                  importSubTab === st ? 'bg-gold-500 text-slate-950' : 'text-slate-400 hover:text-white'
                }`}
              >
                {st === 'paste' ? 'Paste Data' : 'Upload File'}
              </button>
            ))}
          </div>

          {/* Template download */}
          <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-5 space-y-3">
            <h3 className="text-sm font-bold text-slate-300 uppercase tracking-wider">Templates</h3>
            <p className="text-xs text-slate-500">Download a template with the correct format for case imports.</p>
            <div className="flex gap-3">
              <button
                onClick={() => handleDownloadTemplate('csv')}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-sm text-slate-300 hover:text-white hover:border-slate-600 transition-colors"
              >
                <FileDown size={14} /> Download CSV Template
              </button>
              <button
                onClick={() => handleDownloadTemplate('json')}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-sm text-slate-300 hover:text-white hover:border-slate-600 transition-colors"
              >
                <FileDown size={14} /> Download JSON Template
              </button>
            </div>
            <div className="text-xs text-slate-600 bg-slate-800/50 rounded-lg p-3">
              <p className="text-slate-400 font-medium mb-1">Template includes:</p>
              <code className="text-slate-500">title, client, status, opposingCounsel, judge, nextCourtDate, summary, caseType, winProbability</code>
            </div>
          </div>

          {/* Paste tab */}
          {importSubTab === 'paste' && (
            <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-5 space-y-3">
              <h3 className="text-sm font-bold text-slate-300 uppercase tracking-wider">Paste Data</h3>
              <textarea
                value={importRaw}
                onChange={e => setImportRaw(e.target.value)}
                placeholder="Paste CSV or JSON data here..."
                rows={10}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 text-sm text-slate-200 font-mono focus:border-gold-500/50 focus:outline-none resize-y placeholder-slate-600"
              />
              <button
                onClick={handleImportPreview}
                disabled={!importRaw.trim()}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gold-500 text-slate-950 text-sm font-bold hover:bg-gold-400 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Eye size={14} /> Preview Import
              </button>
            </div>
          )}

          {/* Upload tab */}
          {importSubTab === 'upload' && (
            <div className="bg-slate-900/60 border border-dashed border-slate-600 rounded-xl p-8 text-center space-y-3">
              <Upload size={32} className="text-slate-500 mx-auto" />
              <p className="text-sm text-slate-400">Drop a .csv or .json file here, or click to browse</p>
              <input
                type="file"
                accept=".csv,.json"
                onChange={handleFileUpload}
                className="block mx-auto text-sm text-slate-400 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-gold-500 file:text-slate-950 hover:file:bg-gold-400 file:cursor-pointer"
              />
              {importFile && (
                <div className="flex items-center justify-center gap-2 text-sm text-slate-300">
                  <FileText size={14} className="text-gold-500" />
                  {importFile.name}
                  <span className="text-xs text-slate-500">({formatSize(importFile.size)})</span>
                </div>
              )}
            </div>
          )}

          {/* Import preview */}
          {importPreviewData && (
            <div className="space-y-4">
              <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-slate-300 uppercase tracking-wider">Preview</h3>
                  <div className="flex items-center gap-3">
                    {importDetectedFormat && (
                      <span className="text-xs bg-slate-800 text-slate-400 px-2 py-1 rounded border border-slate-700 uppercase">
                        {importDetectedFormat}
                      </span>
                    )}
                    <span className={`text-xs font-bold px-2 py-1 rounded border ${
                      importPreviewData.detectedType === 'cases' ? 'bg-green-500/10 text-green-400 border-green-500/30' :
                      importPreviewData.detectedType === 'invoices' ? 'bg-blue-500/10 text-blue-400 border-blue-500/30' :
                      'bg-slate-800 text-slate-400 border-slate-700'
                    }`}>
                      {importPreviewData.detectedType === 'cases' ? 'Cases' :
                       importPreviewData.detectedType === 'invoices' ? 'Invoices' : 'Unknown'}
                    </span>
                    <span className="text-xs text-slate-500">{importPreviewData.rowCount} rows</span>
                  </div>
                </div>

                {/* Preview table */}
                {importPreviewData.rows.length > 0 && (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs border-collapse bg-slate-900 border border-slate-700 rounded-lg overflow-hidden">
                      <thead>
                        <tr className="bg-slate-800/80">
                          {importPreviewData.headers.map((h, i) => (
                            <th key={i} className="text-left px-3 py-2 text-slate-400 font-medium border-b border-slate-700">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {importPreviewData.rows.map((row, ri) => (
                          <tr key={ri} className="border-b border-slate-800 hover:bg-slate-800/40">
                            {importPreviewData.headers.map((h, ci) => (
                              <td key={ci} className="px-3 py-1.5 text-slate-300 max-w-[200px] truncate">
                                {String(row[h] ?? '')}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Validation errors */}
                {importPreviewData.errors.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm">
                      <AlertTriangle size={14} className="text-red-400" />
                      <span className="text-red-400 font-medium">{importPreviewData.errors.length} validation issue{importPreviewData.errors.length !== 1 ? 's' : ''}</span>
                    </div>
                    <div className="space-y-1.5">
                      {importPreviewData.errors.map((err, i) => (
                        <div key={i} className="bg-red-500/5 border border-red-500/20 rounded-lg px-3 py-2 flex items-start gap-2">
                          <AlertTriangle size={12} className="text-red-400 mt-0.5 shrink-0" />
                          <div className="text-xs">
                            <span className="text-red-300 font-medium">Row {err.row + 1}</span>
                            {err.field && <span className="text-red-400"> — {err.field}</span>}
                            <span className="text-slate-400">: {err.message}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {importPreviewData.valid && importPreviewData.rowCount > 0 && (
                  <div className="flex items-center gap-2 text-sm text-green-400">
                    <CheckCircle2 size={14} />
                    <span>Data is valid — ready to import</span>
                  </div>
                )}
              </div>

              {/* Import button */}
              <button
                onClick={handleImportCases}
                disabled={!importPreviewData.valid || importPreviewData.detectedType !== 'cases'}
                className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-gold-500 text-slate-950 text-sm font-bold hover:bg-gold-400 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <FileUp size={16} /> Import Cases
              </button>
              {importPreviewData.detectedType !== 'cases' && importPreviewData.valid && (
                <p className="text-xs text-amber-400 mt-1">Import is only available for case data. Detected type: {importPreviewData.detectedType || 'unknown'}.</p>
              )}
            </div>
          )}

          {/* Import result */}
          {importResult && (
            <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-5 space-y-3">
              <h3 className="text-sm font-bold text-slate-300 uppercase tracking-wider">Import Result</h3>
              <div className="flex items-center gap-4 text-sm">
                <div className="flex items-center gap-2">
                  <CheckCircle2 size={16} className="text-green-400" />
                  <span className="text-green-400">{importResult.imported} imported</span>
                </div>
                {importResult.skipped > 0 && (
                  <div className="flex items-center gap-2">
                    <AlertTriangle size={16} className="text-amber-400" />
                    <span className="text-amber-400">{importResult.skipped} skipped</span>
                  </div>
                )}
              </div>
              {importResult.errors.length > 0 && (
                <div className="space-y-1 max-h-40 overflow-y-auto">
                  {importResult.errors.map((err, i) => (
                    <div key={i} className="text-xs text-red-400 bg-red-500/5 border border-red-500/20 rounded px-3 py-1.5">
                      {err}
                    </div>
                  ))}
                </div>
              )}
              {importResult.items.length > 0 && (
                <div className="text-xs text-slate-500">
                  Imported cases: {importResult.items.map(c => c.title).join(', ')}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ExportImport;
