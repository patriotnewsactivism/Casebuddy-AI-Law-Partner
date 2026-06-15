import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'react-toastify';
import { Inbox, Copy, Check, ArrowRight, CircleDot } from 'lucide-react';
import { IntakeCase } from '../types';
import { fetchIntakes, subscribeIntakes } from '../services/intakeStore';

// Compact dashboard surface for the voice-intake pipeline: live count of new
// leads, the most recent few, and one-tap access to the shareable link.

const intakeUrl = () => `${window.location.origin}${window.location.pathname}#/intake`;

const scoreColor = (s: number) =>
  s >= 65 ? 'text-green-400 border-green-500/40' : s >= 45 ? 'text-amber-400 border-amber-500/40' : 'text-rose-400 border-rose-500/40';

const IntakeWidget: React.FC = () => {
  const [rows, setRows] = useState<IntakeCase[]>([]);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetchIntakes().then(setRows);
    const unsub = subscribeIntakes(row => {
      setRows(prev => (prev.some(r => r.id === row.id) ? prev : [row, ...prev]));
      toast.info(`New intake: ${row.full_name} · ${row.matter_type}`);
    });
    return unsub;
  }, []);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(intakeUrl());
      setCopied(true);
      toast.success('Intake link copied');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.info(intakeUrl());
    }
  };

  const newCount = rows.filter(r => r.status === 'new').length;

  return (
    <div className="rounded-2xl border border-violet-500/30 bg-gradient-to-br from-violet-500/10 via-slate-900 to-slate-900 p-4 sm:p-5">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-violet-500/20 border border-violet-500/40 flex items-center justify-center text-violet-300 shrink-0">
          <Inbox size={20} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="font-bold text-white text-sm sm:text-base">Voice Intake</p>
            {newCount > 0 && (
              <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-violet-500/20 border border-violet-500/40 text-violet-200">
                {newCount} new
              </span>
            )}
          </div>
          <p className="text-slate-400 text-xs mt-0.5">Maya greets prospects by voice and scores their case automatically.</p>
        </div>
        <button
          onClick={copy}
          className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-violet-500 hover:bg-violet-400 text-white text-xs font-bold transition-colors"
        >
          {copied ? <Check size={14} /> : <Copy size={14} />}
          {copied ? 'Copied' : 'Share link'}
        </button>
      </div>

      {rows.length > 0 && (
        <div className="mt-4 space-y-2">
          {rows.slice(0, 3).map(r => (
            <Link
              key={r.id}
              to="/app/intake-inbox"
              className="flex items-center gap-3 p-2.5 rounded-xl bg-slate-950/50 border border-slate-800 hover:border-slate-600 transition-colors"
            >
              <span className={`w-9 h-9 rounded-lg border flex items-center justify-center text-sm font-bold ${scoreColor(r.score)}`}>
                {r.score}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-white truncate flex items-center gap-1.5">
                  {r.status === 'new' && <CircleDot size={10} className="text-violet-400 shrink-0" />}
                  {r.full_name}
                </p>
                <p className="text-xs text-slate-500 truncate">{r.matter_type} · routed to {r.recommended_department}</p>
              </div>
            </Link>
          ))}
        </div>
      )}

      <Link
        to="/app/intake-inbox"
        className="mt-3 flex items-center justify-center gap-1.5 text-sm text-violet-300 hover:text-violet-200 font-semibold transition-colors"
      >
        Open Intake Inbox <ArrowRight size={14} />
      </Link>
    </div>
  );
};

export default IntakeWidget;
