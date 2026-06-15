
import React, { useContext, useEffect, useState } from 'react';
import { AppContext } from '../App';
import { Link } from 'react-router-dom';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { Briefcase, Calendar, TrendingUp, Activity, Mic, Plus, Scale, ArrowRight, Users, ClipboardList, BookOpen, ExternalLink, Loader2 } from 'lucide-react';
import { OPERATIONAL_AGENTS } from '../agents/personas';
import { searchCourtListenerCases, CourtCase } from '../services/courtListenerService';

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

const StatCard = ({ icon: Icon, title, value, subtext, color, valueColor, pulse }: any) => (
  <div className="bg-slate-800 border border-slate-700 rounded-xl p-4 sm:p-6 shadow-sm hover:shadow-md transition-shadow">
    <div className="flex items-start justify-between">
      <div>
        <p className="text-slate-400 text-sm font-medium mb-1">{title}</p>
        <h3 className={`text-2xl font-bold ${valueColor ?? 'text-white'} ${pulse ? 'animate-pulse' : ''}`}>{value}</h3>
        {subtext && <p className={`text-xs mt-2 ${color}`}>{subtext}</p>}
      </div>
      <div className="p-3 bg-slate-700/50 rounded-lg">
        <Icon className="text-slate-300" size={24} />
      </div>
    </div>
  </div>
);

const AgentTeamCard = ({ agent }: { agent: typeof OPERATIONAL_AGENTS[0] }) => (
  <Link to={agent.route}
    className={`group flex flex-col items-center gap-1.5 sm:gap-2 p-2.5 sm:p-4 rounded-xl border transition-all hover:scale-105 ${agent.bgClass} ${agent.borderClass}`}>
    <div className="text-2xl sm:text-3xl">{agent.emoji}</div>
    <p className={`text-xs sm:text-sm font-bold text-center ${agent.colorClass}`}>{agent.name}</p>
    <p className="text-xs text-slate-500 text-center leading-tight hidden sm:block">{agent.role}</p>
  </Link>
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
    <div className="bg-slate-800 border border-slate-700 rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-base font-semibold text-white flex items-center gap-2">
          <BookOpen size={16} className="text-gold-400" />
          Relevant Case Law
        </h3>
        <span className="text-xs text-slate-500">via CourtListener</span>
      </div>

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
            <div key={i} className="border border-slate-700 rounded-lg p-3 hover:border-gold-500/40 transition-colors">
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
                {r.court && <span className="text-xs text-slate-400 bg-slate-700/50 px-2 py-0.5 rounded-full">{r.court}</span>}
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

  const hearingColor =
    daysUntil !== null && (daysUntil < 0 || daysUntil === 0)
      ? 'text-red-400'
      : daysUntil !== null && daysUntil <= 7
        ? 'text-red-400'
        : daysUntil !== null && daysUntil <= 30
          ? 'text-amber-400'
          : 'text-gold-500';

  const hearingPulse = daysUntil === 0;

  return (
    <div className="space-y-4 sm:space-y-8">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-white font-serif">Welcome back, Counselor</h1>
        <p className="text-slate-400 mt-1 sm:mt-2 text-sm sm:text-base">Here is the status of your active litigation.</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-6">
        <StatCard
          icon={Briefcase}
          title="Active Cases"
          value={cases.length.toString()}
          subtext={cases.length > 0 ? "Active litigation" : "No cases active"}
          color="text-white"
        />
        <StatCard
          icon={Calendar}
          title="Next Hearing"
          value={hearingValue}
          subtext={hearingSubtext}
          color={hearingColor}
          valueColor={daysUntil !== null && (daysUntil < 0 || daysUntil <= 7) ? 'text-red-400' : daysUntil !== null && daysUntil <= 30 ? 'text-amber-400' : 'text-white'}
          pulse={hearingPulse}
        />
        <StatCard
          icon={TrendingUp}
          title="Win Probability"
          value={activeCase ? `${activeCase.winProbability}%` : "-"}
          subtext={activeCase ? "Based on predictive analytics" : "Select a case"}
          color={activeCase && activeCase.winProbability > 50 ? "text-green-400" : "text-slate-400"}
        />
        <StatCard
          icon={Activity}
          title="Trial Readiness"
          value={cases.length > 0 ? "In Progress" : "-"}
          subtext="AI Analysis Status"
          color="text-blue-400"
        />
      </div>

      {/* Maya CTA — only when no active case */}
      {!activeCase && (
        <div className="bg-violet-500/10 border border-violet-500/30 rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-violet-500/20 border border-violet-500/30 flex items-center justify-center text-xl shrink-0">
            ⚖️
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-violet-300 text-sm">Maya · Case Intake Specialist</p>
            <p className="text-slate-300 text-sm mt-0.5">Ready to open your first case? Maya will guide you through intake in under 2 minutes.</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Link
              to="/start"
              className="btn-gold inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition-all hover:scale-105"
            >
              Start Intake <ArrowRight size={13} />
            </Link>
            <Link
              to="/app/cases"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold border border-slate-600 text-slate-300 hover:bg-slate-700 transition-colors"
            >
              Add Case Manually
            </Link>
          </div>
        </div>
      )}

      {/* Meet the Team */}
      <div className="bg-slate-800/50 border border-slate-700 rounded-2xl p-4 sm:p-6">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <Users size={18} className="text-gold-400" />
              Meet Your AI Team
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">8 specialized agents ready to work your cases</p>
          </div>
          <Link to="/app/legal-team"
            className="flex items-center gap-1.5 text-xs text-gold-400 hover:text-gold-300 transition-colors font-semibold">
            <Scale size={14} />
            + 12 AI Lawyers
            <ArrowRight size={13} />
          </Link>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-8 gap-2 sm:gap-3">
          {OPERATIONAL_AGENTS.map(agent => (
            <AgentTeamCard key={agent.id} agent={agent} />
          ))}
        </div>
      </div>

      {/* Main Content Split */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-8">

        {/* Left: Activity Chart / Empty State */}
        <div className="lg:col-span-2 bg-slate-800 border border-slate-700 rounded-xl p-6 flex flex-col">
          <h3 className="text-lg font-semibold text-white mb-6">Case Load Distribution</h3>
          <div className="h-64 w-full flex-1">
            {chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <XAxis
                    dataKey="name"
                    stroke="#64748b"
                    fontSize={12}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    allowDecimals={false}
                    stroke="#64748b"
                    fontSize={12}
                    tickLine={false}
                    axisLine={false}
                  />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#1e293b', borderColor: '#334155', color: '#f1f5f9' }}
                    itemStyle={{ color: '#f1f5f9' }}
                    cursor={{ fill: '#334155', opacity: 0.4 }}
                  />
                  <Bar dataKey="count" fill="#d4af37" radius={[4, 4, 0, 0]} barSize={40} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-slate-500 border-2 border-dashed border-slate-700 rounded-lg">
                <Briefcase size={32} className="mb-3 opacity-50" />
                <p>No case data available.</p>
                <Link to="/app/cases" className="text-gold-500 hover:underline text-sm mt-2">Create your first case</Link>
              </div>
            )}
          </div>
        </div>

        {/* Right: Quick Actions */}
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-6">
          <h3 className="text-lg font-semibold text-white mb-4">Quick Actions</h3>
          <div className="space-y-3">
            <Link to="/app/cases" className="w-full flex items-center justify-between p-4 bg-slate-700/30 hover:bg-slate-700 rounded-lg border border-slate-600 transition-colors text-left group">
              <span className="text-sm font-medium group-hover:text-white text-slate-200">Add New Case</span>
              <Plus size={18} className="text-green-400"/>
            </Link>
            <Link to="/app/legal-team" className="w-full flex items-center justify-between p-4 bg-gold-500/10 hover:bg-gold-500/20 rounded-lg border border-gold-500/30 transition-colors text-left group">
              <span className="text-sm font-medium text-gold-300 group-hover:text-gold-200">Consult AI Lawyers</span>
              <Scale size={18} className="text-gold-400"/>
            </Link>
            <Link to="/app/practice" className="w-full flex items-center justify-between p-4 bg-slate-700/30 hover:bg-slate-700 rounded-lg border border-slate-600 transition-colors text-left group">
              <span className="text-sm font-medium group-hover:text-white text-slate-200">Trial Simulator</span>
              <Mic size={18} className="text-gold-500"/>
            </Link>
            <Link to="/app/jury-sim" className="w-full flex items-center justify-between p-4 bg-slate-700/30 hover:bg-slate-700 rounded-lg border border-slate-600 transition-colors text-left group">
              <span className="text-sm font-medium group-hover:text-white text-slate-200">Jury Simulator</span>
              <Users size={18} className="text-cyan-400"/>
            </Link>
            <Link to="/app/strategy" className="w-full flex items-center justify-between p-4 bg-slate-700/30 hover:bg-slate-700 rounded-lg border border-slate-600 transition-colors text-left group">
              <span className="text-sm font-medium group-hover:text-white text-slate-200">Strategy & Tactics</span>
              <TrendingUp size={18} className="text-purple-400"/>
            </Link>
          </div>

          <div className="mt-6 pt-6 border-t border-slate-700">
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Active File</h4>
            {activeCase ? (
               <div className="bg-slate-900 p-4 rounded-lg border border-slate-700">
                  <p className="font-semibold text-white truncate">{activeCase.title}</p>
                  <p className="text-xs text-slate-400 mt-1">Opponent: {activeCase.opposingCounsel}</p>
               </div>
            ) : (
               <Link to="/app/cases" className="block bg-slate-900/50 p-4 rounded-lg border border-slate-700 border-dashed hover:border-gold-500/50 text-center transition-colors">
                  <p className="text-sm text-slate-400 flex items-center justify-center gap-2">
                    <Briefcase size={14} />
                    Select Case
                  </p>
               </Link>
            )}
          </div>
        </div>
      </div>

      {/* Relevant Case Law */}
      <RelevantCases activeCase={activeCase} />

      {/* Leads Pipeline */}
      {leads.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <ClipboardList size={18} className="text-violet-400" />
              Incoming Leads
              <span className="ml-1 inline-flex items-center justify-center w-5 h-5 rounded-full bg-violet-500/20 border border-violet-500/40 text-violet-400 text-xs font-bold">
                {leads.length}
              </span>
            </h2>
            <Link to="/start" className="text-xs text-violet-400 hover:text-violet-300 transition-colors font-semibold">
              View All <ArrowRight size={12} className="inline" />
            </Link>
          </div>
          <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1">
            {leads.map(lead => (
              <div
                key={lead.id}
                className="shrink-0 w-72 bg-slate-800 border border-slate-700 rounded-xl p-4 space-y-2.5 hover:border-violet-500/40 transition-colors"
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
