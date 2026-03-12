
import React, { useState, useContext, useEffect } from 'react';
import { AppContext } from '../App';
import { Settings as SettingsIcon, Key, Database, Download, Upload, AlertCircle, Check, User, Moon, Sun, Volume2, Palette, Shield, Info, Trash2, CheckCircle } from 'lucide-react';
import { exportAllData, importAllData, clearAllData, getStorageInfo, savePreferences, loadPreferences } from '../utils/storage';

const Settings = () => {
  const { cases, theme, setTheme } = useContext(AppContext);
  const [displayName, setDisplayName] = useState('');
  const [title, setTitle] = useState('');
  const [autoSaveEnabled, setAutoSaveEnabled] = useState(true);
  const [storageInfo, setStorageInfo] = useState({ used: 0, available: 0, percentage: 0 });
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  const currentApiKey = process.env.API_KEY || '';
  const isApiKeyConfigured = currentApiKey && currentApiKey !== '';

  useEffect(() => {
    const prefs = loadPreferences();
    setDisplayName(prefs.displayName);
    setTitle(prefs.title);
    setAutoSaveEnabled(prefs.autoSave);
    updateStorageInfo();
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

      {/* Privacy & Security */}
      <div className="bg-slate-800 border border-slate-700 rounded-xl p-6">
        <div className="flex items-center gap-3 mb-4">
          <Shield className="text-gold-500" size={24} />
          <h2 className="text-xl font-semibold text-white">Privacy & Security</h2>
        </div>

        <div className="space-y-3 text-sm text-slate-300">
          <p>
            <strong className="text-white">Data Storage:</strong> All case data is stored locally in your browser's memory. No data is sent to any server except Google's Gemini API.
          </p>
          <p>
            <strong className="text-white">API Usage:</strong> Your prompts and case information are sent to Google's Gemini API for processing. Review <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer" className="text-gold-400 hover:underline">Google's Privacy Policy</a>.
          </p>
          <p>
            <strong className="text-white">Persistence:</strong> Case data is lost on page refresh unless you export it. No backend database is implemented.
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
