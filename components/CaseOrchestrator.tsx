import React, { useContext, useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { toast } from 'react-toastify';
import {
  Network, Rocket, Loader2, Check, X, Circle, ChevronDown, Sparkles, Clock, FileText, RefreshCw, FileDown,
} from 'lucide-react';
import { printAsPdf } from '../utils/pdfExport';
import { AppContext } from '../App';
import { LEGAL_SPECIALISTS, getSpecialistById } from '../agents/personas';
import { runOrchestration, saveRun, loadRun, WorkProduct } from '../services/orchestrationService';
import { Case } from '../types';

// Lightweight markdown for the work-product panels (no extra deps): handles
// ### headers, **bold**, and - bullets.
const MiniMarkdown: React.FC<{ text: string }> = ({ text }) => {
  const lines = text.split('\n');
  const render = (s: string) =>
    s.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
      part.startsWith('**') && part.endsWith('**')
        ? <strong key={i} className="text-white font-semibold">{part.slice(2, -2)}</strong>
        : <React.Fragment key={i}>{part}</React.Fragment>
    );
  return (
    <div className="space-y-1.5 text-sm text-slate-300 leading-relaxed">
      {lines.map((raw, i) => {
        const line = raw.trim();
        if (!line) return null;
        if (line.startsWith('### ')) return <p key={i} className="text-gold-400 font-bold text-xs uppercase tracking-wide mt-3">{line.slice(4)}</p>;
        if (line.startsWith('## ')) return <p key={i} className="text-gold-400 font-bold mt-3">{line.slice(3)}</p>;
        if (/^[-*]\s/.test(line)) return <div key={i} className="flex gap-2"><span className="text-gold-500 mt-1">•</span><span>{render(line.replace(/^[-*]\s/, ''))}</span></div>;
        return <p key={i}>{render(line)}</p>;
      })}
    </div>
  );
};

const buildCaseContext = (c: Case): string =>
  [
    `Title: ${c.title}`,
    `Client: ${c.client}`,
    `Status: ${c.status}`,
    c.opposingCounsel && `Opposing Counsel: ${c.opposingCounsel}`,
    c.judge && `Judge: ${c.judge}`,
    c.nextCourtDate && `Next Court Date: ${c.nextCourtDate}`,
    `Summary: ${c.summary}`,
  ].filter(Boolean).join('\n');

// Best-fit specialist guess from the case text, so the right department leads.
const guessSpecialist = (c: Case): string => {
  const t = `${c.title} ${c.summary}`.toLowerCase();
  const map: [RegExp, string][] = [
    [/criminal|arrest|charge|dui|felony|misdemeanor|police/, 'criminal-defense'],
    [/injur|accident|negligen|malpractice|slip|crash|damages/, 'personal-injury'],
    [/divorce|custody|child|alimony|marriage|adoption/, 'family-law'],
    [/visa|immigration|deport|asylum|green card|citizenship/, 'immigration'],
    [/patent|trademark|copyright|trade secret|infringement|ip\b/, 'intellectual-property'],
    [/merger|acquisition|corporate|securities|startup|investor|saas/, 'corporate'],
    [/discriminat|harassment|wrongful termination|wage|fmla|employee/, 'employment'],
    [/lease|landlord|tenant|property|title|zoning|eviction|real estate/, 'real-estate'],
    [/bankrupt|debt|creditor|chapter 7|chapter 13|insolven/, 'bankruptcy'],
    [/estate|will|trust|probate|inheritance|guardianship/, 'estate-planning'],
    [/\btax\b|irs|audit|levy|deduction/, 'tax-law'],
  ];
  for (const [re, id] of map) if (re.test(t)) return id;
  return 'civil-litigation';
};

const StatusIcon: React.FC<{ status: WorkProduct['status'] }> = ({ status }) => {
  if (status === 'working') return <Loader2 size={14} className="animate-spin text-gold-400" />;
  if (status === 'done') return <Check size={14} className="text-green-400" />;
  if (status === 'error') return <X size={14} className="text-rose-400" />;
  return <Circle size={10} className="text-slate-600" />;
};

const CaseOrchestrator: React.FC = () => {
  const { cases, activeCase } = useContext(AppContext);
  const location = useLocation();
  const navState = (location.state as { autoDeploy?: boolean; caseId?: string } | null) ?? null;
  const autoFired = useRef(false);
  const [selectedId, setSelectedId] = useState<string>(navState?.caseId ?? activeCase?.id ?? cases[0]?.id ?? '');
  const selected = cases.find(c => c.id === selectedId) ?? activeCase ?? cases[0] ?? null;

  const [products, setProducts] = useState<WorkProduct[]>([]);
  const [running, setRunning] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [ranAt, setRanAt] = useState<number | null>(null);

  const specialist = selected ? getSpecialistById(guessSpecialist(selected)) : undefined;

  // Load any saved run when the selected case changes.
  useEffect(() => {
    if (!selected) { setProducts([]); setRanAt(null); return; }
    const saved = loadRun(selected.id);
    setProducts(saved?.products ?? []);
    setRanAt(saved?.at ?? null);
    setExpanded(null);
  }, [selectedId, selected?.id]);

  const deploy = async () => {
    if (!selected || running) return;
    setRunning(true);
    setExpanded(null);
    try {
      const final = await runOrchestration(buildCaseContext(selected), guessSpecialist(selected), setProducts);
      saveRun(selected.id, final);
      setRanAt(Date.now());
      const ok = final.filter(p => p.status === 'done').length;
      toast.success(`Firm deployed — ${ok} of ${final.length} work products ready`);
    } catch {
      toast.error('The firm hit a snag. Try deploying again.');
    } finally {
      setRunning(false);
    }
  };

  // Auto-deploy when handed off from the Intake Inbox ("Open case & deploy firm").
  useEffect(() => {
    if (navState?.autoDeploy && selected && !autoFired.current && !running && products.length === 0) {
      autoFired.current = true;
      // Clear the history state so a refresh doesn't re-trigger a deployment.
      window.history.replaceState({}, '');
      deploy();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navState?.autoDeploy, selected?.id, running, products.length]);

  const done = products.filter(p => p.status === 'done').length;
  const progress = products.length ? Math.round((done / products.length) * 100) : 0;

  if (cases.length === 0) {
    return (
      <div className="max-w-2xl mx-auto text-center py-20">
        <Network size={36} className="mx-auto text-slate-600" />
        <h1 className="text-2xl font-serif font-bold text-white mt-4">No cases to work yet</h1>
        <p className="text-slate-400 mt-2">Open a case first, then deploy the firm to work it autonomously.</p>
        <Link to="/app/intake-inbox" className="inline-block mt-6 px-5 py-2.5 rounded-xl bg-gold-500 text-slate-950 font-bold">
          Go to Intake Inbox
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-xl bg-gold-500/15 border border-gold-500/30 flex items-center justify-center">
          <Network size={22} className="text-gold-400" />
        </div>
        <div>
          <h1 className="text-2xl font-serif font-bold text-white">Firm Command</h1>
          <p className="text-sm text-slate-400">Deploy the whole firm to work a case autonomously, in conjunction.</p>
        </div>
      </div>

      {/* Control bar */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex-1 min-w-0">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">Case</label>
            <select
              value={selectedId}
              onChange={e => setSelectedId(e.target.value)}
              disabled={running}
              className="mt-1 w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2.5 text-white text-sm focus:border-gold-500 outline-none"
            >
              {cases.map(c => <option key={c.id} value={c.id}>{c.title} — {c.client}</option>)}
            </select>
          </div>
          <button
            onClick={deploy}
            disabled={running || !selected}
            className="shrink-0 flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-gold-500 hover:bg-gold-400 disabled:opacity-60 text-slate-950 font-bold shadow-lg transition-all sm:self-end"
          >
            {running ? <><Loader2 size={18} className="animate-spin" /> Firm working…</> : <><Rocket size={18} /> Deploy the Firm</>}
          </button>
        </div>

        {specialist && (
          <p className="text-xs text-slate-500 mt-3 flex items-center gap-1.5">
            <Sparkles size={12} className="text-gold-400" />
            Lead department: <span className="text-gold-400 font-semibold">{specialist.practiceArea}</span> · {specialist.name}
          </p>
        )}

        {(running || products.length > 0) && (
          <div className="mt-4">
            <div className="flex items-center justify-between text-xs text-slate-400 mb-1.5">
              <span>{running ? 'Working the case…' : 'Work products ready'}</span>
              <span>{done}/{products.length}</span>
            </div>
            <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
              <div className="h-full bg-gradient-to-r from-gold-500 to-amber-400 transition-all duration-500" style={{ width: `${progress}%` }} />
            </div>
          </div>
        )}

        {ranAt && !running && (
          <p className="text-[11px] text-slate-500 mt-2 flex items-center gap-1">
            <Clock size={11} /> Last deployed {new Date(ranAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
            <button onClick={deploy} className="ml-2 inline-flex items-center gap-1 text-gold-400 hover:text-gold-300"><RefreshCw size={10} /> Re-run</button>
          </p>
        )}
      </div>

      {/* Empty state */}
      {products.length === 0 && !running && (
        <div className="text-center py-14 bg-slate-900/40 border border-dashed border-slate-700 rounded-2xl">
          <Rocket size={30} className="mx-auto text-slate-600" />
          <p className="text-slate-300 mt-3 font-medium">The firm is standing by</p>
          <p className="text-sm text-slate-500 mt-1 max-w-md mx-auto">
            Hit <span className="text-gold-400 font-semibold">Deploy the Firm</span> and watch Maya summarize, then Lex, Sol, Doc,
            your lead department, Jules and Rex work it in parallel — with Sierra writing the client update at the end.
          </p>
        </div>
      )}

      {/* Activity feed / work products */}
      {products.length > 0 && (
        <div className="space-y-3">
          {/* Export all button */}
          {!running && products.some(p => p.content) && (
            <div className="flex justify-end">
              <button
                onClick={() => {
                  const done = products.filter(p => p.content);
                  const html = done.map(p => `
                    <h2>${p.emoji} ${p.agentName} — ${p.title}</h2>
                    <div class="section">${p.content!.split('\n\n').map(b => `<p>${b.replace(/\n/g,'<br/>')}</p>`).join('')}</div>
                  `).join('<hr style="margin:24px 0;border-color:#ddd"/>');
                  const caseTitle = activeCase?.title ?? 'Case';
                  printAsPdf(
                    `Firm Command Work Products — ${caseTitle}`,
                    `<h1>Firm Command Briefing</h1><div class="meta">Case: ${caseTitle} &nbsp;|&nbsp; Generated: ${new Date().toLocaleDateString()}</div>${html}`
                  );
                }}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gold-500 hover:bg-gold-400 text-slate-950 font-bold text-sm transition-colors"
              >
                <FileDown size={15} /> Export All as PDF
              </button>
            </div>
          )}
          {products.map(p => {
            const isOpen = expanded === p.taskId;
            return (
              <div key={p.taskId} className={`bg-slate-900 border rounded-2xl overflow-hidden transition-colors ${p.status === 'working' ? 'border-gold-500/40' : 'border-slate-800'}`}>
                <button
                  onClick={() => p.content && setExpanded(isOpen ? null : p.taskId)}
                  className="w-full text-left p-4 flex items-center gap-3 hover:bg-slate-800/30 transition-colors"
                >
                  <div className={`relative text-2xl ${p.status === 'working' ? 'animate-pulse' : ''}`}>
                    {p.emoji}
                    {p.status === 'working' && <span className="absolute -inset-1 rounded-full border border-gold-500/40 animate-ping" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className={`font-semibold ${p.colorClass}`}>{p.agentName}</p>
                    <p className="text-xs text-slate-400 truncate">{p.title}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`text-[10px] font-bold uppercase tracking-wide ${
                      p.status === 'done' ? 'text-green-400' : p.status === 'working' ? 'text-gold-400' : p.status === 'error' ? 'text-rose-400' : 'text-slate-600'
                    }`}>
                      {p.status === 'queued' ? 'Queued' : p.status === 'working' ? 'Working' : p.status === 'error' ? 'Error' : 'Done'}
                    </span>
                    <StatusIcon status={p.status} />
                    {p.content && <ChevronDown size={15} className={`text-slate-500 transition-transform ${isOpen ? 'rotate-180' : ''}`} />}
                  </div>
                </button>
                {isOpen && p.content && (
                  <div className="px-4 pb-4 pt-1 border-t border-slate-800">
                    <MiniMarkdown text={p.content} />
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

export default CaseOrchestrator;
