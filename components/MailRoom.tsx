import React, { useState, useEffect, useRef } from 'react';
import {
  Mail, Send, Inbox, Star, Trash2, RefreshCw, Plus, X, ChevronDown,
  Paperclip, Search, Clock, CheckCircle, AlertCircle, Loader2,
  Reply, Forward, Archive, Tag, Filter, MoreVertical, Sparkles, Phone
} from 'lucide-react';
import { OPERATIONAL_AGENTS } from '../agents/personas';

// ── Types ─────────────────────────────────────────────────────────────────────
interface Email {
  id: string;
  from: string;
  fromName: string;
  to: string;
  subject: string;
  body: string;
  timestamp: string;
  read: boolean;
  starred: boolean;
  folder: 'inbox' | 'sent' | 'drafts' | 'archive' | 'trash';
  tag?: string;
  aiSummary?: string;
  agentDraft?: string;
}

interface Compose {
  to: string;
  subject: string;
  body: string;
  fromAgent: string;
}

const STORAGE_KEY = 'casebuddy_mailroom_emails';
const FOLDER_LABELS: Record<string, string> = {
  inbox: 'Inbox', sent: 'Sent', drafts: 'Drafts', archive: 'Archive', trash: 'Trash',
};

const AGENT_SENDERS = OPERATIONAL_AGENTS.filter(a =>
  ['maya', 'sierra', 'sol', 'lex', 'rex', 'doc'].includes(a.id)
);

// ── Sample seed emails ─────────────────────────────────────────────────────────
const SEED_EMAILS: Email[] = [
  {
    id: 'seed-1',
    from: 'maya@casebuddy.live', fromName: 'Maya — Intake',
    to: 'firm@casebuddy.live',
    subject: 'New Intake: Robert Harvey v. Galveston PD — Review Needed',
    body: `Good morning,\n\nA new intake came in overnight that I've assessed and flagged as high priority.\n\n**Client:** Robert Harvey\n**Matter:** Civil rights / personal injury — client alleges Chief Roy struck him with a vehicle while auditing the department.\n**Viability Score:** 78/100\n**My Assessment:** Strong facts, sympathetic client, clear defendant. We need to move fast — potential SOL issues.\n\nI recommend routing to Rex (trial strategy) and Sol (deadline tracking) immediately.\n\nI've attached my full intake brief. Let me know if you'd like me to schedule a consultation.\n\n— Maya`,
    timestamp: new Date(Date.now() - 2 * 3600000).toISOString(),
    read: false, starred: true, folder: 'inbox', tag: 'intake',
    aiSummary: 'High-priority civil rights intake. Client hit by police chief. Sol: SOL assessment needed.',
  },
  {
    id: 'seed-2',
    from: 'sol@casebuddy.live', fromName: 'Sol — Deadlines',
    to: 'firm@casebuddy.live',
    subject: '⚠️ Deadline Alert: Harvey v Galveston — Answer Due in 14 Days',
    body: `Attorney,\n\nThis is an automated deadline alert from Sol.\n\nCase: Harvey v Galveston PD\nDeadline: Answer to complaint\nDue: ${new Date(Date.now() + 14 * 86400000).toLocaleDateString()}\nDays remaining: 14\n\nAction required: File or request extension by end of week.\n\nI've added this to the deadline tracker. Would you like me to draft a motion for extension of time?\n\n— Sol`,
    timestamp: new Date(Date.now() - 5 * 3600000).toISOString(),
    read: false, starred: false, folder: 'inbox', tag: 'deadline',
    aiSummary: 'Answer due in 14 days — Harvey v Galveston. File or request extension this week.',
  },
  {
    id: 'seed-3',
    from: 'sierra@casebuddy.live', fromName: 'Sierra — Client Relations',
    to: 'firm@casebuddy.live',
    subject: 'Weekly Client Update — Harvey: Sent ✅',
    body: `Hi,\n\nJust confirming I sent Robert Harvey his weekly status update email this morning.\n\nKey points covered:\n• Case is in active investigation phase\n• We've retained a traffic reconstruction expert\n• Next court date is being coordinated\n• Reminded him of the document request we sent last week\n\nHis response rate has been excellent — replies within 2 hours on average. He's an engaged client.\n\nLet me know if you'd like me to follow up on the outstanding document request.\n\n— Sierra`,
    timestamp: new Date(Date.now() - 1 * 86400000).toISOString(),
    read: true, starred: false, folder: 'inbox', tag: 'client-update',
    aiSummary: 'Sierra sent weekly update to Robert Harvey. Document request still pending.',
  },
];

// ── Component ──────────────────────────────────────────────────────────────────
const MailRoom: React.FC = () => {
  const [emails, setEmails] = useState<Email[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved ? JSON.parse(saved) : SEED_EMAILS;
    } catch { return SEED_EMAILS; }
  });
  const [folder, setFolder] = useState<string>('inbox');
  const [selected, setSelected] = useState<Email | null>(null);
  const [composing, setComposing] = useState(false);
  const [compose, setCompose] = useState<Compose>({ to: '', subject: '', body: '', fromAgent: 'maya' });
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [aiDrafting, setAiDrafting] = useState(false);

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(emails)); } catch {}
  }, [emails]);

  const inboxCount = emails.filter(e => e.folder === 'inbox' && !e.read).length;

  const filtered = emails.filter(e => {
    if (e.folder !== folder) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return e.subject.toLowerCase().includes(q) ||
           e.fromName.toLowerCase().includes(q) ||
           e.body.toLowerCase().includes(q);
  });

  const markRead = (id: string) => setEmails(prev =>
    prev.map(e => e.id === id ? { ...e, read: true } : e));

  const toggleStar = (id: string) => setEmails(prev =>
    prev.map(e => e.id === id ? { ...e, starred: !e.starred } : e));

  const moveToTrash = (id: string) => setEmails(prev =>
    prev.map(e => e.id === id ? { ...e, folder: 'trash' } : e));

  const archiveEmail = (id: string) => setEmails(prev =>
    prev.map(e => e.id === id ? { ...e, folder: 'archive' } : e));

  const sendEmail = () => {
    if (!compose.to || !compose.subject || !compose.body) return;
    const agent = AGENT_SENDERS.find(a => a.id === compose.fromAgent);
    const newEmail: Email = {
      id: `sent-${Date.now()}`,
      from: `${compose.fromAgent}@casebuddy.live`,
      fromName: `${agent?.name || 'Firm'} — CaseBuddy`,
      to: compose.to,
      subject: compose.subject,
      body: compose.body,
      timestamp: new Date().toISOString(),
      read: true, starred: false, folder: 'sent',
    };
    setEmails(prev => [newEmail, ...prev]);
    setComposing(false);
    setCompose({ to: '', subject: '', body: '', fromAgent: 'maya' });
  };

  const aiDraftReply = async () => {
    if (!selected) return;
    setAiDrafting(true);
    try {
      const key = (window as any).__GEMINI_API_KEY || import.meta.env.VITE_GEMINI_API_KEY;
      if (!key) throw new Error('No Gemini key');
      const agent = AGENT_SENDERS.find(a => a.id === compose.fromAgent) || AGENT_SENDERS[0];
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{
              parts: [{
                text: `You are ${agent.name}, ${agent.role} at CaseBuddy AI Law Firm. 
Draft a professional, concise reply to this email. Keep it under 120 words. Be direct and action-oriented.

Original email:
From: ${selected.fromName}
Subject: ${selected.subject}
Body: ${selected.body}

Write only the email body — no subject line, no "Dear..." opener, just the reply content. Sign as "${agent.name} · CaseBuddy"`
              }]
            }],
            generationConfig: { temperature: 0.6 },
          }),
        }
      );
      const data = await res.json() as any;
      const draft = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
      setCompose({
        to: selected.from,
        subject: `Re: ${selected.subject}`,
        body: draft,
        fromAgent: compose.fromAgent,
      });
      setComposing(true);
    } catch (e: any) {
      alert('Could not generate AI draft: ' + e.message);
    }
    setAiDrafting(false);
  };

  const selectEmail = (email: Email) => {
    setSelected(email);
    if (!email.read) markRead(email.id);
  };

  const timeStr = (ts: string) => {
    const d = new Date(ts);
    const now = new Date();
    const diffH = (now.getTime() - d.getTime()) / 3600000;
    if (diffH < 24) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  const TAG_COLORS: Record<string, string> = {
    intake: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
    deadline: 'bg-red-500/20 text-red-300 border-red-500/30',
    'client-update': 'bg-green-500/20 text-green-300 border-green-500/30',
    research: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
    billing: 'bg-gold-500/20 text-gold-300 border-gold-500/30',
  };

  return (
    <div className="flex h-[calc(100vh-80px)] bg-slate-900 rounded-2xl overflow-hidden border border-slate-700">

      {/* ── Sidebar ─────────────────────────────────────────────────────────── */}
      <div className="w-52 bg-slate-800 border-r border-slate-700 flex flex-col">
        <div className="p-4 border-b border-slate-700">
          <div className="flex items-center gap-2 mb-3">
            <Mail className="text-gold-500" size={20} />
            <h1 className="text-white font-bold text-lg">Mail Room</h1>
          </div>
          <button
            onClick={() => { setComposing(true); setSelected(null); }}
            className="w-full flex items-center gap-2 bg-gold-500 hover:bg-gold-400 text-slate-900 font-semibold px-3 py-2 rounded-xl text-sm transition-colors"
          >
            <Plus size={16} /> Compose
          </button>
        </div>

        <nav className="flex-1 p-2 space-y-0.5">
          {(['inbox', 'sent', 'drafts', 'archive', 'trash'] as const).map(f => (
            <button
              key={f}
              onClick={() => { setFolder(f); setSelected(null); }}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors ${
                folder === f
                  ? 'bg-gold-500/20 text-gold-300 border border-gold-500/30'
                  : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
              }`}
            >
              <span className="flex items-center gap-2">
                {f === 'inbox' && <Inbox size={14} />}
                {f === 'sent' && <Send size={14} />}
                {f === 'drafts' && <Clock size={14} />}
                {f === 'archive' && <Archive size={14} />}
                {f === 'trash' && <Trash2 size={14} />}
                {FOLDER_LABELS[f]}
              </span>
              {f === 'inbox' && inboxCount > 0 && (
                <span className="bg-gold-500 text-slate-900 text-xs font-bold rounded-full px-1.5 py-0.5 min-w-[20px] text-center">
                  {inboxCount}
                </span>
              )}
            </button>
          ))}
        </nav>

        {/* Agent quick-send */}
        <div className="p-3 border-t border-slate-700">
          <p className="text-xs text-slate-500 uppercase tracking-wide mb-2 font-semibold">Send As</p>
          <div className="space-y-1">
            {AGENT_SENDERS.slice(0, 4).map(a => (
              <button
                key={a.id}
                onClick={() => { setCompose(c => ({ ...c, fromAgent: a.id })); setComposing(true); }}
                className={`w-full text-left px-2 py-1.5 rounded-lg text-xs transition-colors flex items-center gap-2 ${
                  compose.fromAgent === a.id && composing
                    ? 'bg-gold-500/20 text-gold-300'
                    : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
                }`}
              >
                <span>{a.emoji}</span> {a.name}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Email list ────────────────────────────────────────────────────── */}
      <div className="w-72 border-r border-slate-700 flex flex-col bg-slate-850">
        <div className="p-3 border-b border-slate-700">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search mail…"
              className="w-full bg-slate-700 text-white text-sm rounded-lg pl-8 pr-3 py-2 border border-slate-600 focus:border-gold-500 focus:outline-none placeholder:text-slate-500"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {filtered.length === 0 && (
            <div className="p-6 text-center text-slate-500 text-sm">
              <Mail size={32} className="mx-auto mb-2 opacity-30" />
              No messages in {FOLDER_LABELS[folder].toLowerCase()}
            </div>
          )}
          {filtered.map(email => (
            <div
              key={email.id}
              onClick={() => selectEmail(email)}
              className={`p-3 border-b border-slate-700/50 cursor-pointer transition-colors ${
                selected?.id === email.id
                  ? 'bg-gold-500/10 border-l-2 border-l-gold-500'
                  : 'hover:bg-slate-700/30'
              }`}
            >
              <div className="flex items-start justify-between gap-2 mb-1">
                <span className={`text-sm truncate ${!email.read ? 'font-bold text-white' : 'text-slate-300'}`}>
                  {email.fromName}
                </span>
                <span className="text-xs text-slate-500 shrink-0">{timeStr(email.timestamp)}</span>
              </div>
              <p className={`text-xs truncate mb-1 ${!email.read ? 'text-white' : 'text-slate-400'}`}>
                {email.subject}
              </p>
              <div className="flex items-center gap-1">
                {email.tag && (
                  <span className={`text-xs px-1.5 py-0.5 rounded border ${TAG_COLORS[email.tag] || 'bg-slate-700 text-slate-400 border-slate-600'}`}>
                    {email.tag}
                  </span>
                )}
                {!email.read && <span className="w-2 h-2 rounded-full bg-gold-500 ml-auto" />}
                {email.starred && <Star size={10} className="text-gold-400 fill-gold-400 ml-auto" />}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Email view / Compose ──────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0">
        {composing ? (
          /* ── Compose pane ─────────────────────────────────────────────── */
          <div className="flex-1 flex flex-col p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-white font-semibold text-lg flex items-center gap-2">
                <Plus size={18} className="text-gold-400" /> New Message
              </h2>
              <button onClick={() => setComposing(false)} className="text-slate-400 hover:text-white">
                <X size={20} />
              </button>
            </div>

            <div className="flex flex-col gap-3 mb-4">
              {/* From agent */}
              <div className="flex items-center gap-3">
                <label className="text-slate-400 text-sm w-16 shrink-0">From</label>
                <select
                  value={compose.fromAgent}
                  onChange={e => setCompose(c => ({ ...c, fromAgent: e.target.value }))}
                  className="flex-1 bg-slate-700 text-white text-sm rounded-lg px-3 py-2 border border-slate-600 focus:border-gold-500 focus:outline-none"
                >
                  {AGENT_SENDERS.map(a => (
                    <option key={a.id} value={a.id}>
                      {a.emoji} {a.name} &lt;{a.id}@casebuddy.live&gt;
                    </option>
                  ))}
                </select>
              </div>
              {/* To */}
              <div className="flex items-center gap-3">
                <label className="text-slate-400 text-sm w-16 shrink-0">To</label>
                <input
                  value={compose.to}
                  onChange={e => setCompose(c => ({ ...c, to: e.target.value }))}
                  placeholder="client@example.com"
                  className="flex-1 bg-slate-700 text-white text-sm rounded-lg px-3 py-2 border border-slate-600 focus:border-gold-500 focus:outline-none placeholder:text-slate-500"
                />
              </div>
              {/* Subject */}
              <div className="flex items-center gap-3">
                <label className="text-slate-400 text-sm w-16 shrink-0">Subject</label>
                <input
                  value={compose.subject}
                  onChange={e => setCompose(c => ({ ...c, subject: e.target.value }))}
                  placeholder="Re: Your case update"
                  className="flex-1 bg-slate-700 text-white text-sm rounded-lg px-3 py-2 border border-slate-600 focus:border-gold-500 focus:outline-none placeholder:text-slate-500"
                />
              </div>
            </div>

            <textarea
              value={compose.body}
              onChange={e => setCompose(c => ({ ...c, body: e.target.value }))}
              placeholder="Write your message…"
              className="flex-1 bg-slate-700 text-white text-sm rounded-xl p-4 border border-slate-600 focus:border-gold-500 focus:outline-none resize-none placeholder:text-slate-500 min-h-[200px]"
            />

            <div className="flex items-center gap-3 mt-4">
              <button
                onClick={sendEmail}
                disabled={!compose.to || !compose.subject || !compose.body}
                className="flex items-center gap-2 bg-gold-500 hover:bg-gold-400 disabled:opacity-40 text-slate-900 font-semibold px-5 py-2 rounded-xl text-sm transition-colors"
              >
                <Send size={14} /> Send
              </button>
              <button
                onClick={aiDraftReply}
                disabled={aiDrafting || !selected}
                className="flex items-center gap-2 border border-gold-500/40 text-gold-400 hover:bg-gold-500/10 px-4 py-2 rounded-xl text-sm transition-colors disabled:opacity-40"
              >
                {aiDrafting ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                {aiDrafting ? 'Drafting…' : 'AI Draft Reply'}
              </button>
            </div>
          </div>
        ) : selected ? (
          /* ── Email detail ──────────────────────────────────────────────── */
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Header */}
            <div className="p-5 border-b border-slate-700 bg-slate-800/50">
              <div className="flex items-start justify-between gap-4 mb-2">
                <h2 className="text-white font-semibold text-xl leading-tight">{selected.subject}</h2>
                <div className="flex items-center gap-2 shrink-0">
                  <button onClick={() => toggleStar(selected.id)}
                    className={`p-1.5 rounded-lg transition-colors ${selected.starred ? 'text-gold-400' : 'text-slate-500 hover:text-gold-400'}`}>
                    <Star size={16} className={selected.starred ? 'fill-gold-400' : ''} />
                  </button>
                  <button onClick={() => { archiveEmail(selected.id); setSelected(null); }}
                    className="p-1.5 rounded-lg text-slate-500 hover:text-white transition-colors">
                    <Archive size={16} />
                  </button>
                  <button onClick={() => { moveToTrash(selected.id); setSelected(null); }}
                    className="p-1.5 rounded-lg text-slate-500 hover:text-red-400 transition-colors">
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
              <div className="flex items-center gap-3 text-sm text-slate-400">
                <span className="font-medium text-slate-300">{selected.fromName}</span>
                <span>&lt;{selected.from}&gt;</span>
                <span className="ml-auto">{new Date(selected.timestamp).toLocaleString()}</span>
              </div>
              {selected.tag && (
                <span className={`inline-block mt-2 text-xs px-2 py-0.5 rounded border ${TAG_COLORS[selected.tag] || 'bg-slate-700 text-slate-400 border-slate-600'}`}>
                  {selected.tag}
                </span>
              )}
              {selected.aiSummary && (
                <div className="mt-3 flex items-start gap-2 bg-gold-500/10 border border-gold-500/20 rounded-xl p-3">
                  <Sparkles size={14} className="text-gold-400 mt-0.5 shrink-0" />
                  <p className="text-xs text-gold-300">{selected.aiSummary}</p>
                </div>
              )}
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto p-6">
              <pre className="text-slate-200 text-sm leading-relaxed whitespace-pre-wrap font-sans">
                {selected.body}
              </pre>
            </div>

            {/* Action bar */}
            <div className="p-4 border-t border-slate-700 flex gap-2">
              <button
                onClick={() => {
                  setCompose({ to: selected.from, subject: `Re: ${selected.subject}`, body: '', fromAgent: 'sierra' });
                  setComposing(true);
                }}
                className="flex items-center gap-2 bg-slate-700 hover:bg-slate-600 text-white px-4 py-2 rounded-xl text-sm transition-colors"
              >
                <Reply size={14} /> Reply
              </button>
              <button
                onClick={aiDraftReply}
                disabled={aiDrafting}
                className="flex items-center gap-2 border border-gold-500/40 text-gold-400 hover:bg-gold-500/10 px-4 py-2 rounded-xl text-sm transition-colors disabled:opacity-40"
              >
                {aiDrafting ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                {aiDrafting ? 'Drafting…' : 'AI Draft Reply'}
              </button>
            </div>
          </div>
        ) : (
          /* ── Empty state ────────────────────────────────────────────────── */
          <div className="flex-1 flex flex-col items-center justify-center text-center p-12">
            <Mail size={64} className="text-slate-700 mb-4" />
            <h3 className="text-slate-400 text-xl font-semibold mb-2">Mail Room</h3>
            <p className="text-slate-500 text-sm max-w-xs">
              Select an email to read it, or compose a new message from any agent.
              Maya, Sierra, Sol, and Rex can all send emails on behalf of the firm.
            </p>
            <button
              onClick={() => setComposing(true)}
              className="mt-6 flex items-center gap-2 bg-gold-500 hover:bg-gold-400 text-slate-900 font-semibold px-5 py-2.5 rounded-xl text-sm transition-colors"
            >
              <Plus size={16} /> Compose New Email
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default MailRoom;
