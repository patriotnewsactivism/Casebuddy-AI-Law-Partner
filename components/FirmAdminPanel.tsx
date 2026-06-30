import React, { useState, useEffect, useCallback } from 'react';
import {
  Shield, Users, Key, Copy, Trash2, Plus, RefreshCw,
  CheckCircle, XCircle, Clock, AlertTriangle, Lock,
  Eye, EyeOff, LogOut, Loader2, ChevronRight, UserX, UserCheck,
  DollarSign, TrendingUp, Cpu, Settings as SettingsIcon, BarChart3, Star, Zap, ArrowUp
} from 'lucide-react';
import { getSupabase } from '../services/supabaseClient';
import { getFirmId } from '../services/caseStore';
import { toast } from 'react-toastify';
import { getCurrentTier, setCurrentTier, getTierLabel, getTierFeatures, getUpgradeFeatures, isFeatureAvailable } from '../services/tierService';
import { loadPreferences, savePreferences } from '../utils/storage';
import type { ProductTier, UserRole, ApiKey, FirmSettings, UsageMetrics, TierFeature, RoleDefinition } from '../types';
import { TIER_FEATURES, ROLE_DEFINITIONS } from '../types';

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

const tierOrder: Record<ProductTier, number> = { personal: 0, professional: 1, enterprise: 2 };
const tierPrices: Record<ProductTier, string> = { personal: '$29', professional: '$149', enterprise: '$499' };
const apiScopes = ['read:cases', 'write:cases', 'read:documents', 'write:documents', 'read:billing', 'read:admin'];
const usTimezones = ['America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles', 'America/Anchorage', 'Pacific/Honolulu'];
const currencies = ['USD', 'CAD', 'EUR', 'GBP'];

const FirmAdminPanel: React.FC = () => {
  const [inviteCodes, setInviteCodes] = useState<InviteCode[]>([]);
  const [members, setMembers] = useState<FirmMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [firmId, setFirmId] = useState('');
  const [showFirmId, setShowFirmId] = useState(false);
  const [expiryDays, setExpiryDays] = useState(7);
  const [activeTab, setActiveTab] = useState<'members' | 'invites' | 'tier' | 'api-keys' | 'settings' | 'security'>('members');

  const [currentTier, setCurrentTierState] = useState<ProductTier>(() => getCurrentTier());
  const [firmSettings, setFirmSettings] = useState<FirmSettings>(() => {
    const prefs = loadPreferences() as any;
    return {
      firmName: prefs.firmName || 'CaseBuddy Law Firm',
      firmEmail: prefs.firmEmail || '',
      firmPhone: prefs.firmPhone || '',
      firmAddress: prefs.firmAddress || '',
      firmWebsite: prefs.firmWebsite || '',
      logoUrl: prefs.logoUrl || '',
      primaryColor: prefs.primaryColor || '#D4AF37',
      timezone: prefs.timezone || 'America/Chicago',
      currency: prefs.currency || 'USD',
      defaultBillingRate: prefs.defaultBillingRate || 350,
      invoicePrefix: prefs.invoicePrefix || 'INV',
      invoiceFooter: prefs.invoiceFooter || 'Thank you for your business.',
      requireMFA: prefs.requireMFA || false,
      sessionTimeoutMinutes: prefs.sessionTimeoutMinutes || 480,
    };
  });
  const [apiKeys, setApiKeys] = useState<ApiKey[]>(() => {
    try { return JSON.parse(localStorage.getItem('casebuddy_api_keys') || '[]'); }
    catch { return []; }
  });
  const [showKey, setShowKey] = useState<Set<string>>(new Set());
  const [newKeyName, setNewKeyName] = useState('');
  const [newKeyScopes, setNewKeyScopes] = useState<string[]>([]);

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

  const generateApiKey = (name: string, scopes: string[]): ApiKey => {
    const prefix = 'cb_' + Math.random().toString(36).slice(2, 8);
    const key = prefix + '_' + Array.from(crypto.getRandomValues(new Uint8Array(32)))
      .map(b => b.toString(16).padStart(2, '0')).join('');
    return { id: `key_${Date.now()}`, name, key, prefix, scopes, createdAt: Date.now(), enabled: true };
  };

  const saveApiKeys = (keys: ApiKey[]) => {
    localStorage.setItem('casebuddy_api_keys', JSON.stringify(keys));
    setApiKeys(keys);
  };

  const handleCreateKey = () => {
    if (!newKeyName.trim()) { toast.error('Name is required'); return; }
    if (newKeyScopes.length === 0) { toast.error('Select at least one scope'); return; }
    const newKey = generateApiKey(newKeyName.trim(), newKeyScopes);
    saveApiKeys([newKey, ...apiKeys]);
    setNewKeyName('');
    setNewKeyScopes([]);
    toast.success('API key created');
  };

  const toggleScope = (scope: string) => {
    setNewKeyScopes(prev => prev.includes(scope) ? prev.filter(s => s !== scope) : [...prev, scope]);
  };

  const handleSaveSettings = () => {
    (savePreferences as any)(firmSettings);
    toast.success('Firm settings saved');
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
        {(['members', 'invites', 'tier', 'api-keys', 'settings', 'security'] as const).map(tab => (
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

      {/* ── TIER TAB ── */}
      {activeTab === 'tier' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {(Object.keys(tierPrices) as ProductTier[]).map(tier => {
              const isCurrent = currentTier === tier;
              const isHigher = tierOrder[tier] > tierOrder[currentTier];
              const isLower = tierOrder[tier] < tierOrder[currentTier];
              const features = getTierFeatures(tier);
              return (
                <div key={tier} className={`bg-slate-900/60 border rounded-xl p-5 flex flex-col ${isCurrent ? 'border-gold-500 shadow-lg shadow-gold-500/10' : 'border-slate-700/60'}`}>
                  {isCurrent && (
                    <span className="text-xs bg-gold-500/20 border border-gold-500/40 text-gold-400 px-2 py-0.5 rounded-full font-bold self-start mb-3">
                      Current Plan
                    </span>
                  )}
                  <h3 className="text-lg font-bold text-white capitalize mb-1">{tier}</h3>
                  <div className="flex items-baseline gap-1 mb-4">
                    <span className="text-3xl font-bold text-white">{tierPrices[tier]}</span>
                    <span className="text-sm text-slate-400">/mo</span>
                  </div>
                  <div className="space-y-2 mb-4 flex-1">
                    {features.slice(0, 8).map(f => (
                      <div key={f.id} className="flex items-start gap-2">
                        <CheckCircle size={14} className="text-green-400 shrink-0 mt-0.5" />
                        <span className="text-xs text-slate-300">{f.label}</span>
                      </div>
                    ))}
                    {features.length > 8 && (
                      <p className="text-xs text-slate-500 pl-6">+{features.length - 8} more features</p>
                    )}
                  </div>
                  {isCurrent ? (
                    <button disabled className="w-full py-2 rounded-lg text-sm font-bold bg-gold-500/20 text-gold-400 border border-gold-500/30 cursor-not-allowed">
                      Current Plan
                    </button>
                  ) : isHigher ? (
                    <button onClick={() => { setCurrentTier(tier); setCurrentTierState(tier); toast.success(`Upgraded to ${getTierLabel(tier)}`); }}
                      className="w-full py-2 rounded-lg text-sm font-bold bg-gold-500 hover:bg-gold-600 text-black transition-all">
                      <span className="flex items-center justify-center gap-1.5">
                        <ArrowUp size={14} />
                        Upgrade
                      </span>
                    </button>
                  ) : (
                    <button onClick={() => { setCurrentTier(tier); setCurrentTierState(tier); toast.success(`Downgraded to ${getTierLabel(tier)}`); }}
                      className="w-full py-2 rounded-lg text-sm font-bold border border-slate-600 text-slate-300 hover:border-gold-500/50 hover:text-gold-400 transition-all">
                      Downgrade
                    </button>
                  )}
                </div>
              );
            })}
          </div>
          {getUpgradeFeatures(currentTier).length > 0 && (
            <div className="bg-slate-900/60 border border-amber-500/20 rounded-xl p-5">
              <div className="flex items-center gap-2 mb-3">
                <Zap size={16} className="text-amber-400" />
                <h3 className="text-sm font-bold text-amber-400 uppercase tracking-wider">
                  You're missing {getUpgradeFeatures(currentTier).length} higher-tier features
                </h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {getUpgradeFeatures(currentTier).map(f => (
                  <div key={f.id} className="flex items-start gap-2">
                    <Star size={12} className="text-amber-500 shrink-0 mt-0.5" />
                    <div>
                      <span className="text-xs font-medium text-slate-200">{f.label}</span>
                      <p className="text-xs text-slate-500">{f.description}</p>
                    </div>
                  </div>
                ))}
              </div>
              <button onClick={() => { setCurrentTier('enterprise'); setCurrentTierState('enterprise'); toast.success('Upgraded to CaseBuddy Enterprise'); }}
                className="mt-4 flex items-center gap-2 bg-amber-500 hover:bg-amber-600 text-black font-bold text-sm px-4 py-2 rounded-lg transition-all">
                <ArrowUp size={14} />
                Upgrade to Enterprise
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── API KEYS TAB ── */}
      {activeTab === 'api-keys' && (
        <div className="space-y-4">
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4">
            <div className="flex items-start gap-2">
              <AlertTriangle size={16} className="text-amber-400 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-200">API keys grant programmatic access to your firm's data. Treat them like passwords.</p>
            </div>
          </div>

          <div className="bg-slate-900/60 border border-slate-700/60 rounded-xl p-4 space-y-3">
            <h2 className="text-sm font-bold text-slate-300 uppercase tracking-wider">Generate API Key</h2>
            <input type="text" value={newKeyName} onChange={e => setNewKeyName(e.target.value)}
              placeholder="Key name (e.g. Integration, Webhook)"
              className="w-full bg-slate-800 border border-slate-700 text-white text-sm rounded-lg px-3 py-2 placeholder-slate-500" />
            <div>
              <p className="text-xs text-slate-400 mb-2">Scopes</p>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                {apiScopes.map(scope => (
                  <label key={scope} className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                    <input type="checkbox" checked={newKeyScopes.includes(scope)} onChange={() => toggleScope(scope)}
                      className="accent-gold-500" />
                    {scope}
                  </label>
                ))}
              </div>
            </div>
            <button onClick={handleCreateKey}
              className="flex items-center gap-2 bg-gold-500 hover:bg-gold-600 text-black font-bold text-sm px-4 py-2 rounded-lg transition-all">
              <Plus size={14} />
              Generate Key
            </button>
          </div>

          {apiKeys.length === 0 ? (
            <div className="text-center py-8 text-slate-500 text-sm">No API keys yet. Generate one to integrate with external systems.</div>
          ) : (
            <div className="space-y-2">
              {apiKeys.map(k => (
                <div key={k.id} className="bg-slate-900/60 border border-slate-700/60 rounded-xl p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold text-white">{k.name}</span>
                    <div className="flex items-center gap-2">
                      <button onClick={() => {
                        navigator.clipboard.writeText(k.key);
                        toast.success('API key copied');
                      }} className="p-1.5 text-slate-400 hover:text-gold-400 rounded transition-all">
                        <Copy size={14} />
                      </button>
                      <button onClick={() => {
                        saveApiKeys(apiKeys.filter(ak => ak.id !== k.id));
                        toast.success('API key deleted');
                      }} className="p-1.5 text-slate-400 hover:text-red-400 rounded transition-all">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <code className="text-xs font-mono text-slate-400 bg-slate-800 border border-slate-700 rounded px-2 py-1">
                      {showKey.has(k.id) ? k.key : k.prefix + '••••••••••••••••••••••••••••••••'}
                    </code>
                    <button onClick={() => {
                      setShowKey(prev => { const next = new Set(prev); next.has(k.id) ? next.delete(k.id) : next.add(k.id); return next; });
                    }} className="text-xs text-slate-400 hover:text-white transition-colors">
                      {showKey.has(k.id) ? 'Hide' : 'Show'}
                    </button>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    {k.scopes.map(s => (
                      <span key={s} className="text-xs bg-slate-800 border border-slate-700 text-slate-300 px-2 py-0.5 rounded-full">{s}</span>
                    ))}
                  </div>
                  <div className="flex items-center justify-between text-xs text-slate-500">
                    <span>Created {new Date(k.createdAt).toLocaleDateString()}</span>
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <span className={k.enabled ? 'text-green-400' : 'text-slate-500'}>{k.enabled ? 'Enabled' : 'Disabled'}</span>
                      <button onClick={() => {
                        saveApiKeys(apiKeys.map(ak => ak.id === k.id ? { ...ak, enabled: !ak.enabled } : ak));
                      }} className={`relative w-8 h-4 rounded-full transition-colors ${k.enabled ? 'bg-green-500' : 'bg-slate-600'}`}>
                        <span className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all ${k.enabled ? 'left-4' : 'left-0.5'}`} />
                      </button>
                    </label>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── SETTINGS TAB ── */}
      {activeTab === 'settings' && (
        <div className="space-y-4">
          <h2 className="text-sm font-bold text-slate-300 uppercase tracking-wider">Firm Settings</h2>
          <div className="bg-slate-900/60 border border-slate-700/60 rounded-xl p-5 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-slate-400 block mb-1">Firm Name</label>
                <input type="text" value={firmSettings.firmName}
                  onChange={e => setFirmSettings(prev => ({ ...prev, firmName: e.target.value }))}
                  className="w-full bg-slate-800 border border-slate-700 text-white text-sm rounded-lg px-3 py-2" />
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">Firm Email</label>
                <input type="email" value={firmSettings.firmEmail}
                  onChange={e => setFirmSettings(prev => ({ ...prev, firmEmail: e.target.value }))}
                  className="w-full bg-slate-800 border border-slate-700 text-white text-sm rounded-lg px-3 py-2" />
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">Firm Phone</label>
                <input type="tel" value={firmSettings.firmPhone || ''}
                  onChange={e => setFirmSettings(prev => ({ ...prev, firmPhone: e.target.value }))}
                  className="w-full bg-slate-800 border border-slate-700 text-white text-sm rounded-lg px-3 py-2" />
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">Firm Website</label>
                <input type="url" value={firmSettings.firmWebsite || ''}
                  onChange={e => setFirmSettings(prev => ({ ...prev, firmWebsite: e.target.value }))}
                  className="w-full bg-slate-800 border border-slate-700 text-white text-sm rounded-lg px-3 py-2" />
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">Timezone</label>
                <select value={firmSettings.timezone}
                  onChange={e => setFirmSettings(prev => ({ ...prev, timezone: e.target.value }))}
                  className="w-full bg-slate-800 border border-slate-700 text-white text-sm rounded-lg px-3 py-2">
                  {usTimezones.map(tz => (
                    <option key={tz} value={tz}>{tz}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">Currency</label>
                <select value={firmSettings.currency}
                  onChange={e => setFirmSettings(prev => ({ ...prev, currency: e.target.value }))}
                  className="w-full bg-slate-800 border border-slate-700 text-white text-sm rounded-lg px-3 py-2">
                  {currencies.map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">Default Billing Rate ($/hr)</label>
                <input type="number" value={firmSettings.defaultBillingRate}
                  onChange={e => setFirmSettings(prev => ({ ...prev, defaultBillingRate: Number(e.target.value) }))}
                  className="w-full bg-slate-800 border border-slate-700 text-white text-sm rounded-lg px-3 py-2" />
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">Invoice Prefix</label>
                <input type="text" value={firmSettings.invoicePrefix}
                  onChange={e => setFirmSettings(prev => ({ ...prev, invoicePrefix: e.target.value }))}
                  className="w-full bg-slate-800 border border-slate-700 text-white text-sm rounded-lg px-3 py-2" />
              </div>
              <div className="md:col-span-2">
                <label className="text-xs text-slate-400 block mb-1">Firm Address</label>
                <textarea value={firmSettings.firmAddress || ''}
                  onChange={e => setFirmSettings(prev => ({ ...prev, firmAddress: e.target.value }))}
                  rows={2}
                  className="w-full bg-slate-800 border border-slate-700 text-white text-sm rounded-lg px-3 py-2 resize-none" />
              </div>
              <div className="md:col-span-2">
                <label className="text-xs text-slate-400 block mb-1">Invoice Footer</label>
                <input type="text" value={firmSettings.invoiceFooter || ''}
                  onChange={e => setFirmSettings(prev => ({ ...prev, invoiceFooter: e.target.value }))}
                  className="w-full bg-slate-800 border border-slate-700 text-white text-sm rounded-lg px-3 py-2" />
              </div>
            </div>

            <div className="border-t border-slate-700/60 pt-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-sm text-white">Require MFA</span>
                  <p className="text-xs text-slate-500">Mandate multi-factor authentication for all firm members</p>
                </div>
                <button onClick={() => setFirmSettings(prev => ({ ...prev, requireMFA: !prev.requireMFA }))}
                  className={`relative w-10 h-5 rounded-full transition-colors ${firmSettings.requireMFA ? 'bg-green-500' : 'bg-slate-600'}`}>
                  <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${firmSettings.requireMFA ? 'left-5' : 'left-0.5'}`} />
                </button>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-sm text-white">Session Timeout (minutes)</span>
                  <p className="text-xs text-slate-500">Auto-logout after inactivity</p>
                </div>
                <input type="number" value={firmSettings.sessionTimeoutMinutes}
                  onChange={e => setFirmSettings(prev => ({ ...prev, sessionTimeoutMinutes: Number(e.target.value) }))}
                  className="w-24 bg-slate-800 border border-slate-700 text-white text-sm rounded-lg px-3 py-2 text-center" />
              </div>
            </div>

            <button onClick={handleSaveSettings}
              className="flex items-center gap-2 bg-gold-500 hover:bg-gold-600 text-black font-bold text-sm px-4 py-2 rounded-lg transition-all">
              <SettingsIcon size={14} />
              Save Settings
            </button>
          </div>
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
