import React, { useEffect, useState } from 'react';
import { ListChecks, Loader2, Clock, AlertCircle } from 'lucide-react';
import { backgroundEngine, subscribeAgentStatuses } from '../services/backgroundAgentEngine';
import { getAgentById } from '../agents/personas';
import type { BackgroundTask } from '../types';

const PRIORITY_COLOR: Record<string, string> = {
  urgent: 'text-red-400 border-red-500/30 bg-red-500/5',
  high:   'text-orange-400 border-orange-500/30 bg-orange-500/5',
  medium: 'text-yellow-400 border-yellow-500/30 bg-yellow-500/5',
  low:    'text-slate-400 border-slate-600 bg-slate-800/30',
};

const TaskRow: React.FC<{ task: BackgroundTask; running?: boolean }> = ({ task, running }) => {
  const agent = getAgentById(task.agentId);
  const colorCls = PRIORITY_COLOR[task.priority] ?? PRIORITY_COLOR.low;

  return (
    <div className={`flex items-center gap-2.5 rounded-lg border px-3 py-2 ${colorCls}`}>
      {running
        ? <Loader2 size={11} className="text-gold-400 animate-spin shrink-0" />
        : <Clock size={11} className="shrink-0 opacity-60" />}

      <div className="flex-1 min-w-0">
        <p className="text-[11px] font-medium text-slate-200 truncate">{task.description}</p>
        <p className="text-[9px] text-slate-500">
          {agent ? `${agent.emoji} ${agent.name}` : task.agentId}
          {' · '}
          {task.taskType}
        </p>
      </div>

      <span className={`text-[9px] font-bold uppercase tracking-wide shrink-0 ${colorCls.split(' ')[0]}`}>
        {task.priority}
      </span>
    </div>
  );
};

const TaskQueueVisualizer: React.FC = () => {
  // Subscribe to status changes to trigger re-renders when tasks update
  const [, setTick] = useState(0);

  useEffect(() => {
    const unsub = subscribeAgentStatuses(() => setTick(t => t + 1));
    return unsub;
  }, []);

  const running = backgroundEngine.getTasks({ status: 'running' });
  const pending = backgroundEngine.getTasks({ status: 'pending' }).slice(0, 8);

  if (running.length === 0 && pending.length === 0) return null;

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
      <div className="flex items-center gap-2 mb-4">
        <ListChecks size={17} className="text-gold-400" />
        <h3 className="text-sm font-bold text-white">Task Queue</h3>
        {running.length > 0 && (
          <span className="ml-1 text-[10px] bg-gold-500/20 border border-gold-500/30 text-gold-400 px-1.5 py-0.5 rounded-full font-semibold">
            {running.length} running
          </span>
        )}
        {pending.length > 0 && (
          <span className="text-[10px] text-slate-500 ml-1">{pending.length} queued</span>
        )}
        <AlertCircle size={12} className="ml-auto text-slate-600" title="Background AI tasks" />
      </div>

      <div className="space-y-1.5">
        {running.map(t => <TaskRow key={t.id} task={t} running />)}
        {pending.map(t => <TaskRow key={t.id} task={t} />)}
      </div>
    </div>
  );
};

export default TaskQueueVisualizer;
