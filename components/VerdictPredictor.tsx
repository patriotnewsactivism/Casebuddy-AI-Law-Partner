import React, { useState, useContext } from 'react';
import { AppContext } from '../App';
import { predictVerdictAndSettlement } from '../services/geminiService';
import { TrendingUp, Loader, AlertTriangle, CheckCircle, DollarSign, Scale, RefreshCw, Clock } from 'lucide-react';
import { toast } from 'react-toastify';

interface Prediction {
  id: string;
  caseTitle: string;
  winProbability: number;
  verdictLikely: string;
  damagesLow?: string;
  damagesMid?: string;
  damagesHigh?: string;
  settlementFloor: string;
  settlementSweet: string;
  settlementCeiling: string;
  keyRisks: string[];
  keyStrengths: string[];
  recommendation: string;
  timelineEstimate?: string;
  timestamp: number;
}

const ProbabilityRing = ({ value }: { value: number }) => {
  const color = value >= 65 ? '#22c55e' : value >= 40 ? '#eab308' : '#ef4444';
  const r = 54;
  const circumference = 2 * Math.PI * r;
  const dash = (value / 100) * circumference;
  return (
    <div className="relative w-36 h-36 mx-auto">
      <svg className="w-36 h-36 -rotate-90" viewBox="0 0 140 140">
        <circle cx="70" cy="70" r={r} fill="none" stroke="#1e293b" strokeWidth="12" />
        <circle cx="70" cy="70" r={r} fill="none" stroke={color} strokeWidth="12"
          strokeDasharray={`${dash} ${circumference}`} strokeLinecap="round"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-4xl font-black text-white">{value}%</span>
        <span className="text-xs text-slate-400 uppercase tracking-wider">Win</span>
      </div>
    </div>
  );
};

const VerdictPredictor = () => {
  const { activeCase } = useContext(AppContext);
  const [caseType, setCaseType] = useState('');
  const [jurisdiction, setJurisdiction] = useState('');
  const [evidenceStrength, setEvidenceStrength] = useState(50);
  const [additionalFactors, setAdditionalFactors] = useState('');
  const [loading, setLoading] = useState(false);
  const [prediction, setPrediction] = useState<Prediction | null>(null);
  const [history, setHistory] = useState<Prediction[]>(() => {
    try { return JSON.parse(localStorage.getItem('verdict_predictions') || '[]'); } catch { return []; }
  });

  const predict = async () => {
    if (!activeCase) { toast.error('Select an active case first.'); return; }
    setLoading(true);
    try {
      const result = await predictVerdictAndSettlement(
        activeCase.summary || activeCase.title,
        caseType || activeCase.title,
        evidenceStrength,
        jurisdiction || 'General jurisdiction',
        additionalFactors
      );
      const p: Prediction = {
        id: Date.now().toString(),
        caseTitle: activeCase.title,
        ...result,
        timestamp: Date.now()
      };
      const updated = [p, ...history].slice(0, 10);
      localStorage.setItem('verdict_predictions', JSON.stringify(updated));
      setHistory(updated);
      setPrediction(p);
      toast.success('Prediction complete!');
    } catch (e) {
      toast.error('Prediction failed. Please try again.');
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  if (!activeCase) {
    return (
      <div className="flex items-center justify-center min-h-64">
        <div className="text-center">
          <Scale className="mx-auto mb-3 text-slate-500" size={48} />
          <p className="text-white font-semibold">No Active Case</p>
          <p className="text-slate-400 text-sm">Select a case to run a prediction.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <TrendingUp className="text-gold-500" size={32} />
        <div>
          <h1 className="text-3xl font-bold text-white font-serif">Verdict & Settlement Predictor</h1>
          <p className="text-slate-400 text-sm">AI-powered outcome analysis for {activeCase.title}</p>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Input Form */}
        <div className="bg-slate-800/60 border border-slate-700 rounded-xl p-6 space-y-5">
          <h2 className="text-lg font-bold text-white">Case Inputs</h2>

          <div>
            <label className="text-sm text-slate-400 block mb-1">Case Type</label>
            <input value={caseType} onChange={e => setCaseType(e.target.value)}
              placeholder="e.g. Criminal Defense, Personal Injury, Contract Dispute"
              className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-gold-500 text-sm"
            />
          </div>

          <div>
            <label className="text-sm text-slate-400 block mb-1">Jurisdiction</label>
            <input value={jurisdiction} onChange={e => setJurisdiction(e.target.value)}
              placeholder="e.g. State Court, Florida, Federal 11th Circuit"
              className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-gold-500 text-sm"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm text-slate-400">Evidence Strength</label>
              <span className={`text-sm font-bold ${evidenceStrength >= 70 ? 'text-green-400' : evidenceStrength >= 40 ? 'text-yellow-400' : 'text-red-400'}`}>
                {evidenceStrength}/100
              </span>
            </div>
            <input type="range" min={0} max={100} value={evidenceStrength}
              onChange={e => setEvidenceStrength(Number(e.target.value))}
              className="w-full accent-gold-500"
            />
            <div className="flex justify-between text-xs text-slate-500 mt-1">
              <span>Weak</span><span>Moderate</span><span>Strong</span>
            </div>
          </div>

          <div>
            <label className="text-sm text-slate-400 block mb-1">Additional Factors</label>
            <textarea value={additionalFactors} onChange={e => setAdditionalFactors(e.target.value)}
              placeholder="e.g. Conservative jury pool expected, sympathetic plaintiff, judge known for large damage awards, key witness recanted..."
              rows={4}
              className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-gold-500 text-sm resize-none"
            />
          </div>

          <button onClick={predict} disabled={loading}
            className="w-full flex items-center justify-center gap-2 bg-gold-500 hover:bg-gold-600 disabled:bg-slate-700 disabled:text-slate-500 text-slate-900 font-bold py-3 rounded-lg transition-colors"
          >
            {loading ? <><Loader className="animate-spin" size={18} /> Analyzing...</> : <><TrendingUp size={18} /> Run Prediction</>}
          </button>

          {/* History */}
          {history.length > 1 && (
            <div className="border-t border-slate-700 pt-4 space-y-2">
              <p className="text-xs text-slate-500 uppercase tracking-wider">Past Predictions</p>
              {history.slice(1, 5).map(p => (
                <button key={p.id} onClick={() => setPrediction(p)}
                  className="w-full text-left p-2 rounded-lg bg-slate-700/50 hover:bg-slate-700 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <p className="text-white text-xs font-semibold">{new Date(p.timestamp).toLocaleDateString()}</p>
                    <span className={`text-xs font-black ${p.winProbability >= 65 ? 'text-green-400' : p.winProbability >= 40 ? 'text-yellow-400' : 'text-red-400'}`}>{p.winProbability}%</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Results Panel */}
        <div className="lg:col-span-2 space-y-4">
          {prediction ? (
            <>
              {/* Win Probability */}
              <div className="bg-slate-800/60 border border-slate-700 rounded-xl p-6">
                <div className="flex items-center gap-8">
                  <ProbabilityRing value={prediction.winProbability} />
                  <div className="flex-1">
                    <p className="text-xs text-slate-500 uppercase tracking-wider mb-2">Most Likely Verdict</p>
                    <p className="text-white text-xl font-bold mb-3">{prediction.verdictLikely}</p>
                    {prediction.timelineEstimate && (
                      <div className="flex items-center gap-2 text-slate-400 text-sm">
                        <Clock size={14} />
                        <span>Timeline: {prediction.timelineEstimate}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Settlement Range */}
              <div className="bg-slate-800/60 border border-slate-700 rounded-xl p-5">
                <h3 className="text-white font-bold mb-4 flex items-center gap-2">
                  <DollarSign size={18} className="text-gold-400" /> Settlement Analysis
                </h3>
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { label: 'Floor', value: prediction.settlementFloor, color: 'border-slate-600 text-slate-300' },
                    { label: 'Sweet Spot', value: prediction.settlementSweet, color: 'border-gold-600 text-gold-300', highlight: true },
                    { label: 'Ceiling', value: prediction.settlementCeiling, color: 'border-slate-600 text-slate-300' },
                  ].map(item => (
                    <div key={item.label} className={`border rounded-xl p-4 text-center ${item.highlight ? 'bg-gold-900/20 border-gold-600/50' : 'bg-slate-900/40 border-slate-700'}`}>
                      <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">{item.label}</p>
                      <p className={`text-lg font-black ${item.color}`}>{item.value}</p>
                    </div>
                  ))}
                </div>

                {(prediction.damagesLow || prediction.damagesMid || prediction.damagesHigh) && (
                  <div className="mt-4 pt-4 border-t border-slate-700">
                    <p className="text-xs text-slate-500 mb-3">Projected Damages Range</p>
                    <div className="grid grid-cols-3 gap-3">
                      {[
                        { label: 'Low', value: prediction.damagesLow },
                        { label: 'Mid', value: prediction.damagesMid },
                        { label: 'High', value: prediction.damagesHigh },
                      ].map(item => item.value && (
                        <div key={item.label} className="bg-slate-900/40 border border-slate-700 rounded-lg p-3 text-center">
                          <p className="text-xs text-slate-500 mb-0.5">{item.label}</p>
                          <p className="text-white font-bold">{item.value}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Risks & Strengths */}
              <div className="grid md:grid-cols-2 gap-4">
                <div className="bg-slate-800/60 border border-red-800/30 rounded-xl p-5">
                  <h3 className="text-red-400 font-bold text-sm uppercase tracking-wider mb-3 flex items-center gap-1">
                    <AlertTriangle size={14} /> Key Risks
                  </h3>
                  <ul className="space-y-2">
                    {prediction.keyRisks.map((r, i) => (
                      <li key={i} className="flex gap-2 text-slate-300 text-sm">
                        <span className="text-red-400 shrink-0 mt-0.5">⚠</span> {r}
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="bg-slate-800/60 border border-green-800/30 rounded-xl p-5">
                  <h3 className="text-green-400 font-bold text-sm uppercase tracking-wider mb-3 flex items-center gap-1">
                    <CheckCircle size={14} /> Key Strengths
                  </h3>
                  <ul className="space-y-2">
                    {prediction.keyStrengths.map((s, i) => (
                      <li key={i} className="flex gap-2 text-slate-300 text-sm">
                        <span className="text-green-400 shrink-0 mt-0.5">✓</span> {s}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              {/* Recommendation */}
              <div className="bg-gold-900/20 border border-gold-700/40 rounded-xl p-5">
                <h3 className="text-gold-400 font-bold text-sm uppercase tracking-wider mb-2 flex items-center gap-1">
                  <Scale size={14} /> Strategic Recommendation
                </h3>
                <p className="text-slate-200 leading-relaxed">{prediction.recommendation}</p>
              </div>

              <button onClick={predict} disabled={loading}
                className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-sm transition-colors"
              >
                <RefreshCw size={14} /> Re-run with Updated Inputs
              </button>
            </>
          ) : (
            <div className="flex items-center justify-center h-80 bg-slate-800/30 border border-slate-700 rounded-xl">
              <div className="text-center">
                <Scale className="mx-auto mb-3 text-slate-600" size={48} />
                <p className="text-slate-400">Configure inputs and run a prediction.</p>
                <p className="text-slate-500 text-sm mt-1">AI will analyze your case and project outcomes.</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default VerdictPredictor;
