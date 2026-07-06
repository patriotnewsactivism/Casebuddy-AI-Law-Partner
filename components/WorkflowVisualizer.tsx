import React, { useEffect, useState, useContext } from 'react';
import {
  Network, CheckCircle2, Circle, Loader2, AlertCircle,
  ChevronDown, ChevronUp,
} from 'lucide-react';
import { subscribeWorkflows, orchestrator } from '../services/agentOrchestrator';
import { AppContext } from '../App';
import type { Workflow, WorkflowStep } from '../types';

// ── Step row ───────────────────────────────────────────────────────────────

const StepRow: React.FC<{ step: WorkflowStep }> = ({ step }) => {
  const icon = {
    pending:   <Circle      size={11} className="text-slate-700 shrink-0" />,
    running:   <Loader2     size={11} className="text-gold-400 animate-spin shrink-0" />,
    completed: <CheckCircle2 size={11} className="text-green-400 shrink-0" />,
    failed:    <AlertCircle size={11} className="text-red-400 shrink-0" />,
    skipped:   <Circle      size={11} className="text-slate-600 shrink-0" />,
  }[step.status];

  return (
    <div className={`flex items-center gap-2 py-0.5 ${step.status === 'pending' ? 'opacity-40' : ''}`}>
      {icon}
      <span className={`text-[11px] flex-1 truncate ${
        step.status === 'completed' ? 'text-slate-500 line-through' :
        step.status === 'running'   ? 'text-white font-medium' :
        step.status === 'failed'    ? 'text-red-400' :
        'text-slate-500'
      }`}>
        {step.description}
      </span>
    </div>
  );
};

// ── Workflow card ──────────────────────────────────────────────────────────

const WorkflowCard: React.FC<{ workflow: Workflow }> = ({ workflow }) => {
  const [expanded, setExpanded] = useState(workflow.status === 'running');

  const completed = workflow.steps.filter(s => s.status === 'completed').length;
  const progress = Math.round((completed / Math.max(workflow.steps.length, 1)) * 100);

  const cardBorder =
    workflow.status === 'running'   ? 'border-gold-500/30 bg-gold-500/5' :
    workflow.status === 'completed' ? 'border-green-500/20 bg-green-500/5' :
    workflow.status === 'failed'    ? 'border-red-500/20 bg-red-500/5' :
    'border-slate-700 bg-slate-800/30';

  const statusIcon =
    workflow.status === 'running'   ? <Loader2      size={13} className="text-gold-400 animate-spin shrink-0" /> :
    workflow.status === 'completed' ? <CheckCircle2 size={13} className="text-green-400 shrink-0" /> :
    workflow.status === 'failed'    ? <AlertCircle  size={13} className="text-red-400 shrink-0" /> :
                                      <Circle       size={13} className="text-slate-500 shrink-0" />;

  return (
    <div className={`rounded-xl border p-3 ${cardBorder}`}>
      <button
        className="flex items-center gap-2 w-full text-left"
        onClick={() => setExpanded(v => !v)}
      >
        {statusIcon}
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-slate-200 truncate">{workflow.name}</p>
          <p className="text-[10px] text-slate-500">
            {completed}/{workflow.steps.length} steps
            {workflow.status === 'running' && ` · ${progress}%`}
          </p>
        </div>
        {expanded
          ? <ChevronUp size={12} className="text-slate-500 shrink-0" />
          : <ChevronDown size={12} className="text-slate-500 shrink-0" />}
      </button>

      {workflow.status === 'running' && (
        <div className="h-0.5 bg-slate-800 rounded-full overflow-hidden mt-2">
          <div
            className="h-full bg-gold-400 rounded-full transition-all duration-700"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}

      {expanded && (
        <div className="mt-2.5 pt-2 border-t border-slate-800/60 space-y-0.5">
          {workflow.steps.map(step => <StepRow key={step.id} step={step} />)}
        </div>
      )}
    </div>
  );
};

// ── Main component ─────────────────────────────────────────────────────────

const WorkflowVisualizer: React.FC = () => {
  const { activeCase } = useContext(AppContext);
  const [workflows, setWorkflows] = useState<Workflow[]>([]);

  useEffect(() => {
    // Load initial state
    const initial = orchestrator.getWorkflows(activeCase?.id ?? undefined);
    setWorkflows(initial.slice(-6));

    // Subscribe to live changes
    const unsub = subscribeWorkflows(all => {
      const filtered = activeCase
        ? all.filter(w => w.caseId === activeCase.id)
        : all;
      setWorkflows(filtered.slice(-6));
    });
    return unsub;
  }, [activeCase?.id]);

  if (workflows.length === 0) return null;

  const active = workflows.filter(w => w.status === 'running' || w.status === 'pending');
  const recent = workflows
    .filter(w => w.status === 'completed' || w.status === 'failed')
    .slice(-3);

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
      <div className="flex items-center gap-2 mb-4">
        <Network size={17} className="text-gold-400" />
        <h3 className="text-sm font-bold text-white">Active Workflows</h3>
        {active.length > 0 && (
          <span className="ml-1 text-[10px] bg-gold-500/20 border border-gold-500/30 text-gold-400 px-1.5 py-0.5 rounded-full font-semibold">
            {active.length} running
          </span>
        )}
        <span className="ml-auto text-[10px] text-slate-600">{workflows.length} total</span>
      </div>

      <div className="space-y-2">
        {active.map(wf => <WorkflowCard key={wf.id} workflow={wf} />)}
        {recent.map(wf => <WorkflowCard key={wf.id} workflow={wf} />)}
      </div>
    </div>
  );
};

export default WorkflowVisualizer;
