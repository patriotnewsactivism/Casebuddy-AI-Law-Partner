
import React, { useContext, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Shield, ArrowRight, CheckCircle, AlertCircle, Users, TrendingUp } from 'lucide-react';
import { AppContext } from '../App';
import { OPERATIONAL_AGENTS, OperationalAgent } from '../agents/personas';

// -------------------------------------------------------------------
// Helper: read a localStorage key and return its parsed value or null
// -------------------------------------------------------------------
const readStorage = (key: string): any => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

// -------------------------------------------------------------------
// Per-agent status logic
// -------------------------------------------------------------------
interface AgentStatus {
  label: string;
  count: number | null;
  ready: boolean;
}

const getAgentStatus = (agent: OperationalAgent, activeCaseId: string | null): AgentStatus => {
  switch (agent.id) {
    case 'maya': {
      const leads = readStorage('casebuddy_leads');
      const count = Array.isArray(leads) ? leads.length : null;
      return { label: count ? `${count} lead${count !== 1 ? 's' : ''} tracked` : 'Ready', count, ready: true };
    }
    case 'sol': {
      if (!activeCaseId) return { label: 'Ready', count: null, ready: true };
      const deadlines = readStorage(`deadlines_${activeCaseId}`);
      const count = Array.isArray(deadlines) ? deadlines.length : null;
      return { label: count ? `${count} deadline${count !== 1 ? 's' : ''} tracked` : 'Ready', count, ready: true };
    }
    case 'rex': {
      if (!activeCaseId) return { label: 'Ready', count: null, ready: true };
      const witnesses = readStorage(`witnessPrep_${activeCaseId}`);
      const count = Array.isArray(witnesses) ? witnesses.length : null;
      return { label: count ? `${count} witness${count !== 1 ? 'es' : ''} prepped` : 'Ready', count, ready: true };
    }
    case 'jules': {
      if (!activeCaseId) return { label: 'Ready', count: null, ready: true };
      const session = readStorage(`jurySession_${activeCaseId}`);
      return session
        ? { label: 'Session active', count: 1, ready: true }
        : { label: 'Ready', count: null, ready: true };
    }
    default:
      return { label: 'Ready', count: null, ready: true };
  }
};

// -------------------------------------------------------------------
// AgentCard
// -------------------------------------------------------------------
interface AgentCardProps {
  agent: OperationalAgent;
  activeCaseId: string | null;
}

const AgentCard: React.FC<AgentCardProps> = ({ agent, activeCaseId }) => {
  const status = useMemo(() => getAgentStatus(agent, activeCaseId), [agent, activeCaseId]);
  const hasActivity = status.count !== null && status.count > 0;

  return (
    <div className={`relative flex flex-col bg-slate-800 border ${agent.borderClass} rounded-xl p-5 hover:border-opacity-60 transition-all group`}>
      {/* Header */}
      <div className="flex items-start gap-3 mb-3">
        <div className={`text-2xl p-2 rounded-lg ${agent.bgClass} shrink-0`}>{agent.emoji}</div>
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className={`font-bold text-base ${agent.colorClass}`}>{agent.name}</h3>
            <span className={`text-xs px-2 py-0.5 rounded-full ${agent.bgClass} ${agent.colorClass} border ${agent.borderClass} font-medium`}>
              {agent.role}
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">{agent.title}</p>
        </div>
      </div>

      {/* Description */}
      <p className="text-sm text-slate-300 leading-relaxed line-clamp-2 mb-3 flex-1">
        {agent.description}
      </p>

      {/* Capability pills */}
      <div className="flex flex-wrap gap-1.5 mb-4">
        {agent.capabilities.slice(0, 2).map(cap => (
          <span key={cap} className="text-xs px-2 py-0.5 bg-slate-700 border border-slate-600 rounded-full text-slate-300">
            {cap}
          </span>
        ))}
        {agent.capabilities.length > 2 && (
          <span className="text-xs px-2 py-0.5 bg-slate-700 border border-slate-600 rounded-full text-slate-500">
            +{agent.capabilities.length - 2} more
          </span>
        )}
      </div>

      {/* Status + CTA */}
      <div className="flex items-center justify-between gap-2 mt-auto">
        {/* Status badge */}
        {hasActivity ? (
          <span className={`flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full ${agent.bgClass} ${agent.colorClass} border ${agent.borderClass}`}>
            <CheckCircle size={11} />
            {status.label}
          </span>
        ) : (
          <span className="flex items-center gap-1.5 text-xs text-slate-500 px-2.5 py-1 rounded-full bg-slate-700/50 border border-slate-700">
            <AlertCircle size={11} />
            {status.label}
          </span>
        )}

        {/* Brief button */}
        <Link
          to={agent.route}
          className={`flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-lg ${agent.bgClass} ${agent.colorClass} border ${agent.borderClass} hover:opacity-80 transition-opacity shrink-0`}
        >
          Brief {agent.name}
          <ArrowRight size={12} />
        </Link>
      </div>
    </div>
  );
};

// -------------------------------------------------------------------
// CaseBriefingCard
// -------------------------------------------------------------------
const CaseBriefingCard = () => {
  const { activeCase } = useContext(AppContext);

  if (!activeCase) {
    return (
      <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 text-center space-y-4">
        <div className="h-14 w-14 rounded-full bg-slate-700 border border-slate-600 flex items-center justify-center mx-auto">
          <AlertCircle size={28} className="text-slate-400" />
        </div>
        <div>
          <h3 className="text-lg font-semibold text-white mb-1">No Active Case</h3>
          <p className="text-sm text-slate-400">Select or create a case to brief all agents and activate the War Room.</p>
        </div>
        <Link
          to="/app/cases"
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-gold-500 hover:bg-gold-600 text-slate-900 font-semibold rounded-lg transition-colors"
        >
          Go to Case Files
          <ArrowRight size={16} />
        </Link>
      </div>
    );
  }

  const winProb = activeCase.winProbability ?? 0;
  const probColor = winProb >= 70 ? 'text-green-400' : winProb >= 45 ? 'text-yellow-400' : 'text-red-400';
  const probBg = winProb >= 70 ? 'bg-green-500' : winProb >= 45 ? 'bg-yellow-500' : 'bg-red-500';

  return (
    <div className="bg-slate-800 border border-slate-700 rounded-xl p-6">
      <div className="flex items-start justify-between gap-4 mb-5">
        <div>
          <h3 className="text-lg font-bold text-white font-serif">{activeCase.title}</h3>
          <p className="text-sm text-slate-400 mt-0.5">Active Case Briefing</p>
        </div>
        <Link
          to="/app/cases"
          className="flex items-center gap-1 text-sm text-gold-400 hover:text-gold-300 transition-colors shrink-0 font-medium"
        >
          Update Case <ArrowRight size={14} />
        </Link>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-5">
        <div className="bg-slate-900/50 rounded-lg p-3">
          <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">Client</p>
          <p className="text-sm font-semibold text-white">{activeCase.client || '—'}</p>
        </div>
        <div className="bg-slate-900/50 rounded-lg p-3">
          <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">Opposing Counsel</p>
          <p className="text-sm font-semibold text-white">{activeCase.opposingCounsel || '—'}</p>
        </div>
        <div className="bg-slate-900/50 rounded-lg p-3">
          <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">Judge</p>
          <p className="text-sm font-semibold text-white">{activeCase.judge || '—'}</p>
        </div>
        <div className="bg-slate-900/50 rounded-lg p-3">
          <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">Status</p>
          <span className="inline-block text-xs font-bold px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-400 border border-blue-500/30">
            {activeCase.status}
          </span>
        </div>
        <div className="bg-slate-900/50 rounded-lg p-3">
          <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">Next Court Date</p>
          <p className="text-sm font-semibold text-white">{activeCase.nextCourtDate || '—'}</p>
        </div>
        <div className="bg-slate-900/50 rounded-lg p-3">
          <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">Win Probability</p>
          <div className="flex items-center gap-2">
            <span className={`text-sm font-bold ${probColor}`}>{winProb}%</span>
            <div className="flex-1 bg-slate-700 rounded-full h-1.5">
              <div
                className={`h-1.5 rounded-full transition-all ${probBg}`}
                style={{ width: `${Math.min(winProb, 100)}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {activeCase.summary && (
        <div className="bg-slate-900/50 rounded-lg p-4">
          <p className="text-xs text-slate-500 uppercase tracking-wide mb-2">Case Summary</p>
          <p className="text-sm text-slate-300 leading-relaxed">{activeCase.summary}</p>
        </div>
      )}
    </div>
  );
};

// -------------------------------------------------------------------
// WarRoom page
// -------------------------------------------------------------------
const WarRoom: React.FC = () => {
  const { activeCase } = useContext(AppContext);

  return (
    <div className="space-y-8 max-w-7xl">
      {/* Page header */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-red-500/10 border border-red-500/30">
            <Shield size={24} className="text-red-400" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-white font-serif">War Room</h1>
            <p className="text-slate-400 mt-0.5 text-sm">
              {activeCase
                ? <>All agents briefed on <span className="text-gold-400 font-semibold">{activeCase.title}</span></>
                : 'Select a case to activate the war room'}
            </p>
          </div>
        </div>
        <div className="sm:ml-auto flex items-center gap-2 text-xs text-slate-400 bg-slate-800 border border-slate-700 rounded-full px-3 py-1.5">
          <Users size={12} className="text-gold-400" />
          <span>{OPERATIONAL_AGENTS.length} agents deployed</span>
        </div>
      </div>

      {/* Agent grid */}
      <div>
        <h2 className="text-sm font-bold text-slate-400 uppercase tracking-wide mb-4 flex items-center gap-2">
          <TrendingUp size={14} />
          Agent Roster
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {OPERATIONAL_AGENTS.map(agent => (
            <AgentCard key={agent.id} agent={agent} activeCaseId={activeCase?.id ?? null} />
          ))}
        </div>
      </div>

      {/* Case briefing */}
      <div>
        <h2 className="text-sm font-bold text-slate-400 uppercase tracking-wide mb-4 flex items-center gap-2">
          <Shield size={14} />
          Case Briefing
        </h2>
        <CaseBriefingCard />
      </div>
    </div>
  );
};

export default WarRoom;
