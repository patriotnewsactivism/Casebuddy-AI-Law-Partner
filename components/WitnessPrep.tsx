
import React, { useState, useContext } from 'react';
import { UserCheck, Plus, Trash2, ChevronDown, ChevronUp, Download, Loader2, AlertTriangle, Shield, Target, Zap, X } from 'lucide-react';
import { generateWitnessPrepPackage } from '../services/geminiService';
import { AppContext } from '../App';
import { handleError, handleSuccess } from '../utils/errorHandler';
import AgentHeader from './AgentHeader';
import { OPERATIONAL_AGENTS } from '../agents/personas';

const rex = OPERATIONAL_AGENTS.find(a => a.id === 'rex')!;

interface WitnessPrepData {
  directExam: { topic: string; questions: string[] }[];
  crossExam: { topic: string; questions: string[] }[];
  impeachmentStrategy: string;
  credibilityAssessment: {
    strengths: string[];
    vulnerabilities: string[];
    dangerZones: string[];
    openingGambit: string;
    closingQuestion: string;
  };
  overallAssessment: string;
}

interface SavedWitness {
  id: string;
  name: string;
  role: string;
  relationship: string;
  strategy: string;
  prepData: WitnessPrepData;
  generatedAt: number;
}

const RELATIONSHIPS = ['Your witness (friendly)', 'Opposing witness (hostile)', 'Expert witness', 'Eyewitness (neutral)', 'Character witness', 'Other'];

const QuestionList = ({ questions, onEdit }: { questions: string[]; onEdit?: (i: number, q: string) => void }) => (
  <ul className="space-y-2">
    {questions.map((q, i) => (
      <li key={i} className="flex items-start gap-2 group">
        <span className="text-gold-500 font-bold text-sm mt-0.5 shrink-0">{i + 1}.</span>
        {onEdit ? (
          <input
            value={q}
            onChange={e => onEdit(i, e.target.value)}
            className="flex-1 bg-transparent text-sm text-slate-200 outline-none border-b border-transparent focus:border-slate-600 transition-colors"
          />
        ) : (
          <span className="text-sm text-slate-200">{q}</span>
        )}
      </li>
    ))}
  </ul>
);

const CollapsibleSection = ({ title, icon: Icon, color, defaultOpen = true, children }: any) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden">
      <button onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-slate-700/30 transition-colors">
        <div className="flex items-center gap-2">
          <Icon size={18} className={color} />
          <span className="font-semibold text-white">{title}</span>
        </div>
        {open ? <ChevronUp size={16} className="text-slate-500" /> : <ChevronDown size={16} className="text-slate-500" />}
      </button>
      {open && <div className="px-5 pb-5">{children}</div>}
    </div>
  );
};

const PrepPackageView = ({ data, witnessName, onClose }: {
  data: WitnessPrepData;
  witnessName: string;
  onClose: () => void;
}) => {
  const exportPDF = () => {
    const printContent = document.getElementById('prep-package-print');
    if (!printContent) return;
    const win = window.open('', '_blank');
    if (!win) return;
    win.document.write(`
      <html><head><title>Witness Prep — ${witnessName}</title>
      <style>
        body { font-family: Georgia, serif; max-width: 800px; margin: 40px auto; color: #1a1a1a; font-size: 14px; line-height: 1.6; }
        h1 { font-size: 22px; border-bottom: 2px solid #333; padding-bottom: 8px; }
        h2 { font-size: 16px; margin-top: 24px; color: #333; }
        h3 { font-size: 14px; color: #555; margin-top: 16px; }
        ol { margin: 8px 0; padding-left: 20px; }
        li { margin-bottom: 6px; }
        .badge { display: inline-block; background: #f0f0f0; padding: 2px 8px; border-radius: 4px; font-size: 12px; margin: 2px; }
        .danger { color: #c00; }
        .section { border-left: 3px solid #333; padding-left: 12px; margin: 12px 0; }
      </style></head><body>
      ${printContent.innerHTML}
      </body></html>`);
    win.document.close();
    win.print();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-start justify-center overflow-y-auto py-8 px-4">
      <div className="w-full max-w-4xl bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl">
        <div className="flex items-center justify-between p-6 border-b border-slate-800">
          <div>
            <h2 className="text-xl font-bold text-white">Witness Prep Package</h2>
            <p className="text-slate-400 text-sm mt-0.5">{witnessName}</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={exportPDF}
              className="flex items-center gap-2 px-4 py-2 bg-gold-500 hover:bg-gold-400 text-slate-950 rounded-lg font-semibold text-sm transition-colors">
              <Download size={15} />
              Export PDF
            </button>
            <button onClick={onClose} className="p-2 text-slate-500 hover:text-white transition-colors">
              <X size={20} />
            </button>
          </div>
        </div>

        <div id="prep-package-print" className="p-6 space-y-4">
          <h1 style={{ display: 'none' }}>Witness Prep — {witnessName}</h1>

          <div className="p-4 bg-slate-800/50 border border-slate-700 rounded-xl">
            <p className="text-sm text-slate-300 leading-relaxed">{data.overallAssessment}</p>
          </div>

          <CollapsibleSection title="Direct Examination" icon={Target} color="text-green-400">
            <div className="space-y-4 mt-2">
              {data.directExam.map((section, i) => (
                <div key={i}>
                  <h3 className="text-sm font-bold text-green-400 mb-2">{section.topic}</h3>
                  <QuestionList questions={section.questions} />
                </div>
              ))}
            </div>
          </CollapsibleSection>

          <CollapsibleSection title="Cross-Examination" icon={Zap} color="text-red-400">
            <div className="space-y-4 mt-2">
              {data.crossExam.map((section, i) => (
                <div key={i}>
                  <h3 className="text-sm font-bold text-red-400 mb-2">{section.topic}</h3>
                  <QuestionList questions={section.questions} />
                </div>
              ))}
            </div>
          </CollapsibleSection>

          <CollapsibleSection title="Credibility Assessment" icon={Shield} color="text-blue-400">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2">
              <div>
                <h3 className="text-xs font-bold text-green-400 uppercase tracking-wider mb-2">Strengths</h3>
                <ul className="space-y-1">
                  {data.credibilityAssessment.strengths.map((s, i) => (
                    <li key={i} className="text-sm text-slate-300 flex items-start gap-1.5">
                      <span className="text-green-400 mt-1">+</span>{s}
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <h3 className="text-xs font-bold text-amber-400 uppercase tracking-wider mb-2">Vulnerabilities</h3>
                <ul className="space-y-1">
                  {data.credibilityAssessment.vulnerabilities.map((v, i) => (
                    <li key={i} className="text-sm text-slate-300 flex items-start gap-1.5">
                      <span className="text-amber-400 mt-1">!</span>{v}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
            <div className="mt-4">
              <h3 className="text-xs font-bold text-red-400 uppercase tracking-wider mb-2">Danger Zones</h3>
              <ul className="space-y-1">
                {data.credibilityAssessment.dangerZones.map((d, i) => (
                  <li key={i} className="text-sm text-red-300 flex items-start gap-1.5">
                    <AlertTriangle size={14} className="text-red-400 mt-0.5 shrink-0" />{d}
                  </li>
                ))}
              </ul>
            </div>
            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-slate-900 rounded-lg p-3 border border-slate-700">
                <p className="text-xs font-bold text-cyan-400 mb-1">Opening Gambit</p>
                <p className="text-sm text-slate-200">{data.credibilityAssessment.openingGambit}</p>
              </div>
              <div className="bg-slate-900 rounded-lg p-3 border border-slate-700">
                <p className="text-xs font-bold text-purple-400 mb-1">Closing Question</p>
                <p className="text-sm text-slate-200">{data.credibilityAssessment.closingQuestion}</p>
              </div>
            </div>
          </CollapsibleSection>

          <CollapsibleSection title="Impeachment Strategy" icon={AlertTriangle} color="text-amber-400">
            <p className="text-sm text-slate-300 leading-relaxed mt-2">{data.impeachmentStrategy}</p>
          </CollapsibleSection>
        </div>
      </div>
    </div>
  );
};

const WitnessPrep: React.FC = () => {
  const { activeCase } = useContext(AppContext);
  const [witnesses, setWitnesses] = useState<SavedWitness[]>(() => {
    try { return JSON.parse(localStorage.getItem('casebuddy_witness_preps') || '[]'); }
    catch { return []; }
  });
  const [form, setForm] = useState({ name: '', role: '', relationship: RELATIONSHIPS[0], strategy: '' });
  const [loading, setLoading] = useState(false);
  const [viewingId, setViewingId] = useState<string | null>(null);

  const save = (updated: SavedWitness[]) => {
    setWitnesses(updated);
    localStorage.setItem('casebuddy_witness_preps', JSON.stringify(updated));
  };

  const generate = async () => {
    if (!form.name.trim() || !form.role.trim()) return;
    const caseCtx = activeCase
      ? `${activeCase.title} — ${activeCase.summary}`
      : 'General litigation matter. Please provide strategic questions based on the witness role.';

    setLoading(true);
    try {
      const data = await generateWitnessPrepPackage(
        form.name, form.role, form.relationship, caseCtx, form.strategy || 'Maximize witness effectiveness and minimize credibility risks.'
      );
      const witness: SavedWitness = {
        id: Date.now().toString(),
        name: form.name,
        role: form.role,
        relationship: form.relationship,
        strategy: form.strategy,
        prepData: data,
        generatedAt: Date.now(),
      };
      const updated = [witness, ...witnesses];
      save(updated);
      setViewingId(witness.id);
      setForm({ name: '', role: '', relationship: RELATIONSHIPS[0], strategy: '' });
      handleSuccess(`Prep package generated for ${form.name}`);
    } catch (err) {
      handleError(err, 'Failed to generate witness prep package.', 'WitnessPrep');
    } finally {
      setLoading(false);
    }
  };

  const deleteWitness = (id: string) => save(witnesses.filter(w => w.id !== id));

  const viewing = viewingId ? witnesses.find(w => w.id === viewingId) : null;

  return (
    <div className="space-y-6">
      <AgentHeader agent={rex} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Input form */}
        <div className="lg:col-span-1 space-y-4">
          <div className="bg-slate-800 border border-slate-700 rounded-xl p-5 space-y-4">
            <h3 className="font-semibold text-white flex items-center gap-2">
              <Plus size={16} className="text-gold-400" />
              New Witness
            </h3>

            {!activeCase && (
              <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg text-xs text-amber-300">
                No active case selected. Select a case from Case Files to add context.
              </div>
            )}
            {activeCase && (
              <div className="p-3 bg-slate-900 border border-slate-700 rounded-lg text-xs text-slate-300">
                <span className="text-gold-400 font-semibold">Case:</span> {activeCase.title}
              </div>
            )}

            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Witness Name *</label>
              <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="e.g., John Smith"
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 outline-none focus:border-gold-500 transition-colors" />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Role / Title *</label>
              <input value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))}
                placeholder="e.g., Eyewitness, CFO, Medical Expert"
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 outline-none focus:border-gold-500 transition-colors" />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Relationship to Case</label>
              <select value={form.relationship} onChange={e => setForm(f => ({ ...f, relationship: e.target.value }))}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-gold-500 transition-colors">
                {RELATIONSHIPS.map(r => <option key={r}>{r}</option>)}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Strategic Goal</label>
              <textarea value={form.strategy} onChange={e => setForm(f => ({ ...f, strategy: e.target.value }))}
                placeholder="e.g., Establish alibi, undermine credibility of prior statement, confirm timeline..."
                rows={3}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 outline-none focus:border-gold-500 transition-colors resize-none" />
            </div>

            <button onClick={generate} disabled={loading || !form.name.trim() || !form.role.trim()}
              className="w-full py-3 bg-gold-500 hover:bg-gold-400 disabled:bg-slate-700 disabled:text-slate-500 text-slate-950 font-bold rounded-xl transition-colors flex items-center justify-center gap-2">
              {loading ? <><Loader2 size={16} className="animate-spin" /> Generating…</> : <><UserCheck size={16} /> Generate Prep Package</>}
            </button>
          </div>
        </div>

        {/* Witness roster */}
        <div className="lg:col-span-2">
          <h3 className="font-semibold text-white mb-3 flex items-center gap-2">
            <UserCheck size={16} className="text-gold-400" />
            Witness Roster ({witnesses.length})
          </h3>

          {witnesses.length === 0 ? (
            <div className="bg-slate-800 border border-slate-700 border-dashed rounded-xl p-12 text-center">
              <UserCheck size={32} className="mx-auto mb-3 text-slate-600" />
              <p className="text-slate-500">No witnesses yet. Add your first witness to generate a prep package.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {witnesses.map(w => (
                <div key={w.id}
                  className="bg-slate-800 border border-slate-700 rounded-xl p-4 flex items-center justify-between gap-4 hover:border-slate-600 transition-colors">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-white truncate">{w.name}</p>
                      <span className="text-xs bg-slate-900 border border-slate-700 text-slate-400 px-2 py-0.5 rounded-full shrink-0">
                        {w.relationship.split(' ')[0]}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5">{w.role}</p>
                    <p className="text-xs text-slate-500 mt-1">
                      {w.prepData.directExam.reduce((n, s) => n + s.questions.length, 0)} direct ·{' '}
                      {w.prepData.crossExam.reduce((n, s) => n + s.questions.length, 0)} cross ·{' '}
                      Generated {new Date(w.generatedAt).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button onClick={() => setViewingId(w.id)}
                      className="px-3 py-1.5 bg-gold-500/10 border border-gold-500/30 text-gold-400 rounded-lg text-xs font-semibold hover:bg-gold-500/20 transition-colors">
                      View Package
                    </button>
                    <button onClick={() => deleteWitness(w.id)}
                      className="p-1.5 text-slate-600 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {viewing && (
        <PrepPackageView
          data={viewing.prepData}
          witnessName={viewing.name}
          onClose={() => setViewingId(null)}
        />
      )}
    </div>
  );
};

export default WitnessPrep;
