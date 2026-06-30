export interface TimeSlot {
  day: string;
  date: string;
  time: string;
  available: boolean;
}

export interface AvailabilityConfig {
  id: string;
  timezone: string;
  workingDays: string[];
  workingHours: { start: string; end: string };
  slotDurationMinutes: number;
  bufferMinutes: number;
  advanceNoticeDays: number;
  blockedDates: string[];
}

export interface Consultation {
  id: string;
  clientName: string;
  clientPhone: string;
  clientEmail: string;
  intakeId?: string;
  scheduledDate: string;
  scheduledTime: string;
  durationMinutes: number;
  status: 'scheduled' | 'confirmed' | 'completed' | 'cancelled' | 'no-show';
  notes?: string;
  matterType?: string;
  createdAt: number;
  confirmedAt?: number;
}

const AVAILABILITY_KEY = 'casebuddy_availability';
const CONSULTATIONS_KEY = 'casebuddy_consultations';

const DEFAULT_AVAILABILITY: AvailabilityConfig = {
  id: 'default',
  timezone: 'America/Chicago',
  workingDays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
  workingHours: { start: '09:00', end: '17:00' },
  slotDurationMinutes: 60,
  bufferMinutes: 15,
  advanceNoticeDays: 14,
  blockedDates: [],
};

const DAY_INDEX: Record<string, number> = {
  Sunday: 0,
  Monday: 1,
  Tuesday: 2,
  Wednesday: 3,
  Thursday: 4,
  Friday: 5,
  Saturday: 6,
};

const INDEX_DAY: Record<number, string> = {
  0: 'Sunday',
  1: 'Monday',
  2: 'Tuesday',
  3: 'Wednesday',
  4: 'Thursday',
  5: 'Friday',
  6: 'Saturday',
};

function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function getTodayDate(): string {
  const d = new Date();
  return d.toISOString().split('T')[0];
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

function getDayName(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00');
  return INDEX_DAY[d.getDay()];
}

function getNowMinutes(): number {
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
}

export function getAvailability(): AvailabilityConfig {
  try {
    const stored = localStorage.getItem(AVAILABILITY_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      return { ...DEFAULT_AVAILABILITY, ...parsed };
    }
  } catch {}
  return { ...DEFAULT_AVAILABILITY };
}

export function saveAvailability(config: AvailabilityConfig): void {
  try {
    localStorage.setItem(AVAILABILITY_KEY, JSON.stringify(config));
  } catch {}
}

export function getConsultations(status?: string): Consultation[] {
  try {
    const stored = localStorage.getItem(CONSULTATIONS_KEY);
    const consultations: Consultation[] = stored ? JSON.parse(stored) : [];
    const filtered = status
      ? consultations.filter(c => c.status === status)
      : consultations;
    return filtered.sort((a, b) => {
      if (a.scheduledDate > b.scheduledDate) return -1;
      if (a.scheduledDate < b.scheduledDate) return 1;
      return timeToMinutes(a.scheduledTime) - timeToMinutes(b.scheduledTime);
    });
  } catch {
    return [];
  }
}

function saveConsultations(consultations: Consultation[]): void {
  try {
    localStorage.setItem(CONSULTATIONS_KEY, JSON.stringify(consultations));
  } catch {}
}

export function getAvailableSlots(fromDate?: string, toDate?: string): TimeSlot[] {
  const config = getAvailability();
  const consultations = getConsultations();
  const bookedSet = new Set<string>();

  for (const c of consultations) {
    if (c.status !== 'cancelled') {
      bookedSet.add(`${c.scheduledDate}|${c.scheduledTime}`);
    }
  }

  const blockedSet = new Set(config.blockedDates);
  const workingSet = new Set(config.workingDays);
  const start = fromDate || getTodayDate();
  const end = toDate || addDays(start, config.advanceNoticeDays);

  const slots: TimeSlot[] = [];
  const startMin = timeToMinutes(config.workingHours.start);
  const endMin = timeToMinutes(config.workingHours.end);
  const slotDuration = config.slotDurationMinutes;
  const slotBuffer = config.bufferMinutes;
  const totalSlotSpan = slotDuration + slotBuffer;

  let current = start;
  const nowMinutes = getNowMinutes();
  const today = getTodayDate();

  while (current <= end) {
    if (blockedSet.has(current)) {
      current = addDays(current, 1);
      continue;
    }

    const dayName = getDayName(current);
    if (!workingSet.has(dayName)) {
      current = addDays(current, 1);
      continue;
    }

    for (let t = startMin; t + slotDuration <= endMin; t += totalSlotSpan) {
      const time = minutesToTime(t);
      const isPast = current === today && t <= nowMinutes;
      const isBooked = bookedSet.has(`${current}|${time}`);
      slots.push({
        day: dayName,
        date: current,
        time,
        available: !isPast && !isBooked,
      });
    }

    current = addDays(current, 1);
  }

  return slots.sort((a, b) => {
    if (a.date < b.date) return -1;
    if (a.date > b.date) return 1;
    return timeToMinutes(a.time) - timeToMinutes(b.time);
  });
}

export function getNextAvailableSlots(count: number = 6): TimeSlot[] {
  const all = getAvailableSlots();
  return all.filter(s => s.available).slice(0, count);
}

export function bookConsultation(
  clientName: string,
  clientPhone: string,
  clientEmail: string,
  date: string,
  time: string,
  intakeId?: string,
  matterType?: string,
): Consultation {
  const config = getAvailability();
  const consultations = getConsultations();
  const booked = `${date}|${time}`;

  const existing = consultations.filter(c => c.status !== 'cancelled');
  if (existing.some(c => c.scheduledDate === date && c.scheduledTime === time)) {
    throw new Error('That time slot is no longer available.');
  }

  const consultation: Consultation = {
    id: `consult_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    clientName,
    clientPhone,
    clientEmail,
    intakeId,
    scheduledDate: date,
    scheduledTime: time,
    durationMinutes: config.slotDurationMinutes,
    status: 'scheduled',
    matterType,
    createdAt: Date.now(),
  };

  consultations.push(consultation);
  saveConsultations(consultations);
  return consultation;
}

export function cancelConsultation(id: string): void {
  const consultations = getConsultations();
  const idx = consultations.findIndex(c => c.id === id);
  if (idx !== -1) {
    consultations[idx].status = 'cancelled';
    saveConsultations(consultations);
  }
}

export function formatSlotsForMaya(slots: TimeSlot[]): string {
  const available = slots.filter(s => s.available).slice(0, 4);
  if (available.length === 0) return '';

  const MONTHS = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];

  const parts = available.map(s => {
    const d = new Date(s.date + 'T12:00:00');
    const month = MONTHS[d.getMonth()];
    const dayNum = d.getDate();
    const hour = parseInt(s.time.split(':')[0], 10);
    const minute = s.time.split(':')[1];
    const amPm = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
    const timeStr = minute === '00'
      ? `${displayHour}:00 ${amPm}`
      : `${displayHour}:${minute} ${amPm}`;
    return `${s.day} ${month} ${dayNum} at ${timeStr}`;
  });

  if (parts.length === 1) return parts[0];
  if (parts.length === 2) return `${parts[0]} or ${parts[1]}`;
  return `${parts.slice(0, -1).join(', ')} or ${parts[parts.length - 1]}`;
}

export function getConsultationConfirmationText(consultation: Consultation): string {
  const config = getAvailability();
  const d = new Date(consultation.scheduledDate + 'T12:00:00');
  const MONTHS = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];
  const dayName = d.toLocaleDateString('en-US', { weekday: 'long' });
  const month = MONTHS[d.getMonth()];
  const dayNum = d.getDate();
  const hour = parseInt(consultation.scheduledTime.split(':')[0], 10);
  const minute = consultation.scheduledTime.split(':')[1];
  const amPm = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  const timeStr = minute === '00'
    ? `${displayHour}:00 ${amPm}`
    : `${displayHour}:${minute} ${amPm}`;

  const tzParts = config.timezone.split('/');
  const tzLabel = tzParts[tzParts.length - 1].replace('_', ' ');
  const phone = consultation.clientPhone || 'the number you provided';

  return `Your consultation is scheduled for ${dayName} ${month} ${dayNum} at ${timeStr} ${tzLabel}. You'll receive a confirmation text at ${phone}.`;
}
