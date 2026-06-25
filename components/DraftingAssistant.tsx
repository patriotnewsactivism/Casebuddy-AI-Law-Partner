
import React, { useState, useContext, useMemo} from 'react';
import { AppContext } from '../App';
import { FileText, Sparkles, Download, Copy, Check, AlertCircle, Loader2, FileDown } from 'lucide-react';
import { printAsPdf, textToPdfHtml } from '../utils/pdfExport';
import AgentHeader from './AgentHeader';
import { OPERATIONAL_AGENTS } from '../agents/personas';
import VoiceMicButton from './VoiceMicButton';
import { deepseekChat } from '../services/deepseek';
import AIDisclaimer from './AIDisclaimer';

const DOC = OPERATIONAL_AGENTS.find(a => a.id === 'doc')!;

type DocumentTemplate =
  | 'motion-to-dismiss'
  | 'motion-to-suppress'
  | 'motion-in-limine'
  | 'interrogatories'
  | 'request-for-production'
  | 'request-for-admission'
  | 'memorandum-of-law'
  | 'opening-statement'
  | 'closing-argument'
  | 'demand-letter'
  | 'complaint-petition'
  | 'answer-response'
  | 'foia-request'
  | 'subpoena'
  | 'affidavit-declaration'
  | 'engagement-letter';

interface TemplateOption {
  id: DocumentTemplate;
  label: string;
  description: string;
  category: 'Motion' | 'Discovery' | 'Brief' | 'Trial' | 'Pre-Litigation' | 'Pleading' | 'Records';
}

const TEMPLATES: TemplateOption[] = [
  {
    id: 'motion-to-dismiss',
    label: 'Motion to Dismiss',
    description: 'Dismiss claims for failure to state a cause of action',
    category: 'Motion'
  },
  {
    id: 'motion-to-suppress',
    label: 'Motion to Suppress Evidence',
    description: 'Suppress illegally obtained evidence',
    category: 'Motion'
  },
  {
    id: 'motion-in-limine',
    label: 'Motion in Limine',
    description: 'Exclude prejudicial evidence before trial',
    category: 'Motion'
  },
  {
    id: 'interrogatories',
    label: 'Interrogatories',
    description: 'Written questions for opposing party',
    category: 'Discovery'
  },
  {
    id: 'request-for-production',
    label: 'Request for Production of Documents',
    description: 'Request specific documents from opposing party',
    category: 'Discovery'
  },
  {
    id: 'request-for-admission',
    label: 'Request for Admission',
    description: 'Request admission of facts or documents',
    category: 'Discovery'
  },
  {
    id: 'memorandum-of-law',
    label: 'Memorandum of Law',
    description: 'Legal analysis supporting your position',
    category: 'Brief'
  },
  {
    id: 'opening-statement',
    label: 'Opening Statement Draft',
    description: 'Outline for opening statement at trial',
    category: 'Trial'
  },
  {
    id: 'closing-argument',
    label: 'Closing Argument Draft',
    description: 'Outline for closing argument at trial',
    category: 'Trial'
  },
  {
    id: 'demand-letter',
    label: 'Demand Letter',
    description: 'Pre-litigation demand for settlement',
    category: 'Pre-Litigation'
  },
  {
    id: 'complaint-petition',
    label: 'Complaint / Petition',
    description: 'Initiate a lawsuit; state claims and relief sought',
    category: 'Pleading'
  },
  {
    id: 'answer-response',
    label: 'Answer / Response',
    description: 'Respond to a complaint with defenses and admissions/denials',
    category: 'Pleading'
  },
  {
    id: 'foia-request',
    label: 'FOIA / Public Records Request',
    description: 'Request government records under FOIA or state public records law',
    category: 'Records'
  },
  {
    id: 'subpoena',
    label: 'Subpoena',
    description: 'Compel testimony or production of documents',
    category: 'Discovery'
  },
  {
    id: 'affidavit-declaration',
    label: 'Affidavit / Declaration',
    description: 'Sworn statement of facts under penalty of perjury',
    category: 'Pleading'
  },
  {
    id: 'engagement-letter',
    label: 'Engagement Letter',
    description: 'Attorney-client retainer agreement defining scope and fees',
    category: 'Pre-Litigation'
  }
];

const DraftingAssistant = () => {
  const { activeCase, cases } = useContext(AppContext);
  const [selectedTemplate, setSelectedTemplate] = useState<DocumentTemplate | null>(null);
  const [customPrompt, setCustomPrompt] = useState('');
  const [generatedContent, setGeneratedContent] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [uiState, setUiState] = useState<{error: string; copied: boolean}>({error: '', copied: false});
  const error = uiState.error;
  const copied = uiState.copied;
  const setError = (v: string) => setUiState(s => ({...s, error: v}));
  const setCopied = (v: boolean) => setUiState(s => ({...s, copied: v}));
  const [selectedCategory, setSelectedCategory] = useState<string>('All');

  const { categories, filteredTemplates } = useMemo(() => ({
    categories: ['All', ...Array.from(new Set(TEMPLATES.map(t => t.category)))],
    filteredTemplates: selectedCategory === 'All' ? TEMPLATES : TEMPLATES.filter(t => t.category === selectedCategory),
  }), [selectedCategory]);

  const generateDocument = async () => {
    if (!selectedTemplate) {
      setError('Please select a document template');
      return;
    }

    setIsGenerating(true);
    setError('');
    setGeneratedContent('');

    try {
      const template = TEMPLATES.find(t => t.id === selectedTemplate);
      const caseContext = activeCase
        ? `Case: ${activeCase.title}\nClient: ${activeCase.client}\nSummary: ${activeCase.summary}\nOpposing Counsel: ${activeCase.opposingCounsel}\nJudge: ${activeCase.judge}`
        : 'No active case selected. Generate a general template.';

      const foiaGuidance = selectedTemplate === 'foia-request'
        ? `

FOIA / Public Records Request Specific Requirements:
- Identify the appropriate government agency (and the correct office/records custodian within it) that holds the records sought.
- Cite the correct controlling statute: the federal Freedom of Information Act, 5 U.S.C. § 552, for records held by federal agencies, OR the relevant state public records act (e.g., a state's Public Records Act / Open Records Act / Freedom of Information Law) when the records are held by a state or local government body. Identify the applicable statute explicitly.
- Describe the records sought with precision and specificity (date ranges, custodians, subject matter, record types, file/case numbers where known) so the agency can readily locate them, while avoiding overly narrow language that could be used to exclude responsive records.
- Include a fee waiver request, explaining that disclosure is in the public interest and not primarily in the requester's commercial interest where that justification applies.
- Include a request for expedited processing where appropriate, with a brief justification (e.g., compelling need, urgency to inform the public).
- Include a statement requesting that any reasonably segregable non-exempt portions of records be released even if some material is withheld, and that the agency cite the specific exemption for any withholding.
- Provide the statutory response deadline reference and preferred format/delivery for the records.`
        : '';

      const prompt = `You are an expert legal document drafter. Generate a professional ${template?.label} for the following case.

${caseContext}

Additional Instructions: ${customPrompt || 'None'}${foiaGuidance}

Requirements:
1. Use proper legal formatting and citations (use [Citation] placeholders where specific case law would be cited)
2. Include all standard sections for this document type
3. Be persuasive and professionally written
4. Use formal legal language appropriate for court filings
5. Include fact-specific arguments based on the case context
6. If no case context is provided, use [PARTY NAME], [FACTS], etc. as placeholders

Generate the complete document ready for attorney review.`;

      const response = await deepseekChat({
        systemInstruction: 'You are an expert legal document drafter. Return only the document text.',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.7,
        maxTokens: 4096,
      });

      setGeneratedContent(response || '');
      if (response && activeCase) {
        const DOCS_KEY = 'cb_drafted_docs';
        let docs: any[] = [];
        try {
          docs = JSON.parse(localStorage.getItem(DOCS_KEY) ?? '[]');
        } catch {}
        const template = TEMPLATES.find(t => t.id === selectedTemplate);
        const docTypeHint = template?.label || 'Legal Document';
        const docEntry = {
          id: `doc_${Date.now()}`,
          caseId: activeCase.id,
          caseTitle: activeCase.title,
          agentId: 'doc',
          agentName: 'Doc',
          docType: docTypeHint,
          content: response,
          createdAt: Date.now(),
        };
        docs.unshift(docEntry);
        try {
          localStorage.setItem(DOCS_KEY, JSON.stringify(docs.slice(0, 100)));
        } catch {}
      }
    } catch (err: any) {
      console.error('Document generation failed', err);
      setError(`Generation failed: ${err.message || 'Unknown error'}`);
    } finally {
      setIsGenerating(false);
    }
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(generatedContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const downloadDocument = () => {
    const blob = new Blob([generatedContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const template = TEMPLATES.find(t => t.id === selectedTemplate);
    a.download = `${template?.label || 'document'}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportPdf = () => {
    const template = TEMPLATES.find(t => t.id === selectedTemplate);
    const docTitle = template?.label || 'Legal Document';
    const caseInfo = activeCase ? `Case: ${activeCase.title}` : '';
    const html = textToPdfHtml(
      docTitle,
      [caseInfo, `Generated: ${new Date().toLocaleDateString()}`].filter(Boolean).join(' &nbsp;|&nbsp; '),
      generatedContent,
    );
    printAsPdf(docTitle, html);
  };

  return (
    <div className="space-y-6">
      <AgentHeader agent={DOC} compact />
      <div>
        <h1 className="text-3xl font-bold text-white font-serif">Drafting Assistant</h1>
        <p className="text-slate-400 mt-2">AI-powered legal document generation and drafting support</p>
      </div>

      {/* Active Case Display */}
      <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
        <div className="flex items-center gap-2 mb-2">
          <FileText className="text-gold-500" size={20} />
          <h3 className="text-white font-semibold">Active Case Context</h3>
        </div>
        {activeCase ? (
          <div className="text-sm text-slate-300">
            <p><span className="text-slate-400">Case:</span> {activeCase.title}</p>
            <p><span className="text-slate-400">Client:</span> {activeCase.client}</p>
          </div>
        ) : (
          <p className="text-sm text-slate-400">No active case selected. Documents will be generated with generic placeholders.</p>
        )}
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Left Panel - Template Selection */}
        <div className="space-y-4">
          <div>
            <h2 className="text-xl font-semibold text-white mb-3">Select Document Type</h2>

            {/* Category Filter */}
            <div className="flex flex-wrap gap-2 mb-4">
              {categories.map(cat => (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
                    selectedCategory === cat
                      ? 'bg-gold-500 text-slate-900'
                      : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>

            {/* Template Grid */}
            <div className="space-y-2 max-h-64 sm:max-h-96 overflow-y-auto pr-2">
              {filteredTemplates.map(template => (
                <button
                  key={template.id}
                  onClick={() => setSelectedTemplate(template.id)}
                  className={`w-full text-left p-4 rounded-lg border transition-all ${
                    selectedTemplate === template.id
                      ? 'bg-gold-500/10 border-gold-500 ring-2 ring-gold-500/50'
                      : 'bg-slate-800 border-slate-700 hover:border-slate-600'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="font-semibold text-white mb-1">{template.label}</h3>
                      <p className="text-xs text-slate-400">{template.description}</p>
                    </div>
                    <span className="text-xs px-2 py-1 rounded bg-slate-700 text-slate-300">
                      {template.category}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Custom Instructions */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium text-slate-300">
                Additional Instructions (Optional)
              </label>
              <VoiceMicButton size={16} onTranscript={t => setCustomPrompt(prev => prev + (prev ? ' ' : '') + t)} />
            </div>
            <textarea
              value={customPrompt}
              onChange={(e) => setCustomPrompt(e.target.value)}
              placeholder="E.g., Focus on Fourth Amendment violations, cite recent Supreme Court decisions, emphasize client's clean record..."
              className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-gold-500 resize-none"
              rows={4}
            />
          </div>

          {/* Generate Button */}
          <button
            onClick={generateDocument}
            disabled={!selectedTemplate || isGenerating}
            className="w-full bg-gold-500 hover:bg-gold-600 disabled:bg-slate-700 disabled:text-slate-500 text-slate-900 font-semibold py-3 px-6 rounded-lg transition-colors flex items-center justify-center gap-2"
          >
            {isGenerating ? (
              <>
                <Loader2 className="animate-spin" size={20} />
                Generating...
              </>
            ) : (
              <>
                <Sparkles size={20} />
                Generate Document
              </>
            )}
          </button>
        </div>

        {/* Right Panel - Generated Content */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold text-white">Generated Document</h2>
            {generatedContent && (
              <div className="flex gap-2">
                <button
                  onClick={copyToClipboard}
                  className="p-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg transition-colors"
                  title="Copy to clipboard"
                >
                  {copied ? <Check className="text-green-500" size={18} /> : <Copy className="text-slate-300" size={18} />}
                </button>
                <button
                  onClick={downloadDocument}
                  className="p-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg transition-colors"
                  title="Download as text file"
                >
                  <Download className="text-slate-300" size={18} />
                </button>
                <button
                  onClick={exportPdf}
                  className="flex items-center gap-1.5 px-3 py-2 bg-gold-500 hover:bg-gold-400 text-slate-950 font-bold rounded-lg text-sm transition-colors"
                  title="Export as PDF"
                >
                  <FileDown size={15} /> PDF
                </button>
              </div>
            )}
          </div>

          {/* Error Display */}
          {error && (
            <div className="bg-red-900/20 border border-red-700 rounded-lg p-4 flex items-start gap-3">
              <AlertCircle className="text-red-500 flex-shrink-0 mt-0.5" size={20} />
              <div>
                <p className="text-red-400 font-semibold">Error</p>
                <p className="text-red-300 text-sm mt-1">{error}</p>
              </div>
            </div>
          )}

          {/* Generated Content Display */}
          <div className="bg-slate-800 border border-slate-700 rounded-lg p-4 md:p-6 min-h-[300px] sm:min-h-[500px] max-h-[500px] sm:max-h-[600px] overflow-y-auto">
            {generatedContent ? (
              <div className="prose prose-invert prose-sm max-w-none">
                <pre className="whitespace-pre-wrap font-mono text-sm text-slate-200 leading-relaxed">
                  {generatedContent}
                </pre>
              </div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-slate-500 text-center">
                <FileText size={48} className="mb-4 opacity-50" />
                <p className="text-lg font-medium">No document generated yet</p>
                <p className="text-sm mt-2">Select a template and click "Generate Document" to begin</p>
              </div>
            )}
          </div>

          {generatedContent && (
            <AIDisclaimer variant="full" />
          )}
        </div>
      </div>
    </div>
  );
};

export default DraftingAssistant;
