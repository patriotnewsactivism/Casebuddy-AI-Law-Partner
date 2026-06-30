import React, { useContext } from 'react';
import { AppContext } from '../App';
import { Link } from 'react-router-dom';
import { Briefcase, Calendar, Scale, ArrowRight, ShieldCheck, UploadCloud, MessageSquare, Activity, Plus } from 'lucide-react';
import SimilarCases from './SimilarCases';

const greeting = () => {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
};

const CompanionDashboard = () => {
  const { cases, activeCase, setActiveCase, user } = useContext(AppContext);

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
      ? '⚠ Urgent: Review your plan'
      : activeCase
        ? `Hearing for: ${activeCase.title}`
        : 'No upcoming hearings';

  const hearingSubColor =
    daysUntil !== null && (daysUntil < 0 || daysUntil <= 7)
      ? 'text-red-400'
      : daysUntil !== null && daysUntil <= 30
        ? 'text-amber-400'
        : 'text-slate-500';

  const today = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });

  return (
    <div className="space-y-6 sm:space-y-8 max-w-5xl mx-auto">
      {/* Hero */}
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl sm:text-4xl font-bold text-white tracking-tight">
          {greeting()}{user?.displayName ? `, ${user.displayName.split(' ')[0]}` : ''}.
        </h1>
        <p className="text-slate-400 text-sm">
          Here is your legal overview for {today}. Let's get you prepared.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Next Hearing Card */}
        <div className="relative overflow-hidden rounded-2xl border border-blue-500/30 bg-gradient-to-br from-blue-900/40 to-slate-900 p-6 flex flex-col justify-between">
          <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/20 rounded-full blur-3xl -mr-10 -mt-10 pointer-events-none" />
          
          <div className="flex items-start justify-between relative z-10">
            <div>
              <div className="flex items-center gap-2 mb-3">
                <div className="p-2 bg-blue-500/20 rounded-lg">
                  <Calendar size={18} className="text-blue-400" />
                </div>
                <h2 className="text-sm font-semibold text-blue-200 uppercase tracking-widest">Next Deadline</h2>
              </div>
              <p className={`text-4xl font-bold ${daysUntil !== null && daysUntil <= 7 ? 'text-red-400' : 'text-white'}`}>
                {hearingValue}
              </p>
              <p className={`text-sm mt-1.5 ${hearingSubColor}`}>{hearingSubtext}</p>
            </div>
          </div>
          
          <div className="mt-6 relative z-10 flex gap-3">
            <Link to="/app/deadlines" className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold rounded-xl transition-colors inline-flex items-center gap-2">
              Review Calendar <ArrowRight size={14} />
            </Link>
          </div>
        </div>

        {/* Case Strength Card */}
        <div className="relative overflow-hidden rounded-2xl border border-teal-500/30 bg-gradient-to-br from-teal-900/40 to-slate-900 p-6 flex flex-col justify-between">
          <div className="absolute bottom-0 right-0 w-32 h-32 bg-teal-500/20 rounded-full blur-3xl -mr-10 -mb-10 pointer-events-none" />
          
          <div className="flex items-start justify-between relative z-10">
            <div>
              <div className="flex items-center gap-2 mb-3">
                <div className="p-2 bg-teal-500/20 rounded-lg">
                  <ShieldCheck size={18} className="text-teal-400" />
                </div>
                <h2 className="text-sm font-semibold text-teal-200 uppercase tracking-widest">Case Strength</h2>
              </div>
              
              {activeCase ? (
                <>
                  <p className="text-3xl font-bold text-white mb-1">
                    {activeCase.winProbability && activeCase.winProbability > 70 ? 'Strong Position' : 
                     activeCase.winProbability && activeCase.winProbability > 40 ? 'Moderate Position' : 
                     'Challenging Position'}
                  </p>
                  <p className="text-sm text-teal-300">
                    {activeCase.winProbability}% Estimated Win Probability
                  </p>
                </>
              ) : (
                <>
                  <p className="text-2xl font-bold text-slate-300">—</p>
                  <p className="text-sm text-slate-500">No active case selected</p>
                </>
              )}
            </div>
          </div>
          
          <div className="mt-6 relative z-10 flex gap-3">
            <Link to="/app/strategy" className="px-4 py-2 bg-teal-600 hover:bg-teal-500 text-white text-sm font-semibold rounded-xl transition-colors inline-flex items-center gap-2">
              View AI Analysis <ArrowRight size={14} />
            </Link>
          </div>
        </div>
      </div>

      {/* Quick Tools */}
      <div>
        <h3 className="text-lg font-bold text-white mb-4">Quick Tools</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Link to="/app/evidence" className="flex flex-col items-center p-5 rounded-2xl border border-slate-700 bg-slate-800/50 hover:bg-slate-800 transition-all group text-center">
            <div className="w-12 h-12 bg-indigo-500/20 text-indigo-400 rounded-full flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
              <UploadCloud size={24} />
            </div>
            <p className="font-semibold text-slate-200">Upload Evidence</p>
            <p className="text-xs text-slate-400 mt-1">Add documents & photos</p>
          </Link>
          
          <Link to="/app/legal-team" className="flex flex-col items-center p-5 rounded-2xl border border-slate-700 bg-slate-800/50 hover:bg-slate-800 transition-all group text-center">
            <div className="w-12 h-12 bg-amber-500/20 text-amber-400 rounded-full flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
              <MessageSquare size={24} />
            </div>
            <p className="font-semibold text-slate-200">Ask a Question</p>
            <p className="text-xs text-slate-400 mt-1">Consult an AI Lawyer</p>
          </Link>
          
          <Link to="/app/practice" className="flex flex-col items-center p-5 rounded-2xl border border-slate-700 bg-slate-800/50 hover:bg-slate-800 transition-all group text-center">
            <div className="w-12 h-12 bg-purple-500/20 text-purple-400 rounded-full flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
              <Scale size={24} />
            </div>
            <p className="font-semibold text-slate-200">Practice Arguments</p>
            <p className="text-xs text-slate-400 mt-1">Simulate court hearing</p>
          </Link>
        </div>
      </div>

      {/* Active Case Feed */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-bold text-white">My Cases</h3>
            <Link to="/app/cases" className="text-sm font-semibold text-blue-400 hover:text-blue-300 inline-flex items-center gap-1">
              View All <ArrowRight size={14} />
            </Link>
          </div>

          {cases.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-800/30 p-8 text-center">
              <Briefcase size={32} className="mx-auto mb-3 text-slate-600" />
              <p className="text-slate-300 font-medium mb-1">You haven't added any cases.</p>
              <p className="text-slate-500 text-sm mb-4">Let's set up your first case to start getting organized.</p>
              <Link to="/app/cases" className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-white text-slate-950 text-sm font-bold hover:bg-slate-200 transition-colors">
                <Plus size={16} /> Create Case
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {cases.slice(0, 4).map(c => (
                <div
                  key={c.id}
                  onClick={() => setActiveCase(c)}
                  className={`cursor-pointer rounded-2xl border p-5 transition-all ${
                    activeCase?.id === c.id
                      ? 'border-blue-500 bg-blue-900/10 shadow-[0_0_15px_rgba(59,130,246,0.15)]'
                      : 'border-slate-800 bg-slate-800/40 hover:border-slate-600'
                  }`}
                >
                  <div className="flex items-center justify-between mb-3">
                    <span className={`px-2.5 py-1 rounded-md text-[11px] font-bold uppercase tracking-wider ${
                      (c.status as string) === 'Active' || (c.status as string) === 'Pre-Trial' ? 'bg-amber-500/20 text-amber-300' :
                      (c.status as string) === 'Trial' ? 'bg-red-500/20 text-red-300' :
                      (c.status as string) === 'Closed' ? 'bg-slate-700 text-slate-300' :
                      'bg-blue-500/20 text-blue-300'
                    }`}>
                      {c.status || 'Active'}
                    </span>
                    {activeCase?.id === c.id && (
                      <span className="flex items-center gap-1.5 text-blue-400 text-xs font-semibold">
                        <Activity size={12} className="animate-pulse" /> Active
                      </span>
                    )}
                  </div>
                  <p className="font-bold text-white text-lg mb-1 truncate">{c.title}</p>
                  <p className="text-slate-400 text-sm truncate flex items-center gap-1.5">
                    <Briefcase size={14} /> Vs. {c.opposingCounsel || 'Opponent Not Set'}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Similar Cases Sidebar */}
        <div className="space-y-4">
          <SimilarCases />
        </div>
      </div>
    </div>
  );
};

export default CompanionDashboard;
