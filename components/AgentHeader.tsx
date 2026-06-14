
import React from 'react';
import { OperationalAgent, LegalSpecialist } from '../agents/personas';

type AgentHeaderProps = {
  agent: OperationalAgent | LegalSpecialist;
  compact?: boolean;
};

const isSpecialist = (agent: OperationalAgent | LegalSpecialist): agent is LegalSpecialist =>
  'practiceArea' in agent;

const AgentHeader: React.FC<AgentHeaderProps> = ({ agent, compact = false }) => {
  const specialist = isSpecialist(agent);

  if (compact) {
    return (
      <div className={`flex items-center gap-3 p-3 rounded-xl border ${agent.bgClass} ${agent.borderClass}`}>
        <div className={`w-10 h-10 rounded-full flex items-center justify-center text-xl ${agent.bgClass} border ${agent.borderClass} shrink-0`}>
          {agent.emoji}
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className={`font-bold text-sm ${agent.colorClass}`}>{agent.name}</span>
            <span className={`text-xs px-2 py-0.5 rounded-full border ${agent.bgClass} ${agent.borderClass} ${agent.colorClass} font-medium`}>
              {specialist ? agent.practiceArea : agent.role}
            </span>
          </div>
          <p className="text-xs text-slate-400 truncate">{agent.title}</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`rounded-2xl border p-6 ${agent.bgClass} ${agent.borderClass}`}>
      <div className="flex items-start gap-5">
        <div className={`w-16 h-16 rounded-2xl flex items-center justify-center text-3xl border ${agent.borderClass} shrink-0`}
          style={{ background: 'rgba(0,0,0,0.2)' }}>
          {agent.emoji}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <h2 className={`text-2xl font-bold font-serif ${agent.colorClass}`}>{agent.name}</h2>
            <span className={`text-xs px-3 py-1 rounded-full border ${agent.bgClass} ${agent.borderClass} ${agent.colorClass} font-semibold`}>
              {specialist ? agent.practiceArea : agent.role}
            </span>
            {specialist && (
              <span className="text-xs px-3 py-1 rounded-full bg-slate-800 border border-slate-700 text-slate-300 font-medium">
                {agent.yearsExperience} yrs exp
              </span>
            )}
          </div>
          <p className="text-slate-300 font-medium mb-2">{agent.title}</p>
          <p className="text-slate-400 text-sm leading-relaxed">{agent.description}</p>
          {specialist && (
            <div className="flex flex-wrap gap-2 mt-3">
              {agent.commonTopics.slice(0, 4).map(topic => (
                <span key={topic} className="text-xs bg-slate-800/60 border border-slate-700 text-slate-300 px-2 py-1 rounded-lg">
                  {topic}
                </span>
              ))}
              {agent.commonTopics.length > 4 && (
                <span className="text-xs text-slate-500 px-2 py-1">+{agent.commonTopics.length - 4} more</span>
              )}
            </div>
          )}
          {!specialist && (
            <div className="flex flex-wrap gap-2 mt-3">
              {(agent as OperationalAgent).capabilities.map(cap => (
                <span key={cap} className="text-xs bg-slate-800/60 border border-slate-700 text-slate-300 px-2 py-1 rounded-lg">
                  {cap}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AgentHeader;
