
import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation, Link } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  LayoutDashboard, FileText, Users, BrainCircuit, Gavel, Settings as SettingsIcon,
  Menu, X, Mic, FileAudio, ClipboardList, Archive, UserCheck, BookOpen, TrendingUp,
  Mail, ChevronDown, ChevronUp, Scale, Zap, DollarSign, UserCircle2, Shield, PhoneCall, Inbox, Network,
  Cloud, CloudOff, Loader2, LogOut
} from 'lucide-react';
import { ToastContainer } from 'react-toastify';
import Dashboard from './components/Dashboard';
import CaseManager from './components/CaseManager';
import WitnessLab from './components/WitnessLab';
import StrategyRoom from './components/StrategyRoom';
import ArgumentPractice from './components/ArgumentPractice';
import LandingPage from './components/LandingPage';
import PrivacyPolicy from './components/PrivacyPolicy';
import TermsOfService from './components/TermsOfService';
import Transcriber from './components/Transcriber';
import DraftingAssistant from './components/DraftingAssistant';
import SettingsPage from './components/Settings';
import DepositionPrep from './components/DepositionPrep';
import EvidenceVault from './components/EvidenceVault';
import JuryAnalyzer from './components/JuryAnalyzer';
import StatementBuilder from './components/StatementBuilder';
import VerdictPredictor from './components/VerdictPredictor';
import ClientUpdate from './components/ClientUpdate';
import LegalTeam from './components/LegalTeam';
import WitnessPrep from './components/WitnessPrep';
import JurySimulator from './components/JurySimulator';
import Pricing from './components/Pricing';
import OnboardingModal from './components/OnboardingModal';
import Integrations from './components/Integrations';
import DeadlineTracker from './components/DeadlineTracker';
import ActiveCaseBar from './components/ActiveCaseBar';
import IntakePage from './components/IntakePage';
import WarRoom from './components/WarRoom';
import CopilotSidebar from './components/CopilotSidebar';
import FoiaCenter from './components/FoiaCenter';
import FirmReception from './components/FirmReception';
import IntakeInbox from './components/IntakeInbox';
import PublicIntake from './components/PublicIntake';
import CaseOrchestrator from './components/CaseOrchestrator';
import UserGuide from './components/UserGuide';
import AuthPage from './components/AuthPage';
import ErrorBoundary from './components/ErrorBoundary';
import { MOCK_CASES } from './constants';
import { Case } from './types';
import { loadCases, saveCases, loadActiveCaseId, saveActiveCaseId, loadPreferences, savePreferences } from './utils/storage';
import { loadCasesWithSync, upsertCaseToCloud, subscribeCases, syncLocalCasesToCloud, SyncStatus, syncLabel } from './services/caseStore';
import { onAuthStateChange, signOut } from './services/authService';
import type { User } from '@supabase/supabase-js';

const NAV_GROUPS = [
  {
    label: 'Case Management',
    items: [
      { path: '/app', icon: LayoutDashboard, label: 'Dashboard' },
      { path: '/app/intake-inbox', icon: Inbox, label: 'Intake Inbox', badge: 'Live' },
      { path: '/app/firm-command', icon: Network, label: 'Firm Command', badge: 'Auto' },
      { path: '/app/cases', icon: Gavel, label: 'Case Files' },
      { path: '/app/evidence', icon: Archive, label: 'Evidence Vault' },
      { path: '/app/war-room', icon: Shield, label: 'War Room' },
    ]
  },
  {
    label: 'Legal Team',
    items: [
      { path: '/app/firm', icon: PhoneCall, label: 'Talk to the Firm', badge: 'Voice' },
      { path: '/app/legal-team', icon: Scale, label: 'AI Lawyers', badge: '12' },
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
      { path: '/app/integrations', icon: Zap, label: 'Integrations' },
      { path: '/app/guide', icon: BookOpen, label: 'User Guide' },
    ]
  },
];

const Sidebar = ({ isOpen, setIsOpen }: { isOpen: boolean, setIsOpen: (v: boolean) => void }) => {
  const location = useLocation();
  const isActive = (path: string) => location.pathname === path;
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const { syncStatus } = React.useContext(AppContext);

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
          {NAV_GROUPS.map(group => (
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
  const { user } = React.useContext(AppContext);
  const location = useLocation();

  // Derive display name from user metadata, falling back to preferences then email
  const prefs = loadPreferences();
  const displayName = user?.user_metadata?.display_name || prefs.displayName || user?.email?.split('@')[0] || 'Attorney';
  const titleLine = prefs.title || '';

  const handleSignOut = async () => {
    await signOut();
  };

  return (
    <div className="min-h-screen bg-[#020617] text-slate-100">
      <Sidebar isOpen={isSidebarOpen} setIsOpen={setIsSidebarOpen} />

      <div className="md:ml-64 min-h-screen flex flex-col">
        <header className="h-14 glass-dark border-b border-white/5 sticky top-0 z-30 px-6 flex items-center justify-between">
          <button className="md:hidden text-slate-400" onClick={() => setIsSidebarOpen(true)}>
            <Menu size={22} />
          </button>
          <div className="flex items-center gap-4 ml-auto">
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
                {children}
              </ErrorBoundary>
            </motion.div>
          </AnimatePresence>
        </main>
      </div>

      <CopilotSidebar />
    </div>
  );
};

// ─── Auth Gate: redirects unauthenticated users to /login ────────────────────

const AuthGate = ({ children }: { children: React.ReactNode }) => {
  const { user, authLoading } = React.useContext(AppContext);

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

// ─── Context ─────────────────────────────────────────────────────────────────

export const AppContext = React.createContext<{
  cases: Case[];
  activeCase: Case | null;
  setActiveCase: (c: Case) => void;
  addCase: (c: Case) => void;
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
    const unsub = onAuthStateChange((u, _session) => {
      setUser(u);
      setAuthLoading(false);
    });
    return unsub;
  }, []);

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

  return (
    <AppContext.Provider value={{ cases, activeCase, setActiveCase, addCase, theme, setTheme, syncStatus, user, authLoading }}>
      <BrowserRouter>
        {showOnboarding && user && <OnboardingModal onClose={handleCloseOnboarding} />}

        <Routes>
          {/* Public routes */}
          <Route path="/" element={<LandingPage />} />
          <Route path="/login" element={user ? <Navigate to="/app" replace /> : <AuthPage />} />
          <Route path="/privacy-policy" element={<PrivacyPolicy />} />
          <Route path="/tos" element={<TermsOfService />} />
          <Route path="/pricing" element={<Pricing />} />
          <Route path="/start" element={<IntakePage />} />
          <Route path="/intake" element={<PublicIntake />} />

          {/* Protected routes — require authentication */}
          <Route path="/app" element={<AuthGate><Layout><Dashboard /></Layout></AuthGate>} />
          <Route path="/app/intake-inbox" element={<AuthGate><Layout><IntakeInbox /></Layout></AuthGate>} />
          <Route path="/app/firm-command" element={<AuthGate><Layout><CaseOrchestrator /></Layout></AuthGate>} />
          <Route path="/app/cases" element={<AuthGate><Layout><CaseManager /></Layout></AuthGate>} />
          <Route path="/app/practice" element={<AuthGate><Layout><ArgumentPractice /></Layout></AuthGate>} />
          <Route path="/app/witness-lab" element={<AuthGate><Layout><WitnessLab /></Layout></AuthGate>} />
          <Route path="/app/witnesses" element={<AuthGate><Layout><WitnessPrep /></Layout></AuthGate>} />
          <Route path="/app/strategy" element={<AuthGate><Layout><StrategyRoom /></Layout></AuthGate>} />
          <Route path="/app/transcriber" element={<AuthGate><Layout><Transcriber /></Layout></AuthGate>} />
          <Route path="/app/docs" element={<AuthGate><Layout><DraftingAssistant /></Layout></AuthGate>} />
          <Route path="/app/settings" element={<AuthGate><Layout><SettingsPage /></Layout></AuthGate>} />
          <Route path="/app/deposition" element={<AuthGate><Layout><DepositionPrep /></Layout></AuthGate>} />
          <Route path="/app/evidence" element={<AuthGate><Layout><EvidenceVault /></Layout></AuthGate>} />
          <Route path="/app/jury" element={<AuthGate><Layout><JuryAnalyzer /></Layout></AuthGate>} />
          <Route path="/app/jury-sim" element={<AuthGate><Layout><JurySimulator /></Layout></AuthGate>} />
          <Route path="/app/statements" element={<AuthGate><Layout><StatementBuilder /></Layout></AuthGate>} />
          <Route path="/app/verdict" element={<AuthGate><Layout><VerdictPredictor /></Layout></AuthGate>} />
          <Route path="/app/client-update" element={<AuthGate><Layout><ClientUpdate /></Layout></AuthGate>} />
          <Route path="/app/legal-team" element={<AuthGate><Layout><LegalTeam /></Layout></AuthGate>} />
          <Route path="/app/integrations" element={<AuthGate><Layout><Integrations /></Layout></AuthGate>} />
          <Route path="/app/deadlines" element={<AuthGate><Layout><DeadlineTracker /></Layout></AuthGate>} />
          <Route path="/app/war-room" element={<AuthGate><Layout><WarRoom /></Layout></AuthGate>} />
          <Route path="/app/foia" element={<AuthGate><Layout><FoiaCenter /></Layout></AuthGate>} />
          <Route path="/app/firm" element={<AuthGate><Layout><FirmReception /></Layout></AuthGate>} />
          <Route path="/app/guide" element={<AuthGate><Layout><UserGuide /></Layout></AuthGate>} />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
      <ToastContainer aria-label="Notifications" />
    </AppContext.Provider>
  );
};

export default App;
