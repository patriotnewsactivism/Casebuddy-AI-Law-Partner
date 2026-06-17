
import React, { useState, useContext } from 'react';
import { Users, Play, RotateCcw, Send, Loader2, TrendingUp, MessageCircle, Gavel, ChevronDown, ChevronUp } from 'lucide-react';
import { simulateJurorReaction, runJuryDeliberation } from '../services/geminiService';
import { AppContext } from '../App';
import { handleError } from '../utils/errorHandler';
import AgentHeader from './AgentHeader';
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
  const barColor = pct >= 65 ? 'bg-green-500' : pct >= 40 ? 'bg-amber-500' : 'bg-red-500';
  return (
    <div className="space-y-1">
      <div className="flex justify-between items-center">
        <span className="text-xs text-slate-400 truncate">{jurorName}</span>
        <span className={`text-xs font-bold ${pct >= 65 ? 'text-green-400' : pct >= 40 ? 'text-amber-400' : 'text-red-400'}`}>{pct}%</span>
      </div>
      <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-700 ${barColor}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
};

const JurorCard: React.FC<{ juror: Juror; reaction?: JurorReaction }> = ({ juror, reaction }) => {
  const [expanded, setExpanded] = useState(false);
  const delta = reaction?.persuasionDelta ?? 0;

  return (
    <div className="bg-slate-800 border border-slate-700 rounded-xl p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-semibold text-white text-sm">{juror.name}</p>
          <p className="text-xs text-slate-500 mt-0.5">{juror.background}</p>
        </div>
        <div className="text-right shrink-0">
          <span className={`text-lg font-bold ${juror.persuasionLevel >= 65 ? 'text-green-400' : juror.persuasionLevel >= 40 ? 'text-amber-400' : 'text-red-400'}`}>
            {juror.persuasionLevel}%
          </span>
          {delta !== 0 && (
            <span className={`block text-xs font-bold ${delta > 0 ? 'text-green-400' : 'text-red-400'}`}>
              {delta > 0 ? '+' : ''}{delta}
            </span>
          )}
        </div>
      </div>

      <div className="h-2 bg-slate-900 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-700 ${juror.persuasionLevel >= 65 ? 'bg-green-500' : juror.persuasionLevel >= 40 ? 'bg-amber-500' : 'bg-red-500'}`}
          style={{ width: `${juror.persuasionLevel}%` }} />
      </div>

      <p className="text-xs text-slate-400 italic">{juror.personality}</p>

      {reaction && (
        <div className="border-t border-slate-700 pt-3 space-y-2">
          <p className="text-xs text-slate-300">{reaction.reaction}</p>
          <button onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-300 transition-colors">
            {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            Internal thought
          </button>
          {expanded && (
            <p className="text-xs text-slate-500 italic border-l-2 border-slate-600 pl-2">
              "{reaction.internalThought}"
            </p>
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

  const avgPersuasion = Math.round(jurors.reduce((s, j) => s + j.persuasionLevel, 0) / jurors.length);
  const favorable = jurors.filter(j => j.persuasionLevel >= 65).length;
  const unfavorable = jurors.filter(j => j.persuasionLevel < 40).length;

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
      setDeliberation(result);
      setPhase('verdict');
    } catch (err) {
      handleError(err, 'Failed to run deliberation.', 'JurySimulator');
      setPhase('simulation');
    } finally {
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
      <div className="space-y-6">
        <AgentHeader agent={jules} />

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="space-y-4">
            <div className="bg-slate-800 border border-slate-700 rounded-xl p-5 space-y-4">
              <h3 className="font-semibold text-white">Case Setup</h3>

              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Case Summary</label>
                <textarea
                  value={caseContext}
                  onChange={e => setCaseContext(e.target.value)}
                  placeholder={activeCase ? activeCase.summary : "Describe the case: charges/claims, key facts, parties involved…"}
                  rows={4}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 outline-none focus:border-cyan-500 transition-colors resize-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Evidence Summary (for deliberation)</label>
                <textarea
                  value={evidenceSummary}
                  onChange={e => setEvidenceSummary(e.target.value)}
                  placeholder="Briefly list key evidence presented: witnesses, physical evidence, documents…"
                  rows={3}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 outline-none focus:border-cyan-500 transition-colors resize-none"
                />
              </div>

              <button onClick={() => setPhase('simulation')}
                disabled={!caseContext.trim() && !activeCase}
                className="w-full py-3 bg-cyan-600 hover:bg-cyan-500 disabled:bg-slate-700 disabled:text-slate-500 text-white font-bold rounded-xl transition-colors flex items-center justify-center gap-2">
                <Play size={16} />
                Seat the Jury
              </button>
            </div>
          </div>

          <div className="bg-slate-800 border border-slate-700 rounded-xl p-5">
            <h3 className="font-semibold text-white mb-4">Jury Panel Preview</h3>
            <div className="space-y-3">
              {JUROR_PRESETS.map(j => (
                <div key={j.id} className="flex items-start gap-3 p-3 bg-slate-900 rounded-lg">
                  <div className="w-8 h-8 rounded-full bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-xs font-bold text-cyan-400 shrink-0">
                    {j.id}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-white">{j.name}</p>
                    <p className="text-xs text-slate-500">{j.background}</p>
                    <p className="text-xs text-cyan-400/70 mt-0.5 italic">{j.personality}</p>
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
      <div className="flex flex-col items-center justify-center min-h-64 space-y-4">
        <Loader2 size={40} className="animate-spin text-cyan-400" />
        <p className="text-slate-300 text-lg font-semibold">Jury is deliberating…</p>
        <p className="text-slate-500 text-sm">Simulating realistic jury room discussion</p>
      </div>
    );
  }

  if (phase === 'verdict' && deliberation) {
    const { guilty, notGuilty, undecided } = deliberation.finalVote;
    const total = guilty + notGuilty + undecided;
    const isConviction = guilty > notGuilty;

    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold text-white font-serif flex items-center gap-2">
            <Gavel className="text-cyan-400" />
            Jury Verdict
          </h2>
          <button onClick={reset} className="flex items-center gap-2 px-4 py-2 bg-slate-800 border border-slate-700 text-slate-300 rounded-lg text-sm hover:bg-slate-700 transition-colors">
            <RotateCcw size={14} />
            New Simulation
          </button>
        </div>

        <div className={`p-8 rounded-2xl border text-center ${isConviction ? 'bg-red-500/10 border-red-500/40' : 'bg-green-500/10 border-green-500/40'}`}>
          <p className="text-5xl font-bold font-serif mb-2" style={{ color: isConviction ? '#ef4444' : '#22c55e' }}>
            {deliberation.verdict}
          </p>
          <p className="text-slate-400">Verdict Confidence: {deliberation.verdictConfidence}%</p>
          <div className="flex justify-center gap-8 mt-4">
            <div><p className="text-2xl font-bold text-red-400">{guilty}</p><p className="text-xs text-slate-500">Guilty</p></div>
            <div><p className="text-2xl font-bold text-green-400">{notGuilty}</p><p className="text-xs text-slate-500">Not Guilty</p></div>
            {undecided > 0 && <div><p className="text-2xl font-bold text-amber-400">{undecided}</p><p className="text-xs text-slate-500">Undecided</p></div>}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-slate-800 border border-slate-700 rounded-xl p-5">
            <h3 className="font-semibold text-white mb-4 flex items-center gap-2">
              <MessageCircle size={16} className="text-cyan-400" />
              Deliberation
            </h3>
            <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
              {deliberation.deliberationExchanges.map((ex: any, i: number) => (
                <div key={i} className="flex gap-3">
                  <div className="w-7 h-7 rounded-full bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-xs font-bold text-cyan-400 shrink-0 mt-0.5">
                    {ex.jurorId}
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-cyan-400">{ex.jurorName}</p>
                    <p className="text-sm text-slate-300 mt-0.5">{ex.statement}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-4">
            <div className="bg-slate-800 border border-slate-700 rounded-xl p-5">
              <h3 className="font-semibold text-white mb-3">Key Factors</h3>
              <ul className="space-y-2">
                {deliberation.keyFactors.map((f: string, i: number) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-slate-300">
                    <span className="text-cyan-400 font-bold shrink-0">{i + 1}.</span>{f}
                  </li>
                ))}
              </ul>
            </div>

            <div className="bg-slate-800 border border-slate-700 rounded-xl p-5">
              <h3 className="font-semibold text-white mb-3">Final Persuasion Levels</h3>
              <div className="space-y-3">
                {jurors.map(j => <PersuasionBar key={j.id} level={j.persuasionLevel} jurorName={j.name} colorClass="text-cyan-400" />)}
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
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white font-serif flex items-center gap-2">
            <Users className="text-cyan-400" />
            Jury Simulator
          </h2>
          <p className="text-slate-400 text-sm mt-0.5">Present arguments and watch the jury react in real time</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={reset} className="flex items-center gap-2 px-3 py-2 bg-slate-800 border border-slate-700 text-slate-400 rounded-lg text-sm hover:text-white transition-colors">
            <RotateCcw size={14} /> Reset
          </button>
          <button onClick={startDeliberation} disabled={loading || rounds.length === 0}
            className="flex items-center gap-2 px-4 py-2 bg-cyan-600 hover:bg-cyan-500 disabled:bg-slate-700 disabled:text-slate-500 text-white rounded-lg text-sm font-semibold transition-colors">
            <Gavel size={14} /> Send to Deliberate
          </button>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-4 text-center">
          <p className="text-3xl font-bold text-white">{avgPersuasion}%</p>
          <p className="text-xs text-slate-500 mt-1">Avg. Persuasion</p>
        </div>
        <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-4 text-center">
          <p className="text-3xl font-bold text-green-400">{favorable}</p>
          <p className="text-xs text-slate-500 mt-1">Favorable (≥65%)</p>
        </div>
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 text-center">
          <p className="text-3xl font-bold text-red-400">{unfavorable}</p>
          <p className="text-xs text-slate-500 mt-1">Against (&lt;40%)</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Juror grid */}
        <div className="lg:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-4">
          {jurors.map(j => (
            <JurorCard key={j.id} juror={j} reaction={lastRound?.reactions.find(r => r.id === j.id)} />
          ))}
        </div>

        {/* Argument panel */}
        <div className="space-y-4">
          <div className="bg-slate-800 border border-slate-700 rounded-xl p-5 space-y-4">
            <h3 className="font-semibold text-white flex items-center gap-2">
              <Send size={16} className="text-cyan-400" />
              Make Your Argument
            </h3>

            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Argument Type</label>
              <div className="grid grid-cols-2 gap-2">
                {ARGUMENT_TYPES.map(t => (
                  <button key={t.value} onClick={() => setArgType(t.value)}
                    className={`py-1.5 px-2 rounded-lg text-xs font-semibold border transition-colors ${
                      argType === t.value
                        ? 'bg-cyan-500/20 border-cyan-500/50 text-cyan-400'
                        : 'bg-slate-900 border-slate-700 text-slate-400 hover:border-slate-600'
                    }`}>
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Your Argument</label>
              <textarea
                value={argument}
                onChange={e => setArgument(e.target.value)}
                placeholder="Type your argument to the jury… Be specific and persuasive."
                rows={6}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 outline-none focus:border-cyan-500 transition-colors resize-none"
              />
            </div>

            <button onClick={submitArgument} disabled={loading || !argument.trim()}
              className="w-full py-3 bg-cyan-600 hover:bg-cyan-500 disabled:bg-slate-700 disabled:text-slate-500 text-white font-bold rounded-xl transition-colors flex items-center justify-center gap-2">
              {loading ? <><Loader2 size={16} className="animate-spin" /> Analyzing…</> : <><Play size={16} /> Present to Jury</>}
            </button>
          </div>

          {lastRound && (
            <div className="bg-slate-800 border border-slate-700 rounded-xl p-4">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Overall Impact</p>
              <p className="text-sm text-slate-300">{lastRound.overallImpact}</p>
            </div>
          )}

          {rounds.length > 0 && (
            <div className="bg-slate-800 border border-slate-700 rounded-xl p-4">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                <TrendingUp size={12} />
                Round History ({rounds.length})
              </p>
              <div className="space-y-2">
                {rounds.map((r, i) => (
                  <div key={i} className="text-xs flex items-center justify-between gap-2">
                    <span className="text-slate-400 truncate">
                      {i + 1}. {ARGUMENT_TYPES.find(t => t.value === r.argumentType)?.label}
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
