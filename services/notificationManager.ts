/**
 * notificationManager.ts — Smart notification system for agent alerts.
 *
 * Handles creation, batching, prioritisation, delivery, and persistence
 * of all agent-generated notifications.
 *
 * Batching strategy:
 *  • critical / high → delivered immediately via toast
 *  • medium / low    → batched for BATCH_INTERVAL_MS, then grouped and delivered
 *
 * Quiet hours: no toasts between quietHoursStart–quietHoursEnd local time.
 */

import { toast } from 'react-toastify';
import { AGENT_CONFIG } from '../config/agentConfig';
import { getAnyPersonById } from '../agents/personas';
import type { AgentNotification, NotificationPriority, NotificationType } from '../types';

// ── Storage key ────────────────────────────────────────────────────────────
const STORAGE_KEY = 'cb_notifications';

// ── Subscribers (for React components) ────────────────────────────────────
type Listener = (notifications: AgentNotification[]) => void;
const listeners: Set<Listener> = new Set();

function notify(): void {
  const notifs = getAll();
  listeners.forEach(fn => fn(notifs));
}

// ── Persistence ────────────────────────────────────────────────────────────

function getAll(): AgentNotification[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function persistAll(notifications: AgentNotification[]): void {
  const max = AGENT_CONFIG.notifications.maxStored;
  const trimmed = notifications.slice(-max);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
  } catch { /* storage full */ }
}

// ── Quiet hours ────────────────────────────────────────────────────────────

function isQuietHours(): boolean {
  const cfg = AGENT_CONFIG.notifications;
  const hour = new Date().getHours();
  if (cfg.quietHoursStart > cfg.quietHoursEnd) {
    return hour >= cfg.quietHoursStart || hour < cfg.quietHoursEnd;
  }
  return hour >= cfg.quietHoursStart && hour < cfg.quietHoursEnd;
}

// ── Toast delivery ─────────────────────────────────────────────────────────

function toastNotification(n: AgentNotification): void {
  if (isQuietHours() && n.priority !== 'critical') return;

  const agent = getAnyPersonById(n.agentId);
  const prefix = agent ? `${agent.emoji} ${agent.name}` : 'CaseBuddy';
  const msg = `${prefix}: ${n.message}`;

  const opts = { autoClose: n.priority === 'critical' ? 10000 : 5000 } as const;

  switch (n.priority) {
    case 'critical':
      toast.error(msg, opts);
      break;
    case 'high':
      toast.warning(msg, opts);
      break;
    default:
      toast.info(msg, { ...opts, autoClose: 4000 });
  }
}

// ── Batch buffer ───────────────────────────────────────────────────────────

let batchBuffer: AgentNotification[] = [];
let batchTimer: ReturnType<typeof setTimeout> | null = null;

function flushBatch(): void {
  if (batchBuffer.length === 0) return;

  const grouped: Record<string, AgentNotification[]> = {};
  for (const n of batchBuffer) {
    const key = n.agentId;
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(n);
  }

  for (const [agentId, group] of Object.entries(grouped)) {
    const agent = getAnyPersonById(agentId);
    const name = agent ? `${agent.emoji} ${agent.name}` : 'Agent';
    const top = group.find(n => n.priority === 'high') ?? group[0];

    if (group.length === 1) {
      toastNotification(top);
    } else {
      toast.info(`${name}: ${top.message} (+${group.length - 1} more)`, { autoClose: 5000 });
    }
  }

  batchBuffer = [];
  batchTimer = null;
}

// ── Public API ─────────────────────────────────────────────────────────────

/** Generate a unique notification ID */
function generateId(): string {
  return `notif_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/** Subscribe a React component to notification changes. Returns an unsubscribe fn. */
export function subscribeNotifications(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Create and deliver a new notification */
export function pushNotification(
  options: Omit<AgentNotification, 'id' | 'read' | 'dismissed' | 'timestamp'>
): string {
  if (!AGENT_CONFIG.notifications.enabled) return '';

  const id = generateId();
  const notif: AgentNotification = {
    ...options,
    id,
    read: false,
    dismissed: false,
    timestamp: Date.now(),
  };

  // Persist
  const all = getAll();
  all.push(notif);
  persistAll(all);
  notify();

  // Deliver
  if (notif.priority === 'critical' || notif.priority === 'high') {
    toastNotification(notif);
  } else {
    batchBuffer.push(notif);
    if (!batchTimer) {
      batchTimer = setTimeout(flushBatch, AGENT_CONFIG.notifications.batchIntervalMs);
    }
    // Flush immediately if batch is full
    if (batchBuffer.length >= AGENT_CONFIG.notifications.maxBatchSize) {
      if (batchTimer) clearTimeout(batchTimer);
      flushBatch();
    }
  }

  return id;
}

/** Convenience helpers */
export function pushDeadlineAlert(agentId: string, caseId: string, caseTitle: string, daysUntil: number): string {
  return pushNotification({
    agentId,
    caseId,
    caseTitle,
    type: 'deadline',
    priority: daysUntil <= 3 ? 'critical' : daysUntil <= 7 ? 'high' : 'medium',
    title: `Deadline in ${daysUntil} day${daysUntil !== 1 ? 's' : ''}`,
    message: `${caseTitle}: court date in ${daysUntil} day${daysUntil !== 1 ? 's' : ''}.`,
    actions: [{ label: 'Open Case', route: '/app/cases' }],
  });
}

export function pushInsightAlert(
  agentId: string,
  caseId: string,
  caseTitle: string,
  title: string,
  message: string,
  priority: NotificationPriority = 'medium'
): string {
  return pushNotification({
    agentId,
    caseId,
    caseTitle,
    type: 'insight',
    priority,
    title,
    message,
  });
}

export function pushTaskComplete(
  agentId: string,
  caseId: string,
  caseTitle: string,
  description: string
): string {
  return pushNotification({
    agentId,
    caseId,
    caseTitle,
    type: 'task-complete',
    priority: 'low',
    title: 'Task completed',
    message: description,
  });
}

/** Mark a notification as read */
export function markRead(id: string): void {
  const all = getAll().map(n => (n.id === id ? { ...n, read: true } : n));
  persistAll(all);
  notify();
}

/** Mark all notifications as read */
export function markAllRead(): void {
  const all = getAll().map(n => ({ ...n, read: true }));
  persistAll(all);
  notify();
}

/** Dismiss a notification */
export function dismissNotification(id: string): void {
  const all = getAll().map(n => (n.id === id ? { ...n, dismissed: true } : n));
  persistAll(all);
  notify();
}

/** Clear all notifications */
export function clearAllNotifications(): void {
  persistAll([]);
  notify();
}

/** Get unread count (non-dismissed) */
export function getUnreadCount(): number {
  return getAll().filter(n => !n.read && !n.dismissed).length;
}

/** Get displayed notifications (non-dismissed, newest first) */
export function getVisibleNotifications(): AgentNotification[] {
  return getAll()
    .filter(n => !n.dismissed)
    .sort((a, b) => b.timestamp - a.timestamp);
}

/** Use in React (re-renders when notifications change) */
export function useNotifications(): AgentNotification[] {
  // This is imported by components; the actual hook is in components that call subscribeNotifications.
  return getVisibleNotifications();
}
