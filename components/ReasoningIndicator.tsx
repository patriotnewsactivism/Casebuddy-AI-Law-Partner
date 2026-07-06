import React from 'react';
import { BrainCircuit, Loader2, Users, Swords, Zap } from 'lucide-react';
import type { ReasoningMode, ReasoningResult } from '../types';

// ── Mode selector ──────────────────────────────────────────────────────────

const MODE_META: Record<
  ReasoningMode,
  { label: string; icon: React.ReactNode; color: string; bg: string; border: string; desc: string; est: string }
> = {
  standard: {
    label: 'Standard',
    icon: <Zap size={13} />,
    color: 'text-slate-300',
    bg: 'bg-slate-800',
    border: 'border-slate-700',
    desc: 'Quick, direct response',
    est: '~5s',
  },
  'deep-think': {
    label: 'Deep Think',
    icon: <BrainCircuit size={13} />,
    color: 'text-violet-400',
    bg: 'bg-violet-500/10',
    border: 'border-violet-500/30',
    desc: 'Chain-of-thought with self-critique',
    est: '~45s',
  },
  'expert-panel': {
    label: 'Expert Panel',
    icon: <Users size={13} />,
    color: 'text-cyan-400',
    bg: 'bg-cyan-500/10',
    border: 'border-cyan-500/30',
    desc: 'Multi-specialist parallel consultation',
    est: '~60s',
  },
  adversarial: {
    label: 'Adversarial',
    icon: <Swords size={13} />,
    color: 'text-red-400',
    bg: 'bg-red-500/10',
    border: 'border-red-500/30',
    desc: 'Red team attack + blue team defense',
    est: '~75s',
  },
};

interface ReasoningModeSelectorProps {
  value: ReasoningMode;
  onChange: (mode: ReasoningMode) => void;
  disabled?: boolean;
  compact?: boolean;
}

export const ReasoningModeSelector: React.FC<ReasoningModeSelectorProps> = ({
  value,
  onChange,
  disabled,
  compact,
}) => {
  const modes: ReasoningMode[] = ['standard', 'deep-think', 'expert-panel', 'adversarial'];

  if (compact) {
    return (
      <select
        value={value}
        onChange={e => onChange(e.target.value as ReasoningMode)}
        disabled={disabled}
        className="text-xs bg-slate-800 border border-slate-700 rounded-lg px-2 py-1.5 text-slate-300 focus:outline-none focus:border-gold-500/50"
      >
        {modes.map(m => (
          <option key={m} value={m}>
            {MODE_META[m].label} ({MODE_META[m].est})
          </option>
        ))}
      </select>
    );
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {modes.map(m => {
        const meta = MODE_META[m];
        const active = value === m;
        return (
          <button
            key={m}
            onClick={() => onChange(m)}
            disabled={disabled}
            title={`${meta.desc} · Est. ${meta.est}`}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-all ${
              active
                ? `${meta.bg} ${meta.border} ${meta.color}`
                : 'bg-slate-800/50 border-slate-700 text-slate-500 hover:border-slate-600 hover:text-slate-300'
            } ${disabled ? 'opacity-40 cursor-not-allowed' : ''}`}
          >
            {meta.icon}
            {meta.label}
            <span className={`text-[9px] ${active ? 'opacity-70' : 'opacity-40'}`}>{meta.est}</span>
          </button>
        );
      })}
    </div>
  );
};

// ── Progress indicator ─────────────────────────────────────────────────────

interface ReasoningIndicatorProps {
  mode: ReasoningMode;
  step?: number;
  totalSteps?: number;
  stepLabel?: string;
}

export const ReasoningIndicator: React.FC<ReasoningIndicatorProps> = ({
  mode,
  step,
  totalSteps,
  stepLabel,
}) => {
  const meta = MODE_META[mode];

  if (mode === 'standard') {
    return (
      <div className="flex items-center gap-2 text-slate-400 text-sm">
        <Loader2 size={14} className="animate-spin" />
        <span>Thinking…</span>
      </div>
    );
  }

  return (
    <div className={`rounded-xl border ${meta.border} ${meta.bg} px-4 py-3`}>
      <div className="flex items-center gap-2 mb-2">
        <Loader2 size={14} className={`animate-spin ${meta.color}`} />
        <span className={`text-xs font-bold ${meta.color}`}>{meta.label} Mode Active</span>
        {step !== undefined && totalSteps !== undefined && (
          <span className="text-[10px] text-slate-500 ml-auto">
            Step {step}/{totalSteps}
          </span>
        )}
      </div>

      {/* Progress bar */}
      {step !== undefined && totalSteps !== undefined && (
        <div className="h-1 bg-slate-800 rounded-full overflow-hidden mb-2">
          <div
            className={`h-full rounded-full transition-all duration-500 ${meta.color.replace('text-', 'bg-')}`}
            style={{ width: `${Math.round((step / totalSteps) * 100)}%` }}
          />
        </div>
      )}

      <p className="text-[11px] text-slate-400">{stepLabel ?? meta.desc}</p>
    </div>
  );
};

// ── Result summary badge ───────────────────────────────────────────────────

interface ReasoningResultBadgeProps {
  result: ReasoningResult;
}

export const ReasoningResultBadge: React.FC<ReasoningResultBadgeProps> = ({ result }) => {
  const meta = MODE_META[result.mode];

  return (
    <div className={`flex items-center gap-2 text-[10px] px-2 py-1 rounded-lg border ${meta.border} ${meta.bg}`}>
      <span className={meta.color}>{meta.icon}</span>
      <span className={`font-semibold ${meta.color}`}>{meta.label}</span>
      <span className="text-slate-500">·</span>
      <span className="text-slate-400">{result.confidence}% confidence</span>
      {result.steps && result.steps.length > 0 && (
        <>
          <span className="text-slate-500">·</span>
          <span className="text-slate-400">{result.steps.length} steps</span>
        </>
      )}
      <span className="text-slate-500">·</span>
      <span className="text-slate-400">{(result.durationMs / 1000).toFixed(1)}s</span>
    </div>
  );
};

export default ReasoningIndicator;
