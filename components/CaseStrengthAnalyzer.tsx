import React, { useState, useContext } from 'react';
import { AppContext } from '../App';
import { TrendingUp, Loader, AlertTriangle, CheckCircle, Target, Shield, Zap, ChevronDown } from 'lucide-react';
import { deepseekChat } from '../services/deepseek';

interface AnalysisResult {
  winProbability: number;
  settlementRange: { low: number; high: number };
  overallStrength: 'Strong' | 'Moderate' | 'Weak' | 'Critical';
  strengths: string[];
  weaknesses: string[];
  opportunities: string[];
  risks: string[];
  recommendedStrategy: string;
  immediateActions: string[];
  keyLegalIssues: string[];
  evidenceGaps: string[];
  negotiationLeverage: string;
  trialReadiness: string;
}

const strengthColor = (s: string) => {
  if (s === 'Strong') return 'text-green-400';
  if (s === 'Moderate') return 'text-amber-400';
  if (s === 'Weak') return 'text-orange-400';
  return 'text-red-400';
};

const probColor = (p: number) => {
  if (p >= 70) return 'text-green-400';
  if (p >= 50) return 'text-amber-400';
  if (p >= 30) return 'text-orange-400';
  return 'text-red-400';
};

const CaseStrengthAnalyzer: React.FC = () => {
  const { cases, activeCaseId } = useContext(AppContext);
  const [selectedCaseId, setSelectedCaseId] = useState(activeCaseId || cases?.[0]?.id || '');
  const [additionalFacts, setAdditionalFacts] = useState('');
  const [practiceArea, setPracticeArea] = useState('Civil Litigation');
  const [loading, setLoading] = useState(false);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [rawText, setRawText] = useState('');

  const selectedCase = cases?.find((c: any) => c.id === selectedCaseId);

  const PRACTICE_AREAS = [
    'Civil Litigation', 'Criminal Defense', 'Personal Injury', 'Family Law',
    'Employment', 'Contract Dispute', 'Real Estate', 'IP / Patent',
    'Civil Rights', 'Immigration', 'Bankruptcy', 'Corporate',
  ];

  const runAnalysis = async () => {
    if (!selectedCase && !additionalFacts) return;
    setLoading(true);
    setAnalysis(null);
    setRawText('');

    try {

      const caseContext = selectedCase ? `
Case Title: ${selectedCase.title}
Client: ${selectedCase.client}
Status: ${selectedCase.status}
Opposing Counsel: ${selectedCase.opposingCounsel || 'Unknown'}
Judge: ${selectedCase.judge || 'Unknown'}
Next Court Date: ${selectedCase.nextCourtDate || 'Unknown'}
Case Summary: ${selectedCase.summary || 'No summary'}
Current Win Probability: ${selectedCase.winProbability || 'Unknown'}%
` : '';

      const prompt = `You are a senior litigation partner at a top-tier law firm. Conduct a comprehensive case strength analysis.

${caseContext}
Practice Area: ${practiceArea}
Additional Facts: ${additionalFacts || 'None provided'}

Provide a thorough case evaluation in this EXACT JSON format (no markdown, pure JSON):
{
  "winProbability": <number 0-100>,
  "settlementRange": { "low": <number>, "high": <number> },
  "overallStrength": "<Strong|Moderate|Weak|Critical>",
  "strengths": ["<strength 1>", "<strength 2>", "<strength 3>", "<strength 4>"],
  "weaknesses": ["<weakness 1>", "<weakness 2>", "<weakness 3>"],
  "opportunities": ["<opportunity 1>", "<opportunity 2>", "<opportunity 3>"],
  "risks": ["<risk 1>", "<risk 2>", "<risk 3>"],
  "recommendedStrategy": "<2-3 sentence strategic recommendation>",
  "immediateActions": ["<action 1>", "<action 2>", "<action 3>", "<action 4>"],
  "keyLegalIssues": ["<issue 1>", "<issue 2>", "<issue 3>"],
  "evidenceGaps": ["<gap 1>", "<gap 2>", "<gap 3>"],
  "negotiationLeverage": "<paragraph on negotiation position>",
  "trialReadiness": "<paragraph on trial readiness assessment>"
}

Be direct, honest, and analytical. Do not sugarcoat weaknesses.`;

      const text = await deepseekChat({
        systemInstruction: 'You are a senior litigation analyst. Return ONLY valid JSON, no markdown.',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
        maxTokens: 3000,
        jsonMode: true,
      });
      setRawText(text);

      // Parse JSON from response
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        setAnalysis(parsed);
      } else {
        setRawText(text);
      }
    } catch (e) {
      setRawText('Error running analysis. Please check your API configuration and try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-serif font-bold text-white flex items-center gap-2">
          <TrendingUp className="text-gold-400" /> Case Strength Analyzer
        </h1>
        <p className="text-slate-400 mt-1">AI-powered case evaluation — win probability, strengths/weaknesses, strategy, and immediate action items.</p>
      </div>

      {/* Config */}
      <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-5 mb-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
          <div>
            <label className="block text-xs font-bold text-slate-400 uppercase mb-1.5">Select Case</label>
            <select value={selectedCaseId} onChange={e => setSelectedCaseId(e.target.value)}
              className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-gold-500/50">
              <option value="">No case selected</option>
              {cases?.map((c: any) => <option key={c.id} value={c.id}>{c.title}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-400 uppercase mb-1.5">Practice Area</label>
            <select value={practiceArea} onChange={e => setPracticeArea(e.target.value)}
              className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-gold-500/50">
              {PRACTICE_AREAS.map(p => <option key={p}>{p}</option>)}
            </select>
          </div>
        </div>
        <div className="mb-4">
          <label className="block text-xs font-bold text-slate-400 uppercase mb-1.5">Additional Facts / Context</label>
          <textarea value={additionalFacts} onChange={e => setAdditionalFacts(e.target.value)}
            rows={4} placeholder="Add any additional facts, evidence, witness information, or legal theories you want analyzed..."
            className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm placeholder-slate-500 resize-none focus:outline-none focus:border-gold-500/50" />
        </div>
        <button onClick={runAnalysis} disabled={loading || (!selectedCase && !additionalFacts)}
          className="flex items-center gap-2 bg-gradient-to-r from-gold-500 to-amber-500 hover:from-gold-400 hover:to-amber-400 disabled:opacity-50 text-slate-900 font-bold px-6 py-2.5 rounded-xl transition-all">
          {loading ? <><Loader size={18} className="animate-spin" /> Analyzing Case...</> : <><Zap size={18} /> Run Case Analysis</>}
        </button>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex flex-col items-center py-16 text-slate-400 gap-4">
          <Loader size={40} className="animate-spin text-gold-400" />
          <div className="text-center">
            <p className="font-medium">Analyzing your case...</p>
            <p className="text-sm text-slate-500 mt-1">Evaluating strengths, weaknesses, strategy, and win probability</p>
          </div>
        </div>
      )}

      {/* Results */}
      {analysis && !loading && (
        <div className="space-y-5">
          {/* Top metrics */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4 text-center">
              <p className={`text-4xl font-bold ${probColor(analysis.winProbability)}`}>{analysis.winProbability}%</p>
              <p className="text-xs text-slate-400 mt-1">Win Probability</p>
            </div>
            <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4 text-center">
              <p className={`text-2xl font-bold ${strengthColor(analysis.overallStrength)}`}>{analysis.overallStrength}</p>
              <p className="text-xs text-slate-400 mt-1">Case Strength</p>
            </div>
            <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4 text-center col-span-2">
              <p className="text-xl font-bold text-blue-400">
                ${analysis.settlementRange.low.toLocaleString()} – ${analysis.settlementRange.high.toLocaleString()}
              </p>
              <p className="text-xs text-slate-400 mt-1">Settlement Value Range</p>
            </div>
          </div>

          {/* Win probability bar */}
          <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4">
            <div className="flex justify-between text-xs text-slate-400 mb-2">
              <span>0% — No Case</span>
              <span>50% — Even</span>
              <span>100% — Certain Win</span>
            </div>
            <div className="w-full bg-slate-700 rounded-full h-4 relative">
              <div
                className={`h-4 rounded-full transition-all duration-1000 ${analysis.winProbability >= 70 ? 'bg-green-500' : analysis.winProbability >= 50 ? 'bg-amber-500' : analysis.winProbability >= 30 ? 'bg-orange-500' : 'bg-red-500'}`}
                style={{ width: `${analysis.winProbability}%` }}
              />
            </div>
          </div>

          {/* SWOT grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {[
              { title: 'Strengths', items: analysis.strengths, icon: '💪', color: 'border-green-500/30 bg-green-500/5', badge: 'text-green-400' },
              { title: 'Weaknesses', items: analysis.weaknesses, icon: '⚠️', color: 'border-red-500/30 bg-red-500/5', badge: 'text-red-400' },
              { title: 'Opportunities', items: analysis.opportunities, icon: '🎯', color: 'border-blue-500/30 bg-blue-500/5', badge: 'text-blue-400' },
              { title: 'Risks', items: analysis.risks, icon: '🔥', color: 'border-amber-500/30 bg-amber-500/5', badge: 'text-amber-400' },
            ].map(section => (
              <div key={section.title} className={`border rounded-xl p-4 ${section.color}`}>
                <h3 className={`font-bold mb-3 flex items-center gap-2 ${section.badge}`}>
                  <span>{section.icon}</span> {section.title}
                </h3>
                <ul className="space-y-2">
                  {section.items.map((item, i) => (
                    <li key={i} className="text-sm text-slate-300 flex items-start gap-2">
                      <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-slate-500 shrink-0" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          {/* Strategy */}
          <div className="bg-slate-800/50 border border-gold-500/20 rounded-xl p-5">
            <h3 className="font-bold text-gold-400 mb-2 flex items-center gap-2">🏆 Recommended Strategy</h3>
            <p className="text-slate-200 text-sm leading-relaxed">{analysis.recommendedStrategy}</p>
          </div>

          {/* Immediate Actions */}
          <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-5">
            <h3 className="font-bold text-white mb-3 flex items-center gap-2">⚡ Immediate Actions</h3>
            <div className="space-y-2">
              {analysis.immediateActions.map((action, i) => (
                <div key={i} className="flex items-start gap-3 bg-slate-700/50 rounded-lg px-3 py-2">
                  <span className="text-gold-400 font-bold text-sm shrink-0">{i + 1}.</span>
                  <p className="text-slate-200 text-sm">{action}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Three columns: Key Issues, Evidence Gaps, Negotiation */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4">
              <h3 className="font-bold text-white mb-3 text-sm">⚖️ Key Legal Issues</h3>
              <ul className="space-y-1.5">
                {analysis.keyLegalIssues.map((issue, i) => (
                  <li key={i} className="text-xs text-slate-300 flex items-start gap-1.5">
                    <span className="text-slate-500 mt-0.5">•</span> {issue}
                  </li>
                ))}
              </ul>
            </div>
            <div className="bg-slate-800/50 border border-red-500/20 rounded-xl p-4">
              <h3 className="font-bold text-red-400 mb-3 text-sm">🔎 Evidence Gaps</h3>
              <ul className="space-y-1.5">
                {analysis.evidenceGaps.map((gap, i) => (
                  <li key={i} className="text-xs text-slate-300 flex items-start gap-1.5">
                    <span className="text-red-500 mt-0.5">•</span> {gap}
                  </li>
                ))}
              </ul>
            </div>
            <div className="bg-slate-800/50 border border-blue-500/20 rounded-xl p-4">
              <h3 className="font-bold text-blue-400 mb-3 text-sm">🤝 Negotiation Leverage</h3>
              <p className="text-xs text-slate-300 leading-relaxed">{analysis.negotiationLeverage}</p>
            </div>
          </div>

          {/* Trial Readiness */}
          <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-5">
            <h3 className="font-bold text-white mb-2">🏛️ Trial Readiness Assessment</h3>
            <p className="text-sm text-slate-300 leading-relaxed">{analysis.trialReadiness}</p>
          </div>
        </div>
      )}

      {/* Raw text fallback */}
      {rawText && !analysis && !loading && (
        <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-5">
          <pre className="whitespace-pre-wrap text-slate-300 text-sm">{rawText}</pre>
        </div>
      )}
    </div>
  );
};

export default CaseStrengthAnalyzer;
