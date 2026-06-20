import React, { useState, useContext } from 'react';
import { AppContext } from '../App';
import { FileText, Download, Copy, Loader, ChevronDown, Sparkles } from 'lucide-react';
import { deepseekChat } from '../services/deepseek';

const DOCUMENT_TYPES = [
  { id: 'complaint', label: 'Complaint / Petition', icon: '⚖️', desc: 'Initiating pleading to start a lawsuit' },
  { id: 'answer', label: 'Answer & Affirmative Defenses', icon: '🛡️', desc: 'Response to complaint with defenses' },
  { id: 'motion_dismiss', label: 'Motion to Dismiss', icon: '📋', desc: 'Challenge sufficiency of complaint' },
  { id: 'motion_summary', label: 'Motion for Summary Judgment', icon: '⚡', desc: 'No genuine dispute of material fact' },
  { id: 'demand_letter', label: 'Demand Letter', icon: '📨', desc: 'Pre-litigation settlement demand' },
  { id: 'foia', label: 'FOIA / Public Records Request', icon: '🔍', desc: 'Freedom of Information Act request' },
  { id: 'subpoena', label: 'Subpoena', icon: '📜', desc: 'Compel testimony or document production' },
  { id: 'affidavit', label: 'Affidavit / Declaration', icon: '✍️', desc: 'Sworn statement of facts' },
  { id: 'brief', label: 'Legal Brief / Memorandum', icon: '📖', desc: 'Persuasive legal argument with citations' },
  { id: 'interrogatories', label: 'Interrogatories', icon: '❓', desc: 'Written discovery questions' },
  { id: 'rfp', label: 'Request for Production', icon: '📁', desc: 'Demand for documents and evidence' },
  { id: 'rfa', label: 'Request for Admission', icon: '✅', desc: 'Admit or deny specific facts' },
  { id: 'opening', label: 'Opening Statement', icon: '🎤', desc: 'Trial opening narrative' },
  { id: 'closing', label: 'Closing Argument', icon: '🏁', desc: 'Persuasive trial closing' },
  { id: 'engagement', label: 'Engagement Letter', icon: '🤝', desc: 'Attorney-client fee agreement' },
  { id: 'settlement', label: 'Settlement Agreement', icon: '🕊️', desc: 'Binding dispute resolution agreement' },
];

const buildPrompt = (docType: string, caseData: any, customInstructions: string, jurisdiction: string) => {
  const caseContext = caseData ? `
Case: ${caseData.title}
Client: ${caseData.client}
Opposing Counsel: ${caseData.opposingCounsel || 'Unknown'}
Judge: ${caseData.judge || 'Unknown'}
Status: ${caseData.status}
Summary: ${caseData.summary || 'No summary provided'}
` : 'No specific case selected.';

  const docLabel = DOCUMENT_TYPES.find(d => d.id === docType)?.label || docType;

  return `You are a senior litigation attorney. Draft a complete, professional ${docLabel} for the following case.

${caseContext}
Jurisdiction: ${jurisdiction || 'Federal Court / General'}
Additional Instructions: ${customInstructions || 'None'}

Requirements:
- Use proper legal formatting with all standard sections
- Include realistic placeholder brackets [LIKE THIS] where specific facts need to be filled in
- Write in formal legal style appropriate for filing
- Include all required sections for this document type
- Make it comprehensive and ready to customize
- Add a brief DRAFTING NOTES section at the end with tips for completing the document

Draft the complete ${docLabel} now:`;
};

const DocumentCenter: React.FC = () => {
  const { cases, activeCase } = useContext(AppContext);

  const [selectedDoc, setSelectedDoc] = useState('complaint');
  const [jurisdiction, setJurisdiction] = useState('');
  const [customInstructions, setCustomInstructions] = useState('');
  const [generatedDoc, setGeneratedDoc] = useState('');
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [selectedCase, setSelectedCase] = useState<any>(activeCase);

  const generateDocument = async () => {
    setLoading(true);
    setGeneratedDoc('');
    try {
      const prompt = buildPrompt(selectedDoc, selectedCase, customInstructions, jurisdiction);

      const text = await deepseekChat({
        systemInstruction: 'You are an expert legal document drafter. Return only the document text, no markdown.',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.4,
        maxTokens: 4096,
      });
      setGeneratedDoc(text || 'Failed to generate document. Please try again.');
    } catch (e) {
      setGeneratedDoc('Error generating document. Please check your API configuration.');
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(generatedDoc);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const downloadDoc = () => {
    const blob = new Blob([generatedDoc], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const docLabel = DOCUMENT_TYPES.find(d => d.id === selectedDoc)?.label || selectedDoc;
    a.href = url;
    a.download = `${docLabel.replace(/\s+/g, '_')}_${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-serif font-bold text-white flex items-center gap-2">
          <FileText className="text-gold-400" /> Document Drafting Center
        </h1>
        <p className="text-slate-400 mt-1">AI-powered generation of any legal document — ready to customize and file.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left — Config */}
        <div className="lg:col-span-1 space-y-4">
          {/* Case selector */}
          <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4">
            <label className="block text-xs font-bold text-slate-400 uppercase mb-2">Active Case</label>
            <select
              value={selectedCase?.id || ''}
              onChange={e => setSelectedCase(cases?.find((c: any) => c.id === e.target.value) || null)}
              className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-gold-500/50"
            >
              <option value="">No case selected</option>
              {cases?.map((c: any) => (
                <option key={c.id} value={c.id}>{c.title}</option>
              ))}
            </select>
          </div>

          {/* Document type */}
          <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4">
            <label className="block text-xs font-bold text-slate-400 uppercase mb-2">Document Type</label>
            <div className="space-y-1 max-h-80 overflow-y-auto pr-1">
              {DOCUMENT_TYPES.map(doc => (
                <button
                  key={doc.id}
                  onClick={() => setSelectedDoc(doc.id)}
                  className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors flex items-start gap-2 ${selectedDoc === doc.id ? 'bg-gold-500/20 border border-gold-500/40 text-gold-200' : 'hover:bg-slate-700 text-slate-300 border border-transparent'}`}
                >
                  <span className="text-base leading-none mt-0.5">{doc.icon}</span>
                  <div>
                    <div className="font-medium">{doc.label}</div>
                    <div className="text-xs text-slate-500">{doc.desc}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Jurisdiction */}
          <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4">
            <label className="block text-xs font-bold text-slate-400 uppercase mb-2">Jurisdiction</label>
            <input
              type="text"
              value={jurisdiction}
              onChange={e => setJurisdiction(e.target.value)}
              placeholder="e.g. SDNY, Illinois State, Federal"
              className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm placeholder-slate-500 focus:outline-none focus:border-gold-500/50"
            />
          </div>

          {/* Custom instructions */}
          <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4">
            <label className="block text-xs font-bold text-slate-400 uppercase mb-2">Additional Instructions</label>
            <textarea
              value={customInstructions}
              onChange={e => setCustomInstructions(e.target.value)}
              placeholder="e.g. Aggressive tone, include damages calculation, focus on punitive damages..."
              rows={3}
              className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm placeholder-slate-500 resize-none focus:outline-none focus:border-gold-500/50"
            />
          </div>

          <button
            onClick={generateDocument}
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-gold-500 to-amber-500 hover:from-gold-400 hover:to-amber-400 disabled:opacity-50 text-slate-900 font-bold py-3 rounded-xl transition-all"
          >
            {loading ? <><Loader size={18} className="animate-spin" /> Drafting...</> : <><Sparkles size={18} /> Generate Document</>}
          </button>
        </div>

        {/* Right — Output */}
        <div className="lg:col-span-2">
          <div className="bg-slate-800/50 border border-slate-700 rounded-xl h-full flex flex-col min-h-[600px]">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700">
              <span className="font-semibold text-white text-sm">
                {DOCUMENT_TYPES.find(d => d.id === selectedDoc)?.icon} {DOCUMENT_TYPES.find(d => d.id === selectedDoc)?.label}
              </span>
              {generatedDoc && (
                <div className="flex gap-2">
                  <button onClick={copyToClipboard} className="flex items-center gap-1 text-xs bg-slate-700 hover:bg-slate-600 text-slate-300 px-3 py-1.5 rounded-lg transition-colors">
                    <Copy size={12} /> {copied ? 'Copied!' : 'Copy'}
                  </button>
                  <button onClick={downloadDoc} className="flex items-center gap-1 text-xs bg-gold-500/20 hover:bg-gold-500/30 text-gold-300 border border-gold-500/30 px-3 py-1.5 rounded-lg transition-colors">
                    <Download size={12} /> Download
                  </button>
                </div>
              )}
            </div>
            <div className="flex-1 p-4 overflow-y-auto">
              {loading ? (
                <div className="flex flex-col items-center justify-center h-full text-slate-400 gap-4">
                  <Loader size={32} className="animate-spin text-gold-400" />
                  <div className="text-center">
                    <p className="font-medium">Drafting your document...</p>
                    <p className="text-sm text-slate-500 mt-1">This usually takes 15-30 seconds</p>
                  </div>
                </div>
              ) : generatedDoc ? (
                <pre className="whitespace-pre-wrap text-slate-200 text-sm font-mono leading-relaxed">{generatedDoc}</pre>
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-slate-500 gap-3">
                  <FileText size={48} className="opacity-30" />
                  <p className="text-center">Select a document type and click <strong>Generate Document</strong> to draft it with AI.</p>
                  <p className="text-xs text-slate-600 text-center">Documents are generated with proper legal formatting and placeholder brackets for customization.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DocumentCenter;
