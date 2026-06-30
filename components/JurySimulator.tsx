import React, { useState, useContext, useMemo, useEffect } from 'react';
import { Users, Play, RotateCcw, Send, Loader2, TrendingUp, MessageCircle, Gavel, ChevronDown, ChevronUp, Scale, CheckCircle2, Target, AlertTriangle } from 'lucide-react';
import { simulateJurorReaction, runJuryDeliberation } from '../services/geminiService';
import { AppContext } from '../App';
import { handleError } from '../utils/errorHandler';
import AgentHeader from './AgentHeader';
import AIDisclaimer from './AIDisclaimer';
import { OPERATIONAL_AGENTS } from '../agents/personas';

const jules = OPERATIONAL_AGENTS.find(a => a.id === 'jules')!;

interface Juror {
  id: number;
  name: string;
  background: string;
  personality: string;
  persuasionLevel: number;
}

interface JurorReaction {
  id: number;
  reaction: string;
  persuasionDelta: number;
  internalThought: string;
}

interface RoundResult {
  argumentType: string;
  argumentText: string;
  reactions: JurorReaction[];
  overallImpact: string;
}

type ArgType = 'opening' | 'evidence' | 'closing' | 'rebuttal';

const ARGUMENT_TYPES: { value: ArgType; label: string }[] = [
  { value: 'opening', label: 'Opening Statement' },
  { value: 'evidence', label: 'Present Evidence' },
  { value: 'closing', label: 'Closing Argument' },
  { value: 'rebuttal', label: 'Rebuttal' },
];

const JUROR_PRESETS: Juror[] = [
  { id: 1, name: 'Patricia M.', background: 'Retired schoolteacher, 62, Catholic, suburban', personality: 'Empathetic, traditional, follows authority figures', persuasionLevel: 50 },
  { id: 2, name: 'DeShawn K.', background: 'Software engineer, 34, divorced, urban', personality: 'Analytical, skeptical, data-driven, impatient with emotional appeals', persuasionLevel: 50 },
  { id: 3, name: 'Carmen R.', background: 'Small business owner, 48, immigrant background, bilingual', personality: 'Pragmatic, fair-minded, suspicious of large corporations', persuasionLevel: 50 },
  { id: 4, name: 'Marcus T.', background: 'Unemployed construction worker, 39, prior arrest record', personality: 'Skeptical of law enforcement, sympathizes with defendants, short attention span', persuasionLevel: 50 },
  { id: 5, name: 'Helen W.', background: 'Nurse, 55, married with adult children, church-going', personality: 'Compassionate, attentive to details, influenced by medical testimony', persuasionLevel: 50 },
  { id: 6, name: 'Tyler J.', background: 'College student, 22, first-time juror, social media active', personality: 'Impressionable, responds to narrative storytelling, influenced by peers', persuasionLevel: 50 },
];

const PersuasionBar: React.FC<{ level: number; jurorName: string; colorClass: string }> = ({ level, jurorName, colorClass }) => {
  const pct = Math.max(0, Math.min(100, level));
  const barColor = pct >= 65 ? 'bg-green-500' : pct >= 40 ? 'bg-blue-500' : 'bg-red-500';
  const shadowColor = pct >= 65 ? 'shadow-[0_0_10px_rgba(34,197,94,0.5)]' : pct >= 40 ? 'shadow-[0_0_10px_rgba(59,130,246,0.5)]' : 'shadow-[0_0_10px_rgba(239,68,68,0.5)]';
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between items-center">
        <span className="text-xs font-semibold text-slate-300 truncate">{jurorName}</span>
        <span className={`text-xs font-bold ${pct >= 65 ? 'text-green-400' : pct >= 40 ? 'text-blue-400' : 'text-red-400'}`}>{pct}%</span>
      </div>
      <div className="h-2.5 bg-slate-900 border border-slate-800 rounded-full overflow-hidden relative">
        <div className={`absolute top-0 left-0 bottom-0 rounded-full transition-all duration-1000 ease-out ${barColor} ${shadowColor}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
};

const JurorCard: React.FC<{ juror: Juror; reaction?: JurorReaction }> = ({ juror, reaction }) => {
  const [expanded, setExpanded] = useState(false);
  const [showAnimation, setShowAnimation] = useState(false);
  const delta = reaction?.persuasionDelta ?? 0;

  useEffect(() => {
    if (reaction) {
      setShowAnimation(true);
      const timer = setTimeout(() => setShowAnimation(false), 2000);
      return () => clearTimeout(timer);
    }
  }, [reaction]);

  return (
    <div className={`bg-slate-900/60 backdrop-blur-xl border rounded-2xl p-5 space-y-4 relative overflow-hidden transition-all duration-500 ${
      showAnimation && delta > 0 ? 'border-green-500/50 shadow-[0_0_20px_rgba(34,197,94,0.2)]' : 
      showAnimation && delta < 0 ? 'border-red-500/50 shadow-[0_0_20px_rgba(239,68,68,0.2)]' : 
      'border-white/5 hover:border-white/10'
    }`}>
      
      {/* Floating Delta Animation */}
      {showAnimation && delta !== 0 && (
        <div className={`absolute right-4 top-1/4 transform -translate-y-1/2 text-3xl font-black z-10 animate-out slide-out-to-top-8 fade-out duration-[2000ms] ${
          delta > 0 ? 'text-green-400 drop-shadow-[0_0_10px_rgba(34,197,94,0.8)]' : 'text-red-400 drop-shadow-[0_0_10px_rgba(239,68,68,0.8)]'
        }`}>
          {delta > 0 ? '+' : ''}{delta}
        </div>
      )}

      <div className="flex items-start justify-between gap-2 relative z-0">
        <div>
          <p className="font-bold text-white text-base">{juror.name}</p>
          <p className="text-[11px] text-slate-400 mt-0.5 leading-tight">{juror.background}</p>
        </div>
        <div className="text-right shrink-0 bg-slate-950/50 px-3 py-1.5 rounded-xl border border-white/5">
          <span className={`text-xl font-black ${juror.persuasionLevel >= 65 ? 'text-green-400 drop-shadow-[0_0_5px_rgba(34,197,94,0.5)]' : juror.persuasionLevel >= 40 ? 'text-blue-400 drop-shadow-[0_0_5px_rgba(59,130,246,0.5)]' : 'text-red-400 drop-shadow-[0_0_5px_rgba(239,68,68,0.5)]'}`}>
            {juror.persuasionLevel}%
          </span>
        </div>
      </div>

      <div className="h-3 bg-slate-950 border border-slate-800 rounded-full overflow-hidden relative shadow-inner">
        <div className={`absolute top-0 left-0 bottom-0 rounded-full transition-all duration-1000 ease-out ${
          juror.persuasionLevel >= 65 ? 'bg-green-500 shadow-[0_0_10px_rgba(34,197,94,0.8)]' : 
          juror.persuasionLevel >= 40 ? 'bg-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.8)]' : 
          'bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.8)]'
        }`}
          style={{ width: `${juror.persuasionLevel}%` }} />
      </div>

      <p className="text-[11px] text-slate-500 italic bg-slate-950/30 p-2 rounded-lg border border-white/5">{juror.personality}</p>

      {reaction && (
        <div className="border-t border-white/5 pt-4 space-y-3 animate-in fade-in duration-500">
          <div className="flex items-start gap-2">
            <MessageCircle size={14} className="text-blue-400 mt-0.5 shrink-0" />
            <p className="text-xs text-slate-300 font-medium leading-relaxed">{reaction.reaction}</p>
          </div>
          
          <button onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest font-bold text-slate-500 hover:text-slate-300 transition-colors bg-slate-800/50 px-2 py-1 rounded">
            {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            Internal thought
          </button>
          
          {expanded && (
            <div className="text-xs text-slate-400 italic border-l-2 border-blue-500/50 pl-3 py-1 bg-gradient-to-r from-blue-900/10 to-transparent">
              "{reaction.internalThought}"
            </div>
          )}
        </div>
      )}
    </div>
  );
};

type Phase = 'setup' | 'simulation' | 'deliberation' | 'verdict';

const JurySimulator: React.FC = () => {
  const { activeCase } = useContext(AppContext);
  const [phase, setPhase] = useState<Phase>('setup');
  const [jurors, setJurors] = useState<Juror[]>(JUROR_PRESETS.map(j => ({ ...j })));
  const [caseContext, setCaseContext] = useState(activeCase?.summary || '');
  const [evidenceSummary, setEvidenceSummary] = useState('');
  const [argument, setArgument] = useState('');
  const [argType, setArgType] = useState<ArgType>('opening');
  const [loading, setLoading] = useState(false);
  const [rounds, setRounds] = useState<RoundResult[]>([]);
  const [deliberation, setDeliberation] = useState<any>(null);

  const { avgPersuasion, favorable, unfavorable } = useMemo(() => ({
    avgPersuasion: jurors.length ? Math.round(jurors.reduce((s, j) => s + j.persuasionLevel, 0) / jurors.length) : 0,
    favorable:   jurors.filter(j => j.persuasionLevel >= 65).length,
    unfavorable: jurors.filter(j => j.persuasionLevel < 40).length,
  }), [jurors]);

  const submitArgument = async () => {
    if (!argument.trim() || loading) return;
    setLoading(true);
    try {
      const ctx = caseContext || (activeCase ? `${activeCase.title}: ${activeCase.summary}` : 'Legal case (no context provided)');
      const result = await simulateJurorReaction(jurors, argument, argType, ctx);

      const updatedJurors = jurors.map(j => {
        const reaction = result.jurorReactions.find(r => r.id === j.id);
        if (!reaction) return j;
        const newLevel = Math.max(0, Math.min(100, j.persuasionLevel + reaction.persuasionDelta));
        return { ...j, persuasionLevel: newLevel };
      });

      setJurors(updatedJurors);
      setRounds(prev => [...prev, {
        argumentType: argType,
        argumentText: argument,
        reactions: result.jurorReactions,
        overallImpact: result.overallImpact,
      }]);
      setArgument('');
    } catch (err) {
      handleError(err, 'Failed to simulate jury reaction.', 'JurySimulator');
    } finally {
      setLoading(false);
    }
  };

  const startDeliberation = async () => {
    setLoading(true);
    setPhase('deliberation');
    try {
      const ctx = caseContext || (activeCase ? `${activeCase.title}: ${activeCase.summary}` : 'General litigation matter');
      const result = await runJuryDeliberation(jurors, ctx, evidenceSummary || 'Evidence as presented during trial.');
      
      // Simulate real-time deliberation by delaying the verdict reveal
      setTimeout(() => {
        setDeliberation(result);
        setPhase('verdict');
        setLoading(false);
      }, 5000); // 5 seconds of dramatic pulsing
      
    } catch (err) {
      handleError(err, 'Failed to run deliberation.', 'JurySimulator');
      setPhase('simulation');
      setLoading(false);
    }
  };

  const reset = () => {
    setPhase('setup');
    setJurors(JUROR_PRESETS.map(j => ({ ...j })));
    setRounds([]);
    setDeliberation(null);
    setArgument('');
    setEvidenceSummary('');
    if (!activeCase) setCaseContext('');
  };

  if (phase === 'setup') {
    return (
      <div className="space-y-8 max-w-7xl mx-auto">
        <AgentHeader agent={jules} />
        <AIDisclaimer variant="full" className="mb-4" />

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div className="space-y-6">
            <div className="bg-slate-900/60 backdrop-blur-xl border border-white/5 rounded-3xl p-8 space-y-6 shadow-2xl relative overflow-hidden">
              <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/10 rounded-full blur-3xl -mr-20 -mt-20 pointer-events-none" />
              <div className="relative z-10">
                <h3 className="text-2xl font-serif font-bold text-white mb-6">Case Setup</h3>

                <div className="space-y-5">
                  <div>
                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Case Summary</label>
                    <textarea
                      value={caseContext}
                      onChange={e => setCaseContext(e.target.value)}
                      placeholder={activeCase ? activeCase.summary : "Describe the case: charges/claims, key facts, parties involved…"}
                      rows={5}
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-600 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all resize-none shadow-inner"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Evidence Summary <span className="text-[10px] text-slate-500 normal-case">(Used in deliberation)</span></label>
                    <textarea
                      value={evidenceSummary}
                      onChange={e => setEvidenceSummary(e.target.value)}
                      placeholder="Briefly list key evidence presented: witnesses, physical evidence, documents…"
                      rows={4}
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-600 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all resize-none shadow-inner"
                    />
                  </div>

                  <button onClick={() => setPhase('simulation')}
                    disabled={!caseContext.trim() && !activeCase}
                    className="w-full py-4 bg-gold-600 hover:bg-gold-500 disabled:bg-slate-800 disabled:text-slate-600 text-slate-900 font-bold text-lg rounded-xl transition-all shadow-[0_0_15px_rgba(212,175,55,0.3)] hover:shadow-[0_0_20px_rgba(212,175,55,0.5)] flex items-center justify-center gap-2 mt-4 disabled:shadow-none">
                    <Play fill="currentColor" size={20} />
                    Seat the Jury
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-slate-900/60 backdrop-blur-xl border border-white/5 rounded-3xl p-8 shadow-2xl">
            <h3 className="text-2xl font-serif font-bold text-white mb-6 flex items-center gap-3">
              <Users className="text-blue-400" />
              Jury Panel Preview
            </h3>
            <div className="space-y-4 max-h-[600px] overflow-y-auto pr-2 custom-scrollbar">
              {JUROR_PRESETS.map(j => (
                <div key={j.id} className="flex items-start gap-4 p-4 bg-slate-950/50 border border-slate-800 rounded-2xl hover:border-blue-500/30 transition-colors group">
                  <div className="w-12 h-12 rounded-full bg-blue-500/10 border border-blue-500/30 flex items-center justify-center text-lg font-bold text-blue-400 shrink-0 group-hover:scale-110 transition-transform shadow-[0_0_10px_rgba(59,130,246,0.2)]">
                    {j.id}
                  </div>
                  <div>
                    <p className="text-base font-bold text-white mb-1">{j.name}</p>
                    <p className="text-xs text-slate-400 mb-1">{j.background}</p>
                    <p className="text-[11px] text-blue-400 mt-1 italic font-medium">{j.personality}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (phase === 'deliberation') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[70vh] space-y-12">
        <div className="relative">
          <div className="absolute inset-0 bg-blue-500 rounded-full blur-[100px] opacity-20 animate-pulse"></div>
          <div className="w-32 h-32 rounded-full bg-slate-900 border-4 border-slate-800 flex items-center justify-center relative z-10 shadow-2xl">
            <Loader2 size={48} className="animate-spin text-blue-400 drop-shadow-[0_0_10px_rgba(59,130,246,0.8)]" />
          </div>
        </div>
        
        <div className="text-center space-y-4">
          <h2 className="text-4xl font-serif font-bold text-white">The Jury is Deliberating</h2>
          <p className="text-blue-400 text-lg font-medium animate-pulse">Simulating realistic jury room dynamics based on personality profiles...</p>
        </div>

        {/* Fake typing indicator for jurors */}
        <div className="grid grid-cols-3 gap-6 max-w-3xl opacity-50">
           {[1,2,3].map(i => (
             <div key={i} className={`flex gap-3 bg-slate-900/50 p-4 rounded-2xl animate-pulse`} style={{ animationDelay: `${i * 300}ms` }}>
                <div className="w-10 h-10 rounded-full bg-slate-800 shrink-0"></div>
                <div className="flex-1 space-y-2 mt-2">
                  <div className="h-2 bg-slate-800 rounded w-full"></div>
                  <div className="h-2 bg-slate-800 rounded w-2/3"></div>
                </div>
             </div>
           ))}
        </div>
      </div>
    );
  }

  if (phase === 'verdict' && deliberation) {
    const { guilty, notGuilty, undecided } = deliberation.finalVote;
    const isConviction = guilty > notGuilty;

    return (
      <div className="space-y-8 max-w-7xl mx-auto">
        <div className="flex items-center justify-between bg-slate-900/80 backdrop-blur-xl border border-white/5 p-4 rounded-2xl shadow-xl">
          <h2 className="text-2xl font-bold text-white font-serif flex items-center gap-3 ml-4">
            <Gavel className="text-gold-500" size={28} />
            Jury Verdict Reached
          </h2>
          <button onClick={reset} className="flex items-center gap-2 px-6 py-2.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white font-bold rounded-xl transition-colors shadow-lg">
            <RotateCcw size={16} />
            New Simulation
          </button>
        </div>

        <div className={`relative p-12 rounded-3xl border text-center overflow-hidden shadow-2xl ${isConviction ? 'bg-red-950/20 border-red-500/30' : 'bg-green-950/20 border-green-500/30'}`}>
          <div className={`absolute top-0 left-0 right-0 h-2 ${isConviction ? 'bg-red-500 shadow-[0_0_20px_rgba(239,68,68,0.8)]' : 'bg-green-500 shadow-[0_0_20px_rgba(34,197,94,0.8)]'}`} />
          <div className={`absolute inset-0 blur-[100px] opacity-10 pointer-events-none ${isConviction ? 'bg-red-500' : 'bg-green-500'}`}></div>
          
          <div className="relative z-10">
            <p className="text-[10px] uppercase tracking-[0.3em] font-bold text-slate-400 mb-4">Final Verdict</p>
            <p className="text-7xl font-black font-serif mb-4 tracking-tight" style={{ color: isConviction ? '#ef4444' : '#22c55e', textShadow: `0 0 40px ${isConviction ? 'rgba(239,68,68,0.4)' : 'rgba(34,197,94,0.4)'}` }}>
              {deliberation.verdict}
            </p>
            <p className="text-lg text-white font-medium bg-slate-950/50 inline-block px-6 py-2 rounded-full border border-white/5 shadow-inner">
              Confidence Level: <span className={isConviction ? 'text-red-400' : 'text-green-400'}>{deliberation.verdictConfidence}%</span>
            </p>
            
            <div className="flex justify-center gap-12 mt-12">
              <div className="bg-slate-950/50 p-6 rounded-2xl border border-white/5 shadow-inner w-40">
                <p className="text-5xl font-black text-red-500 mb-2">{guilty}</p>
                <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Guilty</p>
              </div>
              <div className="bg-slate-950/50 p-6 rounded-2xl border border-white/5 shadow-inner w-40">
                <p className="text-5xl font-black text-green-500 mb-2">{notGuilty}</p>
                <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Not Guilty</p>
              </div>
              {undecided > 0 && (
                <div className="bg-slate-950/50 p-6 rounded-2xl border border-white/5 shadow-inner w-40">
                  <p className="text-5xl font-black text-amber-500 mb-2">{undecided}</p>
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Undecided</p>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div className="bg-slate-900/60 backdrop-blur-xl border border-white/5 rounded-3xl p-8 shadow-2xl">
            <h3 className="font-serif font-bold text-2xl text-white mb-6 flex items-center gap-3">
              <MessageCircle className="text-blue-400" />
              The Deliberation Room
            </h3>
            <div className="space-y-4 max-h-[500px] overflow-y-auto pr-2 custom-scrollbar">
              {deliberation.deliberationExchanges.map((ex: any, i: number) => (
                <div key={i} className="flex gap-4 bg-slate-950/50 p-4 rounded-2xl border border-white/5">
                  <div className="w-10 h-10 rounded-full bg-blue-500/10 border border-blue-500/30 flex items-center justify-center text-sm font-bold text-blue-400 shrink-0 shadow-[0_0_10px_rgba(59,130,246,0.2)]">
                    {ex.jurorId}
                  </div>
                  <div>
                    <p className="text-sm font-bold text-blue-400 mb-1">{ex.jurorName}</p>
                    <p className="text-[15px] text-slate-200 leading-relaxed">{ex.statement}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-8">
            <div className="bg-slate-900/60 backdrop-blur-xl border border-white/5 rounded-3xl p-8 shadow-2xl">
              <h3 className="font-serif font-bold text-2xl text-white mb-6 flex items-center gap-3">
                <Target className="text-gold-500" />
                Key Factors
              </h3>
              <ul className="space-y-4">
                {deliberation.keyFactors.map((f: string, i: number) => (
                  <li key={i} className="flex items-start gap-3 text-base text-slate-300 bg-slate-950/50 p-4 rounded-xl border border-white/5">
                    <span className="text-gold-500 font-black shrink-0 mt-0.5">{i + 1}.</span>
                    <span className="leading-relaxed">{f}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="bg-slate-900/60 backdrop-blur-xl border border-white/5 rounded-3xl p-8 shadow-2xl">
              <h3 className="font-serif font-bold text-2xl text-white mb-6">Final Persuasion Levels</h3>
              <div className="space-y-5">
                {jurors.map(j => <PersuasionBar key={j.id} level={j.persuasionLevel} jurorName={j.name} colorClass="text-blue-400" />)}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Simulation phase
  const lastRound = rounds[rounds.length - 1];

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      <div className="flex items-center justify-between bg-slate-900/60 backdrop-blur-xl border border-white/5 p-5 rounded-2xl shadow-xl">
        <div>
          <h2 className="text-3xl font-bold text-white font-serif flex items-center gap-3">
            <Users className="text-blue-400" />
            Jury Simulator
          </h2>
          <p className="text-slate-400 text-sm mt-1 ml-10">Present arguments and watch the jury react in real time</p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={reset} className="flex items-center gap-2 px-5 py-2.5 bg-slate-800 border border-slate-700 text-slate-300 font-bold rounded-xl text-sm hover:bg-slate-700 hover:text-white transition-colors">
            <RotateCcw size={16} /> Reset
          </button>
          <button onClick={startDeliberation} disabled={loading || rounds.length === 0}
            className="flex items-center gap-2 px-6 py-2.5 bg-gold-600 hover:bg-gold-500 disabled:bg-slate-800 disabled:text-slate-600 text-slate-900 rounded-xl text-sm font-bold transition-colors shadow-[0_0_15px_rgba(212,175,55,0.3)] hover:shadow-[0_0_20px_rgba(212,175,55,0.5)] disabled:shadow-none">
            <Gavel size={18} /> Deliberate
          </button>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-6">
        <div className="bg-slate-900/60 backdrop-blur-xl border border-white/5 rounded-2xl p-6 text-center shadow-xl relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1 bg-blue-500" />
          <p className="text-5xl font-black text-white drop-shadow-[0_0_10px_rgba(59,130,246,0.3)] mb-1">{avgPersuasion}%</p>
          <p className="text-sm font-bold uppercase tracking-widest text-slate-500">Avg. Persuasion</p>
        </div>
        <div className="bg-slate-900/60 backdrop-blur-xl border border-white/5 rounded-2xl p-6 text-center shadow-xl relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1 bg-green-500" />
          <p className="text-5xl font-black text-green-400 drop-shadow-[0_0_10px_rgba(34,197,94,0.3)] mb-1">{favorable}</p>
          <p className="text-sm font-bold uppercase tracking-widest text-slate-500">Favorable (≥65%)</p>
        </div>
        <div className="bg-slate-900/60 backdrop-blur-xl border border-white/5 rounded-2xl p-6 text-center shadow-xl relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1 bg-red-500" />
          <p className="text-5xl font-black text-red-400 drop-shadow-[0_0_10px_rgba(239,68,68,0.3)] mb-1">{unfavorable}</p>
          <p className="text-sm font-bold uppercase tracking-widest text-slate-500">Against (&lt;40%)</p>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
        {/* Juror grid */}
        <div className="xl:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-6">
          {jurors.map(j => (
            <JurorCard key={j.id} juror={j} reaction={lastRound?.reactions.find(r => r.id === j.id)} />
          ))}
        </div>

        {/* Argument panel */}
        <div className="space-y-6">
          <div className="bg-slate-900/60 backdrop-blur-xl border border-white/5 rounded-3xl p-6 space-y-6 shadow-2xl relative">
            <h3 className="font-serif font-bold text-xl text-white flex items-center gap-3">
              <Send className="text-blue-400" />
              Make Your Argument
            </h3>

            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">Argument Type</label>
              <div className="grid grid-cols-2 gap-3">
                {ARGUMENT_TYPES.map(t => (
                  <button key={t.value} onClick={() => setArgType(t.value)}
                    className={`py-2.5 px-3 rounded-xl text-xs font-bold transition-all ${
                      argType === t.value
                        ? 'bg-blue-600 text-white shadow-[0_0_15px_rgba(59,130,246,0.4)]'
                        : 'bg-slate-950 border border-slate-800 text-slate-400 hover:border-slate-600 hover:text-white'
                    }`}>
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">Your Argument</label>
              <textarea
                value={argument}
                onChange={e => setArgument(e.target.value)}
                placeholder="Type your argument to the jury… Be specific and persuasive."
                rows={8}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-3 text-base text-white placeholder-slate-600 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all resize-none shadow-inner"
              />
            </div>

            <button onClick={submitArgument} disabled={loading || !argument.trim()}
              className="w-full py-4 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-800 disabled:text-slate-600 text-white font-bold text-lg rounded-xl transition-all flex items-center justify-center gap-2 shadow-[0_0_20px_rgba(59,130,246,0.3)] hover:shadow-[0_0_30px_rgba(59,130,246,0.5)] disabled:shadow-none">
              {loading ? <><Loader2 size={20} className="animate-spin" /> Analyzing Reaction…</> : <><Play fill="currentColor" size={20} /> Present to Jury</>}
            </button>
          </div>

          {lastRound && (
            <div className="bg-slate-900/60 backdrop-blur-xl border border-white/5 rounded-2xl p-6 shadow-xl">
              <p className="text-[10px] font-bold text-gold-500 uppercase tracking-widest mb-3 flex items-center gap-2">
                <TrendingUp size={14} /> Overall Impact
              </p>
              <p className="text-base text-slate-200 font-medium leading-relaxed bg-slate-950/50 p-4 rounded-xl border border-white/5 shadow-inner">{lastRound.overallImpact}</p>
            </div>
          )}

          {rounds.length > 0 && (
            <div className="bg-slate-900/60 backdrop-blur-xl border border-white/5 rounded-2xl p-6 shadow-xl">
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-4 flex items-center gap-2">
                Round History ({rounds.length})
              </p>
              <div className="space-y-3 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                {rounds.map((r, i) => (
                  <div key={i} className="flex items-center gap-3 bg-slate-950/50 p-3 rounded-xl border border-white/5">
                    <span className="w-6 h-6 rounded-full bg-slate-800 text-slate-400 flex items-center justify-center text-xs font-bold shrink-0">{i + 1}</span>
                    <span className="text-sm font-semibold text-slate-300 truncate">
                      {ARGUMENT_TYPES.find(t => t.value === r.argumentType)?.label}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default JurySimulator;
