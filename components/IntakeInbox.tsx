import React, { useContext, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import {
  Inbox, Copy, Check, ExternalLink, ChevronDown, Scale,
  CircleDot, ThumbsUp, ThumbsDown, ArrowRightCircle, RefreshCw,
  Share2, UserPlus, Link2, Trash2, Clock, CheckCircle2, Eye, Loader2,
} from 'lucide-react';
import { AppContext } from '../App';
import { Case, CaseStatus, IntakeCase, IntakeStatus } from '../types';
import { fetchIntakes, subscribeIntakes, updateIntakeStatus, intakeBackendLabel } from '../services/intakeStore';
import { createClientInvite, fetchClientInvites, deleteClientInvite, ClientInvite } from '../services/clientInviteStore';
import { getSpecialistById } from '../agents/personas';

// ── Helpers ───────────────────────────────────────────────────────────────────
const scoreColor = (s: number) =>
  s >= 65 ? 'text-green-400 border-green-500/40 bg-green-500/10'
  : s >= 45 ? 'text-amber-400 border-amber-500/40 bg-amber-500/10'
  : 'text-rose-400 border-rose-500/40 bg-rose-500/10';

const dispositionBadge: Record<string, { label: string; cls: string }> = {
  accepted: { label: 'Accepted',      cls: 'bg-green-500/15 text-green-300 border-green-500/40' },
  review:   { label: 'Needs Review',  cls: 'bg-amber-500/15 text-amber-300 border-amber-500/40' },
  denied:   { label: 'Declined',      cls: 'bg-slate-600/30 text-slate-300 border-slate-500/40' },
};

const urgencyDot: Record<string, string> = {
  high:   'text-rose-400',
  medium: 'text-amber-400',
  low:    'text-slate-500',
};

const statusBadge: Record<ClientInvite['status'], { label: string; icon: React.ReactNode; cls: string }> = {
  pending:   { label: 'Sent',      icon: <Clock size={11} />,        cls: 'bg-slate-700/60 text-slate-300 border-slate-600/60' },
  opened:    { label: 'Opened',    icon: <Eye size={11} />,          cls: 'bg-blue-500/15 text-blue-300 border-blue-500/40' },
  completed: { label: 'Completed', icon: <CheckCircle2 size={11} />, cls: 'bg-green-500/15 text-green-300 border-green-500/40' },
  expired:   { label: 'Expired',   icon: <CircleDot size={11} />,    cls: 'bg-slate-600/30 text-slate-400 border-slate-600/40' },
};

// ── Generic shareable link banner ─────────────────────────────────────────────
const GenericLinkBanner: React.FC = () => {
  const [copied, setCopied] = useState(false);
  const url = `${window.location.origin}/intake`;
  const copy = async () => {
    try { await navigator.clipboard.writeText(url); } catch { /* noop */ }
    setCopied(true);
    toast.success('Generic intake link copied');
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <div className="bg-slate-800/50 border border-slate-700/60 rounded-xl px-4 py-3 flex items-center gap-3">
      <Share2 size={15} className="text-slate-400 shrink-0" />
      <span className="text-xs text-slate-400 mr-1">Generic link:</span>
      <code className="flex-1 text-xs text-slate-300 truncate">{url}</code>
      <button onClick={copy}
        className="shrink-0 flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition-colors px-2 py-1 rounded-lg hover:bg-slate-700">
        {copied ? <Check size={13} className="text-green-400" /> : <Copy size={13} />}
        {copied ? 'Copied' : 'Copy'}
      </button>
    </div>
  );
};

// ── Generate Client Link panel ────────────────────────────────────────────────
const GenerateLinkPanel: React.FC<{ onCreated: (invite: ClientInvite) => void }> = ({ onCreated }) => {
  const [open, setOpen]       = useState(false);
  const [name, setName]       = useState('');
  const [email, setEmail]     = useState('');
  const [phone, setPhone]     = useState('');
  const [notes, setNotes]     = useState('');
  const [saving, setSaving]   = useState(false);
  const [newLink, setNewLink] = useState<string | null>(null);
  const [copied, setCopied]   = useState(false);

  const canSave = name.trim().length > 0;

  const handleCreate = async () => {
    if (!canSave) return;
    setSaving(true);
    const invite = await createClientInvite({ clientName: name.trim(), clientEmail: email.trim(), clientPhone: phone.trim(), notes: notes.trim() });
    setSaving(false);
    if (!invite) { toast.error('Could not create link — check Supabase connection'); return; }
    const url = `${window.location.origin}/intake/${invite.token}`;
    setNewLink(url);
    onCreated(invite);
  };

  const copyLink = async () => {
    if (!newLink) return;
    try { await navigator.clipboard.writeText(newLink); } catch { /* noop */ }
    setCopied(true);
    toast.success(`Intake link for ${name} copied!`);
    setTimeout(() => setCopied(false), 2500);
  };

  const reset = () => { setOpen(false); setName(''); setEmail(''); setPhone(''); setNotes(''); setNewLink(null); setCopied(false); };

  return (
    <div className="border border-violet-500/30 bg-violet-500/5 rounded-2xl overflow-hidden">
      {/* Header row */}
      <button onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-3 px-5 py-4 hover:bg-violet-500/10 transition-colors text-left">
        <div className="w-9 h-9 rounded-xl bg-violet-500/20 border border-violet-500/40 flex items-center justify-center shrink-0">
          <UserPlus size={16} className="text-violet-400" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-bold text-white text-sm">Generate Client Intake Link</div>
          <div className="text-xs text-slate-400 mt-0.5">Create a personal link for a specific client — Maya will greet them by name</div>
        </div>
        <ChevronDown size={16} className={`text-slate-400 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="px-5 pb-5 border-t border-violet-500/20">
          {newLink ? (
            /* ── Success state ── */
            <div className="pt-4 space-y-3">
              <div className="flex items-center gap-2 text-green-400 text-sm font-semibold">
                <CheckCircle2 size={16} /> Link created for {name}
              </div>
              <div className="flex gap-2">
                <code className="flex-1 bg-slate-900 border border-slate-700 rounded-xl px-3 py-2.5 text-xs text-violet-300 truncate font-mono">
                  {newLink}
                </code>
                <button onClick={copyLink}
                  className="shrink-0 flex items-center gap-1.5 bg-violet-600 hover:bg-violet-500 text-white text-xs font-semibold px-3 py-2 rounded-xl transition-colors">
                  {copied ? <Check size={13} /> : <Copy size={13} />}
                  {copied ? 'Copied!' : 'Copy'}
                </button>
              </div>
              <p className="text-xs text-slate-500">
                Send this link to <strong className="text-slate-300">{name}</strong>. When they open it, Maya will greet them by name and their intake will appear here automatically.
              </p>
              <button onClick={reset}
                className="text-xs text-slate-400 hover:text-white transition-colors underline underline-offset-2">
                Generate another link
              </button>
            </div>
          ) : (
            /* ── Form state ── */
            <div className="pt-4 space-y-3">
              <div>
                <label className="text-xs text-slate-400 font-medium block mb-1">Client name <span className="text-rose-400">*</span></label>
                <input value={name} onChange={e => setName(e.target.value)}
                  placeholder="e.g. John Smith"
                  className="w-full bg-slate-900 border border-slate-700 focus:border-violet-500 rounded-xl px-3 py-2.5 text-sm text-white placeholder-slate-600 outline-none transition-colors" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-400 font-medium block mb-1">Email <span className="text-slate-600">(optional)</span></label>
                  <input value={email} onChange={e => setEmail(e.target.value)}
                    placeholder="client@email.com" type="email"
                    className="w-full bg-slate-900 border border-slate-700 focus:border-violet-500 rounded-xl px-3 py-2.5 text-sm text-white placeholder-slate-600 outline-none transition-colors" />
                </div>
                <div>
                  <label className="text-xs text-slate-400 font-medium block mb-1">Phone <span className="text-slate-600">(optional)</span></label>
                  <input value={phone} onChange={e => setPhone(e.target.value)}
                    placeholder="(555) 000-0000" type="tel"
                    className="w-full bg-slate-900 border border-slate-700 focus:border-violet-500 rounded-xl px-3 py-2.5 text-sm text-white placeholder-slate-600 outline-none transition-colors" />
                </div>
              </div>
              <div>
                <label className="text-xs text-slate-400 font-medium block mb-1">Internal notes <span className="text-slate-600">(given to Maya as context — not shown to client)</span></label>
                <textarea value={notes} onChange={e => setNotes(e.target.value)}
                  placeholder="e.g. Potential PI case, car accident on I-90, referred by Jones & Co."
                  rows={2}
                  className="w-full bg-slate-900 border border-slate-700 focus:border-violet-500 rounded-xl px-3 py-2.5 text-sm text-white placeholder-slate-600 outline-none transition-colors resize-none" />
              </div>
              <button onClick={handleCreate} disabled={!canSave || saving}
                className="w-full flex items-center justify-center gap-2 bg-violet-600 hover:bg-violet-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold py-3 rounded-xl text-sm transition-colors">
                {saving ? <Loader2 size={15} className="animate-spin" /> : <Link2 size={15} />}
                {saving ? 'Creating…' : 'Generate Intake Link'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ── Client Invites tracker ─────────────────────────────────────────────────────
const InviteTracker: React.FC<{ invites: ClientInvite[]; onDelete: (id: string) => void }> = ({ invites, onDelete }) => {
  const [expanded, setExpanded] = useState(false);
  if (invites.length === 0) return null;

  const shown = expanded ? invites : invites.slice(0, 5);

  const copyLink = async (token: string, name: string) => {
    const url = `${window.location.origin}/intake/${token}`;
    try { await navigator.clipboard.writeText(url); } catch { /* noop */ }
    toast.success(`Link for ${name} copied`);
  };

  return (
    <div className="border border-slate-700/60 rounded-2xl overflow-hidden">
      <div className="px-5 py-3 border-b border-slate-700/60 flex items-center justify-between">
        <span className="text-sm font-bold text-white">Sent Invites</span>
        <span className="text-xs text-slate-500">{invites.length} total</span>
      </div>
      <div className="divide-y divide-slate-800/60">
        {shown.map(inv => {
          const badge = statusBadge[inv.status];
          return (
            <div key={inv.id} className="px-5 py-3 flex items-center gap-3 hover:bg-slate-800/30 transition-colors">
              {/* Status dot */}
              <div className={`w-2 h-2 rounded-full shrink-0 ${
                inv.status === 'completed' ? 'bg-green-400' :
                inv.status === 'opened'    ? 'bg-blue-400'  :
                inv.status === 'expired'   ? 'bg-slate-600' : 'bg-slate-500'
              }`} />
              {/* Name + meta */}
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-white truncate">{inv.client_name}</div>
                <div className="text-xs text-slate-500 truncate">
                  {inv.client_email || inv.client_phone || <span className="italic">No contact info</span>}
                </div>
              </div>
              {/* Status badge */}
              <span className={`shrink-0 flex items-center gap-1 border text-xs font-medium px-2 py-0.5 rounded-full ${badge.cls}`}>
                {badge.icon} {badge.label}
              </span>
              {/* Token chip */}
              <code className="text-xs text-slate-500 font-mono shrink-0 hidden sm:block">/{inv.token}</code>
              {/* Actions */}
              <button onClick={() => copyLink(inv.token, inv.client_name)}
                className="shrink-0 p-1.5 rounded-lg text-slate-500 hover:text-white hover:bg-slate-700 transition-colors" title="Copy link">
                <Copy size={13} />
              </button>
              <button onClick={() => onDelete(inv.id)}
                className="shrink-0 p-1.5 rounded-lg text-slate-600 hover:text-rose-400 hover:bg-rose-500/10 transition-colors" title="Delete invite">
                <Trash2 size={13} />
              </button>
            </div>
          );
        })}
      </div>
      {invites.length > 5 && (
        <button onClick={() => setExpanded(e => !e)}
          className="w-full py-2.5 text-xs text-slate-500 hover:text-slate-300 border-t border-slate-800/60 transition-colors">
          {expanded ? 'Show less' : `Show ${invites.length - 5} more`}
        </button>
      )}
    </div>
  );
};

// ── Main component ────────────────────────────────────────────────────────────
const IntakeInbox: React.FC = () => {
  const { cases, setCases } = useContext(AppContext) as any;
  const navigate = useNavigate();
  const [intakes,  setIntakes]  = useState<IntakeCase[]>([]);
  const [invites,  setInvites]  = useState<ClientInvite[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  // Load intakes + invites on mount
  useEffect(() => {
    (async () => {
      setLoading(true);
      const [ins, invs] = await Promise.all([fetchIntakes(), fetchClientInvites()]);
      setIntakes(ins);
      setInvites(invs);
      setLoading(false);
    })();

    // Live subscription for new intakes
    const unsub = subscribeIntakes(row => {
      setIntakes(prev => [row, ...prev.filter(r => r.id !== row.id)]);
      toast.info(`New intake from ${row.full_name || 'unknown'}`, { autoClose: 4000 });
    });
    return unsub;
  }, []);

  const handleStatusChange = async (id: string, status: IntakeStatus) => {
    await updateIntakeStatus(id, status);
    setIntakes(prev => prev.map(r => r.id === id ? { ...r, status } : r));
  };

  const handleConvertToCase = (intake: IntakeCase) => {
    const newCase: Case = {
      id: `case_${Date.now()}`,
      title: `${intake.full_name} — ${intake.matter_type}`,
      clientName: intake.full_name,
      status: 'Active' as CaseStatus,
      caseType: intake.matter_type,
      jurisdiction: intake.jurisdiction,
      summary: intake.summary,
      filingDate: new Date().toISOString().split('T')[0],
      documents: [],
      notes: [],
      timeline: [],
      hearings: [],
    } as unknown as Case;
    setCases((prev: Case[]) => [newCase, ...prev]);
    handleStatusChange(intake.id, 'routed');
    toast.success('Case created from intake');
    navigate('/app/cases');
  };

  const handleDeleteInvite = async (id: string) => {
    await deleteClientInvite(id);
    setInvites(prev => prev.filter(i => i.id !== id));
    toast.success('Invite deleted');
  };

  const newCount = useMemo(() => intakes.filter(r => r.status === 'new').length, [intakes]);

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-violet-500/20 border border-violet-500/40 flex items-center justify-center">
            <Inbox size={18} className="text-violet-400" />
          </div>
          <div>
            <h1 className="text-xl font-black text-white">Intake Inbox</h1>
            <p className="text-xs text-slate-500 mt-0.5">{intakeBackendLabel}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {newCount > 0 && (
            <span className="bg-rose-500 text-white text-xs font-bold px-2.5 py-1 rounded-full">
              {newCount} new
            </span>
          )}
          <button onClick={async () => {
            setLoading(true);
            const [ins, invs] = await Promise.all([fetchIntakes(), fetchClientInvites()]);
            setIntakes(ins); setInvites(invs); setLoading(false);
          }} className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors" title="Refresh">
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Generic link banner */}
      <GenericLinkBanner />

      {/* Generate client-specific link */}
      <GenerateLinkPanel onCreated={inv => setInvites(prev => [inv, ...prev])} />

      {/* Sent invites tracker */}
      <InviteTracker invites={invites} onDelete={handleDeleteInvite} />

      {/* Intake submissions */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 size={24} className="animate-spin text-violet-400" />
        </div>
      ) : intakes.length === 0 ? (
        <div className="text-center py-16 text-slate-600">
          <Inbox size={40} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm">No intakes yet. Share your link to get started.</p>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-white">Submissions</h2>
            <span className="text-xs text-slate-500">{intakes.length} total</span>
          </div>
          {intakes.map(intake => {
            const isOpen = expanded === intake.id;
            const badge  = dispositionBadge[intake.disposition] ?? dispositionBadge.review;
            const agent  = getSpecialistById(intake.recommended_agent_id);
            return (
              <div key={intake.id}
                className="border border-slate-700/60 rounded-2xl overflow-hidden hover:border-slate-600/60 transition-colors">
                {/* Summary row */}
                <button className="w-full text-left px-5 py-4 flex items-center gap-4"
                  onClick={() => setExpanded(isOpen ? null : intake.id)}>
                  {/* Score */}
                  <div className={`w-12 h-12 rounded-xl border flex flex-col items-center justify-center shrink-0 ${scoreColor(intake.score)}`}>
                    <span className="text-lg font-black leading-none">{intake.score}</span>
                    <span className="text-[9px] uppercase tracking-widest opacity-70 mt-0.5">score</span>
                  </div>
                  {/* Meta */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-white text-sm truncate">{intake.full_name || 'Unknown'}</span>
                      <span className={`text-xs border px-2 py-0.5 rounded-full font-medium ${badge.cls}`}>
                        {badge.label}
                      </span>
                      {intake.urgency === 'high' && (
                        <span className="text-xs text-rose-400 font-bold">⚡ Urgent</span>
                      )}
                    </div>
                    <div className="text-xs text-slate-400 mt-0.5 truncate">
                      {intake.matter_type}{intake.contact ? ` · ${intake.contact}` : ''}
                    </div>
                    <div className="text-xs text-slate-600 mt-0.5">
                      {new Date(intake.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                  <ChevronDown size={16} className={`text-slate-500 shrink-0 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
                </button>

                {/* Expanded detail */}
                {isOpen && (
                  <div className="px-5 pb-5 border-t border-slate-800/60 space-y-4 pt-4">
                    {/* Summary */}
                    <p className="text-sm text-slate-300 leading-relaxed">{intake.summary}</p>
                    {/* Recommended agent */}
                    {agent && (
                      <div className="flex items-center gap-2 bg-slate-800/60 rounded-xl px-3 py-2.5">
                        <span className="text-lg">{agent.avatar}</span>
                        <div>
                          <div className="text-xs text-slate-400">Recommended for</div>
                          <div className="text-sm font-semibold text-white">{agent.name}</div>
                        </div>
                      </div>
                    )}
                    {/* Actions */}
                    <div className="flex flex-wrap gap-2">
                      {intake.status !== 'routed' && (
                        <button onClick={() => handleConvertToCase(intake)}
                          className="flex items-center gap-1.5 bg-violet-600 hover:bg-violet-500 text-white text-xs font-bold px-3 py-2 rounded-xl transition-colors">
                          <ArrowRightCircle size={13} /> Convert to Case
                        </button>
                      )}
                      {intake.status === 'new' && (
                        <>
                          <button onClick={() => handleStatusChange(intake.id, 'accepted')}
                            className="flex items-center gap-1.5 bg-green-600/20 hover:bg-green-600/30 border border-green-500/40 text-green-300 text-xs font-semibold px-3 py-2 rounded-xl transition-colors">
                            <ThumbsUp size={13} /> Accept
                          </button>
                          <button onClick={() => handleStatusChange(intake.id, 'denied')}
                            className="flex items-center gap-1.5 bg-slate-700/50 hover:bg-slate-700 border border-slate-600/40 text-slate-400 text-xs font-semibold px-3 py-2 rounded-xl transition-colors">
                            <ThumbsDown size={13} /> Decline
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default IntakeInbox;
