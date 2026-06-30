import type { Case } from '../types';

export interface CalendarEvent {
  id: string;
  title: string;
  description: string;
  date: string;
  time?: string;
  endDate?: string;
  endTime?: string;
  allDay: boolean;
  caseId?: string;
  caseTitle?: string;
  type: 'hearing' | 'deadline' | 'meeting' | 'deposition' | 'trial' | 'conference' | 'reminder' | 'other';
  location?: string;
  participants: string[];
  syncedToGoogle: boolean;
  syncedToOutlook: boolean;
  googleEventId?: string;
  outlookEventId?: string;
  reminders: number[];
  createdAt: number;
}

export interface CalendarSyncStatus {
  googleConnected: boolean;
  outlookConnected: boolean;
  lastSyncedAt?: string;
  pendingEvents: number;
}

export interface SyncConfig {
  provider: 'google' | 'outlook' | 'both';
  email: string;
  autoSync: boolean;
  syncFrequency: 'realtime' | 'hourly' | 'daily';
  syncDirection: 'export-only' | 'import-only' | 'bidirectional';
}

const KEYS = {
  EVENTS: 'casebuddy_calendar_events',
  SYNC: 'casebuddy_calendar_sync',
  STATUS: 'casebuddy_calendar_status',
};

const loadItems = <T>(key: string): T[] => {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const saveItems = <T>(key: string, items: T[]): void => {
  try {
    localStorage.setItem(key, JSON.stringify(items));
  } catch {
    // storage full or unavailable — silently ignore
  }
};

const loadSingle = <T>(key: string): T | null => {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
};

const saveSingle = <T>(key: string, value: T): void => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // storage full or unavailable — silently ignore
  }
};

const generateId = (prefix: string): string =>
  `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

const todayStr = (): string => new Date().toISOString().split('T')[0];

// ─── Events ─────────────────────────────────────────────────────────────────────

export const getEvents = (
  caseId?: string,
  startDate?: string,
  endDate?: string
): CalendarEvent[] => {
  let events = loadItems<CalendarEvent>(KEYS.EVENTS);
  if (caseId) {
    events = events.filter(e => e.caseId === caseId);
  }
  if (startDate) {
    events = events.filter(e => e.date >= startDate);
  }
  if (endDate) {
    events = events.filter(e => e.date <= endDate);
  }
  return events.sort((a, b) => a.date.localeCompare(b.date));
};

export const saveEvent = (event: CalendarEvent): void => {
  const events = loadItems<CalendarEvent>(KEYS.EVENTS);
  if (!event.id) {
    event.id = generateId('evt');
  }
  if (!event.createdAt) {
    event.createdAt = Date.now();
  }
  if (!event.reminders) {
    event.reminders = [];
  }
  if (!event.participants) {
    event.participants = [];
  }
  const idx = events.findIndex(e => e.id === event.id);
  if (idx >= 0) {
    events[idx] = event;
  } else {
    events.push(event);
  }
  saveItems(KEYS.EVENTS, events);
};

export const deleteEvent = (id: string): void => {
  const events = loadItems<CalendarEvent>(KEYS.EVENTS).filter(e => e.id !== id);
  saveItems(KEYS.EVENTS, events);
};

export const getEventsForDate = (date: string): CalendarEvent[] => {
  if (!date) return [];
  return loadItems<CalendarEvent>(KEYS.EVENTS)
    .filter(e => e.date === date)
    .sort((a, b) => (a.time || '').localeCompare(b.time || ''));
};

export const getUpcomingEvents = (days: number = 7): CalendarEvent[] => {
  const today = todayStr();
  const future = new Date();
  future.setDate(future.getDate() + days);
  const endStr = future.toISOString().split('T')[0];
  return loadItems<CalendarEvent>(KEYS.EVENTS)
    .filter(e => e.date >= today && e.date <= endStr)
    .sort((a, b) => a.date.localeCompare(b.date) || (a.time || '').localeCompare(b.time || ''));
};

export const getTodayEvents = (): CalendarEvent[] =>
  getEventsForDate(todayStr());

// ─── Import from Cases ──────────────────────────────────────────────────────────

const caseStatusToEventType = (status: string): CalendarEvent['type'] => {
  switch (status) {
    case 'Pre-Trial': return 'hearing';
    case 'Discovery': return 'deadline';
    case 'Trial': return 'trial';
    case 'Appeal': return 'hearing';
    default: return 'other';
  }
};

export const importCaseDeadlines = (caseData: Case): CalendarEvent[] => {
  if (!caseData) return [];
  const created: CalendarEvent[] = [];
  const now = Date.now();

  if (caseData.nextCourtDate) {
    const hearing: CalendarEvent = {
      id: generateId('evt'),
      title: `${caseData.title} — Court Hearing`,
      description: `Scheduled court appearance for ${caseData.title}. Judge: ${caseData.judge || 'TBD'}. Opposing counsel: ${caseData.opposingCounsel || 'TBD'}.`,
      date: caseData.nextCourtDate.split('T')[0],
      time: '09:00',
      allDay: false,
      caseId: caseData.id,
      caseTitle: caseData.title,
      type: caseStatusToEventType(caseData.status),
      participants: [caseData.opposingCounsel, caseData.judge].filter(Boolean),
      syncedToGoogle: false,
      syncedToOutlook: false,
      reminders: [60, 1440],
      createdAt: now,
    };
    saveEvent(hearing);
    created.push(hearing);
  }

  const deadlineTitles: Record<string, string> = {
    'Pre-Trial': 'Pre-Trial Motions Deadline',
    'Discovery': 'Discovery Cutoff',
    'Trial': 'Trial Preparation Deadline',
    'Appeal': 'Appeal Brief Due',
  };

  const title = deadlineTitles[caseData.status];
  if (title && caseData.nextCourtDate) {
    const deadlineDate = new Date(caseData.nextCourtDate);
    deadlineDate.setDate(deadlineDate.getDate() - 7);
    const deadline: CalendarEvent = {
      id: generateId('evt'),
      title: `${caseData.title} — ${title}`,
      description: `Upcoming deadline for ${title.toLowerCase()} in ${caseData.title}.`,
      date: deadlineDate.toISOString().split('T')[0],
      allDay: true,
      caseId: caseData.id,
      caseTitle: caseData.title,
      type: 'deadline',
      participants: [],
      syncedToGoogle: false,
      syncedToOutlook: false,
      reminders: [1440, 4320],
      createdAt: now,
    };
    saveEvent(deadline);
    created.push(deadline);
  }

  return created;
};

// ─── Sync ───────────────────────────────────────────────────────────────────────

export const getSyncConfig = (): SyncConfig | null =>
  loadSingle<SyncConfig>(KEYS.SYNC);

export const saveSyncConfig = (config: SyncConfig): void => {
  saveSingle(KEYS.SYNC, config);
};

export const getSyncStatus = (): CalendarSyncStatus => {
  const events = loadItems<CalendarEvent>(KEYS.EVENTS);
  const unsynced = events.filter(e => !e.syncedToGoogle && !e.syncedToOutlook);
  const saved = loadSingle<CalendarSyncStatus>(KEYS.STATUS);
  return {
    googleConnected: saved?.googleConnected ?? false,
    outlookConnected: saved?.outlookConnected ?? false,
    lastSyncedAt: saved?.lastSyncedAt,
    pendingEvents: unsynced.length,
  };
};

export const simulateSync = (): CalendarSyncStatus => {
  const events = loadItems<CalendarEvent>(KEYS.EVENTS);
  const config = getSyncConfig();

  const shouldSyncGoogle = !config || config.provider === 'google' || config.provider === 'both';
  const shouldSyncOutlook = !config || config.provider === 'outlook' || config.provider === 'both';

  events.forEach(e => {
    if (shouldSyncGoogle && !e.syncedToGoogle) {
      e.syncedToGoogle = true;
      e.googleEventId = `g_${e.id}`;
    }
    if (shouldSyncOutlook && !e.syncedToOutlook) {
      e.syncedToOutlook = true;
      e.outlookEventId = `o_${e.id}`;
    }
  });

  saveItems(KEYS.EVENTS, events);

  const status: CalendarSyncStatus = {
    googleConnected: true,
    outlookConnected: true,
    lastSyncedAt: new Date().toISOString(),
    pendingEvents: 0,
  };
  saveSingle(KEYS.STATUS, status);
  return status;
};

// ─── iCal Export ────────────────────────────────────────────────────────────────

const pad = (n: number): string => String(n).padStart(2, '0');

const toICalDate = (dateStr: string): string => {
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr.replace(/-/g, '');
  return `${parts[0]}${pad(Number(parts[1]))}${pad(Number(parts[2]))}`;
};

const toICalTime = (timeStr: string): string => {
  if (!timeStr) return '000000';
  const clean = timeStr.replace(/:/g, '');
  return clean.padEnd(6, '0');
};

const escapeICal = (text: string): string => {
  if (!text) return '';
  return text
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');
};

export const generateICalFeed = (events: CalendarEvent[]): string => {
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//CaseBuddy//Calendar//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
  ];

  const safeEvents = events || [];

  for (const event of safeEvents) {
    const uid = event.id || generateId('evt');
    const dtStart = `${toICalDate(event.date)}T${event.allDay ? '000000' : toICalTime(event.time || '090000')}`;
    let dtEnd = dtStart;
    if (event.allDay) {
      const endDate = event.endDate || event.date;
      dtEnd = `${toICalDate(endDate)}T000000`;
    } else if (event.endTime) {
      dtEnd = `${toICalDate(event.endDate || event.date)}T${toICalTime(event.endTime)}`;
    }

    lines.push(
      'BEGIN:VEVENT',
      `UID:${uid}@casebuddy`,
      `DTSTAMP:${toICalDate(new Date().toISOString().split('T')[0])}T${toICalTime(new Date().toISOString().split('T')[1]?.slice(0, 5) || '000000')}`,
      `DTSTART${event.allDay ? ';VALUE=DATE' : ''}:${event.allDay ? toICalDate(event.date) : dtStart}`,
      `DTEND${event.allDay ? ';VALUE=DATE' : ''}:${event.allDay ? toICalDate(event.endDate || event.date) : dtEnd}`,
      `SUMMARY:${escapeICal(event.title || 'Untitled Event')}`,
    );

    if (event.description) {
      lines.push(`DESCRIPTION:${escapeICal(event.description)}`);
    }
    if (event.location) {
      lines.push(`LOCATION:${escapeICal(event.location)}`);
    }
    if (event.caseTitle) {
      lines.push(`CATEGORIES:${escapeICal(event.caseTitle)}`);
    }
    if (event.reminders && event.reminders.length > 0) {
      lines.push('BEGIN:VALARM');
      lines.push('ACTION:DISPLAY');
      lines.push(`DESCRIPTION:Reminder: ${escapeICal(event.title || 'Event')}`);
      const earliestReminder = Math.max(...event.reminders.map(r => r * 60 * -1));
      lines.push(`TRIGGER:${earliestReminder > 0 ? '' : '-'}PT${Math.abs(Math.floor(earliestReminder / 60))}M`);
      lines.push('END:VALARM');
    }

    lines.push('END:VEVENT');
  }

  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
};
