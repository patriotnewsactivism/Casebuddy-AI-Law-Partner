
import React, { useContext, useState } from 'react';
import { AppContext } from '../App';
import { Case, CaseStatus } from '../types';
import { FileText, Upload, Eye, AlertTriangle, CheckCircle, Search, BrainCircuit, Plus, X, BookOpen, Library } from 'lucide-react';
import { analyzeDocument, fileToGenerativePart } from '../services/geminiService';
import { MOCK_CASE_TEMPLATES } from '../constants';
import { handleError, handleSuccess } from '../utils/errorHandler';
import { validateFile } from '../utils/fileValidation';

const CaseManager = () => {
  const { cases, activeCase, setActiveCase, addCase } = useContext(AppContext);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<any>(null);
  const [inputText, setInputText] = useState('');
  
  const [showNewCaseModal, setShowNewCaseModal] = useState(false);
  const [showLibraryModal, setShowLibraryModal] = useState(false);
  
  const [newCaseData, setNewCaseData] = useState<Partial<Case>>({
    title: '',
    client: '',
    opposingCounsel: '',
    judge: '',
    summary: ''
  });

  const handleAnalyze = async () => {
    if (!inputText.trim()) {
      handleError(new Error('Empty input'), 'Please enter text to analyze', 'CaseManager');
      return;
    }
    setAnalyzing(true);
    setAnalysisResult(null);
    try {
      const result = await analyzeDocument(inputText);
      setAnalysisResult(result);
      handleSuccess('Document analyzed successfully');
    } catch (e) {
      handleError(e, 'Failed to analyze document. Please check your API key and try again.', 'CaseManager');
    } finally {
      setAnalyzing(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file before uploading
    const validation = validateFile(file, {
      maxSizeBytes: 10 * 1024 * 1024, // 10MB
      allowedTypes: ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'application/pdf']
    });

    if (!validation.valid) {
      handleError(new Error(validation.error), validation.error || 'File validation failed', 'CaseManager');
      e.target.value = ''; // Reset file input
      return;
    }

    setAnalyzing(true);
    setAnalysisResult(null);
    try {
      const imagePart = await fileToGenerativePart(file);
      const result = await analyzeDocument("Analyze this image document.", imagePart);
      setAnalysisResult(result);
      handleSuccess('File analyzed successfully');
    } catch (e) {
      handleError(e, 'Failed to process file. Please check your API key and try again.', 'CaseManager');
    } finally {
      setAnalyzing(false);
      e.target.value = ''; // Reset file input after upload
    }
  };

  const handleCreateCase = (e: React.FormEvent) => {
    e.preventDefault();

    // Input validation
    if (!newCaseData.title?.trim()) {
      handleError(new Error('Missing title'), 'Please enter a case title', 'CaseManager');
      return;
    }

    if (!newCaseData.client?.trim()) {
      handleError(new Error('Missing client'), 'Please enter a client name', 'CaseManager');
      return;
    }

    const newCase: Case = {
      id: Date.now().toString(),
      title: newCaseData.title.trim(),
      client: newCaseData.client.trim(),
      status: CaseStatus.PRE_TRIAL,
      opposingCounsel: newCaseData.opposingCounsel?.trim() || 'Unknown',
      judge: newCaseData.judge?.trim() || 'Unknown',
      nextCourtDate: 'TBD',
      summary: newCaseData.summary?.trim() || 'No summary provided.',
      winProbability: 50
    };
    addCase(newCase);
    handleSuccess(`Case "${newCase.title}" created successfully`);
    setShowNewCaseModal(false);
    setNewCaseData({ title: '', client: '', opposingCounsel: '', judge: '', summary: '' });
  };

  const handleLoadTemplate = (template: Case) => {
    // Create a deep copy with a new ID to avoid conflicts if added multiple times
    const newCase = { ...template, id: Date.now().toString() };
    addCase(newCase);
    handleSuccess(`Template "${newCase.title}" loaded successfully`);
    setShowLibraryModal(false);
  };

  return (
    <div className="h-full flex flex-col lg:flex-row gap-8">
      {/* Case List Sidebar */}
      <div className="w-full lg:w-1/3 flex flex-col gap-6">
        <div className="flex items-center justify-between">
           <h2 className="text-2xl font-bold font-serif text-white">Case Files</h2>
           <div className="flex gap-2">
             <button 
               onClick={() => setShowLibraryModal(true)}
               className="p-2 bg-slate-700 hover:bg-slate-600 text-gold-500 rounded-lg transition-colors"
               title="Practice Library (Mock Cases)"
             >
               <Library size={20} />
             </button>
             <button 
               onClick={() => setShowNewCaseModal(true)}
               className="p-2 bg-gold-600 hover:bg-gold-500 text-slate-900 rounded-lg transition-colors"
               title="New Case"
             >
               <Plus size={20} />
             </button>
           </div>
        </div>

        <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden min-h-[200px] flex-1 flex flex-col">
          {cases.length === 0 ? (
            <div className="p-8 text-center text-slate-500 flex-1 flex flex-col items-center justify-center">
              <BookOpen size={32} className="mb-3 opacity-50" />
              <p className="mb-4">No active cases found.</p>
              <div className="flex flex-col gap-3 w-full">
                <button 
                  onClick={() => setShowNewCaseModal(true)}
                  className="text-gold-500 hover:underline text-sm font-medium"
                >
                  + Create Real Case
                </button>
                <span className="text-xs opacity-50">- OR -</span>
                <button 
                  onClick={() => setShowLibraryModal(true)}
                  className="bg-slate-700 hover:bg-slate-600 text-white py-2 px-4 rounded text-sm transition-colors"
                >
                  Browse Mock Trial Library
                </button>
              </div>
            </div>
          ) : (
            <div className="overflow-y-auto max-h-[600px]">
              {cases.map(c => (
                <div 
                  key={c.id}
                  onClick={() => setActiveCase(c)}
                  className={`p-4 border-b border-slate-700 cursor-pointer transition-colors ${activeCase?.id === c.id ? 'bg-slate-700/50 border-l-4 border-l-gold-500' : 'hover:bg-slate-700/30'}`}
                >
                  <h3 className="font-semibold text-white">{c.title}</h3>
                  <p className="text-xs text-slate-400 mt-1">{c.status} • {c.client}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        {activeCase && (
          <div className="bg-slate-800 p-6 rounded-xl border border-slate-700">
            <h3 className="text-lg font-semibold text-white mb-2">Case Details</h3>
            <div className="space-y-3 text-sm">
              <div>
                <span className="text-slate-400 block">Judge</span>
                <span className="text-slate-200">{activeCase.judge}</span>
              </div>
              <div>
                <span className="text-slate-400 block">Opposing Counsel</span>
                <span className="text-slate-200">{activeCase.opposingCounsel}</span>
              </div>
              <div>
                <span className="text-slate-400 block">Summary</span>
                <span className="text-slate-300 leading-relaxed">{activeCase.summary}</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Document Analysis Area */}
      <div className="flex-1 flex flex-col gap-6">
        <h2 className="text-2xl font-bold font-serif text-white">AI Document Intelligence</h2>
        
        <div className="bg-slate-800 rounded-xl border border-slate-700 p-6 flex-1 flex flex-col">
          <div className="mb-6">
            <label className="block text-sm font-medium text-slate-300 mb-2">Quick Analysis (Paste Text or Upload)</label>
            <div className="flex gap-2 mb-2">
               <textarea 
                  className="w-full bg-slate-900 border border-slate-600 rounded-lg p-3 text-slate-200 text-sm focus:border-gold-500 focus:ring-1 focus:ring-gold-500 outline-none transition-all h-32"
                  placeholder="Paste legal text here (depositions, motions, police reports)..."
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                />
            </div>
            
            <div className="flex items-center justify-between">
              <div className="relative">
                 <input 
                    type="file" 
                    id="doc-upload" 
                    className="hidden" 
                    accept="image/*,application/pdf"
                    onChange={handleFileUpload}
                 />
                 <label htmlFor="doc-upload" className="flex items-center gap-2 cursor-pointer text-sm text-slate-400 hover:text-white transition-colors px-3 py-2 rounded-lg hover:bg-slate-700">
                    <Upload size={16} />
                    Upload Scan/Image
                 </label>
              </div>
              <button 
                onClick={handleAnalyze}
                disabled={analyzing}
                className="bg-gold-600 hover:bg-gold-500 text-slate-900 px-6 py-2 rounded-lg font-semibold text-sm transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {analyzing ? 'Processing...' : <><Search size={16} /> Analyze</>}
              </button>
            </div>
          </div>

          {/* Results Area */}
          <div className="flex-1 bg-slate-900/50 rounded-lg border border-slate-700 p-4 overflow-y-auto">
            {!analysisResult && !analyzing && (
              <div className="h-full flex flex-col items-center justify-center text-slate-500 opacity-50">
                <FileText size={48} className="mb-4" />
                <p>No analysis results yet.</p>
              </div>
            )}

            {analyzing && (
               <div className="h-full flex flex-col items-center justify-center text-gold-500 animate-pulse">
                 <BrainCircuit size={48} className="mb-4" />
                 <p>AI is reading and cross-referencing...</p>
               </div>
            )}

            {analysisResult && (
              <div className="space-y-6 animate-fadeIn">
                <div>
                  <h4 className="flex items-center gap-2 text-gold-500 font-semibold mb-2">
                    <Eye size={18} />
                    Summary
                  </h4>
                  <p className="text-slate-300 text-sm leading-relaxed bg-slate-800 p-3 rounded border border-slate-700">
                    {analysisResult.summary}
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <h4 className="flex items-center gap-2 text-blue-400 font-semibold mb-2">
                      <CheckCircle size={18} />
                      Key Entities
                    </h4>
                    <ul className="bg-slate-800 p-3 rounded border border-slate-700 space-y-1">
                      {analysisResult.entities?.map((ent: string, i: number) => (
                        <li key={i} className="text-xs text-slate-300 px-2 py-1 bg-slate-700/50 rounded inline-block mr-2 mb-1">
                          {ent}
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div>
                    <h4 className="flex items-center gap-2 text-red-400 font-semibold mb-2">
                      <AlertTriangle size={18} />
                      Risks & Contradictions
                    </h4>
                    <ul className="bg-slate-800 p-3 rounded border border-slate-700 space-y-2">
                      {analysisResult.risks?.map((risk: string, i: number) => (
                        <li key={i} className="text-sm text-slate-300 flex items-start gap-2">
                          <span className="text-red-500 mt-1">•</span>
                          {risk}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* New Case Modal */}
      {showNewCaseModal && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-700 rounded-xl p-6 w-full max-w-md shadow-2xl">
             <div className="flex justify-between items-center mb-4">
               <h3 className="text-xl font-bold text-white">Add New Case</h3>
               <button onClick={() => setShowNewCaseModal(false)} className="text-slate-400 hover:text-white"><X size={24} /></button>
             </div>
             <form onSubmit={handleCreateCase} className="space-y-4">
                <div>
                  <label className="block text-sm text-slate-400 mb-1">Case Title</label>
                  <input 
                    required
                    type="text" 
                    className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-white focus:border-gold-500 outline-none" 
                    value={newCaseData.title}
                    onChange={e => setNewCaseData({...newCaseData, title: e.target.value})}
                  />
                </div>
                <div>
                  <label className="block text-sm text-slate-400 mb-1">Client Name</label>
                  <input 
                    required
                    type="text" 
                    className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-white focus:border-gold-500 outline-none"
                    value={newCaseData.client}
                    onChange={e => setNewCaseData({...newCaseData, client: e.target.value})}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                   <div>
                      <label className="block text-sm text-slate-400 mb-1">Opposing Counsel</label>
                      <input 
                        type="text" 
                        className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-white focus:border-gold-500 outline-none"
                        value={newCaseData.opposingCounsel}
                        onChange={e => setNewCaseData({...newCaseData, opposingCounsel: e.target.value})}
                      />
                   </div>
                   <div>
                      <label className="block text-sm text-slate-400 mb-1">Judge</label>
                      <input 
                        type="text" 
                        className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-white focus:border-gold-500 outline-none"
                        value={newCaseData.judge}
                        onChange={e => setNewCaseData({...newCaseData, judge: e.target.value})}
                      />
                   </div>
                </div>
                <div>
                  <label className="block text-sm text-slate-400 mb-1">Case Summary / Context</label>
                  <textarea 
                    required
                    rows={3}
                    className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-white text-sm focus:border-gold-500 outline-none"
                    placeholder="Briefly describe the charges or civil complaint..."
                    value={newCaseData.summary}
                    onChange={e => setNewCaseData({...newCaseData, summary: e.target.value})}
                  />
                </div>
                <button 
                  type="submit"
                  className="w-full bg-gold-600 hover:bg-gold-500 text-slate-900 font-bold py-3 rounded-lg mt-2"
                >
                  Create Case
                </button>
             </form>
          </div>
        </div>
      )}

      {/* Library (Mock Cases) Modal */}
      {showLibraryModal && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
           <div className="bg-slate-900 border border-slate-700 rounded-xl p-6 w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl">
              <div className="flex justify-between items-center mb-6 flex-shrink-0">
                <div>
                  <h3 className="text-2xl font-bold font-serif text-white flex items-center gap-3">
                    <Library className="text-gold-500" /> Practice Library
                  </h3>
                  <p className="text-slate-400 text-sm mt-1">Select a scenario to practice with if you don't have real case data.</p>
                </div>
                <button onClick={() => setShowLibraryModal(false)} className="text-slate-400 hover:text-white"><X size={24} /></button>
              </div>
              
              <div className="overflow-y-auto custom-scrollbar pr-2 space-y-8 flex-1">
                 {MOCK_CASE_TEMPLATES.map((section, idx) => (
                    <div key={idx}>
                       <h4 className="text-lg font-bold text-white mb-3 sticky top-0 bg-slate-900 py-2 border-b border-slate-800 z-10">
                         {section.category}
                       </h4>
                       <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                          {section.cases.map((templateCase) => (
                             <button 
                               key={templateCase.id}
                               onClick={() => handleLoadTemplate(templateCase)}
                               className="bg-slate-800 hover:bg-slate-700 border border-slate-700 hover:border-gold-500/50 rounded-lg p-4 text-left transition-all group"
                             >
                                <div className="flex justify-between items-start mb-2">
                                   <span className="text-xs font-bold text-gold-500 uppercase tracking-wider border border-gold-500/30 px-2 py-0.5 rounded">
                                      {templateCase.status}
                                   </span>
                                </div>
                                <h5 className="font-bold text-white text-lg mb-1 group-hover:text-gold-400 transition-colors">{templateCase.title}</h5>
                                <p className="text-xs text-slate-400 mb-3 line-clamp-1">vs. {templateCase.opposingCounsel}</p>
                                <p className="text-sm text-slate-300 line-clamp-3 leading-relaxed">
                                   {templateCase.summary}
                                </p>
                             </button>
                          ))}
                       </div>
                    </div>
                 ))}
              </div>
           </div>
        </div>
      )}
    </div>
  );
};

export default CaseManager;
