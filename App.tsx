
import React, { useState, useEffect, Suspense, useMemo } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation, Link } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  LayoutDashboard, FileText, Users, BrainCircuit, Gavel, Settings as SettingsIcon,
  Menu, X, Mic, FileAudio, ClipboardList, Archive, UserCheck, BookOpen, TrendingUp,
  Mail, ChevronDown, ChevronUp, Scale, Zap, Search, DollarSign, UserCircle2, Shield, PhoneCall, Inbox, Network,
  Cloud, CloudOff, Loader2, LogOut, Activity, MessageSquare, FileSearch, Upload
} from 'lucide-react';
import { ToastContainer } from 'react-toastify';

// ─── Eagerly loaded (needed on every page or at auth boundary) ────────────
import ErrorBoundary from './components/ErrorBoundary';
import ActiveCaseBar from './components/ActiveCaseBar';
import CopilotSidebar from './components/CopilotSidebar';

// ─── Lazy-loaded pages ────────────────────────────────────────────────────
const Dashboard        = React.lazy(() => import('./components/Dashboard'));
const CaseManager      = React.lazy(() => import('./components/CaseManager'));
const WitnessLab       = React.lazy(() => import('./components/WitnessLab'));
const StrategyRoom     = React.lazy(() => import('./components/StrategyRoom'));
const MailRoom         = React.lazy(() => import('./components/MailRoom'));
const IntercomPanel    = React.lazy(() => import('./components/IntercomPanel'));
const ArgumentPractice = React.lazy(() => import('./components/ArgumentPractice'));
const LandingPage      = React.lazy(() => import('./components/LandingPage'));
const PrivacyPolicy    = React.lazy(() => import('./components/PrivacyPolicy'));
const TermsOfService   = React.lazy(() => import('./components/TermsOfService'));
const Transcriber      = React.lazy(() => import('./components/Transcriber'));
const DraftingAssistant= React.lazy(() => import('./components/DraftingAssistant'));
const SettingsPage     = React.lazy(() => import('./components/Settings'));
const DepositionPrep   = React.lazy(() => import('./components/DepositionPrep'));
const EvidenceVault    = React.lazy(() => import('./components/EvidenceVault'));
const JuryAnalyzer     = React.lazy(() => import('./components/JuryAnalyzer'));
const StatementBuilder = React.lazy(() => import('./components/StatementBuilder'));
const VerdictPredictor = React.lazy(() => import('./components/VerdictPredictor'));
const ClientUpdate     = React.lazy(() => import('./components/ClientUpdate'));
const LegalTeam        = React.lazy(() => import('./components/LegalTeam'));
const WitnessPrep      = React.lazy(() => import('./components/WitnessPrep'));
const JurySimulator    = React.lazy(() => import('./components/JurySimulator'));
const Pricing          = React.lazy(() => import('./components/Pricing'));
const OnboardingModal  = React.lazy(() => import('./components/OnboardingModal'));
const Integrations     = React.lazy(() => import('./components/Integrations'));
const DeadlineTracker  = React.lazy(() => import('./components/DeadlineTracker'));
const IntakePage       = React.lazy(() => import('./components/IntakePage'));
const WarRoom          = React.lazy(() => import('./components/WarRoom'));
const FoiaCenter       = React.lazy(() => import('./components/FoiaCenter'));
const FirmReception    = React.lazy(() => import('./components/FirmReception'));
const IntakeInbox      = React.lazy(() => import('./components/IntakeInbox'));
const PublicIntake     = React.lazy(() => import('./components/PublicIntake'));
const CaseOrchestrator = React.lazy(() => import('./components/CaseOrchestrator'));
const UserGuide        = React.lazy(() => import('./components/UserGuide'));
const AuthPage         = React.lazy(() => import('./components/AuthPage'));
const EnrollPage       = React.lazy(() => import('./components/EnrollPage'));
const FirmAdminPanel   = React.lazy(() => import('./components/FirmAdminPanel'));
const CaseThreadView   = React.lazy(() => import('./components/CaseThread'));
const DiscoveryManager = React.lazy(() => import('./components/DiscoveryManager'));
const BulkDocumentUpload = React.lazy(() => import('./components/BulkDocumentUpload'));

import { MOCK_CASES } from './constants';
import { Case } from './types';
import { loadCases, saveCases, loadActiveCaseId, saveActiveCaseId, loadPreferences, savePreferences } from './utils/storage';
import { backgroundEngine } from './services/backgroundAgentEngine';
import { caseMonitor } from './services/caseMonitor';
import { orchestrator } from './services/agentOrchestrator';
import { flushRetryQueue } from './services/intakeStore';
import { onCaseCreated, onCaseUpdated } from './services/caseEventHooks';
import NotificationCenter from './components/NotificationCenter';
import AgentStatusDashboard from './components/AgentStatusDashboard';
import { loadCasesWithSync, upsertCaseToCloud, deleteCaseFromCloud, subscribeCases, syncLocalCasesToCloud, SyncStatus, syncLabel, adoptFirmIdFromUser } from './services/caseStore';
import { onAuthStateChange, signOut, getSession } from './services/authService';
import { isSupabaseConfigured } from './services/supabaseClient';
import type { User } from '@supabase/supabase-js';

// ─── Page-level loading spinner ──────────────────────────────────────────
const PageSpinner = () => (
  <div className="flex items-center justify-center py-32">
    <Loader2 size={28} className="text-gold-500 animate-spin" />
  </div>
);

const NAV_GROUPS = [
  {
    label: 'Case Management',
    items: [
      { path: '/app', icon: LayoutDashboard, label: 'Dashboard' },
      { path: '/app/intake-inbox', icon: Inbox, label: 'Intake Inbox', badge: 'Live' },
      { path: '/app/firm-command', icon: Network, label: 'Firm Command', badge: 'Auto' },
      { path: '/app/cases', icon: Gavel, label: 'Case Files' },
      { path: '/app/evidence', icon: Archive, label: 'Evidence Vault' },
      { path: '/app/discovery', icon: FileSearch, label: 'Discovery Manager', badge: 'AI' },
      { path: '/app/upload', icon: Upload, label: 'Document Upload', badge: 'OCR' },
      { path: '/app/war-room', icon: Shield, label: 'War Room' },
    ]
  },
  {
    label: 'Legal Team',
    items: [
      { path: '/app/firm', icon: PhoneCall, label: 'Talk to the Firm', badge: 'Voice' },
      { path: '/app/mail-room', icon: Mail, label: 'Mail Room', badge: 'New' },
      { path: '/app/intercom', icon: PhoneCall, label: 'Intercom', badge: 'Live' },
      { path: '/app/legal-team', icon: Scale, label: 'AI Lawyers', badge: '12' },
      { path: '/app/case-thread', icon: MessageSquare, label: 'Case Threads', badge: 'New' },
    ]
  },
  {
    label: 'Courtroom Prep',
    items: [
      { path: '/app/practice', icon: Mic, label: 'Trial Simulator' },
      { path: '/app/witness-lab', icon: Users, label: 'Witness Lab' },
      { path: '/app/witnesses', icon: UserCheck, label: 'Witness Prep' },
      { path: '/app/jury', icon: UserCircle2, label: 'Jury Analyzer' },
      { path: '/app/jury-sim', icon: Users, label: 'Jury Simulator' },
      { path: '/app/deposition', icon: ClipboardList, label: 'Deposition Prep' },
    ]
  },
  {
    label: 'Drafting & Strategy',
    items: [
      { path: '/app/statements', icon: BookOpen, label: 'Statement Builder' },
      { path: '/app/docs', icon: FileText, label: 'Drafting Assistant' },
      { path: '/app/strategy', icon: BrainCircuit, label: 'Strategy & AI' },
      { path: '/app/verdict', icon: TrendingUp, label: 'Verdict Predictor' },
    ]
  },
  {
    label: 'Tools',
    items: [
      { path: '/app/transcriber', icon: FileAudio, label: 'Transcriber & OCR' },
      { path: '/app/client-update', icon: Mail, label: 'Client Updates' },
      { path: '/app/deadlines', icon: ClipboardList, label: 'Deadline Tracker' },
      { path: '/app/foia', icon: FileText, label: 'FOIA & Records' },
      { path: '/app/agent-status', icon: Activity, label: 'Agent Status', badge: 'Live' },
      { path: '/app/integrations', icon: Zap, label: 'Integrations' },
      { path: '/app/firm-admin', icon: Shield, label: 'Firm Admin', badge: 'Secure' },
      { path: '/app/guide', icon: BookOpen, label: 'User Guide' },
    ]
  },
];

const Sidebar = ({ isOpen, setIsOpen }: { isOpen: boolean, setIsOpen: (v: boolean) => void }) => {
  const location = useLocation();
  const isActive = (path: string) => location.pathname === path;
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [navSearch, setNavSearch] = useState('');
  const { syncStatus } = React.useContext(AppContext);

  const filteredNavGroups = React.useMemo(() => {
    if (!navSearch.trim()) return NAV_GROUPS;
    const q = navSearch.toLowerCase();
    return NAV_GROUPS.map(group => ({
      ...group,
      items: group.items.filter((item: any) => item.label.toLowerCase().includes(q)),
    })).filter(group => group.items.length > 0);
  }, [navSearch]);

  const toggleGroup = (label: string) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev);
      next.has(label) ? next.delete(label) : next.add(label);
      return next;
    });
  };

  return (
    <>
      {isOpen && (
        <div className="fixed inset-0 bg-black/50 z-40 md:hidden" onClick={() => setIsOpen(false)} />
      )}
      <aside className={`
        fixed top-0 left-0 z-50 h-full w-64 sidebar-bg border-r border-slate-800/60
        transform transition-transform duration-300 ease-in-out flex flex-col
        ${isOpen ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0
      `}>
        <div className="h-16 flex items-center px-5 border-b border-slate-800 shrink-0">
          <Link to="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity" onClick={() => setIsOpen(false)}>
            <Gavel size={24} className="text-gold-500" />
            <span className="text-lg font-serif font-bold text-white">CaseBuddy</span>
          </Link>
          <button className="ml-auto md:hidden text-slate-400" onClick={() => setIsOpen(false)}>
            <X size={22} />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto py-3">
          <div className="px-3 pb-2">
            <div className="relative">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="text"
                placeholder="Search..."
                value={navSearch}
                onChange={e => setNavSearch(e.target.value)}
                className="w-full bg-slate-800/60 text-slate-300 text-xs pl-7 pr-2 py-1.5 rounded-lg border border-slate-700/60 focus:border-gold-500/50 focus:outline-none placeholder-slate-600"
              />
            </div>
          </div>
          {filteredNavGroups.map(group => (
            <div key={group.label} className="mb-1">
              <button
                onClick={() => toggleGroup(group.label)}
                className="w-full flex items-center justify-between px-5 py-2 text-xs font-bold text-slate-500 uppercase tracking-wider hover:text-slate-300 transition-colors">
                {group.label}
                {collapsedGroups.has(group.label)
                  ? <ChevronDown size={12} />
                  : <ChevronUp size={12} />}
              </button>
              {!collapsedGroups.has(group.label) && group.items.map((item: any) => {
                const Icon = item.icon;
                const active = isActive(item.path);
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    onClick={() => setIsOpen(false)}
                    className={`nav-item ${active ? 'active' : ''}`}>
                    <Icon size={17} />
                    <span className="flex-1">{item.label}</span>
                    {item.badge && (
                      <span className="text-xs bg-gold-500/20 border border-gold-500/40 text-gold-400 px-1.5 py-0.5 rounded-full font-bold">
                        {item.badge}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="border-t border-slate-800 shrink-0">
          {/* Cloud sync badge */}
          <div className="flex items-center gap-2 px-5 py-2 text-xs">
            {syncStatus === 'synced' && <><Cloud size={13} className="text-green-400" /><span className="text-green-400">Synced · all devices</span></>}
            {syncStatus === 'syncing' && <><Loader2 size={13} className="text-slate-400 animate-spin" /><span className="text-slate-500">Syncing...</span></>}
            {syncStatus === 'error' && <><CloudOff size={13} className="text-amber-400" /><span className="text-amber-400">Cloud unavailable</span></>}
            {syncStatus === 'local-only' && <><CloudOff size={13} className="text-slate-600" /><span className="text-slate-600">Local only</span></>}
          </div>
          <Link to="/pricing" onClick={() => setIsOpen(false)}
            className="flex items-center gap-3 px-5 py-2.5 text-sm text-slate-400 hover:text-white transition-all">
            <DollarSign size={17} />
            <span>Pricing</span>
          </Link>
          <Link
            to="/app/settings"
            onClick={() => setIsOpen(false)}
            className={`flex items-center gap-3 px-5 py-3 text-sm transition-all ${
              isActive('/app/settings') ? 'text-gold-400' : 'text-slate-400 hover:text-white'
            }`}>
            <SettingsIcon size={17} />
            <span>Settings</span>
          </Link>
        </div>
      </aside>
    </>
  );
};

const Layout = ({ children }: { children?: React.ReactNode }) => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const { user, theme } = React.useContext(AppContext);
  const location = useLocation();

  // Derive display name from user metadata, falling back to preferences then email
  const prefs = loadPreferences();
  const displayName = user?.user_metadata?.display_name || prefs.displayName || user?.email?.split('@')[0] || 'Attorney';
  const titleLine = prefs.title || '';

  const handleSignOut = async () => {
    await signOut();
  };

  return (
    <div className={`min-h-screen ${theme === 'light' ? 'bg-gray-50 text-gray-900' : 'bg-[#020617] text-slate-100'}`}>
      <Sidebar isOpen={isSidebarOpen} setIsOpen={setIsSidebarOpen} />

      <div className="md:ml-64 min-h-screen flex flex-col">
        <header className="h-14 glass-dark border-b border-white/5 sticky top-0 z-30 px-6 flex items-center justify-between">
          <button className="md:hidden text-slate-400" onClick={() => setIsSidebarOpen(true)}>
            <Menu size={22} />
          </button>
          <div className="flex items-center gap-4 ml-auto">
            <NotificationCenter />
            <div className="hidden sm:flex flex-col items-end">
              <span className="text-sm font-semibold text-white">{displayName}</span>
              {titleLine && <span className="text-xs text-slate-400">{titleLine}</span>}
            </div>
            <div className="h-9 w-9 rounded-full bg-slate-700 border border-slate-600 overflow-hidden flex items-center justify-center text-gold-400 font-bold text-sm">
              {displayName.charAt(0).toUpperCase()}
            </div>
            <button
              onClick={handleSignOut}
              title="Sign out"
              className="text-slate-500 hover:text-slate-300 transition-colors"
            >
              <LogOut size={18} />
            </button>
          </div>
        </header>

        <main className="flex-1 flex flex-col overflow-x-hidden">
          <ActiveCaseBar />
          <AnimatePresence mode="wait">
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.15, ease: 'easeOut' }}
              className="flex-1 p-4 sm:p-6 md:p-8"
            >
              <ErrorBoundary label={location.pathname.split('/').pop() || 'Page'}>
                <Suspense fallback={<PageSpinner />}>
                  {children}
                </Suspense>
              </ErrorBoundary>
            </motion.div>
          </AnimatePresence>
        </main>
      </div>

      <CopilotSidebar />
    </div>
  );
};

// ─── Auth Gate: redirects unauthenticated users to /login ────────────────

const AuthGate = ({ children }: { children: React.ReactNode }) => {
  const { user, authLoading } = React.useContext(AppContext);

  // When Supabase is not configured, skip auth entirely — enables local-only / demo usage
  if (!isSupabaseConfigured) return <>{children}</>;

  if (authLoading) {
    return (
      <div className="min-h-screen bg-[#020617] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 size={32} className="text-gold-500 animate-spin" />
          <span className="text-slate-400 text-sm">Loading your firm...</span>
        </div>
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
};

// ─── Context ─────────────────────────────────────────────────────────────

export const AppContext = React.createContext<{
  cases: Case[];
  activeCase: Case | null;
  setActiveCase: (c: Case) => void;
  addCase: (c: Case) => void;
  updateCase: (c: Case) => void;
  deleteCase: (id: string) => void;
  theme: 'dark' | 'light';
  setTheme: (t: 'dark' | 'light') => void;
  syncStatus: SyncStatus;
  user: User | null;
  authLoading: boolean;
}>({
  cases: [],
  activeCase: null,
  setActiveCase: () => {},
  addCase: () => {},
  updateCase: () => {},
  deleteCase: () => {},
  theme: 'dark',
  setTheme: () => {},
  syncStatus: 'local-only',
  user: null,
  authLoading: true,
});

const ONBOARDING_KEY = 'casebuddy_onboarding_done';

const App = () => {
  const [cases, setCases] = useState<Case[]>(() => {
    const saved = loadCases();
    return saved.length > 0 ? saved : MOCK_CASES;
  });
  const [activeCase, setActiveCaseState] = useState<Case | null>(() => {
    const savedId = loadActiveCaseId();
    if (!savedId) return null;
    const saved = loadCases();
    return saved.find(c => c.id === savedId) ?? null;
  });
  const [showOnboarding, setShowOnboarding] = useState(() => !localStorage.getItem(ONBOARDING_KEY));
  const [theme, setThemeState] = useState<'dark' | 'light'>(() => loadPreferences().theme ?? 'dark');
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('syncing');
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  // ─── Auth listener ─────────────────────────────────────────────────────────
  useEffect(() => {
    // If Supabase is not configured the callback never fires — resolve immediately
    // so the app does not spin forever on a blank loading screen.
    if (!isSupabaseConfigured) {
      setAuthLoading(false);
      return;
    }
    const unsub = onAuthStateChange((u, _session) => {
      setUser(u);
      setAuthLoading(false);
      // Claim a firm_memberships row for the signed-in user. Firm-scoped RLS
      // (cases, client_invites, intakes, …) resolves the user's firm via
      // get_user_firm_id(), which reads firm_memberships — without this the
      // user has no firm and every firm-scoped write is rejected by RLS
      // ("new row violates row-level security policy"). Fires on the initial
      // session and on sign-in; it's idempotent and best-effort.
      if (u) void adoptFirmIdFromUser(u);
    });
    // Safety net: if auth check takes >5 s, unblock the UI anyway
    const timeout = setTimeout(() => setAuthLoading(false), 5000);
    return () => { unsub(); clearTimeout(timeout); };
  }, []);

  // ─── Fetch server-side API keys once authenticated ─────────────────────────
  // The Gemini key lives server-side (GEMINI_API_KEY). Services fall back to
  // window.__GEMINI_API_KEY, so we fetch it via the voice-keys endpoint and
  // cache it on window so all services pick it up without any VITE_ env var.
  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const session = await getSession();
        if (!session?.access_token) return;
        const resp = await fetch('/api/ai/voice-keys', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
        });
        if (resp.ok) {
          const data = await resp.json();
          if (data.geminiKey) (window as any).__GEMINI_API_KEY = data.geminiKey;
          if (data.deepgramKey) (window as any).__DEEPGRAM_API_KEY = data.deepgramKey;
          if (data.deepseekKey) (window as any).__DEEPSEEK_API_KEY = data.deepseekKey;
        }
      } catch { /* silent — services fall back to VITE_ env vars */ }
    })();
  }, [user]);

  const setTheme = (t: 'dark' | 'light') => {
    setThemeState(t);
    savePreferences({ theme: t });
  };

  const setActiveCase = (c: Case) => {
    setActiveCaseState(c);
    saveActiveCaseId(c.id);
  };

  const addCase = (newCase: Case) => {
    const updated = [...cases, newCase];
    setCases(updated);
    saveCases(updated);
    upsertCaseToCloud(newCase);
    if (!activeCase) {
      setActiveCase(newCase);
    }
    // Auto-trigger new case intake workflow
    onCaseCreated(newCase).catch(() => {});
  };

  const updateCase = (updatedCase: Case) => {
    const previous = cases.find(c => c.id === updatedCase.id);
    const updated = cases.map(c => c.id === updatedCase.id ? updatedCase : c);
    setCases(updated);
    saveCases(updated);
    upsertCaseToCloud(updatedCase);
    if (activeCase?.id === updatedCase.id) {
      setActiveCaseState(updatedCase);
      saveActiveCaseId(updatedCase.id);
    }
    // Auto-trigger event-based workflows (deadline proximity, win prob drop, etc.)
    onCaseUpdated(updatedCase, previous).catch(() => {});
  };

  const deleteCase = (id: string) => {
    const updated = cases.filter(c => c.id !== id);
    setCases(updated);
    saveCases(updated);
    deleteCaseFromCloud(id);
    if (activeCase?.id === id) {
      const next = updated[0] ?? null;
      setActiveCaseState(next);
      if (next) saveActiveCaseId(next.id);
    }
  };

  // Initial cloud sync
  useEffect(() => {
    setSyncStatus('syncing');
    loadCasesWithSync((cloudCases, status) => {
      setSyncStatus(status);
      if (cloudCases.length > 0) {
        setCases(cloudCases);
        const savedId = loadActiveCaseId();
        if (savedId) {
          const found = cloudCases.find(c => c.id === savedId);
          if (found) setActiveCaseState(found);
        }
      }
    });
  }, []);

  // Realtime updates from other devices
  useEffect(() => {
    const unsub = subscribeCases(updated => {
      setCases(updated);
      saveCases(updated);
      setSyncStatus('synced');
    });
    return unsub;
  }, []);

  // Keep localStorage + Supabase in sync on every cases change.
  const hasMounted = React.useRef(false);
  useEffect(() => {
    saveCases(cases);
    if (hasMounted.current) {
      syncLocalCasesToCloud(cases);
    } else {
      hasMounted.current = true;
    }
  }, [cases]);

  const handleCloseOnboarding = () => {
    localStorage.setItem(ONBOARDING_KEY, '1');
    setShowOnboarding(false);
  };

  // ─── Start autonomous AI engine on mount ──────────────────────────────────
  useEffect(() => {
    backgroundEngine.start();
    caseMonitor.start();
    orchestrator.cleanup(); // clean up stale completed workflows
    flushRetryQueue().catch(() => {}); // retry any intakes that failed to save
    return () => {
      backgroundEngine.stop();
      caseMonitor.stop();
    };
  }, []);

  return (
    <AppContext.Provider value={{ cases, activeCase, setActiveCase, addCase, updateCase, deleteCase, theme, setTheme, syncStatus, user, authLoading }}>
      <BrowserRouter>
        {showOnboarding && user && (
          <Suspense fallback={null}>
            <OnboardingModal onClose={handleCloseOnboarding} />
          </Suspense>
        )}

        <Suspense fallback={<div className="min-h-screen bg-[#020617] flex items-center justify-center"><Loader2 size={32} className="text-gold-500 animate-spin" /></div>}>
          <Routes>
            {/* Public routes */}
            <Route path="/" element={<LandingPage />} />
            <Route path="/login" element={user ? <Navigate to="/app" replace /> : <AuthPage />} />
            <Route path="/privacy-policy" element={<PrivacyPolicy />} />
            <Route path="/tos" element={<TermsOfService />} />
            <Route path="/terms-of-service" element={<TermsOfService />} />
            <Route path="/enroll" element={<EnrollPage />} />
            <Route path="/pricing" element={<Pricing />} />
            <Route path="/start" element={<IntakePage />} />
            <Route path="/intake" element={<PublicIntake />} />
            <Route path="/intake/:token" element={<PublicIntake />} />

            {/* Protected routes — require authentication */}
            <Route path="/app" element={<AuthGate><Layout><Dashboard /></Layout></AuthGate>} />
            <Route path="/app/intake-inbox" element={<AuthGate><Layout><IntakeInbox /></Layout></AuthGate>} />
            <Route path="/app/firm-command" element={<AuthGate><Layout><CaseOrchestrator /></Layout></AuthGate>} />
            <Route path="/app/cases" element={<AuthGate><Layout><CaseManager /></Layout></AuthGate>} />
            <Route path="/app/practice" element={<AuthGate><Layout><ArgumentPractice /></Layout></AuthGate>} />
            <Route path="/app/witness-lab" element={<AuthGate><Layout><WitnessLab /></Layout></AuthGate>} />
            <Route path="/app/witnesses" element={<AuthGate><Layout><WitnessPrep /></Layout></AuthGate>} />
            <Route path="/app/strategy" element={<AuthGate><Layout><StrategyRoom /></Layout></AuthGate>} />
              <Route path="/app/mail-room" element={<AuthGate><Layout><MailRoom /></Layout></AuthGate>} />
              <Route path="/app/intercom" element={<AuthGate><Layout><IntercomPanel /></Layout></AuthGate>} />
            <Route path="/app/transcriber" element={<AuthGate><Layout><Transcriber /></Layout></AuthGate>} />
            <Route path="/app/docs" element={<AuthGate><Layout><DraftingAssistant /></Layout></AuthGate>} />
            <Route path="/app/settings" element={<AuthGate><Layout><SettingsPage /></Layout></AuthGate>} />
            <Route path="/app/firm-admin" element={<AuthGate><Layout><FirmAdminPanel /></Layout></AuthGate>} />
            <Route path="/app/deposition" element={<AuthGate><Layout><DepositionPrep /></Layout></AuthGate>} />
            <Route path="/app/evidence" element={<AuthGate><Layout><EvidenceVault /></Layout></AuthGate>} />
            <Route path="/app/discovery" element={<AuthGate><Layout><DiscoveryManager /></Layout></AuthGate>} />
            <Route path="/app/upload" element={<AuthGate><Layout><BulkDocumentUpload /></Layout></AuthGate>} />
            <Route path="/app/jury" element={<AuthGate><Layout><JuryAnalyzer /></Layout></AuthGate>} />
            <Route path="/app/jury-sim" element={<AuthGate><Layout><JurySimulator /></Layout></AuthGate>} />
            <Route path="/app/statements" element={<AuthGate><Layout><StatementBuilder /></Layout></AuthGate>} />
            <Route path="/app/verdict" element={<AuthGate><Layout><VerdictPredictor /></Layout></AuthGate>} />
            <Route path="/app/client-update" element={<AuthGate><Layout><ClientUpdate /></Layout></AuthGate>} />
            <Route path="/app/legal-team" element={<AuthGate><Layout><LegalTeam /></Layout></AuthGate>} />
            <Route path="/app/agent-status" element={<AuthGate><Layout><AgentStatusDashboard /></Layout></AuthGate>} />
            <Route path="/app/integrations" element={<AuthGate><Layout><Integrations /></Layout></AuthGate>} />
            <Route path="/app/deadlines" element={<AuthGate><Layout><DeadlineTracker /></Layout></AuthGate>} />
            <Route path="/app/war-room" element={<AuthGate><Layout><WarRoom /></Layout></AuthGate>} />
            <Route path="/app/foia" element={<AuthGate><Layout><FoiaCenter /></Layout></AuthGate>} />
            <Route path="/app/firm" element={<AuthGate><Layout><FirmReception /></Layout></AuthGate>} />
            <Route path="/app/guide" element={<AuthGate><Layout><UserGuide /></Layout></AuthGate>} />

            <Route path="/app/case-thread" element={<AuthGate><Layout><CaseThreadView /></Layout></AuthGate>} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
      <ToastContainer aria-label="Notifications" />
    </AppContext.Provider>
  );
};

export default App;
