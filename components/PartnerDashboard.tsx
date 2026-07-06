import React, { useContext, useEffect, useState, useMemo } from 'react';
import { AppContext } from '../App';
import { Link } from 'react-router-dom';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import {
  Briefcase, Calendar, TrendingUp, Activity, Mic, Plus, Scale, ArrowRight, Users,
  ClipboardList, BookOpen, ExternalLink, Loader2, PhoneCall, Network, Rocket,
  BrainCircuit, Mail, Inbox, FileText, ShieldCheck, Clock, Bot, Zap, Target,
  BarChart3, AlertTriangle, CheckCircle, ChevronRight
} from 'lucide-react';
import { OPERATIONAL_AGENTS } from '../agents/personas';
import { searchCourtListenerCases, CourtCase } from '../services/courtListenerService';
import SimilarCases from './SimilarCases';
import WorkflowVisualizer from './WorkflowVisualizer';

/* ─── Types ─────────────────────────────────────────────────────────────── */

interface Lead {
  id: string;
  name: string;
  email: string;
  phone: string;
  matterType: string;
  description: string;
  urgency: string;
  courtDate: string;
  aiAssessment: {
    greeting?: string;
    summary?: string;
    nextSteps?: string[];
    urgencyAssessment?: string;
    urgency?: string;
    score?: number;
    recommendation?: string;
  };
  submittedAt: number;
}

function relativeTime(ts: number): string {
  const diffMs = Date.now() - ts;
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHrs = Math.floor(diffMins / 60);
  if (diffHrs < 24) return `${diffHrs}h ago`;
  return `${Math.floor(diffHrs / 24)}d ago`;
}

/* ─── Sub-components ─────────────────────────────────────────────────────── */

const StatCard = ({ icon: Icon, title, value, subtext, subColor, valueColor, pulse, tile, glow }: any) => (
  <div className="relative overflow-hidden rounded-2xl border border-slate-800 bg-gradient-to-br from-slate-900 to-slate-950/40 p-4 sm:p-5 hover:border-slate-700 transition-colors">
    <div className={`absolute -top-10 -right-10 w-28 h-28 rounded-full blur-3xl opacity-[0.15] ${glow}`} />
    <div className="relative">
      <div className="flex items-center gap-2.5">
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${tile}`}><Icon size={17} /></div>
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

const greeting = () => {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
};

const urgencyBadge = (u?: string) => {
  if (!u) return 'bg-slate-700 text-slate-300';
  if (u === 'immediately' || u === 'high' || u === 'critical') return 'bg-red-500/20 text-red-300 border border-red-500/30';
  if (u === 'days' || u === 'medium') return 'bg-amber-500/20 text-amber-300 border border-amber-500/30';
  return 'bg-slate-700/80 text-slate-400';
};

const recBadge = (r?: string) => {
  if (r === 'proceed') return 'text-green-400';
  if (r === 'schedule-consult') return 'text-blue-400';
  if (r === 'refer-out') return 'text-amber-400';
  if (r === 'decline') return 'text-red-400';
  return 'text-slate-400';
};

/* ─── Relevant Case Law ──────────────────────────────────────────────────── */

const RelevantCases = ({ activeCase }: { activeCase: any }) => {
  const [results, setResults] = useState<CourtCase[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  useEffect(() => {
    if (!activeCase) { setResults([]); setSearched(false); return; }
    const query = (activeCase.title || '').slice(0, 80);
    setLoading(true); setSearched(false);
    searchCourtListenerCases(query)
      .then(r => { setResults(r); setSearched(true); })
      .catch(() => { setResults([]); setSearched(true); })
      .finally(() => setLoading(false));
  }, [activeCase?.id]);
  if (!activeCase) return null;
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
      <SectionHeader icon={BookOpen} title="Relevant Case Law" action={<span className="text-xs text-slate-500">via CourtListener</span>} />
      {loading && <div className="flex items-center gap-2 text-slate-400 text-sm py-4 justify-center"><Loader2 size={16} className="animate-spin" />Searching precedents…</div>}
      {!loading && searched && results.length === 0 && <p className="text-slate-500 text-sm text-center py-4">No matching cases found.</p>}
      {!loading && results.length > 0 && (
        <div className="space-y-3">
          {results.map((r, i) => (
            <div key={i} className="border border-slate-800 rounded-xl p-3 hover:border-gold-500/40 transition-colors">
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-medium text-slate-100 leading-snug line-clamp-2">{r.caseName}</p>
                {r.absoluteUrl && <a href={r.absoluteUrl} target="_blank" rel="noopener noreferrer" className="shrink-0 text-gold-400 hover:text-gold-300 mt-0.5"><ExternalLink size={13} /></a>}
              </div>
              <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                {r.court && <span className="text-xs text-slate-400 bg-slate-800 px-2 py-0.5 rounded-full">{r.court}</span>}
                {r.dateFiled && <span className="text-xs text-slate-500">{r.dateFiled.slice(0, 4)}</span>}
              </div>
              {r.snippet && <p className="text-xs text-slate-500 mt-1.5 line-clamp-2" dangerouslySetInnerHTML={{ __html: r.snippet }} />}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

/* ─── Main ───────────────────────────────────────────────────────────────── */

const PartnerDashboard = () => {
  const { cases, activeCase, setActiveCase } = useContext(AppContext);
  const [leads, setLeads] = useState<Lead[]>([]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem('casebuddy_leads');
      if (raw) setLeads(JSON.parse(raw));
    } catch { /* ignore */ }
  }, []);

  const { statusCounts, chartData } = useMemo(() => {
    const counts = cases.reduce((acc: Record<string, number>, curr) => {
      acc[curr.status] = (acc[curr.status] || 0) + 1;
      return acc;
    }, {});
    const data = Object.keys(counts).map(status => ({ name: status, count: counts[status] }));
    return { statusCounts: counts, chartData: data };
  }, [cases]);

  const daysUntil = activeCase?.nextCourtDate && activeCase.nextCourtDate !== 'TBD'
    ? Math.ceil((new Date(activeCase.nextCourtDate).getTime() - Date.now()) / 86400000)
    : null;

  const hearingValue = daysUntil === null
    ? (activeCase ? activeCase.nextCourtDate : 'TBD')
    : daysUntil < 0 ? 'OVERDUE' : daysUntil === 0 ? 'TODAY' : `${daysUntil}d`;

  const hearingSubtext = daysUntil !== null && daysUntil <= 7 && daysUntil >= 0
    ? '⚠ Urgent' : activeCase ? `For: ${activeCase.title}` : 'No active case';
  const hearingSubColor = daysUntil !== null && (daysUntil < 0 || daysUntil === 0)
    ? 'text-red-400' : daysUntil !== null && daysUntil <= 7 ? 'text-red-400'
    : daysUntil !== null && daysUntil <= 30 ? 'text-amber-400' : 'text-slate-500';
  const hearingPulse = daysUntil === 0;
  const today = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });

  const hotLeads = leads.filter(l => l.aiAssessment?.urgency === 'immediately' || l.aiAssessment?.urgency === 'critical' || l.urgency === 'immediately');

  return (
    <div className="space-y-5 sm:space-y-7">

      {/* ── Header ─────────────────────────────────────────────────────── */}
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

      {/* ── Quick Actions ───────────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-2 -mt-1">
        {([
          { label: 'New Case',      icon: <Plus size={13} />,          to: '/app/cases' },
          { label: 'Intake Client', icon: <Bot size={13} />,           to: '/app/intake' },
          { label: 'Add Deadline',  icon: <Calendar size={13} />,      to: '/app/deadlines' },
          { label: 'Draft Doc',     icon: <FileText size={13} />,      to: '/app/docs' },
          { label: 'AI Strategy',   icon: <BrainCircuit size={13} />,  to: '/app/strategy' },
          { label: 'Mail Room',     icon: <Mail size={13} />,          to: '/app/mail-room' },
          { label: 'Analytics',     icon: <BarChart3 size={13} />,     to: '/app/analytics' },
        ] as { label: string; icon: React.ReactNode; to: string }[]).map(qa => (
          <Link key={qa.to} to={qa.to}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800/80 hover:bg-slate-700 border border-slate-700/60 hover:border-slate-600 text-slate-300 text-xs font-medium transition-all">
            {qa.icon}{qa.label}
          </Link>
        ))}
      </div>

      {/* ── Stat Cards ──────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <StatCard icon={Briefcase} title="Active Cases" value={cases.length.toString()} subtext={cases.length > 0 ? 'In active litigation' : 'No cases yet'} tile="bg-blue-500/15 text-blue-400" glow="bg-blue-500" />
        <StatCard icon={Calendar} title="Next Hearing" value={hearingValue} subtext={hearingSubtext} subColor={hearingSubColor} valueColor={daysUntil !== null && (daysUntil < 0 || daysUntil <= 7) ? 'text-red-400' : daysUntil !== null && daysUntil <= 30 ? 'text-amber-400' : 'text-white'} pulse={hearingPulse} tile="bg-gold-500/15 text-gold-400" glow="bg-gold-500" />
        <StatCard icon={TrendingUp} title="Win Probability" value={activeCase ? `${activeCase.winProbability}%` : '—'} subtext={activeCase ? 'Predictive analytics' : 'Select a case'} subColor={activeCase && activeCase.winProbability > 50 ? 'text-green-400' : 'text-slate-500'} valueColor={activeCase && activeCase.winProbability > 50 ? 'text-green-400' : 'text-white'} tile="bg-green-500/15 text-green-400" glow="bg-green-500" />
        <StatCard icon={Inbox} title="New Leads" value={leads.length > 0 ? leads.length.toString() : '0'} subtext={hotLeads.length > 0 ? `${hotLeads.length} urgent` : 'No urgent leads'} subColor={hotLeads.length > 0 ? 'text-red-400' : 'text-slate-500'} tile="bg-violet-500/15 text-violet-400" glow="bg-violet-500" />
      </div>

      {/* ── Voice CTA + Maya Intake CTA ─────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-5">
        <Link to="/app/firm" className="group relative overflow-hidden rounded-2xl border border-gold-500/30 bg-gradient-to-br from-gold-500/10 via-amber-500/5 to-transparent p-5 hover:border-gold-500/60 transition-all flex flex-col">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-gold-500/20 border border-gold-500/40 flex items-center justify-center text-gold-400 shrink-0 group-hover:scale-105 transition-transform">
              <PhoneCall size={22} className="animate-pulse" />
            </div>
            <div>
              <p className="font-bold text-white">Talk to your firm out loud</p>
              <p className="text-slate-400 text-xs mt-0.5">8 AI team members, each with their own voice</p>
            </div>
          </div>
          <p className="text-sm text-slate-400 mt-4 leading-relaxed flex-1">Call in, describe your case, and let the team brief you — like a real office.</p>
          <span className="mt-3 inline-flex items-center gap-1.5 text-sm font-bold text-gold-400">Open the line <ArrowRight size={14} className="group-hover:translate-x-0.5 transition-transform" /></span>
        </Link>

        <Link to="/app/intake" className="group relative overflow-hidden rounded-2xl border border-violet-500/30 bg-gradient-to-br from-violet-500/10 via-purple-500/5 to-transparent p-5 hover:border-violet-500/60 transition-all flex flex-col">
          <div className="absolute -top-8 -right-8 w-32 h-32 rounded-full bg-violet-500/10 blur-3xl group-hover:bg-violet-500/20 transition-all" />
          <div className="relative flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-violet-500/20 border border-violet-500/40 flex items-center justify-center text-violet-400 shrink-0 group-hover:scale-105 transition-transform">
              <Bot size={22} />
            </div>
            <div>
              <p className="font-bold text-white">Start a client intake with Maya</p>
              <p className="text-slate-400 text-xs mt-0.5">Conversational AI · One question at a time</p>
            </div>
          </div>
          <p className="text-sm text-slate-400 mt-4 leading-relaxed flex-1 relative">Maya conducts a natural intake interview — gathering facts, running conflict checks, and scoring the case automatically.</p>
          <span className="mt-3 inline-flex items-center gap-1.5 text-sm font-bold text-violet-400 relative">Start intake <ArrowRight size={14} className="group-hover:translate-x-0.5 transition-transform" /></span>
        </Link>
      </div>

      {/* ── AI Team ─────────────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 sm:p-6">
        <SectionHeader icon={Users} title="Your AI Team" subtitle="8 specialized agents ready to work your cases"
          action={<Link to="/app/legal-team" className="flex items-center gap-1.5 text-xs text-gold-400 hover:text-gold-300 font-semibold"><Scale size={14} /> + 12 AI Lawyers <ArrowRight size={13} /></Link>}
        />
        <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-8 gap-2 sm:gap-3">
          {OPERATIONAL_AGENTS.map(agent => <AgentTeamCard key={agent.id} agent={agent} />)}
        </div>
      </div>

      {/* ── Main Content Grid ────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-5">

        {/* Case Load Chart */}
        <div className="lg:col-span-2 rounded-2xl border border-slate-800 bg-slate-900/60 p-5 sm:p-6 flex flex-col">
          <SectionHeader icon={Activity} title="Case Load Distribution" accent="text-blue-400" />
          <div className="flex-1 min-h-[220px]">
            {chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={230} minWidth={0}>
                <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <XAxis dataKey="name" stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis allowDecimals={false} stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} />
                  <Tooltip contentStyle={{ backgroundColor: '#1e293b', borderColor: '#334155', color: '#f1f5f9', borderRadius: '0.75rem' }} cursor={{ fill: '#334155', opacity: 0.4 }} />
                  <Bar dataKey="count" fill="#d4af37" radius={[6, 6, 0, 0]} barSize={40} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-slate-500 border-2 border-dashed border-slate-800 rounded-xl py-10">
                <Briefcase size={32} className="mb-3 opacity-50" />
                <p className="text-sm">No case data yet.</p>
                <Link to="/app/intake" className="text-violet-400 hover:underline text-sm mt-2">Start an intake to create your first case</Link>
              </div>
            )}
          </div>
        </div>

        {/* Right: Smart Action Panel */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 sm:p-6 flex flex-col gap-5">
          <div>
            <h3 className="text-sm font-bold text-slate-300 uppercase tracking-wide mb-3">Quick Actions</h3>
            <div className="space-y-2">
              {[
                { to: '/app/firm-command', label: 'Deploy the Firm', icon: Network,       cls: 'bg-gold-500/10 border-gold-500/30 text-gold-300 hover:bg-gold-500/20', iconCls: 'text-gold-400' },
                { to: '/app/intake',       label: 'New Intake (Maya)', icon: Bot,         cls: 'bg-violet-500/10 border-violet-500/30 text-violet-200 hover:bg-violet-500/20', iconCls: 'text-violet-400' },
                { to: '/app/intake-inbox', label: 'Intake Inbox',      icon: Inbox,       cls: 'bg-slate-800/60 border-slate-700 text-slate-200 hover:bg-slate-800', iconCls: 'text-violet-300' },
                { to: '/app/legal-team',   label: 'AI Lawyers',        icon: Scale,       cls: 'bg-slate-800/60 border-slate-700 text-slate-200 hover:bg-slate-800', iconCls: 'text-gold-400' },
                { to: '/app/practice',     label: 'Trial Simulator',   icon: Mic,         cls: 'bg-slate-800/60 border-slate-700 text-slate-200 hover:bg-slate-800', iconCls: 'text-gold-500' },
                { to: '/app/strategy',     label: 'Strategy & AI',     icon: BrainCircuit,cls: 'bg-slate-800/60 border-slate-700 text-slate-200 hover:bg-slate-800', iconCls: 'text-purple-400' },
              ].map(a => (
                <Link key={a.to} to={a.to} className={`w-full flex items-center justify-between p-3 rounded-xl border transition-colors ${a.cls}`}>
                  <span className="text-sm font-medium">{a.label}</span>
                  <a.icon size={16} className={a.iconCls} />
                </Link>
              ))}
            </div>
          </div>

          {/* Active Case File */}
          <div className="border-t border-slate-800 pt-4">
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Active File</h4>
            {activeCase ? (
              <Link to="/app/cases" className="block bg-slate-950/60 p-4 rounded-xl border border-slate-800 hover:border-gold-500/40 transition-colors">
                <p className="font-semibold text-white text-sm truncate">{activeCase.title}</p>
                <p className="text-xs text-slate-400 mt-1 truncate">{activeCase.client || 'No client set'}</p>
                {activeCase.winProbability != null && (
                  <div className="mt-2.5">
                    <div className="flex justify-between text-xs text-slate-500 mb-1">
                      <span>Win Probability</span>
                      <span className={activeCase.winProbability > 60 ? 'text-green-400' : activeCase.winProbability > 40 ? 'text-amber-400' : 'text-red-400'}>{activeCase.winProbability}%</span>
                    </div>
                    <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full transition-all ${activeCase.winProbability > 60 ? 'bg-green-500' : activeCase.winProbability > 40 ? 'bg-amber-500' : 'bg-red-500'}`} style={{ width: `${activeCase.winProbability}%` }} />
                    </div>
                  </div>
                )}
              </Link>
            ) : (
              <div className="text-center py-4 text-slate-500 text-xs">
                <Target size={20} className="mx-auto mb-2 opacity-40" />
                No active case selected.<br />
                <Link to="/app/cases" className="text-gold-400 hover:underline">Open a case</Link> to track it here.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Cases Grid ──────────────────────────────────────────────────── */}
      <div>
        <SectionHeader icon={Briefcase} title="Case Files" subtitle={`${cases.length} total`} accent="text-blue-400"
          action={<Link to="/app/cases" className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 font-semibold">View All <ArrowRight size={13} /></Link>}
        />
        {cases.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-900/30 p-8 text-center">
            <Briefcase size={32} className="mx-auto mb-3 text-slate-600" />
            <p className="text-slate-400 text-sm mb-1">No cases yet.</p>
            <p className="text-slate-500 text-xs mb-4">Start a Maya intake or add a case manually.</p>
            <div className="flex gap-3 justify-center">
              <Link to="/app/intake" className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-sm font-semibold transition-colors"><Bot size={14} /> Maya Intake</Link>
              <Link to="/app/cases" className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-slate-700 text-slate-300 hover:bg-slate-800 text-sm font-semibold transition-colors"><Plus size={14} /> Add Manually</Link>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {cases.slice(0, 6).map(c => (
              <Link key={c.id} to="/app/cases" onClick={() => setActiveCase(c)}
                className={`rounded-2xl border p-4 transition-all hover:border-blue-500/50 ${activeCase?.id === c.id ? 'border-blue-500/60 bg-blue-950/30' : 'border-slate-800 bg-slate-900/60'}`}>
                <div className="flex items-start justify-between gap-2 mb-2">
                  <p className="font-semibold text-white text-sm leading-tight truncate">{c.title}</p>
                  <span className={`shrink-0 px-2 py-0.5 rounded-full text-[10px] font-semibold ${(c.status as string) === 'Active' || (c.status as string) === 'Pre-Trial' ? 'bg-yellow-900/50 text-yellow-400' : (c.status as string) === 'Trial' ? 'bg-red-900/50 text-red-400' : (c.status as string) === 'Closed' ? 'bg-slate-700 text-slate-400' : 'bg-blue-900/50 text-blue-400'}`}>{c.status || 'Active'}</span>
                </div>
                <p className="text-slate-400 text-xs mb-2 truncate">{c.client || 'No client set'}</p>
                <p className="text-slate-500 text-xs line-clamp-2">{c.summary || 'No summary yet.'}</p>
                {activeCase?.id === c.id && <div className="mt-2 flex items-center gap-1 text-blue-400 text-[10px] font-semibold"><Activity size={10} /> Active Case</div>}
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* ── Relevant Case Law ────────────────────────────────────────────── */}
      <RelevantCases activeCase={activeCase} />

      {/* ── Leads Inbox — consolidated view ─────────────────────────────── */}
      <div>
        <SectionHeader icon={Inbox} title="Intake Leads Pipeline"
          subtitle={leads.length > 0 ? `${leads.length} leads · ${hotLeads.length} urgent` : 'No leads yet'}
          accent="text-violet-400"
          action={
            <div className="flex items-center gap-3">
              <Link to="/app/intake-inbox" className="text-xs text-violet-400 hover:text-violet-300 font-semibold flex items-center gap-1">Full Inbox <ArrowRight size={12} /></Link>
              <Link to="/app/intake" className="text-xs text-green-400 hover:text-green-300 font-semibold flex items-center gap-1"><Plus size={11} /> New Intake</Link>
            </div>
          }
        />

        {leads.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-900/30 p-8 text-center">
            <Bot size={28} className="mx-auto mb-3 text-violet-500/50" />
            <p className="text-slate-400 text-sm mb-1">No leads yet.</p>
            <p className="text-slate-500 text-xs mb-4">Share your public intake link or start a Maya intake to receive prospective clients.</p>
            <div className="flex gap-3 justify-center">
              <Link to="/app/intake" className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-sm font-semibold transition-colors"><Bot size={14} /> Start Intake</Link>
              <Link to="/start" className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-slate-700 text-slate-300 hover:bg-slate-800 text-sm font-semibold transition-colors"><ArrowRight size={14} /> Share Link</Link>
            </div>
          </div>
        ) : (
          <>
            {/* Urgent leads highlighted */}
            {hotLeads.length > 0 && (
              <div className="mb-4 rounded-xl border border-red-500/30 bg-red-500/5 p-3 flex items-center gap-3">
                <AlertTriangle size={16} className="text-red-400 shrink-0" />
                <p className="text-sm text-red-300 font-medium">{hotLeads.length} urgent lead{hotLeads.length > 1 ? 's' : ''} requiring immediate attention</p>
                <Link to="/app/intake-inbox" className="ml-auto text-xs text-red-400 hover:text-red-300 font-semibold flex items-center gap-1">Review <ChevronRight size={12} /></Link>
              </div>
            )}

            <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1">
              {leads.slice(0, 8).map(lead => {
                const urg = lead.aiAssessment?.urgency || lead.urgency;
                const rec = lead.aiAssessment?.recommendation;
                const score = lead.aiAssessment?.score;
                return (
                  <div key={lead.id} className="shrink-0 w-72 rounded-2xl border border-slate-800 bg-slate-900/60 p-4 space-y-2.5 hover:border-violet-500/40 transition-colors flex flex-col">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-semibold text-white text-sm truncate">{lead.name}</p>
                      {urg && <span className={`shrink-0 text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${urgencyBadge(urg)}`}>{urg}</span>}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 font-medium">{lead.matterType}</span>
                      {score != null && <span className="text-xs text-slate-500 font-medium">Score: <span className={score >= 65 ? 'text-green-400' : score >= 45 ? 'text-amber-400' : 'text-red-400'}>{score}</span></span>}
                    </div>
                    <p className="text-xs text-slate-400 leading-relaxed line-clamp-2 flex-1">
                      {lead.aiAssessment?.summary || lead.aiAssessment?.urgencyAssessment || lead.description}
                    </p>
                    {rec && <p className={`text-xs font-semibold ${recBadge(rec)}`}>{rec === 'proceed' ? '✓ Proceed' : rec === 'schedule-consult' ? '📅 Schedule Consult' : rec === 'refer-out' ? '→ Refer Out' : rec === 'decline' ? '✕ Decline' : rec}</p>}
                    <div className="flex items-center justify-between pt-1 border-t border-slate-800">
                      <span className="text-xs text-slate-600">{relativeTime(lead.submittedAt)}</span>
                      <Link to="/app/cases" onClick={() => sessionStorage.setItem('casebuddy_open_lead', lead.id)}
                        className="text-xs text-violet-400 hover:text-violet-300 font-semibold flex items-center gap-1">
                        Open as Case <ArrowRight size={11} />
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

    </div>
  );
};

export default PartnerDashboard;
