import React, { useState, useEffect } from 'react';
import { Clock, Plus, Trash2, AlertTriangle, CheckCircle, Calendar, Loader, Bell } from 'lucide-react';
import { getSupabase, isSupabaseConfigured } from '../services/supabaseClient';

interface Deadline {
  id: string;
  title: string;
  case_name: string;
  deadline_type: string;
  due_date: string;
  notes: string;
  status: string;       // pending | completed | overdue | dismissed
  priority: string;     // low | medium | high | critical
  created_at: string;
  daysRemaining?: number;
}

const DEADLINE_TYPES = [
  'Statute of Limitations', 'Answer Due', 'Discovery Cutoff', 'Motion Filing',
  'Response to Motion', 'Expert Designation', 'Pretrial Conference', 'Trial Date',
  'Appeal Deadline', 'FOIA Response', 'Demand Response', 'Deposition',
  'Mediation', 'Arbitration', 'Other'
];

const FIRM_ID = 'casebuddy-default';

export default function DeadlineEngine() {
  const [deadlines, setDeadlines] = useState<Deadline[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [filter, setFilter] = useState<'all' | 'pending' | 'completed' | 'overdue'>('all');
  const [form, setForm] = useState({
    title: '', case_name: '', deadline_type: 'Statute of Limitations',
    due_date: '', priority: 'high', notes: ''
  });

  const supabase = getSupabase();

  const calcDays = (dueDate: string) => {
    const diff = new Date(dueDate).getTime() - Date.now();
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  };

  // ── Load from Supabase ────────────────────────────────────────────────────
  useEffect(() => {
    loadDeadlines();
  }, []);

  async function loadDeadlines() {
    setLoading(true);
    if (!supabase || !isSupabaseConfigured) {
      // Fallback: localStorage
      const saved = localStorage.getItem('casebuddy_deadlines_backup');
      if (saved) {
        const parsed = JSON.parse(saved).map((d: any) => ({ ...d, daysRemaining: calcDays(d.due_date || d.dueDate) }));
        setDeadlines(parsed);
      }
      setLoading(false);
      return;
    }

    const { data, error } = await supabase
      .from('deadlines')
      .select('*')
      .eq('firm_id', FIRM_ID)
      .order('due_date', { ascending: true });

    if (error) {
      console.error('[DeadlineEngine] load error:', error);
    } else {
      const enriched = (data || []).map(d => ({ ...d, daysRemaining: calcDays(d.due_date) }));
      setDeadlines(enriched);
      // Keep emergency backup in localStorage
      localStorage.setItem('casebuddy_deadlines_backup', JSON.stringify(enriched));
    }
    setLoading(false);
  }

  // ── Add Deadline ──────────────────────────────────────────────────────────
  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title || !form.due_date) return;
    setSaving(true);

    const newDeadline = {
      firm_id: FIRM_ID,
      title: form.title,
      case_name: form.case_name,
      deadline_type: form.deadline_type,
      due_date: form.due_date,
      priority: form.priority,
      notes: form.notes,
      status: 'pending',
      assigned_agent: 'sol'
    };

    if (supabase && isSupabaseConfigured) {
      const { data, error } = await supabase
        .from('deadlines')
        .insert([newDeadline])
        .select()
        .single();

      if (error) {
        console.error('[DeadlineEngine] insert error:', error);
      } else if (data) {
        const enriched = { ...data, daysRemaining: calcDays(data.due_date) };
        setDeadlines(prev => [...prev, enriched].sort((a,b) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime()));
      }
    }

    setForm({ title: '', case_name: '', deadline_type: 'Statute of Limitations', due_date: '', priority: 'high', notes: '' });
    setShowForm(false);
    setSaving(false);
  }

  // ── Complete Deadline ─────────────────────────────────────────────────────
  async function handleComplete(id: string) {
    if (supabase && isSupabaseConfigured) {
      await supabase.from('deadlines').update({ status: 'completed' }).eq('id', id);
    }
    setDeadlines(prev => prev.map(d => d.id === id ? { ...d, status: 'completed' } : d));
  }

  // ── Delete Deadline ───────────────────────────────────────────────────────
  async function handleDelete(id: string) {
    if (!confirm('Delete this deadline?')) return;
    if (supabase && isSupabaseConfigured) {
      await supabase.from('deadlines').delete().eq('id', id);
    }
    setDeadlines(prev => prev.filter(d => d.id !== id));
  }

  const filtered = deadlines.filter(d => {
    if (filter === 'all') return true;
    if (filter === 'overdue') return (d.daysRemaining ?? 0) < 0 && d.status !== 'completed';
    return d.status === filter;
  });

  const getPriorityColor = (priority: string) => ({
    critical: 'text-red-400 bg-red-900/30',
    high: 'text-orange-400 bg-orange-900/30',
    medium: 'text-yellow-400 bg-yellow-900/30',
    low: 'text-green-400 bg-green-900/30'
  }[priority] || 'text-slate-400 bg-slate-800');

  const getDaysColor = (days: number, status: string) => {
    if (status === 'completed') return 'text-green-400';
    if (days < 0) return 'text-red-400 font-bold';
    if (days <= 7) return 'text-orange-400 font-bold';
    if (days <= 30) return 'text-yellow-400';
    return 'text-slate-400';
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white p-6">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <Clock className="w-8 h-8 text-amber-400" />
            <div>
              <h1 className="text-2xl font-bold">Deadline Engine</h1>
              <p className="text-slate-400 text-sm">
                {isSupabaseConfigured ? '☁️ Cloud synced' : '⚠️ Local backup mode'}
              </p>
            </div>
          </div>
          <button onClick={() => setShowForm(!showForm)}
            className="flex items-center gap-2 bg-amber-500 hover:bg-amber-400 text-black px-4 py-2 rounded-lg font-semibold transition">
            <Plus className="w-4 h-4" /> Add Deadline
          </button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-4 gap-4 mb-6">
          {[
            { label: 'Total', count: deadlines.length, color: 'text-slate-300' },
            { label: 'Pending', count: deadlines.filter(d => d.status === 'pending').length, color: 'text-amber-400' },
            { label: 'Overdue', count: deadlines.filter(d => (d.daysRemaining ?? 0) < 0 && d.status !== 'completed').length, color: 'text-red-400' },
            { label: 'Completed', count: deadlines.filter(d => d.status === 'completed').length, color: 'text-green-400' },
          ].map(s => (
            <div key={s.label} className="bg-slate-900 rounded-xl p-4 border border-slate-800">
              <div className={`text-2xl font-bold ${s.color}`}>{s.count}</div>
              <div className="text-slate-400 text-sm">{s.label}</div>
            </div>
          ))}
        </div>

        {/* Add Form */}
        {showForm && (
          <form onSubmit={handleAdd} className="bg-slate-900 rounded-xl p-6 mb-6 border border-amber-500/30">
            <h2 className="text-lg font-semibold mb-4 text-amber-400">New Deadline</h2>
            <div className="grid grid-cols-2 gap-4">
              <input required value={form.title} onChange={e => setForm({...form, title: e.target.value})}
                placeholder="Deadline title *" className="col-span-2 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm" />
              <input value={form.case_name} onChange={e => setForm({...form, case_name: e.target.value})}
                placeholder="Case name" className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm" />
              <select value={form.deadline_type} onChange={e => setForm({...form, deadline_type: e.target.value})}
                className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm">
                {DEADLINE_TYPES.map(t => <option key={t}>{t}</option>)}
              </select>
              <input required type="date" value={form.due_date} onChange={e => setForm({...form, due_date: e.target.value})}
                className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm" />
              <select value={form.priority} onChange={e => setForm({...form, priority: e.target.value})}
                className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm">
                <option value="critical">🔴 Critical</option>
                <option value="high">🟠 High</option>
                <option value="medium">🟡 Medium</option>
                <option value="low">🟢 Low</option>
              </select>
              <textarea value={form.notes} onChange={e => setForm({...form, notes: e.target.value})}
                placeholder="Notes..." rows={2}
                className="col-span-2 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm resize-none" />
            </div>
            <div className="flex gap-3 mt-4">
              <button type="submit" disabled={saving}
                className="flex items-center gap-2 bg-amber-500 hover:bg-amber-400 text-black px-4 py-2 rounded-lg font-semibold text-sm transition disabled:opacity-50">
                {saving ? <Loader className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Save Deadline
              </button>
              <button type="button" onClick={() => setShowForm(false)}
                className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-sm transition">Cancel</button>
            </div>
          </form>
        )}

        {/* Filter Tabs */}
        <div className="flex gap-2 mb-4">
          {(['all','pending','overdue','completed'] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={`px-3 py-1 rounded-full text-sm font-medium transition capitalize ${filter===f ? 'bg-amber-500 text-black' : 'bg-slate-800 text-slate-400 hover:text-white'}`}>
              {f}
            </button>
          ))}
        </div>

        {/* Deadline List */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader className="w-6 h-6 animate-spin text-amber-400" />
            <span className="ml-3 text-slate-400">Loading from cloud...</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 text-slate-500">
            <Calendar className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p>No deadlines found. Add your first deadline above.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map(d => (
              <div key={d.id} className={`bg-slate-900 rounded-xl p-4 border transition ${d.status === 'completed' ? 'border-green-800/40 opacity-60' : (d.daysRemaining ?? 0) < 0 ? 'border-red-700/50' : 'border-slate-800'}`}>
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className={`font-semibold ${d.status === 'completed' ? 'line-through text-slate-500' : 'text-white'}`}>{d.title}</h3>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${getPriorityColor(d.priority)}`}>{d.priority}</span>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-400">{d.deadline_type}</span>
                    </div>
                    {d.case_name && <p className="text-sm text-slate-400 mt-0.5">📁 {d.case_name}</p>}
                    {d.notes && <p className="text-sm text-slate-500 mt-1">{d.notes}</p>}
                    <div className="flex items-center gap-4 mt-2">
                      <span className="text-xs text-slate-500">Due: {new Date(d.due_date).toLocaleDateString()}</span>
                      <span className={`text-xs ${getDaysColor(d.daysRemaining ?? 0, d.status)}`}>
                        {d.status === 'completed' ? '✅ Completed' :
                          (d.daysRemaining ?? 0) < 0 ? `⚠️ ${Math.abs(d.daysRemaining ?? 0)} days overdue` :
                          (d.daysRemaining ?? 0) === 0 ? '🔴 Due TODAY' :
                          `${d.daysRemaining} days remaining`}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {d.status !== 'completed' && (
                      <button onClick={() => handleComplete(d.id)} title="Mark complete"
                        className="p-1.5 rounded-lg hover:bg-green-900/40 text-green-500 transition">
                        <CheckCircle className="w-4 h-4" />
                      </button>
                    )}
                    <button onClick={() => handleDelete(d.id)} title="Delete"
                      className="p-1.5 rounded-lg hover:bg-red-900/40 text-red-500 transition">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
