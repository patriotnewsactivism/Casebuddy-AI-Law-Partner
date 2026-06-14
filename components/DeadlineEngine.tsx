import React, { useState, useEffect } from 'react';
import { Clock, Plus, Trash2, AlertTriangle, CheckCircle, Calendar, Loader, Bell } from 'lucide-react';

interface Deadline {
  id: string;
  title: string;
  caseTitle: string;
  deadlineType: string;
  dueDate: string;
  jurisdiction: string;
  notes: string;
  completed: boolean;
  createdAt: string;
  daysRemaining?: number;
}

const DEADLINE_TYPES = [
  'Statute of Limitations', 'Answer Due', 'Discovery Cutoff', 'Motion Filing',
  'Response to Motion', 'Expert Designation', 'Pretrial Conference', 'Trial Date',
  'Appeal Deadline', 'FOIA Response', 'Demand Response', 'Deposition',
  'Settlement Conference', 'Mediation', 'Arbitration', 'Filing Fee Due',
];

const SOL_RULES: Record<string, Record<string, string>> = {
  'Personal Injury': {
    'Federal': '3 years (general)',
    'California': '2 years — Cal. CCP § 335.1',
    'New York': '3 years — CPLR § 214',
    'Texas': '2 years — Tex. Civ. Prac. & Rem. § 16.003',
    'Florida': '4 years — Fla. Stat. § 95.11(3)(a)',
    'Illinois': '2 years — 735 ILCS 5/13-202',
  },
  'Contract': {
    'Federal': '6 years (written), 3 years (oral)',
    'California': '4 years (written) — Cal. CCP § 337',
    'New York': '6 years — CPLR § 213',
    'Texas': '4 years — Tex. Civ. Prac. & Rem. § 16.004',
    'Florida': '5 years (written) — Fla. Stat. § 95.11(2)(b)',
    'Illinois': '10 years (written) — 735 ILCS 5/13-206',
  },
  'Medical Malpractice': {
    'Federal': '2-3 years depending on claim',
    'California': '3 years or 1 year from discovery — Cal. CCP § 340.5',
    'New York': '2.5 years — CPLR § 214-a',
    'Texas': '2 years — Tex. Civ. Prac. & Rem. § 74.251',
    'Florida': '2 years — Fla. Stat. § 95.11(4)(b)',
    'Illinois': '2 years — 735 ILCS 5/13-212',
  },
  'Civil Rights (§1983)': {
    'Federal': 'Borrows state personal injury SOL',
    'California': '2 years',
    'New York': '3 years',
    'Texas': '2 years',
    'Florida': '4 years',
    'Illinois': '2 years',
  },
  'Defamation': {
    'Federal': 'Borrows state SOL',
    'California': '1 year — Cal. CCP § 340(c)',
    'New York': '1 year — CPLR § 215',
    'Texas': '1 year — Tex. Civ. Prac. & Rem. § 16.002',
    'Florida': '2 years — Fla. Stat. § 95.11(4)(g)',
    'Illinois': '1 year — 735 ILCS 5/13-201',
  },
  'FOIA': {
    'Federal': '6 years to sue — 28 U.S.C. § 2401(a)',
    'California': '45 days to appeal agency denial',
    'New York': '4 months after final agency determination',
    'Texas': '30 days to appeal denial',
    'Florida': 'No specific SOL — general 4-year rule',
    'Illinois': '60 days to file suit after denial',
  },
};

const getDaysRemaining = (dueDate: string) => {
  const due = new Date(dueDate);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
};

const urgencyColor = (days: number, completed: boolean) => {
  if (completed) return 'border-green-500/30 bg-green-500/5';
  if (days < 0) return 'border-red-500/50 bg-red-500/10';
  if (days <= 7) return 'border-red-500/30 bg-red-500/5';
  if (days <= 30) return 'border-amber-500/30 bg-amber-500/5';
  return 'border-slate-700 bg-slate-800/30';
};

const urgencyBadge = (days: number, completed: boolean) => {
  if (completed) return <span className="text-xs bg-green-500/20 text-green-300 border border-green-500/30 px-2 py-0.5 rounded-full">✓ Done</span>;
  if (days < 0) return <span className="text-xs bg-red-500/20 text-red-300 border border-red-500/30 px-2 py-0.5 rounded-full">OVERDUE {Math.abs(days)}d</span>;
  if (days === 0) return <span className="text-xs bg-red-500/30 text-red-200 border border-red-500/50 px-2 py-0.5 rounded-full animate-pulse">DUE TODAY</span>;
  if (days <= 7) return <span className="text-xs bg-red-500/20 text-red-300 border border-red-500/30 px-2 py-0.5 rounded-full">{days}d remaining</span>;
  if (days <= 30) return <span className="text-xs bg-amber-500/20 text-amber-300 border border-amber-500/30 px-2 py-0.5 rounded-full">{days}d remaining</span>;
  return <span className="text-xs bg-slate-700 text-slate-400 border border-slate-600 px-2 py-0.5 rounded-full">{days}d remaining</span>;
};

const DeadlineEngine: React.FC = () => {
  const [deadlines, setDeadlines] = useState<Deadline[]>(() => {
    const saved = localStorage.getItem('casebuddy_deadlines');
    return saved ? JSON.parse(saved) : [];
  });
  const [showAdd, setShowAdd] = useState(false);
  const [solCaseType, setSolCaseType] = useState('Personal Injury');
  const [solJurisdiction, setSolJurisdiction] = useState('Federal');
  const [incidentDate, setIncidentDate] = useState('');
  const [calculatedSOL, setCalculatedSOL] = useState('');
  const [filter, setFilter] = useState<'all' | 'upcoming' | 'overdue' | 'done'>('all');

  const [newDeadline, setNewDeadline] = useState({
    title: '', caseTitle: '', deadlineType: DEADLINE_TYPES[0],
    dueDate: '', jurisdiction: '', notes: '',
  });

  const save = (updated: Deadline[]) => {
    setDeadlines(updated);
    localStorage.setItem('casebuddy_deadlines', JSON.stringify(updated));
  };

  const addDeadline = () => {
    if (!newDeadline.title || !newDeadline.dueDate) return;
    const d: Deadline = {
      ...newDeadline,
      id: Date.now().toString(),
      completed: false,
      createdAt: new Date().toISOString(),
    };
    save([...deadlines, d]);
    setNewDeadline({ title: '', caseTitle: '', deadlineType: DEADLINE_TYPES[0], dueDate: '', jurisdiction: '', notes: '' });
    setShowAdd(false);
  };

  const toggle = (id: string) => save(deadlines.map(d => d.id === id ? { ...d, completed: !d.completed } : d));
  const remove = (id: string) => save(deadlines.filter(d => d.id !== id));

  const calculateSOL = () => {
    if (!incidentDate) return;
    const rule = SOL_RULES[solCaseType]?.[solJurisdiction];
    if (rule) {
      const years = parseInt(rule);
      if (!isNaN(years)) {
        const sol = new Date(incidentDate);
        sol.setFullYear(sol.getFullYear() + years);
        setCalculatedSOL(`${rule} — Deadline: ${sol.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`);
      } else {
        setCalculatedSOL(rule);
      }
    }
  };

  const withDays = deadlines.map(d => ({ ...d, daysRemaining: getDaysRemaining(d.dueDate) }));
  const filtered = withDays.filter(d => {
    if (filter === 'upcoming') return !d.completed && (d.daysRemaining || 0) >= 0;
    if (filter === 'overdue') return !d.completed && (d.daysRemaining || 0) < 0;
    if (filter === 'done') return d.completed;
    return true;
  }).sort((a, b) => (a.daysRemaining || 0) - (b.daysRemaining || 0));

  const overdue = withDays.filter(d => !d.completed && (d.daysRemaining || 0) < 0).length;
  const urgent = withDays.filter(d => !d.completed && (d.daysRemaining || 0) >= 0 && (d.daysRemaining || 0) <= 7).length;

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-6 flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-serif font-bold text-white flex items-center gap-2">
            <Clock className="text-gold-400" /> Deadline & SOL Engine
          </h1>
          <p className="text-slate-400 mt-1">Auto-calculate statutes of limitations. Never miss a critical filing date.</p>
        </div>
        <button onClick={() => setShowAdd(!showAdd)}
          className="flex items-center gap-2 bg-gold-500 hover:bg-gold-400 text-slate-900 font-bold px-4 py-2 rounded-xl">
          <Plus size={16} /> Add Deadline
        </button>
      </div>

      {/* Stats */}
      {deadlines.length > 0 && (
        <div className="grid grid-cols-3 gap-3 mb-6">
          {[
            { label: 'Overdue', value: overdue, color: 'text-red-400', bg: 'bg-red-500/10 border-red-500/20' },
            { label: 'Due This Week', value: urgent, color: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/20' },
            { label: 'Total Active', value: withDays.filter(d => !d.completed).length, color: 'text-blue-400', bg: 'bg-blue-500/10 border-blue-500/20' },
          ].map(s => (
            <div key={s.label} className={`rounded-xl border p-3 text-center ${s.bg}`}>
              <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
              <p className="text-xs text-slate-400">{s.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* SOL Calculator */}
      <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-5 mb-6">
        <h2 className="font-bold text-white mb-4 flex items-center gap-2">⚖️ Statute of Limitations Calculator</h2>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
          <div>
            <label className="block text-xs text-slate-400 mb-1.5 font-bold uppercase">Claim Type</label>
            <select value={solCaseType} onChange={e => setSolCaseType(e.target.value)}
              className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-gold-500/50">
              {Object.keys(SOL_RULES).map(k => <option key={k}>{k}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1.5 font-bold uppercase">Jurisdiction</label>
            <select value={solJurisdiction} onChange={e => setSolJurisdiction(e.target.value)}
              className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-gold-500/50">
              {Object.keys(SOL_RULES[solCaseType] || {}).map(k => <option key={k}>{k}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1.5 font-bold uppercase">Incident Date</label>
            <input type="date" value={incidentDate} onChange={e => setIncidentDate(e.target.value)}
              className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-gold-500/50" />
          </div>
          <button onClick={calculateSOL}
            className="bg-gold-500 hover:bg-gold-400 text-slate-900 font-bold px-4 py-2 rounded-lg text-sm">
            Calculate
          </button>
        </div>
        {calculatedSOL && (
          <div className="mt-3 bg-gold-500/10 border border-gold-500/30 rounded-lg px-4 py-3 flex items-center gap-2">
            <AlertTriangle size={16} className="text-gold-400 shrink-0" />
            <p className="text-gold-200 text-sm font-medium">{calculatedSOL}</p>
          </div>
        )}
      </div>

      {/* Add form */}
      {showAdd && (
        <div className="bg-slate-800/50 border border-gold-500/20 rounded-xl p-5 mb-6">
          <h3 className="font-bold text-white mb-4">Add Deadline</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[
              { label: 'Deadline Title', k: 'title', placeholder: 'e.g. Answer due — Smith v. Jones' },
              { label: 'Case Name', k: 'caseTitle', placeholder: 'Case name' },
              { label: 'Jurisdiction', k: 'jurisdiction', placeholder: 'Court / jurisdiction' },
            ].map(f => (
              <div key={f.k}>
                <label className="block text-xs text-slate-400 mb-1 font-bold uppercase">{f.label}</label>
                <input value={(newDeadline as any)[f.k]} onChange={e => setNewDeadline(d => ({ ...d, [f.k]: e.target.value }))}
                  placeholder={f.placeholder}
                  className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm placeholder-slate-500 focus:outline-none focus:border-gold-500/50" />
              </div>
            ))}
            <div>
              <label className="block text-xs text-slate-400 mb-1 font-bold uppercase">Deadline Type</label>
              <select value={newDeadline.deadlineType} onChange={e => setNewDeadline(d => ({ ...d, deadlineType: e.target.value }))}
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-gold-500/50">
                {DEADLINE_TYPES.map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1 font-bold uppercase">Due Date</label>
              <input type="date" value={newDeadline.dueDate} onChange={e => setNewDeadline(d => ({ ...d, dueDate: e.target.value }))}
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-gold-500/50" />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs text-slate-400 mb-1 font-bold uppercase">Notes</label>
              <input value={newDeadline.notes} onChange={e => setNewDeadline(d => ({ ...d, notes: e.target.value }))}
                placeholder="Optional notes..."
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm placeholder-slate-500 focus:outline-none focus:border-gold-500/50" />
            </div>
          </div>
          <div className="flex gap-3 mt-4">
            <button onClick={addDeadline} className="bg-gold-500 hover:bg-gold-400 text-slate-900 font-bold px-6 py-2 rounded-xl text-sm">
              Add Deadline
            </button>
            <button onClick={() => setShowAdd(false)} className="text-slate-400 hover:text-white px-4 py-2 rounded-xl text-sm">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Filter tabs */}
      <div className="flex gap-2 mb-4">
        {(['all', 'upcoming', 'overdue', 'done'] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium capitalize transition-colors ${filter === f ? 'bg-gold-500/20 text-gold-300 border border-gold-500/30' : 'text-slate-400 hover:text-white border border-transparent'}`}>
            {f}
          </button>
        ))}
      </div>

      {/* Deadline list */}
      <div className="space-y-3">
        {filtered.length === 0 && (
          <div className="text-center py-12 text-slate-500">
            <Clock size={40} className="mx-auto mb-3 opacity-30" />
            <p>No deadlines found. Add your first deadline above.</p>
          </div>
        )}
        {filtered.map(d => (
          <div key={d.id} className={`border rounded-xl p-4 flex items-start gap-3 transition-all ${urgencyColor(d.daysRemaining || 0, d.completed)}`}>
            <button onClick={() => toggle(d.id)} className="mt-0.5 shrink-0">
              <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${d.completed ? 'bg-green-500 border-green-500' : 'border-slate-500 hover:border-gold-400'}`}>
                {d.completed && <CheckCircle size={12} className="text-white" />}
              </div>
            </button>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`font-semibold ${d.completed ? 'line-through text-slate-500' : 'text-white'}`}>{d.title}</span>
                {urgencyBadge(d.daysRemaining || 0, d.completed)}
              </div>
              <div className="flex items-center gap-3 mt-1 text-xs text-slate-400 flex-wrap">
                {d.caseTitle && <span>📁 {d.caseTitle}</span>}
                <span>📋 {d.deadlineType}</span>
                <span>📅 {new Date(d.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                {d.jurisdiction && <span>⚖️ {d.jurisdiction}</span>}
              </div>
              {d.notes && <p className="text-xs text-slate-500 mt-1">{d.notes}</p>}
            </div>
            <button onClick={() => remove(d.id)} className="text-slate-600 hover:text-red-400 transition-colors shrink-0">
              <Trash2 size={14} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};

export default DeadlineEngine;
