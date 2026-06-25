import { toast } from 'react-toastify';
import { getGeminiKey } from '../services/runtimeKeys';
import React, { useState, useEffect, useCallback } from 'react';
import {
  Mail, Send, Inbox, Star, Trash2, Plus, X,
  Paperclip, Search, Clock, CheckCircle, AlertCircle, Loader2,
  Reply, Forward, Archive, Sparkles, Phone, PhoneCall, PhoneOff,
  Bell, BellOff, RefreshCw, Tag, Filter, Zap, User, Users,
  MessageSquare, Eye, EyeOff, ChevronRight, ArrowLeft
} from 'lucide-react';
import { OPERATIONAL_AGENTS } from '../agents/personas';

// ── Types ─────────────────────────────────────────────────────────────────────
interface Email {
  id: string;
  from: string;
  fromName: string;
  fromAgent?: string; // agent id if from a firm agent
  to: string;
  subject: string;
  body: string;
  timestamp: string;
  read: boolean;
  starred: boolean;
  folder: 'inbox' | 'sent' | 'drafts' | 'archive' | 'trash';
  tag?: string;
  priority?: 'urgent' | 'normal' | 'low';
  aiSummary?: string;
  caseRef?: string; // e.g. "Harvey v. Galveston PD"
}

interface Compose {
  to: string;
  subject: string;
  body: string;
  fromAgent: string;
  priority: 'urgent' | 'normal' | 'low';
}

interface PhoneCall {
  agentId: string;
  agentName: string;
  status: 'ringing' | 'connected' | 'ended';
  duration: number;
}

const STORAGE_KEY = 'casebuddy_mailroom_v2';
const FOLDER_LABELS: Record<string, string> = {
  inbox: 'Inbox', sent: 'Sent', drafts: 'Drafts', archive: 'Archive', trash: 'Trash',
};

const AGENT_SENDERS = OPERATIONAL_AGENTS.filter(a =>
  ['maya', 'sierra', 'sol', 'lex', 'rex', 'doc', 'jules', 'max'].includes(a.id)
);

const PRIORITY_STYLES = {
  urgent: 'bg-red-500/20 text-red-300 border-red-500/30',
  normal: 'bg-slate-600/40 text-slate-300 border-slate-500/30',
  low: 'bg-slate-700/40 text-slate-400 border-slate-600/30',
};

const TAG_COLORS: Record<string, string> = {
  intake: 'bg-violet-500/20 text-violet-300 border-violet-500/30',
  deadline: 'bg-red-500/20 text-red-300 border-red-500/30',
  'client-update': 'bg-green-500/20 text-green-300 border-green-500/30',
  research: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  billing: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30',
  filing: 'bg-teal-500/20 text-teal-300 border-teal-500/30',
  strategy: 'bg-orange-500/20 text-orange-300 border-orange-500/30',
};

// ── Seed emails from each agent ───────────────────────────────────────────────
const SEED_EMAILS: Email[] = [
  {
    id: 'seed-1',
    from: 'maya@casebuddy.live', fromName: 'Maya · Intake', fromAgent: 'maya',
    to: 'firm@casebuddy.live',
    subject: '🆕 New Intake: Robert Harvey v. Galveston PD — Action Required',
    body: `Hi,

Intake just came in — flagging it as urgent.

Client: Robert Harvey
Matter: Civil rights / personal injury — client says Chief Roy struck him with a vehicle while he was filming the department.
Viability: 78/100 — strong facts, clear defendant, sympathetic story.
SOL concern: I'm flagging this for Sol immediately. We need to check the limitations window.

Recommendation: Route to Rex (trial strategy) and Sol (deadline check) today. I can schedule a consultation if you want me to reach out to the client directly.

— Maya`,
    timestamp: new Date(Date.now() - 2 * 3600000).toISOString(),
    read: false, starred: true, folder: 'inbox',
    tag: 'intake', priority: 'urgent',
    aiSummary: 'High-priority civil rights intake. SOL check needed immediately.',
    caseRef: 'Harvey v. Galveston PD',
  },
  {
    id: 'seed-2',
    from: 'sol@casebuddy.live', fromName: 'Sol · Deadlines', fromAgent: 'sol',
    to: 'firm@casebuddy.live',
    subject: `⚠️ Deadline Alert: Answer Due in 14 Days — Harvey v. Galveston`,
    body: `Attorney,

Automated deadline alert from Sol.

Case: Harvey v. Galveston PD
Deadline: Answer to complaint
Due: ${new Date(Date.now() + 14 * 86400000).toLocaleDateString()}
Days remaining: 14 ← ACTION NEEDED THIS WEEK

Options: (1) File the answer, (2) Motion for extension of time. I can draft the extension motion today if you need it.

I've added this to the Deadline Tracker. Do not let this slip.

— Sol`,
    timestamp: new Date(Date.now() - 5 * 3600000).toISOString(),
    read: false, starred: false, folder: 'inbox',
    tag: 'deadline', priority: 'urgent',
    aiSummary: 'Answer due 14 days. File or request extension this week.',
    caseRef: 'Harvey v. Galveston PD',
  },
  {
    id: 'seed-3',
    from: 'sierra@casebuddy.live', fromName: 'Sierra · Client Relations', fromAgent: 'sierra',
    to: 'firm@casebuddy.live',
    subject: 'Weekly Client Update — Harvey ✅ Sent',
    body: `Hi,

Confirming I sent Robert Harvey his weekly status update this morning.

Covered:
• Case in active investigation
• Traffic reconstruction expert retained
• Next court date being coordinated
• Reminded him of the outstanding document request

He's responsive — replies within 2 hours on average. Good sign.

The document request is still open. Want me to send a follow-up nudge?

— Sierra`,
    timestamp: new Date(Date.now() - 1 * 86400000).toISOString(),
    read: true, starred: false, folder: 'inbox',
    tag: 'client-update', priority: 'normal',
    aiSummary: 'Weekly update sent to Harvey. Document request still pending.',
    caseRef: 'Harvey v. Galveston PD',
  },
  {
    id: 'seed-4',
    from: 'lex@casebuddy.live', fromName: 'Lex · Legal Research', fromAgent: 'lex',
    to: 'firm@casebuddy.live',
    subject: '📚 Research Complete: § 1983 Civil Rights Claims — Key Precedents',
    body: `Attorney,

Completed the § 1983 research for Harvey. Here's what you need:

Controlling standard: Graham v. Connor (1989) — excessive force analyzed under 4th Amendment objective reasonableness. This is your foundation.

Key circuits: If we're in the 5th Circuit, Darden v. City of Fort Worth (2019) is favorable for us — it held that using a vehicle as a weapon can constitute deadly force requiring a credible threat first.

Qualified immunity: This is our biggest hurdle. We need to show the right was clearly established. Garner v. Tennessee (1985) establishes you can't use deadly force unless the suspect poses a significant threat. Chief Roy driving at Harvey while he's filming is a strong fact pattern.

Discovery focus: Dash cam footage, internal use-of-force policies, Roy's disciplinary history. That's where this case is won or lost.

I'll have a full memo in your inbox by EOD.

— Lex`,
    timestamp: new Date(Date.now() - 3 * 3600000).toISOString(),
    read: false, starred: true, folder: 'inbox',
    tag: 'research', priority: 'normal',
    aiSummary: '§ 1983 research done. Graham v. Connor is key. QI is the hurdle. Discovery = dash cam + Roy history.',
    caseRef: 'Harvey v. Galveston PD',
  },
  {
    id: 'seed-5',
    from: 'rex@casebuddy.live', fromName: 'Rex · Trial Strategy', fromAgent: 'rex',
    to: 'firm@casebuddy.live',
    subject: '🎯 Trial Strategy Brief — Harvey v. Galveston PD',
    body: `Attorney,

Here's the play for Harvey.

THEME: "A man with a camera was run down by a police chief who thought he was above accountability." Short. Human. Devastating.

OPENING structure:
1. Start with Harvey — who he is, what he was doing (filming, legal activity)
2. One sentence on what Roy did
3. Close with the question: "Was he above the law?"

WITNESS order:
1. Harvey first — sympathy first, facts second
2. Traffic reconstruction expert — physical proof
3. Department policy expert — they violated their own rules

CROSS of Roy: Don't go for blood early. Let him explain. Let him dig. The jury will see it.

RED FLAGS: If Roy's attorney tries to put Harvey's filming on trial, object immediately and bench conference. That's the move they'll make.

Ready to run a full mock cross whenever you are.

— Rex`,
    timestamp: new Date(Date.now() - 6 * 3600000).toISOString(),
    read: true, starred: true, folder: 'inbox',
    tag: 'strategy', priority: 'normal',
    aiSummary: 'Theme: man with camera run down. Open with Harvey, expert, policy witness order.',
    caseRef: 'Harvey v. Galveston PD',
  },
  {
    id: 'seed-6',
    from: 'doc@casebuddy.live', fromName: 'Doc · Document Lab', fromAgent: 'doc',
    to: 'firm@casebuddy.live',
    subject: '📄 Draft Ready: Demand Letter — Harvey v. Galveston PD',
    body: `Attorney,

Demand letter is drafted and ready for your review. Key points I included:

• Liability basis: § 1983 + state tort (battery by vehicle)
• Damages demand: $1.2M (medical, lost income, pain & suffering, punitive element for willful conduct)
• Preservation letter: Included demands for dash cam footage, radio logs, Roy's personnel file, use-of-force reports from the past 5 years
• Response deadline: 30 days

One note: I flagged the punitive damages argument as strong here — Roy's conduct was willful and his position of authority makes it worse, not better.

File is in Document Center. Let me know if you want any numbers adjusted before you send.

— Doc`,
    timestamp: new Date(Date.now() - 8 * 3600000).toISOString(),
    read: true, starred: false, folder: 'inbox',
    tag: 'filing', priority: 'normal',
    aiSummary: 'Demand letter ready. $1.2M ask. Punitive element flagged as strong.',
    caseRef: 'Harvey v. Galveston PD',
  },
];

const emptyCompose: Compose = {
  to: '', subject: '', body: '', fromAgent: 'sierra', priority: 'normal',
};

// ── Helpers ───────────────────────────────────────────────────────────────────
const timeStr = (ts: string) => {
  const d = new Date(ts);
  const now = new Date();
  const diffH = (now.getTime() - d.getTime()) / 3600000;
  if (diffH < 24) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
};

const agentColor = (agentId?: string): string => {
  const agent = OPERATIONAL_AGENTS.find(a => a.id === agentId);
  return agent?.colorClass || 'text-slate-400';
};

const agentBg = (agentId?: string): string => {
  const agent = OPERATIONAL_AGENTS.find(a => a.id === agentId);
  return agent?.bgClass || 'bg-slate-700';
};

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
  const [compose, setCompose] = useState<Compose>(emptyCompose);
  const [search, setSearch] = useState('');
  const [aiDrafting, setAiDrafting] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [activeCall, setActiveCall] = useState<PhoneCall | null>(null);
  const [callTimer, setCallTimer] = useState(0);
  const [filterTag, setFilterTag] = useState<string | null>(null);
  const [filterAgent, setFilterAgent] = useState<string | null>(null);
  const [notifications, setNotifications] = useState(true);
  const [agentBrief, setAgentBrief] = useState<{ agentId: string; loading: boolean; text: string } | null>(null);

  // Persist
  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(emails)); } catch {}
  }, [emails]);

  // ── Live Supabase email sync ──────────────────────────────────────────────
  const [syncStatus, setSyncStatus] = React.useState<'idle'|'syncing'|'ok'|'error'>('idle');

  const syncFromSupabase = React.useCallback(async () => {
    try {
      setSyncStatus('syncing');
      const sbUrl  = import.meta.env.VITE_SUPABASE_URL;
      const sbAnon = import.meta.env.VITE_SUPABASE_ANON_KEY;
      if (!sbUrl || !sbAnon) { setSyncStatus('idle'); return; }

      const res = await fetch(
        `${sbUrl}/rest/v1/firm_emails?order=received_at.desc&limit=100`,
        { headers: { apikey: sbAnon, Authorization: `Bearer ${sbAnon}` } }
      );
      if (!res.ok) { setSyncStatus('error'); return; }
      const rows: any[] = await res.json();

      const mapped: Email[] = rows.map(r => ({
        id: r.id,
        from: r.from_address,
        fromName: r.from_name || r.from_address,
        to: r.to_address,
        subject: r.subject,
        body: r.body,
        timestamp: r.received_at,
        read: r.read ?? (r.direction === 'outbound'),
        starred: r.starred ?? false,
        folder: r.direction === 'outbound' ? 'sent' : 'inbox',
        tag: r.intent !== 'general' ? r.intent : undefined,
        aiSummary: r.metadata?.aiSummary,
      }));

      if (mapped.length > 0) {
        setEmails(prev => {
          const ids = new Set(mapped.map(m => m.id));
          const local = prev.filter(e => !ids.has(e.id) && e.id.startsWith('seed-'));
          return [...mapped, ...local];
        });
      }
      setSyncStatus('ok');
    } catch { setSyncStatus('error'); }
  }, []);

  React.useEffect(() => {
    syncFromSupabase();
    const interval = setInterval(syncFromSupabase, 30000);
    return () => clearInterval(interval);
  }, [syncFromSupabase]);



  // Call timer
  useEffect(() => {
    if (!activeCall || activeCall.status !== 'connected') return;
    const t = setInterval(() => setCallTimer(s => s + 1), 1000);
    return () => clearInterval(t);
  }, [activeCall]);

  const fmtDuration = (s: number) =>
    `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

  const inboxCount = emails.filter(e => e.folder === 'inbox' && !e.read).length;
  const urgentCount = emails.filter(e => e.folder === 'inbox' && !e.read && e.priority === 'urgent').length;

  const filtered = emails.filter(e => {
    if (e.folder !== folder) return false;
    if (filterTag && e.tag !== filterTag) return false;
    if (filterAgent && e.fromAgent !== filterAgent) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return e.subject.toLowerCase().includes(q) ||
           e.fromName.toLowerCase().includes(q) ||
           e.body.toLowerCase().includes(q) ||
           (e.caseRef || '').toLowerCase().includes(q);
  });

  const markRead = (id: string) => setEmails(prev =>
    prev.map(e => e.id === id ? { ...e, read: true } : e));
  const toggleStar = (id: string) => setEmails(prev =>
    prev.map(e => e.id === id ? { ...e, starred: !e.starred } : e));
  const moveToTrash = (id: string) => setEmails(prev =>
    prev.map(e => e.id === id ? { ...e, folder: 'trash' } : e));
  const archiveEmail = (id: string) => setEmails(prev =>
    prev.map(e => e.id === id ? { ...e, folder: 'archive' } : e));

  const selectEmail = (email: Email) => {
    setSelected(email);
    setComposing(false);
    if (!email.read) markRead(email.id);
  };

  const sendEmail = async () => {
    if (!compose.to || !compose.subject || !compose.body) return;
    setIsSending(true);
    const agent = AGENT_SENDERS.find(a => a.id === compose.fromAgent);
    // Send via real API if available
    try {
      await fetch('/api/mail/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: compose.fromAgent,
          to: compose.to,
          subject: compose.subject,
          body: compose.body,
        }),
      });
    } catch { /* fall through to local display */ }
    const newEmail: Email = {
      id: `sent-${Date.now()}`,
      from: `${compose.fromAgent}@casebuddy.live`,
      fromName: `${agent?.name || 'Firm'} · CaseBuddy`,
      fromAgent: compose.fromAgent,
      to: compose.to,
      subject: compose.subject,
      body: compose.body,
      timestamp: new Date().toISOString(),
      read: true, starred: false, folder: 'sent',
      priority: compose.priority,
    };
    setEmails(prev => [newEmail, ...prev]);
    setIsSending(false);
    setComposing(false);
    setCompose(emptyCompose);
  };

  const aiDraftReply = async () => {
    if (!selected) return;
    setAiDrafting(true);
    try {
      const key = getGeminiKey();
      if (!key) throw new Error('Gemini API key not configured. Add it in Settings.');
      const agent = AGENT_SENDERS.find(a => a.id === compose.fromAgent) || AGENT_SENDERS[0];
      const prompt = `You are ${agent.name}, ${agent.role} at CaseBuddy AI Law Firm.\nDraft a professional, concise email reply in under 100 words. Be direct and action-oriented. Match the agent's voice.\nOriginal email:\nFrom: ${selected.fromName}\nSubject: ${selected.subject}\nBody: ${selected.body.slice(0, 800)}\nWrite only the email body. Sign as "— ${agent.name}"`;
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.6 } }),
        }
      );
      if (!res.ok) throw new Error(`Gemini error ${res.status}`);
      const data = await res.json() as any;
      const draft = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
      if (!draft) throw new Error('Empty response from AI');
      setCompose(c => ({ ...c, to: selected.from, subject: `Re: ${selected.subject}`, body: draft }));
      setComposing(true);
    } catch (e: any) {
      toast.error('AI draft failed: ' + e.message);
    } finally {
      setAiDrafting(false);
    }
  };

  const generateAgentBrief = async (agentId: string) => {
    setAgentBrief({ agentId, loading: true, text: '' });
    try {
      const key = getGeminiKey();
      if (!key) { setAgentBrief({ agentId, loading: false, text: 'Gemini key not configured.' }); return; }
      const agent = OPERATIONAL_AGENTS.find(a => a.id === agentId);
      const agentEmails = emails.filter(e => e.fromAgent === agentId).slice(0, 5);
      const prompt = `You are ${agent?.name}, ${agent?.role} at CaseBuddy. Give a 3-sentence status briefing on your current workload based on these recent emails. Be concise and in-character.\nEmails: ${agentEmails.map(e => '[' + e.subject + ']: ' + e.body.slice(0, 200)).join('\n\n')}`;
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.7 } }),
        }
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as any;
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text || 'No briefing available.';
      setAgentBrief({ agentId, loading: false, text });
    } catch (e: any) {
      setAgentBrief({ agentId, loading: false, text: 'Could not load briefing: ' + e.message });
    }
  };

  // ── In-app phone call simulation ─────────────────────────────────────────
  const startCall = (agentId: string) => {
    const agent = OPERATIONAL_AGENTS.find(a => a.id === agentId);
    if (!agent) return;
    setActiveCall({ agentId, agentName: agent.name, status: 'ringing', duration: 0 });
    setCallTimer(0);
    setTimeout(() => {
      setActiveCall(prev => prev ? { ...prev, status: 'connected' } : null);
    }, 1800);
  };

  const endCall = () => {
    setActiveCall(prev => prev ? { ...prev, status: 'ended' } : null);
    setTimeout(() => setActiveCall(null), 1000);
  };

  // ── Agent roster panel ────────────────────────────────────────────────────
  const agentEmailCounts = AGENT_SENDERS.map(a => ({
    ...a,
    unread: emails.filter(e => e.fromAgent === a.id && !e.read && e.folder === 'inbox').length,
    total: emails.filter(e => e.fromAgent === a.id && e.folder === 'inbox').length,
  }));

  return (
    <div className="flex h-[calc(100vh-80px)] bg-slate-900 rounded-2xl overflow-hidden border border-slate-700 relative">

      {/* ── Active Call Overlay ──────────────────────────────────────────── */}
      {activeCall && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="bg-slate-800 border border-slate-600 rounded-2xl p-8 w-80 text-center shadow-2xl">
            <div className={`w-20 h-20 rounded-full mx-auto mb-4 flex items-center justify-center text-3xl ${agentBg(activeCall.agentId)} border-2 ${activeCall.status === 'connected' ? 'border-green-500 animate-pulse' : 'border-yellow-500'}`}>
              {OPERATIONAL_AGENTS.find(a => a.id === activeCall.agentId)?.emoji || '📞'}
            </div>
            <h2 className="text-white font-bold text-xl mb-1">{activeCall.agentName}</h2>
            <p className={`text-sm mb-2 ${activeCall.status === 'ringing' ? 'text-yellow-400' : activeCall.status === 'connected' ? 'text-green-400' : 'text-slate-400'}`}>
              {activeCall.status === 'ringing' ? '📳 Ringing…' : activeCall.status === 'connected' ? `🟢 Connected · ${fmtDuration(callTimer)}` : '📵 Call ended'}
            </p>
            <p className="text-slate-400 text-xs mb-6">
              {activeCall.status === 'connected'
                ? `You're connected to ${activeCall.agentName}. Switch to the Voice Room for full AI conversation.`
                : activeCall.status === 'ringing'
                ? 'Establishing secure line…'
                : 'Line closed.'}
            </p>
            {activeCall.status !== 'ended' && (
              <div className="flex gap-3 justify-center">
                <button
                  onClick={endCall}
                  className="flex items-center gap-2 bg-red-600 hover:bg-red-500 text-white font-semibold px-5 py-2.5 rounded-xl text-sm transition-colors"
                >
                  <PhoneOff size={16} /> End Call
                </button>
                {activeCall.status === 'connected' && (
                  <a
                    href="/app/firm"
                    className="flex items-center gap-2 bg-gold-500 hover:bg-gold-400 text-slate-900 font-semibold px-5 py-2.5 rounded-xl text-sm transition-colors"
                  >
                    <PhoneCall size={16} /> Voice Room
                  </a>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Left Sidebar ─────────────────────────────────────────────────── */}
      <div className="w-56 bg-slate-800 border-r border-slate-700 flex flex-col shrink-0">
        {/* Header */}
        <div className="p-4 border-b border-slate-700">
          <div className="flex items-center gap-2 mb-3">
            <Mail className="text-gold-500" size={20} />
            <h1 className="text-white font-bold text-lg">Mail Room</h1>
            {urgentCount > 0 && (
              <span className="bg-red-500 text-white text-xs font-bold rounded-full px-1.5 py-0.5 ml-auto">
                {urgentCount}
              </span>
            )}
          </div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-slate-500">
              {syncStatus === 'syncing' && '⟳ Syncing…'}
              {syncStatus === 'ok' && '✓ Live'}
              {syncStatus === 'error' && '⚠ Offline'}
            </span>
            <button onClick={syncFromSupabase} className="text-xs text-slate-500 hover:text-white transition-colors">Refresh</button>
          </div>
          <button
            onClick={() => { setComposing(true); setSelected(null); }}
            className="w-full flex items-center gap-2 bg-gold-500 hover:bg-gold-400 text-slate-900 font-semibold px-3 py-2 rounded-xl text-sm transition-colors"
          >
            <Plus size={16} /> Compose
          </button>
        </div>

        {/* Folders */}
        <nav className="p-2 space-y-0.5 border-b border-slate-700">
          {(['inbox', 'sent', 'drafts', 'archive', 'trash'] as const).map(f => (
            <button
              key={f}
              onClick={() => { setFolder(f); setSelected(null); setFilterTag(null); setFilterAgent(null); }}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors ${
                folder === f
                  ? 'bg-gold-500/20 text-gold-300 border border-gold-500/30'
                  : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
              }`}
            >
              <span className="flex items-center gap-2">
                {f === 'inbox' && <Inbox size={13} />}
                {f === 'sent' && <Send size={13} />}
                {f === 'drafts' && <Clock size={13} />}
                {f === 'archive' && <Archive size={13} />}
                {f === 'trash' && <Trash2 size={13} />}
                {FOLDER_LABELS[f]}
              </span>
              {f === 'inbox' && inboxCount > 0 && (
                <span className="bg-gold-500 text-slate-900 text-xs font-bold rounded-full px-1.5 min-w-[20px] text-center">
                  {inboxCount}
                </span>
              )}
            </button>
          ))}
        </nav>

        {/* Agent Roster — quick call + email */}
        <div className="flex-1 overflow-y-auto p-2">
          <p className="text-xs text-slate-500 uppercase tracking-wide px-2 pt-2 pb-1 font-semibold">Firm Agents</p>
          <div className="space-y-0.5">
            {agentEmailCounts.map(a => (
              <div key={a.id} className="group">
                <button
                  onClick={() => { setFilterAgent(filterAgent === a.id ? null : a.id); setFolder('inbox'); }}
                  className={`w-full text-left px-2 py-1.5 rounded-lg text-xs transition-colors flex items-center gap-2 ${
                    filterAgent === a.id
                      ? `${a.bgClass} ${a.colorClass} border ${a.borderClass}`
                      : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
                  }`}
                >
                  <span className="text-base">{a.emoji}</span>
                  <span className="flex-1 truncate font-medium">{a.name}</span>
                  {a.unread > 0 && (
                    <span className="bg-gold-500 text-slate-900 text-xs font-bold rounded-full px-1 min-w-[16px] text-center">
                      {a.unread}
                    </span>
                  )}
                </button>
                {/* Quick actions on hover */}
                <div className="hidden group-hover:flex gap-1 px-2 pb-1">
                  <button
                    onClick={() => { setCompose(c => ({ ...c, fromAgent: a.id })); setComposing(true); setSelected(null); }}
                    className="flex-1 text-xs text-slate-400 hover:text-gold-400 bg-slate-700/50 hover:bg-slate-700 px-2 py-1 rounded-md transition-colors flex items-center gap-1 justify-center"
                    title={`Email from ${a.name}`}
                  >
                    <Mail size={10} /> Email
                  </button>
                  <button
                    onClick={() => startCall(a.id)}
                    className="flex-1 text-xs text-slate-400 hover:text-green-400 bg-slate-700/50 hover:bg-slate-700 px-2 py-1 rounded-md transition-colors flex items-center gap-1 justify-center"
                    title={`Call ${a.name}`}
                  >
                    <Phone size={10} /> Call
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Notification toggle */}
        <div className="p-3 border-t border-slate-700">
          <button
            onClick={() => setNotifications(!notifications)}
            className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs transition-colors ${
              notifications ? 'text-green-400 bg-green-500/10' : 'text-slate-500 hover:text-slate-400'
            }`}
          >
            {notifications ? <Bell size={12} /> : <BellOff size={12} />}
            {notifications ? 'Notifications on' : 'Notifications off'}
          </button>
        </div>
      </div>

      {/* ── Email List ───────────────────────────────────────────────────── */}
      <div className="w-72 border-r border-slate-700 flex flex-col bg-slate-850 shrink-0">
        {/* Search + filters */}
        <div className="p-3 border-b border-slate-700 space-y-2">
          <div className="relative">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search mail…"
              className="w-full bg-slate-700 text-white text-sm rounded-lg pl-8 pr-3 py-2 border border-slate-600 focus:border-gold-500 focus:outline-none placeholder:text-slate-500"
            />
          </div>
          {/* Tag filters */}
          <div className="flex flex-wrap gap-1">
            {['urgent', 'deadline', 'intake', 'research'].map(tag => (
              <button
                key={tag}
                onClick={() => setFilterTag(filterTag === tag ? null : tag)}
                className={`text-xs px-2 py-0.5 rounded border transition-colors ${
                  filterTag === tag
                    ? (TAG_COLORS[tag] || PRIORITY_STYLES.urgent)
                    : 'text-slate-500 border-slate-600 hover:border-slate-400 hover:text-slate-300'
                }`}
              >
                {tag}
              </button>
            ))}
            {(filterTag || filterAgent) && (
              <button
                onClick={() => { setFilterTag(null); setFilterAgent(null); }}
                className="text-xs px-2 py-0.5 rounded border border-red-500/30 text-red-400 hover:bg-red-500/10 transition-colors"
              >
                clear
              </button>
            )}
          </div>
        </div>

        {/* Email list */}
        <div className="flex-1 overflow-y-auto">
          {filtered.length === 0 && (
            <div className="p-6 text-center text-slate-500 text-sm">
              <Mail size={28} className="mx-auto mb-2 opacity-30" />
              No messages
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
              <div className="flex items-start justify-between gap-1 mb-0.5">
                <span className={`text-xs truncate flex items-center gap-1 ${agentColor(email.fromAgent)}`}>
                  <span>{OPERATIONAL_AGENTS.find(a => a.id === email.fromAgent)?.emoji}</span>
                  {email.fromName}
                </span>
                <span className="text-xs text-slate-500 shrink-0">{timeStr(email.timestamp)}</span>
              </div>
              <p className={`text-xs truncate mb-1.5 ${!email.read ? 'font-bold text-white' : 'text-slate-300'}`}>
                {email.subject}
              </p>
              <div className="flex items-center gap-1 flex-wrap">
                {email.priority === 'urgent' && (
                  <span className="text-xs px-1.5 py-0.5 rounded border bg-red-500/20 text-red-300 border-red-500/30">
                    urgent
                  </span>
                )}
                {email.tag && (
                  <span className={`text-xs px-1.5 py-0.5 rounded border ${TAG_COLORS[email.tag] || 'bg-slate-700 text-slate-400 border-slate-600'}`}>
                    {email.tag}
                  </span>
                )}
                <div className="ml-auto flex items-center gap-1">
                  {!email.read && <span className="w-2 h-2 rounded-full bg-gold-500" />}
                  {email.starred && <Star size={10} className="text-gold-400 fill-gold-400" />}
                </div>
              </div>
              {email.caseRef && (
                <p className="text-xs text-slate-500 truncate mt-0.5">📁 {email.caseRef}</p>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* ── Main Panel ──────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {composing ? (
          /* ── Compose ─────────────────────────────────────────────────── */
          <div className="flex-1 flex flex-col p-6 overflow-y-auto">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-white font-semibold text-lg flex items-center gap-2">
                <Plus size={18} className="text-gold-400" /> New Message
              </h2>
              <button onClick={() => setComposing(false)} className="text-slate-400 hover:text-white">
                <X size={20} />
              </button>
            </div>

            <div className="space-y-3 mb-4">
              {/* From agent */}
              <div className="flex items-center gap-3">
                <label className="text-slate-400 text-sm w-20 shrink-0">From</label>
                <select
                  value={compose.fromAgent}
                  onChange={e => setCompose(c => ({ ...c, fromAgent: e.target.value }))}
                  className="flex-1 bg-slate-700 text-white text-sm rounded-lg px-3 py-2 border border-slate-600 focus:border-gold-500 focus:outline-none"
                >
                  {AGENT_SENDERS.map(a => (
                    <option key={a.id} value={a.id}>
                      {a.emoji} {a.name} ({a.role}) — {a.id}@casebuddy.live
                    </option>
                  ))}
                </select>
              </div>
              {/* To */}
              <div className="flex items-center gap-3">
                <label className="text-slate-400 text-sm w-20 shrink-0">To</label>
                <input
                  value={compose.to}
                  onChange={e => setCompose(c => ({ ...c, to: e.target.value }))}
                  placeholder="client@your@firm.com"
                  className="flex-1 bg-slate-700 text-white text-sm rounded-lg px-3 py-2 border border-slate-600 focus:border-gold-500 focus:outline-none placeholder:text-slate-500"
                />
              </div>
              {/* Subject */}
              <div className="flex items-center gap-3">
                <label className="text-slate-400 text-sm w-20 shrink-0">Subject</label>
                <input
                  value={compose.subject}
                  onChange={e => setCompose(c => ({ ...c, subject: e.target.value }))}
                  placeholder="Subject line"
                  className="flex-1 bg-slate-700 text-white text-sm rounded-lg px-3 py-2 border border-slate-600 focus:border-gold-500 focus:outline-none placeholder:text-slate-500"
                />
              </div>
              {/* Priority */}
              <div className="flex items-center gap-3">
                <label className="text-slate-400 text-sm w-20 shrink-0">Priority</label>
                <div className="flex gap-2">
                  {(['urgent', 'normal', 'low'] as const).map(p => (
                    <button
                      key={p}
                      onClick={() => setCompose(c => ({ ...c, priority: p }))}
                      className={`text-xs px-3 py-1.5 rounded-lg border capitalize transition-colors ${
                        compose.priority === p ? PRIORITY_STYLES[p] : 'text-slate-500 border-slate-600 hover:border-slate-400'
                      }`}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <textarea
              value={compose.body}
              onChange={e => setCompose(c => ({ ...c, body: e.target.value }))}
              placeholder={`Message from ${AGENT_SENDERS.find(a => a.id === compose.fromAgent)?.name || 'agent'}…`}
              className="flex-1 bg-slate-700 text-white text-sm rounded-xl p-4 border border-slate-600 focus:border-gold-500 focus:outline-none resize-none placeholder:text-slate-500 min-h-[220px]"
            />

            <div className="flex items-center gap-3 mt-4 flex-wrap">
              <button
                onClick={sendEmail}
                disabled={isSending || !compose.to || !compose.subject || !compose.body}
                className="flex items-center gap-2 bg-gold-500 hover:bg-gold-400 disabled:opacity-40 text-slate-900 font-semibold px-5 py-2 rounded-xl text-sm transition-colors"
              >
                <Send size={14} />{isSending ? 'Sending…' : 'Send'}
              </button>
              <button
                onClick={aiDraftReply}
                disabled={aiDrafting || !selected}
                className="flex items-center gap-2 border border-gold-500/40 text-gold-400 hover:bg-gold-500/10 px-4 py-2 rounded-xl text-sm transition-colors disabled:opacity-40"
              >
                {aiDrafting ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                {aiDrafting ? 'Drafting…' : 'AI Draft Reply'}
              </button>
              <button
                onClick={() => setComposing(false)}
                className="text-slate-400 hover:text-white px-4 py-2 text-sm"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : selected ? (
          /* ── Email Detail ─────────────────────────────────────────────── */
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Email header */}
            <div className={`p-5 border-b border-slate-700 ${agentBg(selected.fromAgent)}/30`}>
              <div className="flex items-start justify-between gap-4 mb-2">
                <div className="flex-1 min-w-0">
                  <h2 className="text-white font-semibold text-base leading-snug mb-1">
                    {selected.subject}
                  </h2>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-sm font-medium flex items-center gap-1.5 ${agentColor(selected.fromAgent)}`}>
                      <span>{OPERATIONAL_AGENTS.find(a => a.id === selected.fromAgent)?.emoji}</span>
                      {selected.fromName}
                    </span>
                    <span className="text-slate-500 text-xs">→ {selected.to}</span>
                    <span className="text-slate-500 text-xs">{new Date(selected.timestamp).toLocaleString()}</span>
                  </div>
                  <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                    {selected.priority === 'urgent' && (
                      <span className="text-xs px-2 py-0.5 rounded border bg-red-500/20 text-red-300 border-red-500/30">🔴 Urgent</span>
                    )}
                    {selected.tag && (
                      <span className={`text-xs px-2 py-0.5 rounded border ${TAG_COLORS[selected.tag] || ''}`}>
                        {selected.tag}
                      </span>
                    )}
                    {selected.caseRef && (
                      <span className="text-xs px-2 py-0.5 rounded border border-slate-600 text-slate-400">
                        📁 {selected.caseRef}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => toggleStar(selected.id)} className="p-1.5 rounded-lg hover:bg-slate-700 transition-colors">
                    <Star size={15} className={selected.starred ? 'text-gold-400 fill-gold-400' : 'text-slate-400'} />
                  </button>
                  <button onClick={() => archiveEmail(selected.id)} className="p-1.5 rounded-lg hover:bg-slate-700 transition-colors text-slate-400 hover:text-white">
                    <Archive size={15} />
                  </button>
                  <button onClick={() => moveToTrash(selected.id)} className="p-1.5 rounded-lg hover:bg-slate-700 transition-colors text-slate-400 hover:text-red-400">
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>

              {/* AI Summary */}
              {selected.aiSummary && (
                <div className="mt-3 bg-gold-500/10 border border-gold-500/20 rounded-xl px-4 py-2.5 flex items-start gap-2">
                  <Sparkles size={14} className="text-gold-400 mt-0.5 shrink-0" />
                  <p className="text-gold-200 text-xs leading-relaxed">{selected.aiSummary}</p>
                </div>
              )}
            </div>

            {/* Email body */}
            <div className="flex-1 overflow-y-auto p-6">
              <pre className="text-slate-200 text-sm leading-relaxed whitespace-pre-wrap font-sans">
                {selected.body}
              </pre>
            </div>

            {/* Action bar */}
            <div className="p-4 border-t border-slate-700 bg-slate-800/50">
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  onClick={() => {
                    setCompose(c => ({
                      ...c,
                      to: selected.from,
                      subject: `Re: ${selected.subject}`,
                      fromAgent: selected.fromAgent || 'sierra',
                    }));
                    setComposing(true);
                  }}
                  className="flex items-center gap-2 bg-gold-500 hover:bg-gold-400 text-slate-900 font-semibold px-4 py-2 rounded-xl text-sm transition-colors"
                >
                  <Reply size={14} /> Reply
                </button>
                <button
                  onClick={aiDraftReply}
                  disabled={aiDrafting}
                  className="flex items-center gap-2 border border-gold-500/40 text-gold-400 hover:bg-gold-500/10 px-4 py-2 rounded-xl text-sm transition-colors disabled:opacity-40"
                >
                  {aiDrafting ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                  AI Draft
                </button>
                {selected.fromAgent && (
                  <>
                    <button
                      onClick={() => startCall(selected.fromAgent!)}
                      className="flex items-center gap-2 border border-green-500/40 text-green-400 hover:bg-green-500/10 px-4 py-2 rounded-xl text-sm transition-colors"
                    >
                      <Phone size={14} /> Call {OPERATIONAL_AGENTS.find(a => a.id === selected.fromAgent)?.name}
                    </button>
                    <button
                      onClick={() => generateAgentBrief(selected.fromAgent!)}
                      className="flex items-center gap-2 border border-blue-500/40 text-blue-400 hover:bg-blue-500/10 px-4 py-2 rounded-xl text-sm transition-colors"
                    >
                      <MessageSquare size={14} /> Agent Brief
                    </button>
                  </>
                )}
              </div>

              {/* Agent Brief panel */}
              {agentBrief && agentBrief.agentId === selected.fromAgent && (
                <div className="mt-3 bg-blue-500/10 border border-blue-500/20 rounded-xl p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-blue-300 text-xs font-semibold uppercase tracking-wide">Agent Briefing</span>
                    <button onClick={() => setAgentBrief(null)} className="text-slate-500 hover:text-white">
                      <X size={14} />
                    </button>
                  </div>
                  {agentBrief.loading
                    ? <div className="flex items-center gap-2 text-slate-400 text-sm"><Loader2 size={14} className="animate-spin" /> Getting briefing…</div>
                    : <p className="text-slate-200 text-sm leading-relaxed">{agentBrief.text}</p>
                  }
                </div>
              )}
            </div>
          </div>
        ) : (
          /* ── Empty state ──────────────────────────────────────────────── */
          <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
            <div className="w-20 h-20 rounded-2xl bg-gold-500/10 border border-gold-500/20 flex items-center justify-center mb-4">
              <Mail size={36} className="text-gold-400" />
            </div>
            <h2 className="text-white font-semibold text-xl mb-2">Mail Room</h2>
            <p className="text-slate-400 text-sm max-w-xs mb-6">
              Your AI firm team sends you updates here — intakes from Maya, deadline alerts from Sol, research from Lex, strategy from Rex, and more.
            </p>
            <div className="grid grid-cols-2 gap-3 w-full max-w-sm">
              {agentEmailCounts.slice(0, 4).map(a => (
                <button
                  key={a.id}
                  onClick={() => { setCompose(c => ({ ...c, fromAgent: a.id })); setComposing(true); }}
                  className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border ${a.bgClass} ${a.borderClass} hover:brightness-110 transition-all text-left text-sm`}
                >
                  <span className="text-lg">{a.emoji}</span>
                  <div>
                    <p className={`font-semibold text-xs ${a.colorClass}`}>{a.name}</p>
                    <p className="text-slate-400 text-xs">{a.role.split('&')[0].trim()}</p>
                  </div>
                </button>
              ))}
            </div>
            <button
              onClick={() => { setComposing(true); }}
              className="mt-4 flex items-center gap-2 bg-gold-500 hover:bg-gold-400 text-slate-900 font-semibold px-5 py-2 rounded-xl text-sm transition-colors"
            >
              <Plus size={16} /> Compose Message
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default MailRoom;
