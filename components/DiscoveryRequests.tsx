/**
 * DiscoveryManager — manage, track, and AI-respond to discovery requests
 * 
 * Features:
 * - Create/import discovery requests (interrogatories, RFPs, RFAs, depositions)
 * - AI-generated responses with proper objections
 * - Deadline tracking with overdue alerts
 * - Bulk import from documents
 * - Statistics dashboard
 */

import React, { useState, useEffect, useContext, useCallback } from 'react';
import { AppContext } from '../App';
import {
  FileSearch, Plus, Sparkles, Clock, AlertTriangle, CheckCircle,
  Trash2, Edit3, Save, X, ChevronDown, ChevronUp, Send,
  FileText, Filter, RefreshCw, Upload, Copy, BarChart3, Loader
} from 'lucide-react';
import {
  getDiscoveryRequests,
  createDiscoveryRequest,
  updateDiscoveryRequest,
  deleteDiscoveryRequest,
  generateDiscoveryResponses,
  getDiscoveryStats,
  bulkImportDiscoveryRequests,
  parseDiscoveryDocument,
  DiscoveryRequest,
  DiscoveryRequestType,
  DiscoveryStats,
} from '../services/discoveryService';

const REQUEST_TYPE_LABELS: Record<DiscoveryRequestType, { label: string; icon: string; color: string }> = {
  interrogatory: { label: 'Interrogatory', icon: '❓', color: 'text-blue-400' },
  request_for_production: { label: 'Request for Production', icon: '📁', color: 'text-green-400' },
  request_for_admission: { label: 'Request for Admission', icon: '✅', color: 'text-purple-400' },
  deposition: { label: 'Deposition', icon: '🎙️', color: 'text-yellow-400' },
};

const STATUS_STYLES: Record<string, { label: string; color: string; bg: string }> = {
  pending: { label: 'Pending', color: 'text-gray-400', bg: 'bg-gray-700' },
  drafted: { label: 'AI Drafted', color: 'text-blue-400', bg: 'bg-blue-900/30' },
  reviewed: { label: 'Reviewed', color: 'text-yellow-400', bg: 'bg-yellow-900/30' },
  finalized: { label: 'Finalized', color: 'text-green-400', bg: 'bg-green-900/30' },
  served: { label: 'Served', color: 'text-emerald-400', bg: 'bg-emerald-900/30' },
  objected: { label: 'Objected', color: 'text-red-400', bg: 'bg-red-900/30' },
};

const DiscoveryManager: React.FC = () => {
  const { cases, activeCase } = useContext(AppContext);

  const [requests, setRequests] = useState<DiscoveryRequest[]>([]);
  const [stats, setStats] = useState<DiscoveryStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedCase, setSelectedCase] = useState<string>(activeCase?.id || '');
  const [filterType, setFilterType] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showAddForm, setShowAddForm] = useState(false);
  const [showBulkImport, setShowBulkImport] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [jurisdiction, setJurisdiction] = useState('');

  // New request form
  const [newType, setNewType] = useState<DiscoveryRequestType>('interrogatory');
  const [newNumber, setNewNumber] = useState('');
  const [newQuestion, setNewQuestion] = useState('');
  const [newServedDate, setNewServedDate] = useState('');
  const [newDueDate, setNewDueDate] = useState('');

  // Bulk import
  const [bulkText, setBulkText] = useState('');
  const [bulkType, setBulkType] = useState<DiscoveryRequestType>('interrogatory');
  const [parsing, setParsing] = useState(false);

  const caseId = selectedCase || activeCase?.id;

  const loadData = useCallback(async () => {
    if (!caseId) return;
    setLoading(true);
    try {
      const [reqs, st] = await Promise.all([
        getDiscoveryRequests(caseId),
        getDiscoveryStats(caseId),
      ]);
      setRequests(reqs);
      setStats(st);
    } finally {
      setLoading(false);
    }
  }, [caseId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Filtered requests
  const filtered = requests.filter(r => {
    if (filterType !== 'all' && r.request_type !== filterType) return false;
    if (filterStatus !== 'all' && r.status !== filterStatus) return false;
    return true;
  });

  const isOverdue = (r: DiscoveryRequest) => {
    if (!r.response_due_date || r.response_date || r.status === 'served' || r.status === 'finalized') return false;
    return new Date(r.response_due_date) < new Date();
  };

  const daysUntilDue = (date: string) => {
    const diff = Math.ceil((new Date(date).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    return diff;
  };

  // ── Handlers ─────────────────────────────────────────────────────

  const handleAddRequest = async () => {
    if (!caseId || !newQuestion.trim()) return;
    await createDiscoveryRequest(caseId, {
      request_type: newType,
      request_number: newNumber || `${newType.charAt(0).toUpperCase()}-${requests.length + 1}`,
      question: newQuestion.trim(),
      served_date: newServedDate || undefined,
      response_due_date: newDueDate || undefined,
    });
    setNewQuestion('');
    setNewNumber('');
    setNewServedDate('');
    setNewDueDate('');
    setShowAddForm(false);
    loadData();
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this discovery request?')) return;
    await deleteDiscoveryRequest(id);
    setSelectedIds(prev => { prev.delete(id); return new Set(prev); });
    loadData();
  };

  const handleGenerateResponses = async () => {
    if (!caseId || selectedIds.size === 0) return;
    setGenerating(true);
    try {
      await generateDiscoveryResponses(caseId, Array.from(selectedIds), { jurisdiction });
      setSelectedIds(new Set());
      loadData();
    } catch (err) {
      console.error('Generate error:', err);
    } finally {
      setGenerating(false);
    }
  };

  const handleBulkImport = async () => {
    if (!caseId || !bulkText.trim()) return;
    setParsing(true);
    try {
      const parsed = await parseDiscoveryDocument(caseId, bulkText, bulkType);
      if (parsed.length > 0) {
        await bulkImportDiscoveryRequests(caseId, parsed.map(p => ({
          request_type: bulkType,
          request_number: p.request_number,
          question: p.question,
        })));
        setBulkText('');
        setShowBulkImport(false);
        loadData();
      }
    } finally {
      setParsing(false);
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    if (selectedIds.size === filtered.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map(r => r.id)));
    }
  };

  const handleStatusUpdate = async (id: string, status: string) => {
    await updateDiscoveryRequest(id, { status });
    loadData();
  };

  const handleSaveEdit = async (id: string, response: string) => {
    await updateDiscoveryRequest(id, { response, status: 'reviewed' });
    setEditingId(null);
    loadData();
  };

  const copyResponse = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <FileSearch size={22} /> Discovery Manager
          </h2>
          <p className="text-gray-400 text-sm mt-1">
            Track discovery requests, auto-generate AI responses, and manage deadlines
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowBulkImport(!showBulkImport)}
            className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-sm rounded-lg text-gray-300 flex items-center gap-1.5"
          >
            <Upload size={14} /> Bulk Import
          </button>
          <button
            onClick={() => setShowAddForm(!showAddForm)}
            className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-sm rounded-lg text-white flex items-center gap-1.5"
          >
            <Plus size={14} /> Add Request
          </button>
        </div>
      </div>

      {/* Case Selector */}
      {!activeCase && (
        <select
          value={selectedCase}
          onChange={(e) => { setSelectedCase(e.target.value); setRequests([]); setStats(null); }}
          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm"
        >
          <option value="">— Select a case —</option>
          {cases.map((c: any) => (
            <option key={c.id} value={c.id}>{c.title || c.name || c.id}</option>
          ))}
        </select>
      )}

      {/* Stats Bar */}
      {stats && stats.total > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {[
            { label: 'Total', value: stats.total, icon: <BarChart3 size={14} />, color: 'text-gray-300' },
            { label: 'Pending', value: stats.pending, icon: <Clock size={14} />, color: 'text-yellow-400' },
            { label: 'AI Drafted', value: stats.drafted, icon: <Sparkles size={14} />, color: 'text-blue-400' },
            { label: 'Finalized', value: stats.finalized, icon: <CheckCircle size={14} />, color: 'text-green-400' },
            { label: 'Overdue', value: stats.overdue, icon: <AlertTriangle size={14} />, color: stats.overdue > 0 ? 'text-red-400' : 'text-gray-500' },
          ].map(s => (
            <div key={s.label} className="bg-gray-800/60 rounded-lg p-3 text-center">
              <div className={`flex items-center justify-center gap-1 ${s.color} text-sm`}>
                {s.icon} {s.label}
              </div>
              <div className={`text-2xl font-bold mt-1 ${s.color}`}>{s.value}</div>
            </div>
          ))}
        </div>
      )}

      {/* Add Form */}
      {showAddForm && (
        <div className="bg-gray-800/70 rounded-xl p-4 border border-gray-700 space-y-3">
          <h3 className="text-sm font-medium text-gray-300">New Discovery Request</h3>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-500">Type</label>
              <select
                value={newType}
                onChange={(e) => setNewType(e.target.value as DiscoveryRequestType)}
                className="w-full mt-1 bg-gray-700 border border-gray-600 rounded px-2 py-1.5 text-sm text-white"
              >
                {Object.entries(REQUEST_TYPE_LABELS).map(([key, val]) => (
                  <option key={key} value={key}>{val.icon} {val.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500">Request Number</label>
              <input
                value={newNumber}
                onChange={(e) => setNewNumber(e.target.value)}
                placeholder="e.g., INT-1"
                className="w-full mt-1 bg-gray-700 border border-gray-600 rounded px-2 py-1.5 text-sm text-white"
              />
            </div>
          </div>

          <div>
            <label className="text-xs text-gray-500">Question / Request</label>
            <textarea
              value={newQuestion}
              onChange={(e) => setNewQuestion(e.target.value)}
              rows={3}
              placeholder="Enter the discovery request text..."
              className="w-full mt-1 bg-gray-700 border border-gray-600 rounded px-2 py-1.5 text-sm text-white resize-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-500">Date Served</label>
              <input
                type="date"
                value={newServedDate}
                onChange={(e) => setNewServedDate(e.target.value)}
                className="w-full mt-1 bg-gray-700 border border-gray-600 rounded px-2 py-1.5 text-sm text-white"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500">Response Due Date</label>
              <input
                type="date"
                value={newDueDate}
                onChange={(e) => setNewDueDate(e.target.value)}
                className="w-full mt-1 bg-gray-700 border border-gray-600 rounded px-2 py-1.5 text-sm text-white"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <button onClick={() => setShowAddForm(false)} className="px-3 py-1.5 text-sm text-gray-400 hover:text-gray-300">
              Cancel
            </button>
            <button
              onClick={handleAddRequest}
              disabled={!newQuestion.trim() || !caseId}
              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 text-sm rounded-lg text-white"
            >
              Add Request
            </button>
          </div>
        </div>
      )}

      {/* Bulk Import */}
      {showBulkImport && (
        <div className="bg-gray-800/70 rounded-xl p-4 border border-gray-700 space-y-3">
          <h3 className="text-sm font-medium text-gray-300">Bulk Import Discovery Requests</h3>
          <p className="text-xs text-gray-500">
            Paste the full text of opposing party's discovery requests. AI will parse them into individual requests.
          </p>

          <select
            value={bulkType}
            onChange={(e) => setBulkType(e.target.value as DiscoveryRequestType)}
            className="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1.5 text-sm text-white"
          >
            {Object.entries(REQUEST_TYPE_LABELS).map(([key, val]) => (
              <option key={key} value={key}>{val.icon} {val.label}</option>
            ))}
          </select>

          <textarea
            value={bulkText}
            onChange={(e) => setBulkText(e.target.value)}
            rows={8}
            placeholder="Paste the full discovery document text here..."
            className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm text-white resize-none font-mono"
          />

          <div className="flex justify-end gap-2">
            <button onClick={() => setShowBulkImport(false)} className="px-3 py-1.5 text-sm text-gray-400">
              Cancel
            </button>
            <button
              onClick={handleBulkImport}
              disabled={!bulkText.trim() || !caseId || parsing}
              className="px-3 py-1.5 bg-purple-600 hover:bg-purple-500 disabled:bg-gray-700 text-sm rounded-lg text-white flex items-center gap-1.5"
            >
              {parsing ? <Loader size={14} className="animate-spin" /> : <Sparkles size={14} />}
              {parsing ? 'Parsing...' : 'Import with AI'}
            </button>
          </div>
        </div>
      )}

      {/* Filters & Actions Bar */}
      {requests.length > 0 && (
        <div className="flex items-center gap-3 flex-wrap">
          <button
            onClick={selectAll}
            className="text-xs text-gray-400 hover:text-gray-300 px-2 py-1 border border-gray-700 rounded"
          >
            {selectedIds.size === filtered.length ? 'Deselect All' : 'Select All'}
          </button>

          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-gray-300"
          >
            <option value="all">All Types</option>
            {Object.entries(REQUEST_TYPE_LABELS).map(([key, val]) => (
              <option key={key} value={key}>{val.label}</option>
            ))}
          </select>

          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-gray-300"
          >
            <option value="all">All Statuses</option>
            {Object.entries(STATUS_STYLES).map(([key, val]) => (
              <option key={key} value={key}>{val.label}</option>
            ))}
          </select>

          <div className="flex-1" />

          {selectedIds.size > 0 && (
            <>
              <input
                value={jurisdiction}
                onChange={(e) => setJurisdiction(e.target.value)}
                placeholder="Jurisdiction (optional)"
                className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-gray-300 w-40"
              />
              <button
                onClick={handleGenerateResponses}
                disabled={generating}
                className="px-3 py-1.5 bg-purple-600 hover:bg-purple-500 disabled:bg-gray-700 text-sm rounded-lg text-white flex items-center gap-1.5"
              >
                {generating ? <Loader size={14} className="animate-spin" /> : <Sparkles size={14} />}
                {generating ? 'Generating...' : `Generate AI Responses (${selectedIds.size})`}
              </button>
            </>
          )}

          <button onClick={loadData} className="text-gray-500 hover:text-gray-400 p-1">
            <RefreshCw size={14} />
          </button>
        </div>
      )}

      {/* Request List */}
      {loading ? (
        <div className="text-center py-12 text-gray-500">
          <Loader size={24} className="animate-spin mx-auto mb-2" />
          Loading discovery requests...
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <FileSearch size={36} className="mx-auto mb-3 opacity-50" />
          <p>No discovery requests yet</p>
          <p className="text-sm mt-1">Add individual requests or bulk import from a document</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((req) => {
            const typeInfo = REQUEST_TYPE_LABELS[req.request_type] || REQUEST_TYPE_LABELS.interrogatory;
            const statusInfo = STATUS_STYLES[req.status] || STATUS_STYLES.pending;
            const overdue = isOverdue(req);
            const expanded = expandedId === req.id;
            const editing = editingId === req.id;

            return (
              <div
                key={req.id}
                className={`bg-gray-800/60 rounded-lg border ${
                  overdue ? 'border-red-700/50' : selectedIds.has(req.id) ? 'border-blue-600/50' : 'border-gray-700/50'
                } transition-colors`}
              >
                {/* Header Row */}
                <div className="px-4 py-3 flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={selectedIds.has(req.id)}
                    onChange={() => toggleSelect(req.id)}
                    className="rounded bg-gray-700 border-gray-600"
                  />

                  <span className={`text-sm font-mono ${typeInfo.color}`}>
                    {typeInfo.icon} {req.request_number}
                  </span>

                  <p className="flex-1 text-sm text-gray-300 truncate">{req.question}</p>

                  {overdue && (
                    <span className="text-xs text-red-400 flex items-center gap-1">
                      <AlertTriangle size={12} /> Overdue
                    </span>
                  )}

                  {req.response_due_date && !overdue && (
                    <span className="text-xs text-gray-500">
                      {daysUntilDue(req.response_due_date)}d left
                    </span>
                  )}

                  <span className={`text-xs px-2 py-0.5 rounded-full ${statusInfo.bg} ${statusInfo.color}`}>
                    {statusInfo.label}
                  </span>

                  <button
                    onClick={() => setExpandedId(expanded ? null : req.id)}
                    className="text-gray-500 hover:text-gray-400"
                  >
                    {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  </button>

                  <button
                    onClick={() => handleDelete(req.id)}
                    className="text-gray-600 hover:text-red-400"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>

                {/* Expanded Content */}
                {expanded && (
                  <div className="px-4 pb-3 border-t border-gray-700/50 pt-3 space-y-3">
                    {/* Question */}
                    <div>
                      <label className="text-xs text-gray-500 block mb-1">Request</label>
                      <p className="text-sm text-gray-300 whitespace-pre-wrap">{req.question}</p>
                    </div>

                    {/* Dates */}
                    <div className="flex gap-4 text-xs text-gray-500">
                      {req.served_date && <span>Served: {req.served_date}</span>}
                      {req.response_due_date && (
                        <span className={overdue ? 'text-red-400' : ''}>
                          Due: {req.response_due_date}
                        </span>
                      )}
                      {req.response_date && <span className="text-green-400">Responded: {req.response_date}</span>}
                    </div>

                    {/* Response */}
                    {req.response && (
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="text-xs text-gray-500">Response</label>
                          <div className="flex items-center gap-1.5">
                            <button
                              onClick={() => copyResponse(req.response || '')}
                              className="text-xs text-gray-500 hover:text-gray-400 flex items-center gap-1"
                            >
                              <Copy size={12} /> Copy
                            </button>
                            <button
                              onClick={() => setEditingId(editing ? null : req.id)}
                              className="text-xs text-gray-500 hover:text-blue-400 flex items-center gap-1"
                            >
                              <Edit3 size={12} /> Edit
                            </button>
                          </div>
                        </div>
                        {editing ? (
                          <div className="space-y-2">
                            <textarea
                              defaultValue={req.response}
                              id={`edit-${req.id}`}
                              rows={6}
                              className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm text-white resize-none"
                            />
                            <div className="flex justify-end gap-2">
                              <button onClick={() => setEditingId(null)} className="text-xs text-gray-400">Cancel</button>
                              <button
                                onClick={() => {
                                  const el = document.getElementById(`edit-${req.id}`) as HTMLTextAreaElement;
                                  handleSaveEdit(req.id, el.value);
                                }}
                                className="text-xs text-blue-400 flex items-center gap-1"
                              >
                                <Save size={12} /> Save
                              </button>
                            </div>
                          </div>
                        ) : (
                          <p className="text-sm text-gray-300 whitespace-pre-wrap bg-gray-900/50 rounded p-3 max-h-60 overflow-y-auto">
                            {req.response}
                          </p>
                        )}
                      </div>
                    )}

                    {/* Objections */}
                    {req.objections?.length > 0 && (
                      <div>
                        <label className="text-xs text-gray-500 block mb-1">Objections</label>
                        <ul className="space-y-1">
                          {req.objections.map((obj, i) => (
                            <li key={i} className="text-xs text-red-300 bg-red-900/20 rounded px-2 py-1">
                              ⚠️ {obj}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Status Actions */}
                    <div className="flex items-center gap-2 pt-2 border-t border-gray-700/50">
                      <span className="text-xs text-gray-500">Set status:</span>
                      {Object.entries(STATUS_STYLES).map(([key, val]) => (
                        <button
                          key={key}
                          onClick={() => handleStatusUpdate(req.id, key)}
                          className={`text-xs px-2 py-0.5 rounded-full ${
                            req.status === key ? val.bg + ' ' + val.color : 'bg-gray-700 text-gray-500 hover:text-gray-300'
                          }`}
                        >
                          {val.label}
                        </button>
                      ))}
                    </div>
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

export default DiscoveryManager;
