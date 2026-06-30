import React, { useState, useEffect, useMemo } from 'react';
import {
  Calendar, Clock, Plus, Trash2, ChevronLeft, ChevronRight,
  MapPin, Users, Bell, Globe, RefreshCw, Download, Copy,
  Loader2, CheckCircle2, AlertTriangle, Zap, Filter, X
} from 'lucide-react';
import {
  getEvents, saveEvent, deleteEvent, getEventsForDate,
  getUpcomingEvents, getTodayEvents, importCaseDeadlines,
  getSyncConfig, saveSyncConfig, getSyncStatus, simulateSync,
  generateICalFeed,
  type CalendarEvent, type CalendarSyncStatus, type SyncConfig
} from '../services/calendarService';
import { AppContext } from '../App';

const TYPE_COLORS: Record<CalendarEvent['type'], string> = {
  hearing: 'bg-red-500',
  deadline: 'bg-amber-500',
  meeting: 'bg-blue-500',
  deposition: 'bg-purple-500',
  trial: 'bg-gold-500',
  conference: 'bg-green-500',
  reminder: 'bg-gray-400',
  other: 'bg-slate-500',
};

const TYPE_LABELS: Record<CalendarEvent['type'], string> = {
  hearing: 'Hearing',
  deadline: 'Deadline',
  meeting: 'Meeting',
  deposition: 'Deposition',
  trial: 'Trial',
  conference: 'Conference',
  reminder: 'Reminder',
  other: 'Other',
};

const TYPE_ICONS: Record<CalendarEvent['type'], React.ReactNode> = {
  hearing: <Zap size={14} className="text-red-400" />,
  deadline: <AlertTriangle size={14} className="text-amber-400" />,
  meeting: <Users size={14} className="text-blue-400" />,
  deposition: <Calendar size={14} className="text-purple-400" />,
  trial: <Zap size={14} className="text-gold-400" />,
  conference: <Globe size={14} className="text-green-400" />,
  reminder: <Bell size={14} className="text-gray-400" />,
  other: <Clock size={14} className="text-slate-400" />,
};

const DAYS_OF_WEEK = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const getDaysInMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate();
const getFirstDayOfMonth = (year: number, month: number) => new Date(year, month, 1).getDay();
const todayStr = () => new Date().toISOString().split('T')[0];
const formatDate = (d: Date) => d.toISOString().split('T')[0];
const formatTime = (t?: string) => {
  if (!t) return '';
  const [h, m] = t.split(':');
  const hr = parseInt(h);
  const ampm = hr >= 12 ? 'PM' : 'AM';
  const h12 = hr % 12 || 12;
  return `${h12}:${m} ${ampm}`;
};
const daysBetween = (a: string, b: string) => {
  const d1 = new Date(a);
  const d2 = new Date(b);
  d1.setHours(0, 0, 0, 0);
  d2.setHours(0, 0, 0, 0);
  return Math.round((d1.getTime() - d2.getTime()) / 86_400_000);
};

const EMPTY_FORM = {
  title: '',
  description: '',
  date: '',
  time: '',
  endDate: '',
  endTime: '',
  allDay: false,
  caseId: '',
  type: 'hearing' as CalendarEvent['type'],
  location: '',
  participants: '',
  reminders: [] as number[],
};

type FormState = typeof EMPTY_FORM;

const CalendarView: React.FC = () => {
  const { cases } = React.useContext(AppContext);

  const [view, setView] = useState<'calendar' | 'sync'>('calendar');
  const [currentMonth, setCurrentMonth] = useState(() => new Date());
  const [selectedDate, setSelectedDate] = useState<string | null>(todayStr());
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);
  const [form, setForm] = useState<FormState>({ ...EMPTY_FORM, date: todayStr() });
  const [syncStatus, setSyncStatus] = useState<CalendarSyncStatus>(getSyncStatus());
  const [syncConfig, setSyncConfig] = useState<SyncConfig>(getSyncConfig() || {
    provider: 'both',
    email: '',
    autoSync: false,
    syncFrequency: 'daily',
    syncDirection: 'bidirectional',
  });
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncingProvider, setSyncingProvider] = useState<'google' | 'outlook' | null>(null);
  const [importCasesExpanded, setImportCasesExpanded] = useState(false);
  const [importSelectedCases, setImportSelectedCases] = useState<Set<string>>(new Set());
  const [icalCopied, setIcalCopied] = useState(false);

  const loadEvents = () => setEvents(getEvents());

  useEffect(() => { loadEvents(); }, []);

  useEffect(() => {
    if (showModal && form.date) return;
    setForm(prev => ({ ...prev, date: selectedDate || todayStr() }));
  }, [selectedDate, showModal]);

  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();
  const daysInMonth = getDaysInMonth(year, month);
  const firstDay = getFirstDayOfMonth(year, month);
  const todayStrVal = todayStr();

  const eventsByDate = useMemo(() => {
    const map: Record<string, CalendarEvent[]> = {};
    for (const e of events) {
      if (!map[e.date]) map[e.date] = [];
      map[e.date].push(e);
    }
    return map;
  }, [events]);

  const selectedDateEvents = useMemo(() => {
    if (!selectedDate) return [];
    return getEventsForDate(selectedDate);
  }, [selectedDate, events]);

  const upcomingThisWeek = useMemo(() => getUpcomingEvents(7), [events]);
  const overdueEvents = useMemo(() => {
    return events.filter(e => e.date < todayStrVal).sort((a, b) => a.date.localeCompare(b.date));
  }, [events]);

  const navigateMonth = (delta: number) => {
    setCurrentMonth(prev => new Date(prev.getFullYear(), prev.getMonth() + delta, 1));
  };

  const goToToday = () => {
    setCurrentMonth(new Date());
    setSelectedDate(todayStrVal);
  };

  const handleDayClick = (date: string) => setSelectedDate(date);

  const handleDeleteEvent = (id: string) => {
    deleteEvent(id);
    loadEvents();
  };

  const handleEditEvent = (event: CalendarEvent) => {
    setEditingEvent(event);
    setForm({
      title: event.title,
      description: event.description,
      date: event.date,
      time: event.time || '',
      endDate: event.endDate || '',
      endTime: event.endTime || '',
      allDay: event.allDay,
      caseId: event.caseId || '',
      type: event.type,
      location: event.location || '',
      participants: event.participants.join(', '),
      reminders: event.reminders,
    });
    setShowModal(true);
  };

  const handleAddEvent = (date?: string) => {
    setEditingEvent(null);
    setForm({ ...EMPTY_FORM, date: date || selectedDate || todayStrVal });
    setShowModal(true);
  };

  const handleSaveEvent = () => {
    if (!form.title.trim() || !form.date) return;
    const participants = form.participants
      ? form.participants.split(',').map(p => p.trim()).filter(Boolean)
      : [];
    const selectedCase = cases.find(c => c.id === form.caseId);

    const event: CalendarEvent = {
      id: editingEvent?.id || '',
      title: form.title.trim(),
      description: form.description.trim(),
      date: form.date,
      time: form.allDay ? undefined : (form.time || undefined),
      endDate: form.endDate || undefined,
      endTime: form.allDay ? undefined : (form.endTime || undefined),
      allDay: form.allDay,
      caseId: form.caseId || undefined,
      caseTitle: selectedCase?.title,
      type: form.type,
      location: form.location.trim() || undefined,
      participants,
      syncedToGoogle: editingEvent?.syncedToGoogle ?? false,
      syncedToOutlook: editingEvent?.syncedToOutlook ?? false,
      googleEventId: editingEvent?.googleEventId,
      outlookEventId: editingEvent?.outlookEventId,
      reminders: form.reminders,
      createdAt: editingEvent?.createdAt || Date.now(),
    };

    saveEvent(event);
    setShowModal(false);
    setEditingEvent(null);
    loadEvents();
  };

  const handleSyncNow = async () => {
    setIsSyncing(true);
    await simulateSync();
    setSyncStatus(getSyncStatus());
    setIsSyncing(false);
    loadEvents();
  };

  const handleConnectProvider = (provider: 'google' | 'outlook') => {
    setSyncingProvider(provider);
    setTimeout(() => {
      const updated = { ...syncStatus };
      if (provider === 'google') updated.googleConnected = true;
      else updated.outlookConnected = true;
      updated.lastSyncedAt = new Date().toISOString();
      setSyncStatus(updated);
      setSyncingProvider(null);
      const newConfig = { ...syncConfig, provider: syncConfig.provider === 'both' ? 'both' : provider };
      setSyncConfig(newConfig);
      saveSyncConfig(newConfig);
    }, 1500);
  };

  const handleSaveSyncConfig = () => {
    saveSyncConfig(syncConfig);
  };

  const handleExportICal = () => {
    const ical = generateICalFeed(events);
    navigator.clipboard.writeText(ical).then(() => {
      setIcalCopied(true);
      setTimeout(() => setIcalCopied(false), 3000);
    }).catch(() => {});
  };

  const handleDownloadICal = () => {
    const ical = generateICalFeed(events);
    const blob = new Blob([ical], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'casebuddy-calendar.ics';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportCaseDeadlines = (caseData: any) => {
    importCaseDeadlines(caseData);
    loadEvents();
  };

  const handleImportSelected = () => {
    cases.filter(c => importSelectedCases.has(c.id)).forEach(handleImportCaseDeadlines);
    setImportSelectedCases(new Set());
  };

  const toggleReminder = (minutes: number) => {
    setForm(prev => {
      const has = prev.reminders.includes(minutes);
      return {
        ...prev,
        reminders: has
          ? prev.reminders.filter(r => r !== minutes)
          : [...prev.reminders, minutes],
      };
    });
  };

  const renderCalendarGrid = () => {
    const cells: React.ReactNode[] = [];
    const dayCount = firstDay + daysInMonth;
    const rows = Math.ceil(dayCount / 7);

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < 7; c++) {
        const idx = r * 7 + c;
        const dayNumber = idx - firstDay + 1;
        const isValid = dayNumber >= 1 && dayNumber <= daysInMonth;
        const dateStr = isValid
          ? `${year}-${String(month + 1).padStart(2, '0')}-${String(dayNumber).padStart(2, '0')}`
          : '';
        const isToday = isValid && dateStr === todayStrVal;
        const isSelected = isValid && dateStr === selectedDate;
        const dayEvents = isValid ? (eventsByDate[dateStr] || []) : [];
        const hasEvents = dayEvents.length > 0;

        cells.push(
          <div
            key={idx}
            onClick={() => isValid && handleDayClick(dateStr)}
            className={`
              relative min-h-[80px] p-1.5 border border-slate-700/50 cursor-pointer
              transition-colors duration-150
              ${isValid ? 'hover:bg-slate-800/50' : 'bg-slate-900/50'}
              ${isSelected ? 'ring-1 ring-gold-500/40 bg-slate-800/30' : ''}
              ${isToday ? 'bg-gold-500/10 border-gold-500/50' : ''}
            `}
          >
            {isValid && (
              <>
                <span className={`
                  inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-medium
                  ${isToday ? 'bg-gold-500 text-slate-900 font-bold' : 'text-slate-300'}
                `}>
                  {dayNumber}
                </span>
                {hasEvents && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {dayEvents.slice(0, 3).map((e) => (
                      <div
                        key={e.id}
                        className={`w-2 h-2 rounded-full ${TYPE_COLORS[e.type]}`}
                        title={e.title}
                      />
                    ))}
                    {dayEvents.length > 3 && (
                      <span className="text-[10px] text-slate-500 leading-none">
                        +{dayEvents.length - 3}
                      </span>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        );
      }
    }

    return cells;
  };

  const renderDayDetail = () => {
    if (!selectedDate) return null;
    const selected = new Date(selectedDate + 'T00:00:00');
    const dayName = selected.toLocaleDateString('en-US', { weekday: 'long' });
    const monthDay = selected.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

    return (
      <div className="lg:sticky lg:top-4">
        <div className="bg-slate-900 border border-slate-700/50 rounded-xl p-4">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-lg font-semibold text-white">{dayName}</h3>
              <p className="text-sm text-slate-400">{monthDay}</p>
            </div>
            <button
              onClick={() => handleAddEvent(selectedDate)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gold-500 text-slate-900
                         text-sm font-medium hover:bg-gold-400 transition-all"
            >
              <Plus size={14} />
              Add
            </button>
          </div>

          {selectedDateEvents.length === 0 ? (
            <p className="text-sm text-slate-500 py-4 text-center">No events for this day</p>
          ) : (
            <div className="space-y-2">
              {selectedDateEvents.map(event => (
                <div
                  key={event.id}
                  className="bg-slate-800/50 border border-slate-700/30 rounded-lg p-3
                             hover:border-slate-600/40 transition-colors"
                >
                  <div className="flex items-start gap-2.5">
                    <div className="mt-0.5 shrink-0">{TYPE_ICONS[event.type]}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <h4 className="text-sm font-medium text-white truncate">{event.title}</h4>
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            onClick={() => handleEditEvent(event)}
                            className="p-1 text-slate-500 hover:text-gold-400 transition-colors"
                            title="Edit"
                          >
                            <Calendar size={13} />
                          </button>
                          <button
                            onClick={() => handleDeleteEvent(event.id)}
                            className="p-1 text-slate-500 hover:text-red-400 transition-colors"
                            title="Delete"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>
                      {!event.allDay && event.time && (
                        <p className="text-xs text-slate-400 mt-0.5">{formatTime(event.time)}</p>
                      )}
                      {event.caseTitle && (
                        <p className="text-xs text-gold-400/80 mt-0.5 truncate">{event.caseTitle}</p>
                      )}
                      <div className="flex items-center gap-2 mt-1.5 text-xs text-slate-500">
                        <span className="px-1.5 py-0.5 rounded-full bg-slate-700/50 border border-slate-600/30 text-[10px]">
                          {TYPE_LABELS[event.type]}
                        </span>
                        {event.location && (
                          <span className="flex items-center gap-1">
                            <MapPin size={10} /> {event.location}
                          </span>
                        )}
                        {event.participants.length > 0 && (
                          <span className="flex items-center gap-1">
                            <Users size={10} /> {event.participants.length}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderUpcomingSidebar = () => (
    <div className="space-y-4">
      <div className="bg-slate-900 border border-slate-700/50 rounded-xl p-4">
        <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
          <Bell size={14} className="text-gold-400" />
          This Week
        </h3>
        {upcomingThisWeek.length === 0 ? (
          <p className="text-xs text-slate-500">No upcoming events</p>
        ) : (
          <div className="space-y-2">
            {upcomingThisWeek.map(event => (
              <div key={event.id} className="flex items-start gap-2 text-xs">
                <div className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${TYPE_COLORS[event.type]}`} />
                <div className="min-w-0">
                  <p className="text-slate-300 truncate">{event.title}</p>
                  <p className="text-slate-500">
                    {new Date(event.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    {!event.allDay && event.time ? ` · ${formatTime(event.time)}` : ''}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="bg-slate-900 border border-red-500/10 rounded-xl p-4">
        <h3 className="text-sm font-semibold text-red-400 mb-3 flex items-center gap-2">
          <AlertTriangle size={14} />
          Overdue
        </h3>
        {overdueEvents.length === 0 ? (
          <p className="text-xs text-slate-500">No overdue events</p>
        ) : (
          <div className="space-y-2">
            {overdueEvents.slice(0, 10).map(event => {
              const overdueBy = Math.abs(daysBetween(event.date, todayStrVal));
              return (
                <div key={event.id} className="flex items-start gap-2 text-xs">
                  <div className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${TYPE_COLORS[event.type]}`} />
                  <div className="min-w-0">
                    <p className="text-slate-300 truncate">{event.title}</p>
                    <p className="text-red-400/70">
                      {overdueBy === 0 ? 'Today' : `${overdueBy}d overdue`}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );

  const renderEventModal = () => {
    if (!showModal) return null;
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-black/60" onClick={() => { setShowModal(false); setEditingEvent(null); }} />
        <div className="relative bg-slate-900 border border-slate-700/50 rounded-xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-6 shadow-2xl">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-lg font-semibold text-white">
              {editingEvent ? 'Edit Event' : 'Add Event'}
            </h2>
            <button
              onClick={() => { setShowModal(false); setEditingEvent(null); }}
              className="p-1 text-slate-500 hover:text-slate-300 transition-colors"
            >
              <X size={20} />
            </button>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Title</label>
              <input
                type="text"
                value={form.title}
                onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                placeholder="Event title"
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white
                           placeholder-slate-500 focus:border-gold-500/50 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Description</label>
              <textarea
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                placeholder="Event description"
                rows={2}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white
                           placeholder-slate-500 focus:border-gold-500/50 focus:outline-none resize-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Date</label>
                <input
                  type="date"
                  value={form.date}
                  onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white
                             focus:border-gold-500/50 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">End Date</label>
                <input
                  type="date"
                  value={form.endDate}
                  onChange={e => setForm(f => ({ ...f, endDate: e.target.value }))}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white
                             focus:border-gold-500/50 focus:outline-none"
                />
              </div>
            </div>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={form.allDay}
                onChange={e => setForm(f => ({ ...f, allDay: e.target.checked }))}
                className="rounded bg-slate-800 border-slate-600 text-gold-500 focus:ring-gold-500/50"
              />
              <span className="text-sm text-slate-300">All Day</span>
            </label>

            {!form.allDay && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Start Time</label>
                  <input
                    type="time"
                    value={form.time}
                    onChange={e => setForm(f => ({ ...f, time: e.target.value }))}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white
                               focus:border-gold-500/50 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">End Time</label>
                  <input
                    type="time"
                    value={form.endTime}
                    onChange={e => setForm(f => ({ ...f, endTime: e.target.value }))}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white
                               focus:border-gold-500/50 focus:outline-none"
                  />
                </div>
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Type</label>
              <select
                value={form.type}
                onChange={e => setForm(f => ({ ...f, type: e.target.value as CalendarEvent['type'] }))}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white
                           focus:border-gold-500/50 focus:outline-none"
              >
                {Object.entries(TYPE_LABELS).map(([key, label]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Case</label>
              <select
                value={form.caseId}
                onChange={e => setForm(f => ({ ...f, caseId: e.target.value }))}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white
                           focus:border-gold-500/50 focus:outline-none"
              >
                <option value="">None</option>
                {cases.map(c => (
                  <option key={c.id} value={c.id}>{c.title}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Location</label>
              <input
                type="text"
                value={form.location}
                onChange={e => setForm(f => ({ ...f, location: e.target.value }))}
                placeholder="Courtroom, Office, etc."
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white
                           placeholder-slate-500 focus:border-gold-500/50 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Participants</label>
              <input
                type="text"
                value={form.participants}
                onChange={e => setForm(f => ({ ...f, participants: e.target.value }))}
                placeholder="Comma-separated names"
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white
                           placeholder-slate-500 focus:border-gold-500/50 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-400 mb-2">Reminders</label>
              <div className="flex flex-wrap gap-2">
                {[
                  { label: '15 min', value: 15 },
                  { label: '1 hour', value: 60 },
                  { label: '1 day', value: 1440 },
                  { label: '1 week', value: 10080 },
                ].map(r => (
                  <label key={r.value} className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.reminders.includes(r.value)}
                      onChange={() => toggleReminder(r.value)}
                      className="rounded bg-slate-800 border-slate-600 text-gold-500 focus:ring-gold-500/50"
                    />
                    <span className="text-xs text-slate-400">{r.label}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 mt-6 pt-4 border-t border-slate-800">
            <button
              onClick={() => { setShowModal(false); setEditingEvent(null); }}
              className="px-4 py-2 text-sm text-slate-400 hover:text-white transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSaveEvent}
              disabled={!form.title.trim() || !form.date}
              className="px-4 py-2 bg-gold-500 text-slate-900 rounded-lg text-sm font-medium
                         hover:bg-gold-400 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {editingEvent ? 'Update' : 'Save'} Event
            </button>
          </div>
        </div>
      </div>
    );
  };

  const renderSyncSettings = () => (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-slate-900 border border-slate-700/50 rounded-xl p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-white">Google Calendar</h3>
            <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${
              syncStatus.googleConnected
                ? 'bg-green-500/10 border-green-500/30 text-green-400'
                : 'bg-slate-800 border-slate-700 text-slate-500'
            }`}>
              {syncStatus.googleConnected ? 'Connected' : 'Disconnected'}
            </span>
          </div>
          <p className="text-xs text-slate-500 mb-3">{syncConfig.email || 'No email configured'}</p>
          <p className="text-xs text-slate-600 mb-4">
            Last synced: {syncStatus.lastSyncedAt
              ? new Date(syncStatus.lastSyncedAt).toLocaleString()
              : 'Never'}
          </p>
          {!syncStatus.googleConnected ? (
            <button
              onClick={() => handleConnectProvider('google')}
              disabled={syncingProvider === 'google'}
              className="flex items-center gap-2 px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg
                         text-xs text-white hover:border-slate-600 transition-all disabled:opacity-50"
            >
              {syncingProvider === 'google' ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                <Globe size={12} />
              )}
              Connect Google
            </button>
          ) : (
            <p className="text-xs text-green-400/70 flex items-center gap-1">
              <CheckCircle2 size={12} /> Calendar synced
            </p>
          )}
        </div>

        <div className="bg-slate-900 border border-slate-700/50 rounded-xl p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-white">Outlook Calendar</h3>
            <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${
              syncStatus.outlookConnected
                ? 'bg-green-500/10 border-green-500/30 text-green-400'
                : 'bg-slate-800 border-slate-700 text-slate-500'
            }`}>
              {syncStatus.outlookConnected ? 'Connected' : 'Disconnected'}
            </span>
          </div>
          <p className="text-xs text-slate-500 mb-3">{syncConfig.email || 'No email configured'}</p>
          <p className="text-xs text-slate-600 mb-4">
            Last synced: {syncStatus.lastSyncedAt
              ? new Date(syncStatus.lastSyncedAt).toLocaleString()
              : 'Never'}
          </p>
          {!syncStatus.outlookConnected ? (
            <button
              onClick={() => handleConnectProvider('outlook')}
              disabled={syncingProvider === 'outlook'}
              className="flex items-center gap-2 px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg
                         text-xs text-white hover:border-slate-600 transition-all disabled:opacity-50"
            >
              {syncingProvider === 'outlook' ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                <Globe size={12} />
              )}
              Connect Outlook
            </button>
          ) : (
            <p className="text-xs text-green-400/70 flex items-center gap-1">
              <CheckCircle2 size={12} /> Calendar synced
            </p>
          )}
        </div>
      </div>

      <div className="bg-slate-900 border border-slate-700/50 rounded-xl p-5">
        <h3 className="text-sm font-semibold text-white mb-4">Sync Configuration</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">Provider</label>
            <select
              value={syncConfig.provider}
              onChange={e => setSyncConfig(prev => ({ ...prev, provider: e.target.value as SyncConfig['provider'] }))}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white
                         focus:border-gold-500/50 focus:outline-none"
            >
              <option value="google">Google</option>
              <option value="outlook">Outlook</option>
              <option value="both">Both</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">Email</label>
            <input
              type="email"
              value={syncConfig.email}
              onChange={e => setSyncConfig(prev => ({ ...prev, email: e.target.value }))}
              placeholder="your@email.com"
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white
                         placeholder-slate-500 focus:border-gold-500/50 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">Sync Direction</label>
            <select
              value={syncConfig.syncDirection}
              onChange={e => setSyncConfig(prev => ({ ...prev, syncDirection: e.target.value as SyncConfig['syncDirection'] }))}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white
                         focus:border-gold-500/50 focus:outline-none"
            >
              <option value="bidirectional">Bidirectional</option>
              <option value="export-only">Export Only</option>
              <option value="import-only">Import Only</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">Sync Frequency</label>
            <select
              value={syncConfig.syncFrequency}
              onChange={e => setSyncConfig(prev => ({ ...prev, syncFrequency: e.target.value as SyncConfig['syncFrequency'] }))}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white
                         focus:border-gold-500/50 focus:outline-none"
            >
              <option value="realtime">Realtime</option>
              <option value="hourly">Hourly</option>
              <option value="daily">Daily</option>
            </select>
          </div>
        </div>
        <div className="flex items-center gap-4 mt-4">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={syncConfig.autoSync}
              onChange={e => setSyncConfig(prev => ({ ...prev, autoSync: e.target.checked }))}
              className="rounded bg-slate-800 border-slate-600 text-gold-500 focus:ring-gold-500/50"
            />
            <span className="text-sm text-slate-300">Auto-Sync</span>
          </label>
          <button
            onClick={handleSaveSyncConfig}
            className="px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-xs text-white
                       hover:border-slate-600 transition-all"
          >
            Save Config
          </button>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={handleSyncNow}
          disabled={isSyncing || (!syncStatus.googleConnected && !syncStatus.outlookConnected)}
          className="flex items-center gap-2 px-4 py-2 bg-gold-500 text-slate-900 rounded-lg text-sm font-medium
                     hover:bg-gold-400 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {isSyncing ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
          Sync Now
        </button>
        {syncStatus.pendingEvents > 0 && (
          <span className="text-xs text-amber-400">
            {syncStatus.pendingEvents} event{syncStatus.pendingEvents !== 1 ? 's' : ''} pending
          </span>
        )}
      </div>

      <div className="bg-slate-900 border border-slate-700/50 rounded-xl p-5">
        <h3 className="text-sm font-semibold text-white mb-4">iCal Export</h3>
        <p className="text-xs text-slate-400 mb-4">
          Export your calendar to subscribe from Google Calendar or Outlook.
          Paste the iCal feed URL or download the .ics file.
        </p>
        <div className="flex items-center gap-3">
          <button
            onClick={handleExportICal}
            className="flex items-center gap-2 px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg
                       text-xs text-white hover:border-slate-600 transition-all"
          >
            {icalCopied ? (
              <><CheckCircle2 size={14} className="text-green-400" /> Copied</>
            ) : (
              <><Copy size={14} /> Copy iCal to Clipboard</>
            )}
          </button>
          <button
            onClick={handleDownloadICal}
            className="flex items-center gap-2 px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg
                       text-xs text-white hover:border-slate-600 transition-all"
          >
            <Download size={14} />
            Download .ics
          </button>
        </div>
        {icalCopied && (
          <p className="text-xs text-green-400 mt-3">
            iCal data copied! Paste this URL into Google Calendar {'>'} Other Calendars {'>'} From URL.
          </p>
        )}
      </div>

      <div className="bg-slate-900 border border-slate-700/50 rounded-xl p-5">
        <button
          onClick={() => setImportCasesExpanded(!importCasesExpanded)}
          className="flex items-center justify-between w-full text-left"
        >
          <h3 className="text-sm font-semibold text-white flex items-center gap-2">
            <Download size={14} className="text-gold-400" />
            Import Case Deadlines
          </h3>
          <span className="text-xs text-slate-500">{cases.length} cases available</span>
        </button>
        {importCasesExpanded && (
          <div className="mt-4 space-y-3">
            {cases.length === 0 ? (
              <p className="text-xs text-slate-500">No cases found</p>
            ) : (
              <>
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {cases.map(c => (
                    <label key={c.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-slate-800/50 transition-colors cursor-pointer">
                      <input
                        type="checkbox"
                        checked={importSelectedCases.has(c.id)}
                        onChange={() => {
                          setImportSelectedCases(prev => {
                            const next = new Set(prev);
                            next.has(c.id) ? next.delete(c.id) : next.add(c.id);
                            return next;
                          });
                        }}
                        className="rounded bg-slate-800 border-slate-600 text-gold-500 focus:ring-gold-500/50"
                      />
                      <div>
                        <p className="text-sm text-slate-300">{c.title}</p>
                        <p className="text-xs text-slate-500">
                          {c.status}{c.nextCourtDate ? ` · Next: ${c.nextCourtDate.split('T')[0]}` : ''}
                        </p>
                      </div>
                    </label>
                  ))}
                </div>
                <button
                  onClick={handleImportSelected}
                  disabled={importSelectedCases.size === 0}
                  className="flex items-center gap-2 px-4 py-2 bg-gold-500 text-slate-900 rounded-lg text-sm font-medium
                             hover:bg-gold-400 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Download size={14} />
                  Import Selected ({importSelectedCases.size})
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-serif font-bold text-white">Legal Calendar</h1>
          <div className="flex items-center bg-slate-900 border border-slate-700/50 rounded-lg overflow-hidden">
            <button
              onClick={() => setView('calendar')}
              className={`px-3 py-1.5 text-xs font-medium transition-all ${
                view === 'calendar'
                  ? 'bg-gold-500 text-slate-900'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Calendar
            </button>
            <button
              onClick={() => setView('sync')}
              className={`px-3 py-1.5 text-xs font-medium transition-all ${
                view === 'sync'
                  ? 'bg-gold-500 text-slate-900'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Sync
            </button>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => { setView('calendar'); handleAddEvent(); }}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-gold-500 text-slate-900 rounded-lg text-sm font-medium
                       hover:bg-gold-400 transition-all"
          >
            <Plus size={14} />
            Add Event
          </button>
          <button
            onClick={() => setView('sync')}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg
                       text-sm text-slate-300 hover:border-slate-600 transition-all"
          >
            <RefreshCw size={14} />
            <span className="hidden sm:inline">Sync</span>
            <span className={`ml-1 w-1.5 h-1.5 rounded-full ${
              syncStatus.googleConnected || syncStatus.outlookConnected
                ? 'bg-green-400'
                : 'bg-slate-600'
            }`} />
          </button>
        </div>
      </div>

      {view === 'calendar' ? (
        <div className="flex flex-col lg:flex-row gap-6">
          <div className="flex-1">
            <div className="bg-slate-900 border border-slate-700/50 rounded-xl overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700/50">
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => navigateMonth(-1)}
                    className="p-1 text-slate-400 hover:text-white transition-colors"
                  >
                    <ChevronLeft size={18} />
                  </button>
                  <h2 className="text-base font-semibold text-white">
                    {MONTHS[month]} {year}
                  </h2>
                  <button
                    onClick={() => navigateMonth(1)}
                    className="p-1 text-slate-400 hover:text-white transition-colors"
                  >
                    <ChevronRight size={18} />
                  </button>
                </div>
                <button
                  onClick={goToToday}
                  className="px-3 py-1 bg-slate-800 border border-slate-700 rounded-lg text-xs text-slate-300
                             hover:border-slate-600 transition-all"
                >
                  Today
                </button>
              </div>

              <div className="grid grid-cols-7">
                {DAYS_OF_WEEK.map(day => (
                  <div key={day} className="p-2 text-center text-xs font-medium text-slate-500 border-b border-slate-700/50">
                    {day}
                  </div>
                ))}
                {renderCalendarGrid()}
              </div>
            </div>

            <div className="mt-4 bg-slate-900 border border-slate-700/50 rounded-xl p-4">
              <div className="flex items-center gap-4 flex-wrap">
                <span className="text-xs text-slate-500">Event Types:</span>
                {Object.entries(TYPE_LABELS).map(([key, label]) => (
                  <span key={key} className="flex items-center gap-1.5 text-xs text-slate-400">
                    <div className={`w-2 h-2 rounded-full ${TYPE_COLORS[key as CalendarEvent['type']]}`} />
                    {label}
                  </span>
                ))}
              </div>
            </div>
          </div>

          <div className="lg:w-80 space-y-6">
            {renderDayDetail()}
            {renderUpcomingSidebar()}
          </div>
        </div>
      ) : (
        renderSyncSettings()
      )}

      {renderEventModal()}
    </div>
  );
};

export default CalendarView;
