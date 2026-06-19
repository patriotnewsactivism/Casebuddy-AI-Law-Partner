import React, { useState, useEffect } from 'react';
import { Search, Plus, Loader, Copy, Trash2, AlertTriangle, CheckCircle, Clock, RefreshCw } from 'lucide-react';
import { getSupabase, isSupabaseConfigured } from '../services/supabaseClient';

interface FOIARequest {
  id: string;
  agency: string;
  subject: string;
  description: string;
  request_date: string;
  due_date?: string;
  status: string;
  tracking_number: string;
  response_received: boolean;
  notes: string;
  case_id?: string;
  created_at: string;
}

const STATUS_OPTIONS = [
  'submitted', 'acknowledged', 'processing', 'fulfilled', 'denied', 'appealed'
];

const FEDERAL_AGENCIES = [
  'FBI', 'CIA', 'DEA', 'ATF', 'IRS', 'DHS', 'CBP', 'ICE', 'USCIS',
  'DOJ', 'DOD', 'DOE', 'HHS', 'FDA', 'EPA', 'FTC', 'SEC', 'FCC',
  'USPS', 'VA', 'SSA', 'State Department', 'Treasury', 'Other Federal',
  'State Agency', 'Local Government'
];

const FIRM_ID = 'casebuddy-default';

export default function FOIATracker() {
  const [requests, setRequests] = useState<FOIARequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [filter, setFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [form, setForm] = useState({
    agency: '', subject: '', description: '',
    request_date: new Date().toISOString().split('T')[0],
    due_date: '', tracking_number: '', notes: '', case_id: ''
  });

  const supabase = getSupabase();

  useEffect(() => { loadRequests(); }, []);

  async function loadRequests() {
    setLoading(true);
    if (!supabase || !isSupabaseConfigured) {
      const saved = localStorage.getItem('casebuddy_foia_backup');
      if (saved) setRequests(JSON.parse(saved));
      setLoading(false);
      return;
    }

    const { data, error } = await supabase
      .from('foia_requests')
      .select('*')
      .eq('firm_id', FIRM_ID)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[FOIATracker] load error:', error);
    } else {
      setRequests(data || []);
      localStorage.setItem('casebuddy_foia_backup', JSON.stringify(data || []));
    }
    setLoading(false);
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!form.agency || !form.subject) return;
    setSaving(true);

    const newReq = {
      firm_id: FIRM_ID,
      agency: form.agency,
      subject: form.subject,
      description: form.description,
      request_date: form.request_date,
      due_date: form.due_date || null,
      tracking_number: form.tracking_number,
      notes: form.notes,
      case_id: form.case_id,
      status: 'submitted',
      response_received: false,
      requester_name: 'CaseBuddy Law Firm',
      assigned_agent: 'sierra'
    };

    if (supabase && isSupabaseConfigured) {
      const { data, error } = await supabase.from('foia_requests').insert([newReq]).select().single();
      if (!error && data) {
        setRequests(prev => [data, ...prev]);
      }
    }

    setForm({ agency: '', subject: '', description: '', request_date: new Date().toISOString().split('T')[0], due_date: '', tracking_number: '', notes: '', case_id: '' });
    setShowForm(false);
    setSaving(false);
  }

  async function updateStatus(id: string, status: string) {
    if (supabase && isSupabaseConfigured) {
      await supabase.from('foia_requests').update({ status }).eq('id', id);
    }
    setRequests(prev => prev.map(r => r.id === id ? { ...r, status } : r));
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this FOIA request?')) return;
    if (supabase && isSupabaseConfigured) {
      await supabase.from('foia_requests').delete().eq('id', id);
    }
    setRequests(prev => prev.filter(r => r.id !== id));
  }

  const getStatusColor = (status: string) => ({
    submitted: 'text-blue-400 bg-blue-900/30',
    acknowledged: 'text-cyan-400 bg-cyan-900/30',
    processing: 'text-yellow-400 bg-yellow-900/30',
    fulfilled: 'text-green-400 bg-green-900/30',
    denied: 'text-red-400 bg-red-900/30',
    appealed: 'text-orange-400 bg-orange-900/30',
  }[status] || 'text-slate-400 bg-slate-800');

  const filtered = requests.filter(r => {
    const matchFilter = filter === 'all' || r.status === filter;
    const matchSearch = !search || r.agency.toLowerCase().includes(search.toLowerCase()) || r.subject.toLowerCase().includes(search.toLowerCase());
    return matchFilter && matchSearch;
  });

  return (
    <div className="min-h-screen bg-slate-950 text-white p-6">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <Search className="w-8 h-8 text-cyan-400" />
            <div>
              <h1 className="text-2xl font-bold">FOIA Tracker</h1>
              <p className="text-slate-400 text-sm">
                {isSupabaseConfigured ? '☁️ Cloud synced' : '⚠️ Local backup mode'}
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={loadRequests} className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 transition" title="Refresh">
              <RefreshCw className="w-4 h-4 text-slate-400" />
            </button>
            <button onClick={() => setShowForm(!showForm)}
              className="flex items-center gap-2 bg-cyan-500 hover:bg-cyan-400 text-black px-4 py-2 rounded-lg font-semibold transition">
              <Plus className="w-4 h-4" /> New FOIA Request
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          {[
            { label: 'Total', count: requests.length, color: 'text-slate-300' },
            { label: 'Pending', count: requests.filter(r => ['submitted','acknowledged','processing'].includes(r.status)).length, color: 'text-yellow-400' },
            { label: 'Fulfilled', count: requests.filter(r => r.status === 'fulfilled').length, color: 'text-green-400' },
          ].map(s => (
            <div key={s.label} className="bg-slate-900 rounded-xl p-4 border border-slate-800">
              <div className={`text-2xl font-bold ${s.color}`}>{s.count}</div>
              <div className="text-slate-400 text-sm">{s.label}</div>
            </div>
          ))}
        </div>

        {/* Add Form */}
        {showForm && (
          <form onSubmit={handleAdd} className="bg-slate-900 rounded-xl p-6 mb-6 border border-cyan-500/30">
            <h2 className="text-lg font-semibold mb-4 text-cyan-400">New FOIA Request</h2>
            <div className="grid grid-cols-2 gap-4">
              <select required value={form.agency} onChange={e => setForm({...form, agency: e.target.value})}
                className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm">
                <option value="">Select Agency *</option>
                {FEDERAL_AGENCIES.map(a => <option key={a}>{a}</option>)}
              </select>
              <input value={form.tracking_number} onChange={e => setForm({...form, tracking_number: e.target.value})}
                placeholder="Tracking number" className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm" />
              <input required value={form.subject} onChange={e => setForm({...form, subject: e.target.value})}
                placeholder="Subject / records requested *" className="col-span-2 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm" />
              <textarea value={form.description} onChange={e => setForm({...form, description: e.target.value})}
                placeholder="Detailed description of records..." rows={3}
                className="col-span-2 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm resize-none" />
              <div className="flex flex-col gap-1">
                <label className="text-xs text-slate-400">Request Date</label>
                <input type="date" value={form.request_date} onChange={e => setForm({...form, request_date: e.target.value})}
                  className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm" />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-slate-400">Response Due Date</label>
                <input type="date" value={form.due_date} onChange={e => setForm({...form, due_date: e.target.value})}
                  className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm" />
              </div>
              <input value={form.case_id} onChange={e => setForm({...form, case_id: e.target.value})}
                placeholder="Related case ID (optional)" className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm" />
              <input value={form.notes} onChange={e => setForm({...form, notes: e.target.value})}
                placeholder="Notes" className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm" />
            </div>
            <div className="flex gap-3 mt-4">
              <button type="submit" disabled={saving}
                className="flex items-center gap-2 bg-cyan-500 hover:bg-cyan-400 text-black px-4 py-2 rounded-lg font-semibold text-sm transition disabled:opacity-50">
                {saving ? <Loader className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Submit Request
              </button>
              <button type="button" onClick={() => setShowForm(false)}
                className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-sm transition">Cancel</button>
            </div>
          </form>
        )}

        {/* Search + Filter */}
        <div className="flex gap-3 mb-4">
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search agency or subject..."
            className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm" />
          <div className="flex gap-1">
            {['all', ...STATUS_OPTIONS].map(f => (
              <button key={f} onClick={() => setFilter(f)}
                className={`px-2 py-1 rounded-full text-xs font-medium transition capitalize ${filter===f ? 'bg-cyan-500 text-black' : 'bg-slate-800 text-slate-400 hover:text-white'}`}>
                {f}
              </button>
            ))}
          </div>
        </div>

        {/* List */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader className="w-6 h-6 animate-spin text-cyan-400" />
            <span className="ml-3 text-slate-400">Loading from cloud...</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 text-slate-500">
            <Search className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p>No FOIA requests found.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map(r => (
              <div key={r.id} className="bg-slate-900 rounded-xl p-4 border border-slate-800">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <h3 className="font-semibold text-white">{r.agency}</h3>
                      <span className={`text-xs px-2 py-0.5 rounded-full capitalize ${getStatusColor(r.status)}`}>{r.status}</span>
                      {r.tracking_number && (
                        <span className="text-xs text-slate-500 font-mono">#{r.tracking_number}</span>
                      )}
                    </div>
                    <p className="text-sm text-slate-300">{r.subject}</p>
                    {r.description && <p className="text-xs text-slate-500 mt-1">{r.description}</p>}
                    <div className="flex gap-4 mt-2 text-xs text-slate-500">
                      <span>Submitted: {new Date(r.request_date).toLocaleDateString()}</span>
                      {r.due_date && <span>Due: {new Date(r.due_date).toLocaleDateString()}</span>}
                      {r.case_id && <span>Case: {r.case_id}</span>}
                    </div>
                    {/* Status updater */}
                    <div className="flex gap-1 mt-2">
                      {STATUS_OPTIONS.map(s => (
                        <button key={s} onClick={() => updateStatus(r.id, s)}
                          className={`text-xs px-2 py-0.5 rounded-full transition capitalize ${r.status===s ? getStatusColor(s) : 'bg-slate-800 text-slate-500 hover:text-white'}`}>
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>
                  <button onClick={() => handleDelete(r.id)}
                    className="p-1.5 rounded-lg hover:bg-red-900/40 text-red-500 transition shrink-0">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
