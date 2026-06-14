import React, { useState, useEffect } from 'react';
import { Search, Plus, Loader, Copy, Download, Trash2, AlertTriangle, CheckCircle, Clock, RefreshCw } from 'lucide-react';

interface FOIARequest {
  id: string;
  agency: string;
  agencyType: 'federal' | 'state' | 'local';
  jurisdiction: string;
  subject: string;
  recordsDescription: string;
  purpose: string;
  submittedDate: string;
  responseDeadline: string;
  status: 'draft' | 'submitted' | 'acknowledged' | 'partial' | 'denied' | 'appealed' | 'closed';
  responseNotes: string;
  generatedRequest: string;
  followUpCount: number;
  createdAt: string;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  draft: { label: 'Draft', color: 'text-slate-400', bg: 'bg-slate-700' },
  submitted: { label: 'Submitted', color: 'text-blue-400', bg: 'bg-blue-500/20' },
  acknowledged: { label: 'Acknowledged', color: 'text-cyan-400', bg: 'bg-cyan-500/20' },
  partial: { label: 'Partial Response', color: 'text-amber-400', bg: 'bg-amber-500/20' },
  denied: { label: 'Denied', color: 'text-red-400', bg: 'bg-red-500/20' },
  appealed: { label: 'Under Appeal', color: 'text-purple-400', bg: 'bg-purple-500/20' },
  closed: { label: 'Closed', color: 'text-green-400', bg: 'bg-green-500/20' },
};

const FEDERAL_DEADLINES: Record<string, number> = {
  'federal': 20, // business days
  'state': 10,
  'local': 10,
};

const AGENCY_TEMPLATES: Record<string, string> = {
  police: 'police department, sheriff office, law enforcement',
  court: 'court records, clerk of court, judicial records',
  city: 'city hall, municipal records, city council',
  federal: 'FBI, DOJ, DHS, CBP, ICE, ATF, DEA, IRS, EPA',
  school: 'school district, board of education, university',
};

const FOIATracker: React.FC = () => {
  const [requests, setRequests] = useState<FOIARequest[]>(() => {
    const saved = localStorage.getItem('casebuddy_foia');
    return saved ? JSON.parse(saved) : [];
  });
  const [showForm, setShowForm] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [generatingFollowUp, setGeneratingFollowUp] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ requestId: string; text: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<'tracker' | 'generator'>('tracker');

  const [form, setForm] = useState({
    agency: '',
    agencyType: 'federal' as 'federal' | 'state' | 'local',
    jurisdiction: '',
    subject: '',
    recordsDescription: '',
    purpose: '',
    yourName: '',
    yourAddress: '',
    yourEmail: '',
    expedited: false,
    feeWaiver: false,
    feeWaiverBasis: 'news media / public interest journalism',
  });

  const save = (updated: FOIARequest[]) => {
    setRequests(updated);
    localStorage.setItem('casebuddy_foia', JSON.stringify(updated));
  };

  const getDaysRemaining = (deadline: string) => {
    const d = new Date(deadline);
    const now = new Date();
    return Math.ceil((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  };

  const getResponseDeadline = (submittedDate: string, agencyType: string) => {
    const d = new Date(submittedDate);
    const days = FEDERAL_DEADLINES[agencyType] || 20;
    // Add business days (approximate)
    let added = 0;
    while (added < days) {
      d.setDate(d.getDate() + 1);
      if (d.getDay() !== 0 && d.getDay() !== 6) added++;
    }
    return d.toISOString().split('T')[0];
  };

  const generateRequest = async () => {
    if (!form.agency || !form.recordsDescription) return;
    setGenerating(true);
    try {
      const apiKey = process.env.API_KEY || (import.meta as any).env?.VITE_GEMINI_API_KEY;

      const prompt = `Draft a professional, legally precise Freedom of Information Act (FOIA) / public records request letter.

Requester: ${form.yourName || '[YOUR NAME]'}
Address: ${form.yourAddress || '[YOUR ADDRESS]'}
Email: ${form.yourEmail || '[YOUR EMAIL]'}
Agency: ${form.agency}
Agency Type: ${form.agencyType} (${form.jurisdiction || 'jurisdiction'})
Subject: ${form.subject}
Records Requested: ${form.recordsDescription}
Purpose: ${form.purpose || 'Public interest / journalism / accountability'}
Expedited Processing: ${form.expedited ? 'YES — explain urgency' : 'No'}
Fee Waiver Requested: ${form.feeWaiver ? `YES — basis: ${form.feeWaiverBasis}` : 'No'}

Requirements:
- Cite the applicable statute (FOIA 5 U.S.C. § 552 for federal; note state equivalent if local/state)
- Use precise, unambiguous language describing the records
- Include a reasonable time period for the records
- Request all responsive records in electronic format where possible
- Include fee waiver language if applicable
- Add expedited processing request if applicable
- Include proper closing with signature block
- Add note about right to appeal if denied
- Professional, assertive tone — make it hard to deny

Draft the complete letter now:`;

      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.3, maxOutputTokens: 3000 },
        }),
      });
      const data = await res.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text || 'Error generating request.';

      const today = new Date().toISOString().split('T')[0];
      const deadline = getResponseDeadline(today, form.agencyType);

      const newRequest: FOIARequest = {
        id: Date.now().toString(),
        agency: form.agency,
        agencyType: form.agencyType,
        jurisdiction: form.jurisdiction,
        subject: form.subject,
        recordsDescription: form.recordsDescription,
        purpose: form.purpose,
        submittedDate: today,
        responseDeadline: deadline,
        status: 'draft',
        responseNotes: '',
        generatedRequest: text,
        followUpCount: 0,
        createdAt: new Date().toISOString(),
      };

      save([...requests, newRequest]);
      setPreview({ requestId: newRequest.id, text });
      setActiveTab('tracker');
      setShowForm(false);
    } catch (e) {
      alert('Error generating request. Check your API configuration.');
    } finally {
      setGenerating(false);
    }
  };

  const generateFollowUp = async (request: FOIARequest) => {
    setGeneratingFollowUp(request.id);
    try {
      const apiKey = process.env.API_KEY || (import.meta as any).env?.VITE_GEMINI_API_KEY;
      const daysOver = Math.abs(getDaysRemaining(request.responseDeadline));

      const prompt = `Draft a firm follow-up letter for an unanswered FOIA request.

Original Request:
Agency: ${request.agency}
Records Requested: ${request.recordsDescription}
Submitted: ${request.submittedDate}
Deadline: ${request.responseDeadline} (${daysOver} days overdue)
Follow-up Number: ${request.followUpCount + 1}
Current Status: ${request.status}

Draft a firm, professional follow-up that:
- References the original request and deadline
- Notes the specific statutory violation (overdue response)
- Requests immediate response within 5 business days
- Mentions right to file a complaint with the agency's FOIA office / Inspector General
- If this is follow-up #2+, escalate language and mention potential litigation under ${request.agencyType === 'federal' ? '5 U.S.C. § 552(a)(4)(B)' : 'state public records law'}
- Keep it professional but assertive`;

      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.3, maxOutputTokens: 2000 },
        }),
      });
      const data = await res.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text || 'Error.';

      const updated = requests.map(r => r.id === request.id ? { ...r, followUpCount: r.followUpCount + 1 } : r);
      save(updated);
      setPreview({ requestId: request.id, text });
    } catch (e) {
      alert('Error generating follow-up.');
    } finally {
      setGeneratingFollowUp(null);
    }
  };

  const updateStatus = (id: string, status: FOIARequest['status']) => {
    save(requests.map(r => r.id === id ? { ...r, status } : r));
  };

  const remove = (id: string) => save(requests.filter(r => r.id !== id));

  const copyText = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-6 flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-serif font-bold text-white flex items-center gap-2">
            <Search className="text-gold-400" /> FOIA Request Generator & Tracker
          </h1>
          <p className="text-slate-400 mt-1">Generate targeted records requests, track status, auto-generate follow-ups when agencies miss deadlines.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => { setActiveTab('generator'); setShowForm(true); }}
            className="flex items-center gap-2 bg-gold-500 hover:bg-gold-400 text-slate-900 font-bold px-4 py-2 rounded-xl text-sm">
            <Plus size={16} /> New Request
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-800/50 border border-slate-700 rounded-xl p-1 mb-6 w-fit">
        {(['tracker', 'generator'] as const).map(t => (
          <button key={t} onClick={() => { setActiveTab(t); if (t === 'generator') setShowForm(true); }}
            className={`px-4 py-2 rounded-lg text-sm font-medium capitalize transition-colors ${activeTab === t ? 'bg-gold-500/20 text-gold-300' : 'text-slate-400 hover:text-white'}`}>
            {t === 'tracker' ? '📋 Request Tracker' : '✍️ Generate Request'}
          </button>
        ))}
      </div>

      {/* Generator Form */}
      {activeTab === 'generator' && showForm && (
        <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-6 mb-6">
          <h2 className="font-bold text-white mb-5">Generate FOIA Request</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase mb-1.5">Agency Name *</label>
              <input value={form.agency} onChange={e => setForm(f => ({ ...f, agency: e.target.value }))}
                placeholder="e.g. Chicago Police Department"
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm placeholder-slate-500 focus:outline-none focus:border-gold-500/50" />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase mb-1.5">Agency Type</label>
              <select value={form.agencyType} onChange={e => setForm(f => ({ ...f, agencyType: e.target.value as any }))}
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-gold-500/50">
                <option value="federal">Federal</option>
                <option value="state">State</option>
                <option value="local">Local / Municipal</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase mb-1.5">Jurisdiction / State</label>
              <input value={form.jurisdiction} onChange={e => setForm(f => ({ ...f, jurisdiction: e.target.value }))}
                placeholder="e.g. Illinois, Cook County"
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm placeholder-slate-500 focus:outline-none focus:border-gold-500/50" />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase mb-1.5">Subject / Case Reference</label>
              <input value={form.subject} onChange={e => setForm(f => ({ ...f, subject: e.target.value }))}
                placeholder="e.g. Incident on 01/15/2024, Case #2024-001"
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm placeholder-slate-500 focus:outline-none focus:border-gold-500/50" />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase mb-1.5">Your Name</label>
              <input value={form.yourName} onChange={e => setForm(f => ({ ...f, yourName: e.target.value }))}
                placeholder="Full name"
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm placeholder-slate-500 focus:outline-none focus:border-gold-500/50" />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase mb-1.5">Your Email</label>
              <input value={form.yourEmail} onChange={e => setForm(f => ({ ...f, yourEmail: e.target.value }))}
                placeholder="email@example.com"
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm placeholder-slate-500 focus:outline-none focus:border-gold-500/50" />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-bold text-slate-400 uppercase mb-1.5">Records Requested *</label>
              <textarea value={form.recordsDescription} onChange={e => setForm(f => ({ ...f, recordsDescription: e.target.value }))}
                rows={4} placeholder="Describe the specific records you are requesting. Be precise: include date ranges, names, case numbers, incident numbers, etc."
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm placeholder-slate-500 resize-none focus:outline-none focus:border-gold-500/50" />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-bold text-slate-400 uppercase mb-1.5">Purpose</label>
              <input value={form.purpose} onChange={e => setForm(f => ({ ...f, purpose: e.target.value }))}
                placeholder="e.g. Public interest journalism / accountability reporting / legal proceeding"
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm placeholder-slate-500 focus:outline-none focus:border-gold-500/50" />
            </div>
            <div className="flex items-center gap-6">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.expedited} onChange={e => setForm(f => ({ ...f, expedited: e.target.checked }))}
                  className="w-4 h-4 accent-gold-500" />
                <span className="text-sm text-slate-300">Request Expedited Processing</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.feeWaiver} onChange={e => setForm(f => ({ ...f, feeWaiver: e.target.checked }))}
                  className="w-4 h-4 accent-gold-500" />
                <span className="text-sm text-slate-300">Request Fee Waiver</span>
              </label>
            </div>
          </div>
          <div className="flex gap-3 mt-5">
            <button onClick={generateRequest} disabled={generating || !form.agency || !form.recordsDescription}
              className="flex items-center gap-2 bg-gold-500 hover:bg-gold-400 disabled:opacity-50 text-slate-900 font-bold px-6 py-2.5 rounded-xl">
              {generating ? <><Loader size={16} className="animate-spin" /> Generating...</> : '⚡ Generate Request'}
            </button>
            <button onClick={() => setShowForm(false)} className="text-slate-400 hover:text-white px-4 py-2 rounded-xl text-sm">Cancel</button>
          </div>
        </div>
      )}

      {/* Preview Modal */}
      {preview && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-3xl max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700">
              <h3 className="font-bold text-white">Generated Request</h3>
              <div className="flex gap-2">
                <button onClick={() => copyText(preview.text)}
                  className="flex items-center gap-1 text-xs bg-slate-700 hover:bg-slate-600 text-slate-300 px-3 py-1.5 rounded-lg">
                  <Copy size={12} /> {copied ? 'Copied!' : 'Copy'}
                </button>
                <button onClick={() => setPreview(null)} className="text-slate-400 hover:text-white text-sm px-3 py-1.5">Close</button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-5">
              <pre className="whitespace-pre-wrap text-slate-300 text-sm font-mono leading-relaxed">{preview.text}</pre>
            </div>
          </div>
        </div>
      )}

      {/* Tracker */}
      {activeTab === 'tracker' && (
        <div className="space-y-3">
          {requests.length === 0 && (
            <div className="text-center py-16 text-slate-500">
              <Search size={40} className="mx-auto mb-3 opacity-30" />
              <p>No FOIA requests yet. Generate your first request above.</p>
            </div>
          )}
          {requests.map(req => {
            const days = getDaysRemaining(req.responseDeadline);
            const overdue = req.status !== 'closed' && req.status !== 'denied' && days < 0;
            return (
              <div key={req.id} className={`bg-slate-800/50 border rounded-xl p-4 ${overdue ? 'border-red-500/30' : 'border-slate-700'}`}>
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <h3 className="font-semibold text-white">{req.agency}</h3>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_CONFIG[req.status].bg} ${STATUS_CONFIG[req.status].color}`}>
                        {STATUS_CONFIG[req.status].label}
                      </span>
                      {overdue && <span className="text-xs bg-red-500/20 text-red-300 border border-red-500/30 px-2 py-0.5 rounded-full">⚠️ {Math.abs(days)}d OVERDUE</span>}
                      {req.followUpCount > 0 && <span className="text-xs text-slate-500">Follow-ups sent: {req.followUpCount}</span>}
                    </div>
                    <p className="text-sm text-slate-400 truncate">{req.recordsDescription}</p>
                    <div className="flex gap-4 mt-1 text-xs text-slate-500">
                      <span>📅 Submitted: {req.submittedDate}</span>
                      <span>⏰ Deadline: {req.responseDeadline}</span>
                      {req.subject && <span>📋 {req.subject}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <select value={req.status} onChange={e => updateStatus(req.id, e.target.value as any)}
                      className="bg-slate-700 border border-slate-600 rounded-lg px-2 py-1 text-xs text-white focus:outline-none">
                      {Object.entries(STATUS_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                    </select>
                    {req.generatedRequest && (
                      <button onClick={() => setPreview({ requestId: req.id, text: req.generatedRequest })}
                        className="text-xs bg-slate-700 hover:bg-slate-600 text-slate-300 px-2 py-1 rounded-lg">
                        View
                      </button>
                    )}
                    {overdue && (
                      <button onClick={() => generateFollowUp(req)} disabled={generatingFollowUp === req.id}
                        className="flex items-center gap-1 text-xs bg-red-500/20 hover:bg-red-500/30 text-red-300 border border-red-500/30 px-2 py-1 rounded-lg">
                        {generatingFollowUp === req.id ? <Loader size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                        Follow-up
                      </button>
                    )}
                    <button onClick={() => remove(req.id)} className="text-slate-600 hover:text-red-400">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default FOIATracker;
