import { Case, TrialSession } from '../types';

const STORAGE_KEYS = {
  CASES: 'casebuddy_cases',
  ACTIVE_CASE_ID: 'casebuddy_active_case_id',
  THEME: 'casebuddy_theme',
  USER_PREFERENCES: 'casebuddy_preferences',
  TRIAL_SESSIONS: 'casebuddy_trial_sessions',
  VERSION: 'casebuddy_version',
  LEGACY_CASES: 'lexsim_cases',
  LEGACY_PREFERENCES: 'lexsim_preferences',
  LEGACY_TRIAL_SESSIONS: 'lexsim_trial_sessions',
};

const CURRENT_VERSION = '1.0.0';

export type OperatingMode = 'companion' | 'partner';

interface UserPreferences {
  autoSave: boolean;
  theme: 'dark' | 'light';
  displayName: string;
  title: string;
  operatingMode: OperatingMode;
}

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

const migrateData = () => {
  const storedVersion = localStorage.getItem(STORAGE_KEYS.VERSION);
  if (!storedVersion) {
    localStorage.setItem(STORAGE_KEYS.VERSION, CURRENT_VERSION);
  }
};

/**
 * Sanitize a case object to ensure all fields are safe primitives.
 * Guards against React component objects or other non-serializable values
 * being accidentally stored and causing React error #31 on render.
 */
const sanitizeCase = (c: any): Case | null => {
  if (!c || typeof c !== 'object') return null;
  const safe: any = {};
  for (const key of Object.keys(c)) {
    const val = c[key];
    // Allow primitives, null, and plain arrays/objects of primitives
    if (val === null || val === undefined) {
      safe[key] = val;
    } else if (typeof val === 'string' || typeof val === 'number' || typeof val === 'boolean') {
      safe[key] = val;
    } else if (Array.isArray(val)) {
      // Only keep arrays of primitives
      safe[key] = val.filter(v => typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean');
    } else if (typeof val === 'object' && !val.$$typeof && !val.type) {
      // Allow plain nested objects but block React elements (have $$typeof or type+props)
      safe[key] = val;
    }
    // Drop anything else (React elements, functions, class instances)
  }
  // Must have at minimum an id and title to be a valid case
  if (!safe.id || !safe.title) return null;
  return safe as Case;
};

export const saveCases = (cases: Case[]): boolean => {
  if (!isLocalStorageAvailable()) return false;
  try {
    localStorage.setItem(STORAGE_KEYS.CASES, JSON.stringify(cases));
    return true;
  } catch (e) {
    return false;
  }
};

export const loadCases = (): Case[] => {
  if (!isLocalStorageAvailable()) return [];
  try {
    migrateData();
    const data = localStorage.getItem(STORAGE_KEYS.CASES);
    if (!data) return [];
    const parsed = JSON.parse(data);
    if (!Array.isArray(parsed)) return [];
    // Sanitize every case — drop any corrupted entries
    return parsed.map(sanitizeCase).filter(Boolean) as Case[];
  } catch (e) {
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
    return false;
  }
};

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
    return false;
  }
};

export const loadActiveCaseId = (): string | null => {
  if (!isLocalStorageAvailable()) return null;
  try {
    return localStorage.getItem(STORAGE_KEYS.ACTIVE_CASE_ID);
  } catch (e) {
    return null;
  }
};

export const savePreferences = (preferences: Partial<UserPreferences>): boolean => {
  if (!isLocalStorageAvailable()) return false;
  try {
    const current = loadPreferences();
    const updated = { ...current, ...preferences };
    localStorage.setItem(STORAGE_KEYS.USER_PREFERENCES, JSON.stringify(updated));
    return true;
  } catch (e) {
    return false;
  }
};

export const loadPreferences = (): UserPreferences => {
  const defaults: UserPreferences = {
    autoSave: true,
    theme: 'dark',
    displayName: 'Attorney J. Doe',
    title: 'Senior Litigator',
    operatingMode: 'partner',
  };
  if (!isLocalStorageAvailable()) return defaults;
  try {
    const data = localStorage.getItem(STORAGE_KEYS.USER_PREFERENCES);
    return data ? { ...defaults, ...JSON.parse(data) } : defaults;
  } catch (e) {
    return defaults;
  }
};

export const saveTrialSession = (session: TrialSession): boolean => {
  if (!isLocalStorageAvailable()) return false;
  try {
    const sessions = loadTrialSessions();
    sessions.push(session);
    const trimmed = sessions.slice(-50);
    localStorage.setItem(STORAGE_KEYS.TRIAL_SESSIONS, JSON.stringify(trimmed));
    return true;
  } catch (e) {
    return false;
  }
};

export const loadTrialSessions = (): TrialSession[] => {
  if (!isLocalStorageAvailable()) return [];
  try {
    const data = localStorage.getItem(STORAGE_KEYS.TRIAL_SESSIONS);
    return data ? JSON.parse(data) : [];
  } catch (e) {
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
    return false;
  }
};

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
    return false;
  }
};

export const clearAllData = (): boolean => {
  if (!isLocalStorageAvailable()) return false;
  try {
    Object.values(STORAGE_KEYS).forEach(key => {
      localStorage.removeItem(key);
    });
    return true;
  } catch (e) {
    return false;
  }
};

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
    const available = 5 * 1024 * 1024;
    const percentage = (used / available) * 100;
    return {
      used: Math.round(used / 1024),
      available: Math.round(available / 1024),
      percentage: Math.round(percentage),
    };
  } catch (e) {
    return { used: 0, available: 0, percentage: 0 };
  }
};
