import React, { useState, useContext } from 'react';
import { Mic, MicOff, X } from 'lucide-react';
import { AppContext } from '../App';
import { Link } from 'react-router-dom';
import { OPERATIONAL_AGENTS } from '../agents/personas';

/**
 * FloatingVoiceButton — firm-wide push-to-talk shortcut.
 * Shows a pulsing mic FAB in the bottom-right corner.
 * On click, expands to let the user pick which agent to call.
 */
const FloatingVoiceButton: React.FC = () => {
  const { user } = useContext(AppContext);
  const [open, setOpen] = useState(false);

  // Only show for authenticated users
  if (!user) return null;

  // Agents that have a VoiceRoom accessible from their route
  const voiceAgents = OPERATIONAL_AGENTS.filter(a =>
    ['maya', 'lex', 'rex', 'sol', 'sierra', 'jules', 'doc', 'max'].includes(a.id)
  );

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-2">
      {/* Agent picker */}
      {open && (
        <div className="bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl p-3 mb-1 w-48 animate-fade-in">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider px-1 mb-2">Call an Agent</p>
          <div className="space-y-1">
            {voiceAgents.map(a => (
              <Link
                key={a.id}
                to={a.route}
                onClick={() => setOpen(false)}
                className={`flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm font-medium transition-all hover:scale-[1.02] ${a.bgClass} ${a.borderClass} border`}
              >
                <span className="text-lg">{a.emoji}</span>
                <div>
                  <p className={`text-xs font-bold ${a.colorClass}`}>{a.name}</p>
                  <p className="text-xs text-slate-500 leading-tight">{a.role}</p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* FAB */}
      <button
        onClick={() => setOpen(v => !v)}
        className={`flex items-center justify-center w-14 h-14 rounded-full shadow-lg transition-all ${
          open
            ? 'bg-slate-700 border border-slate-600 text-white'
            : 'bg-gold-500 hover:bg-gold-400 text-slate-900'
        }`}
        title={open ? 'Close voice menu' : 'Firm-wide voice assistant'}
      >
        {open ? <X size={20} /> : (
          <>
            <Mic size={22} />
            <span className="absolute top-0 right-0 flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-3 w-3 bg-green-400" />
            </span>
          </>
        )}
      </button>
    </div>
  );
};

export default FloatingVoiceButton;
