import React, { useState, useEffect, useCallback } from 'react';
import {
  Shield, Users, Key, Copy, Trash2, Plus, RefreshCw,
  CheckCircle, XCircle, Clock, AlertTriangle, Lock,
  Eye, EyeOff, LogOut, Loader2, ChevronRight, UserX, UserCheck
} from 'lucide-react';
import { getSupabase } from '../services/supabaseClient';
import { getFirmId } from '../services/caseStore';
import { toast } from 'react-toastify';

interface InviteCode {
  code: string;
  firm_id: string;
  created_by: string | null;
  created_at: string;
  used_by: string | null;
  used_at: string | null;
  expires_at: string;
  is_used: boolean;
}

interface FirmMember {
  user_id: string;
  firm_id: string;
  claimed_at: string;
  email?: string;
}

const fmt = (iso: string) =>
  new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });

const daysLeft = (iso: string) => {
  const diff = new Date(iso).getTime() - Date.now();
  const d = Math.ceil(diff / 86_400_000);
  return d <= 0 ? 'Expired' : d === 1 ? '1 day left' : `${d} days left`;
};

const FirmAdminPanel: React.FC = () => {
  const [inviteCodes, setInviteCodes] = useState<InviteCode[]>([]);
  const [members, setMembers] = useState<FirmMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [firmId, setFirmId] = useState('');
  const [showFirmId, setShowFirmId] = useState(false);
  const [expiryDays, setExpiryDays] = useState(7);
  const [activeTab, setActiveTab] = useState<'members' | 'invites' | 'security'>('members');

  const sb = getSupabase();

  const loadData = useCallback(async () => {
    if (!sb) return;
    setLoading(true);
    const fid = getFirmId();
    setFirmId(fid);

    const [codesRes, membersRes] = await Promise.all([
      sb.from('invite_codes').select('*').eq('firm_id', fid).order('created_at', { ascending: false }),
      sb.from('firm_memberships').select('*').eq('firm_id', fid).order('claimed_at', { ascending: true }),
    ]);

    if (codesRes.data) setInviteCodes(codesRes.data);
    if (membersRes.data) setMembers(membersRes.data);
    setLoading(false);
  }, [sb]);

  useEffect(() => { loadData(); }, [loadData]);

  const createInviteCode = async () => {
    if (!sb) return;
    setCreating(true);
    try {
      const code = [
        crypto.randomUUID().slice(0, 8).toUpperCase(),
        crypto.randomUUID().slice(0, 4).toUpperCase(),
        crypto.randomUUID().slice(0, 4).toUpperCase(),
      ].join('-');

      const expiresAt = new Date(Date.now() + expiryDays * 86_400_000).toISOString();

      const { data: { user } } = await sb.auth.getUser();
      const { error } = await sb.from('invite_codes').insert({
        code,
        firm_id: firmId,
        created_by: user?.id ?? null,
        expires_at: expiresAt,
      });

      if (error) {
        toast.error('Failed to create invite code: ' + error.message);
      } else {
        toast.success('Invite code created!');
        await loadData();
      }
    } finally {
      setCreating(false);
    }
  };

  const revokeCode = async (code: string) => {
    if (!sb) return;
    // Mark as used so it can't be claimed
    const { error } = await sb
      .from('invite_codes')
      .update({ is_used: true, used_at: new Date().toISOString() })
      .eq('code', code)
      .eq('firm_id', firmId);
    if (error) {
      toast.error('Failed to revoke: ' + error.message);
    } else {
      toast.success('Invite code revoked');
      setInviteCodes(prev => prev.map(c => c.code === code ? { ...c, is_used: true } : c));
    }
  };

  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    toast.success('Code copied to clipboard');
  };

  const copyFirmId = () => {
    navigator.clipboard.writeText(firmId);
    toast.success('Firm ID copied');
  };

  const activeInvites  = inviteCodes.filter(c => !c.is_used && new Date(c.expires_at) > new Date());
  const usedInvites    = inviteCodes.filter(c => c.is_used && c.used_by);
  const expiredInvites = inviteCodes.filter(c => !c.is_used && new Date(c.expires_at) <= new Date());

  if (loading) return (
    <div className="flex items-center justify-center py-32">
      <Loader2 size={28} className="text-gold-500 animate-spin" />
    </div>
  );

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-6">

      {/* Header */}
      <div className="flex items-start gap-3">
        <div className="p-2.5 bg-gold-500/10 border border-gold-500/30 rounded-xl">
          <Shield size={22} className="text-gold-400" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-white">Firm Admin</h1>
          <p className="text-sm text-slate-400">Manage access, invite codes, and attorney-client privilege isolation</p>
        </div>
      </div>

      {/* Firm ID card */}
      <div className="bg-slate-900/60 border border-amber-500/30 rounded-xl p-4">
        <div className="flex items-center gap-2 mb-2">
          <Lock size={14} className="text-amber-400" />
          <span className="text-xs font-bold text-amber-400 uppercase tracking-wider">Your Firm ID</span>
        </div>
        <div className="flex items-center gap-2">
          <code className="flex-1 text-sm font-mono text-slate-200 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 truncate">
            {showFirmId ? firmId : '••••••••-••••-••••-••••-••••••••••••'}
          </code>
          <button onClick={() => setShowFirmId(v => !v)}
            className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-700 transition-all">
            {showFirmId ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
          <button onClick={copyFirmId}
            className="p-2 text-slate-400 hover:text-gold-400 rounded-lg hover:bg-slate-700 transition-all">
            <Copy size={16} />
          </button>
        </div>
        <p className="text-xs text-slate-500 mt-2">
          This ID is the root of all your data isolation. Never share it — use invite codes to add attorneys instead.
        </p>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Attorneys', value: members.length, icon: Users, color: 'text-blue-400' },
          { label: 'Active Invites', value: activeInvites.length, icon: Key, color: 'text-green-400' },
          { label: 'Codes Used', value: usedInvites.length, icon: CheckCircle, color: 'text-gold-400' },
        ].map(s => (
          <div key={s.label} className="bg-slate-900/60 border border-slate-700/60 rounded-xl p-4 text-center">
            <s.icon size={18} className={`${s.color} mx-auto mb-1`} />
            <div className="text-2xl font-bold text-white">{s.value}</div>
            <div className="text-xs text-slate-500">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-900/40 border border-slate-700/60 rounded-xl p-1">
        {(['members', 'invites', 'security'] as const).map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            className={`flex-1 py-2 text-sm font-medium rounded-lg capitalize transition-all ${
              activeTab === tab
                ? 'bg-gold-500/20 text-gold-400 border border-gold-500/30'
                : 'text-slate-400 hover:text-white'
            }`}>
            {tab}
          </button>
        ))}
      </div>

      {/* ── MEMBERS TAB ── */}
      {activeTab === 'members' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-300 uppercase tracking-wider">Firm Members</h2>
            <button onClick={loadData} className="text-slate-500 hover:text-slate-300 transition-colors">
              <RefreshCw size={14} />
            </button>
          </div>
          {members.length === 0 ? (
            <div className="text-center py-8 text-slate-500 text-sm">No members yet</div>
          ) : (
            members.map((m, i) => (
              <div key={m.user_id}
                className="flex items-center gap-3 bg-slate-900/60 border border-slate-700/60 rounded-xl px-4 py-3">
                <div className="w-8 h-8 rounded-full bg-gold-500/20 border border-gold-500/30 flex items-center justify-center shrink-0">
                  <span className="text-xs font-bold text-gold-400">{i + 1}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-white font-mono truncate">{m.user_id.slice(0, 18)}…</div>
                  <div className="text-xs text-slate-500">Joined {fmt(m.claimed_at)}</div>
                </div>
                {i === 0 && (
                  <span className="text-xs bg-gold-500/20 border border-gold-500/40 text-gold-400 px-2 py-0.5 rounded-full font-bold">
                    Owner
                  </span>
                )}
              </div>
            ))
          )}
          <p className="text-xs text-slate-600 pt-1">
            Each member's data is isolated by firm_id. Members share the same case files and intakes.
            To add a new attorney, create an invite code on the Invites tab.
          </p>
        </div>
      )}

      {/* ── INVITES TAB ── */}
      {activeTab === 'invites' && (
        <div className="space-y-4">
          {/* Create new code */}
          <div className="bg-slate-900/60 border border-slate-700/60 rounded-xl p-4 space-y-3">
            <h2 className="text-sm font-bold text-slate-300 uppercase tracking-wider">Create Invite Code</h2>
            <div className="flex items-center gap-3">
              <label className="text-sm text-slate-400 shrink-0">Expires in</label>
              <select
                value={expiryDays}
                onChange={e => setExpiryDays(Number(e.target.value))}
                className="flex-1 bg-slate-800 border border-slate-700 text-white text-sm rounded-lg px-3 py-2">
                <option value={1}>1 day</option>
                <option value={3}>3 days</option>
                <option value={7}>7 days</option>
                <option value={14}>14 days</option>
                <option value={30}>30 days</option>
              </select>
              <button
                onClick={createInviteCode}
                disabled={creating}
                className="flex items-center gap-2 bg-gold-500 hover:bg-gold-600 text-black font-bold text-sm px-4 py-2 rounded-lg transition-all disabled:opacity-50">
                {creating ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                Generate
              </button>
            </div>
            <p className="text-xs text-slate-600">
              Send the generated code to the attorney you're inviting. They enter it at sign-up. Each code is single-use.
            </p>
          </div>

          {/* Active codes */}
          {activeInvites.length > 0 && (
            <div>
              <h3 className="text-xs font-bold text-green-400 uppercase tracking-wider mb-2">Active</h3>
              <div className="space-y-2">
                {activeInvites.map(c => (
                  <div key={c.code}
                    className="flex items-center gap-3 bg-slate-900/60 border border-green-500/20 rounded-xl px-4 py-3">
                    <CheckCircle size={15} className="text-green-400 shrink-0" />
                    <code className="flex-1 text-sm font-mono text-slate-200">{c.code}</code>
                    <span className="text-xs text-slate-500 shrink-0">{daysLeft(c.expires_at)}</span>
                    <button onClick={() => copyCode(c.code)}
                      className="p-1.5 text-slate-400 hover:text-gold-400 rounded transition-all">
                      <Copy size={14} />
                    </button>
                    <button onClick={() => revokeCode(c.code)}
                      className="p-1.5 text-slate-400 hover:text-red-400 rounded transition-all">
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Used codes */}
          {usedInvites.length > 0 && (
            <div>
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Redeemed</h3>
              <div className="space-y-2">
                {usedInvites.map(c => (
                  <div key={c.code}
                    className="flex items-center gap-3 bg-slate-900/40 border border-slate-700/40 rounded-xl px-4 py-3 opacity-70">
                    <UserCheck size={15} className="text-gold-400 shrink-0" />
                    <code className="flex-1 text-sm font-mono text-slate-400 line-through">{c.code}</code>
                    <span className="text-xs text-slate-600">{c.used_at ? fmt(c.used_at) : 'Used'}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Expired codes */}
          {expiredInvites.length > 0 && (
            <div>
              <h3 className="text-xs font-bold text-slate-600 uppercase tracking-wider mb-2">Expired</h3>
              <div className="space-y-2">
                {expiredInvites.map(c => (
                  <div key={c.code}
                    className="flex items-center gap-3 bg-slate-900/40 border border-slate-700/40 rounded-xl px-4 py-3 opacity-50">
                    <XCircle size={15} className="text-slate-500 shrink-0" />
                    <code className="flex-1 text-sm font-mono text-slate-500 line-through">{c.code}</code>
                    <span className="text-xs text-slate-600">Expired</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {inviteCodes.length === 0 && (
            <div className="text-center py-8 text-slate-500 text-sm">No invite codes yet — generate one above</div>
          )}
        </div>
      )}

      {/* ── SECURITY TAB ── */}
      {activeTab === 'security' && (
        <div className="space-y-3">
          <h2 className="text-sm font-bold text-slate-300 uppercase tracking-wider mb-3">Security Model</h2>

          {[
            {
              icon: Shield,
              color: 'text-green-400',
              bg: 'bg-green-500/10 border-green-500/20',
              title: 'Row-Level Security (RLS)',
              desc: 'Every Supabase table uses PostgreSQL RLS. Your firm_id is resolved server-side via a SECURITY DEFINER function — it cannot be spoofed by the client.',
              status: 'Active',
              statusColor: 'text-green-400',
            },
            {
              icon: Lock,
              color: 'text-green-400',
              bg: 'bg-green-500/10 border-green-500/20',
              title: 'Immutable Firm Membership',
              desc: 'Once your account claims a firm_id, it cannot be changed from the client. No UPDATE policy exists on firm_memberships — only the database admin can move a user.',
              status: 'Active',
              statusColor: 'text-green-400',
            },
            {
              icon: Key,
              color: 'text-green-400',
              bg: 'bg-green-500/10 border-green-500/20',
              title: 'Invite-Code Gated Signup',
              desc: 'New users cannot claim your firm_id without a valid, single-use invite code you generated. Codes expire and are marked used atomically server-side.',
              status: 'Active',
              statusColor: 'text-green-400',
            },
            {
              icon: Users,
              color: 'text-green-400',
              bg: 'bg-green-500/10 border-green-500/20',
              title: 'Fresh UUID Per Account',
              desc: 'Every new signup gets a cryptographically random firm_id generated fresh — never inherited from localStorage. Accounts are always born isolated.',
              status: 'Active',
              statusColor: 'text-green-400',
            },
            {
              icon: AlertTriangle,
              color: 'text-amber-400',
              bg: 'bg-amber-500/10 border-amber-500/20',
              title: 'Public Intake Form',
              desc: 'The public intake link is intentionally anonymous — prospects submit without a login. Submissions are tagged with your VITE_FIRM_ID env var at submission time.',
              status: 'By Design',
              statusColor: 'text-amber-400',
            },
          ].map(item => (
            <div key={item.title} className={`flex gap-3 border rounded-xl p-4 ${item.bg}`}>
              <item.icon size={18} className={`${item.color} shrink-0 mt-0.5`} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-white">{item.title}</span>
                  <span className={`text-xs font-bold ${item.statusColor} shrink-0`}>{item.status}</span>
                </div>
                <p className="text-xs text-slate-400 mt-1 leading-relaxed">{item.desc}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default FirmAdminPanel;
