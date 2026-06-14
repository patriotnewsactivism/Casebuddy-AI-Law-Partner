
import React, { useState, useEffect } from 'react';
import { HashRouter, Routes, Route, Navigate, useLocation, Link } from 'react-router-dom';
import {
  LayoutDashboard, FileText, Users, BrainCircuit, Gavel, Settings as SettingsIcon,
  Menu, X, Mic, FileAudio, ClipboardList, Archive, UserCheck, BookOpen, TrendingUp,
  Mail, ChevronDown, ChevronUp, Scale, Zap, DollarSign, UserCircle2
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
import { MOCK_CASES } from './constants';
import { Case } from './types';
import { loadCases, saveCases, loadActiveCaseId, saveActiveCaseId } from './utils/storage';

const NAV_GROUPS = [
  {
    label: 'Case Management',
    items: [
      { path: '/app', icon: LayoutDashboard, label: 'Dashboard' },
      { path: '/app/cases', icon: Gavel, label: 'Case Files' },
      { path: '/app/evidence', icon: Archive, label: 'Evidence Vault' },
    ]
  },
  {
    label: 'Legal Team',
    items: [
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
      { path: '/app/integrations', icon: Zap, label: 'Integrations' },
    ]
  },
];

const Sidebar = ({ isOpen, setIsOpen }: { isOpen: boolean, setIsOpen: (v: boolean) => void }) => {
  const location = useLocation();
  const isActive = (path: string) => location.pathname === path;
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

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
              <span className="text-sm font-semibold text-white">Attorney J. Doe</span>
              <span className="text-xs text-slate-400">Senior Litigator</span>
            </div>
            <div className="h-9 w-9 rounded-full bg-slate-700 border border-slate-600 overflow-hidden">
              <img src="https://picsum.photos/id/1005/100/100" alt="Profile" className="h-full w-full object-cover"/>
            </div>
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-6 md:p-8 overflow-x-hidden">
          {children}
        </main>
      </div>
    </div>
  );
};

export const AppContext = React.createContext<{
  cases: Case[];
  activeCase: Case | null;
  setActiveCase: (c: Case) => void;
  addCase: (c: Case) => void;
}>({
  cases: [],
  activeCase: null,
  setActiveCase: () => {},
  addCase: () => {},
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

  const setActiveCase = (c: Case) => {
    setActiveCaseState(c);
    saveActiveCaseId(c.id);
  };

  const addCase = (newCase: Case) => {
    const updated = [...cases, newCase];
    setCases(updated);
    saveCases(updated);
    if (!activeCase) {
      setActiveCase(newCase);
    }
  };

  useEffect(() => {
    saveCases(cases);
  }, [cases]);

  const handleCloseOnboarding = () => {
    localStorage.setItem(ONBOARDING_KEY, '1');
    setShowOnboarding(false);
  };

  return (
    <AppContext.Provider value={{ cases, activeCase, setActiveCase, addCase }}>
      <HashRouter>
        {showOnboarding && <OnboardingModal onClose={handleCloseOnboarding} />}

        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/privacy-policy" element={<PrivacyPolicy />} />
          <Route path="/tos" element={<TermsOfService />} />
          <Route path="/pricing" element={<Pricing />} />

          <Route path="/app" element={<Layout><Dashboard /></Layout>} />
          <Route path="/app/cases" element={<Layout><CaseManager /></Layout>} />
          <Route path="/app/practice" element={<Layout><ArgumentPractice /></Layout>} />
          <Route path="/app/witness-lab" element={<Layout><WitnessLab /></Layout>} />
          <Route path="/app/witnesses" element={<Layout><WitnessPrep /></Layout>} />
          <Route path="/app/strategy" element={<Layout><StrategyRoom /></Layout>} />
          <Route path="/app/transcriber" element={<Layout><Transcriber /></Layout>} />
          <Route path="/app/docs" element={<Layout><DraftingAssistant /></Layout>} />
          <Route path="/app/settings" element={<Layout><SettingsPage /></Layout>} />
          <Route path="/app/deposition" element={<Layout><DepositionPrep /></Layout>} />
          <Route path="/app/evidence" element={<Layout><EvidenceVault /></Layout>} />
          <Route path="/app/jury" element={<Layout><JuryAnalyzer /></Layout>} />
          <Route path="/app/jury-sim" element={<Layout><JurySimulator /></Layout>} />
          <Route path="/app/statements" element={<Layout><StatementBuilder /></Layout>} />
          <Route path="/app/verdict" element={<Layout><VerdictPredictor /></Layout>} />
          <Route path="/app/client-update" element={<Layout><ClientUpdate /></Layout>} />
          <Route path="/app/legal-team" element={<Layout><LegalTeam /></Layout>} />
          <Route path="/app/integrations" element={<Layout><Integrations /></Layout>} />
          <Route path="/app/deadlines" element={<Layout><DeadlineTracker /></Layout>} />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </HashRouter>
      <ToastContainer aria-label="Notifications" />
    </AppContext.Provider>
  );
};

export default App;
