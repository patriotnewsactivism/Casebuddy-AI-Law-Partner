/**
 * ConnectedApps — the cross-app sync hub UI.
 *
 * Shows the three CaseBuddy apps that share this firm's cloud, lets you pull
 * DiscoveryLens uploads into a case with one click, push a case to Companion
 * or DiscoveryLens, and see a live feed of everything syncing between them.
 */

import React, { useContext, useEffect, useState } from 'react';
import { AppContext } from '../App';
import { toast } from 'react-toastify';
import {
  Network, ArrowRightLeft, FileText, Scale, User, ScanSearch,
  Download, RefreshCw, CheckCircle2, ArrowRight, Loader2,
} from 'lucide-react';
import {
  APP_LABELS, AppId, THIS_APP,
  listDocumentsFromApp, adoptDocumentIntoCase, pushCaseToApp,
  recentSyncEvents, exportCaseBundle, SyncEvent,
} from '../services/interopSync';
import type { DocumentRecord } from '../services/documentPipeline';

const APP_META: Record<AppId, { icon: React.ReactNode; blurb: string; accent: string }> = {
  'law-partner': {
    icon: <Scale size={20} />,
    blurb: 'Full agentic AI firm — start-to-end case management for the best outcome.',
    accent: 'text-gold-400 border-gold-500/40 bg-gold-500/10',
  },
  'companion': {
    icon: <User size={20} />,
    blurb: 'Personal high-end companion for a solo attorney or pro-se litigant.',
    accent: 'text-blue-400 border-blue-500/40 bg-blue-500/10',
  },
  'discoverylens': {
    icon: <ScanSearch size={20} />,
    blurb: 'Precision document intelligence — extract, Bates-stamp, and auto-name every filing.',
    accent: 'text-violet-400 border-violet-500/40 bg-violet-500/10',
  },
};

const ConnectedApps: React.FC = () => {
  const { cases, activeCase } = useContext(AppContext) as any;
  const [incoming, setIncoming] = useState<DocumentRecord[]>([]);
  const [events, setEvents] = useState<SyncEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [targetCaseId, setTargetCaseId] = useState<string>('');

  const refresh = async () => {
    setLoading(true);
    const [docs, evs] = await Promise.all([
      listDocumentsFromApp('discoverylens', { unassignedOnly: true, limit: 50 }),
      recentSyncEvents(25),
    ]);
    setIncoming(docs);
    setEvents(evs);
    setLoading(false);
  };

  useEffect(() => {
    refresh();
    if (activeCase?.id) setTargetCaseId(activeCase.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const adopt = async (doc: DocumentRecord) => {
    const caseId = targetCaseId || activeCase?.id;
    if (!caseId) { toast.error('Pick a case to sync this document into first.'); return; }
    setBusyId(doc.id);
    const ok = await adoptDocumentIntoCase(doc.id, caseId, THIS_APP);
    setBusyId(null);
    if (ok) {
      toast.success(`Synced "${doc.name}" into your case`);
      setIncoming(prev => prev.filter(d => d.id !== doc.id));
      recentSyncEvents(25).then(setEvents);
    } else {
      toast.error('Could not sync — check your connection.');
    }
  };

  const pushCase = async (target: AppId) => {
    const c = activeCase;
    if (!c) { toast.error('Open a case first.'); return; }
    setBusyId(`push-${target}`);
    const ok = await pushCaseToApp(c.id, target);
    setBusyId(null);
    if (ok) {
      toast.success(`"${c.title}" is now available in ${APP_LABELS[target]}`);
      recentSyncEvents(25).then(setEvents);
    } else {
      toast.error('Push failed — check your connection.');
    }
  };

  const downloadBundle = async () => {
    if (!activeCase) { toast.error('Open a case first.'); return; }
    const bundle = await exportCaseBundle(activeCase);
    const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${activeCase.title.replace(/[^\w]+/g, '-')}.cbif.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-8">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-xl bg-gold-500/15 border border-gold-500/40 flex items-center justify-center">
          <Network size={20} className="text-gold-400" />
        </div>
        <div>
          <h1 className="text-xl font-black text-white">Connected Apps</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            One shared cloud across the CaseBuddy suite — sync documents and cases with a click.
          </p>
        </div>
        <button onClick={refresh} className="ml-auto p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800" title="Refresh">
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* The three apps */}
      <div className="grid sm:grid-cols-3 gap-3">
        {(Object.keys(APP_META) as AppId[]).map(app => {
          const meta = APP_META[app];
          const isThis = app === THIS_APP;
          return (
            <div key={app} className={`rounded-2xl border p-4 ${meta.accent} ${isThis ? 'ring-1 ring-gold-500/50' : ''}`}>
              <div className="flex items-center gap-2">{meta.icon}<span className="font-bold text-white text-sm">{APP_LABELS[app]}</span></div>
              <p className="text-xs text-slate-300/80 mt-2 leading-relaxed">{meta.blurb}</p>
              {isThis
                ? <span className="inline-flex items-center gap-1 text-[10px] font-bold mt-3 text-gold-300"><CheckCircle2 size={11} /> You are here</span>
                : (
                  <button
                    onClick={() => pushCase(app)}
                    disabled={!activeCase || busyId === `push-${app}`}
                    className="mt-3 w-full flex items-center justify-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    {busyId === `push-${app}` ? <Loader2 size={13} className="animate-spin" /> : <ArrowRight size={13} />}
                    Push active case
                  </button>
                )}
            </div>
          );
        })}
      </div>

      {/* Target case selector */}
      <div className="flex items-center gap-3 bg-slate-900/60 border border-slate-800 rounded-xl px-4 py-3">
        <ArrowRightLeft size={16} className="text-slate-500 shrink-0" />
        <label className="text-sm text-slate-400 shrink-0">Sync incoming documents into:</label>
        <select
          value={targetCaseId}
          onChange={e => setTargetCaseId(e.target.value)}
          className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-white"
        >
          <option value="">— pick a case —</option>
          {(cases ?? []).map((c: any) => <option key={c.id} value={c.id}>{c.title}</option>)}
        </select>
        <button onClick={downloadBundle} disabled={!activeCase}
          className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800 disabled:opacity-40"
          title="Export active case as a portable CBIF bundle">
          <Download size={13} /> Export
        </button>
      </div>

      {/* Incoming from DiscoveryLens */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <ScanSearch size={16} className="text-violet-400" />
          <h2 className="text-sm font-bold text-white">From DiscoveryLens</h2>
          <span className="text-xs text-slate-500">— documents ready to pull in</span>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12 text-slate-500"><Loader2 size={22} className="animate-spin" /></div>
        ) : incoming.length === 0 ? (
          <div className="text-center py-10 bg-slate-900/40 border border-dashed border-slate-800 rounded-xl">
            <FileText size={22} className="text-slate-600 mx-auto" />
            <p className="text-sm text-slate-500 mt-2">No unassigned DiscoveryLens documents.</p>
            <p className="text-xs text-slate-600 mt-1">Uploads with Bates numbers &amp; extracted fields will appear here.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {incoming.map(doc => (
              <div key={doc.id} className="flex items-center gap-3 bg-slate-800/60 border border-slate-700/60 rounded-xl px-4 py-3">
                <FileText size={18} className="text-violet-400 shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-white truncate">{doc.name}</div>
                  <div className="text-xs text-slate-500 flex items-center gap-2 mt-0.5">
                    {doc.bates_formatted && <span className="font-mono text-violet-300">{doc.bates_formatted}</span>}
                    {doc.document_type && <span>{doc.document_type}</span>}
                    {doc.summary && <span className="truncate">· {doc.summary.slice(0, 60)}</span>}
                  </div>
                </div>
                <button
                  onClick={() => adopt(doc)}
                  disabled={busyId === doc.id}
                  className="flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 text-white disabled:opacity-50 shrink-0"
                >
                  {busyId === doc.id ? <Loader2 size={13} className="animate-spin" /> : <ArrowRight size={13} />}
                  Sync in
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Sync activity feed */}
      {events.length > 0 && (
        <div>
          <h2 className="text-sm font-bold text-white mb-3">Recent sync activity</h2>
          <div className="space-y-1.5">
            {events.map(e => (
              <div key={e.id} className="flex items-center gap-2 text-xs text-slate-400 bg-slate-900/40 border border-slate-800/60 rounded-lg px-3 py-2">
                <ArrowRightLeft size={12} className="text-slate-600 shrink-0" />
                <span className="font-medium text-slate-300">{APP_LABELS[e.from_app as AppId] ?? e.from_app}</span>
                <ArrowRight size={11} className="text-slate-600" />
                <span className="font-medium text-slate-300">{APP_LABELS[e.to_app as AppId] ?? e.to_app}</span>
                <span className="text-slate-600">·</span>
                <span>{e.action === 'push' ? 'pushed' : e.action === 'pull' ? 'pulled' : 'updated'} a {e.entity_type}</span>
                <span className="ml-auto text-slate-600">{new Date(e.created_at).toLocaleString()}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default ConnectedApps;
