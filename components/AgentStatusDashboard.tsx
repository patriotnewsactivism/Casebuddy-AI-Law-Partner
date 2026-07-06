import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Activity, CheckCircle2, Clock, Loader2, BrainCircuit, Zap, RefreshCw } from 'lucide-react';
import { subscribeAgentStatuses, backgroundEngine } from '../services/backgroundAgentEngine';
import { OPERATIONAL_AGENTS } from '../agents/personas';
import type { AgentStatus } from '../types';
import AgentPerformanceChart from './AgentPerformanceChart';
import TaskQueueVisualizer from './TaskQueueVisualizer';

// ── Helpers ────────────────────────────────────────────────────────────────

function relativeTime(ts?: number): string {
  if (!ts) return 'Never';
  const diff = Date.now() - ts;
  if (diff < 60_000)  return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

// ── Single agent status row ────────────────────────────────────────────────

const AgentRow: React.FC<{ agent: typeof OPERATIONAL_AGENTS[0]; status?: AgentStatus }> = ({
  agent,
  status,
}) => {
  const isActive = status?.isActive ?? false;
  const completed = status?.tasksToday ?? 0;

  return (
    <Link
      to={agent.route}
      className={`flex items-center gap-3 p-3 rounded-xl border transition-all hover:bg-slate-800/70 ${
        isActive
          ? `${agent.borderClass} ${agent.bgClass}`
          : 'border-slate-800 bg-slate-900/40'
      }`}
    >
      {/* Avatar with live indicator */}
      <div className="relative shrink-0">
        <div
          className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg border ${agent.borderClass}`}
          style={{ background: 'rgba(0,0,0,0.3)' }}
        >
          {agent.emoji}
        </div>
        {/* Availability dot — always green (agents always on-call) */}
        <span className="absolute -bottom-0.5 -right-0.5 flex h-3 w-3">
          <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-60 ${isActive ? 'bg-amber-400' : 'bg-green-400'}`} />
          <span className={`relative inline-flex rounded-full h-3 w-3 ${isActive ? 'bg-amber-400' : 'bg-green-400'}`} />
        </span>
      </div>

      {/* Name + status */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className={`text-sm font-semibold truncate ${agent.colorClass}`}>{agent.name}</span>
          {isActive && (
            <span className="flex items-center gap-1 text-[10px] text-amber-400">
              <Loader2 size={10} className="animate-spin" /> Working
            </span>
          )}
        </div>
        <p className="text-[11px] text-slate-500 truncate">
          {isActive && status?.currentTask
            ? status.currentTask.description
            : agent.role}
        </p>
      </div>

      {/* Today's task count */}
      {completed > 0 && (
        <div className="text-right shrink-0">
          <div className="text-lg font-bold text-gold-400 leading-none">{completed}</div>
          <div className="text-[9px] text-slate-600 mt-0.5">today</div>
        </div>
      )}
    </Link>
  );
};

// ── Main component ─────────────────────────────────────────────────────────

const AgentStatusDashboard: React.FC = () => {
  const [statuses, setStatuses] = useState<AgentStatus[]>(() => backgroundEngine.getStatuses());

  useEffect(() => {
    const unsub = subscribeAgentStatuses(setStatuses);
    return unsub;
  }, []);

  const statusMap = Object.fromEntries(statuses.map(s => [s.agentId, s]));

  const activeCount = statuses.filter(s => s.isActive).length;
  const totalToday  = statuses.reduce((sum, s) => sum + (s.tasksToday ?? 0), 0);

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <BrainCircuit size={18} className="text-gold-400" />
          <div>
            <h3 className="text-sm font-bold text-white leading-tight">AI Team Activity</h3>
            <p className="text-[11px] text-slate-500">
              {activeCount > 0
                ? `${activeCount} agent${activeCount > 1 ? 's' : ''} working`
                : 'All agents on standby'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {totalToday > 0 && (
            <div className="flex items-center gap-1.5 bg-gold-500/10 border border-gold-500/20 rounded-lg px-2 py-1">
              <Zap size={11} className="text-gold-400" />
              <span className="text-[11px] font-bold text-gold-400">{totalToday} tasks</span>
              <span className="text-[10px] text-slate-500">today</span>
            </div>
          )}
        </div>
      </div>

      {/* Agent rows */}
      <div className="space-y-1.5">
        {OPERATIONAL_AGENTS.map(agent => (
          <AgentRow key={agent.id} agent={agent} status={statusMap[agent.id]} />
        ))}
      </div>

      {/* Footer note */}
      <p className="text-[10px] text-slate-600 mt-3 text-center">
        Agents work autonomously in the background · Click to interact
      </p>

      {/* Performance metrics + live task queue */}
      <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-4">
        <AgentPerformanceChart />
        <TaskQueueVisualizer />
      </div>
    </div>
  );
};

export default AgentStatusDashboard;
