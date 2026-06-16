
import React, { useState, useContext, useEffect, useRef } from 'react';
import { AppContext } from '../App';
import { Settings as SettingsIcon, Key, Database, Download, Upload, AlertCircle, Check, User, Moon, Sun, Volume2, Palette, Shield, Info, Trash2, CheckCircle, Building2, Eye, Cloud, CloudOff, Copy, Lock, LogOut, Loader2 } from 'lucide-react';
import { exportAllData, importAllData, clearAllData, getStorageInfo, savePreferences, loadPreferences } from '../utils/storage';
import { getFirmId, setFirmId, syncLabel } from '../services/caseStore';
import { updatePassword } from '../services/authStore';

const FIRM_BRANDING_KEY = 'casebuddy_firm_branding';
const FIRM_LOGO_KEY = 'casebuddy_firm_logo';

interface FirmBranding {
  firmName: string;
  tagline: string;
  whiteLabel: boolean;
}

const loadFirmBranding = (): FirmBranding => {
  try {
    const raw = localStorage.getItem(FIRM_BRANDING_KEY);
    return raw ? JSON.parse(raw) : { firmName: 'CaseBuddy', tagline: 'AI-Powered Legal Platform', whiteLabel: false };
  } catch {
    return { firmName: 'CaseBuddy', tagline: 'AI-Powered Legal Platform', whiteLabel: false };
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

const Settings = () => {
  const { cases, theme, setTheme, syncStatus, user, signOut } = useContext(AppContext);
  const [displayName, setDisplayName] = useState('');
  const [title, setTitle] = useState('');
  const [autoSaveEnabled, setAutoSaveEnabled] = useState(true);
  const [storageInfo, setStorageInfo] = useState({ used: 0, available: 0, percentage: 0 });
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  // Account & Security state
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState(false);

  // Firm Branding state
  const [firmName, setFirmName] = useState('CaseBuddy');
  const [tagline, setTagline] = useState('AI-Powered Legal Platform');
  const [whiteLabel, setWhiteLabel] = useState(false);
  const [firmLogo, setFirmLogo] = useState<string | null>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);

  const [firmId, setFirmIdState] = useState(() => getFirmId());
  const [firmIdInput, setFirmIdInput] = useState(() => getFirmId());
  const [firmIdCopied, setFirmIdCopied] = useState(false);

  const currentApiKey = process.env.API_KEY || '';
  const isApiKeyConfigured = currentApiKey && currentApiKey !== '';

  useEffect(() => {
    const prefs = loadPreferences();
    setDisplayName(prefs.displayName);
    setTitle(prefs.title);
    setAutoSaveEnabled(prefs.autoSave);
    updateStorageInfo();

    // Load firm branding
    const branding = loadFirmBranding();
    setFirmName(branding.firmName);
    setTagline(branding.tagline);
    setWhiteLabel(branding.whiteLabel);
    setFirmLogo(loadFirmLogo());
  }, []);

  useEffect(() => {
    updateStorageInfo();
  }, [cases]);

  const updateStorageInfo = () => {
    setStorageInfo(getStorageInfo());
  };

  const handleSavePreferences = () => {
    savePreferences({
      displayName,
      title,
      autoSave: autoSaveEnabled,
      theme
    });
    setSaveMessage('Preferences saved successfully!');
    setTimeout(() => setSaveMessage(null), 3000);
  };

  const handleThemeChange = (newTheme: 'dark' | 'light') => {
    setTheme(newTheme);
    savePreferences({ theme: newTheme });
  };

  const handleAutoSaveToggle = () => {
    const newValue = !autoSaveEnabled;
    setAutoSaveEnabled(newValue);
    savePreferences({ autoSave: newValue });
  };

  const exportData = () => {
    const data = exportAllData();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `lexsim-backup-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);

    setSaveMessage('Data exported successfully!');
    setTimeout(() => setSaveMessage(null), 3000);
  };

  const importData = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target?.result as string);
        if (importAllData(data)) {
          setSaveMessage('Data imported successfully! Refreshing page...');
          setTimeout(() => window.location.reload(), 1500);
        } else {
          alert('Failed to import data. Please try again.');
        }
      } catch (error) {
        alert('Failed to import data. Invalid file format.');
      }
    };
    reader.readAsText(file);
    event.target.value = ''; // Reset input
  };

  const handleClearAllData = () => {
    if (window.confirm('Are you sure you want to delete ALL data? This cannot be undone!')) {
      if (window.confirm('This will delete all cases, sessions, and settings. Continue?')) {
        if (clearAllData()) {
          setSaveMessage('All data cleared. Refreshing...');
          setTimeout(() => window.location.reload(), 1500);
        }
      }
    }
  };

  const handleSaveFirmBranding = () => {
    saveFirmBranding({ firmName, tagline, whiteLabel });
    setSaveMessage('Firm branding saved successfully!');
    setTimeout(() => setSaveMessage(null), 3000);
  };

  const handleLogoUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      alert('Please select a valid image file.');
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      localStorage.setItem(FIRM_LOGO_KEY, dataUrl);
      setFirmLogo(dataUrl);
    };
    reader.readAsDataURL(file);
    event.target.value = '';
  };

  const handleRemoveLogo = () => {
    localStorage.removeItem(FIRM_LOGO_KEY);
    setFirmLogo(null);
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError(null);
    setPasswordSuccess(null);

    if (newPassword.length < 8) {
      setPasswordError('Password must be at least 8 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('Passwords do not match.');
      return;
    }

    setPasswordBusy(true);
    try {
      const result = await updatePassword(newPassword);
      if (!result.ok) {
        setPasswordError(result.error ?? 'Could not update your password.');
      } else {
        setPasswordSuccess('Password updated successfully.');
        setNewPassword('');
        setConfirmPassword('');
      }
    } finally {
      setPasswordBusy(false);
    }
  };

  const handleSignOut = async () => {
    setSigningOut(true);
    await signOut();
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white font-serif">Settings</h1>
          <p className="text-slate-400 mt-2">Configure your LexSim preferences and API settings</p>
        </div>
        {saveMessage && (
          <div className="flex items-center gap-2 px-4 py-2 bg-green-900/30 border border-green-700 rounded-lg">
            <CheckCircle className="text-green-500" size={18} />
            <span className="text-green-400 text-sm">{saveMessage}</span>
          </div>
        )}
      </div>

      {/* API Configuration */}
      <div className="bg-slate-800 border border-slate-700 rounded-xl p-6">
        <div className="flex items-center gap-3 mb-4">
          <Key className="text-gold-500" size={24} />
          <h2 className="text-xl font-semibold text-white">API Configuration</h2>
        </div>

        <div className="space-y-4">
          {/* API Key Status */}
          <div className="flex items-center gap-3 p-3 bg-slate-900/50 rounded-lg">
            {isApiKeyConfigured ? (
              <>
                <Check className="text-green-500" size={20} />
                <div>
                  <p className="text-green-400 font-medium">API Key Configured</p>
                  <p className="text-xs text-slate-400 mt-1">Gemini API is ready to use</p>
                </div>
              </>
            ) : (
              <>
                <AlertCircle className="text-yellow-500" size={20} />
                <div>
                  <p className="text-yellow-400 font-medium">API Key Not Configured</p>
                  <p className="text-xs text-slate-400 mt-1">Add GEMINI_API_KEY to .env.local and restart the server</p>
                </div>
              </>
            )}
          </div>

          {/* Instructions */}
          <div className="bg-blue-900/20 border border-blue-700 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <Info className="text-blue-400 flex-shrink-0 mt-0.5" size={20} />
              <div className="text-sm text-blue-300">
                <p className="font-semibold mb-2">How to configure your API key:</p>
                <ol className="list-decimal list-inside space-y-1 text-blue-200">
                  <li>Get your API key from <a href="https://ai.google.dev/" target="_blank" rel="noopener noreferrer" className="text-gold-400 hover:underline">Google AI Studio</a></li>
                  <li>Open <code className="bg-slate-900/50 px-2 py-0.5 rounded">.env.local</code> in your project root</li>
                  <li>Add: <code className="bg-slate-900/50 px-2 py-0.5 rounded">GEMINI_API_KEY=your_key_here</code></li>
                  <li>Restart the development server</li>
                </ol>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Cloud Sync */}
      <div className="bg-slate-800 border border-slate-700 rounded-xl p-6">
        <div className="flex items-center gap-3 mb-4">
          <Cloud className="text-gold-500" size={24} />
          <h2 className="text-xl font-semibold text-white">Cloud Sync</h2>
        </div>

        <div className="space-y-4">
          {/* Sync status */}
          <div className={`flex items-center gap-3 p-3 rounded-lg ${
            syncStatus === 'synced' ? 'bg-green-900/20 border border-green-700' :
            syncStatus === 'error' ? 'bg-amber-900/20 border border-amber-700' :
            'bg-slate-900/50 border border-slate-700'
          }`}>
            {syncStatus === 'synced' ? <Cloud size={18} className="text-green-400" /> : <CloudOff size={18} className="text-slate-500" />}
            <div>
              <p className={`font-medium text-sm ${syncStatus === 'synced' ? 'text-green-400' : syncStatus === 'error' ? 'text-amber-400' : 'text-slate-400'}`}>
                {syncLabel(syncStatus)}
              </p>
              <p className="text-xs text-slate-500 mt-0.5">
                {syncStatus === 'synced'
                  ? 'Cases sync automatically across all your devices.'
                  : syncStatus === 'error'
                  ? 'Supabase unavailable — working from local storage.'
                  : 'Cases are stored locally on this device only.'}
              </p>
            </div>
          </div>

          {/* Firm ID */}
          <div>
            <p className="text-sm font-medium text-white mb-1">Firm ID</p>
            <p className="text-xs text-slate-400 mb-2">
              Your Firm ID is the shared key that links all devices in your firm. Copy it and enter it on any other device to sync cases across the firm.
            </p>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={firmIdInput}
                onChange={e => setFirmIdInput(e.target.value)}
                className="flex-1 px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white font-mono text-sm focus:outline-none focus:border-gold-500"
              />
              <button
                onClick={async () => {
                  await navigator.clipboard.writeText(firmId).catch(() => {});
                  setFirmIdCopied(true);
                  setTimeout(() => setFirmIdCopied(false), 2000);
                }}
                className="px-3 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-white text-sm flex items-center gap-1.5 transition-colors shrink-0"
              >
                <Copy size={14} />
                {firmIdCopied ? 'Copied!' : 'Copy'}
              </button>
              <button
                onClick={() => {
                  if (firmIdInput.trim().length > 8) {
                    setFirmId(firmIdInput.trim());
                    setFirmIdState(firmIdInput.trim());
                    setSaveMessage('Firm ID updated — cases will sync to the new firm on next load.');
                    setTimeout(() => setSaveMessage(null), 4000);
                  }
                }}
                className="px-3 py-2 rounded-lg bg-gold-500 hover:bg-gold-400 text-slate-950 font-bold text-sm transition-colors shrink-0"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Data Management */}
      <div className="bg-slate-800 border border-slate-700 rounded-xl p-6">
        <div className="flex items-center gap-3 mb-4">
          <Database className="text-gold-500" size={24} />
          <h2 className="text-xl font-semibold text-white">Data Management</h2>
        </div>

        <div className="space-y-4">
          {/* Storage Info */}
          <div className="bg-slate-900/50 rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-slate-300 font-medium">Cases stored</span>
              <span className="text-gold-500 font-bold text-lg">{cases.length}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-300 font-medium">Storage used</span>
              <span className="text-slate-400 text-sm">{storageInfo.used} KB / {storageInfo.available} KB</span>
            </div>
            <div className="w-full bg-slate-700 rounded-full h-2">
              <div
                className={`h-2 rounded-full transition-all ${
                  storageInfo.percentage > 80 ? 'bg-red-500' : storageInfo.percentage > 50 ? 'bg-yellow-500' : 'bg-green-500'
                }`}
                style={{ width: `${Math.min(storageInfo.percentage, 100)}%` }}
              />
            </div>
            <p className="text-xs text-slate-400">
              Data is automatically saved to browser localStorage
            </p>
          </div>

          {/* Export/Import */}
          <div className="grid sm:grid-cols-2 gap-3">
            <button
              onClick={exportData}
              disabled={cases.length === 0}
              className="flex items-center justify-center gap-2 px-4 py-3 bg-slate-700 hover:bg-slate-600 disabled:bg-slate-900 disabled:text-slate-600 border border-slate-600 rounded-lg transition-colors"
            >
              <Download size={18} />
              <span className="font-medium">Export Data</span>
            </button>

            <label className="flex items-center justify-center gap-2 px-4 py-3 bg-slate-700 hover:bg-slate-600 border border-slate-600 rounded-lg transition-colors cursor-pointer">
              <Upload size={18} />
              <span className="font-medium">Import Data</span>
              <input
                type="file"
                accept=".json"
                onChange={importData}
                className="hidden"
              />
            </label>
          </div>

          {/* Auto-save Toggle */}
          <div className="flex items-center justify-between p-3 bg-slate-900/50 rounded-lg">
            <div>
              <p className="text-slate-300 font-medium">Auto-save to LocalStorage</p>
              <p className="text-xs text-slate-400 mt-1">Automatically persist data between sessions</p>
            </div>
            <button
              onClick={handleAutoSaveToggle}
              className={`relative w-12 h-6 rounded-full transition-colors ${
                autoSaveEnabled ? 'bg-gold-500' : 'bg-slate-600'
              }`}
            >
              <div
                className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform ${
                  autoSaveEnabled ? 'transform translate-x-6' : ''
                }`}
              />
            </button>
          </div>

          {/* Clear All Data */}
          <button
            onClick={handleClearAllData}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-red-900/20 hover:bg-red-900/30 border border-red-700 rounded-lg transition-colors text-red-400"
          >
            <Trash2 size={18} />
            <span className="font-medium">Clear All Data</span>
          </button>
        </div>
      </div>

      {/* Appearance */}
      <div className="bg-slate-800 border border-slate-700 rounded-xl p-6">
        <div className="flex items-center gap-3 mb-4">
          <Palette className="text-gold-500" size={24} />
          <h2 className="text-xl font-semibold text-white">Appearance</h2>
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {theme === 'dark' ? <Moon size={20} className="text-gold-500" /> : <Sun size={20} className="text-gold-500" />}
              <span className="text-slate-300">Theme</span>
            </div>
            <select
              value={theme}
              onChange={(e) => handleThemeChange(e.target.value as 'dark' | 'light')}
              className="px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-slate-200 hover:bg-slate-600 transition-colors cursor-pointer"
            >
              <option value="dark">Dark</option>
              <option value="light">Light</option>
            </select>
          </div>
          <p className="text-xs text-slate-400 italic">Light theme coming soon. Currently, only dark theme is fully supported.</p>
        </div>
      </div>

      {/* Account & Security */}
      <div className="bg-slate-800 border border-slate-700 rounded-xl p-6">
        <div className="flex items-center gap-3 mb-4">
          <Lock className="text-gold-500" size={24} />
          <h2 className="text-xl font-semibold text-white">Account & Security</h2>
        </div>

        {user ? (
          <div className="space-y-5">
            <div className="flex items-center justify-between p-3 bg-slate-900/50 rounded-lg">
              <div>
                <p className="text-sm font-medium text-white">Signed in as</p>
                <p className="text-sm text-slate-400 mt-0.5">{user.email}</p>
              </div>
              <button
                onClick={handleSignOut}
                disabled={signingOut}
                className="flex items-center gap-2 px-3 py-2 bg-red-900/20 hover:bg-red-900/30 disabled:opacity-60 border border-red-700 rounded-lg text-red-400 text-sm transition-colors"
              >
                {signingOut ? <Loader2 size={14} className="animate-spin" /> : <LogOut size={14} />}
                Sign out
              </button>
            </div>

            <form onSubmit={handleChangePassword} className="space-y-3">
              <p className="text-sm font-medium text-slate-300">Change password</p>
              <div className="grid sm:grid-cols-2 gap-3">
                <input
                  type="password"
                  required
                  minLength={8}
                  autoComplete="new-password"
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  placeholder="New password"
                  className="px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-slate-200 focus:outline-none focus:ring-2 focus:ring-gold-500"
                />
                <input
                  type="password"
                  required
                  minLength={8}
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  placeholder="Confirm new password"
                  className="px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-slate-200 focus:outline-none focus:ring-2 focus:ring-gold-500"
                />
              </div>
              {passwordError && (
                <div className="flex items-start gap-2 px-3 py-2.5 bg-red-950/40 border border-red-500/30 rounded-lg text-sm text-red-200">
                  <AlertCircle size={15} className="shrink-0 mt-0.5" />
                  <span>{passwordError}</span>
                </div>
              )}
              {passwordSuccess && (
                <div className="flex items-start gap-2 px-3 py-2.5 bg-green-950/30 border border-green-500/30 rounded-lg text-sm text-green-200">
                  <Check size={15} className="shrink-0 mt-0.5" />
                  <span>{passwordSuccess}</span>
                </div>
              )}
              <button
                type="submit"
                disabled={passwordBusy}
                className="flex items-center gap-2 bg-gold-500 hover:bg-gold-600 disabled:opacity-60 text-slate-900 font-semibold py-2 px-4 rounded-lg transition-colors"
              >
                {passwordBusy && <Loader2 size={14} className="animate-spin" />}
                Update password
              </button>
            </form>
          </div>
        ) : (
          <p className="text-sm text-slate-400">Authentication isn't configured for this deployment.</p>
        )}
      </div>

      {/* User Profile */}
      <div className="bg-slate-800 border border-slate-700 rounded-xl p-6">
        <div className="flex items-center gap-3 mb-4">
          <User className="text-gold-500" size={24} />
          <h2 className="text-xl font-semibold text-white">User Profile</h2>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">Display Name</label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Attorney J. Doe"
              className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-slate-200 focus:outline-none focus:ring-2 focus:ring-gold-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Senior Litigator"
              className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-slate-200 focus:outline-none focus:ring-2 focus:ring-gold-500"
            />
          </div>
          <button
            onClick={handleSavePreferences}
            className="w-full bg-gold-500 hover:bg-gold-600 text-slate-900 font-semibold py-2 px-4 rounded-lg transition-colors"
          >
            Save Profile
          </button>
          <p className="text-xs text-slate-400">Profile information is stored locally and displayed in the header.</p>
        </div>
      </div>

      {/* Firm Branding */}
      <div className="bg-slate-800 border border-slate-700 rounded-xl p-6">
        <div className="flex items-center gap-3 mb-4">
          <Building2 className="text-gold-500" size={24} />
          <h2 className="text-xl font-semibold text-white">Firm Branding</h2>
        </div>

        <div className="space-y-4">
          {/* Firm Name */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">Firm Name</label>
            <input
              type="text"
              value={firmName}
              onChange={(e) => setFirmName(e.target.value)}
              placeholder="CaseBuddy"
              className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-slate-200 focus:outline-none focus:ring-2 focus:ring-gold-500"
            />
          </div>

          {/* Tagline */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">Tagline</label>
            <input
              type="text"
              value={tagline}
              onChange={(e) => setTagline(e.target.value)}
              placeholder="AI-Powered Legal Platform"
              className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-slate-200 focus:outline-none focus:ring-2 focus:ring-gold-500"
            />
          </div>

          {/* Primary Attorney (reuses displayName) */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">Primary Attorney Name</label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Attorney J. Doe"
              className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-slate-200 focus:outline-none focus:ring-2 focus:ring-gold-500"
            />
            <p className="text-xs text-slate-500 mt-1">This also updates your user profile display name.</p>
          </div>

          {/* Logo Upload */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">Firm Logo</label>
            {firmLogo ? (
              <div className="flex items-center gap-4 p-3 bg-slate-900/50 rounded-lg">
                <img src={firmLogo} alt="Firm Logo" className="h-12 w-auto max-w-[120px] object-contain rounded" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-slate-300 truncate">Logo uploaded</p>
                  <p className="text-xs text-slate-500">Stored in browser localStorage</p>
                </div>
                <div className="flex gap-2">
                  <label className="px-3 py-1.5 text-xs bg-slate-700 hover:bg-slate-600 border border-slate-600 rounded-lg cursor-pointer transition-colors text-slate-300">
                    Replace
                    <input type="file" accept="image/*" onChange={handleLogoUpload} className="hidden" ref={logoInputRef} />
                  </label>
                  <button
                    onClick={handleRemoveLogo}
                    className="px-3 py-1.5 text-xs bg-red-900/20 hover:bg-red-900/40 border border-red-700 rounded-lg text-red-400 transition-colors"
                  >
                    Remove
                  </button>
                </div>
              </div>
            ) : (
              <label className="flex items-center justify-center gap-2 px-4 py-6 bg-slate-900/50 border-2 border-dashed border-slate-600 hover:border-gold-500 rounded-lg cursor-pointer transition-colors group">
                <Upload size={18} className="text-slate-500 group-hover:text-gold-500 transition-colors" />
                <span className="text-sm text-slate-400 group-hover:text-slate-200 transition-colors">Click to upload logo (PNG, JPG, SVG)</span>
                <input type="file" accept="image/*" onChange={handleLogoUpload} className="hidden" />
              </label>
            )}
          </div>

          {/* White-label toggle */}
          <div className="flex items-center justify-between p-3 bg-slate-900/50 rounded-lg">
            <div>
              <p className="text-slate-300 font-medium">White-Label Mode</p>
              <p className="text-xs text-slate-400 mt-1">Hide "CaseBuddy" branding and replace with your firm name</p>
            </div>
            <button
              onClick={() => setWhiteLabel(v => !v)}
              className={`relative w-12 h-6 rounded-full transition-colors ${whiteLabel ? 'bg-gold-500' : 'bg-slate-600'}`}
            >
              <div className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform ${whiteLabel ? 'transform translate-x-6' : ''}`} />
            </button>
          </div>

          {/* Preview Card */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Eye size={14} className="text-slate-400" />
              <p className="text-xs font-medium text-slate-400 uppercase tracking-wide">Header Preview</p>
            </div>
            <div className="bg-slate-900 border border-slate-700 rounded-lg p-4">
              <div className="flex items-center gap-3">
                {firmLogo ? (
                  <img src={firmLogo} alt="Logo" className="h-8 w-auto max-w-[80px] object-contain" />
                ) : (
                  <div className="h-8 w-8 rounded-full bg-gold-500/20 border border-gold-500/40 flex items-center justify-center">
                    <Building2 size={16} className="text-gold-400" />
                  </div>
                )}
                <div>
                  <p className="text-sm font-serif font-bold text-white">
                    {whiteLabel ? (firmName || 'Your Firm Name') : 'CaseBuddy'}
                  </p>
                  <p className="text-xs text-slate-400">
                    {whiteLabel ? (tagline || 'Your Tagline') : 'AI-Powered Legal Platform'}
                  </p>
                </div>
                <div className="ml-auto text-right">
                  <p className="text-xs font-semibold text-slate-300">{displayName || 'Attorney J. Doe'}</p>
                  <p className="text-xs text-slate-500">{title || 'Senior Litigator'}</p>
                </div>
              </div>
            </div>
            <p className="text-xs text-slate-500 mt-1">This preview reflects how your branding will appear in the app header.</p>
          </div>

          <button
            onClick={handleSaveFirmBranding}
            className="w-full bg-gold-500 hover:bg-gold-600 text-slate-900 font-semibold py-2 px-4 rounded-lg transition-colors"
          >
            Save Firm Branding
          </button>
        </div>
      </div>

      {/* Privacy & Security */}
      <div className="bg-slate-800 border border-slate-700 rounded-xl p-6">
        <div className="flex items-center gap-3 mb-4">
          <Shield className="text-gold-500" size={24} />
          <h2 className="text-xl font-semibold text-white">Privacy & Security</h2>
        </div>

        <div className="space-y-3 text-sm text-slate-300">
          <p>
            <strong className="text-white">Authentication:</strong> Access to your firm's cases requires signing in. Case data is protected by row-level security and scoped to your firm — other accounts cannot read or write it.
          </p>
          <p>
            <strong className="text-white">Data Storage:</strong> Case data is stored locally in your browser and synced to your firm's secure cloud database for cross-device access and backup.
          </p>
          <p>
            <strong className="text-white">API Usage:</strong> Your prompts and case information are sent to Google's Gemini API for processing. Review <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer" className="text-gold-400 hover:underline">Google's Privacy Policy</a>.
          </p>
        </div>
      </div>

      {/* About */}
      <div className="bg-slate-800 border border-slate-700 rounded-xl p-6">
        <h2 className="text-lg font-semibold text-white mb-3">About LexSim</h2>
        <p className="text-sm text-slate-300 mb-2">
          LexSim is an AI-powered legal trial preparation platform built with Google Gemini AI.
        </p>
        <div className="flex gap-4 text-xs text-slate-400">
          <span>Version 1.0.0</span>
          <span>•</span>
          <a href="https://ai.studio/apps/drive/1V2CDhsqj46ydvFpmYDwK7mwA9ZvplvwL" target="_blank" rel="noopener noreferrer" className="text-gold-400 hover:underline">
            View on AI Studio
          </a>
        </div>
      </div>
    </div>
  );
};

export default Settings;
