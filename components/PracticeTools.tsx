import React, { useState } from 'react';
import {
  Calculator, DollarSign, Gavel, Users, Scale, TrendingUp, AlertTriangle,
  Zap, Loader2, ChevronRight, Clock, Building2, Heart, Car, FileText,
  MinusCircle, PlusCircle, CheckCircle, Target, User
} from 'lucide-react';
import {
  calculatePIDamages, estimateSentence, divideAssets,
  type PIDamagesInput, type PIDamagesResult,
  type SentencingInput, type SentencingResult,
  type AssetItem, type AssetDivisionInput, type AssetDivisionResult
} from '../services/practiceToolsService';

type Tab = 'pi' | 'sentencing' | 'family';

const STATES = [
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'DC', 'FL', 'GA', 'HI', 'ID', 'IL', 'IN', 'IA',
  'KS', 'KY', 'LA', 'ME', 'MD', 'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ', 'NM',
  'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC', 'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA',
  'WV', 'WI', 'WY',
];

const OFFENSE_CLASSES = ['Class A Felony', 'Class B Felony', 'Class C Felony', 'Class D Felony', 'Misdemeanor A', 'Misdemeanor B'];

const ASSET_CATEGORIES = [
  { value: 'real-estate', label: 'Real Estate' },
  { value: 'retirement', label: 'Retirement' },
  { value: 'investment', label: 'Investment' },
  { value: 'business', label: 'Business' },
  { value: 'vehicle', label: 'Vehicle' },
  { value: 'personal-property', label: 'Personal Property' },
  { value: 'bank-account', label: 'Bank Account' },
  { value: 'debt', label: 'Debt' },
];

const ACQUIRED_OPTIONS = [
  { value: 'pre-marriage', label: 'Pre-Marriage' },
  { value: 'during-marriage', label: 'During Marriage' },
  { value: 'post-separation', label: 'Post-Separation' },
];

const TITLED_OPTIONS = [
  { value: 'husband', label: 'Husband' },
  { value: 'wife', label: 'Wife' },
  { value: 'joint', label: 'Joint' },
  { value: 'other', label: 'Other' },
];

const SAMPLE_ASSETS: AssetItem[] = [
  { id: 'a1', name: 'Family Home', value: 450000, category: 'real-estate', isMarital: true, acquiredDuring: 'during-marriage', titledTo: 'joint' },
  { id: 'a2', name: 'Husband 401(k)', value: 180000, category: 'retirement', isMarital: true, acquiredDuring: 'during-marriage', titledTo: 'husband' },
  { id: 'a3', name: 'Wife IRA', value: 65000, category: 'retirement', isMarital: true, acquiredDuring: 'during-marriage', titledTo: 'wife' },
  { id: 'a4', name: 'Joint Savings', value: 32000, category: 'bank-account', isMarital: true, acquiredDuring: 'during-marriage', titledTo: 'joint' },
  { id: 'a5', name: 'SUV', value: 28000, category: 'vehicle', isMarital: true, acquiredDuring: 'during-marriage', titledTo: 'husband' },
  { id: 'a6', name: 'Husband Pre-Marital Condo', value: 120000, category: 'real-estate', isMarital: false, acquiredDuring: 'pre-marriage', titledTo: 'husband' },
  { id: 'a7', name: 'Credit Card Debt', value: -15000, category: 'debt', isMarital: true, acquiredDuring: 'during-marriage', titledTo: 'joint' },
];

const inputClass = 'w-full bg-slate-800 border border-slate-700 text-white rounded-lg px-3 py-2 text-sm focus:border-gold-500/50 focus:outline-none transition-colors placeholder-slate-500';
const labelClass = 'block text-sm text-slate-400 mb-1';
const cardClass = 'bg-slate-900/60 border border-slate-700/50 rounded-xl p-4';
const goldBtnClass = 'inline-flex items-center gap-2 bg-gold-500 hover:bg-gold-600 disabled:bg-slate-700 disabled:text-slate-500 text-black font-bold rounded-lg px-6 py-3 transition-colors disabled:cursor-not-allowed';

const fmtCurrency = (n: number) => {
  const abs = Math.abs(n);
  const s = abs.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 });
  return n < 0 ? `-${s}` : s;
};

const fmtMonths = (n: number) => {
  if (n >= 9999) return 'Life';
  if (n >= 12) {
    const years = Math.floor(n / 12);
    const months = n % 12;
    return months > 0 ? `${years}y ${months}mo` : `${years}y`;
  }
  return `${n} months`;
};

function TabPills({ active, onChange }: { active: Tab; onChange: (t: Tab) => void }) {
  return (
    <div className="flex gap-1 overflow-x-auto pb-1">
      {([
        { key: 'pi' as Tab, icon: Heart, label: 'Personal Injury' },
        { key: 'sentencing' as Tab, icon: Gavel, label: 'Criminal Sentencing' },
        { key: 'family' as Tab, icon: Users, label: 'Family Law' },
      ]).map(t => (
        <button
          key={t.key}
          onClick={() => onChange(t.key)}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors whitespace-nowrap ${
            active === t.key
              ? 'bg-gold-500 text-black'
              : 'bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700/70'
          }`}
        >
          <t.icon size={16} />
          {t.label}
        </button>
      ))}
    </div>
  );
}

function Spinner() {
  return <Loader2 size={18} className="animate-spin" />;
}

function SectionTitle({ icon: Icon, children }: { icon: React.ElementType; children: React.ReactNode }) {
  return (
    <h3 className="flex items-center gap-2 text-sm font-semibold text-gold-400 uppercase tracking-wider mb-3">
      <Icon size={14} />
      {children}
    </h3>
  );
}

// ─── TAB 1: Personal Injury ────────────────────────────────────────

function PiCalculator() {
  const [state, setState] = useState('');
  const [medicalBills, setMedicalBills] = useState('');
  const [futureMedical, setFutureMedical] = useState('');
  const [lostWages, setLostWages] = useState('');
  const [futureLostWages, setFutureLostWages] = useState('');
  const [propertyDamage, setPropertyDamage] = useState('');
  const [multiplier, setMultiplier] = useState(2.0);
  const [permanentImpairment, setPermanentImpairment] = useState(false);
  const [impairmentPct, setImpairmentPct] = useState(0);
  const [liabilityFactor, setLiabilityFactor] = useState(0);
  const [comparativeNegligence, setComparativeNegligence] = useState(false);
  const [policyLimits, setPolicyLimits] = useState('');
  const [settlementDemand, setSettlementDemand] = useState('');
  const [result, setResult] = useState<PIDamagesResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleCalculate = async () => {
    setError('');
    setLoading(true);
    try {
      const r = await calculatePIDamages({
        state,
        medicalBills: Number(medicalBills) || 0,
        futureMedicalEstimate: Number(futureMedical) || 0,
        lostWages: Number(lostWages) || 0,
        futureLostWages: Number(futureLostWages) || 0,
        propertyDamage: Number(propertyDamage) || 0,
        painAndSufferingMultiplier: multiplier,
        permanentImpairment,
        impairmentPercentage: impairmentPct,
        liabilityFactor,
        comparativeNegligenceState: comparativeNegligence,
        insurancePolicyLimits: Number(policyLimits) || 0,
        settlementDemand: settlementDemand ? Number(settlementDemand) : undefined,
      });
      setResult(r);
    } catch (e: any) {
      setError(e?.message || 'Calculation failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <h2 className="text-xl font-bold text-white mb-1">Personal Injury Damages Calculator</h2>
      <p className="text-sm text-slate-400 mb-5">Estimate economic and non-economic damages for settlement valuation</p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">
        <div className="space-y-3">
          <div>
            <label className={labelClass}>State</label>
            <select value={state} onChange={e => setState(e.target.value)} className={inputClass}>
              <option value="">Select state...</option>
              {STATES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className={labelClass}>Medical Bills ($)</label>
            <input type="number" value={medicalBills} onChange={e => setMedicalBills(e.target.value)} placeholder="0" className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Future Medical Estimate ($)</label>
            <input type="number" value={futureMedical} onChange={e => setFutureMedical(e.target.value)} placeholder="0" className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Lost Wages ($)</label>
            <input type="number" value={lostWages} onChange={e => setLostWages(e.target.value)} placeholder="0" className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Future Lost Wages ($)</label>
            <input type="number" value={futureLostWages} onChange={e => setFutureLostWages(e.target.value)} placeholder="0" className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Property Damage ($)</label>
            <input type="number" value={propertyDamage} onChange={e => setPropertyDamage(e.target.value)} placeholder="0" className={inputClass} />
          </div>
        </div>

        <div className="space-y-3">
          <div>
            <label className={labelClass}>Pain & Suffering Multiplier ({multiplier.toFixed(1)})</label>
            <input type="range" min="1.5" max="5.0" step="0.1" value={multiplier} onChange={e => setMultiplier(Number(e.target.value))} className="w-full accent-gold-500" />
            <div className="flex justify-between text-xs text-slate-500 mt-0.5"><span>1.5x</span><span>5.0x</span></div>
          </div>
          <div>
            <label className="flex items-center gap-2 text-sm text-slate-400 mb-1 cursor-pointer">
              <input type="checkbox" checked={permanentImpairment} onChange={e => setPermanentImpairment(e.target.checked)} className="accent-gold-500" />
              Permanent Impairment
            </label>
            {permanentImpairment && (
              <div className="mt-2">
                <label className={labelClass}>Impairment %: {impairmentPct}%</label>
                <input type="range" min="0" max="100" step="1" value={impairmentPct} onChange={e => setImpairmentPct(Number(e.target.value))} className="w-full accent-gold-500" />
              </div>
            )}
          </div>
          <div>
            <label className={labelClass}>Plaintiff Liability %: {liabilityFactor}%</label>
            <input type="range" min="0" max="100" step="1" value={liabilityFactor} onChange={e => setLiabilityFactor(Number(e.target.value))} className="w-full accent-gold-500" />
          </div>
          <div>
            <label className="flex items-center gap-2 text-sm text-slate-400 mb-1 cursor-pointer">
              <input type="checkbox" checked={comparativeNegligence} onChange={e => setComparativeNegligence(e.target.checked)} className="accent-gold-500" />
              Comparative Negligence State
            </label>
          </div>
          <div>
            <label className={labelClass}>Insurance Policy Limits ($)</label>
            <input type="number" value={policyLimits} onChange={e => setPolicyLimits(e.target.value)} placeholder="0" className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Settlement Demand ($, optional)</label>
            <input type="number" value={settlementDemand} onChange={e => setSettlementDemand(e.target.value)} placeholder="0" className={inputClass} />
          </div>
        </div>
      </div>

      {error && <div className="text-red-400 text-sm mb-3 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">{error}</div>}

      <button onClick={handleCalculate} disabled={loading} className={goldBtnClass}>
        {loading ? <Spinner /> : <Calculator size={18} />}
        {loading ? 'Calculating...' : 'Calculate Damages'}
      </button>

      {result && (
        <div className="mt-6 space-y-4">
          {/* Economic Damages */}
          <div className={cardClass}>
            <SectionTitle icon={DollarSign}>Economic Damages</SectionTitle>
            <div className="space-y-1.5 text-sm">
              {[
                ['Medical Bills', result.economicDamages.medicalBills],
                ['Future Medical', result.economicDamages.futureMedical],
                ['Lost Wages', result.economicDamages.lostWages],
                ['Future Lost Wages', result.economicDamages.futureLostWages],
                ['Property Damage', result.economicDamages.propertyDamage],
              ].map(([label, val]) => (
                <div key={label as string} className="flex justify-between text-slate-300">
                  <span>{label}</span>
                  <span className="text-white font-mono">{fmtCurrency(val as number)}</span>
                </div>
              ))}
              <div className="flex justify-between text-gold-400 font-semibold border-t border-slate-700/50 pt-1.5 mt-1.5">
                <span>Total Economic</span>
                <span className="font-mono">{fmtCurrency(result.economicDamages.totalEconomic)}</span>
              </div>
            </div>
          </div>

          {/* Non-Economic Damages */}
          <div className={cardClass}>
            <SectionTitle icon={Heart}>Non-Economic Damages</SectionTitle>
            <div className="space-y-1.5 text-sm">
              {[
                ['Pain & Suffering', result.nonEconomicDamages.painAndSuffering],
                ['Permanent Impairment', result.nonEconomicDamages.permanentImpairment],
                ['Loss of Enjoyment', result.nonEconomicDamages.lossOfEnjoyment],
              ].map(([label, val]) => (
                <div key={label as string} className="flex justify-between text-slate-300">
                  <span>{label}</span>
                  <span className="text-white font-mono">{fmtCurrency(val as number)}</span>
                </div>
              ))}
              <div className="flex justify-between text-gold-400 font-semibold border-t border-slate-700/50 pt-1.5 mt-1.5">
                <span>Total Non-Economic</span>
                <span className="font-mono">{fmtCurrency(result.nonEconomicDamages.totalNonEconomic)}</span>
              </div>
            </div>
          </div>

          {/* Summary */}
          <div className={cardClass}>
            <SectionTitle icon={Scale}>Summary</SectionTitle>
            <div className="space-y-1.5 text-sm">
              {[
                ['Gross Damages', result.grossDamages],
                ['Liability Reduction', result.liabilityReduction],
                ['Net Damages', result.netDamages],
                ['Insurance Coverage', result.insuranceCoverage],
                ['Realistic Recovery', result.realisticRecovery],
              ].map(([label, val]) => (
                <div key={label as string} className="flex justify-between text-slate-300">
                  <span>{label}</span>
                  <span className={`font-mono ${label === 'Realistic Recovery' ? 'text-gold-400 font-bold' : 'text-white'}`}>
                    {fmtCurrency(val as number)}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Settlement Range */}
          <div className={cardClass}>
            <SectionTitle icon={TrendingUp}>Settlement Range</SectionTitle>
            <div className="space-y-2.5">
              {[
                { label: 'Low', value: result.settlementRange.low, w: '70%', color: 'bg-yellow-600' },
                { label: 'Mid', value: result.settlementRange.mid, w: '85%', color: 'bg-gold-500' },
                { label: 'High', value: result.settlementRange.high, w: '100%', color: 'bg-gold-400' },
              ].map((b) => (
                <div key={b.label}>
                  <div className="flex justify-between text-xs text-slate-400 mb-1">
                    <span>{b.label}</span>
                    <span className="text-white font-mono">{fmtCurrency(b.value)}</span>
                  </div>
                  <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${b.color}`} style={{ width: `${Math.min(100, (b.value / (result.settlementRange.high || 1)) * 100)}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* AI Analysis */}
          <div className="bg-slate-900/60 border border-gold-500/30 rounded-xl p-4">
            <SectionTitle icon={Zap}>AI Analysis</SectionTitle>
            <p className="text-sm text-slate-300 italic leading-relaxed">{result.analysis}</p>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── TAB 2: Criminal Sentencing ────────────────────────────────────

function SentencingCalculator() {
  const [state, setState] = useState('');
  const [offense, setOffense] = useState('');
  const [offenseClass, setOffenseClass] = useState('');
  const [priorFelonies, setPriorFelonies] = useState(0);
  const [priorMisd, setPriorMisd] = useState(0);
  const [weaponEnhancement, setWeaponEnhancement] = useState(false);
  const [injuryEnhancement, setInjuryEnhancement] = useState(false);
  const [drugEnhancement, setDrugEnhancement] = useState(false);
  const [acceptance, setAcceptance] = useState(false);
  const [pleaAgreement, setPleaAgreement] = useState(false);
  const [cooperation, setCooperation] = useState(false);
  const [guidelinesRange, setGuidelinesRange] = useState('');
  const [result, setResult] = useState<SentencingResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleEstimate = async () => {
    setError('');
    setLoading(true);
    try {
      const r = await estimateSentence({
        state,
        offense,
        offenseClass,
        priorFelonies,
        priorMisdemeanors: priorMisd,
        weaponEnhancement,
        injuryEnhancement,
        drugQuantityEnhancement: drugEnhancement,
        acceptanceOfResponsibility: acceptance,
        pleaAgreement,
        cooperationWithGovernment: cooperation,
        guidelinesRange: guidelinesRange || undefined,
      });
      setResult(r);
    } catch (e: any) {
      setError(e?.message || 'Estimation failed');
    } finally {
      setLoading(false);
    }
  };

  const sentenceColor = (months: number) => {
    if (months < 12) return 'text-green-400';
    if (months <= 60) return 'text-amber-400';
    return 'text-red-400';
  };

  return (
    <div>
      <h2 className="text-xl font-bold text-white mb-1">Federal & State Sentencing Estimator</h2>
      <p className="text-sm text-slate-400 mb-5">Estimate sentence ranges based on offense class, enhancements, and mitigating factors</p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">
        <div className="space-y-3">
          <div>
            <label className={labelClass}>State</label>
            <select value={state} onChange={e => setState(e.target.value)} className={inputClass}>
              <option value="">Select state...</option>
              {STATES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className={labelClass}>Offense</label>
            <input type="text" value={offense} onChange={e => setOffense(e.target.value)} placeholder="e.g. Aggravated Assault" className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Offense Class</label>
            <select value={offenseClass} onChange={e => setOffenseClass(e.target.value)} className={inputClass}>
              <option value="">Select class...</option>
              {OFFENSE_CLASSES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className={labelClass}>Prior Felonies ({priorFelonies})</label>
            <input type="range" min="0" max="10" step="1" value={priorFelonies} onChange={e => setPriorFelonies(Number(e.target.value))} className="w-full accent-gold-500" />
          </div>
          <div>
            <label className={labelClass}>Prior Misdemeanors ({priorMisd})</label>
            <input type="range" min="0" max="20" step="1" value={priorMisd} onChange={e => setPriorMisd(Number(e.target.value))} className="w-full accent-gold-500" />
          </div>
        </div>
        <div className="space-y-3">
          {([
            { state: weaponEnhancement, set: setWeaponEnhancement, label: 'Weapon Enhancement' },
            { state: injuryEnhancement, set: setInjuryEnhancement, label: 'Injury Enhancement' },
            { state: drugEnhancement, set: setDrugEnhancement, label: 'Drug Quantity Enhancement' },
            { state: acceptance, set: setAcceptance, label: 'Acceptance of Responsibility' },
            { state: pleaAgreement, set: setPleaAgreement, label: 'Plea Agreement' },
            { state: cooperation, set: setCooperation, label: 'Cooperation with Government' },
          ]).map(({ state: checked, set, label }) => (
            <label key={label} className="flex items-center gap-2 text-sm text-slate-400 cursor-pointer">
              <input type="checkbox" checked={checked} onChange={e => set(e.target.checked)} className="accent-gold-500" />
              {label}
            </label>
          ))}
          <div>
            <label className={labelClass}>Guidelines Range (optional)</label>
            <input type="text" value={guidelinesRange} onChange={e => setGuidelinesRange(e.target.value)} placeholder="e.g. 24-30 months" className={inputClass} />
          </div>
        </div>
      </div>

      {error && <div className="text-red-400 text-sm mb-3 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">{error}</div>}

      <button onClick={handleEstimate} disabled={loading} className={goldBtnClass}>
        {loading ? <Spinner /> : <Gavel size={18} />}
        {loading ? 'Estimating...' : 'Estimate Sentence'}
      </button>

      {result && (
        <div className="mt-6 space-y-4">
          {/* Statutory & Guidelines */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className={cardClass}>
              <SectionTitle icon={Scale}>Statutory Range</SectionTitle>
              <div className="flex items-baseline gap-2 text-2xl font-bold text-white">
                <span>{fmtMonths(result.statutoryMinimum)}</span>
                <span className="text-slate-500 text-lg">—</span>
                <span>{fmtMonths(result.statutoryMaximum)}</span>
              </div>
            </div>
            <div className={cardClass}>
              <SectionTitle icon={Target}>Guidelines Range</SectionTitle>
              <div className="flex items-baseline gap-2 text-2xl font-bold text-white">
                <span>{fmtMonths(result.guidelinesRange.low)}</span>
                <span className="text-slate-500 text-lg">—</span>
                <span>{fmtMonths(result.guidelinesRange.high)}</span>
              </div>
              <div className="mt-2 h-2 bg-slate-700 rounded-full overflow-hidden">
                <div className="h-full bg-gold-500 rounded-full" style={{ width: `${Math.min(100, (result.guidelinesRange.high / (result.statutoryMaximum || 1)) * 100)}%` }} />
              </div>
            </div>
          </div>

          {/* Enhancements */}
          {result.enhancements.length > 0 && (
            <div className={cardClass}>
              <SectionTitle icon={AlertTriangle}>Enhancements</SectionTitle>
              <div className="space-y-1">
                {result.enhancements.map((enh, i) => (
                  <div key={i} className="flex justify-between text-sm text-slate-300 py-1 border-b border-slate-800 last:border-b-0">
                    <span>{enh.label}</span>
                    <span className="text-red-400 font-mono">+{fmtMonths(enh.months)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Reductions */}
          {result.reductions.length > 0 && (
            <div className={cardClass}>
              <SectionTitle icon={ChevronRight}>Reductions</SectionTitle>
              <div className="space-y-1">
                {result.reductions.map((red, i) => (
                  <div key={i} className="flex justify-between text-sm text-slate-300 py-1 border-b border-slate-800 last:border-b-0">
                    <span>{red.label}</span>
                    <span className="text-green-400 font-mono">-{fmtMonths(red.months)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Estimated Sentence */}
          <div className={cardClass}>
            <SectionTitle icon={Gavel}>Estimated Sentence</SectionTitle>
            <div className="grid grid-cols-3 gap-3 text-center">
              {[
                { label: 'Low', value: result.estimatedSentence.low },
                { label: 'Mid', value: result.estimatedSentence.mid },
                { label: 'High', value: result.estimatedSentence.high },
              ].map(({ label, value }) => (
                <div key={label}>
                  <div className="text-xs text-slate-500 mb-1">{label}</div>
                  <div className={`text-lg font-bold ${sentenceColor(value)}`}>{fmtMonths(value)}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Probation & Alternatives */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className={cardClass}>
              <SectionTitle icon={CheckCircle}>Probation Eligibility</SectionTitle>
              <span className={`inline-block px-3 py-1 rounded-full text-sm font-bold ${result.probationEligibility ? 'bg-green-500/20 text-green-400 border border-green-500/30' : 'bg-red-500/20 text-red-400 border border-red-500/30'}`}>
                {result.probationEligibility ? 'Yes' : 'No'}
              </span>
            </div>
            {result.alternativePrograms.length > 0 && (
              <div className={cardClass}>
                <SectionTitle icon={Building2}>Alternative Programs</SectionTitle>
                <ul className="space-y-1 text-sm text-slate-300 list-disc list-inside">
                  {result.alternativePrograms.map((p, i) => (
                    <li key={i}>{p}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* AI Analysis */}
          <div className="bg-slate-900/60 border border-gold-500/30 rounded-xl p-4">
            <SectionTitle icon={Zap}>AI Analysis</SectionTitle>
            <p className="text-sm text-slate-300 italic leading-relaxed">{result.analysis}</p>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── TAB 3: Family Law ─────────────────────────────────────────────

function FamilyCalculator() {
  const [state, setState] = useState('');
  const [marriageDuration, setMarriageDuration] = useState(5);
  const [husbandIncome, setHusbandIncome] = useState('');
  const [wifeIncome, setWifeIncome] = useState('');
  const [minorChildren, setMinorChildren] = useState(0);
  const [spousalSupportReq, setSpousalSupportReq] = useState(false);
  const [faultGrounds, setFaultGrounds] = useState(false);
  const [assets, setAssets] = useState<AssetItem[]>([
    { id: '', name: '', value: 0, category: 'real-estate', isMarital: true, acquiredDuring: 'during-marriage', titledTo: 'joint' },
    { id: '', name: '', value: 0, category: 'bank-account', isMarital: true, acquiredDuring: 'during-marriage', titledTo: 'joint' },
    { id: '', name: '', value: 0, category: 'vehicle', isMarital: true, acquiredDuring: 'during-marriage', titledTo: 'joint' },
  ]);
  const [result, setResult] = useState<AssetDivisionResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const addAsset = () => {
    setAssets([...assets, { id: `r${Date.now()}`, name: '', value: 0, category: 'real-estate', isMarital: true, acquiredDuring: 'during-marriage', titledTo: 'joint' }]);
  };

  const removeAsset = (idx: number) => {
    setAssets(assets.filter((_, i) => i !== idx));
  };

  const updateAsset = (idx: number, partial: Partial<AssetItem>) => {
    setAssets(assets.map((a, i) => (i === idx ? { ...a, ...partial, id: a.id || `r${Date.now()}` } : a)));
  };

  const loadSampleCase = () => {
    setAssets(SAMPLE_ASSETS);
    setMarriageDuration(10);
    setHusbandIncome('85000');
    setWifeIncome('45000');
    setMinorChildren(2);
    setSpousalSupportReq(true);
  };

  const handleDivide = async () => {
    setError('');
    const validAssets = assets.filter(a => a.name.trim()).map(a => ({ ...a, id: a.id || `r${Date.now()}` }));
    if (validAssets.length === 0) {
      setError('Add at least one asset with a name.');
      return;
    }
    setLoading(true);
    try {
      const r = await divideAssets({
        state,
        marriageDurationYears: marriageDuration,
        husbandIncome: Number(husbandIncome) || 0,
        wifeIncome: Number(wifeIncome) || 0,
        minorChildren,
        assets: validAssets,
        spouseSupportRequested: spousalSupportReq,
        faultGrounds,
      });
      setResult(r);
    } catch (e: any) {
      setError(e?.message || 'Division failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <h2 className="text-xl font-bold text-white mb-1">Marital Asset Division & Spousal Support</h2>
      <p className="text-sm text-slate-400 mb-5">Divide assets under community property or equitable distribution</p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">
        <div className="space-y-3">
          <div>
            <label className={labelClass}>State</label>
            <select value={state} onChange={e => setState(e.target.value)} className={inputClass}>
              <option value="">Select state...</option>
              {STATES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className={labelClass}>Marriage Duration ({marriageDuration} years)</label>
            <input type="range" min="1" max="40" step="1" value={marriageDuration} onChange={e => setMarriageDuration(Number(e.target.value))} className="w-full accent-gold-500" />
          </div>
          <div>
            <label className={labelClass}>Husband Annual Income ($)</label>
            <input type="number" value={husbandIncome} onChange={e => setHusbandIncome(e.target.value)} placeholder="0" className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Wife Annual Income ($)</label>
            <input type="number" value={wifeIncome} onChange={e => setWifeIncome(e.target.value)} placeholder="0" className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Minor Children ({minorChildren})</label>
            <input type="range" min="0" max="10" step="1" value={minorChildren} onChange={e => setMinorChildren(Number(e.target.value))} className="w-full accent-gold-500" />
          </div>
        </div>
        <div className="space-y-3">
          <label className="flex items-center gap-2 text-sm text-slate-400 cursor-pointer">
            <input type="checkbox" checked={spousalSupportReq} onChange={e => setSpousalSupportReq(e.target.checked)} className="accent-gold-500" />
            Spousal Support Requested
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-400 cursor-pointer">
            <input type="checkbox" checked={faultGrounds} onChange={e => setFaultGrounds(e.target.checked)} className="accent-gold-500" />
            At-Fault Grounds
          </label>
          <button onClick={loadSampleCase} className="inline-flex items-center gap-2 bg-slate-800 border border-slate-700 text-slate-300 hover:text-white rounded-lg px-4 py-2 text-sm transition-colors">
            <FileText size={14} />
            Load Sample Case
          </button>
        </div>
      </div>

      {/* Assets Table */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold text-slate-300">Assets</h3>
          <button onClick={addAsset} className="inline-flex items-center gap-1 bg-slate-800 border border-slate-700 text-gold-400 hover:text-gold-300 rounded-lg px-3 py-1.5 text-xs transition-colors">
            <PlusCircle size={14} />
            Add Asset
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-500 uppercase tracking-wider border-b border-slate-800">
                <th className="py-2 pr-2">Name</th>
                <th className="py-2 pr-2">Value ($)</th>
                <th className="py-2 pr-2">Category</th>
                <th className="py-2 pr-2">Marital?</th>
                <th className="py-2 pr-2">Acquired</th>
                <th className="py-2 pr-2">Titled To</th>
                <th className="py-2 w-10" />
              </tr>
            </thead>
            <tbody>
              {assets.map((asset, idx) => (
                <tr key={idx} className="border-b border-slate-800/50">
                  <td className="py-1.5 pr-2">
                    <input
                      type="text"
                      value={asset.name}
                      onChange={e => updateAsset(idx, { name: e.target.value })}
                      placeholder="Asset name"
                      className="bg-slate-800 border border-slate-700 text-white rounded px-2 py-1 text-xs w-full focus:border-gold-500/50 focus:outline-none"
                    />
                  </td>
                  <td className="py-1.5 pr-2">
                    <input
                      type="number"
                      value={asset.value || ''}
                      onChange={e => updateAsset(idx, { value: Number(e.target.value) })}
                      placeholder="0"
                      className="bg-slate-800 border border-slate-700 text-white rounded px-2 py-1 text-xs w-24 focus:border-gold-500/50 focus:outline-none"
                    />
                  </td>
                  <td className="py-1.5 pr-2">
                    <select
                      value={asset.category}
                      onChange={e => updateAsset(idx, { category: e.target.value as AssetItem['category'] })}
                      className="bg-slate-800 border border-slate-700 text-white rounded px-2 py-1 text-xs focus:border-gold-500/50 focus:outline-none"
                    >
                      {ASSET_CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                    </select>
                  </td>
                  <td className="py-1.5 pr-2">
                    <select
                      value={asset.isMarital ? 'yes' : 'no'}
                      onChange={e => updateAsset(idx, { isMarital: e.target.value === 'yes' })}
                      className="bg-slate-800 border border-slate-700 text-white rounded px-2 py-1 text-xs focus:border-gold-500/50 focus:outline-none"
                    >
                      <option value="yes">Yes</option>
                      <option value="no">No</option>
                    </select>
                  </td>
                  <td className="py-1.5 pr-2">
                    <select
                      value={asset.acquiredDuring}
                      onChange={e => updateAsset(idx, { acquiredDuring: e.target.value as AssetItem['acquiredDuring'] })}
                      className="bg-slate-800 border border-slate-700 text-white rounded px-2 py-1 text-xs focus:border-gold-500/50 focus:outline-none"
                    >
                      {ACQUIRED_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </td>
                  <td className="py-1.5 pr-2">
                    <select
                      value={asset.titledTo}
                      onChange={e => updateAsset(idx, { titledTo: e.target.value as AssetItem['titledTo'] })}
                      className="bg-slate-800 border border-slate-700 text-white rounded px-2 py-1 text-xs focus:border-gold-500/50 focus:outline-none"
                    >
                      {TITLED_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </td>
                  <td className="py-1.5">
                    <button onClick={() => removeAsset(idx)} className="text-slate-500 hover:text-red-400 transition-colors">
                      <MinusCircle size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {error && <div className="text-red-400 text-sm mb-3 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">{error}</div>}

      <button onClick={handleDivide} disabled={loading} className={goldBtnClass}>
        {loading ? <Spinner /> : <Scale size={18} />}
        {loading ? 'Dividing...' : 'Calculate Division'}
      </button>

      {result && (
        <div className="mt-6 space-y-4">
          {/* Marital Estate Total */}
          <div className={cardClass}>
            <SectionTitle icon={Building2}>Marital Estate Total</SectionTitle>
            <div className="text-3xl font-bold text-gold-400 font-mono">{fmtCurrency(result.totalMaritalEstate)}</div>
          </div>

          {/* Distribution Ratio */}
          <div className={cardClass}>
            <SectionTitle icon={Users}>Distribution Ratio</SectionTitle>
            <div className="text-lg font-bold text-white mb-3">{result.distributionRatio.replace('/', '% Husband / ')}% Wife</div>
            <div className="flex h-3 rounded-full overflow-hidden">
              <div className="bg-gold-500 h-full" style={{ width: `${parseFloat(result.distributionRatio.split('/')[0])}%` }} />
              <div className="bg-blue-400 h-full" style={{ width: `${parseFloat(result.distributionRatio.split('/')[1])}%` }} />
            </div>
            <div className="flex justify-between text-xs text-slate-500 mt-1.5">
              <span className="text-gold-400">Husband {result.distributionRatio.split('/')[0]}%</span>
              <span className="text-blue-400">Wife {result.distributionRatio.split('/')[1]}%</span>
            </div>
          </div>

          {/* Asset Allocation */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className={cardClass}>
              <SectionTitle icon={User}>To Husband</SectionTitle>
              <div className="space-y-1.5">
                {result.assetAllocation.toHusband.map((a, i) => (
                  <div key={i} className="flex justify-between text-sm text-slate-300 py-1 border-b border-slate-800 last:border-b-0">
                    <span className="truncate mr-2">{a.name}</span>
                    <span className="text-white font-mono whitespace-nowrap">{fmtCurrency(a.value)}</span>
                  </div>
                ))}
                {result.assetAllocation.toHusband.length === 0 && (
                  <div className="text-sm text-slate-500 italic">No assets allocated</div>
                )}
                <div className="flex justify-between text-sm text-gold-400 font-semibold border-t border-slate-700/50 pt-1.5 mt-1.5">
                  <span>Total (incl. separate)</span>
                  <span className="font-mono">{fmtCurrency(result.assetAllocation.toHusband.reduce((s, a) => s + a.value, 0))}</span>
                </div>
              </div>
            </div>
            <div className={cardClass}>
              <SectionTitle icon={User}>To Wife</SectionTitle>
              <div className="space-y-1.5">
                {result.assetAllocation.toWife.map((a, i) => (
                  <div key={i} className="flex justify-between text-sm text-slate-300 py-1 border-b border-slate-800 last:border-b-0">
                    <span className="truncate mr-2">{a.name}</span>
                    <span className="text-white font-mono whitespace-nowrap">{fmtCurrency(a.value)}</span>
                  </div>
                ))}
                {result.assetAllocation.toWife.length === 0 && (
                  <div className="text-sm text-slate-500 italic">No assets allocated</div>
                )}
                <div className="flex justify-between text-sm text-gold-400 font-semibold border-t border-slate-700/50 pt-1.5 mt-1.5">
                  <span>Total (incl. separate)</span>
                  <span className="font-mono">{fmtCurrency(result.assetAllocation.toWife.reduce((s, a) => s + a.value, 0))}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Separate Property */}
          <div className={cardClass}>
            <SectionTitle icon={FileText}>Separate Property</SectionTitle>
            <div className="flex justify-between text-sm">
              <span className="text-slate-400">Husband Separate</span>
              <span className="text-white font-mono">{fmtCurrency(result.husbandSeparateProperty)}</span>
            </div>
            <div className="flex justify-between text-sm mt-1">
              <span className="text-slate-400">Wife Separate</span>
              <span className="text-white font-mono">{fmtCurrency(result.wifeSeparateProperty)}</span>
            </div>
          </div>

          {/* Equalization Payment */}
          {result.equalizationPayment > 0 && (
            <div className={cardClass}>
              <SectionTitle icon={DollarSign}>Equalization Payment</SectionTitle>
              <div className="text-sm text-slate-300">
                <span className="text-gold-400 font-bold font-mono">{fmtCurrency(result.equalizationPayment)}</span>
                {' '}from Husband to Wife to balance the marital property allocation.
              </div>
            </div>
          )}

          {/* Spousal Support */}
          <div className={cardClass}>
            <SectionTitle icon={Clock}>Spousal Support</SectionTitle>
            {result.spouseSupport.recommended ? (
              <div className="space-y-1.5 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-400">Monthly Amount</span>
                  <span className="text-gold-400 font-bold font-mono">{fmtCurrency(result.spouseSupport.monthlyAmount)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Duration</span>
                  <span className="text-white font-mono">{result.spouseSupport.durationMonths} months</span>
                </div>
                <div className="text-xs text-slate-500 mt-1 italic">{result.spouseSupport.basis}</div>
              </div>
            ) : (
              <div className="text-sm text-slate-500 italic">Spousal support not recommended based on current factors.</div>
            )}
          </div>

          {/* AI Analysis */}
          <div className="bg-slate-900/60 border border-gold-500/30 rounded-xl p-4">
            <SectionTitle icon={Zap}>AI Analysis</SectionTitle>
            <p className="text-sm text-slate-300 italic leading-relaxed">{result.analysis}</p>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────────

const PracticeTools: React.FC = () => {
  const [tab, setTab] = useState<Tab>('pi');

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <div className="h-10 w-10 bg-gold-500/15 rounded-xl flex items-center justify-center">
          <Calculator className="text-gold-500" size={22} />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white">Practice Tools</h1>
          <p className="text-sm text-slate-400">Legal calculators for case valuation, sentencing, and asset division</p>
        </div>
      </div>

      <TabPills active={tab} onChange={setTab} />
      <div className="mt-5 min-h-0">
        {tab === 'pi' && <PiCalculator />}
        {tab === 'sentencing' && <SentencingCalculator />}
        {tab === 'family' && <FamilyCalculator />}
      </div>
    </div>
  );
};

export default PracticeTools;
