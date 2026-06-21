import React, { useState, useContext } from 'react';
import { AppContext } from '../App';
import { generateClientUpdate } from '../services/geminiService';
import { sendCaseUpdateEmail } from '../services/integrationService';
import { Mail, Loader, Copy, Download, RefreshCw, Check, Send, Printer, FileText, UserPlus } from 'lucide-react';
import { printAsPdf, letterToPdfHtml } from '../utils/pdfExport';
import { toast } from 'react-toastify';
import AgentHeader from './AgentHeader';
import AIDisclaimer from './AIDisclaimer';
import Breadcrumb from './Breadcrumb';
import { OPERATIONAL_AGENTS } from '../agents/personas';
import { deepseekChat } from '../services/deepseek';

const SIERRA = OPERATIONAL_AGENTS.find(a => a.id === 'sierra')!;

type CommTab = 'updates' | 'engagement';

const UPDATE_TYPES = [
  { value: 'status-update', label: 'Status Update', desc: 'General case progress report' },
  { value: 'court-date', label: 'Court Date Notice', desc: 'Upcoming hearing reminder & prep' },
  { value: 'settlement-offer', label: 'Settlement Offer', desc: 'Inform client of offer received' },
  { value: 'discovery-update', label: 'Discovery Update', desc: 'Evidence and deposition progress' },
  { value: 'trial-prep', label: 'Trial Preparation', desc: 'What to expect & how to prepare' },
  { value: 'verdict', label: 'Verdict / Outcome', desc: 'Inform of verdict and next steps' },
  { value: 'billing', label: 'Billing Notice', desc: 'Fee statement with case context' },
  { value: 'general', label: 'General Correspondence', desc: 'Custom update letter' },
];

interface SavedLetter {
  id: string;
  caseTitle: string;
  updateType: string;
  clientName: string;
  subject: string;
  fullLetter: string;
  timestamp: number;
}

/* ─── Engagement Letter Sub-tab ────────────────────────────────────────── */

const EngagementLetterTab: React.FC = () => {
  const { activeCase } = useContext(AppContext);
  const [clientName, setClientName] = useState('');
  const [caseType, setCaseType] = useState('');
  const [feeArrangement, setFeeArrangement] = useState('Hourly');
  const [hourlyRate, setHourlyRate] = useState('');
  const [retainer, setRetainer] = useState('');
  const [contingencyPct, setContingencyPct] = useState('');
  const [jurisdiction, setJurisdiction] = useState('');
  const [engagementLetter, setEngagementLetter] = useState('');
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const FEE_ARRANGEMENTS = ['Hourly', 'Contingency', 'Flat Fee', 'Hybrid', 'Pro Bono', 'TBD'];

  const generate = async () => {
    if (!clientName.trim()) { toast.error('Enter client name.'); return; }
    setLoading(true);
    try {
      const prompt = `Draft a professional attorney-client engagement letter:\n\nClient: ${clientName}\nCase Type: ${caseType || activeCase?.title || 'General'}\nMatter: ${activeCase?.summary || activeCase?.title || 'To be determined'}\nFee Arrangement: ${feeArrangement}\n${feeArrangement === 'Hourly' || feeArrangement === 'Hybrid' ? `Hourly Rate: $${hourlyRate || 'TBD'}/hr\nRetainer: $${retainer || 'TBD'}` : ''}\n${feeArrangement === 'Contingency' || feeArrangement === 'Hybrid' ? `Contingency: ${contingencyPct || 'TBD'}%` : ''}\nJurisdiction: ${jurisdiction || 'To be determined'}\n\nInclude: scope of representation, fee agreement, billing procedures, client obligations, file retention policy, termination clause, and signature blocks. Use professional legal letterhead format with [ATTORNEY NAME] and [FIRM NAME] placeholders.`;

      const text = await deepseekChat({
        systemInstruction: 'You are a legal document expert. Draft only the letter text, professionally formatted.',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
        maxTokens: 3000,
      });
      setEngagementLetter(text || 'Error generating letter.');
      toast.success('Engagement letter generated!');
    } catch {
      toast.error('Generation failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const copyLetter = () => {
    navigator.clipboard.writeText(engagementLetter);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast.success('Letter copied!');
  };

  const printLetter = () => {
    const html = letterToPdfHtml({
      to: clientName,
      re: activeCase?.title || 'Engagement Letter',
      body: engagementLetter,
    });
    printAsPdf(`Engagement Letter - ${clientName}`, html);
  };

  return (
    <div className="grid lg:grid-cols-5 gap-6">
      <div className="lg:col-span-2 space-y-5">
        <div className="bg-slate-800/60 border border-slate-700 rounded-xl p-6 space-y-4">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <UserPlus size={18} className="text-gold-400" /> Engagement Details
          </h2>
          <div>
            <label className="text-sm text-slate-400 block mb-1">Client Name *</label>
            <input value={clientName} onChange={e => setClientName(e.target.value)} placeholder="e.g. James Miller"
              className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-gold-500 text-sm" />
          </div>
          <div>
            <label className="text-sm text-slate-400 block mb-1">Case / Matter Type</label>
            <input value={caseType} onChange={e => setCaseType(e.target.value)} placeholder={activeCase?.title || 'e.g. Personal Injury'}
              className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-gold-500 text-sm" />
          </div>
          <div>
            <label className="text-sm text-slate-400 block mb-1">Jurisdiction</label>
            <input value={jurisdiction} onChange={e => setJurisdiction(e.target.value)} placeholder="e.g. Cook County, IL"
              className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-gold-500 text-sm" />
          </div>
          <div>
            <label className="text-sm text-slate-400 block mb-2">Fee Arrangement</label>
            <div className="grid grid-cols-3 gap-2">
              {FEE_ARRANGEMENTS.map(f => (
                <button key={f} onClick={() => setFeeArrangement(f)}
                  className={`px-3 py-2 rounded-lg border text-xs font-medium transition-colors ${feeArrangement === f ? 'bg-gold-500/20 border-gold-500/50 text-gold-300' : 'border-slate-600 text-slate-400 hover:border-slate-500'}`}>
                  {f}
                </button>
              ))}
            </div>
          </div>
          {(feeArrangement === 'Hourly' || feeArrangement === 'Hybrid') && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm text-slate-400 block mb-1">Hourly Rate ($)</label>
                <input value={hourlyRate} onChange={e => setHourlyRate(e.target.value)} type="number" placeholder="350"
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-gold-500 text-sm" />
              </div>
              <div>
                <label className="text-sm text-slate-400 block mb-1">Retainer ($)</label>
                <input value={retainer} onChange={e => setRetainer(e.target.value)} type="number" placeholder="5000"
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-gold-500 text-sm" />
              </div>
            </div>
          )}
          {(feeArrangement === 'Contingency' || feeArrangement === 'Hybrid') && (
            <div>
              <label className="text-sm text-slate-400 block mb-1">Contingency (%)</label>
              <input value={contingencyPct} onChange={e => setContingencyPct(e.target.value)} type="number" placeholder="33"
                className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-gold-500 text-sm" />
            </div>
          )}
          <button onClick={generate} disabled={loading || !clientName.trim()}
            className="w-full flex items-center justify-center gap-2 bg-gold-500 hover:bg-gold-600 disabled:bg-slate-700 disabled:text-slate-500 text-slate-900 font-bold py-3 rounded-lg transition-colors">
            {loading ? <><Loader className="animate-spin" size={18} /> Drafting...</> : <><FileText size={18} /> Generate Engagement Letter</>}
          </button>
        </div>
      </div>

      <div className="lg:col-span-3">
        {engagementLetter ? (
          <div className="bg-slate-800/60 border border-slate-700 rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700">
              <p className="text-white font-bold">Engagement Letter</p>
              <div className="flex gap-2">
                <button onClick={copyLetter}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold transition-all ${copied ? 'bg-green-600 text-white' : 'bg-slate-700 hover:bg-slate-600 text-white'}`}>
                  {copied ? <><Check size={14} /> Copied!</> : <><Copy size={14} /> Copy</>}
                </button>
                <button onClick={printLetter}
                  className="flex items-center gap-2 px-3 py-2 bg-slate-700 hover:bg-slate-600 border border-slate-600 text-slate-200 rounded-lg text-sm font-medium transition-colors">
                  <Printer size={14} /> PDF
                </button>
              </div>
            </div>
            <div className="p-6 sm:p-8">
              <div className="bg-white rounded-xl p-6 sm:p-10 shadow-xl max-w-2xl mx-auto">
                <div className="border-b border-gray-200 pb-6 mb-6">
                  <p className="text-gray-800 font-serif text-xl font-bold">ENGAGEMENT LETTER</p>
                  <p className="text-gray-500 text-sm mt-1 font-mono">ATTORNEY-CLIENT AGREEMENT</p>
                </div>
                <div className="font-mono text-gray-800 whitespace-pre-wrap text-sm leading-relaxed">
                  {engagementLetter}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center h-80 bg-slate-800/30 border border-slate-700 rounded-xl">
            <div className="text-center">
              <FileText className="mx-auto mb-3 text-slate-600" size={48} />
              <p className="text-slate-400">Your engagement letter will appear here.</p>
              <p className="text-slate-500 text-sm mt-1">Fill in the details and click Generate.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

/* ─── Main Component ───────────────────────────────────────────────────── */

const ClientUpdate = () => {
  const { activeCase } = useContext(AppContext);
  const [activeTab, setActiveTab] = useState<CommTab>('updates');
  const [updateType, setUpdateType] = useState('status-update');
  const [clientName, setClientName] = useState('');
  const [recentDevelopments, setRecentDevelopments] = useState('');
  const [loading, setLoading] = useState(false);
  const [letter, setLetter] = useState<{ subject: string; salutation: string; body: string; closing: string; fullLetter: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [clientEmail, setClientEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [history, setHistory] = useState<SavedLetter[]>(() => {
    try { return JSON.parse(localStorage.getItem('client_letters') || '[]'); } catch { return []; }
  });

  const generate = async () => {
    if (!activeCase) { toast.error('Select an active case first.'); return; }
    if (!clientName.trim()) { toast.error('Enter client name.'); return; }
    setLoading(true);
    try {
      const result = await generateClientUpdate(
        activeCase.summary || activeCase.title,
        UPDATE_TYPES.find(t => t.value === updateType)?.label || updateType,
        recentDevelopments || 'No specific recent developments provided.',
        clientName
      );
      setLetter(result);
      setEmailSent(false);
      const saved: SavedLetter = {
        id: Date.now().toString(),
        caseTitle: activeCase.title,
        updateType: UPDATE_TYPES.find(t => t.value === updateType)?.label || updateType,
        clientName,
        subject: result.subject,
        fullLetter: result.fullLetter,
        timestamp: Date.now()
      };
      const updated = [saved, ...history].slice(0, 20);
      localStorage.setItem('client_letters', JSON.stringify(updated));
      setHistory(updated);
      toast.success('Letter generated!');
    } catch (e) {
      toast.error('Generation failed. Please try again.');
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const copyLetter = () => {
    if (!letter) return;
    navigator.clipboard.writeText(letter.fullLetter);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast.success('Letter copied to clipboard!');
  };

  const downloadLetter = () => {
    if (!letter || !activeCase) return;
    const blob = new Blob([letter.fullLetter], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `letter_${clientName.replace(/\s/g, '_')}_${Date.now()}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const printLetterAsPdf = () => {
    if (!letter || !activeCase) return;
    const html = letterToPdfHtml({
      to: clientName,
      re: activeCase.title,
      body: letter.fullLetter
    });
    printAsPdf(`Letter to ${clientName}`, html);
  };

  const sendEmail = async () => {
    if (!letter || !activeCase || !clientEmail.trim()) return;
    setSending(true);
    try {
      await sendCaseUpdateEmail(clientEmail, clientName, activeCase.title, letter.fullLetter);
      setEmailSent(true);
      toast.success('Email sent!');
    } catch (e: any) {
      const msg = e?.message || '';
      if (msg.toLowerCase().includes('not configured')) {
        toast.warn('Email isn\'t configured yet — add SENDGRID_API_KEY (or RESEND_API_KEY) in your Vercel project to enable sending.');
      } else {
        toast.error(msg || 'Email failed to send. Please try again.');
      }
    } finally {
      setSending(false);
    }
  };

  if (!activeCase) {
    return (
      <div className="flex items-center justify-center min-h-64">
        <div className="text-center">
          <Mail className="mx-auto mb-3 text-slate-500" size={48} />
          <p className="text-white font-semibold">No Active Case</p>
          <p className="text-slate-400 text-sm">Select a case to generate client letters.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <Breadcrumb items={[{ label: 'Intake & Clients' }, { label: 'Client Communications' }]} />
      <AgentHeader agent={SIERRA} compact />
      <AIDisclaimer variant="full" className="mt-4" />
      <div className="flex items-center gap-3">
        <Mail className="text-gold-500" size={32} />
        <div>
          <h1 className="text-3xl font-bold text-white font-serif">Client Communications</h1>
          <p className="text-slate-400 text-sm">Professional correspondence for {activeCase.title}</p>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 p-1 bg-slate-800/60 border border-slate-700 rounded-xl w-fit">
        {([
          { key: 'updates' as CommTab, label: 'Client Updates', icon: Mail },
          { key: 'engagement' as CommTab, label: 'Engagement Letter', icon: FileText },
        ]).map(tab => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${activeTab === tab.key ? 'bg-gold-500/20 border border-gold-500/40 text-gold-300' : 'text-slate-400 hover:text-slate-200'}`}>
            <tab.icon size={15} /> {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'engagement' && <EngagementLetterTab />}

      {activeTab === 'updates' && <div className="grid lg:grid-cols-5 gap-6">
        {/* Form */}
        <div className="lg:col-span-2 space-y-5">
          <div className="bg-slate-800/60 border border-slate-700 rounded-xl p-6 space-y-5">
            <h2 className="text-lg font-bold text-white">Letter Settings</h2>

            <div>
              <label className="text-sm text-slate-400 block mb-1">Client Name *</label>
              <input value={clientName} onChange={e => setClientName(e.target.value)}
                placeholder="e.g. James Miller"
                className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-gold-500 text-sm"
              />
            </div>

            <div>
              <label className="text-sm text-slate-400 block mb-2">Update Type</label>
              <div className="space-y-2">
                {UPDATE_TYPES.map(t => (
                  <label key={t.value}
                    className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all ${updateType === t.value ? 'bg-gold-900/20 border-gold-600/50' : 'bg-slate-700/30 border-slate-700 hover:bg-slate-700/50'}`}
                  >
                    <input type="radio" value={t.value} checked={updateType === t.value} onChange={() => setUpdateType(t.value)} className="mt-0.5 accent-gold-500" />
                    <div>
                      <p className={`text-sm font-semibold ${updateType === t.value ? 'text-gold-400' : 'text-white'}`}>{t.label}</p>
                      <p className="text-xs text-slate-400">{t.desc}</p>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            <div>
              <label className="text-sm text-slate-400 block mb-1">Recent Developments / Notes</label>
              <textarea value={recentDevelopments} onChange={e => setRecentDevelopments(e.target.value)}
                placeholder="e.g. Judge ruled in our favor on the motion to suppress. Next hearing set for March 20. We received discovery documents from opposing counsel."
                rows={4}
                className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-gold-500 text-sm resize-none"
              />
            </div>

            <button onClick={generate} disabled={loading || !clientName.trim()}
              className="w-full flex items-center justify-center gap-2 bg-gold-500 hover:bg-gold-600 disabled:bg-slate-700 disabled:text-slate-500 text-slate-900 font-bold py-3 rounded-lg transition-colors"
            >
              {loading ? <><Loader className="animate-spin" size={18} /> Drafting...</> : <><Mail size={18} /> Generate Letter</>}
            </button>
          </div>

          {/* History */}
          {history.length > 0 && (
            <div className="bg-slate-800/60 border border-slate-700 rounded-xl p-5 space-y-2">
              <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider">Recent Letters</h3>
              {history.slice(0, 6).map(h => (
                <button key={h.id} onClick={() => setLetter({ subject: h.subject, salutation: '', body: '', closing: '', fullLetter: h.fullLetter })}
                  className="w-full text-left p-3 rounded-lg bg-slate-700/50 hover:bg-slate-700 transition-colors"
                >
                  <p className="text-white text-xs font-semibold">{h.clientName} — {h.updateType}</p>
                  <p className="text-slate-400 text-xs">{new Date(h.timestamp).toLocaleDateString()}</p>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Letter Preview */}
        <div className="lg:col-span-3">
          {letter ? (
            <div className="bg-slate-800/60 border border-slate-700 rounded-xl overflow-hidden">
              <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700">
                <div>
                  <p className="text-xs text-slate-500 uppercase tracking-wider mb-0.5">Subject</p>
                  <p className="text-white font-bold">{letter.subject}</p>
                </div>
                <div className="flex gap-2">
                  <button onClick={copyLetter}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold transition-all ${copied ? 'bg-green-600 text-white' : 'bg-slate-700 hover:bg-slate-600 text-white'}`}
                  >
                    {copied ? <><Check size={14} /> Copied!</> : <><Copy size={14} /> Copy</>}
                  </button>
                  <button onClick={printLetterAsPdf}
                    className="flex items-center gap-2 px-3 py-2 bg-slate-700 hover:bg-slate-600 border border-slate-600 text-slate-200 rounded-lg text-sm font-medium transition-colors">
                    <Printer size={14} /> PDF
                  </button>
                  <button onClick={downloadLetter}
                    className="flex items-center gap-2 px-3 py-2 bg-gold-500 hover:bg-gold-600 text-slate-900 font-semibold rounded-lg text-sm"
                  >
                    <Download size={14} /> Download
                  </button>
                  <button onClick={generate} disabled={loading}
                    className="flex items-center gap-2 px-3 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-sm"
                  >
                    <RefreshCw size={14} />
                  </button>
                </div>
              </div>

              {/* Letter Body */}
              <div className="p-6 sm:p-8">
                <div className="bg-white rounded-xl p-6 sm:p-10 shadow-xl max-w-2xl mx-auto">
                  <div className="border-b border-gray-200 pb-6 mb-6">
                    <p className="text-gray-800 font-serif text-xl font-bold">ATTORNEY-CLIENT COMMUNICATION</p>
                    <p className="text-gray-500 text-sm mt-1 font-mono">PRIVILEGED AND CONFIDENTIAL</p>
                  </div>
                  <div className="font-mono text-gray-800 whitespace-pre-wrap text-sm leading-relaxed">
                    {letter.fullLetter}
                  </div>
                  <div className="border-t border-gray-200 mt-8 pt-6">
                    <p className="text-gray-400 text-xs">This communication is protected by attorney-client privilege and is intended solely for the addressee.</p>
                  </div>
                </div>

                {/* Email send section */}
                <div className="mt-6 max-w-2xl mx-auto flex flex-col sm:flex-row gap-3">
                  <input
                    type="email"
                    value={clientEmail}
                    onChange={e => { setClientEmail(e.target.value); setEmailSent(false); }}
                    placeholder="Client email address"
                    className="flex-1 px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-gold-500 text-sm"
                  />
                  <button
                    onClick={sendEmail}
                    disabled={!clientEmail.trim() || sending || emailSent}
                    className={`flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                      emailSent
                        ? 'bg-green-600 text-white cursor-default'
                        : !clientEmail.trim() || sending
                        ? 'bg-slate-700 text-slate-500 cursor-not-allowed'
                        : 'bg-blue-600 hover:bg-blue-700 text-white'
                    }`}
                  >
                    {sending ? (
                      <><Loader className="animate-spin" size={14} /> Sending...</>
                    ) : emailSent ? (
                      <><Check size={14} /> Email sent!</>
                    ) : (
                      <><Send size={14} /> Send via Email</>
                    )}
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center h-80 bg-slate-800/30 border border-slate-700 rounded-xl">
              <div className="text-center">
                <Mail className="mx-auto mb-3 text-slate-600" size={48} />
                <p className="text-slate-400">Your generated letter will appear here.</p>
                <p className="text-slate-500 text-sm mt-1">Select update type and click Generate Letter.</p>
              </div>
            </div>
          )}
        </div>
      </div>}
    </div>
  );
};

export default ClientUpdate;
