import { Case } from '../types';

const STORAGE_KEYS = {
  CASES: 'lexsim_cases',
  ACTIVE_CASE_ID: 'lexsim_active_case_id',
  THEME: 'lexsim_theme',
  USER_PREFERENCES: 'lexsim_preferences',
  TRIAL_SESSIONS: 'lexsim_trial_sessions',
  VERSION: 'lexsim_version',
};

const CURRENT_VERSION = '1.0.0';

interface UserPreferences {
  autoSave: boolean;
  theme: 'dark' | 'light';
  displayName: string;
  title: string;
}

interface TrialSession {
  id: string;
  caseId: string;
  phase: string;
  mode: string;
  date: string;
  duration: number;
  transcript: Array<{ sender: string; text: string; timestamp: number }>;
  audioUrl?: string;
  score?: number;
  feedback?: any;
}

// Check if localStorage is available
const isLocalStorageAvailable = (): boolean => {
  try {
    const test = '__localStorage_test__';
    localStorage.setItem(test, test);
    localStorage.removeItem(test);
    return true;
  } catch (e) {
    return false;
  }
};

// Migration function for version updates
const migrateData = () => {
  const storedVersion = localStorage.getItem(STORAGE_KEYS.VERSION);

  if (!storedVersion) {
    // First time setup
    localStorage.setItem(STORAGE_KEYS.VERSION, CURRENT_VERSION);
  }

  // Future migrations can be added here
  // if (storedVersion === '1.0.0' && CURRENT_VERSION === '1.1.0') { ... }
};

// Cases
export const saveCases = (cases: Case[]): boolean => {
  if (!isLocalStorageAvailable()) return false;

  try {
    localStorage.setItem(STORAGE_KEYS.CASES, JSON.stringify(cases));
    return true;
  } catch (e) {
    // Silent fail - return false indicates failure
    return false;
  }
};

export const loadCases = (): Case[] => {
  if (!isLocalStorageAvailable()) return [];

  try {
    migrateData();
    const data = localStorage.getItem(STORAGE_KEYS.CASES);
    return data ? JSON.parse(data) : [];
  } catch (e) {
    // Silent fail - return empty array
    return [];
  }
};

export const clearCases = (): boolean => {
  if (!isLocalStorageAvailable()) return false;

  try {
    localStorage.removeItem(STORAGE_KEYS.CASES);
    localStorage.removeItem(STORAGE_KEYS.ACTIVE_CASE_ID);
    return true;
  } catch (e) {
    // Silent fail - return false indicates failure
    return false;
  }
};

// Active Case
export const saveActiveCaseId = (caseId: string | null): boolean => {
  if (!isLocalStorageAvailable()) return false;

  try {
    if (caseId) {
      localStorage.setItem(STORAGE_KEYS.ACTIVE_CASE_ID, caseId);
    } else {
      localStorage.removeItem(STORAGE_KEYS.ACTIVE_CASE_ID);
    }
    return true;
  } catch (e) {
    // Silent fail - return false indicates failure
    return false;
  }
};

export const loadActiveCaseId = (): string | null => {
  if (!isLocalStorageAvailable()) return null;

  try {
    return localStorage.getItem(STORAGE_KEYS.ACTIVE_CASE_ID);
  } catch (e) {
    // Silent fail - return null
    return null;
  }
};

// User Preferences
export const savePreferences = (preferences: Partial<UserPreferences>): boolean => {
  if (!isLocalStorageAvailable()) return false;

  try {
    const current = loadPreferences();
    const updated = { ...current, ...preferences };
    localStorage.setItem(STORAGE_KEYS.USER_PREFERENCES, JSON.stringify(updated));
    return true;
  } catch (e) {
    // Silent fail - return false indicates failure
    return false;
  }
};

export const loadPreferences = (): UserPreferences => {
  const defaults: UserPreferences = {
    autoSave: true,
    theme: 'dark',
    displayName: 'Attorney J. Doe',
    title: 'Senior Litigator',
  };

  if (!isLocalStorageAvailable()) return defaults;

  try {
    const data = localStorage.getItem(STORAGE_KEYS.USER_PREFERENCES);
    return data ? { ...defaults, ...JSON.parse(data) } : defaults;
  } catch (e) {
    // Silent fail - return defaults
    return defaults;
  }
};

// Trial Sessions
export const saveTrialSession = (session: TrialSession): boolean => {
  if (!isLocalStorageAvailable()) return false;

  try {
    const sessions = loadTrialSessions();
    sessions.push(session);
    // Keep only last 50 sessions to avoid storage limits
    const trimmed = sessions.slice(-50);
    localStorage.setItem(STORAGE_KEYS.TRIAL_SESSIONS, JSON.stringify(trimmed));
    return true;
  } catch (e) {
    // Silent fail - return false indicates failure
    return false;
  }
};

export const loadTrialSessions = (): TrialSession[] => {
  if (!isLocalStorageAvailable()) return [];

  try {
    const data = localStorage.getItem(STORAGE_KEYS.TRIAL_SESSIONS);
    return data ? JSON.parse(data) : [];
  } catch (e) {
    // Silent fail - return empty array
    return [];
  }
};

export const getSessionsByCaseId = (caseId: string): TrialSession[] => {
  const sessions = loadTrialSessions();
  return sessions.filter(s => s.caseId === caseId);
};

export const clearTrialSessions = (): boolean => {
  if (!isLocalStorageAvailable()) return false;

  try {
    localStorage.removeItem(STORAGE_KEYS.TRIAL_SESSIONS);
    return true;
  } catch (e) {
    // Silent fail - return false indicates failure
    return false;
  }
};

// Export all data
export const exportAllData = () => {
  return {
    version: CURRENT_VERSION,
    exportDate: new Date().toISOString(),
    cases: loadCases(),
    activeCaseId: loadActiveCaseId(),
    preferences: loadPreferences(),
    trialSessions: loadTrialSessions(),
  };
};

// Import data
export const importAllData = (data: any): boolean => {
  if (!isLocalStorageAvailable()) return false;

  try {
    if (data.cases) saveCases(data.cases);
    if (data.activeCaseId) saveActiveCaseId(data.activeCaseId);
    if (data.preferences) savePreferences(data.preferences);
    if (data.trialSessions) {
      localStorage.setItem(STORAGE_KEYS.TRIAL_SESSIONS, JSON.stringify(data.trialSessions));
    }
    return true;
  } catch (e) {
    // Silent fail - return false indicates failure
    return false;
  }
};

// Clear all data
export const clearAllData = (): boolean => {
  if (!isLocalStorageAvailable()) return false;

  try {
    Object.values(STORAGE_KEYS).forEach(key => {
      localStorage.removeItem(key);
    });
    return true;
  } catch (e) {
    // Silent fail - return false indicates failure
    return false;
  }
};

// Check storage usage
export const getStorageInfo = () => {
  if (!isLocalStorageAvailable()) {
    return { used: 0, available: 0, percentage: 0 };
  }

  try {
    let used = 0;
    for (let key in localStorage) {
      if (localStorage.hasOwnProperty(key)) {
        used += localStorage[key].length + key.length;
      }
    }

    // Most browsers allow ~5-10MB, we'll estimate 5MB
    const available = 5 * 1024 * 1024;
    const percentage = (used / available) * 100;

    return {
      used: Math.round(used / 1024), // KB
      available: Math.round(available / 1024), // KB
      percentage: Math.round(percentage),
    };
  } catch (e) {
    return { used: 0, available: 0, percentage: 0 };
  }
};
