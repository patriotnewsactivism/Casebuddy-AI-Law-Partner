import React, { useContext, useState } from 'react';
import { Phone, Sparkles, Scale } from 'lucide-react';
import { OPERATIONAL_AGENTS, OperationalAgent } from '../agents/personas';
import { getVoiceProfile } from '../agents/voiceProfiles';
import { AppContext } from '../App';
import VoiceRoom from './VoiceRoom';

const FirmReception: React.FC = () => {
  const { activeCase } = useContext(AppContext);
  const [activeAgent, setActiveAgent] = useState<OperationalAgent | null>(null);

  if (activeAgent) {
    return <VoiceRoom agent={activeAgent} onBack={() => setActiveAgent(null)} />;
  }

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      <div className="text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-gold-500/10 border border-gold-500/30 text-gold-400 text-xs font-bold uppercase tracking-wider mb-4">
          <Sparkles size={13} /> Live Voice
        </div>
        <h1 className="text-3xl sm:text-4xl font-serif font-bold text-white">Walk Into the Firm</h1>
        <p className="text-slate-400 mt-3 max-w-2xl mx-auto">
          Tap a member of your team and they'll pick up the line and talk to you — each in their own voice.
          They greet you, ask the questions, and walk you through it. Just talk back, like a real consult.
        </p>
        {activeCase ? (
          <p className="text-xs text-slate-500 mt-3">
            On the line about: <span className="text-gold-400 font-semibold">{activeCase.title}</span>
          </p>
        ) : (
          <p className="text-xs text-slate-500 mt-3">No active case — start with Maya for a fresh intake.</p>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {OPERATIONAL_AGENTS.map(agent => {
          const profile = getVoiceProfile(agent.id);
          return (
            <button
              key={agent.id}
              onClick={() => setActiveAgent(agent)}
              className={`group text-left p-5 rounded-2xl border transition-all hover:scale-[1.02] hover:shadow-xl ${agent.bgClass} ${agent.borderClass}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="text-4xl">{agent.emoji}</div>
                <div className="w-9 h-9 rounded-full bg-green-600/90 group-hover:bg-green-500 flex items-center justify-center text-white shadow-lg transition-colors">
                  <Phone size={16} />
                </div>
              </div>
              <h3 className={`mt-3 text-lg font-bold ${agent.colorClass}`}>{agent.name}</h3>
              <p className="text-sm text-slate-300 font-medium">{agent.title}</p>
              <p className="text-xs text-slate-400 mt-2 leading-relaxed line-clamp-3">{agent.description}</p>
              {profile && (
                <p className="text-[11px] text-slate-500 mt-3 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-gold-500/60" />
                  {profile.voiceLabel}
                </p>
              )}
            </button>
          );
        })}
      </div>

      <div className="bg-slate-800/50 border border-slate-700 rounded-2xl p-5 flex items-start gap-3">
        <Scale size={18} className="text-gold-400 shrink-0 mt-0.5" />
        <p className="text-sm text-slate-400">
          These are your operations team. For specialized legal counsel by practice area, visit{' '}
          <span className="text-gold-400 font-semibold">AI Lawyers</span> — 12 attorneys across criminal,
          personal injury, family, immigration, IP, corporate, and more.
        </p>
      </div>
    </div>
  );
};

export default FirmReception;
