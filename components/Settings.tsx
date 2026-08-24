import React, { useContext, useEffect, useRef, useState } from 'react';
import { AppContext } from '../App';
import {
  AlertCircle,
  Building2,
  CheckCircle,
  Cloud,
  CloudOff,
  Copy,
  Database,
  Download,
  Eye,
  Info,
  Loader2,
  Lock,
  LogOut,
  Moon,
  Palette,
  Scale,
  Settings as SettingsIcon,
  Shield,
  Sun,
  Trash2,
  Upload,
  User,
  Users,
} from 'lucide-react';
import {
  clearAllData,
  exportAllData,
  getStorageInfo,
  importAllData,
  loadPreferences,
  savePreferences,
} from '../utils/storage';
import { getFirmId, setFirmId, syncLabel } from '../services/caseStore';
import { signOut as signOutUser, updatePassword } from '../services/authService';
import {
  applyPreset,
  computeDerivedColors,
  getThemeConfig,
  getThemePresets,
  resetToDefault,
  saveThemeConfig,
  type ThemeConfig,
} from '../services/themeEngine';

const FIRM_BRANDING_KEY = 'casebuddy_firm_branding';
const FIRM_LOGO_KEY = 'casebuddy_firm_logo';
const DEFAULT_TAGLINE = 'Legal Work, Unified';

interface FirmBranding {
  firmName: string;
  tagline: string;
  whiteLabel: boolean;
}

const loadFirmBranding = (): FirmBranding => {
  try {
    const raw = localStorage.getItem(FIRM_BRANDING_KEY);
    if (!raw) return { firmName: 'CaseBuddy', tagline: DEFAULT_TAGLINE, whiteLabel: false };
    const parsed = JSON.parse(raw) as Partial<FirmBranding>;
    return {
      firmName: parsed.firmName || 'CaseBuddy',
      tagline: parsed.tagline || DEFAULT_TAGLINE,
      whiteLabel: Boolean(parsed.whiteLabel),
    };
  } catch {
    return { firmName: 'CaseBuddy', tagline: DEFAULT_TAGLINE, whiteLabel: false };
  }
};

const saveFirmBranding = (branding: FirmBranding) => {
  localStorage.setItem(FIRM_BRANDING_KEY, JSON.stringify(branding));
};

const loadFirmLogo = (): string | null => {
  try {
    return localStorage.getItem(FIRM_LOGO_KEY);
  } catch {
    return null;
  }
};

const AgentLogsPanel: React.FC = () => {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const loadLogs = async () => {
    setLoading(true);
    try {
      const { getSupabase, isSupabaseConfigured } = await import('../services/supabaseClient');
      if (!isSupabaseConfigured) return;
      const sb = getSupabase();
      if (!sb) return;
      const { data } = await sb
        .from('agent_cron_logs')
        .select('*')
        .order('ran_at', { ascending: false })
        .limit(10);
      setLogs(data || []);
    } catch {
      // The activity table may not exist in every environment.
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadLogs();
  }, []);

  return (
    <section className="bg-slate-800 border border-slate-700 rounded-xl p-6">
      <div className="flex items-center justify-between gap-4 mb-4">
        <div className="flex items-center gap-3">
          <Cloud className="text-gold-500" size={20} />
          <div>
            <h2 className="text-lg font-semibold text-white">Automation Activity</h2>
            <p className="text-xs text-slate-500 mt-0.5">Recent background CaseBuddy workflow runs.</p>
          </div>
        </div>
        <button
          onClick={() => void loadLogs()}
          disabled={loading}
          className="text-xs text-slate-400 hover:text-white flex items-center gap-1 transition-colors disabled:opacity-50"
        >
          <Loader2 size={12} className={loading ? 'animate-spin' : ''} /> Refresh
        </button>
      </div>

      {logs.length === 0 ? (
        <div className="rounded-lg bg-slate-900/55 border border-slate-700 p-4 text-sm text-slate-400">
          {loading ? 'Loading activity…' : 'No background workflow runs are available yet.'}
        </div>
      ) : (
        <div className="space-y-2">
          {logs.map((log: any) => (
            <div key={log.id} className="bg-slate-900 rounded-lg p-3 text-xs border border-slate-800">
              <div className="flex items-center justify-between gap-3 mb-1">
                <span className="font-semibold text-gold-400">{log.job}</span>
                <span className="text-slate-500">{new Date(log.ran_at).toLocaleString()}</span>
              </div>
              <div className="flex flex-wrap gap-3 text-slate-400 mb-1">
                <span>{log.cases_loaded ?? 0} cases</span>
                <span>{log.deadlines_checked ?? 0} deadlines</span>
                <span>{log.alerts_sent ?? 0} alerts</span>
              </div>
              {log.error && <p className="text-red-400 mt-1">{log.error}</p>}
            </div>
          ))}
        </div>
      )}
    </section>
  );
};

const Settings = () => {
  const { cases, theme, setTheme, operatingMode, setOperatingMode, syncStatus, user } = useContext(AppContext);

  const [displayName, setDisplayName] = useState('');
  const [title, setTitle] = useState('');
  const [autoSaveEnabled, setAutoSaveEnabled] = useState(true);
  const [storageInfo, setStorageInfo] = useState({ used: 0, available: 0, percentage: 0 });
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  const [passwordForm, setPasswordForm] = useState({
    new: '',
    confirm: '',
    busy: false,
    error: null as string | null,
    success: false,
  });
  const [signingOut, setSigningOut] = useState(false);

  const [firmBranding, setFirmBranding] = useState({
    name: 'CaseBuddy',
    tagline: DEFAULT_TAGLINE,
    whiteLabel: false,
    logo: null as string | null,
  });
  const logoInputRef = useRef<HTMLInputElement>(null);

  const [firmId, setFirmIdState] = useState(() => getFirmId());
  const [firmIdInput, setFirmIdInput] = useState(() => getFirmId());
  const [firmIdCopied, setFirmIdCopied] = useState(false);

  const themePresets = getThemePresets();
  const [activePresetId, setActivePresetId] = useState<string | null>(null);
  const [customPrimary, setCustomPrimary] = useState('#D4AF37');
  const [customAccent, setCustomAccent] = useState('#F59E0B');
  const [customSaved, setCustomSaved] = useState(false);

  const firmName = firmBranding.name;
  const tagline = firmBranding.tagline;
  const whiteLabel = firmBranding.whiteLabel;
  const firmLogo = firmBranding.logo;

  useEffect(() => {
    const prefs = loadPreferences();
    setDisplayName(prefs.displayName);
    setTitle(prefs.title);
    setAutoSaveEnabled(prefs.autoSave);
    setStorageInfo(getStorageInfo());

    const branding = loadFirmBranding();
    setFirmBranding({
      name: branding.firmName,
      tagline: branding.tagline,
      whiteLabel: branding.whiteLabel,
      logo: loadFirmLogo(),
    });

    const currentConfig = getThemeConfig();
    if (currentConfig) {
      setCustomPrimary(currentConfig.primaryColor);
      setCustomAccent(currentConfig.accentColor);
      const matchingPreset = getThemePresets().find((preset) => preset.colors.primary === currentConfig.primaryColor);
      if (matchingPreset) setActivePresetId(matchingPreset.id);
    }
  }, []);

  useEffect(() => {
    setStorageInfo(getStorageInfo());
  }, [cases]);

  const flash = (message: string) => {
    setSaveMessage(message);
    window.setTimeout(() => setSaveMessage(null), 3000);
  };

  const handleSavePreferences = () => {
    savePreferences({ displayName, title, autoSave: autoSaveEnabled, theme });
    flash('Preferences saved.');
  };

  const handleThemeChange = (nextTheme: 'dark' | 'light') => {
    setTheme(nextTheme);
    savePreferences({ theme: nextTheme });
  };

  const exportData = () => {
    const data = exportAllData();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `casebuddy-backup-${new Date().toISOString().split('T')[0]}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    flash('Data exported.');
  };

  const importData = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (loadEvent) => {
      try {
        const data = JSON.parse(loadEvent.target?.result as string);
        if (!importAllData(data)) {
          window.alert('Could not import this backup.');
          return;
        }
        flash('Data imported. Refreshing…');
        window.setTimeout(() => window.location.reload(), 1200);
      } catch {
        window.alert('The selected backup is not valid JSON.');
      }
    };
    reader.readAsText(file);
    event.target.value = '';
  };

  const handleClearAllData = () => {
    if (!window.confirm('Delete all locally stored CaseBuddy data on this device? This cannot be undone.')) return;
    if (!clearAllData()) return;
    flash('Local data cleared. Refreshing…');
    window.setTimeout(() => window.location.reload(), 1200);
  };

  const handleLogoUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      window.alert('Please select an image file.');
      return;
    }
    const reader = new FileReader();
    reader.onload = (loadEvent) => {
      const dataUrl = loadEvent.target?.result as string;
      localStorage.setItem(FIRM_LOGO_KEY, dataUrl);
      setFirmBranding((current) => ({ ...current, logo: dataUrl }));
    };
    reader.readAsDataURL(file);
    event.target.value = '';
  };

  const handleRemoveLogo = () => {
    localStorage.removeItem(FIRM_LOGO_KEY);
    setFirmBranding((current) => ({ ...current, logo: null }));
  };

  const handleSaveFirmBranding = () => {
    saveFirmBranding({ firmName, tagline, whiteLabel });
    savePreferences({ displayName, title });
    flash('Branding saved.');
  };

  const handleChangePassword = async (event: React.FormEvent) => {
    event.preventDefault();
    const newPassword = passwordForm.new;
    const confirmPassword = passwordForm.confirm;

    if (newPassword.length < 8) {
      setPasswordForm((current) => ({ ...current, error: 'Password must be at least 8 characters.', success: false }));
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordForm((current) => ({ ...current, error: 'Passwords do not match.', success: false }));
      return;
    }

    setPasswordForm((current) => ({ ...current, busy: true, error: null, success: false }));
    try {
      const result = await updatePassword(newPassword);
      if (!result.success) {
        setPasswordForm((current) => ({ ...current, busy: false, error: result.error ?? 'Could not update your password.' }));
        return;
      }
      setPasswordForm({ new: '', confirm: '', busy: false, error: null, success: true });
    } finally {
      setPasswordForm((current) => ({ ...current, busy: false }));
    }
  };

  const handleSignOut = async () => {
    setSigningOut(true);
    await signOutUser();
  };

  return (
    <div className="space-y-6 max-w-5xl">
      <header className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.22em] text-gold-500 font-bold mb-2">CaseBuddy workspace</p>
          <h1 className="text-3xl font-bold text-white font-serif">Settings</h1>
          <p className="text-slate-400 mt-2 max-w-2xl">
            Configure how the same CaseBuddy platform is presented for your work, your team, and your cases.
          </p>
        </div>
        {saveMessage && (
          <div className="flex items-center gap-2 px-4 py-2 bg-green-900/30 border border-green-700 rounded-lg shrink-0">
            <CheckCircle className="text-green-500" size={18} />
            <span className="text-green-300 text-sm">{saveMessage}</span>
          </div>
        )}
      </header>

      <section className="rounded-2xl border border-gold-500/20 bg-gradient-to-br from-gold-500/[0.06] via-slate-800 to-slate-800 p-6">
        <div className="flex items-center gap-3 mb-2">
          <SettingsIcon className="text-gold-500" size={24} />
          <h2 className="text-xl font-semibold text-white">Workspace Focus</h2>
        </div>
        <p className="text-sm text-slate-400 mb-5">
          These choices adjust navigation emphasis only. They are not separate CaseBuddy products, accounts, or platforms.
        </p>

        <div className="grid md:grid-cols-2 gap-4">
          <button
            onClick={() => setOperatingMode('companion')}
            className={`flex flex-col items-start p-5 border rounded-xl transition-all text-left ${
              operatingMode === 'companion'
                ? 'bg-gold-500/10 border-gold-500 shadow-[0_0_18px_rgba(202,138,4,0.14)]'
                : 'bg-slate-900/50 border-slate-700 hover:border-slate-500'
            }`}
          >
            <div className="flex items-center justify-between w-full mb-3">
              <span className="inline-flex items-center gap-2">
                <User size={18} className={operatingMode === 'companion' ? 'text-gold-400' : 'text-slate-400'} />
                <span className={`font-bold ${operatingMode === 'companion' ? 'text-gold-400' : 'text-slate-200'}`}>
                  Individual Case Workspace
                </span>
              </span>
              {operatingMode === 'companion' && <CheckCircle size={18} className="text-gold-500" />}
            </div>
            <span className="text-sm text-slate-400 leading-relaxed">
              A streamlined CaseBuddy layout for self-represented litigants, defendants, and individuals managing their own legal matters.
            </span>
          </button>

          <button
            onClick={() => setOperatingMode('partner')}
            className={`flex flex-col items-start p-5 border rounded-xl transition-all text-left ${
              operatingMode === 'partner'
                ? 'bg-violet-500/10 border-violet-500 shadow-[0_0_18px_rgba(139,92,246,0.12)]'
                : 'bg-slate-900/50 border-slate-700 hover:border-slate-500'
            }`}
          >
            <div className="flex items-center justify-between w-full mb-3">
              <span className="inline-flex items-center gap-2">
                <Users size={18} className={operatingMode === 'partner' ? 'text-violet-400' : 'text-slate-400'} />
                <span className={`font-bold ${operatingMode === 'partner' ? 'text-violet-300' : 'text-slate-200'}`}>
                  Practice & Firm Workspace
                </span>
              </span>
              {operatingMode === 'partner' && <CheckCircle size={18} className="text-violet-400" />}
            </div>
            <span className="text-sm text-slate-400 leading-relaxed">
              An expanded CaseBuddy layout for solo practitioners, legal teams, and larger firms that need intake, collaboration, automation, and office workflows.
            </span>
          </button>
        </div>
      </section>

      {user && (
        <section className="bg-slate-800 border border-slate-700 rounded-xl p-6">
          <div className="flex items-center gap-3 mb-5">
            <Lock className="text-gold-500" size={24} />
            <div>
              <h2 className="text-xl font-semibold text-white">Account & Security</h2>
              <p className="text-xs text-slate-500 mt-0.5">Manage your signed-in CaseBuddy account.</p>
            </div>
          </div>

          <div className="flex items-center justify-between gap-4 p-3 bg-slate-900/50 rounded-lg mb-5">
            <div className="min-w-0">
              <p className="text-slate-300 font-medium text-sm">Signed in as</p>
              <p className="text-xs text-slate-400 mt-0.5 truncate">{user.email}</p>
            </div>
            <button
              onClick={handleSignOut}
              disabled={signingOut}
              className="flex items-center gap-2 px-3 py-1.5 text-sm bg-red-900/20 hover:bg-red-900/30 disabled:opacity-60 border border-red-700 rounded-lg text-red-400 transition-colors shrink-0"
            >
              {signingOut ? <Loader2 size={14} className="animate-spin" /> : <LogOut size={14} />}
              Sign out
            </button>
          </div>

          <form onSubmit={handleChangePassword} className="space-y-3">
            <p className="text-sm font-medium text-white">Change password</p>
            <div className="grid sm:grid-cols-2 gap-3">
              <input
                type="password"
                required
                minLength={8}
                autoComplete="new-password"
                value={passwordForm.new}
                onChange={(event) => setPasswordForm((current) => ({ ...current, new: event.target.value }))}
                placeholder="New password"
                className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-gold-500"
              />
              <input
                type="password"
                required
                minLength={8}
                autoComplete="new-password"
                value={passwordForm.confirm}
                onChange={(event) => setPasswordForm((current) => ({ ...current, confirm: event.target.value }))}
                placeholder="Confirm new password"
                className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-gold-500"
              />
            </div>
            {passwordForm.error && (
              <div className="flex items-start gap-2 px-3 py-2.5 bg-red-950/40 border border-red-500/30 rounded-lg text-sm text-red-200">
                <AlertCircle size={15} className="shrink-0 mt-0.5" /> {passwordForm.error}
              </div>
            )}
            {passwordForm.success && (
              <div className="flex items-start gap-2 px-3 py-2.5 bg-green-950/40 border border-green-500/30 rounded-lg text-sm text-green-200">
                <CheckCircle size={15} className="shrink-0 mt-0.5" /> Password updated.
              </div>
            )}
            <button
              type="submit"
              disabled={passwordForm.busy}
              className="flex items-center justify-center gap-2 bg-gold-500 hover:bg-gold-400 disabled:opacity-60 text-slate-950 font-bold py-2 px-4 rounded-lg transition-colors text-sm"
            >
              {passwordForm.busy && <Loader2 size={14} className="animate-spin" />}
              Update password
            </button>
          </form>
        </section>
      )}

      <section className="bg-slate-800 border border-slate-700 rounded-xl p-6">
        <div className="flex items-center gap-3 mb-4">
          <Cloud className="text-gold-500" size={24} />
          <div>
            <h2 className="text-xl font-semibold text-white">Cloud Sync</h2>
            <p className="text-xs text-slate-500 mt-0.5">Keep your CaseBuddy matters available across authorized devices.</p>
          </div>
        </div>

        <div className={`flex items-center gap-3 p-3 rounded-lg mb-4 ${
          syncStatus === 'synced'
            ? 'bg-green-900/20 border border-green-700'
            : syncStatus === 'error'
              ? 'bg-amber-900/20 border border-amber-700'
              : 'bg-slate-900/50 border border-slate-700'
        }`}>
          {syncStatus === 'synced' ? <Cloud size={18} className="text-green-400" /> : <CloudOff size={18} className="text-slate-500" />}
          <div>
            <p className={`font-medium text-sm ${syncStatus === 'synced' ? 'text-green-400' : syncStatus === 'error' ? 'text-amber-400' : 'text-slate-400'}`}>
              {syncLabel(syncStatus)}
            </p>
            <p className="text-xs text-slate-500 mt-0.5">
              {syncStatus === 'synced'
                ? 'Authorized case data is syncing.'
                : syncStatus === 'error'
                  ? 'Cloud sync is unavailable; local work remains available.'
                  : 'This device is currently using local storage.'}
            </p>
          </div>
        </div>

        <div>
          <p className="text-sm font-medium text-white mb-1">Firm ID</p>
          <p className="text-xs text-slate-400 mb-2">Used to connect authorized devices and firm workflows to the same CaseBuddy workspace.</p>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="text"
              value={firmIdInput}
              onChange={(event) => setFirmIdInput(event.target.value)}
              className="flex-1 px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white font-mono text-sm focus:outline-none focus:border-gold-500"
            />
            <button
              onClick={async () => {
                await navigator.clipboard.writeText(firmId).catch(() => undefined);
                setFirmIdCopied(true);
                window.setTimeout(() => setFirmIdCopied(false), 2000);
              }}
              className="px-3 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-white text-sm flex items-center justify-center gap-1.5 transition-colors"
            >
              <Copy size={14} /> {firmIdCopied ? 'Copied' : 'Copy'}
            </button>
            <button
              onClick={() => {
                if (firmIdInput.trim().length <= 8) return;
                setFirmId(firmIdInput.trim());
                setFirmIdState(firmIdInput.trim());
                flash('Firm ID updated.');
              }}
              className="px-4 py-2 rounded-lg bg-gold-500 hover:bg-gold-400 text-slate-950 font-bold text-sm transition-colors"
            >
              Save
            </button>
          </div>
        </div>
      </section>

      <section className="bg-slate-800 border border-slate-700 rounded-xl p-6">
        <div className="flex items-center gap-3 mb-4">
          <Database className="text-gold-500" size={24} />
          <div>
            <h2 className="text-xl font-semibold text-white">Data Management</h2>
            <p className="text-xs text-slate-500 mt-0.5">Export, import, and manage local CaseBuddy data.</p>
          </div>
        </div>

        <div className="bg-slate-900/50 rounded-lg p-4 space-y-3 mb-4">
          <div className="flex items-center justify-between">
            <span className="text-slate-300 font-medium">Cases stored</span>
            <span className="text-gold-500 font-bold text-lg">{cases.length}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-slate-300 font-medium">Local storage used</span>
            <span className="text-slate-400 text-sm">{storageInfo.used} KB / {storageInfo.available} KB</span>
          </div>
          <div className="w-full bg-slate-700 rounded-full h-2">
            <div
              className={`h-2 rounded-full transition-all ${storageInfo.percentage > 80 ? 'bg-red-500' : storageInfo.percentage > 50 ? 'bg-yellow-500' : 'bg-green-500'}`}
              style={{ width: `${Math.min(storageInfo.percentage, 100)}%` }}
            />
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-3 mb-4">
          <button
            onClick={exportData}
            disabled={cases.length === 0}
            className="flex items-center justify-center gap-2 px-4 py-3 bg-slate-700 hover:bg-slate-600 disabled:bg-slate-900 disabled:text-slate-600 border border-slate-600 rounded-lg transition-colors"
          >
            <Download size={18} /> Export Data
          </button>
          <label className="flex items-center justify-center gap-2 px-4 py-3 bg-slate-700 hover:bg-slate-600 border border-slate-600 rounded-lg transition-colors cursor-pointer">
            <Upload size={18} /> Import Data
            <input type="file" accept=".json" onChange={importData} className="hidden" />
          </label>
        </div>

        <div className="flex items-center justify-between p-3 bg-slate-900/50 rounded-lg mb-4">
          <div>
            <p className="text-slate-300 font-medium">Local auto-save</p>
            <p className="text-xs text-slate-400 mt-1">Persist local workspace state between sessions.</p>
          </div>
          <button
            onClick={() => {
              const nextValue = !autoSaveEnabled;
              setAutoSaveEnabled(nextValue);
              savePreferences({ autoSave: nextValue });
            }}
            className={`relative w-12 h-6 rounded-full transition-colors ${autoSaveEnabled ? 'bg-gold-500' : 'bg-slate-600'}`}
            aria-label="Toggle local auto-save"
          >
            <div className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform ${autoSaveEnabled ? 'translate-x-6' : ''}`} />
          </button>
        </div>

        <button
          onClick={handleClearAllData}
          className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-red-900/20 hover:bg-red-900/30 border border-red-700 rounded-lg transition-colors text-red-400"
        >
          <Trash2 size={18} /> Clear Local Data
        </button>
      </section>

      <section className="bg-slate-800 border border-slate-700 rounded-xl p-6">
        <div className="flex items-center gap-3 mb-5">
          <Palette className="text-gold-500" size={24} />
          <div>
            <h2 className="text-xl font-semibold text-white">Appearance</h2>
            <p className="text-xs text-slate-500 mt-0.5">Set the CaseBuddy visual style for this workspace.</p>
          </div>
        </div>

        <div className="space-y-6">
          <div>
            <p className="text-sm font-medium text-slate-300 mb-3">Mode</p>
            <div className="inline-flex bg-slate-900 border border-slate-700 rounded-lg p-1">
              <button
                onClick={() => handleThemeChange('dark')}
                className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${theme === 'dark' ? 'bg-gold-500 text-slate-950' : 'text-slate-400 hover:text-slate-200'}`}
              >
                <Moon size={16} /> Dark
              </button>
              <button
                onClick={() => handleThemeChange('light')}
                className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${theme === 'light' ? 'bg-gold-500 text-slate-950' : 'text-slate-400 hover:text-slate-200'}`}
              >
                <Sun size={16} /> Light
              </button>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-medium text-slate-300">Presets</p>
              <button
                onClick={() => {
                  resetToDefault();
                  setActivePresetId(null);
                  setCustomPrimary('#D4AF37');
                  setCustomAccent('#F59E0B');
                  setCustomSaved(false);
                }}
                className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
              >
                Reset
              </button>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {themePresets.map((preset) => {
                const isActive = activePresetId === preset.id;
                return (
                  <button
                    key={preset.id}
                    onClick={() => {
                      const config = applyPreset(preset.id);
                      setActivePresetId(preset.id);
                      setCustomPrimary(config.primaryColor);
                      setCustomAccent(config.accentColor);
                      setCustomSaved(false);
                      handleThemeChange(preset.id === 'classic-ivory' ? 'light' : 'dark');
                    }}
                    className={`text-left p-3 rounded-lg border transition-all ${isActive ? 'bg-gold-500/10 border-gold-500' : 'bg-slate-900/50 border-slate-700 hover:border-slate-500'}`}
                  >
                    <p className="text-sm font-semibold text-white mb-1">{preset.name}</p>
                    <p className="text-xs text-slate-400 mb-2 line-clamp-2">{preset.description}</p>
                    <div className="flex items-center gap-1.5">
                      <span className="w-4 h-4 rounded-full border border-white/20" style={{ backgroundColor: preset.colors.primary }} />
                      <span className="w-4 h-4 rounded-full border border-white/20" style={{ backgroundColor: preset.colors.accent }} />
                      <span className="w-4 h-4 rounded-full border border-white/20" style={{ backgroundColor: preset.colors.background }} />
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <p className="text-sm font-medium text-slate-300 mb-3">Custom Colors</p>
            <div className="grid sm:grid-cols-2 gap-3">
              <label className="block">
                <span className="block text-xs text-slate-400 mb-1.5">Primary</span>
                <div className="flex items-center gap-2">
                  <span className="w-8 h-8 rounded-full border border-white/20 shrink-0" style={{ backgroundColor: customPrimary }} />
                  <input
                    type="text"
                    value={customPrimary}
                    onChange={(event) => setCustomPrimary(event.target.value)}
                    className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-slate-200 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-gold-500"
                  />
                </div>
              </label>
              <label className="block">
                <span className="block text-xs text-slate-400 mb-1.5">Accent</span>
                <div className="flex items-center gap-2">
                  <span className="w-8 h-8 rounded-full border border-white/20 shrink-0" style={{ backgroundColor: customAccent }} />
                  <input
                    type="text"
                    value={customAccent}
                    onChange={(event) => setCustomAccent(event.target.value)}
                    className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-slate-200 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-gold-500"
                  />
                </div>
              </label>
            </div>
            <button
              onClick={() => {
                const existing = getThemeConfig();
                const derived = computeDerivedColors(customPrimary);
                const config: ThemeConfig = {
                  id: existing?.id || '',
                  firmName: existing?.firmName || 'CaseBuddy',
                  primaryColor: customPrimary,
                  primaryHover: derived.primaryHover,
                  accentColor: customAccent,
                  backgroundColor: existing?.backgroundColor || '#020617',
                  cardBackground: existing?.cardBackground || '#0F172A',
                  sidebarBackground: existing?.sidebarBackground || '#020617',
                  textPrimary: existing?.textPrimary || '#F8FAFC',
                  textSecondary: existing?.textSecondary || '#94A3B8',
                  borderColor: existing?.borderColor || '#334155',
                  fontFamily: existing?.fontFamily || 'Inter, sans-serif',
                  headingFont: existing?.headingFont || 'Inter, sans-serif',
                  cssVariables: '',
                  applied: false,
                  createdAt: existing?.createdAt || Date.now(),
                  updatedAt: Date.now(),
                };
                saveThemeConfig(config);
                setActivePresetId(null);
                setCustomSaved(true);
                window.setTimeout(() => setCustomSaved(false), 2000);
              }}
              className="mt-3 w-full flex items-center justify-center gap-2 bg-slate-700 hover:bg-slate-600 border border-slate-600 rounded-lg py-2 text-sm font-medium text-slate-300 transition-colors"
            >
              {customSaved && <CheckCircle size={16} className="text-green-400" />}
              Apply Custom Colors
            </button>
          </div>
        </div>
      </section>

      <div className="grid lg:grid-cols-2 gap-6">
        <section className="bg-slate-800 border border-slate-700 rounded-xl p-6">
          <div className="flex items-center gap-3 mb-4">
            <User className="text-gold-500" size={24} />
            <h2 className="text-xl font-semibold text-white">Profile</h2>
          </div>
          <div className="space-y-4">
            <label className="block">
              <span className="block text-sm font-medium text-slate-300 mb-2">Display Name</span>
              <input
                type="text"
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                placeholder="Your name"
                className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-slate-200 focus:outline-none focus:ring-2 focus:ring-gold-500"
              />
            </label>
            <label className="block">
              <span className="block text-sm font-medium text-slate-300 mb-2">Role / Title</span>
              <input
                type="text"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Attorney, paralegal, litigant, administrator…"
                className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-slate-200 focus:outline-none focus:ring-2 focus:ring-gold-500"
              />
            </label>
            <button
              onClick={handleSavePreferences}
              className="w-full bg-gold-500 hover:bg-gold-400 text-slate-950 font-semibold py-2 px-4 rounded-lg transition-colors"
            >
              Save Profile
            </button>
          </div>
        </section>

        <section className="bg-slate-800 border border-slate-700 rounded-xl p-6">
          <div className="flex items-center gap-3 mb-4">
            <Building2 className="text-gold-500" size={24} />
            <h2 className="text-xl font-semibold text-white">Workspace Branding</h2>
          </div>
          <div className="space-y-4">
            <label className="block">
              <span className="block text-sm font-medium text-slate-300 mb-2">Firm / Workspace Name</span>
              <input
                type="text"
                value={firmName}
                onChange={(event) => setFirmBranding((current) => ({ ...current, name: event.target.value }))}
                placeholder="CaseBuddy"
                className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-slate-200 focus:outline-none focus:ring-2 focus:ring-gold-500"
              />
            </label>
            <label className="block">
              <span className="block text-sm font-medium text-slate-300 mb-2">Tagline</span>
              <input
                type="text"
                value={tagline}
                onChange={(event) => setFirmBranding((current) => ({ ...current, tagline: event.target.value }))}
                placeholder={DEFAULT_TAGLINE}
                className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-slate-200 focus:outline-none focus:ring-2 focus:ring-gold-500"
              />
            </label>

            <div>
              <span className="block text-sm font-medium text-slate-300 mb-2">Logo</span>
              {firmLogo ? (
                <div className="flex items-center gap-3 p-3 bg-slate-900/50 rounded-lg">
                  <img src={firmLogo} alt="Workspace logo" className="h-10 w-auto max-w-[110px] object-contain rounded" />
                  <div className="ml-auto flex gap-2">
                    <label className="px-3 py-1.5 text-xs bg-slate-700 hover:bg-slate-600 border border-slate-600 rounded-lg cursor-pointer transition-colors text-slate-300">
                      Replace
                      <input type="file" accept="image/*" onChange={handleLogoUpload} className="hidden" ref={logoInputRef} />
                    </label>
                    <button onClick={handleRemoveLogo} className="px-3 py-1.5 text-xs border border-red-700 rounded-lg text-red-400 hover:bg-red-900/20">
                      Remove
                    </button>
                  </div>
                </div>
              ) : (
                <label className="flex items-center justify-center gap-2 px-4 py-5 bg-slate-900/50 border-2 border-dashed border-slate-600 hover:border-gold-500 rounded-lg cursor-pointer transition-colors">
                  <Upload size={17} className="text-slate-500" />
                  <span className="text-sm text-slate-400">Upload logo</span>
                  <input type="file" accept="image/*" onChange={handleLogoUpload} className="hidden" />
                </label>
              )}
            </div>

            <div className="flex items-center justify-between p-3 bg-slate-900/50 rounded-lg">
              <div>
                <p className="text-slate-300 font-medium">White-label mode</p>
                <p className="text-xs text-slate-400 mt-1">Use your organization name in the workspace header.</p>
              </div>
              <button
                onClick={() => setFirmBranding((current) => ({ ...current, whiteLabel: !current.whiteLabel }))}
                className={`relative w-12 h-6 rounded-full transition-colors ${whiteLabel ? 'bg-gold-500' : 'bg-slate-600'}`}
                aria-label="Toggle white-label mode"
              >
                <div className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform ${whiteLabel ? 'translate-x-6' : ''}`} />
              </button>
            </div>

            <div>
              <div className="flex items-center gap-2 mb-2">
                <Eye size={14} className="text-slate-400" />
                <p className="text-xs font-medium text-slate-400 uppercase tracking-wide">Preview</p>
              </div>
              <div className="bg-slate-900 border border-slate-700 rounded-lg p-4 flex items-center gap-3">
                {firmLogo ? (
                  <img src={firmLogo} alt="Logo" className="h-8 w-auto max-w-[80px] object-contain" />
                ) : (
                  <div className="h-8 w-8 rounded-lg bg-gold-500/15 border border-gold-500/30 flex items-center justify-center">
                    <Scale size={16} className="text-gold-400" />
                  </div>
                )}
                <div className="min-w-0">
                  <p className="text-sm font-serif font-bold text-white truncate">{whiteLabel ? (firmName || 'Your Workspace') : 'CaseBuddy'}</p>
                  <p className="text-xs text-slate-400 truncate">{whiteLabel ? (tagline || DEFAULT_TAGLINE) : DEFAULT_TAGLINE}</p>
                </div>
              </div>
            </div>

            <button
              onClick={handleSaveFirmBranding}
              className="w-full bg-gold-500 hover:bg-gold-400 text-slate-950 font-semibold py-2 px-4 rounded-lg transition-colors"
            >
              Save Branding
            </button>
          </div>
        </section>
      </div>

      <section className="bg-slate-800 border border-slate-700 rounded-xl p-6">
        <div className="flex items-center gap-3 mb-4">
          <Shield className="text-gold-500" size={24} />
          <div>
            <h2 className="text-xl font-semibold text-white">Privacy & Security</h2>
            <p className="text-xs text-slate-500 mt-0.5">Current CaseBuddy security model.</p>
          </div>
        </div>
        <div className="grid md:grid-cols-3 gap-3 text-sm">
          <div className="p-4 rounded-xl bg-slate-900/55 border border-slate-700">
            <p className="font-semibold text-white mb-1">Scoped case access</p>
            <p className="text-xs text-slate-400 leading-relaxed">Signed-in access is constrained by case, user, and firm permissions rather than a shared public data surface.</p>
          </div>
          <div className="p-4 rounded-xl bg-slate-900/55 border border-slate-700">
            <p className="font-semibold text-white mb-1">Private sensitive storage</p>
            <p className="text-xs text-slate-400 leading-relaxed">Sensitive matter files use private storage and controlled access paths rather than public object URLs.</p>
          </div>
          <div className="p-4 rounded-xl bg-slate-900/55 border border-slate-700">
            <p className="font-semibold text-white mb-1">Server-side provider credentials</p>
            <p className="text-xs text-slate-400 leading-relaxed">Permanent provider keys belong on trusted server infrastructure and are not a browser configuration setting.</p>
          </div>
        </div>
      </section>

      <section className="bg-slate-800 border border-slate-700 rounded-xl p-6">
        <div className="flex items-center gap-3 mb-4">
          <Info className="text-gold-500" size={24} />
          <div>
            <h2 className="text-xl font-semibold text-white">Billing & Subscription</h2>
            <p className="text-xs text-slate-500 mt-0.5">Manage your CaseBuddy plan and billing.</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-3">
          <a href="/pricing" className="inline-flex items-center gap-2 px-4 py-2 bg-gold-500 hover:bg-gold-400 text-slate-900 font-semibold rounded-xl text-sm transition-colors">
            View Plans
          </a>
        </div>
      </section>

      <AgentLogsPanel />

      <section className="bg-slate-800 border border-slate-700 rounded-xl p-6">
        <h2 className="text-lg font-semibold text-white mb-3">About CaseBuddy</h2>
        <p className="text-sm text-slate-300 leading-relaxed max-w-3xl">
          CaseBuddy is an all-in-one legal work platform designed to help self-represented litigants, defendants, solo practitioners, legal teams, and larger firms organize matters, reduce repetitive work, prepare more thoroughly, and accomplish more from a connected case workspace.
        </p>
        <p className="text-xs text-slate-500 mt-3">Legal assistance software. CaseBuddy does not guarantee legal outcomes.</p>
      </section>
    </div>
  );
};

export default Settings;
