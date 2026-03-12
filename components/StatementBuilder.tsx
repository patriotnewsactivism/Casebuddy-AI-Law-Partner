import React, { useState, useContext } from 'react';
import { AppContext } from '../App';
import { generateStatement } from '../services/geminiService';
import { BookOpen, Loader, Copy, Download, RefreshCw, ChevronLeft, Mic, Maximize2, Minimize2 } from 'lucide-react';
import { toast } from 'react-toastify';

interface Statement {
  id: string;
  type: 'opening' | 'closing';
  caseTitle: string;
  theory: string;
  keyEvidence: string;
  tone: string;
  introduction: string;
  body: string[];
  conclusion: string;
  fullText: string;
  talkingPoints: string[];
  timestamp: number;
}

const StatementBuilder = () => {
  const { activeCase } = useContext(AppContext);
  const [type, setType] = useState<'opening' | 'closing'>('opening');
  const [theory, setTheory] = useState('');
  const [keyEvidence, setKeyEvidence] = useState('');
  const [tone, setTone] = useState('persuasive and confident');
  const [loading, setLoading] = useState(false);
  const [statement, setStatement] = useState<Statement | null>(null);
  const [history, setHistory] = useState<Statement[]>(() => {
    try { return JSON.parse(localStorage.getItem('statements') || '[]'); } catch { return []; }
  });
  const [view, setView] = useState<'form' | 'result' | 'teleprompter'>('form');
  const [teleprompterSpeed, setTeleprompterSpeed] = useState(3);
  const [activeSection, setActiveSection] = useState<'full' | 'points'>('full');

  const generate = async () => {
    if (!activeCase) { toast.error('Select an active case first.'); return; }
    if (!theory.trim()) { toast.error('Enter your theory of the case.'); return; }
    setLoading(true);
    try {
      const result = await generateStatement(
        type,
        activeCase.summary || activeCase.title,
        theory,
        keyEvidence || 'Key evidence as outlined in case file.',
        tone
      );
      const s: Statement = {
        id: Date.now().toString(),
        type,
        caseTitle: activeCase.title,
        theory,
        keyEvidence,
        tone,
        ...result,
        timestamp: Date.now()
      };
      const updated = [s, ...history].slice(0, 20);
      localStorage.setItem('statements', JSON.stringify(updated));
      setHistory(updated);
      setStatement(s);
      setView('result');
      toast.success(`${type === 'opening' ? 'Opening' : 'Closing'} statement generated!`);
    } catch (e) {
      toast.error('Generation failed. Please try again.');
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const copyText = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Copied to clipboard!');
  };

  const download = (s: Statement) => {
    const lines = [
      `${s.type.toUpperCase()} STATEMENT`,
      `Case: ${s.caseTitle}`,
      `Date: ${new Date(s.timestamp).toLocaleDateString()}`,
      `Theory: ${s.theory}`,
      '',
      '=== FULL STATEMENT ===',
      '',
      s.fullText,
      '',
      '=== TALKING POINTS ===',
      '',
      ...s.talkingPoints.map((p, i) => `${i + 1}. ${p}`)
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${s.type}_statement_${s.caseTitle.replace(/\s/g, '_')}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  if (!activeCase) {
    return (
      <div className="flex items-center justify-center min-h-64">
        <div className="text-center">
          <BookOpen className="mx-auto mb-3 text-slate-500" size={48} />
          <p className="text-white font-semibold">No Active Case</p>
          <p className="text-slate-400 text-sm">Select a case to build statements.</p>
        </div>
      </div>
    );
  }

  if (view === 'teleprompter' && statement) {
    return (
      <div className="fixed inset-0 bg-black z-50 flex flex-col">
        <div className="flex items-center justify-between px-8 py-4 border-b border-slate-800">
          <div className="flex items-center gap-4">
            <button onClick={() => setView('result')} className="text-slate-400 hover:text-white">
              <ChevronLeft size={24} />
            </button>
            <h2 className="text-white font-bold text-lg">Teleprompter Mode</h2>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-slate-400 text-sm">Speed</span>
            {[1, 2, 3, 4, 5].map(s => (
              <button key={s} onClick={() => setTeleprompterSpeed(s)}
                className={`w-8 h-8 rounded-full text-sm font-bold transition-colors ${teleprompterSpeed === s ? 'bg-gold-500 text-slate-900' : 'bg-slate-800 text-slate-300'}`}
              >{s}</button>
            ))}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-16 py-12"
          style={{ scrollBehavior: 'smooth' }}>
          <div className="max-w-3xl mx-auto">
            <p className="text-white text-4xl leading-loose font-serif tracking-wide whitespace-pre-wrap">
              {statement.fullText}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <BookOpen className="text-gold-500" size={32} />
        <div>
          <h1 className="text-3xl font-bold text-white font-serif">Statement Builder</h1>
          <p className="text-slate-400 text-sm">AI-crafted opening & closing statements for {activeCase.title}</p>
        </div>
      </div>

      {view === 'form' && (
        <div className="grid lg:grid-cols-2 gap-6">
          <div className="bg-slate-800/60 border border-slate-700 rounded-xl p-6 space-y-5">
            <h2 className="text-lg font-bold text-white">Build Statement</h2>

            {/* Type Toggle */}
            <div className="flex rounded-xl overflow-hidden border border-slate-700">
              {(['opening', 'closing'] as const).map(t => (
                <button key={t} onClick={() => setType(t)}
                  className={`flex-1 py-3 text-sm font-bold capitalize transition-colors ${type === t ? 'bg-gold-500 text-slate-900' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}
                >{t} Statement</button>
              ))}
            </div>

            <div>
              <label className="text-sm text-slate-400 block mb-1">Theory of the Case *</label>
              <textarea value={theory} onChange={e => setTheory(e.target.value)}
                placeholder="e.g. My client acted in self-defense after being threatened. The prosecution's case relies entirely on a single unreliable witness with motive to lie."
                rows={4}
                className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-gold-500 text-sm resize-none"
              />
            </div>

            <div>
              <label className="text-sm text-slate-400 block mb-1">Key Evidence / Facts to Highlight</label>
              <textarea value={keyEvidence} onChange={e => setKeyEvidence(e.target.value)}
                placeholder="e.g. Security camera footage showing defendant 2 miles away, Expert testimony on forensics, Witness credibility issues..."
                rows={4}
                className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-gold-500 text-sm resize-none"
              />
            </div>

            <div>
              <label className="text-sm text-slate-400 block mb-1">Tone / Style</label>
              <select value={tone} onChange={e => setTone(e.target.value)}
                className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-gold-500 text-sm"
              >
                <option value="persuasive and confident">Persuasive & Confident</option>
                <option value="empathetic and storytelling">Empathetic & Storytelling</option>
                <option value="aggressive and direct">Aggressive & Direct</option>
                <option value="calm and methodical">Calm & Methodical</option>
                <option value="passionate and emotional">Passionate & Emotional</option>
              </select>
            </div>

            <button onClick={generate} disabled={loading || !theory.trim()}
              className="w-full flex items-center justify-center gap-2 bg-gold-500 hover:bg-gold-600 disabled:bg-slate-700 disabled:text-slate-500 text-slate-900 font-bold py-3 rounded-lg transition-colors"
            >
              {loading ? <><Loader className="animate-spin" size={18} /> Writing...</> : <><RefreshCw size={18} /> Generate Statement</>}
            </button>
          </div>

          {/* History */}
          <div className="space-y-3">
            <h2 className="text-lg font-bold text-white">Recent Statements</h2>
            {history.length === 0 ? (
              <div className="bg-slate-800/30 border border-slate-700 rounded-xl p-8 text-center">
                <BookOpen className="mx-auto mb-3 text-slate-600" size={36} />
                <p className="text-slate-400">Your generated statements appear here.</p>
              </div>
            ) : history.slice(0, 6).map(s => (
              <div key={s.id} onClick={() => { setStatement(s); setView('result'); }}
                className="cursor-pointer bg-slate-800/60 border border-slate-700 hover:border-slate-500 rounded-xl p-4 transition-all"
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className={`px-2 py-0.5 rounded text-xs font-bold ${s.type === 'opening' ? 'bg-blue-900/40 text-blue-400' : 'bg-purple-900/40 text-purple-400'}`}>
                    {s.type}
                  </span>
                  <span className="text-slate-400 text-xs">{new Date(s.timestamp).toLocaleDateString()}</span>
                </div>
                <p className="text-white text-sm font-semibold">{s.caseTitle}</p>
                <p className="text-slate-400 text-xs mt-1 line-clamp-2">{s.theory}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {view === 'result' && statement && (
        <div className="space-y-5">
          <div className="flex items-center justify-between">
            <button onClick={() => setView('form')} className="flex items-center gap-2 text-slate-400 hover:text-white text-sm">
              <ChevronLeft size={18} /> Back to Builder
            </button>
            <div className="flex gap-2">
              <button onClick={() => setView('teleprompter')}
                className="flex items-center gap-2 px-3 py-2 bg-blue-700 hover:bg-blue-600 text-white rounded-lg text-sm font-semibold">
                <Mic size={14} /> Teleprompter
              </button>
              <button onClick={() => copyText(statement.fullText)}
                className="flex items-center gap-2 px-3 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-sm">
                <Copy size={14} /> Copy
              </button>
              <button onClick={() => download(statement)}
                className="flex items-center gap-2 px-3 py-2 bg-gold-500 hover:bg-gold-600 text-slate-900 font-semibold rounded-lg text-sm">
                <Download size={14} /> Download
              </button>
            </div>
          </div>

          <div className="flex gap-2 border-b border-slate-700 pb-3">
            {(['full', 'points'] as const).map(v => (
              <button key={v} onClick={() => setActiveSection(v)}
                className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${activeSection === v ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'}`}
              >{v === 'full' ? 'Full Statement' : 'Talking Points'}</button>
            ))}
          </div>

          {activeSection === 'full' ? (
            <div className="space-y-4">
              {[
                { label: 'Introduction', text: statement.introduction, color: 'border-l-blue-500' },
                ...statement.body.map((b, i) => ({ label: `Body ${i + 1}`, text: b, color: 'border-l-gold-500' })),
                { label: 'Conclusion', text: statement.conclusion, color: 'border-l-green-500' },
              ].map((section, i) => (
                <div key={i} className={`bg-slate-800/60 border border-slate-700 border-l-4 ${section.color} rounded-xl p-5`}>
                  <p className="text-xs text-slate-500 uppercase tracking-wider mb-2">{section.label}</p>
                  <p className="text-slate-200 leading-relaxed whitespace-pre-wrap">{section.text}</p>
                </div>
              ))}
            </div>
          ) : (
            <div className="bg-slate-800/60 border border-slate-700 rounded-xl p-6 space-y-3">
              <h3 className="text-white font-bold mb-4">Key Talking Points</h3>
              {statement.talkingPoints.map((point, i) => (
                <div key={i} className="flex gap-3 items-start p-3 bg-slate-900/40 rounded-lg">
                  <span className="w-7 h-7 bg-gold-500 text-slate-900 rounded-full flex items-center justify-center text-sm font-black shrink-0">{i + 1}</span>
                  <p className="text-slate-200 text-sm leading-relaxed pt-0.5">{point}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default StatementBuilder;
