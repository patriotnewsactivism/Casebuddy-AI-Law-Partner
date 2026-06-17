
import React, { useContext, useEffect, useState } from 'react';
import { AppContext } from '../App';
import { Link } from 'react-router-dom';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { Briefcase, Calendar, TrendingUp, Activity, Mic, Plus, Scale, ArrowRight, Users, ClipboardList, BookOpen, ExternalLink, Loader2, PhoneCall, Network, Rocket } from 'lucide-react';
import { OPERATIONAL_AGENTS } from '../agents/personas';
import { searchCourtListenerCases, CourtCase } from '../services/courtListenerService';
import IntakeWidget from './IntakeWidget';

interface Lead {
  id: string;
  name: string;
  email: string;
  phone: string;
  matterType: string;
  description: string;
  urgency: string;
  courtDate: string;
  aiAssessment: { greeting: string; summary: string; nextSteps: string[]; urgencyAssessment: string };
  submittedAt: number;
}

function relativeTime(ts: number): string {
  const diffMs = Date.now() - ts;
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHrs = Math.floor(diffMins / 60);
  if (diffHrs < 24) return `${diffHrs}h ago`;
  const diffDays = Math.floor(diffHrs / 24);
  return `${diffDays}d ago`;
}

const StatCard = ({ icon: Icon, title, value, subtext, subColor, valueColor, pulse, tile, glow }: any) => (
  <div className="relative overflow-hidden rounded-2xl border border-slate-800 bg-gradient-to-br from-slate-900 to-slate-950/40 p-4 sm:p-5 hover:border-slate-700 transition-colors">
    <div className={`absolute -top-10 -right-10 w-28 h-28 rounded-full blur-3xl opacity-[0.15] ${glow}`} />
    <div className="relative">
      <div className="flex items-center gap-2.5">
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${tile}`}>
          <Icon size={17} />
        </div>
        <p className="text-slate-400 text-[11px] font-bold uppercase tracking-wider">{title}</p>
      </div>
      <h3 className={`text-2xl sm:text-3xl font-bold mt-3 tracking-tight ${valueColor ?? 'text-white'} ${pulse ? 'animate-pulse' : ''}`}>{value}</h3>
      {subtext && <p className={`text-xs mt-1 ${subColor ?? 'text-slate-500'}`}>{subtext}</p>}
    </div>
  </div>
);

const AgentTeamCard: React.FC<{ agent: typeof OPERATIONAL_AGENTS[0] }> = ({ agent }) => (
  <Link to={agent.route}
    className={`group relative flex flex-col items-center gap-1.5 sm:gap-2 p-2.5 sm:p-4 rounded-xl border transition-all hover:scale-105 ${agent.bgClass} ${agent.borderClass}`}>
    {/* Always-on availability dot */}
    <span className="absolute top-2 right-2 flex h-2 w-2">
      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-60" />
      <span className="relative inline-flex rounded-full h-2 w-2 bg-green-400" />
    </span>
    <div className="text-2xl sm:text-3xl">{agent.emoji}</div>
    <p className={`text-xs sm:text-sm font-bold text-center ${agent.colorClass}`}>{agent.name}</p>
    <p className="text-xs text-slate-500 text-center leading-tight hidden sm:block">{agent.role}</p>
  </Link>
);

const SectionHeader = ({ icon: Icon, title, subtitle, accent, action }: any) => (
  <div className="flex items-center justify-between mb-4">
    <div className="flex items-center gap-2.5">
      <Icon size={18} className={accent ?? 'text-gold-400'} />
      <div>
        <h2 className="text-base sm:text-lg font-bold text-white leading-tight">{title}</h2>
        {subtitle && <p className="text-xs text-slate-500">{subtitle}</p>}
      </div>
    </div>
    {action}
  </div>
);

const RelevantCases = ({ activeCase }: { activeCase: any }) => {
  const [results, setResults] = useState<CourtCase[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  useEffect(() => {
    if (!activeCase) { setResults([]); setSearched(false); return; }
    const query = [activeCase.title, activeCase.summary].filter(Boolean).join(' ').slice(0, 120);
    setLoading(true);
    setSearched(false);
    searchCourtListenerCases(query)
      .then(r => { setResults(r); setSearched(true); })
      .catch(() => { setResults([]); setSearched(true); })
      .finally(() => setLoading(false));
  }, [activeCase?.id]);

  if (!activeCase) return null;

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
      <SectionHeader
        icon={BookOpen}
        title="Relevant Case Law"
        action={<span className="text-xs text-slate-500">via CourtListener</span>}
      />

      {loading && (
        <div className="flex items-center gap-2 text-slate-400 text-sm py-4 justify-center">
          <Loader2 size={16} className="animate-spin" />
          Searching precedents...
        </div>
      )}

      {!loading && searched && results.length === 0 && (
        <p className="text-slate-500 text-sm text-center py-4">No matching cases found.</p>
      )}

      {!loading && results.length > 0 && (
        <div className="space-y-3">
          {results.map((r, i) => (
            <div key={i} className="border border-slate-800 rounded-xl p-3 hover:border-gold-500/40 transition-colors">
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-medium text-slate-100 leading-snug line-clamp-2">{r.caseName}</p>
                {r.absoluteUrl && (
                  <a href={r.absoluteUrl} target="_blank" rel="noopener noreferrer"
                    className="shrink-0 text-gold-400 hover:text-gold-300 transition-colors mt-0.5">
                    <ExternalLink size={13} />
                  </a>
                )}
              </div>
              <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                {r.court && <span className="text-xs text-slate-400 bg-slate-800 px-2 py-0.5 rounded-full">{r.court}</span>}
                {r.dateFiled && <span className="text-xs text-slate-500">{r.dateFiled.slice(0, 4)}</span>}
              </div>
              {r.snippet && (
                <p className="text-xs text-slate-500 mt-1.5 line-clamp-2"
                  dangerouslySetInnerHTML={{ __html: r.snippet }} />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const greeting = () => {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
};

const Dashboard = () => {
  const { cases, activeCase } = useContext(AppContext);
  const [leads, setLeads] = useState<Lead[]>([]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem('casebuddy_leads');
      if (raw) setLeads(JSON.parse(raw));
    } catch {
      // ignore parse errors
    }
  }, []);

  const statusCounts = cases.reduce((acc: any, curr) => {
    acc[curr.status] = (acc[curr.status] || 0) + 1;
    return acc;
  }, {});

  const chartData = Object.keys(statusCounts).map(status => ({
    name: status,
    count: statusCounts[status]
  }));

  const daysUntil = activeCase?.nextCourtDate && activeCase.nextCourtDate !== 'TBD'
    ? Math.ceil((new Date(activeCase.nextCourtDate).getTime() - Date.now()) / 86400000)
    : null;

  const hearingValue =
    daysUntil === null
      ? (activeCase ? activeCase.nextCourtDate : 'TBD')
      : daysUntil < 0
        ? 'OVERDUE'
        : daysUntil === 0
          ? 'TODAY'
          : `${daysUntil}d`;

  const hearingSubtext =
    daysUntil !== null && daysUntil <= 7 && daysUntil >= 0
      ? '⚠ Urgent'
      : activeCase
        ? `For: ${activeCase.title}`
        : 'No active case';

  const hearingSubColor =
    daysUntil !== null && (daysUntil < 0 || daysUntil === 0)
      ? 'text-red-400'
      : daysUntil !== null && daysUntil <= 7
        ? 'text-red-400'
        : daysUntil !== null && daysUntil <= 30
          ? 'text-amber-400'
          : 'text-slate-500';

  const hearingPulse = daysUntil === 0;
  const today = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });

  return (
    <div className="space-y-5 sm:space-y-7">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-white font-serif">{greeting()}, Counselor</h1>
          <p className="text-slate-400 mt-1 text-sm flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" /> Firm online
            </span>
            <span className="text-slate-600">·</span>
            {today}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link to="/app/firm-command" className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-gold-500 hover:bg-gold-400 text-slate-950 text-sm font-bold transition-colors">
            <Rocket size={15} /> Deploy the Firm
          </Link>
          <Link to="/app/firm" className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-700 text-slate-300 hover:bg-slate-800 text-sm font-semibold transition-colors">
            <PhoneCall size={15} /> Call
          </Link>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <StatCard
          icon={Briefcase}
          title="Active Cases"
          value={cases.length.toString()}
          subtext={cases.length > 0 ? 'In active litigation' : 'No cases yet'}
          tile="bg-blue-500/15 text-blue-400"
          glow="bg-blue-500"
        />
        <StatCard
          icon={Calendar}
          title="Next Hearing"
          value={hearingValue}
          subtext={hearingSubtext}
          subColor={hearingSubColor}
          valueColor={daysUntil !== null && (daysUntil < 0 || daysUntil <= 7) ? 'text-red-400' : daysUntil !== null && daysUntil <= 30 ? 'text-amber-400' : 'text-white'}
          pulse={hearingPulse}
          tile="bg-gold-500/15 text-gold-400"
          glow="bg-gold-500"
        />
        <StatCard
          icon={TrendingUp}
          title="Win Probability"
          value={activeCase ? `${activeCase.winProbability}%` : '—'}
          subtext={activeCase ? 'Predictive analytics' : 'Select a case'}
          subColor={activeCase && activeCase.winProbability > 50 ? 'text-green-400' : 'text-slate-500'}
          valueColor={activeCase && activeCase.winProbability > 50 ? 'text-green-400' : 'text-white'}
          tile="bg-green-500/15 text-green-400"
          glow="bg-green-500"
        />
        <StatCard
          icon={Activity}
          title="Trial Readiness"
          value={cases.length > 0 ? 'In Progress' : '—'}
          subtext="AI analysis status"
          tile="bg-violet-500/15 text-violet-400"
          glow="bg-violet-500"
        />
      </div>

      {/* Voice CTA + Intake pipeline */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-5">
        <Link
          to="/app/firm"
          className="group relative overflow-hidden rounded-2xl border border-gold-500/30 bg-gradient-to-br from-gold-500/10 via-amber-500/5 to-transparent p-5 hover:border-gold-500/60 transition-all flex flex-col"
        >
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-gold-500/20 border border-gold-500/40 flex items-center justify-center text-gold-400 shrink-0 group-hover:scale-105 transition-transform">
              <PhoneCall size={22} className="animate-pulse" />
            </div>
            <div>
              <p className="font-bold text-white">Talk to your firm out loud</p>
              <p className="text-slate-400 text-xs mt-0.5">8 team members, each with their own voice.</p>
            </div>
          </div>
          <p className="text-sm text-slate-400 mt-4 leading-relaxed flex-1">
            They greet you, ask the questions, and walk you through it — like calling a real office.
          </p>
          <span className="mt-3 inline-flex items-center gap-1.5 text-sm font-bold text-gold-400">
            Open the line <ArrowRight size={14} className="group-hover:translate-x-0.5 transition-transform" />
          </span>
        </Link>

        <IntakeWidget />
      </div>

      {/* Meet the Team */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 sm:p-6">
        <SectionHeader
          icon={Users}
          title="Your AI Team"
          subtitle="8 specialized agents ready to work your cases"
          action={
            <Link to="/app/legal-team"
              className="flex items-center gap-1.5 text-xs text-gold-400 hover:text-gold-300 transition-colors font-semibold">
              <Scale size={14} /> + 12 AI Lawyers <ArrowRight size={13} />
            </Link>
          }
        />
        <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-8 gap-2 sm:gap-3">
          {OPERATIONAL_AGENTS.map(agent => (
            <AgentTeamCard key={agent.id} agent={agent} />
          ))}
        </div>
      </div>

      {/* Main Content Split */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-5">
        {/* Left: Case Load chart */}
        <div className="lg:col-span-2 rounded-2xl border border-slate-800 bg-slate-900/60 p-5 sm:p-6 flex flex-col">
          <SectionHeader icon={Activity} title="Case Load Distribution" accent="text-blue-400" />
          <div className="h-64 w-full flex-1">
            {chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <XAxis dataKey="name" stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis allowDecimals={false} stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#1e293b', borderColor: '#334155', color: '#f1f5f9', borderRadius: '0.75rem' }}
                    itemStyle={{ color: '#f1f5f9' }}
                    cursor={{ fill: '#334155', opacity: 0.4 }}
                  />
                  <Bar dataKey="count" fill="#d4af37" radius={[6, 6, 0, 0]} barSize={40} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-slate-500 border-2 border-dashed border-slate-800 rounded-xl">
                <Briefcase size={32} className="mb-3 opacity-50" />
                <p>No case data yet.</p>
                <Link to="/app/intake-inbox" className="text-gold-500 hover:underline text-sm mt-2">Open your first case from intake</Link>
              </div>
            )}
          </div>
        </div>

        {/* Right: Quick Actions */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 sm:p-6">
          <h3 className="text-sm font-bold text-slate-300 uppercase tracking-wide mb-4">Quick Actions</h3>
          <div className="space-y-2.5">
            {[
              { to: '/app/firm-command', label: 'Deploy the Firm', icon: Network, cls: 'bg-gold-500/10 border-gold-500/30 text-gold-300 hover:bg-gold-500/20', iconCls: 'text-gold-400' },
              { to: '/app/intake-inbox', label: 'Intake Inbox', icon: ClipboardList, cls: 'bg-violet-500/10 border-violet-500/30 text-violet-200 hover:bg-violet-500/20', iconCls: 'text-violet-400' },
              { to: '/app/legal-team', label: 'Consult AI Lawyers', icon: Scale, cls: 'bg-slate-800/40 border-slate-700 text-slate-200 hover:bg-slate-800', iconCls: 'text-gold-400' },
              { to: '/app/practice', label: 'Trial Simulator', icon: Mic, cls: 'bg-slate-800/40 border-slate-700 text-slate-200 hover:bg-slate-800', iconCls: 'text-gold-500' },
              { to: '/app/strategy', label: 'Strategy & Tactics', icon: TrendingUp, cls: 'bg-slate-800/40 border-slate-700 text-slate-200 hover:bg-slate-800', iconCls: 'text-purple-400' },
            ].map(a => (
              <Link key={a.to} to={a.to} className={`w-full flex items-center justify-between p-3.5 rounded-xl border transition-colors text-left group ${a.cls}`}>
                <span className="text-sm font-medium">{a.label}</span>
                <a.icon size={17} className={a.iconCls} />
              </Link>
            ))}
          </div>

          <div className="mt-5 pt-5 border-t border-slate-800">
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Active File</h4>
            {activeCase ? (
              <Link to="/app/cases" className="block bg-slate-950/60 p-4 rounded-xl border border-slate-800 hover:border-gold-500/40 transition-colors">
                <p className="font-semibold text-white truncate">{activeCase.title}</p>
                <p className="text-xs text-slate-400 mt-1">Opponent: {activeCase.opposingCounsel || '—'}</p>
              </Link>
            ) : (
              <Link to="/app/intake-inbox" className="block bg-slate-950/40 p-4 rounded-xl border border-slate-800 border-dashed hover:border-gold-500/50 text-center transition-colors">
                <p className="text-sm text-slate-400 flex items-center justify-center gap-2">
                  <Briefcase size={14} /> No active case — open one from intake
                </p>
              </Link>
            )}
          </div>
        </div>
      </div>

      {/* Relevant Case Law */}
      <RelevantCases activeCase={activeCase} />

      {/* Legacy Leads Pipeline */}
      {leads.length > 0 && (
        <div>
          <SectionHeader
            icon={ClipboardList}
            title="Incoming Leads"
            accent="text-violet-400"
            action={
              <Link to="/start" className="text-xs text-violet-400 hover:text-violet-300 transition-colors font-semibold">
                View All <ArrowRight size={12} className="inline" />
              </Link>
            }
          />
          <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1">
            {leads.map(lead => (
              <div
                key={lead.id}
                className="shrink-0 w-72 rounded-2xl border border-slate-800 bg-slate-900/60 p-4 space-y-2.5 hover:border-violet-500/40 transition-colors"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="font-semibold text-white text-sm truncate">{lead.name}</p>
                  <span className="shrink-0 text-xs px-2 py-0.5 rounded-full bg-violet-500/20 border border-violet-500/30 text-violet-300 font-medium">
                    {lead.matterType}
                  </span>
                </div>
                <p className="text-xs text-slate-400 leading-relaxed line-clamp-2">
                  {lead.aiAssessment?.urgencyAssessment ?? lead.description}
                </p>
                <div className="flex items-center justify-between pt-1">
                  <span className="text-xs text-slate-500">{relativeTime(lead.submittedAt)}</span>
                  <Link
                    to="/app/cases"
                    onClick={() => sessionStorage.setItem('casebuddy_open_lead', lead.id)}
                    className="text-xs text-violet-400 hover:text-violet-300 font-semibold transition-colors flex items-center gap-1"
                  >
                    Open as Case <ArrowRight size={11} />
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;
