/**
 * HubTabs — generic tab shell for "hub" pages that combine sibling features
 * (e.g. Intake Inbox + Maya Live Intake) under a single sidebar entry.
 *
 * Tabs render lazily: a tab's component only mounts the first time it is
 * opened, then stays mounted (hidden) so switching back keeps its state.
 */

import React, { Suspense, useState } from 'react';
import { Loader2 } from 'lucide-react';

export interface HubTab {
  id: string;
  label: string;
  icon?: React.ReactNode;
  badge?: string;
  render: () => React.ReactNode;
}

const Spinner = () => (
  <div className="flex items-center justify-center py-32">
    <Loader2 size={28} className="text-gold-500 animate-spin" />
  </div>
);

const HubTabs: React.FC<{ tabs: HubTab[]; initialTabId?: string }> = ({ tabs, initialTabId }) => {
  const [active, setActive] = useState(initialTabId ?? tabs[0]?.id);
  const [visited, setVisited] = useState<Set<string>>(new Set([initialTabId ?? tabs[0]?.id]));

  const open = (id: string) => {
    setActive(id);
    setVisited(prev => (prev.has(id) ? prev : new Set(prev).add(id)));
  };

  return (
    <div className="flex flex-col min-h-full">
      <div className="flex items-center gap-1 px-4 pt-3 border-b border-slate-800/60 sticky top-0 z-10 bg-slate-950/90 backdrop-blur">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => open(t.id)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-t-xl border-b-2 transition-colors ${
              active === t.id
                ? 'text-gold-400 border-gold-500 bg-slate-900/60'
                : 'text-slate-400 border-transparent hover:text-slate-200 hover:bg-slate-900/40'
            }`}
          >
            {t.icon}
            {t.label}
            {t.badge && (
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-gold-500/15 text-gold-400 border border-gold-500/30">
                {t.badge}
              </span>
            )}
          </button>
        ))}
      </div>
      <div className="flex-1">
        {tabs.map(t => (
          <div key={t.id} className={active === t.id ? '' : 'hidden'}>
            {visited.has(t.id) && <Suspense fallback={<Spinner />}>{t.render()}</Suspense>}
          </div>
        ))}
      </div>
    </div>
  );
};

export default HubTabs;
