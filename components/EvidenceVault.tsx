import React, { useState, useContext, useEffect, useRef } from 'react';
import { AppContext } from '../App';
import { analyzeEvidence } from '../services/geminiService';
import { Archive, Upload, Trash2, Eye, AlertCircle, CheckCircle, Tag, Loader, FileImage, FileAudio, FileText, X, TrendingUp } from 'lucide-react';
import { toast } from 'react-toastify';

interface EvidenceItem {
  id: string;
  caseId: string;
  name: string;
  type: string;
  size: number;
  timestamp: number;
  summary: string;
  relevance: number;
  keyFacts: string[];
  concerns: string[];
  tags: string[];
  dataUrl?: string;
}

const relevanceColor = (r: number) => r >= 75 ? 'text-green-400' : r >= 50 ? 'text-yellow-400' : 'text-red-400';
const relevanceBg = (r: number) => r >= 75 ? 'bg-green-500' : r >= 50 ? 'bg-yellow-500' : 'bg-red-500';

const EvidenceVault = () => {
  const { activeCase } = useContext(AppContext);
  const [items, setItems] = useState<EvidenceItem[]>([]);
  const [selected, setSelected] = useState<EvidenceItem | null>(null);
  const [uploading, setUploading] = useState(false);
  const [filterTag, setFilterTag] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (activeCase) {
      try {
        const saved = localStorage.getItem(`evidence_${activeCase.id}`);
        setItems(saved ? JSON.parse(saved) : []);
      } catch { setItems([]); }
    }
  }, [activeCase]);

  const save = (updated: EvidenceItem[]) => {
    if (!activeCase) return;
    localStorage.setItem(`evidence_${activeCase.id}`, JSON.stringify(updated));
    setItems(updated);
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !activeCase) return;
    if (file.size > 50 * 1024 * 1024) { toast.error('File must be under 50MB.'); return; }

    setUploading(true);
    toast.info(`Analyzing ${file.name}...`);

    try {
      const reader = new FileReader();
      const dataUrl = await new Promise<string>(resolve => {
        reader.onloadend = () => resolve(reader.result as string);
        reader.readAsDataURL(file);
      });

      const analysis = await analyzeEvidence(file, activeCase.summary || activeCase.title);

      const item: EvidenceItem = {
        id: Date.now().toString(),
        caseId: activeCase.id,
        name: file.name,
        type: file.type,
        size: file.size,
        timestamp: Date.now(),
        dataUrl: file.type.startsWith('image/') ? dataUrl : undefined,
        ...analysis
      };

      const updated = [item, ...items];
      save(updated);
      setSelected(item);
      toast.success('Evidence analyzed and stored!');
    } catch (err) {
      toast.error('Analysis failed. Please try again.');
      console.error(err);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const allTags = Array.from(new Set(items.flatMap(i => i.tags)));
  const filtered = filterTag ? items.filter(i => i.tags.includes(filterTag)) : items;

  const FileIcon = ({ type }: { type: string }) => {
    if (type.startsWith('image/')) return <FileImage size={16} className="text-blue-400" />;
    if (type.startsWith('audio/')) return <FileAudio size={16} className="text-gold-400" />;
    return <FileText size={16} className="text-slate-400" />;
  };

  if (!activeCase) {
    return (
      <div className="flex items-center justify-center min-h-64">
        <div className="text-center">
          <Archive className="mx-auto mb-3 text-slate-500" size={48} />
          <p className="text-white font-semibold">No Active Case</p>
          <p className="text-slate-400 text-sm">Select a case to access the Evidence Vault.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Archive className="text-gold-500" size={32} />
          <div>
            <h1 className="text-3xl font-bold text-white font-serif">Evidence Vault</h1>
            <p className="text-slate-400 text-sm">{activeCase.title} · {items.length} items</p>
          </div>
        </div>
        <label className="flex items-center gap-2 bg-gold-500 hover:bg-gold-600 text-slate-900 font-bold px-4 py-2 rounded-lg cursor-pointer transition-colors">
          {uploading ? <Loader className="animate-spin" size={18} /> : <Upload size={18} />}
          {uploading ? 'Analyzing...' : 'Upload Evidence'}
          <input ref={fileRef} type="file" accept="image/*,audio/*,.pdf,.doc,.docx,.txt" onChange={handleUpload} className="hidden" disabled={uploading} />
        </label>
      </div>

      {/* Tag Filter */}
      {allTags.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setFilterTag('')}
            className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors ${!filterTag ? 'bg-gold-500 text-slate-900' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}
          >All</button>
          {allTags.map(tag => (
            <button key={tag} onClick={() => setFilterTag(tag)}
              className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors ${filterTag === tag ? 'bg-gold-500 text-slate-900' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}
            >{tag}</button>
          ))}
        </div>
      )}

      <div className="grid lg:grid-cols-5 gap-6">
        {/* List */}
        <div className="lg:col-span-2 space-y-3">
          {filtered.length === 0 ? (
            <div className="bg-slate-800/40 border border-slate-700 rounded-xl p-10 text-center">
              <Archive className="mx-auto mb-3 text-slate-600" size={40} />
              <p className="text-slate-400">No evidence yet.</p>
              <p className="text-slate-500 text-xs mt-1">Upload files to analyze and store them here.</p>
            </div>
          ) : filtered.map(item => (
            <div key={item.id} onClick={() => setSelected(item)}
              className={`cursor-pointer bg-slate-800/60 border rounded-xl p-4 transition-all ${selected?.id === item.id ? 'border-gold-500 shadow-gold-500/10 shadow-lg' : 'border-slate-700 hover:border-slate-600'}`}
            >
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="flex items-center gap-2 min-w-0">
                  <FileIcon type={item.type} />
                  <p className="text-white text-sm font-semibold truncate">{item.name}</p>
                </div>
                <button onClick={e => { e.stopPropagation(); save(items.filter(i => i.id !== item.id)); if (selected?.id === item.id) setSelected(null); }}
                  className="text-slate-600 hover:text-red-400 shrink-0">
                  <Trash2 size={14} />
                </button>
              </div>

              {/* Relevance Bar */}
              <div className="flex items-center gap-2 mb-2">
                <div className="flex-1 h-1.5 bg-slate-700 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full ${relevanceBg(item.relevance)}`} style={{ width: `${item.relevance}%` }} />
                </div>
                <span className={`text-xs font-bold ${relevanceColor(item.relevance)}`}>{item.relevance}%</span>
              </div>

              <p className="text-slate-400 text-xs line-clamp-2">{item.summary}</p>

              <div className="flex flex-wrap gap-1 mt-2">
                {item.tags.slice(0, 3).map((tag, i) => (
                  <span key={i} className="px-1.5 py-0.5 bg-slate-700 text-slate-300 text-xs rounded">{tag}</span>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Detail */}
        <div className="lg:col-span-3">
          {selected ? (
            <div className="bg-slate-800/60 border border-slate-700 rounded-xl overflow-hidden sticky top-4">
              <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700">
                <div className="flex items-center gap-2 min-w-0">
                  <FileIcon type={selected.type} />
                  <h2 className="text-white font-bold truncate">{selected.name}</h2>
                </div>
                <button onClick={() => setSelected(null)} className="text-slate-400 hover:text-white">
                  <X size={18} />
                </button>
              </div>

              <div className="p-5 space-y-5 max-h-[80vh] overflow-y-auto">
                {/* Image Preview */}
                {selected.dataUrl && (
                  <img src={selected.dataUrl} alt={selected.name} className="w-full rounded-lg border border-slate-700 max-h-48 object-contain bg-slate-900" />
                )}

                {/* Relevance */}
                <div className="flex items-center gap-3 p-4 bg-slate-900/50 rounded-xl border border-slate-700">
                  <TrendingUp size={20} className={relevanceColor(selected.relevance)} />
                  <div className="flex-1">
                    <p className="text-xs text-slate-400 mb-1">Case Relevance Score</p>
                    <div className="flex items-center gap-3">
                      <div className="flex-1 h-3 bg-slate-700 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full transition-all ${relevanceBg(selected.relevance)}`} style={{ width: `${selected.relevance}%` }} />
                      </div>
                      <span className={`text-xl font-black ${relevanceColor(selected.relevance)}`}>{selected.relevance}%</span>
                    </div>
                  </div>
                </div>

                {/* Summary */}
                <div>
                  <p className="text-xs text-slate-500 uppercase tracking-wider mb-2">Summary</p>
                  <p className="text-slate-200 text-sm leading-relaxed">{selected.summary}</p>
                </div>

                {/* Key Facts */}
                {selected.keyFacts?.length > 0 && (
                  <div>
                    <p className="text-xs text-blue-400 uppercase tracking-wider mb-2 flex items-center gap-1">
                      <CheckCircle size={11} /> Key Facts
                    </p>
                    <ul className="space-y-1.5">
                      {selected.keyFacts.map((f, i) => (
                        <li key={i} className="flex gap-2 text-slate-300 text-sm">
                          <span className="text-blue-400 mt-0.5 shrink-0">•</span> {f}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Concerns */}
                {selected.concerns?.length > 0 && (
                  <div>
                    <p className="text-xs text-red-400 uppercase tracking-wider mb-2 flex items-center gap-1">
                      <AlertCircle size={11} /> Concerns / Weaknesses
                    </p>
                    <ul className="space-y-1.5">
                      {selected.concerns.map((c, i) => (
                        <li key={i} className="flex gap-2 text-slate-300 text-sm">
                          <span className="text-red-400 mt-0.5 shrink-0">⚠</span> {c}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Tags */}
                <div>
                  <p className="text-xs text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1">
                    <Tag size={11} /> Tags
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {selected.tags.map((tag, i) => (
                      <span key={i} className="px-2 py-1 bg-gold-900/30 text-gold-400 text-xs rounded-full border border-gold-700/30">{tag}</span>
                    ))}
                  </div>
                </div>

                <p className="text-slate-600 text-xs">Added {new Date(selected.timestamp).toLocaleString()} · {(selected.size / 1024 / 1024).toFixed(2)} MB</p>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center h-64 bg-slate-800/30 border border-slate-700 rounded-xl">
              <div className="text-center">
                <Eye className="mx-auto mb-3 text-slate-600" size={40} />
                <p className="text-slate-400">Select an evidence item to view analysis.</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default EvidenceVault;
