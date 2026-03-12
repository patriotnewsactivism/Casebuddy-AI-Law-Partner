import React, { useState, useContext, useEffect } from 'react';
import { AppContext } from '../App';
import { analyzeJuror } from '../services/geminiService';
import { UserCheck, Loader, Trash2, AlertTriangle, CheckCircle, XCircle, HelpCircle, ChevronDown, ChevronUp, Copy } from 'lucide-react';
import { toast } from 'react-toastify';

interface JurorProfile {
  id: string;
  number: string;
  name: string;
  occupation: string;
  age: string;
  education: string;
  priorJuryService: string;
  notes: string;
  biasScore: number;
  biasFactors: string[];
  favorableFactors: string[];
  recommendedQuestions: string[];
  recommendation: 'accept' | 'challenge-for-cause' | 'peremptory-strike';
  reasoning: string;
  timestamp: number;
}

const RecommendationBadge = ({ rec }: { rec: JurorProfile['recommendation'] }) => {
  if (rec === 'accept') return (
    <span className="flex items-center gap-1 px-3 py-1 bg-green-900/40 border border-green-600/50 text-green-400 text-xs font-bold rounded-full">
      <CheckCircle size={12} /> ACCEPT
    </span>
  );
  if (rec === 'challenge-for-cause') return (
    <span className="flex items-center gap-1 px-3 py-1 bg-yellow-900/40 border border-yellow-600/50 text-yellow-400 text-xs font-bold rounded-full">
      <AlertTriangle size={12} /> CHALLENGE FOR CAUSE
    </span>
  );
  return (
    <span className="flex items-center gap-1 px-3 py-1 bg-red-900/40 border border-red-600/50 text-red-400 text-xs font-bold rounded-full">
      <XCircle size={12} /> PEREMPTORY STRIKE
    </span>
  );
};

const biasColor = (score: number) => score <= 33 ? 'text-green-400' : score <= 66 ? 'text-yellow-400' : 'text-red-400';
const biasBg = (score: number) => score <= 33 ? 'bg-green-500' : score <= 66 ? 'bg-yellow-500' : 'bg-red-500';

const JuryAnalyzer = () => {
  const { activeCase } = useContext(AppContext);
  const [jurors, setJurors] = useState<JurorProfile[]>([]);
  const [selected, setSelected] = useState<JurorProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(true);
  const [expandedSection, setExpandedSection] = useState<string | null>('questions');
  const [caseType, setCaseType] = useState('');

  const [form, setForm] = useState({
    number: '', name: '', occupation: '', age: '', education: '', priorJuryService: '', notes: ''
  });
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  useEffect(() => {
    if (activeCase) {
      try {
        const saved = localStorage.getItem(`jurors_${activeCase.id}`);
        setJurors(saved ? JSON.parse(saved) : []);
      } catch { setJurors([]); }
    }
  }, [activeCase]);

  const save = (updated: JurorProfile[]) => {
    if (!activeCase) return;
    localStorage.setItem(`jurors_${activeCase.id}`, JSON.stringify(updated));
    setJurors(updated);
  };

  const analyze = async () => {
    if (!activeCase) { toast.error('Select an active case first.'); return; }
    if (!form.occupation && !form.name) { toast.error('Enter at least a name or occupation.'); return; }
    setLoading(true);
    try {
      const jurorInfo = [
        form.number && `Juror #${form.number}`,
        form.name && `Name: ${form.name}`,
        form.age && `Age: ${form.age}`,
        form.occupation && `Occupation: ${form.occupation}`,
        form.education && `Education: ${form.education}`,
        form.priorJuryService && `Prior jury service: ${form.priorJuryService}`,
        form.notes && `Additional notes: ${form.notes}`,
      ].filter(Boolean).join('\n');

      const result = await analyzeJuror(jurorInfo, activeCase.summary || activeCase.title, caseType || activeCase.title);
      const profile: JurorProfile = { id: Date.now().toString(), ...form, ...result, timestamp: Date.now() };
      const updated = [profile, ...jurors];
      save(updated);
      setSelected(profile);
      setShowForm(false);
      toast.success('Juror analyzed!');
      setForm({ number: '', name: '', occupation: '', age: '', education: '', priorJuryService: '', notes: '' });
    } catch (e) {
      toast.error('Analysis failed. Please try again.');
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const copyQuestions = (juror: JurorProfile) => {
    navigator.clipboard.writeText(juror.recommendedQuestions.join('\n'));
    toast.success('Questions copied!');
  };

  if (!activeCase) {
    return (
      <div className="flex items-center justify-center min-h-64">
        <div className="text-center">
          <UserCheck className="mx-auto mb-3 text-slate-500" size={48} />
          <p className="text-white font-semibold">No Active Case</p>
          <p className="text-slate-400 text-sm">Select a case to use the Jury Analyzer.</p>
        </div>
      </div>
    );
  }

  const accepts = jurors.filter(j => j.recommendation === 'accept').length;
  const challenges = jurors.filter(j => j.recommendation === 'challenge-for-cause').length;
  const strikes = jurors.filter(j => j.recommendation === 'peremptory-strike').length;

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <UserCheck className="text-gold-500" size={32} />
        <div>
          <h1 className="text-3xl font-bold text-white font-serif">Jury Analyzer</h1>
          <p className="text-slate-400 text-sm">Voir dire strategy & juror profiling for {activeCase.title}</p>
        </div>
      </div>

      {/* Stats */}
      {jurors.length > 0 && (
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-green-900/20 border border-green-700/30 rounded-xl p-4 text-center">
            <p className="text-3xl font-black text-green-400">{accepts}</p>
            <p className="text-green-300 text-sm font-semibold">Accept</p>
          </div>
          <div className="bg-yellow-900/20 border border-yellow-700/30 rounded-xl p-4 text-center">
            <p className="text-3xl font-black text-yellow-400">{challenges}</p>
            <p className="text-yellow-300 text-sm font-semibold">Challenge</p>
          </div>
          <div className="bg-red-900/20 border border-red-700/30 rounded-xl p-4 text-center">
            <p className="text-3xl font-black text-red-400">{strikes}</p>
            <p className="text-red-300 text-sm font-semibold">Strike</p>
          </div>
        </div>
      )}

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Form + Juror List */}
        <div className="space-y-4">
          <div className="flex gap-2">
            <button onClick={() => setShowForm(true)}
              className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors ${showForm ? 'bg-gold-500 text-slate-900' : 'bg-slate-700 text-slate-300'}`}
            >New Juror</button>
            {jurors.length > 0 && (
              <button onClick={() => setShowForm(false)}
                className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors ${!showForm ? 'bg-gold-500 text-slate-900' : 'bg-slate-700 text-slate-300'}`}
              >Panel ({jurors.length})</button>
            )}
          </div>

          {showForm ? (
            <div className="bg-slate-800/60 border border-slate-700 rounded-xl p-5 space-y-3">
              <h2 className="text-lg font-bold text-white">Profile Juror</h2>

              <div>
                <label className="text-xs text-slate-400 block mb-1">Case Type</label>
                <input value={caseType} onChange={e => setCaseType(e.target.value)}
                  placeholder="e.g. Criminal Defense, Civil Tort"
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-gold-500 text-sm"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Juror #</label>
                  <input value={form.number} onChange={e => set('number', e.target.value)}
                    placeholder="1"
                    className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-gold-500 text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Age</label>
                  <input value={form.age} onChange={e => set('age', e.target.value)}
                    placeholder="45"
                    className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-gold-500 text-sm"
                  />
                </div>
              </div>

              {[
                { key: 'name', label: 'Name', placeholder: 'Optional' },
                { key: 'occupation', label: 'Occupation', placeholder: 'e.g. Nurse, Engineer, Retired Police' },
                { key: 'education', label: 'Education', placeholder: 'e.g. Bachelor\'s in Business' },
                { key: 'priorJuryService', label: 'Prior Jury Service', placeholder: 'e.g. Yes — criminal case, found guilty' },
              ].map(({ key, label, placeholder }) => (
                <div key={key}>
                  <label className="text-xs text-slate-400 block mb-1">{label}</label>
                  <input value={form[key as keyof typeof form]} onChange={e => set(key, e.target.value)}
                    placeholder={placeholder}
                    className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-gold-500 text-sm"
                  />
                </div>
              ))}

              <div>
                <label className="text-xs text-slate-400 block mb-1">Additional Notes / Responses</label>
                <textarea value={form.notes} onChange={e => set('notes', e.target.value)}
                  placeholder="Any statements made, body language observations, connections to parties..."
                  rows={3}
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-gold-500 text-sm resize-none"
                />
              </div>

              <button onClick={analyze} disabled={loading}
                className="w-full flex items-center justify-center gap-2 bg-gold-500 hover:bg-gold-600 disabled:bg-slate-700 disabled:text-slate-500 text-slate-900 font-bold py-3 rounded-lg transition-colors"
              >
                {loading ? <><Loader className="animate-spin" size={18} /> Analyzing...</> : <><UserCheck size={18} /> Analyze Juror</>}
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              {jurors.map(j => (
                <div key={j.id} onClick={() => setSelected(j)}
                  className={`cursor-pointer bg-slate-800/60 border rounded-xl p-4 transition-all ${selected?.id === j.id ? 'border-gold-500' : 'border-slate-700 hover:border-slate-600'}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-white text-sm font-bold">{j.name || `Juror #${j.number}`}</p>
                      <p className="text-slate-400 text-xs">{j.occupation}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-1">
                        <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-black ${j.recommendation === 'accept' ? 'bg-green-500 text-white' : j.recommendation === 'challenge-for-cause' ? 'bg-yellow-500 text-slate-900' : 'bg-red-500 text-white'}`}>
                          {j.biasScore}
                        </div>
                      </div>
                      <button onClick={e => { e.stopPropagation(); save(jurors.filter(x => x.id !== j.id)); if (selected?.id === j.id) setSelected(null); }}
                        className="text-slate-600 hover:text-red-400">
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Analysis Panel */}
        <div className="lg:col-span-2">
          {selected ? (
            <div className="bg-slate-800/60 border border-slate-700 rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-700 flex items-center justify-between">
                <div>
                  <h2 className="text-white font-bold">{selected.name || `Juror #${selected.number}`}</h2>
                  <p className="text-slate-400 text-sm">{selected.occupation}{selected.age ? `, age ${selected.age}` : ''}</p>
                </div>
                <RecommendationBadge rec={selected.recommendation} />
              </div>

              <div className="p-5 space-y-5 max-h-[75vh] overflow-y-auto">
                {/* Bias Score */}
                <div className="flex items-center gap-4 p-4 bg-slate-900/50 rounded-xl">
                  <div className="relative w-16 h-16 shrink-0">
                    <svg className="w-16 h-16 -rotate-90" viewBox="0 0 64 64">
                      <circle cx="32" cy="32" r="26" fill="none" stroke="#1e293b" strokeWidth="8" />
                      <circle cx="32" cy="32" r="26" fill="none"
                        stroke={selected.biasScore <= 33 ? '#22c55e' : selected.biasScore <= 66 ? '#eab308' : '#ef4444'}
                        strokeWidth="8"
                        strokeDasharray={`${(selected.biasScore / 100) * 163.4} 163.4`}
                      />
                    </svg>
                    <span className={`absolute inset-0 flex items-center justify-center text-lg font-black ${biasColor(selected.biasScore)}`}>
                      {selected.biasScore}
                    </span>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 mb-1">Bias Score (100 = most unfavorable)</p>
                    <p className="text-slate-200 text-sm leading-relaxed">{selected.reasoning}</p>
                  </div>
                </div>

                {/* Sections */}
                {[
                  { key: 'questions', label: 'Recommended Voir Dire Questions', items: selected.recommendedQuestions, color: 'text-blue-400', bullet: '?' },
                  { key: 'bias', label: 'Bias / Risk Factors', items: selected.biasFactors, color: 'text-red-400', bullet: '⚠' },
                  { key: 'favorable', label: 'Favorable Factors', items: selected.favorableFactors, color: 'text-green-400', bullet: '✓' },
                ].map(section => (
                  <div key={section.key} className="bg-slate-900/40 border border-slate-700/50 rounded-xl overflow-hidden">
                    <button onClick={() => setExpandedSection(expandedSection === section.key ? null : section.key)}
                      className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-800/50 transition-colors"
                    >
                      <span className={`text-sm font-bold ${section.color}`}>{section.label} ({section.items?.length || 0})</span>
                      {expandedSection === section.key
                        ? <ChevronUp size={14} className="text-slate-400" />
                        : <ChevronDown size={14} className="text-slate-400" />}
                    </button>
                    {expandedSection === section.key && (
                      <div className="border-t border-slate-700/50 px-4 py-3 space-y-2">
                        {section.items?.map((item, i) => (
                          <div key={i} className="flex gap-2 text-slate-300 text-sm">
                            <span className={`${section.color} shrink-0 mt-0.5`}>{section.bullet}</span>
                            <p>{item}</p>
                          </div>
                        ))}
                        {section.key === 'questions' && (
                          <button onClick={() => copyQuestions(selected)}
                            className="flex items-center gap-1 text-xs text-slate-400 hover:text-gold-400 mt-2">
                            <Copy size={12} /> Copy all questions
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center h-64 bg-slate-800/30 border border-slate-700 rounded-xl">
              <div className="text-center">
                <HelpCircle className="mx-auto mb-3 text-slate-600" size={40} />
                <p className="text-slate-400">Analyze a juror to see their profile here.</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default JuryAnalyzer;
