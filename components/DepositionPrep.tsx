import React, { useState, useContext } from 'react';
import { AppContext } from '../App';
import { generateDepositionQuestions } from '../services/geminiService';
import { ClipboardList, Loader, ChevronDown, ChevronUp, Copy, Download, Plus, Trash2, RefreshCw } from 'lucide-react';
import { toast } from 'react-toastify';

interface DepoSession {
  id: string;
  deponentName: string;
  deponentRole: string;
  strategy: string;
  topics: { topic: string; purpose: string; questions: string[] }[];
  timestamp: number;
}

const DepositionPrep = () => {
  const { activeCase } = useContext(AppContext);
  const [deponentName, setDeponentName] = useState('');
  const [deponentRole, setDeponentRole] = useState('');
  const [strategy, setStrategy] = useState('');
  const [loading, setLoading] = useState(false);
  const [sessions, setSessions] = useState<DepoSession[]>(() => {
    try { return JSON.parse(localStorage.getItem('depo_sessions') || '[]'); } catch { return []; }
  });
  const [activeSession, setActiveSession] = useState<DepoSession | null>(null);
  const [expandedTopics, setExpandedTopics] = useState<Set<number>>(new Set());
  const [editingQuestion, setEditingQuestion] = useState<{topic: number; q: number} | null>(null);
  const [editVal, setEditVal] = useState('');

  const save = (updated: DepoSession[]) => {
    localStorage.setItem('depo_sessions', JSON.stringify(updated));
    setSessions(updated);
  };

  const generate = async () => {
    if (!deponentName.trim()) { toast.error('Enter deponent name.'); return; }
    if (!activeCase) { toast.error('Select an active case first.'); return; }
    setLoading(true);
    try {
      const topics = await generateDepositionQuestions(
        deponentName,
        deponentRole || 'Witness',
        activeCase.summary || activeCase.title,
        strategy || 'Gather all relevant facts. Expose inconsistencies. Lock in testimony.'
      );
      const session: DepoSession = {
        id: Date.now().toString(),
        deponentName,
        deponentRole,
        strategy,
        topics,
        timestamp: Date.now()
      };
      const updated = [session, ...sessions];
      save(updated);
      setActiveSession(session);
      setExpandedTopics(new Set(topics.map((_, i) => i)));
      toast.success(`Generated ${topics.length} topic sections!`);
      setDeponentName('');
      setDeponentRole('');
      setStrategy('');
    } catch (e) {
      toast.error('Generation failed. Please try again.');
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const toggleTopic = (i: number) => {
    setExpandedTopics(prev => {
      const next = new Set(prev);
      next.has(i) ? next.delete(i) : next.add(i);
      return next;
    });
  };

  const copyAll = (session: DepoSession) => {
    const text = session.topics.map(t =>
      `== ${t.topic.toUpperCase()} ==\nPurpose: ${t.purpose}\n\n${t.questions.map((q, i) => `${i + 1}. ${q}`).join('\n')}`
    ).join('\n\n');
    navigator.clipboard.writeText(text);
    toast.success('Copied to clipboard!');
  };

  const download = (session: DepoSession) => {
    const lines = [
      `DEPOSITION QUESTIONS: ${session.deponentName}`,
      `Role: ${session.deponentRole}`,
      `Case: ${activeCase?.title || ''}`,
      `Date: ${new Date(session.timestamp).toLocaleDateString()}`,
      `Strategy: ${session.strategy}`,
      '',
      ...session.topics.flatMap(t => [
        `${'='.repeat(50)}`,
        `TOPIC: ${t.topic}`,
        `Purpose: ${t.purpose}`,
        '',
        ...t.questions.map((q, i) => `${i + 1}. ${q}`),
        ''
      ])
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `depo_${session.deponentName.replace(/\s/g, '_')}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const deleteSession = (id: string) => {
    const updated = sessions.filter(s => s.id !== id);
    save(updated);
    if (activeSession?.id === id) setActiveSession(null);
  };

  const saveEdit = (topicIdx: number, qIdx: number) => {
    if (!activeSession) return;
    const updated = { ...activeSession, topics: activeSession.topics.map((t, ti) =>
      ti === topicIdx ? { ...t, questions: t.questions.map((q, qi) => qi === qIdx ? editVal : q) } : t
    )};
    setActiveSession(updated);
    setSessions(prev => {
      const next = prev.map(s => s.id === updated.id ? updated : s);
      localStorage.setItem('depo_sessions', JSON.stringify(next));
      return next;
    });
    setEditingQuestion(null);
  };

  const addQuestion = (topicIdx: number) => {
    if (!activeSession) return;
    const updated = { ...activeSession, topics: activeSession.topics.map((t, ti) =>
      ti === topicIdx ? { ...t, questions: [...t.questions, 'New question — click to edit'] } : t
    )};
    setActiveSession(updated);
    setSessions(prev => {
      const next = prev.map(s => s.id === updated.id ? updated : s);
      localStorage.setItem('depo_sessions', JSON.stringify(next));
      return next;
    });
  };

  const removeQuestion = (topicIdx: number, qIdx: number) => {
    if (!activeSession) return;
    const updated = { ...activeSession, topics: activeSession.topics.map((t, ti) =>
      ti === topicIdx ? { ...t, questions: t.questions.filter((_, qi) => qi !== qIdx) } : t
    )};
    setActiveSession(updated);
    setSessions(prev => {
      const next = prev.map(s => s.id === updated.id ? updated : s);
      localStorage.setItem('depo_sessions', JSON.stringify(next));
      return next;
    });
  };

  if (!activeCase) {
    return (
      <div className="flex items-center justify-center min-h-64">
        <div className="text-center">
          <ClipboardList className="mx-auto mb-3 text-slate-500" size={48} />
          <p className="text-white font-semibold mb-1">No Active Case</p>
          <p className="text-slate-400 text-sm">Select a case from Case Files to begin.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <ClipboardList className="text-gold-500" size={32} />
        <div>
          <h1 className="text-3xl font-bold text-white font-serif">Deposition Prep</h1>
          <p className="text-slate-400 text-sm">AI-generated question sets for {activeCase.title}</p>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Generator Form */}
        <div className="bg-slate-800/60 border border-slate-700 rounded-xl p-6 space-y-4">
          <h2 className="text-lg font-bold text-white">New Deposition</h2>

          <div>
            <label className="text-sm text-slate-400 block mb-1">Deponent Name *</label>
            <input value={deponentName} onChange={e => setDeponentName(e.target.value)}
              placeholder="John Smith"
              className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-gold-500 text-sm"
            />
          </div>

          <div>
            <label className="text-sm text-slate-400 block mb-1">Role / Title</label>
            <input value={deponentRole} onChange={e => setDeponentRole(e.target.value)}
              placeholder="e.g. Expert Witness, CFO, Eyewitness"
              className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-gold-500 text-sm"
            />
          </div>

          <div>
            <label className="text-sm text-slate-400 block mb-1">Deposition Strategy</label>
            <textarea value={strategy} onChange={e => setStrategy(e.target.value)}
              placeholder="e.g. Lock in timeline. Expose inconsistency between statement and report. Establish they never directly witnessed the event."
              rows={4}
              className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-gold-500 text-sm resize-none"
            />
          </div>

          <button onClick={generate} disabled={loading || !deponentName.trim()}
            className="w-full flex items-center justify-center gap-2 bg-gold-500 hover:bg-gold-600 disabled:bg-slate-700 disabled:text-slate-500 text-slate-900 font-bold py-3 rounded-lg transition-colors"
          >
            {loading ? <><Loader className="animate-spin" size={18} /> Generating...</> : <><RefreshCw size={18} /> Generate Questions</>}
          </button>

          {/* Past Sessions */}
          {sessions.length > 0 && (
            <div className="border-t border-slate-700 pt-4 space-y-2">
              <p className="text-xs text-slate-500 uppercase tracking-wider">Past Sessions</p>
              {sessions.map(s => (
                <div key={s.id}
                  onClick={() => { setActiveSession(s); setExpandedTopics(new Set(s.topics.map((_, i) => i))); }}
                  className={`flex items-center justify-between p-3 rounded-lg cursor-pointer transition-all border ${activeSession?.id === s.id ? 'bg-gold-900/20 border-gold-600/40' : 'bg-slate-700/50 border-slate-700 hover:bg-slate-700'}`}
                >
                  <div>
                    <p className="text-white text-sm font-semibold">{s.deponentName}</p>
                    <p className="text-slate-400 text-xs">{s.deponentRole} · {s.topics.length} topics</p>
                  </div>
                  <button onClick={e => { e.stopPropagation(); deleteSession(s.id); }} className="text-slate-600 hover:text-red-400">
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Questions Panel */}
        <div className="lg:col-span-2 space-y-3">
          {activeSession ? (
            <>
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-bold text-white">{activeSession.deponentName}</h2>
                  <p className="text-slate-400 text-sm">{activeSession.deponentRole} · {activeSession.topics.reduce((a, t) => a + t.questions.length, 0)} questions across {activeSession.topics.length} topics</p>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => copyAll(activeSession)} className="flex items-center gap-1 px-3 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-sm">
                    <Copy size={14} /> Copy All
                  </button>
                  <button onClick={() => download(activeSession)} className="flex items-center gap-1 px-3 py-2 bg-gold-500 hover:bg-gold-600 text-slate-900 font-semibold rounded-lg text-sm">
                    <Download size={14} /> Download
                  </button>
                </div>
              </div>

              {activeSession.topics.map((topic, ti) => (
                <div key={ti} className="bg-slate-800/60 border border-slate-700 rounded-xl overflow-hidden">
                  <button onClick={() => toggleTopic(ti)}
                    className="w-full flex items-center justify-between px-5 py-4 hover:bg-slate-800 transition-colors"
                  >
                    <div className="text-left">
                      <p className="text-white font-bold">{topic.topic}</p>
                      <p className="text-slate-400 text-xs mt-0.5">{topic.purpose}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-gold-400 text-sm font-semibold">{topic.questions.length}Q</span>
                      {expandedTopics.has(ti) ? <ChevronUp size={16} className="text-slate-400" /> : <ChevronDown size={16} className="text-slate-400" />}
                    </div>
                  </button>

                  {expandedTopics.has(ti) && (
                    <div className="border-t border-slate-700 px-5 py-3 space-y-2">
                      {topic.questions.map((q, qi) => (
                        <div key={qi} className="flex items-start gap-3 group">
                          <span className="text-gold-500 text-sm font-bold mt-0.5 w-6 shrink-0">{qi + 1}.</span>
                          {editingQuestion?.topic === ti && editingQuestion?.q === qi ? (
                            <div className="flex-1 flex gap-2">
                              <input value={editVal} onChange={e => setEditVal(e.target.value)}
                                className="flex-1 px-2 py-1 bg-slate-700 border border-gold-500 rounded text-white text-sm focus:outline-none"
                                autoFocus
                              />
                              <button onClick={() => saveEdit(ti, qi)} className="text-green-400 text-sm font-semibold">Save</button>
                              <button onClick={() => setEditingQuestion(null)} className="text-slate-400 text-sm">✕</button>
                            </div>
                          ) : (
                            <div className="flex-1 flex items-start justify-between gap-2">
                              <p className="text-slate-200 text-sm leading-relaxed">{q}</p>
                              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                                <button onClick={() => { setEditingQuestion({topic: ti, q: qi}); setEditVal(q); }}
                                  className="text-xs text-slate-400 hover:text-gold-400 px-1">Edit</button>
                                <button onClick={() => removeQuestion(ti, qi)}
                                  className="text-xs text-slate-400 hover:text-red-400 px-1">✕</button>
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                      <button onClick={() => addQuestion(ti)}
                        className="flex items-center gap-1 text-xs text-slate-500 hover:text-gold-400 mt-2 transition-colors"
                      >
                        <Plus size={12} /> Add question
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </>
          ) : (
            <div className="flex items-center justify-center h-64 bg-slate-800/30 border border-slate-700 rounded-xl">
              <div className="text-center">
                <ClipboardList className="mx-auto mb-3 text-slate-600" size={40} />
                <p className="text-slate-400">Fill in the form and generate your first deposition question set.</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default DepositionPrep;
