import React, { useContext, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import {
  Inbox, Copy, Check, ExternalLink, ChevronDown, Scale, Phone,
  CircleDot, ThumbsUp, ThumbsDown, ArrowRightCircle, RefreshCw, Share2, Rocket,
} from 'lucide-react';
import { AppContext } from '../App';
import { Case, CaseStatus, IntakeCase, IntakeStatus } from '../types';
import { fetchIntakes, subscribeIntakes, updateIntakeStatus, intakeBackendLabel } from '../services/intakeStore';
import { getSpecialistById } from '../agents/personas';
import Breadcrumb from './Breadcrumb';

const intakeUrl = () => `${window.location.origin}/intake`;

const scoreColor = (s: number) =>
  s >= 65 ? 'text-green-400 border-green-500/40 bg-green-500/10'
  : s >= 45 ? 'text-amber-400 border-amber-500/40 bg-amber-500/10'
  : 'text-rose-400 border-rose-500/40 bg-rose-500/10';

const dispositionBadge: Record<string, { label: string; cls: string }> = {
  accepted: { label: 'Accepted', cls: 'bg-green-500/15 text-green-300 border-green-500/40' },
  review: { label: 'Needs Review', cls: 'bg-amber-500/15 text-amber-300 border-amber-500/40' },
  denied: { label: 'Declined', cls: 'bg-slate-600/30 text-slate-300 border-slate-500/40' },
};

const urgencyDot: Record<string, string> = {
  high: 'text-rose-400',
  medium: 'text-amber-400',
  low: 'text-slate-500',
};

const ShareLink: React.FC = () => {
  const [copied, setCopied] = useState(false);
  const url = intakeUrl();
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success('Intake link copied');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.info(url);
    }
  };
  return (
    <div className="bg-gradient-to-r from-gold-500/10 to-violet-500/10 border border-gold-500/30 rounded-2xl p-5">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-gold-500/20 border border-gold-500/40 flex items-center justify-center shrink-0">
          <Share2 size={18} className="text-gold-400" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="font-bold text-white">Your shareable intake link</h3>
          <p className="text-sm text-slate-400 mt-0.5">
            Send this to a prospective client. When they open it, <span className="text-violet-300 font-medium">Maya</span> greets
            them by voice, takes their intake, and a scored case lands here automatically.
          </p>
          <div className="mt-3 flex flex-col sm:flex-row gap-2">
            <code className="flex-1 px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-xs text-slate-300 truncate">
              {url}
            </code>
            <div className="flex gap-2">
              <button
                onClick={copy}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-gold-500 hover:bg-gold-400 text-slate-950 text-sm font-bold transition-colors"
              >
                {copied ? <Check size={15} /> : <Copy size={15} />}
                {copied ? 'Copied' : 'Copy'}
              </button>
              <a
                href={url}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-semibold transition-colors"
              >
                <ExternalLink size={15} /> Preview
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const IntakeCard: React.FC<{
  row: IntakeCase;
  onStatus: (id: string, s: IntakeStatus) => void;
  onOpenCase: (row: IntakeCase) => void;
}> = ({ row, onStatus, onOpenCase }) => {
  const [open, setOpen] = useState(false);
  const badge = dispositionBadge[row.disposition] ?? dispositionBadge.review;
  const specialist = getSpecialistById(row.recommended_agent_id);
  const when = new Date(row.created_at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
      <button onClick={() => setOpen(o => !o)} className="w-full text-left p-4 flex items-center gap-4 hover:bg-slate-800/40 transition-colors">
        <div className={`shrink-0 w-12 h-12 rounded-xl border flex flex-col items-center justify-center font-bold ${scoreColor(row.score)}`}>
          <span className="text-lg leading-none">{row.score}</span>
          <span className="text-[8px] uppercase tracking-wide opacity-70">score</span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <CircleDot size={11} className={urgencyDot[row.urgency] ?? urgencyDot.low} />
            <span className="font-semibold text-white truncate">{row.full_name}</span>
            <span className="text-xs text-slate-500">· {row.matter_type}</span>
          </div>
          <p className="text-sm text-slate-400 truncate mt-0.5">{row.summary || 'No summary captured.'}</p>
        </div>
        <div className="hidden sm:flex flex-col items-end gap-1 shrink-0">
          <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${badge.cls}`}>{badge.label}</span>
          <span className="text-[11px] text-slate-500">{when}</span>
        </div>
        <ChevronDown size={16} className={`text-slate-500 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="px-4 pb-4 border-t border-slate-800 space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-4 text-sm">
            <Field label="Contact" value={row.contact || '—'} />
            <Field label="Jurisdiction" value={row.jurisdiction || '—'} />
            <Field label="Incident date" value={row.intake?.incidentDate || '—'} />
            <Field label="Opposing party" value={row.intake?.opposingParties || '—'} />
            <Field label="Deadlines" value={row.intake?.deadlines || '—'} highlight={!!row.intake?.deadlines} />
            <Field label="Damages" value={row.intake?.injuriesOrDamages || '—'} />
            {row.intake?.financialImpact && <Field label="Financial impact" value={row.intake.financialImpact} />}
            {row.intake?.witnesses && <Field label="Witnesses" value={row.intake.witnesses} />}
            {row.intake?.priorLegalActions && <Field label="Prior legal action" value={row.intake.priorLegalActions} />}
          </div>

          {row.intake?.desiredOutcome && (
            <Field label="Desired outcome" value={row.intake.desiredOutcome} />
          )}

          {/* Detailed narrative — the full faithful write-up of the matter */}
          {row.intake?.detailedNarrative && (
            <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800">
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Case narrative</p>
              <p className="text-sm text-slate-200 leading-relaxed whitespace-pre-line">{row.intake.detailedNarrative}</p>
            </div>
          )}

          {/* Key facts */}
          {row.intake?.keyFacts && row.intake.keyFacts.length > 0 && (
            <div>
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Key facts</p>
              <ul className="space-y-1">
                {row.intake.keyFacts.map((f, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-slate-300">
                    <span className="mt-1.5 w-1 h-1 rounded-full bg-gold-400 shrink-0" />{f}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Timeline */}
          {row.intake?.timeline && row.intake.timeline.length > 0 && (
            <div>
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Timeline</p>
              <div className="space-y-1.5 border-l border-slate-700 pl-3">
                {row.intake.timeline.map((t, i) => (
                  <div key={i} className="text-sm">
                    {t.date && <span className="text-gold-400 font-medium mr-2">{t.date}</span>}
                    <span className="text-slate-300">{t.event}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Parties */}
          {row.intake?.parties && row.intake.parties.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {row.intake.parties.map((p, i) => (
                <span key={i} className="text-xs px-2.5 py-1 rounded-full bg-slate-800 border border-slate-700 text-slate-300">
                  <span className="text-white font-medium">{p.name}</span>{p.role ? ` · ${p.role}` : ''}
                </span>
              ))}
            </div>
          )}

          {/* Evidence */}
          {row.intake?.evidenceMentioned && (
            <Field label="Evidence mentioned" value={row.intake.evidenceMentioned} />
          )}

          {/* Verbatim quotes */}
          {row.intake?.clientQuotes && row.intake.clientQuotes.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wide">In their own words</p>
              {row.intake.clientQuotes.map((q, i) => (
                <blockquote key={i} className="border-l-2 border-violet-500/50 pl-3 text-sm text-slate-300 italic">"{q}"</blockquote>
              ))}
            </div>
          )}

          {/* Open questions — gaps to follow up, not guesses */}
          {row.intake?.openQuestions && row.intake.openQuestions.length > 0 && (
            <div className="p-3 rounded-xl bg-amber-500/5 border border-amber-500/20">
              <p className="text-xs font-bold text-amber-400/80 uppercase tracking-wide mb-1.5">Follow-up needed</p>
              <ul className="space-y-1">
                {row.intake.openQuestions.map((q, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-amber-100/90">
                    <span className="mt-1.5 w-1 h-1 rounded-full bg-amber-400 shrink-0" />{q}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Routing */}
          <div className="flex items-center gap-2 p-3 rounded-xl bg-slate-950/60 border border-slate-800">
            <Scale size={16} className="text-gold-400 shrink-0" />
            <span className="text-sm text-slate-300">
              Routed to <span className="text-gold-400 font-semibold">{row.recommended_department}</span>
              {specialist && <span className="text-slate-500"> · {specialist.name}, {specialist.title}</span>}
            </span>
          </div>

          {/* Score factors */}
          {row.score_detail?.factors?.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wide">Evaluation</p>
              {row.score_detail.factors.map((f, i) => (
                <div key={i} className="flex items-start gap-2 text-sm">
                  <span className={`mt-1 w-1.5 h-1.5 rounded-full shrink-0 ${
                    f.impact === 'positive' ? 'bg-green-400' : f.impact === 'negative' ? 'bg-rose-400' : 'bg-slate-500'
                  }`} />
                  <span className="text-slate-300"><span className="font-medium text-white">{f.label}.</span> {f.note}</span>
                </div>
              ))}
            </div>
          )}

          {/* Transcript */}
          {row.transcript?.length > 0 && (
            <details className="group">
              <summary className="cursor-pointer text-xs font-bold text-slate-500 uppercase tracking-wide flex items-center gap-1.5">
                <Phone size={12} /> Call transcript ({row.transcript.length} turns)
              </summary>
              <div className="mt-2 max-h-52 overflow-y-auto space-y-2 pr-1">
                {row.transcript.map((t, i) => (
                  <div key={i} className="text-sm">
                    <span className={`font-bold text-[11px] uppercase tracking-wide mr-2 ${t.speaker === 'you' || t.speaker === 'user' ? 'text-blue-400' : 'text-violet-300'}`}>
                      {t.speaker === 'you' || t.speaker === 'user' ? 'Client' : 'Maya'}
                    </span>
                    <span className="text-slate-300">{t.text}</span>
                  </div>
                ))}
              </div>
            </details>
          )}

          {/* Actions */}
          <div className="flex flex-wrap gap-2 pt-1">
            <ActionBtn active={row.status === 'accepted' || row.status === 'routed'} onClick={() => onStatus(row.id, 'accepted')} icon={ThumbsUp} label="Accept" tone="green" />
            <ActionBtn active={row.status === 'routed'} onClick={() => onStatus(row.id, 'routed')} icon={ArrowRightCircle} label="Route to dept" tone="gold" />
            <ActionBtn active={row.status === 'denied'} onClick={() => onStatus(row.id, 'denied')} icon={ThumbsDown} label="Decline" tone="slate" />
            {row.disposition !== 'denied' && (
              <button
                onClick={() => onOpenCase(row)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border bg-violet-500/15 text-violet-200 border-violet-500/40 hover:bg-violet-500/25 transition-colors ml-auto"
              >
                <Rocket size={13} /> Open case &amp; deploy firm
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

const Field: React.FC<{ label: string; value: string; highlight?: boolean }> = ({ label, value, highlight }) => (
  <div>
    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">{label}</p>
    <p className={`text-sm ${highlight ? 'text-amber-300 font-medium' : 'text-slate-200'}`}>{value}</p>
  </div>
);

const ActionBtn: React.FC<{ active: boolean; onClick: () => void; icon: any; label: string; tone: 'green' | 'gold' | 'slate' }> = ({ active, onClick, icon: Icon, label, tone }) => {
  const tones = {
    green: active ? 'bg-green-600 text-white border-green-500' : 'bg-green-500/10 text-green-300 border-green-500/30 hover:bg-green-500/20',
    gold: active ? 'bg-gold-500 text-slate-950 border-gold-400' : 'bg-gold-500/10 text-gold-300 border-gold-500/30 hover:bg-gold-500/20',
    slate: active ? 'bg-slate-600 text-white border-slate-500' : 'bg-slate-700/40 text-slate-300 border-slate-600/40 hover:bg-slate-700/60',
  };
  return (
    <button onClick={onClick} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${tones[tone]}`}>
      <Icon size={13} /> {label}
    </button>
  );
};

type Filter = 'all' | 'accepted' | 'review' | 'denied';

const IntakeInbox: React.FC = () => {
  const { addCase, setActiveCase } = useContext(AppContext);
  const navigate = useNavigate();
  const [rows, setRows] = useState<IntakeCase[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>('all');

  // Turn an accepted intake into a real case file and hand it to Firm Command,
  // where the whole firm can be deployed to work it autonomously.
  const openCase = (row: IntakeCase) => {
    const newCase: Case = {
      id: `case_${row.id}`,
      title: `${row.matter_type} — ${row.full_name}`,
      client: row.full_name,
      status: CaseStatus.PRE_TRIAL,
      opposingCounsel: row.intake?.opposingParties || '',
      judge: '',
      nextCourtDate: row.intake?.deadlines || '',
      summary: row.intake?.detailedNarrative || row.summary || row.intake?.summary || '',
      winProbability: row.score,
    };
    addCase(newCase);
    setActiveCase(newCase);
    updateIntakeStatus(row.id, 'routed');
    setRows(prev => prev.map(r => (r.id === row.id ? { ...r, status: 'routed' } : r)));
    toast.success(`Case opened for ${row.full_name} — deploying the firm…`);
    navigate('/app/firm-command', { state: { autoDeploy: true, caseId: newCase.id } });
  };

  const load = async () => {
    setLoading(true);
    setRows(await fetchIntakes());
    setLoading(false);
  };

  useEffect(() => {
    load();
    const unsub = subscribeIntakes(row => {
      setRows(prev => (prev.some(r => r.id === row.id) ? prev : [row, ...prev]));
      toast.info(`New intake: ${row.full_name} · ${row.matter_type} (score ${row.score})`);
    });
    return unsub;
  }, []);

  const onStatus = async (id: string, status: IntakeStatus) => {
    setRows(prev => prev.map(r => (r.id === id ? { ...r, status } : r)));
    await updateIntakeStatus(id, status);
  };

  const counts = useMemo(() => ({
    all: rows.length,
    accepted: rows.filter(r => r.disposition === 'accepted').length,
    review: rows.filter(r => r.disposition === 'review').length,
    denied: rows.filter(r => r.disposition === 'denied').length,
  }), [rows]);

  const filtered = filter === 'all' ? rows : rows.filter(r => r.disposition === filter);

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <Breadcrumb items={[{ label: 'Intake & Clients' }, { label: 'Intake Inbox' }]} />
      <div className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-xl bg-violet-500/15 border border-violet-500/30 flex items-center justify-center">
          <Inbox size={22} className="text-violet-300" />
        </div>
        <div>
          <h1 className="text-2xl font-serif font-bold text-white">Intake Inbox</h1>
          <p className="text-sm text-slate-400 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
            {intakeBackendLabel}
          </p>
        </div>
        <button onClick={load} className="ml-auto flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm transition-colors">
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
        </button>
      </div>

      <ShareLink />

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        {(['all', 'accepted', 'review', 'denied'] as Filter[]).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3.5 py-1.5 rounded-full text-sm font-semibold border transition-colors capitalize ${
              filter === f ? 'bg-gold-500 text-slate-950 border-gold-400' : 'bg-slate-900 text-slate-300 border-slate-700 hover:border-slate-600'
            }`}
          >
            {f === 'all' ? 'All' : f === 'review' ? 'Needs review' : f} <span className="opacity-60">({counts[f]})</span>
          </button>
        ))}
      </div>

      {/* List */}
      {loading && rows.length === 0 ? (
        <div className="text-center py-16 text-slate-500">
          <RefreshCw size={28} className="mx-auto animate-spin mb-3" />
          Loading intakes…
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 bg-slate-900/40 border border-dashed border-slate-700 rounded-2xl">
          <Inbox size={32} className="mx-auto text-slate-600" />
          <p className="text-slate-400 mt-3 font-medium">No intakes yet</p>
          <p className="text-sm text-slate-500 mt-1 max-w-sm mx-auto">
            Share your intake link above. When a prospect completes a voice intake with Maya, their scored case appears here in real time.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(row => (
            <IntakeCard key={row.id} row={row} onStatus={onStatus} onOpenCase={openCase} />
          ))}
        </div>
      )}
    </div>
  );
};

export default IntakeInbox;
