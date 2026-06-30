export type AuditActionType =
  | 'case:created' | 'case:updated' | 'case:deleted' | 'case:viewed'
  | 'document:uploaded' | 'document:downloaded' | 'document:deleted'
  | 'evidence:added' | 'evidence:removed'
  | 'invoice:created' | 'invoice:sent' | 'payment:received'
  | 'user:logged-in' | 'user:logged-out' | 'user:invited' | 'user:removed'
  | 'settings:changed' | 'theme:changed' | 'tier:changed'
  | 'pipeline:started' | 'pipeline:completed'
  | 'api:key-created' | 'api:key-revoked'
  | 'agent:action' | 'agent:insight' | 'agent:error'
  | 'export:data' | 'export:report';

export type AuditSeverity = 'info' | 'warning' | 'critical';

export interface AuditEntry {
  id: string;
  timestamp: number;
  userId: string;
  userName: string;
  action: AuditActionType;
  severity: AuditSeverity;
  resource: string;
  resourceId?: string;
  details: string;
  metadata?: Record<string, any>;
  ipAddress?: string;
}

export interface AuditFilter {
  action?: AuditActionType;
  severity?: AuditSeverity;
  userId?: string;
  resourceId?: string;
  fromDate?: number;
  toDate?: number;
  search?: string;
}

export interface AuditStats {
  totalEntries: number;
  todayEntries: number;
  thisWeekEntries: number;
  criticalEntries: number;
  byAction: { action: string; count: number }[];
  byUser: { user: string; count: number }[];
}

const STORAGE_KEY = 'casebuddy_audit_log';
const MAX_ENTRIES = 500;

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

function generateId(): string {
  return 'audit_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10);
}

function detectUser(): { userId: string; userName: string } {
  try {
    const prefsRaw = localStorage.getItem('casebuddy_preferences');
    if (prefsRaw) {
      const prefs = JSON.parse(prefsRaw);
      if (prefs.displayName) return { userId: prefs.displayName, userName: prefs.displayName };
    }
    const stored = localStorage.getItem('casebuddy_active_case_id');
    return { userId: stored ? 'user' : 'system', userName: stored ? 'User' : 'System' };
  } catch {
    return { userId: 'system', userName: 'System' };
  }
}

function loadAllEntries(): AuditEntry[] {
  if (!isLocalStorageAvailable()) return [];
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    if (!data) return [];
    const parsed = JSON.parse(data);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (e: any) =>
        typeof e === 'object' &&
        e !== null &&
        typeof e.id === 'string' &&
        typeof e.timestamp === 'number',
    );
  } catch {
    return [];
  }
}

function saveAllEntries(entries: AuditEntry[]): void {
  if (!isLocalStorageAvailable()) return;
  try {
    const trimmed = entries.slice(-MAX_ENTRIES);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
  } catch {
    // storage full or unavailable
  }
}

function matchesFilter(entry: AuditEntry, filter: AuditFilter): boolean {
  if (filter.action && entry.action !== filter.action) return false;
  if (filter.severity && entry.severity !== filter.severity) return false;
  if (filter.userId && entry.userId !== filter.userId) return false;
  if (filter.resourceId && entry.resourceId !== filter.resourceId) return false;
  if (filter.fromDate && entry.timestamp < filter.fromDate) return false;
  if (filter.toDate && entry.timestamp > filter.toDate) return false;
  if (filter.search) {
    const q = filter.search.toLowerCase();
    const haystack = [
      entry.action,
      entry.resource,
      entry.details,
      entry.userName,
      entry.severity,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    if (!haystack.includes(q)) return false;
  }
  return true;
}

export function logAction(
  action: AuditActionType,
  severity: AuditSeverity,
  resource: string,
  resourceId?: string,
  details?: string,
  metadata?: Record<string, any>,
): AuditEntry {
  const user = detectUser();
  const entry: AuditEntry = {
    id: generateId(),
    timestamp: Date.now(),
    userId: user.userId,
    userName: user.userName,
    action,
    severity,
    resource,
    resourceId,
    details: details || '',
    metadata,
  };
  const entries = loadAllEntries();
  entries.push(entry);
  saveAllEntries(entries);
  return entry;
}

export function getAuditLog(
  filter?: AuditFilter,
  limit: number = 100,
): AuditEntry[] {
  let entries = loadAllEntries();
  entries.sort((a, b) => b.timestamp - a.timestamp);
  if (filter) {
    entries = entries.filter(e => matchesFilter(e, filter));
  }
  return entries.slice(0, Math.max(0, limit));
}

function getStartOfDay(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function getStartOfWeek(): number {
  const d = new Date();
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function getAuditStats(): AuditStats {
  const entries = loadAllEntries();
  const todayStart = getStartOfDay();
  const weekStart = getStartOfWeek();
  const todayEntries = entries.filter(e => e.timestamp >= todayStart).length;
  const thisWeekEntries = entries.filter(e => e.timestamp >= weekStart).length;
  const criticalEntries = entries.filter(e => e.severity === 'critical').length;

  const actionMap = new Map<string, number>();
  const userMap = new Map<string, number>();
  for (const e of entries) {
    actionMap.set(e.action, (actionMap.get(e.action) || 0) + 1);
    userMap.set(e.userName, (userMap.get(e.userName) || 0) + 1);
  }

  const byAction = Array.from(actionMap.entries())
    .map(([action, count]) => ({ action, count }))
    .sort((a, b) => b.count - a.count);

  const byUser = Array.from(userMap.entries())
    .map(([user, count]) => ({ user, count }))
    .sort((a, b) => b.count - a.count);

  return {
    totalEntries: entries.length,
    todayEntries,
    thisWeekEntries,
    criticalEntries,
    byAction,
    byUser,
  };
}

export function searchAuditLog(query: string): AuditEntry[] {
  if (!query || query.trim() === '') return loadAllEntries().sort((a, b) => b.timestamp - a.timestamp);
  const q = query.toLowerCase();
  const entries = loadAllEntries();
  return entries
    .filter(e => {
      const haystack = [
        e.action,
        e.resource,
        e.details,
        e.userName,
        e.severity,
        e.resourceId,
        e.userId,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    })
    .sort((a, b) => b.timestamp - a.timestamp);
}

function escapeCsvField(val: string): string {
  if (!val) return '';
  const escaped = val.replace(/"/g, '""');
  return `"${escaped}"`;
}

export function exportAuditLog(format: 'csv' | 'json'): string {
  const entries = loadAllEntries().sort((a, b) => b.timestamp - a.timestamp);
  if (format === 'json') {
    return JSON.stringify(entries, null, 2);
  }
  const headers = [
    'id',
    'timestamp',
    'userId',
    'userName',
    'action',
    'severity',
    'resource',
    'resourceId',
    'details',
    'ipAddress',
    'metadata',
  ];
  const rows = entries.map(e =>
    [
      e.id,
      String(e.timestamp),
      e.userId,
      e.userName,
      e.action,
      e.severity,
      e.resource,
      e.resourceId || '',
      e.details || '',
      e.ipAddress || '',
      e.metadata ? JSON.stringify(e.metadata) : '',
    ]
      .map(escapeCsvField)
      .join(','),
  );
  return [headers.join(','), ...rows].join('\n');
}

export function clearAuditLog(): void {
  if (!isLocalStorageAvailable()) return;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

export function autoLog(
  action: AuditActionType,
  resource: string,
  details: string,
  severity?: AuditSeverity,
): void {
  try {
    logAction(action, severity || 'info', resource, undefined, details, undefined);
  } catch {
    // silently swallow — non-blocking
  }
}
