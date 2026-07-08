
import React, { useContext } from 'react';
import { Link } from 'react-router-dom';
import { AppContext } from '../App';
import { CaseStatus } from '../types';
import { safeText } from '../utils/safeText';

const STATUS_COLORS: Record<CaseStatus, string> = {
  [CaseStatus.PRE_TRIAL]: 'bg-blue-500/20 border-blue-500/40 text-blue-400',
  [CaseStatus.DISCOVERY]: 'bg-amber-500/20 border-amber-500/40 text-amber-400',
  [CaseStatus.TRIAL]: 'bg-red-500/20 border-red-500/40 text-red-400',
  [CaseStatus.APPEAL]: 'bg-violet-500/20 border-violet-500/40 text-violet-400',
  [CaseStatus.CLOSED]: 'bg-slate-500/20 border-slate-500/40 text-slate-400',
};

const ActiveCaseBar: React.FC = () => {
  const { activeCase } = useContext(AppContext);

  return (
    <div className="w-full bg-slate-900/80 backdrop-blur border-b border-slate-800 px-4 h-10 flex items-center gap-3 shrink-0">
      {activeCase ? (
        <>
          <span className="text-slate-500 text-xs font-medium uppercase tracking-wider shrink-0">Active Case:</span>
          <span className="text-white font-semibold text-sm truncate min-w-0">{safeText(activeCase.title, 'Untitled Case')}</span>
          <span className={`text-xs px-2 py-0.5 rounded-full border font-medium shrink-0 ${STATUS_COLORS[activeCase.status]}`}>
            {activeCase.status}
          </span>
          <Link
            to="/app/cases"
            className="ml-auto text-gold-400 text-xs hover:text-gold-300 transition-colors shrink-0 whitespace-nowrap"
          >
            Switch Case →
          </Link>
        </>
      ) : (
        <>
          <span className="text-slate-500 text-xs">No active case.</span>
          <Link
            to="/app/cases"
            className="text-gold-400 text-xs hover:text-gold-300 transition-colors"
          >
            Select a case to get started →
          </Link>
        </>
      )}
    </div>
  );
};

export default ActiveCaseBar;
