
import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation, Link } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import type { User } from '@supabase/supabase-js';
import {
  LayoutDashboard, FileText, Users, BrainCircuit, Gavel, Settings as SettingsIcon,
  Menu, X, Mic, FileAudio, ClipboardList, Archive, UserCheck, BookOpen, TrendingUp,
  Mail, ChevronDown, ChevronUp, Scale, Zap, DollarSign, UserCircle2, Shield, PhoneCall, Inbox, Network,
  Cloud, CloudOff, Loader2, LogOut
} from 'lucide-react';
import { ToastContainer } from 'react-toastify';
// Shell components — always mounted, must stay eager
import OnboardingModal from './components/OnboardingModal';
import ActiveCaseBar from './components/ActiveCaseBar';
import CopilotSidebar from './components/CopilotSidebar';
import RequireAuth from './components/RequireAuth';

// Route-level pages — lazy-loaded so each page's JS only downloads on first visit
const Dashboard = React.lazy(() => import('./components/Dashboard'));
const CaseManager = React.lazy(() => import('./components/CaseManager'));
const WitnessLab = React.lazy(() => import('./components/WitnessLab'));
const StrategyRoom = React.lazy(() => import('./components/StrategyRoom'));
const ArgumentPractice = React.lazy(() => import('./components/ArgumentPractice'));
const LandingPage = React.lazy(() => import('./components/LandingPage'));
const PrivacyPolicy = React.lazy(() => import('./components/PrivacyPolicy'));
const TermsOfService = React.lazy(() => import('./components/TermsOfService'));
const Transcriber = React.lazy(() => import('./components/Transcriber'));
const DraftingAssistant = React.lazy(() => import('./components/DraftingAssistant'));
const SettingsPage = React.lazy(() => import('./components/Settings'));
const DepositionPrep = React.lazy(() => import('./components/DepositionPrep'));
const EvidenceVault = React.lazy(() => import('./components/EvidenceVault'));
const JuryAnalyzer = React.lazy(() => import('./components/JuryAnalyzer'));
const StatementBuilder = React.lazy(() => import('./components/StatementBuilder'));
const VerdictPredictor = React.lazy(() => import('./components/VerdictPredictor'));
const ClientUpdate = React.lazy(() => import('./components/ClientUpdate'));
const LegalTeam = React.lazy(() => import('./components/LegalTeam'));
const WitnessPrep = React.lazy(() => import('./components/WitnessPrep'));
const JurySimulator = React.lazy(() => import('./components/JurySimulator'));
const Pricing = React.lazy(() => import('./components/Pricing'));
const Integrations = React.lazy(() => import('./components/Integrations'));
const DeadlineTracker = React.lazy(() => import('./components/DeadlineTracker'));
const IntakePage = React.lazy(() => import('./components/IntakePage'));
const WarRoom = React.lazy(() => import('./components/WarRoom'));
const FoiaCenter = React.lazy(() => import('./components/FoiaCenter'));
const FirmReception = React.lazy(() => import('./components/FirmReception'));
const IntakeInbox = React.lazy(() => import('./components/IntakeInbox'));
const PublicIntake = React.lazy(() => import('./components/PublicIntake'));
const CaseOrchestrator = React.lazy(() => import('./components/CaseOrchestrator'));
const UserGuide = React.lazy(() => import('./components/UserGuide'));
const Login = React.lazy(() => import('./components/Login'));
const ResetPassword = React.lazy(() => import('./components/ResetPassword'));
import { MOCK_CASES } from './constants';
import { Case } from './types';
import { loadCases, saveCases, loadActiveCaseId, saveActiveCaseId, loadPreferences, savePreferences } from './utils/storage';
import { loadCasesWithSync, upsertCaseToCloud, subscribeCases, syncLocalCasesToCloud, SyncStatus, syncLabel } from './services/caseStore';
import { useAuthSession, AuthStatus } from './hooks/useAuthSession';
import { signOut as signOutUser } from './services/authStore';

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
  const location = useLocation();
  const { user, signOut } = React.useContext(AppContext);

  return (
    <div className="min-h-screen bg-[#020617] text-slate-100">
      <Sidebar isOpen={isSidebarOpen} setIsOpen={setIsSidebarOpen} />

      <div className="md:ml-64 min-h-screen flex flex-col">
        <header className="h-14 glass-dark border-b border-white/5 sticky top-0 z-30 px-6 flex items-center justify-between">
          <button className="md:hidden text-slate-400" onClick={() => setIsSidebarOpen(true)}>
            <Menu size={22} />
          </button>
          <div className="flex items-center gap-3 ml-auto">
            {user && (
              <>
                <div className="hidden sm:flex flex-col items-end">
                  <span className="text-sm font-semibold text-white">{user.email}</span>
                  <span className="text-xs text-slate-400">Signed in</span>
                </div>
                <div className="h-9 w-9 rounded-full bg-gold-500/20 border border-gold-500/40 flex items-center justify-center text-gold-400 font-bold text-sm shrink-0">
                  {user.email?.[0]?.toUpperCase() ?? '?'}
                </div>
                <button
                  onClick={signOut}
                  title="Sign out"
                  className="text-slate-400 hover:text-red-400 transition-colors shrink-0"
                >
                  <LogOut size={18} />
                </button>
              </>
            )}
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
              {children}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>

      <CopilotSidebar />
    </div>
  );
};

const ProtectedLayout = ({ children }: { children?: React.ReactNode }) => (
  <RequireAuth>
    <Layout>{children}</Layout>
  </RequireAuth>
);

const PageLoader = () => (
  <div className="min-h-screen bg-[#020617] flex items-center justify-center">
    <Loader2 size={32} className="text-gold-500 animate-spin" />
  </div>
);

export const AppContext = React.createContext<{
  cases: Case[];
  activeCase: Case | null;
  setActiveCase: (c: Case) => void;
  addCase: (c: Case) => void;
  theme: 'dark' | 'light';
  setTheme: (t: 'dark' | 'light') => void;
  syncStatus: SyncStatus;
  user: User | null;
  authStatus: AuthStatus;
  signOut: () => Promise<void>;
}>({
  cases: [],
  activeCase: null,
  setActiveCase: () => {},
  addCase: () => {},
  theme: 'dark',
  setTheme: () => {},
  syncStatus: 'local-only',
  user: null,
  authStatus: 'loading',
  signOut: async () => {},
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
  const { session, user, status: authStatus } = useAuthSession();

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
    if (session) {
      setSyncStatus('syncing');
      upsertCaseToCloud(newCase).then(ok => setSyncStatus(ok ? 'synced' : 'error'));
    }
    if (!activeCase) {
      setActiveCase(newCase);
    }
  };

  // Initial cloud sync — only once signed in; RLS requires an authenticated
  // session for the `cases` table, so there's nothing to fetch for guests.
  useEffect(() => {
    if (!session) {
      setSyncStatus('local-only');
      return;
    }
    setSyncStatus('syncing');
    loadCasesWithSync((cloudCases, status) => {
      setSyncStatus(status);
      if (cloudCases.length > 0) {
        setCases(cloudCases);
        // Restore active case from merged set
        const savedId = loadActiveCaseId();
        if (savedId) {
          const found = cloudCases.find(c => c.id === savedId);
          if (found) setActiveCaseState(found);
        }
      }
    });
  }, [session]);

  // Realtime updates from other devices
  useEffect(() => {
    if (!session) return;
    const unsub = subscribeCases(updated => {
      setCases(updated);
      saveCases(updated);
      setSyncStatus('synced');
    });
    return unsub;
  }, [session]);

  // Keep localStorage + Supabase in sync on every cases change.
  // hasMounted guard prevents re-uploading the cloud data we just fetched.
  const hasMounted = React.useRef(false);
  useEffect(() => {
    saveCases(cases);
    if (hasMounted.current && session) {
      syncLocalCasesToCloud(cases).then(ok => { if (!ok) setSyncStatus('error'); });
    } else {
      hasMounted.current = true;
    }
  }, [cases, session]);

  const handleCloseOnboarding = () => {
    localStorage.setItem(ONBOARDING_KEY, '1');
    setShowOnboarding(false);
  };

  const handleSignOut = async () => {
    await signOutUser();
  };

  return (
    <AppContext.Provider value={{ cases, activeCase, setActiveCase, addCase, theme, setTheme, syncStatus, user, authStatus, signOut: handleSignOut }}>
      <BrowserRouter>
        {showOnboarding && <OnboardingModal onClose={handleCloseOnboarding} />}

        <React.Suspense fallback={<PageLoader />}>
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route path="/privacy-policy" element={<PrivacyPolicy />} />
            <Route path="/tos" element={<TermsOfService />} />
            <Route path="/pricing" element={<Pricing />} />
            <Route path="/start" element={<IntakePage />} />
            <Route path="/intake" element={<PublicIntake />} />
            <Route path="/login" element={<Login />} />
            <Route path="/reset-password" element={<ResetPassword />} />

            <Route path="/app" element={<ProtectedLayout><Dashboard /></ProtectedLayout>} />
            <Route path="/app/intake-inbox" element={<ProtectedLayout><IntakeInbox /></ProtectedLayout>} />
            <Route path="/app/firm-command" element={<ProtectedLayout><CaseOrchestrator /></ProtectedLayout>} />
            <Route path="/app/cases" element={<ProtectedLayout><CaseManager /></ProtectedLayout>} />
            <Route path="/app/practice" element={<ProtectedLayout><ArgumentPractice /></ProtectedLayout>} />
            <Route path="/app/witness-lab" element={<ProtectedLayout><WitnessLab /></ProtectedLayout>} />
            <Route path="/app/witnesses" element={<ProtectedLayout><WitnessPrep /></ProtectedLayout>} />
            <Route path="/app/strategy" element={<ProtectedLayout><StrategyRoom /></ProtectedLayout>} />
            <Route path="/app/transcriber" element={<ProtectedLayout><Transcriber /></ProtectedLayout>} />
            <Route path="/app/docs" element={<ProtectedLayout><DraftingAssistant /></ProtectedLayout>} />
            <Route path="/app/settings" element={<ProtectedLayout><SettingsPage /></ProtectedLayout>} />
            <Route path="/app/deposition" element={<ProtectedLayout><DepositionPrep /></ProtectedLayout>} />
            <Route path="/app/evidence" element={<ProtectedLayout><EvidenceVault /></ProtectedLayout>} />
            <Route path="/app/jury" element={<ProtectedLayout><JuryAnalyzer /></ProtectedLayout>} />
            <Route path="/app/jury-sim" element={<ProtectedLayout><JurySimulator /></ProtectedLayout>} />
            <Route path="/app/statements" element={<ProtectedLayout><StatementBuilder /></ProtectedLayout>} />
            <Route path="/app/verdict" element={<ProtectedLayout><VerdictPredictor /></ProtectedLayout>} />
            <Route path="/app/client-update" element={<ProtectedLayout><ClientUpdate /></ProtectedLayout>} />
            <Route path="/app/legal-team" element={<ProtectedLayout><LegalTeam /></ProtectedLayout>} />
            <Route path="/app/integrations" element={<ProtectedLayout><Integrations /></ProtectedLayout>} />
            <Route path="/app/deadlines" element={<ProtectedLayout><DeadlineTracker /></ProtectedLayout>} />
            <Route path="/app/war-room" element={<ProtectedLayout><WarRoom /></ProtectedLayout>} />
            <Route path="/app/foia" element={<ProtectedLayout><FoiaCenter /></ProtectedLayout>} />
            <Route path="/app/firm" element={<ProtectedLayout><FirmReception /></ProtectedLayout>} />
            <Route path="/app/guide" element={<ProtectedLayout><UserGuide /></ProtectedLayout>} />

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </React.Suspense>
      </BrowserRouter>
      <ToastContainer aria-label="Notifications" />
    </AppContext.Provider>
  );
};

export default App;
