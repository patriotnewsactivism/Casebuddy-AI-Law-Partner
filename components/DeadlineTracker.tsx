import React, { useState, useEffect, useContext } from 'react';
import { AppContext } from '../App';
import { Clock, Plus, Trash2, AlertTriangle, CheckCircle, Bell, Calendar, ChevronDown, ChevronUp, X, Scale, Loader2, Gavel } from 'lucide-react';
import AgentHeader from './AgentHeader';
import { OPERATIONAL_AGENTS } from '../agents/personas';
import { toast } from 'react-toastify';
import { GoogleGenAI } from '@google/genai';

const SOL = OPERATIONAL_AGENTS.find(a => a.id === 'sol')!;
const STORAGE_KEY = 'casebuddy_deadlines';

type DeadlineType =
  | 'statute-of-limitations'
  | 'filing-deadline'
  | 'discovery-cutoff'
  | 'hearing-date'
  | 'trial-date'
  | 'response-due'
  | 'appeal-deadline'
  | 'other';

interface Deadline {
  id: string;
  caseTitle: string;
  type: DeadlineType;
  label: string;
  dueDate: string;
  reminderDays: number;
  notes: string;
  completed: boolean;
  createdAt: number;
}

const TYPE_LABELS: Record<DeadlineType, string> = {
  'statute-of-limitations': 'Statute of Limitations',
  'filing-deadline':        'Filing Deadline',
  'discovery-cutoff':       'Discovery Cutoff',
  'hearing-date':           'Hearing Date',
  'trial-date':             'Trial Date',
  'response-due':           'Response Due',
  'appeal-deadline':        'Appeal Deadline',
  'other':                  'Other',
};

const daysUntil = (dateStr: string) => {
  const due = new Date(dateStr);
  const now = new Date();
  due.setHours(0, 0, 0, 0);
  now.setHours(0, 0, 0, 0);
  return Math.round((due.getTime() - now.getTime()) / 86_400_000);
};

const urgencyClass = (days: number, completed: boolean) => {
  if (completed) return 'border-green-500/30 bg-green-500/5';
  if (days < 0)  return 'border-red-500/50 bg-red-500/8';
  if (days <= 7) return 'border-red-500/40 bg-red-500/6';
  if (days <= 30) return 'border-amber-500/40 bg-amber-500/6';
  return 'border-slate-700 bg-slate-800/40';
};

const urgencyBadge = (days: number, completed: boolean) => {
  if (completed) return <span className="text-xs px-2 py-0.5 rounded-full bg-green-500/15 border border-green-500/30 text-green-400 font-semibold">Done</span>;
  if (days < 0)  return <span className="text-xs px-2 py-0.5 rounded-full bg-red-500/20 border border-red-500/40 text-red-400 font-bold">Overdue {Math.abs(days)}d</span>;
  if (days === 0) return <span className="text-xs px-2 py-0.5 rounded-full bg-red-500/20 border border-red-500/40 text-red-400 font-bold animate-pulse">Due Today!</span>;
  if (days <= 7)  return <span className="text-xs px-2 py-0.5 rounded-full bg-red-500/15 border border-red-500/30 text-red-400 font-semibold">{days}d left</span>;
  if (days <= 30) return <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-400 font-semibold">{days}d left</span>;
  return <span className="text-xs px-2 py-0.5 rounded-full bg-slate-700 border border-slate-600 text-slate-400">{days}d left</span>;
};

const EMPTY_FORM = { caseTitle: '', type: 'filing-deadline' as DeadlineType, label: '', dueDate: '', reminderDays: 7, notes: '' };

/* ─── SOL Calculator ─────────────────────────────────────────────────────── */

const CLAIM_TYPES = [
  'Personal Injury',
  'Breach of Contract',
  'Medical Malpractice',
  'Defamation',
  'Property Damage',
  'Fraud',
  'Wrongful Death',
  'Section 1983 Civil Rights',
  'Employment Discrimination',
  'Other',
];

interface SolResult {
  limitationYears: string;
  deadlineDate: string;
  statuteCitation: string;
  notes: string;
  tollingConsiderations: string;
}

const EMPTY_SOL_FORM = { jurisdiction: '', claimType: 'Personal Injury', accrualDate: '' };

// Try to coerce the AI-returned deadline into an ISO yyyy-mm-dd date for daysUntil().
const parseIsoDate = (s: string): string | null => {
  if (!s) return null;
  const iso = s.match(/\d{4}-\d{2}-\d{2}/);
  if (iso) return iso[0];
  const d = new Date(s);
  if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return null;
};

const DeadlineTracker: React.FC = () => {
  const { activeCase } = useContext(AppContext);
  const [deadlines, setDeadlines] = useState<Deadline[]>(() => {
    try { const s = localStorage.getItem(STORAGE_KEY); return s ? JSON.parse(s) : []; }
    catch { return []; }
  });
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ ...EMPTY_FORM, caseTitle: activeCase?.title ?? '' });
  const [filter, setFilter] = useState<'all' | 'upcoming' | 'overdue' | 'done'>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // SOL Calculator state
  const [solForm, setSolForm] = useState({ ...EMPTY_SOL_FORM });
  const [solLoading, setSolLoading] = useState(false);
  const [solError, setSolError] = useState<string | null>(null);
  const [solResult, setSolResult] = useState<SolResult | null>(null);
  const [solAdded, setSolAdded] = useState(false);

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(deadlines)); } catch {}
  }, [deadlines]);
  // ── Sol background deadline watcher ─────────────────────────────────────────
  // Runs on mount + every 6 hours to alert on overdue/imminent deadlines
  useEffect(() => {
    const checkDeadlines = () => {
      const overdue = deadlines.filter(d => !d.completed && daysUntil(d.dueDate) < 0);
      const urgent  = deadlines.filter(d => !d.completed && daysUntil(d.dueDate) >= 0 && daysUntil(d.dueDate) <= 3);
      if (overdue.length > 0) {
        toast.error(`⚠️ ${overdue.length} deadline${overdue.length > 1 ? 's' : ''} OVERDUE — ${overdue[0].label || overdue[0].caseTitle}`, { autoClose: 8000 });
      } else if (urgent.length > 0) {
        toast.warning(`⏰ ${urgent.length} deadline${urgent.length > 1 ? 's' : ''} due within 3 days — ${urgent[0].label || urgent[0].caseTitle}`, { autoClose: 6000 });
      }
    };

    // Check immediately on load
    if (deadlines.length > 0) checkDeadlines();

    // Re-check every 6 hours
    const interval = setInterval(checkDeadlines, 6 * 60 * 60 * 1000);
    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);



  const calculateSol = async () => {
    if (!solForm.jurisdiction.trim() || !solForm.claimType.trim()) {
      toast.error('Jurisdiction and claim type are required');
      return;
    }
    setSolLoading(true);
    setSolError(null);
    setSolResult(null);
    setSolAdded(false);
    try {
      const apiKey = process.env.API_KEY || '';
      const ai = new GoogleGenAI({ apiKey });

      const accrualText = solForm.accrualDate
        ? new Date(solForm.accrualDate).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
        : 'not provided';

      const prompt = `You are a legal research assistant. Estimate the statute of limitations for the following claim. Be accurate and conservative.

- Jurisdiction / State: ${solForm.jurisdiction}
- Claim type: ${solForm.claimType}
- Incident / accrual date: ${accrualText}

Return ONLY a JSON object with exactly these string fields:
- limitationYears: the limitation period (e.g. "3 years", "2 years", "1 year"). Be specific to the jurisdiction and claim type.
- deadlineDate: the computed filing deadline as an ISO date (YYYY-MM-DD) measured from the accrual date if an accrual date was provided; if no accrual date was provided, briefly describe how the deadline is measured.
- statuteCitation: the controlling statute citation (e.g. "Miss. Code Ann. § 15-1-49") or "Unknown" if uncertain.
- notes: a concise plain-language explanation of the limitation period and how it applies.
- tollingConsiderations: key tolling/exception considerations (minority, discovery rule, fraudulent concealment, government claims notice, etc.).`;

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        config: { responseMimeType: 'application/json' },
      });

      const parsed: SolResult = JSON.parse(response.text ?? '{}');
      setSolResult(parsed);
    } catch (err: any) {
      setSolError(err?.message ?? 'Failed to calculate statute of limitations. Please try again.');
    } finally {
      setSolLoading(false);
    }
  };

  const addSolAsDeadline = () => {
    if (!solResult) return;
    const iso = parseIsoDate(solResult.deadlineDate);
    if (!iso) {
      toast.error('No concrete deadline date to add — provide an accrual date and recalculate.');
      return;
    }
    const noteParts = [
      `Claim: ${solForm.claimType} (${solForm.jurisdiction})`,
      solResult.limitationYears ? `Limitation: ${solResult.limitationYears}` : '',
      solResult.statuteCitation ? `Citation: ${solResult.statuteCitation}` : '',
      solResult.tollingConsiderations ? `Tolling: ${solResult.tollingConsiderations}` : '',
      'AI estimate — verify with a licensed attorney.',
    ].filter(Boolean);

    const d: Deadline = {
      id: `dl_${Date.now()}`,
      caseTitle: activeCase?.title || `${solForm.claimType} matter`,
      type: 'statute-of-limitations',
      label: `SOL — ${solForm.claimType} (${solForm.jurisdiction})`,
      dueDate: iso,
      reminderDays: 30,
      notes: noteParts.join(' · '),
      completed: false,
      createdAt: Date.now(),
    };
    setDeadlines(prev => [d, ...prev]);
    setSolAdded(true);
    toast.success('Statute-of-limitations deadline added');
  };

  const addDeadline = () => {
    if (!form.caseTitle.trim() || !form.dueDate || !form.label.trim()) {
      toast.error('Case, label, and due date are required');
      return;
    }
    const d: Deadline = {
      id: `dl_${Date.now()}`,
      ...form,
      completed: false,
      createdAt: Date.now(),
    };
    setDeadlines(prev => [d, ...prev]);
    setForm({ ...EMPTY_FORM, caseTitle: activeCase?.title ?? '' });
    setShowForm(false);
    toast.success('Deadline added');
  };

  const toggle = (id: string) => {
    setDeadlines(prev => prev.map(d => d.id === id ? { ...d, completed: !d.completed } : d));
  };

  const remove = (id: string) => {
    setDeadlines(prev => prev.filter(d => d.id !== id));
    toast.success('Deadline removed');
  };

  const filtered = deadlines.filter(d => {
    const days = daysUntil(d.dueDate);
    if (filter === 'upcoming') return !d.completed && days >= 0;
    if (filter === 'overdue')  return !d.completed && days < 0;
    if (filter === 'done')     return d.completed;
    return true;
  }).sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());

  const counts = {
    overdue:  deadlines.filter(d => !d.completed && daysUntil(d.dueDate) < 0).length,
    soon:     deadlines.filter(d => !d.completed && daysUntil(d.dueDate) >= 0 && daysUntil(d.dueDate) <= 7).length,
    upcoming: deadlines.filter(d => !d.completed && daysUntil(d.dueDate) > 7).length,
    done:     deadlines.filter(d => d.completed).length,
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <AgentHeader agent={SOL} compact />

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold font-serif text-white">Deadline Tracker</h1>
          <p className="text-slate-400 text-sm mt-1">Sol monitors your statutes of limitations, filing deadlines, and court dates.</p>
        </div>
        <button onClick={() => setShowForm(!showForm)}
          className="btn-gold px-5 py-2.5">
          <Plus size={18} /> Add Deadline
        </button>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Overdue',  count: counts.overdue,  color: 'text-red-400',   bg: 'bg-red-500/10 border-red-500/25' },
          { label: 'Due Soon', count: counts.soon,     color: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/25' },
          { label: 'Upcoming', count: counts.upcoming, color: 'text-blue-400',  bg: 'bg-blue-500/10 border-blue-500/25' },
          { label: 'Completed',count: counts.done,     color: 'text-green-400', bg: 'bg-green-500/10 border-green-500/25' },
        ].map(s => (
          <div key={s.label} className={`rounded-xl border p-4 ${s.bg}`}>
            <p className={`text-2xl font-bold ${s.color}`}>{s.count}</p>
            <p className="text-xs text-slate-500 mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* ── SOL Calculator ── */}
      <div className="card-premium p-6 space-y-4">
        <div className="flex items-start gap-3">
          <div className="w-11 h-11 rounded-2xl flex items-center justify-center bg-gold-500/10 border border-gold-500/30 shrink-0">
            <Scale size={20} className="text-gold-400" />
          </div>
          <div className="min-w-0">
            <h2 className="text-lg font-bold font-serif text-white">SOL Calculator</h2>
            <p className="text-slate-400 text-sm mt-0.5">
              Estimate the statute of limitations by jurisdiction and claim type. Sol uses AI to compute the filing deadline.
            </p>
          </div>
        </div>

        <div className="grid sm:grid-cols-3 gap-4">
          <div>
            <label className="text-xs text-slate-400 mb-1 block">State / Jurisdiction *</label>
            <input
              value={solForm.jurisdiction}
              onChange={e => setSolForm(p => ({ ...p, jurisdiction: e.target.value }))}
              placeholder="Mississippi, Federal…"
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 text-sm focus:border-gold-500 outline-none" />
          </div>
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Claim Type *</label>
            <select
              value={solForm.claimType}
              onChange={e => setSolForm(p => ({ ...p, claimType: e.target.value }))}
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm focus:border-gold-500 outline-none">
              {CLAIM_TYPES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Incident / Accrual Date</label>
            <input
              type="date"
              value={solForm.accrualDate}
              onChange={e => setSolForm(p => ({ ...p, accrualDate: e.target.value }))}
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm focus:border-gold-500 outline-none" />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button onClick={calculateSol} disabled={solLoading}
            className="btn-gold px-5 py-2 disabled:opacity-60 inline-flex items-center gap-2">
            {solLoading ? <><Loader2 size={16} className="animate-spin" /> Calculating…</> : <><Gavel size={16} /> Calculate SOL</>}
          </button>
          {solResult && (
            <button onClick={() => { setSolResult(null); setSolError(null); setSolAdded(false); }}
              className="btn-ghost px-4 py-2 text-sm">Clear</button>
          )}
        </div>

        {solError && (
          <div className="flex items-start gap-3 p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-sm">
            <AlertTriangle size={16} className="shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">Could not calculate</p>
              <p className="text-xs mt-0.5">{solError}</p>
            </div>
          </div>
        )}

        {solResult && (() => {
          const iso = parseIsoDate(solResult.deadlineDate);
          const days = iso ? daysUntil(iso) : null;
          return (
            <div className="rounded-xl border border-gold-500/30 bg-gold-500/5 p-5 space-y-4">
              {/* Prominent deadline */}
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                  <p className="text-xs uppercase tracking-wider text-gold-400 font-bold mb-1">Estimated Filing Deadline</p>
                  {iso ? (
                    <p className="text-2xl font-bold text-white">
                      {new Date(iso).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                    </p>
                  ) : (
                    <p className="text-base text-slate-200">{solResult.deadlineDate || 'See notes'}</p>
                  )}
                </div>
                {days !== null && urgencyBadge(days, false)}
              </div>

              <div className="grid sm:grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-xs uppercase tracking-wider text-slate-500 font-bold mb-1">Limitation Period</p>
                  <p className="text-slate-200">{solResult.limitationYears || '—'}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wider text-slate-500 font-bold mb-1">Statute Citation</p>
                  <p className="text-slate-200">{solResult.statuteCitation || '—'}</p>
                </div>
              </div>

              {solResult.notes && (
                <div>
                  <p className="text-xs uppercase tracking-wider text-slate-500 font-bold mb-1">Notes</p>
                  <p className="text-slate-300 text-sm leading-relaxed">{solResult.notes}</p>
                </div>
              )}
              {solResult.tollingConsiderations && (
                <div>
                  <p className="text-xs uppercase tracking-wider text-slate-500 font-bold mb-1">Tolling Considerations</p>
                  <p className="text-slate-300 text-sm leading-relaxed">{solResult.tollingConsiderations}</p>
                </div>
              )}

              <div className="flex flex-wrap items-center gap-3 pt-1">
                <button onClick={addSolAsDeadline} disabled={solAdded}
                  className="btn-gold px-4 py-2 text-sm disabled:opacity-60 inline-flex items-center gap-1.5">
                  {solAdded ? <><CheckCircle size={15} /> Added</> : <><Plus size={15} /> Add as Deadline</>}
                </button>
                {!parseIsoDate(solResult.deadlineDate) && (
                  <span className="text-xs text-slate-500">Provide an accrual date for a datable deadline.</span>
                )}
              </div>

              <div className="flex items-start gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-200 text-xs">
                <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                <span>
                  Statute-of-limitations rules are complex, vary by jurisdiction, and are subject to exceptions and tolling
                  (discovery rule, minority, government-claim notice periods, fraudulent concealment, and more). This AI estimate
                  may be wrong. Do NOT rely on it alone — verify every deadline with a licensed attorney before acting.
                </span>
              </div>
            </div>
          );
        })()}
      </div>

      {/* Add deadline form */}
      {showForm && (
        <div className="card-premium p-6 space-y-4 animate-slide-up">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-semibold text-white">New Deadline</h3>
            <button onClick={() => setShowForm(false)} className="text-slate-500 hover:text-white"><X size={18} /></button>
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Case Title *</label>
              <input value={form.caseTitle} onChange={e => setForm(p => ({...p, caseTitle: e.target.value}))}
                placeholder="State v. Smith"
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 text-sm focus:border-gold-500 outline-none" />
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Deadline Type</label>
              <select value={form.type} onChange={e => setForm(p => ({...p, type: e.target.value as DeadlineType}))}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm focus:border-gold-500 outline-none">
                {Object.entries(TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Label *</label>
              <input value={form.label} onChange={e => setForm(p => ({...p, label: e.target.value}))}
                placeholder="Answer to complaint due"
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 text-sm focus:border-gold-500 outline-none" />
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Due Date *</label>
              <input type="date" value={form.dueDate} onChange={e => setForm(p => ({...p, dueDate: e.target.value}))}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm focus:border-gold-500 outline-none" />
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Remind me N days before</label>
              <input type="number" min={1} max={90} value={form.reminderDays} onChange={e => setForm(p => ({...p, reminderDays: +e.target.value}))}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm focus:border-gold-500 outline-none" />
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Notes</label>
              <input value={form.notes} onChange={e => setForm(p => ({...p, notes: e.target.value}))}
                placeholder="Optional notes..."
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 text-sm focus:border-gold-500 outline-none" />
            </div>
          </div>
          <div className="flex gap-3 pt-2">
            <button onClick={addDeadline} className="btn-gold px-5 py-2">Save Deadline</button>
            <button onClick={() => setShowForm(false)} className="btn-ghost px-5 py-2">Cancel</button>
          </div>
        </div>
      )}

      {/* Filter tabs */}
      <div className="flex gap-2 flex-wrap">
        {(['all','upcoming','overdue','done'] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all capitalize ${
              filter === f ? 'bg-gold-500 text-slate-900' : 'glass text-slate-400 hover:text-white'
            }`}>
            {f}
          </button>
        ))}
      </div>

      {/* Deadline list */}
      {filtered.length === 0 ? (
        <div className="text-center py-16">
          <Clock className="mx-auto mb-4 text-slate-600" size={48} />
          <p className="text-slate-500">No deadlines here. Add one above.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(d => {
            const days = daysUntil(d.dueDate);
            const isExpanded = expandedId === d.id;
            return (
              <div key={d.id} className={`rounded-xl border transition-all p-4 ${urgencyClass(days, d.completed)}`}>
                <div className="flex items-start gap-3">
                  <button onClick={() => toggle(d.id)}
                    className={`mt-0.5 w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-all ${
                      d.completed ? 'border-green-500 bg-green-500/20' : 'border-slate-600 hover:border-gold-500'
                    }`}>
                    {d.completed && <CheckCircle size={12} className="text-green-400" />}
                  </button>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2 flex-wrap">
                      <div className="min-w-0">
                        <p className={`font-semibold text-sm ${d.completed ? 'line-through text-slate-500' : 'text-white'}`}>
                          {d.label}
                        </p>
                        <p className="text-xs text-slate-500 mt-0.5">
                          {d.caseTitle} · {TYPE_LABELS[d.type]}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {urgencyBadge(days, d.completed)}
                        <span className="text-xs text-slate-500">
                          {new Date(d.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                        </span>
                        <button onClick={() => setExpandedId(isExpanded ? null : d.id)}
                          className="text-slate-500 hover:text-white transition-colors">
                          {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                        </button>
                        <button onClick={() => remove(d.id)} className="text-slate-600 hover:text-red-400 transition-colors">
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>

                    {isExpanded && (
                      <div className="mt-3 pt-3 border-t border-white/8 space-y-1.5 animate-slide-up">
                        {d.notes && <p className="text-sm text-slate-400">{d.notes}</p>}
                        <p className="text-xs text-slate-500">
                          Reminder: {d.reminderDays} days before · Added {new Date(d.createdAt).toLocaleDateString()}
                        </p>
                        {!d.completed && days <= d.reminderDays && days >= 0 && (
                          <div className="flex items-center gap-1.5 text-amber-400 text-xs">
                            <Bell size={13} /> Reminder triggered — within {d.reminderDays}-day window
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default DeadlineTracker;
