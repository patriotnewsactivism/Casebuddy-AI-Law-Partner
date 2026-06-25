import React, { useState, useEffect, useMemo} from 'react';
import {
  FileText, Sparkles, Download, Copy, Check, AlertCircle, Loader2,
  Send, Trash2, Save, Mail, X, Clock,
} from 'lucide-react';
import { GoogleGenAI } from "@google/genai";
import AgentHeader from './AgentHeader';
import AIDisclaimer from './AIDisclaimer';
import { OPERATIONAL_AGENTS } from '../agents/personas';
import { toast } from 'react-toastify';

const MAX = OPERATIONAL_AGENTS.find(a => a.id === 'max')!;

const apiKey = process.env.API_KEY || '';
const ai = new GoogleGenAI({ apiKey });

const STORAGE_KEY = 'casebuddy_foia_requests';

type Jurisdiction = 'Federal' | 'State' | 'County' | 'Municipal';
type FoiaStatus = 'draft' | 'submitted' | 'acknowledged' | 'fulfilled' | 'denied' | 'overdue';

interface FoiaRequest {
  id: string;
  agency: string;
  jurisdiction: string;
  state: string;
  recordsSought: string;
  letterText: string;
  status: FoiaStatus;
  submittedDate: string;   // ISO, set when marked submitted
  responseDeadline: string; // ISO, auto-calc approximation
  createdAt: number;
}

const STATUS_OPTIONS: FoiaStatus[] = ['draft', 'submitted', 'acknowledged', 'fulfilled', 'denied', 'overdue'];

const STATUS_BADGE: Record<FoiaStatus, string> = {
  draft:        'bg-slate-700 border-slate-600 text-slate-300',
  submitted:    'bg-blue-500/15 border-blue-500/30 text-blue-400',
  acknowledged: 'bg-violet-500/15 border-violet-500/30 text-violet-400',
  fulfilled:    'bg-green-500/15 border-green-500/30 text-green-400',
  denied:       'bg-red-500/15 border-red-500/30 text-red-400',
  overdue:      'bg-red-500/20 border-red-500/40 text-red-400',
};

// ~28 calendar days approximates 20 business days (federal FOIA) and most state acts
const DEADLINE_DAYS = 28;

const todayISO = () => new Date().toISOString();

const addDays = (iso: string, days: number) => {
  const d = new Date(iso);
  d.setDate(d.getDate() + days);
  return d.toISOString();
};

const daysUntil = (iso: string) => {
  if (!iso) return null;
  const due = new Date(iso);
  const now = new Date();
  due.setHours(0, 0, 0, 0);
  now.setHours(0, 0, 0, 0);
  return Math.round((due.getTime() - now.getTime()) / 86_400_000);
};

const deadlineBadge = (req: FoiaRequest) => {
  if (!req.responseDeadline || req.status === 'draft') return null;
  if (req.status === 'fulfilled') {
    return <span className="text-xs px-2 py-0.5 rounded-full bg-green-500/15 border border-green-500/30 text-green-400 font-semibold">Fulfilled</span>;
  }
  if (req.status === 'denied') {
    return <span className="text-xs px-2 py-0.5 rounded-full bg-red-500/15 border border-red-500/30 text-red-400 font-semibold">Denied</span>;
  }
  const days = daysUntil(req.responseDeadline);
  if (days === null) return null;
  if (days < 0)   return <span className="text-xs px-2 py-0.5 rounded-full bg-red-500/20 border border-red-500/40 text-red-400 font-bold">Overdue {Math.abs(days)}d</span>;
  if (days === 0) return <span className="text-xs px-2 py-0.5 rounded-full bg-red-500/20 border border-red-500/40 text-red-400 font-bold animate-pulse">Due Today!</span>;
  if (days <= 7)  return <span className="text-xs px-2 py-0.5 rounded-full bg-red-500/15 border border-red-500/30 text-red-400 font-semibold">{days}d left</span>;
  if (days <= 14) return <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-400 font-semibold">{days}d left</span>;
  return <span className="text-xs px-2 py-0.5 rounded-full bg-slate-700 border border-slate-600 text-slate-400">{days}d left</span>;
};

const cardBorder = (req: FoiaRequest) => {
  if (req.status === 'fulfilled') return 'border-green-500/30 bg-green-500/5';
  if (req.status === 'denied')    return 'border-red-500/40 bg-red-500/6';
  const days = req.responseDeadline ? daysUntil(req.responseDeadline) : null;
  if (days !== null && days < 0 && (req.status === 'submitted' || req.status === 'acknowledged' || req.status === 'overdue')) {
    return 'border-red-500/50 bg-red-500/8';
  }
  if (days !== null && days <= 7 && days >= 0) return 'border-amber-500/40 bg-amber-500/6';
  return 'border-slate-700 bg-slate-800/40';
};

const isPastDeadline = (req: FoiaRequest) => {
  const days = req.responseDeadline ? daysUntil(req.responseDeadline) : null;
  return days !== null && days < 0;
};

const canFollowUp = (req: FoiaRequest) =>
  (req.status === 'submitted' || req.status === 'acknowledged') && isPastDeadline(req);

const EMPTY_FORM = {
  agency: '',
  jurisdiction: 'County' as Jurisdiction,
  state: '',
  recordsSought: '',
  dateFrom: '',
  dateTo: '',
  feeWaiver: true,
  expedited: false,
};

const FoiaCenter: React.FC = () => {
  // ---- Generator state ----
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [generatedLetter, setGeneratedLetter] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  // ---- Tracker state ----
  const [requests, setRequests] = useState<FoiaRequest[]>(() => {

  const [requestSearch, setRequestSearch] = React.useState('');
  const filteredRequests = useMemo(() => {
    if (!requestSearch.trim()) return requests;
    const q = requestSearch.toLowerCase();
    return requests.filter(r =>
      r.agency?.toLowerCase().includes(q) ||
      r.subject?.toLowerCase().includes(q) ||
      r.status?.toLowerCase().includes(q)
    );
  }, [requests, requestSearch]);
    try { const s = localStorage.getItem(STORAGE_KEY); return s ? JSON.parse(s) : []; }
    catch { return []; }
  });
  const [followUpId, setFollowUpId] = useState<string | null>(null);
  const [followUpText, setFollowUpText] = useState('');
  const [followUpLoading, setFollowUpLoading] = useState(false);
  const [followUpCopied, setFollowUpCopied] = useState(false);

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(requests)); } catch {}
  }, [requests]);

  // ---- Generator ----
  const buildPrompt = () => {
    const isFederal = form.jurisdiction === 'Federal';
    const statuteGuidance = isFederal
      ? `This is a FEDERAL request. Cite the federal Freedom of Information Act, 5 U.S.C. § 552. State the statutory response deadline of 20 business days.`
      : `This is a ${form.jurisdiction} request in the state of ${form.state || '[STATE]'}. Cite the correct public records statute for ${form.state || 'that state'} (the state's open/public records act — e.g., for New Jersey the Open Public Records Act (OPRA, N.J.S.A. 47:1A-1 et seq.), for California the California Public Records Act (Cal. Gov. Code § 7920 et seq.), for Florida the Florida Public Records Act (Fla. Stat. ch. 119), for Texas the Texas Public Information Act (Tex. Gov. Code ch. 552), etc.). Use the ACTUAL correct statute name and citation for ${form.state || 'the named state'}, and state that state's statutory response deadline.`;

    const dateRange = (form.dateFrom || form.dateTo)
      ? `Limit the records to the date range ${form.dateFrom || '[start]'} through ${form.dateTo || '[present]'}.`
      : 'No specific date range was provided.';

    return `You are an expert at drafting public records requests for an accountability journalist. Draft a complete, professional public records request letter as PLAIN TEXT (no markdown, no asterisks, no headings with #).

AGENCY: ${form.agency || '[AGENCY NAME]'}
JURISDICTION LEVEL: ${form.jurisdiction}
${isFederal ? '' : `STATE: ${form.state || '[STATE]'}`}

RECORDS SOUGHT:
${form.recordsSought || '[DESCRIBE RECORDS]'}

REQUIREMENTS:
1. Address the letter to the appropriate records custodian / FOIA officer at ${form.agency || 'the agency'}.
2. ${statuteGuidance}
3. Precisely describe the records sought, restating them clearly. ${dateRange}
4. ${form.feeWaiver ? 'Include a FEE WAIVER request with a strong public-interest justification — explain that disclosure is in the public interest because it will contribute significantly to public understanding of government operations and activities, that the requester is a member of the news media gathering information for dissemination to the public, and is not seeking the records for commercial use.' : 'Do NOT include a fee waiver request, but ask to be notified before any fees exceed a reasonable amount.'}
5. ${form.expedited ? 'Include an EXPEDITED PROCESSING request, stating a compelling need and that there is an urgency to inform the public about actual or alleged government activity.' : 'Do not request expedited processing.'}
6. Clearly state the statutory response deadline by which the agency must respond.
7. Request the preferred format for production (electronic copies / PDF where possible to minimize cost), and ask that any reasonably segregable non-exempt portions be released even if some material is withheld.
8. Ask that if any portion is withheld, the agency cite the specific statutory exemption for each redaction or withheld record.
9. Close professionally with placeholders [YOUR NAME], [YOUR ADDRESS], [EMAIL], [PHONE] and the date line [DATE].

Output ONLY the letter text, ready to send.`;
  };

  const generateRequest = async () => {
    if (!form.agency.trim()) { setError('Agency name is required'); return; }
    if (!form.recordsSought.trim()) { setError('Describe the records you are seeking'); return; }
    if (form.jurisdiction !== 'Federal' && !form.state.trim()) {
      setError('State is required for non-federal requests (to cite the right statute)');
      return;
    }
    if (!apiKey) {
      setError('API key not configured. Please set GEMINI_API_KEY in .env.local');
      return;
    }

    setIsGenerating(true);
    setError('');
    setGeneratedLetter('');

    try {
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: buildPrompt(),
        config: { temperature: 0.6 },
      });
      const text = response.text || '';
      setGeneratedLetter(text);
      toast.success('Request letter generated');
    } catch (err: any) {
      console.error('FOIA generation failed', err);
      setError(`Generation failed: ${err.message || 'Unknown error'}`);
      toast.error('Generation failed');
    } finally {
      setIsGenerating(false);
    }
  };

  const copyLetter = () => {
    navigator.clipboard.writeText(generatedLetter);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const downloadLetter = () => {
    const blob = new Blob([generatedLetter], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const safe = (form.agency || 'foia-request').replace(/[^a-z0-9]+/gi, '-').toLowerCase();
    a.download = `foia-${safe}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const saveToTracker = () => {
    if (!generatedLetter) { toast.error('Generate a letter first'); return; }
    const req: FoiaRequest = {
      id: `foia_${Date.now()}`,
      agency: form.agency.trim() || 'Unnamed agency',
      jurisdiction: form.jurisdiction,
      state: form.jurisdiction === 'Federal' ? '' : form.state.trim(),
      recordsSought: form.recordsSought.trim(),
      letterText: generatedLetter,
      status: 'draft',
      submittedDate: '',
      responseDeadline: '',
      createdAt: Date.now(),
    };
    setRequests(prev => [req, ...prev]);
    toast.success('Saved to tracker');
  };

  // ---- Tracker actions ----
  const updateRequest = (id: string, patch: Partial<FoiaRequest>) => {
    setRequests(prev => prev.map(r => r.id === id ? { ...r, ...patch } : r));
  };

  const markSubmitted = (req: FoiaRequest) => {
    const now = todayISO();
    updateRequest(req.id, {
      status: 'submitted',
      submittedDate: now,
      responseDeadline: addDays(now, DEADLINE_DAYS),
    });
    toast.success('Marked submitted — deadline set');
  };

  const changeStatus = (req: FoiaRequest, status: FoiaStatus) => {
    const patch: Partial<FoiaRequest> = { status };
    // If moving into submitted and no submit date yet, set it + deadline
    if (status === 'submitted' && !req.submittedDate) {
      const now = todayISO();
      patch.submittedDate = now;
      patch.responseDeadline = addDays(now, DEADLINE_DAYS);
    }
    updateRequest(req.id, patch);
  };

  const removeRequest = (id: string) => {
    setRequests(prev => prev.filter(r => r.id !== id));
    if (followUpId === id) { setFollowUpId(null); setFollowUpText(''); }
    toast.success('Request removed');
  };

  const generateFollowUp = async (req: FoiaRequest) => {
    if (!apiKey) { toast.error('API key not configured'); return; }
    setFollowUpId(req.id);
    setFollowUpText('');
    setFollowUpLoading(true);

    const isFederal = req.jurisdiction === 'Federal';
    const overdueDays = Math.abs(daysUntil(req.responseDeadline) ?? 0);
    const statuteHint = isFederal
      ? 'the federal Freedom of Information Act, 5 U.S.C. § 552 (20 business day response requirement)'
      : `the public records act of ${req.state || 'the relevant state'}`;

    const prompt = `You are drafting a firm but professional FOLLOW-UP letter for an accountability journalist whose public records request has gone past the statutory response deadline. Output PLAIN TEXT only (no markdown).

AGENCY: ${req.agency}
JURISDICTION: ${req.jurisdiction}${isFederal ? '' : ` (${req.state})`}
RECORDS ORIGINALLY SOUGHT: ${req.recordsSought}
REQUEST SUBMITTED: ${req.submittedDate ? new Date(req.submittedDate).toLocaleDateString() : 'recently'}
STATUTORY DEADLINE PASSED: approximately ${overdueDays} day(s) ago.

The letter must:
1. Reference the original request and its submission date.
2. Note that the statutory response deadline under ${statuteHint} has now passed (${overdueDays} days overdue).
3. Cite the correct statute for this ${req.jurisdiction} request${isFederal ? '' : ` in ${req.state}`}.
4. Demand an immediate response and production of the requested records.
5. State that continued non-response may be treated as a constructive denial and that the requester reserves the right to pursue an administrative appeal and/or legal action to compel disclosure (and recover fees/costs where the statute allows).
6. Remain professional, firm, and concise.
7. End with placeholders [YOUR NAME], [EMAIL], [PHONE], [DATE].

Output ONLY the follow-up letter.`;

    try {
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: { temperature: 0.5 },
      });
      setFollowUpText(response.text || '');
      toast.success('Follow-up drafted');
    } catch (err: any) {
      console.error('Follow-up generation failed', err);
      setFollowUpText('');
      toast.error(`Follow-up failed: ${err.message || 'Unknown error'}`);
    } finally {
      setFollowUpLoading(false);
    }
  };

  const copyFollowUp = () => {
    navigator.clipboard.writeText(followUpText);
    setFollowUpCopied(true);
    setTimeout(() => setFollowUpCopied(false), 2000);
  };

  const showState = form.jurisdiction !== 'Federal';

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <AgentHeader agent={MAX} compact />
      <AIDisclaimer variant="full" className="mt-4" />

      {/* Header */}
      <div className="flex items-start gap-3">
        <div className="w-12 h-12 rounded-xl bg-gold-500/10 border border-gold-500/30 flex items-center justify-center shrink-0">
          <FileText className="text-gold-500" size={24} />
        </div>
        <div>
          <h1 className="text-3xl font-bold text-white font-serif">FOIA &amp; Public Records Center</h1>
          <p className="text-slate-400 text-sm mt-1">
            Generate precise public records requests under the correct federal or state statute, then track every request through to fulfillment.
          </p>
        </div>
      </div>

      {/* ================= A) GENERATOR ================= */}
      <section className="card-premium p-6 space-y-5">
        <div className="flex items-center gap-2">
          <Sparkles className="text-gold-500" size={20} />
          <h2 className="text-xl font-semibold text-white">Request Generator</h2>
        </div>

        <div className="grid lg:grid-cols-2 gap-6">
          {/* Form */}
          <div className="space-y-4">
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Agency Name *</label>
              <input
                value={form.agency}
                onChange={e => setForm(p => ({ ...p, agency: e.target.value }))}
                placeholder="Union County Sheriff's Office"
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 text-sm focus:border-gold-500 outline-none"
              />
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Jurisdiction Level</label>
                <select
                  value={form.jurisdiction}
                  onChange={e => setForm(p => ({ ...p, jurisdiction: e.target.value as Jurisdiction }))}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm focus:border-gold-500 outline-none"
                >
                  {(['Federal', 'State', 'County', 'Municipal'] as Jurisdiction[]).map(j => (
                    <option key={j} value={j}>{j}</option>
                  ))}
                </select>
              </div>
              {showState && (
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">State *</label>
                  <input
                    value={form.state}
                    onChange={e => setForm(p => ({ ...p, state: e.target.value }))}
                    placeholder="New Jersey"
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 text-sm focus:border-gold-500 outline-none"
                  />
                </div>
              )}
            </div>

            <div>
              <label className="text-xs text-slate-400 mb-1 block">Records Sought *</label>
              <textarea
                value={form.recordsSought}
                onChange={e => setForm(p => ({ ...p, recordsSought: e.target.value }))}
                placeholder="All use-of-force reports, body-camera footage logs, and internal affairs complaints involving Officer..."
                rows={5}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 text-sm focus:border-gold-500 outline-none resize-none"
              />
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Date Range From (optional)</label>
                <input
                  type="date"
                  value={form.dateFrom}
                  onChange={e => setForm(p => ({ ...p, dateFrom: e.target.value }))}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm focus:border-gold-500 outline-none"
                />
              </div>
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Date Range To (optional)</label>
                <input
                  type="date"
                  value={form.dateTo}
                  onChange={e => setForm(p => ({ ...p, dateTo: e.target.value }))}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm focus:border-gold-500 outline-none"
                />
              </div>
            </div>

            {/* Toggles */}
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => setForm(p => ({ ...p, feeWaiver: !p.feeWaiver }))}
                className="w-full flex items-center justify-between px-3 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-sm hover:border-slate-600 transition-colors"
              >
                <span className="text-slate-200">Request fee waiver</span>
                <span className={`w-10 h-5 rounded-full flex items-center px-0.5 transition-colors ${form.feeWaiver ? 'bg-gold-500 justify-end' : 'bg-slate-600 justify-start'}`}>
                  <span className="w-4 h-4 rounded-full bg-white" />
                </span>
              </button>
              <button
                type="button"
                onClick={() => setForm(p => ({ ...p, expedited: !p.expedited }))}
                className="w-full flex items-center justify-between px-3 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-sm hover:border-slate-600 transition-colors"
              >
                <span className="text-slate-200">Request expedited processing</span>
                <span className={`w-10 h-5 rounded-full flex items-center px-0.5 transition-colors ${form.expedited ? 'bg-gold-500 justify-end' : 'bg-slate-600 justify-start'}`}>
                  <span className="w-4 h-4 rounded-full bg-white" />
                </span>
              </button>
            </div>

            <button
              onClick={generateRequest}
              disabled={isGenerating}
              className="w-full bg-gold-500 hover:bg-gold-600 disabled:bg-slate-700 disabled:text-slate-500 text-slate-900 font-semibold py-3 px-6 rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              {isGenerating ? (
                <><Loader2 className="animate-spin" size={20} /> Generating...</>
              ) : (
                <><Sparkles size={20} /> Generate Request</>
              )}
            </button>

            {error && (
              <div className="bg-red-900/20 border border-red-700 rounded-lg p-3 flex items-start gap-2">
                <AlertCircle className="text-red-500 flex-shrink-0 mt-0.5" size={18} />
                <p className="text-red-300 text-sm">{error}</p>
              </div>
            )}
          </div>

          {/* Result panel */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-white">Generated Letter</h3>
              {generatedLetter && (
                <div className="flex gap-2">
                  <button onClick={copyLetter} title="Copy"
                    className="p-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg transition-colors">
                    {copied ? <Check className="text-green-500" size={16} /> : <Copy className="text-slate-300" size={16} />}
                  </button>
                  <button onClick={downloadLetter} title="Download"
                    className="p-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg transition-colors">
                    <Download className="text-slate-300" size={16} />
                  </button>
                  <button onClick={saveToTracker} title="Save to tracker"
                    className="p-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg transition-colors flex items-center gap-1 text-xs text-slate-300">
                    <Save size={16} /> Save
                  </button>
                </div>
              )}
            </div>
            <div className="bg-slate-800 border border-slate-700 rounded-lg p-4 min-h-[300px] max-h-[560px] overflow-y-auto">
              {generatedLetter ? (
                <pre className="whitespace-pre-wrap font-mono text-sm text-slate-200 leading-relaxed">{generatedLetter}</pre>
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-slate-500 text-center py-12">
                  <FileText size={44} className="mb-3 opacity-50" />
                  <p className="font-medium">No request generated yet</p>
                  <p className="text-sm mt-1">Fill in the form and click "Generate Request".</p>
                </div>
              )}
            </div>
            {generatedLetter && (
              <p className="text-xs text-slate-500">
                Review the cited statute and deadline before sending. Statute citations are AI-generated and should be verified.
              </p>
            )}
          </div>
        </div>
      </section>

      {/* ================= B) TRACKER ================= */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <Clock className="text-gold-500" size={20} />
          <h2 className="text-xl font-semibold text-white">Request Tracker</h2>
          <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 border border-slate-700 text-slate-400">
            {requests.length}
          </span>
        </div>

        {requests.length === 0 ? (
          <div className="text-center py-14 border border-dashed border-slate-700 rounded-xl">
            <Send className="mx-auto mb-3 text-slate-600" size={40} />
            <p className="text-slate-500">No tracked requests yet. Generate a letter and click "Save" to add one.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredRequests.map(req => (
              <div key={req.id} className={`rounded-xl border transition-all p-4 ${cardBorder(req)}`}>
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-white">{req.agency}</p>
                      <span className={`text-xs px-2 py-0.5 rounded-full border font-semibold capitalize ${STATUS_BADGE[req.status]}`}>
                        {req.status}
                      </span>
                      {deadlineBadge(req)}
                    </div>
                    <p className="text-xs text-slate-500 mt-1">
                      {req.jurisdiction}{req.state ? ` · ${req.state}` : ''}
                      {req.submittedDate ? ` · Submitted ${new Date(req.submittedDate).toLocaleDateString()}` : ''}
                      {req.responseDeadline ? ` · Deadline ${new Date(req.responseDeadline).toLocaleDateString()}` : ''}
                    </p>
                    {req.recordsSought && (
                      <p className="text-xs text-slate-400 mt-1.5 line-clamp-2 max-w-2xl">{req.recordsSought}</p>
                    )}
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <select
                      value={req.status}
                      onChange={e => changeStatus(req, e.target.value as FoiaStatus)}
                      className="px-2 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-white text-xs focus:border-gold-500 outline-none capitalize"
                    >
                      {STATUS_OPTIONS.map(s => <option key={s} value={s} className="capitalize">{s}</option>)}
                    </select>
                    <button onClick={() => removeRequest(req.id)} title="Delete"
                      className="text-slate-600 hover:text-red-400 transition-colors p-1.5">
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>

                {/* Controls row */}
                <div className="flex items-center gap-2 mt-3 flex-wrap">
                  {req.status === 'draft' && (
                    <button onClick={() => markSubmitted(req)}
                      className="text-xs px-3 py-1.5 rounded-lg bg-blue-500/15 border border-blue-500/30 text-blue-400 hover:bg-blue-500/25 transition-colors flex items-center gap-1.5">
                      <Send size={13} /> Mark Submitted
                    </button>
                  )}
                  {canFollowUp(req) && (
                    <button onClick={() => generateFollowUp(req)}
                      disabled={followUpLoading && followUpId === req.id}
                      className="text-xs px-3 py-1.5 rounded-lg bg-red-500/15 border border-red-500/30 text-red-400 hover:bg-red-500/25 transition-colors flex items-center gap-1.5 disabled:opacity-60">
                      {followUpLoading && followUpId === req.id
                        ? <><Loader2 className="animate-spin" size={13} /> Drafting...</>
                        : <><Mail size={13} /> Generate Follow-Up</>}
                    </button>
                  )}
                  {req.letterText && (
                    <button
                      onClick={() => { navigator.clipboard.writeText(req.letterText); toast.success('Letter copied'); }}
                      className="text-xs px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-300 hover:border-slate-600 transition-colors flex items-center gap-1.5">
                      <Copy size={13} /> Copy Letter
                    </button>
                  )}
                </div>

                {/* Follow-up expandable area */}
                {followUpId === req.id && (followUpLoading || followUpText) && (
                  <div className="mt-3 pt-3 border-t border-white/10 animate-slide-up">
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="text-sm font-semibold text-white flex items-center gap-1.5">
                        <Mail size={14} className="text-red-400" /> Follow-Up Letter
                      </h4>
                      <div className="flex gap-2">
                        {followUpText && (
                          <button onClick={copyFollowUp} title="Copy follow-up"
                            className="p-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg transition-colors">
                            {followUpCopied ? <Check className="text-green-500" size={14} /> : <Copy className="text-slate-300" size={14} />}
                          </button>
                        )}
                        <button onClick={() => { setFollowUpId(null); setFollowUpText(''); }} title="Close"
                          className="p-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg transition-colors">
                          <X className="text-slate-300" size={14} />
                        </button>
                      </div>
                    </div>
                    <div className="bg-slate-900/60 border border-slate-700 rounded-lg p-3 max-h-72 overflow-y-auto">
                      {followUpLoading
                        ? <div className="flex items-center gap-2 text-slate-400 text-sm py-4 justify-center"><Loader2 className="animate-spin" size={16} /> Drafting follow-up...</div>
                        : <pre className="whitespace-pre-wrap font-mono text-sm text-slate-200 leading-relaxed">{followUpText}</pre>}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};

export default FoiaCenter;
