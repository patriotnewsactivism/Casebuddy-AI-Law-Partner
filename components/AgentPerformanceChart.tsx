import React, { useEffect, useState } from 'react';
import { Activity, CheckCircle2, XCircle, Clock } from 'lucide-react';
import { backgroundEngine, subscribeAgentStatuses } from '../services/backgroundAgentEngine';
import { OPERATIONAL_AGENTS } from '../agents/personas';
import type { AgentStatus } from '../types';

const AgentPerformanceChart: React.FC = () => {
  const [statuses, setStatuses] = useState<AgentStatus[]>(() => backgroundEngine.getStatuses());

  useEffect(() => {
    const unsub = subscribeAgentStatuses(setStatuses);
    return unsub;
  }, []);

  // Enrich statuses with agent display info; filter to agents that have any activity
  const rows = OPERATIONAL_AGENTS.map(agent => {
    const status = statuses.find(s => s.agentId === agent.id) ?? {
      agentId: agent.id,
      isActive: false,
      tasksCompleted: 0,
      tasksToday: 0,
      insights: 0,
    };

    const failed = backgroundEngine
      .getTasks({ agentId: agent.id, status: 'failed' }).length;
    const total = status.tasksCompleted + failed;
    const successRate = total > 0 ? Math.round((status.tasksCompleted / total) * 100) : null;

    return { agent, status, failed, total, successRate };
  }).filter(r => r.total > 0 || r.status.isActive || r.status.tasksToday > 0);

  if (rows.length === 0) {
    return (
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
        <div className="flex items-center gap-2 mb-3">
          <Activity size={17} className="text-gold-400" />
          <h3 className="text-sm font-bold text-white">Agent Performance</h3>
        </div>
        <p className="text-slate-500 text-xs">No agent activity yet. Tasks will appear here once the background engine runs.</p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
      <div className="flex items-center gap-2 mb-4">
        <Activity size={17} className="text-gold-400" />
        <h3 className="text-sm font-bold text-white">Agent Performance</h3>
        <span className="ml-auto text-[10px] text-slate-600">{rows.length} agents</span>
      </div>

      <div className="space-y-3">
        {rows.map(({ agent, status, failed, successRate }) => (
          <div key={agent.id} className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-base w-5 text-center shrink-0">{agent.emoji}</span>
              <span className="text-xs font-semibold text-slate-200 flex-1">{agent.name}</span>

              {status.isActive && (
                <span className="text-[9px] bg-gold-500/15 border border-gold-500/25 text-gold-400 px-1.5 py-0.5 rounded-full font-semibold animate-pulse">
                  LIVE
                </span>
              )}

              <div className="flex items-center gap-2.5 text-[10px] text-slate-500">
                {status.tasksCompleted > 0 && (
                  <span className="flex items-center gap-0.5 text-green-400">
                    <CheckCircle2 size={9} /> {status.tasksCompleted}
                  </span>
                )}
                {failed > 0 && (
                  <span className="flex items-center gap-0.5 text-red-400">
                    <XCircle size={9} /> {failed}
                  </span>
                )}
                {status.tasksToday > 0 && (
                  <span className="flex items-center gap-0.5">
                    <Clock size={9} /> {status.tasksToday} today
                  </span>
                )}
                {status.insights > 0 && (
                  <span className="text-cyan-400">{status.insights} insights</span>
                )}
              </div>
            </div>

            {successRate !== null && (
              <div className="ml-7">
                <div className="h-1 bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-700 ${successRate >= 80 ? 'bg-green-500' : successRate >= 50 ? 'bg-yellow-500' : 'bg-red-500'}`}
                    style={{ width: `${successRate}%` }}
                  />
                </div>
                <p className="text-[9px] text-slate-600 mt-0.5">{successRate}% success rate</p>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default AgentPerformanceChart;
