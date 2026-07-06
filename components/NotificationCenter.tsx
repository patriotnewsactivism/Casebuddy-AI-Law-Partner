import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, X, Check, CheckCheck, Trash2, AlertTriangle, Info, Zap, Clock, ChevronRight } from 'lucide-react';
import {
  subscribeNotifications,
  markRead,
  markAllRead,
  dismissNotification,
  clearAllNotifications,
  getVisibleNotifications,
  getUnreadCount,
} from '../services/notificationManager';
import { OPERATIONAL_AGENTS } from '../agents/personas';
import type { AgentNotification, NotificationPriority } from '../types';

// ── Helpers ────────────────────────────────────────────────────────────────

const PRIORITY_STYLES: Record<NotificationPriority, string> = {
  critical: 'border-red-500/50 bg-red-500/5',
  high:     'border-amber-500/50 bg-amber-500/5',
  medium:   'border-blue-500/30 bg-blue-500/5',
  low:      'border-slate-700 bg-slate-800/30',
};

const PRIORITY_ICON: Record<NotificationPriority, React.ReactNode> = {
  critical: <AlertTriangle size={13} className="text-red-400 shrink-0" />,
  high:     <AlertTriangle size={13} className="text-amber-400 shrink-0" />,
  medium:   <Info         size={13} className="text-blue-400  shrink-0" />,
  low:      <Info         size={13} className="text-slate-400 shrink-0" />,
};

function relativeTime(ts: number): string {
  const diff = (Date.now() - ts) / 1000;
  if (diff < 60)    return 'just now';
  if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function agentEmoji(agentId: string): string {
  return OPERATIONAL_AGENTS.find(a => a.id === agentId)?.emoji ?? '⚖️';
}

// ── Single notification card ───────────────────────────────────────────────

const NotifCard: React.FC<{
  n: AgentNotification;
  onDismiss: (id: string) => void;
  onNavigate?: (route: string) => void;
}> = ({ n, onDismiss, onNavigate }) => {
  const handleClick = () => {
    markRead(n.id);
    if (n.actions?.[0]?.route && onNavigate) {
      onNavigate(n.actions[0].route);
    }
  };

  return (
    <div
      className={`relative rounded-xl border p-3 transition-all ${PRIORITY_STYLES[n.priority]} ${n.read ? 'opacity-60' : ''}`}
    >
      {!n.read && (
        <span className="absolute top-2 right-8 w-2 h-2 rounded-full bg-gold-400" />
      )}

      <button
        onClick={() => onDismiss(n.id)}
        className="absolute top-2 right-2 text-slate-600 hover:text-slate-300 transition-colors"
      >
        <X size={13} />
      </button>

      <div className="flex items-start gap-2 mb-1.5">
        <span className="text-base leading-none mt-0.5">{agentEmoji(n.agentId)}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            {PRIORITY_ICON[n.priority]}
            <span className="text-xs font-semibold text-white truncate">{n.title}</span>
          </div>
          <p className="text-xs text-slate-400 mt-0.5 leading-snug">{n.message}</p>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <span className="text-[10px] text-slate-600">{relativeTime(n.timestamp)}</span>
        {n.actions && n.actions.length > 0 && (
          <button
            onClick={handleClick}
            className="flex items-center gap-1 text-[10px] text-gold-400 hover:text-gold-300 transition-colors"
          >
            {n.actions[0].label}
            <ChevronRight size={10} />
          </button>
        )}
      </div>
    </div>
  );
};

// ── Main component ─────────────────────────────────────────────────────────

const NotificationCenter: React.FC = () => {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<AgentNotification[]>(() => getVisibleNotifications());
  const [unread, setUnread] = useState(() => getUnreadCount());
  const panelRef = useRef<HTMLDivElement>(null);

  // Subscribe to notification changes
  useEffect(() => {
    const unsub = subscribeNotifications(all => {
      setNotifications(all.filter(n => !n.dismissed).sort((a, b) => b.timestamp - a.timestamp));
      setUnread(all.filter(n => !n.read && !n.dismissed).length);
    });
    return unsub;
  }, []);

  // Close panel on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const handleNavigate = (route: string) => {
    setOpen(false);
    navigate(route);
  };

  return (
    <div className="relative" ref={panelRef}>
      {/* Bell button */}
      <button
        onClick={() => setOpen(v => !v)}
        className="relative p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
        title="Notifications"
      >
        <Bell size={18} />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 flex items-center justify-center text-[9px] font-bold bg-red-500 text-white rounded-full px-1">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {/* Panel */}
      {open && (
        <div className="absolute right-0 top-10 z-50 w-80 max-h-[480px] flex flex-col bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800 shrink-0">
            <div className="flex items-center gap-2">
              <Zap size={15} className="text-gold-400" />
              <span className="text-sm font-bold text-white">Agent Alerts</span>
              {unread > 0 && (
                <span className="text-[10px] bg-gold-500/20 text-gold-400 border border-gold-500/30 px-1.5 py-0.5 rounded-full font-semibold">
                  {unread} new
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              {unread > 0 && (
                <button
                  onClick={markAllRead}
                  className="p-1.5 text-slate-500 hover:text-slate-300 transition-colors rounded"
                  title="Mark all read"
                >
                  <CheckCheck size={14} />
                </button>
              )}
              {notifications.length > 0 && (
                <button
                  onClick={clearAllNotifications}
                  className="p-1.5 text-slate-500 hover:text-red-400 transition-colors rounded"
                  title="Clear all"
                >
                  <Trash2 size={14} />
                </button>
              )}
              <button
                onClick={() => setOpen(false)}
                className="p-1.5 text-slate-500 hover:text-white transition-colors rounded"
              >
                <X size={14} />
              </button>
            </div>
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {notifications.length === 0 ? (
              <div className="text-center py-10 text-slate-500 text-sm">
                <Bell size={28} className="mx-auto mb-2 opacity-30" />
                <p>No notifications</p>
                <p className="text-xs mt-1 text-slate-600">Agents will alert you here</p>
              </div>
            ) : (
              notifications.map(n => (
                <NotifCard
                  key={n.id}
                  n={n}
                  onDismiss={dismissNotification}
                  onNavigate={handleNavigate}
                />
              ))
            )}
          </div>

          {/* Footer */}
          {notifications.length > 0 && (
            <div className="px-4 py-2.5 border-t border-slate-800 shrink-0 text-center">
              <span className="text-[10px] text-slate-600">
                {notifications.length} notification{notifications.length !== 1 ? 's' : ''} · Powered by your AI team
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default NotificationCenter;
