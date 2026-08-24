import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  BarChart3,
  BookOpen,
  BrainCircuit,
  BriefcaseBusiness,
  Building2,
  CheckCircle,
  ChevronRight,
  ClipboardList,
  FileAudio,
  FileSearch,
  FileText,
  Gavel,
  Globe,
  Inbox,
  Layers3,
  Lock,
  Menu,
  Mic,
  Network,
  PhoneCall,
  Scale,
  Shield,
  Sparkles,
  TrendingUp,
  UserCheck,
  Users,
  Workflow,
  X,
  Zap,
} from 'lucide-react';
import { OPERATIONAL_AGENTS, LEGAL_SPECIALISTS } from '../agents/personas';

const AUDIENCES = [
  'Self-Represented Litigants',
  'Defendants',
  'Solo Practitioners',
  'Growing Firms',
  '40+ Attorney Teams',
];

const PLATFORM_PILLARS = [
  {
    icon: Inbox,
    title: 'Intake & Case Command',
    body: 'Capture matters, organize facts, centralize communications, score incoming opportunities, assign work, and keep the case moving from one workspace.',
  },
  {
    icon: FileSearch,
    title: 'Evidence & Discovery',
    body: 'Upload documents and media, run OCR and transcription, search the record, organize discovery, build timelines, and surface the details that matter.',
  },
  {
    icon: BrainCircuit,
    title: 'Research & Strategy',
    body: 'Turn case facts into focused research, issue spotting, strategy analysis, conflict checks, argument development, and practical next-step planning.',
  },
  {
    icon: FileText,
    title: 'Drafting & Work Product',
    body: 'Create structured drafts for motions, briefs, discovery, demand letters, witness preparation, correspondence, and other recurring legal work.',
  },
  {
    icon: Mic,
    title: 'Hearings, Depositions & Trial',
    body: 'Prepare witnesses, rehearse arguments, simulate opposing positions, test themes, organize exhibits, and walk into critical proceedings better prepared.',
  },
  {
    icon: Workflow,
    title: 'Operations & Automation',
    body: 'Coordinate deadlines, intake, task routing, document processing, internal handoffs, analytics, and repetitive office work without stitching together a dozen tools.',
  },
];

const OUTCOME_POINTS = [
  'Spend less time on repetitive legal and administrative work',
  'Find important facts and weaknesses faster',
  'Produce more work without sacrificing organization',
  'Prepare more thoroughly for hearings, depositions, negotiation, and trial',
  'Keep the entire matter visible instead of scattered across disconnected systems',
  'Give every user—from pro se to large firms—a stronger operating system for legal work',
];

const SCALE_PROFILES = [
  {
    icon: UserCheck,
    eyebrow: 'For individuals',
    title: 'Representing yourself should not mean working blind.',
    body: 'CaseBuddy helps self-represented litigants and defendants understand the record, organize evidence, track deadlines, prepare questions, build timelines, draft working documents, and prepare for what comes next.',
    bullets: ['Plain-language case organization', 'Evidence and document analysis', 'Hearing and witness preparation', 'Research and drafting assistance'],
    accent: 'gold',
  },
  {
    icon: BriefcaseBusiness,
    eyebrow: 'For solo & small firms',
    title: 'Operate like a larger legal team without carrying the overhead.',
    body: 'Centralize intake, case work, research, drafting, discovery, communications, trial preparation, and recurring office workflows so one attorney can accomplish substantially more in the same day.',
    bullets: ['24/7 intake support', 'Case-centered workflow automation', 'Research, drafting, and preparation tools', 'Less administrative drag'],
    accent: 'violet',
  },
  {
    icon: Building2,
    eyebrow: 'For growing & larger firms',
    title: 'One operating layer for a 40+ attorney organization.',
    body: 'Standardize the way matters move through the firm. Give attorneys, paralegals, and staff a shared system for intake, knowledge, evidence, assignments, document workflows, preparation, and management visibility.',
    bullets: ['Multi-user case coordination', 'Repeatable firm workflows', 'Centralized matter intelligence', 'Scalable operations and oversight'],
    accent: 'blue',
  },
];

const WORKFLOW_STEPS = [
  {
    step: '01',
    icon: PhoneCall,
    title: 'Bring the matter in',
    body: 'Start from an intake, a client, a charge, a dispute, an existing case, or a stack of records. CaseBuddy gives the matter a home immediately.',
  },
  {
    step: '02',
    icon: Layers3,
    title: 'Build the complete record',
    body: 'Documents, recordings, transcripts, facts, parties, issues, communications, dates, and evidence stay connected to the same matter.',
  },
  {
    step: '03',
    icon: Network,
    title: 'Put specialized workflows to work',
    body: 'Research, drafting, analysis, intake, discovery, timeline, witness, jury, trial-prep, and office workflows can work from the same case context.',
  },
  {
    step: '04',
    icon: BarChart3,
    title: 'Turn information into action',
    body: 'Surface risks, missing facts, deadlines, strategy choices, work product, and next actions instead of letting important information disappear into folders.',
  },
  {
    step: '05',
    icon: Gavel,
    title: 'Prepare stronger and move faster',
    body: 'Use the accumulated case intelligence to prepare for negotiation, motions practice, hearings, depositions, trial, client decisions, and firm management.',
  },
];

const FEATURES = [
  { icon: FileAudio, title: 'OCR & Transcription', body: 'Turn scanned records, audio, video, depositions, hearings, and evidence into searchable case material.' },
  { icon: FileText, title: 'Document Drafting', body: 'Create structured working drafts for motions, briefs, letters, discovery, outlines, and litigation preparation.' },
  { icon: BookOpen, title: 'Legal Research', body: 'Research issues from the facts of the matter while keeping controlling authority distinct from general web research.' },
  { icon: ClipboardList, title: 'Discovery Workspace', body: 'Organize requests, responses, production, Bates workflows, document review, and discovery-driven case strategy.' },
  { icon: UserCheck, title: 'Witness & Deposition Prep', body: 'Develop direct and cross themes, question outlines, impeachment points, credibility issues, and follow-up areas.' },
  { icon: Users, title: 'Jury & Trial Simulation', body: 'Pressure-test themes, arguments, witness presentation, objections, and trial strategy before the real proceeding.' },
  { icon: TrendingUp, title: 'Case & Settlement Analysis', body: 'Analyze strengths, weaknesses, risk factors, competing narratives, settlement considerations, and strategic options.' },
  { icon: Mic, title: 'Voice Workflows', body: 'Use voice for intake, hands-free case interaction, practice, and conversational preparation without exposing permanent provider credentials.' },
  { icon: Shield, title: 'Case-Centered Security', body: 'Keep access scoped to the right user, matter, and firm while sensitive documents remain private and controlled.' },
];

const TRUST_POINTS = [
  {
    icon: Lock,
    title: 'Private case data',
    body: 'Matter access is scoped by account, firm, and case permissions. Sensitive storage is private rather than publicly exposed.',
  },
  {
    icon: Shield,
    title: 'Server-side credentials',
    body: 'Permanent provider credentials stay off the browser. Short-lived or server-mediated access is used where supported.',
  },
  {
    icon: Globe,
    title: 'Works across devices',
    body: 'A browser-based workspace designed to stay useful from the office, courtroom hallway, home, or mobile device.',
  },
  {
    icon: Scale,
    title: 'Assistance, not a guarantee',
    body: 'CaseBuddy supports legal work and preparation. It does not guarantee outcomes, and self-represented users should seek licensed counsel when appropriate.',
  },
];

const NavLink = ({ href, children }: { href: string; children: React.ReactNode }) => (
  <a href={href} className="text-slate-400 hover:text-white transition-colors text-sm font-medium">
    {children}
  </a>
);

const LandingPage = () => {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="min-h-screen bg-transparent text-white overflow-x-hidden">
      <nav className="glass-dark sticky top-0 z-50 border-b border-white/5 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2.5 group">
            <div className="p-1.5 rounded-lg bg-gold-500/10 border border-gold-500/20 group-hover:glow-gold-sm transition-all">
              <Gavel size={22} className="text-gold-400" />
            </div>
            <div className="leading-tight">
              <span className="block text-lg font-serif font-bold tracking-tight">CaseBuddy</span>
              <span className="hidden sm:block text-[10px] uppercase tracking-[0.24em] text-slate-500">Legal work, unified</span>
            </div>
          </Link>

          <div className="hidden lg:flex items-center gap-6">
            <NavLink href="#platform">Platform</NavLink>
            <NavLink href="#workflow">How It Works</NavLink>
            <NavLink href="#scale">Who It&apos;s For</NavLink>
            <NavLink href="#capabilities">Capabilities</NavLink>
            <NavLink href="#security">Security</NavLink>
            <Link to="/pricing" className="text-slate-400 hover:text-white transition-colors text-sm font-medium">Pricing</Link>
          </div>

          <div className="hidden md:flex items-center gap-3">
            <Link to="/app" className="btn-ghost text-sm px-4 py-2">Sign In</Link>
            <Link to="/app" className="btn-gold text-sm px-5 py-2">
              Open CaseBuddy <ArrowRight size={15} />
            </Link>
          </div>

          <button
            onClick={() => setMobileOpen((open) => !open)}
            className="md:hidden p-2 text-slate-400 hover:text-white"
            aria-label="Toggle navigation"
          >
            {mobileOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>

        {mobileOpen && (
          <div className="md:hidden border-t border-white/5 px-4 py-4 space-y-3 animate-slide-up">
            {[
              ['#platform', 'Platform'],
              ['#workflow', 'How It Works'],
              ['#scale', 'Who It’s For'],
              ['#capabilities', 'Capabilities'],
              ['#security', 'Security'],
            ].map(([href, label]) => (
              <a
                key={href}
                href={href}
                onClick={() => setMobileOpen(false)}
                className="block text-slate-300 hover:text-white py-1.5 text-sm"
              >
                {label}
              </a>
            ))}
            <Link to="/pricing" className="block text-slate-300 hover:text-white py-1.5 text-sm" onClick={() => setMobileOpen(false)}>Pricing</Link>
            <Link to="/app" className="btn-gold w-full justify-center mt-2" onClick={() => setMobileOpen(false)}>
              Open CaseBuddy <ArrowRight size={15} />
            </Link>
          </div>
        )}
      </nav>

      <section className="relative min-h-[88vh] flex items-center overflow-hidden">
        <div className="orb orb-gold w-[650px] h-[650px] -top-44 -left-44 animate-float opacity-25" />
        <div className="orb orb-violet w-[520px] h-[520px] top-8 right-[-10rem] opacity-20" style={{ animationDelay: '2s' }} />
        <div className="absolute inset-0 opacity-[0.025]" style={{ backgroundImage: 'linear-gradient(rgba(212,175,55,1) 1px, transparent 1px), linear-gradient(90deg, rgba(212,175,55,1) 1px, transparent 1px)', backgroundSize: '64px 64px' }} />

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10 py-20 sm:py-28 w-full">
          <div className="max-w-5xl mx-auto text-center">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 glass-gold rounded-full text-gold-400 text-xs font-semibold mb-7 animate-fade-in">
              <Sparkles size={13} />
              One all-in-one platform for serious legal work
            </div>

            <h1 className="text-4xl sm:text-6xl lg:text-7xl font-bold font-serif leading-[1.03] mb-6 animate-slide-up">
              From Going It Alone to Running a
              <span className="text-gradient-gold"> 40+ Attorney Firm.</span>
            </h1>

            <p className="text-base sm:text-xl text-slate-300 max-w-4xl mx-auto mb-5 leading-relaxed animate-slide-up" style={{ animationDelay: '0.08s' }}>
              <strong className="text-white">CaseBuddy is the legal work platform built to handle the whole matter.</strong> Intake, case organization, evidence, discovery, research, drafting, deadlines, communications, preparation, simulation, and firm workflows stay connected in one system.
            </p>

            <p className="text-sm sm:text-lg text-slate-500 max-w-3xl mx-auto mb-9 leading-relaxed animate-slide-up" style={{ animationDelay: '0.12s' }}>
              Whether you are a self-represented litigant, a defendant trying to understand what comes next, a solo practitioner trying to multiply your output, or a larger firm trying to standardize how work gets done, CaseBuddy is built to help you accomplish more, move faster, prepare more thoroughly, and pursue better outcomes.
            </p>

            <div className="flex flex-col sm:flex-row gap-4 justify-center mb-9 animate-slide-up" style={{ animationDelay: '0.18s' }}>
              <Link to="/app" className="btn-gold text-base px-8 py-3.5 glow-gold">
                Put CaseBuddy to Work <ArrowRight size={18} />
              </Link>
              <a href="#platform" className="btn-ghost text-base px-8 py-3.5">
                Explore the Platform
              </a>
            </div>

            <div className="flex flex-wrap justify-center gap-2.5 animate-fade-in" style={{ animationDelay: '0.24s' }}>
              {AUDIENCES.map((audience) => (
                <span key={audience} className="px-3 py-1.5 rounded-full bg-white/[0.035] border border-white/10 text-xs text-slate-400">
                  {audience}
                </span>
              ))}
            </div>
          </div>

          <div className="mt-14 sm:mt-16 grid grid-cols-2 lg:grid-cols-4 gap-3 max-w-5xl mx-auto">
            {[
              ['One', 'case-centered workspace'],
              ['24/7', 'assistance and intake'],
              [`${OPERATIONAL_AGENTS.length}+`, 'specialized workflows'],
              [`${LEGAL_SPECIALISTS.length}`, 'practice-area assistants'],
            ].map(([value, label]) => (
              <div key={label} className="glass rounded-2xl border border-white/8 px-4 py-5 text-center">
                <p className="text-2xl sm:text-3xl font-bold font-serif text-gradient-gold">{value}</p>
                <p className="text-xs text-slate-500 mt-1">{label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <div className="section-divider" />

      <section id="platform" className="py-14 sm:py-24 relative overflow-hidden">
        <div className="orb orb-gold w-96 h-96 -left-24 bottom-0 opacity-10 pointer-events-none" />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-[0.9fr_1.1fr] gap-10 lg:gap-16 items-start mb-12">
            <div className="lg:sticky lg:top-28">
              <p className="text-gold-500 text-xs font-bold uppercase tracking-widest mb-3">One Legal Operating System</p>
              <h2 className="text-3xl sm:text-5xl font-bold font-serif leading-tight mb-5">
                Stop piecing legal work together across disconnected tools.
              </h2>
              <p className="text-slate-400 text-sm sm:text-base leading-relaxed mb-6">
                The value of CaseBuddy is not one isolated feature. It is what happens when the record, the work, the people, and the preparation all live together. Information collected during intake can inform research. Research can inform drafting. Documents can feed timelines and discovery. The same matter context can support preparation all the way through hearing or trial.
              </p>
              <div className="glass-gold rounded-2xl p-5 border border-gold-500/20">
                <p className="text-white font-semibold mb-2">The goal is simple:</p>
                <p className="text-sm text-slate-400 leading-relaxed">
                  Reduce the friction between knowing what needs to be done and actually getting it done well.
                </p>
              </div>
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              {PLATFORM_PILLARS.map((pillar) => {
                const Icon = pillar.icon;
                return (
                  <div key={pillar.title} className="card p-6 border border-white/8 hover:border-gold-500/30 transition-colors">
                    <div className="w-11 h-11 rounded-xl bg-gold-500/10 border border-gold-500/20 flex items-center justify-center mb-4">
                      <Icon size={21} className="text-gold-400" />
                    </div>
                    <h3 className="font-bold text-white mb-2">{pillar.title}</h3>
                    <p className="text-sm text-slate-400 leading-relaxed">{pillar.body}</p>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="rounded-3xl border border-white/10 bg-gradient-to-br from-slate-900/90 via-slate-900/65 to-gold-950/20 p-6 sm:p-9">
            <div className="grid lg:grid-cols-2 gap-8 items-center">
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-gold-500 mb-3">Designed for productivity that compounds</p>
                <h3 className="text-2xl sm:text-3xl font-bold font-serif mb-3">Do more than automate tasks. Build a better way to handle the matter.</h3>
                <p className="text-sm text-slate-400 leading-relaxed">
                  CaseBuddy is designed to increase leverage: fewer repetitive steps, less re-reading, less hunting for information, faster preparation, stronger continuity, and more time for judgment and advocacy.
                </p>
              </div>
              <div className="grid sm:grid-cols-2 gap-3">
                {OUTCOME_POINTS.map((point) => (
                  <div key={point} className="flex items-start gap-2.5 bg-black/20 border border-white/5 rounded-xl p-3.5">
                    <CheckCircle size={16} className="text-green-400 shrink-0 mt-0.5" />
                    <span className="text-xs sm:text-sm text-slate-300 leading-relaxed">{point}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="workflow" className="py-14 sm:py-24 bg-gradient-to-b from-transparent via-slate-900/30 to-transparent">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-10 sm:mb-14">
            <p className="text-gold-500 text-xs font-bold uppercase tracking-widest mb-3">From problem to prepared case</p>
            <h2 className="text-3xl sm:text-5xl font-bold font-serif mb-4">The matter stays connected from beginning to end.</h2>
            <p className="text-slate-400 max-w-3xl mx-auto text-sm sm:text-base">
              CaseBuddy is built around the case—not around separate apps. Each step adds context that can make the next step faster and more useful.
            </p>
          </div>

          <div className="grid md:grid-cols-5 gap-4">
            {WORKFLOW_STEPS.map((item, index) => {
              const Icon = item.icon;
              return (
                <div key={item.step} className="relative rounded-2xl bg-slate-900/70 border border-white/8 p-5">
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-xs font-black text-slate-600">{item.step}</span>
                    <div className="w-9 h-9 rounded-lg bg-gold-500/10 border border-gold-500/20 flex items-center justify-center">
                      <Icon size={18} className="text-gold-400" />
                    </div>
                  </div>
                  <p className="font-bold text-sm text-white mb-2">{item.title}</p>
                  <p className="text-xs text-slate-400 leading-relaxed">{item.body}</p>
                  {index < WORKFLOW_STEPS.length - 1 && (
                    <ChevronRight size={18} className="hidden md:block absolute -right-3 top-1/2 -translate-y-1/2 text-slate-600 z-10" />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section id="scale" className="py-14 sm:py-24 relative overflow-hidden">
        <div className="orb orb-violet w-96 h-96 right-[-8rem] top-0 opacity-10 pointer-events-none" />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-10 sm:mb-14">
            <p className="text-gold-500 text-xs font-bold uppercase tracking-widest mb-3">Built to scale with the legal work</p>
            <h2 className="text-3xl sm:text-5xl font-bold font-serif mb-4">Different users. Same mission: handle the matter better.</h2>
            <p className="text-slate-400 max-w-3xl mx-auto text-sm sm:text-base">
              CaseBuddy does not become a different product when the user changes. The workspace grows from individual case assistance to coordinated firm operations.
            </p>
          </div>

          <div className="grid lg:grid-cols-3 gap-5">
            {SCALE_PROFILES.map((profile) => {
              const Icon = profile.icon;
              const accentClasses = profile.accent === 'gold'
                ? 'border-gold-500/25 bg-gold-500/[0.045] text-gold-400'
                : profile.accent === 'violet'
                  ? 'border-violet-500/25 bg-violet-500/[0.045] text-violet-400'
                  : 'border-blue-500/25 bg-blue-500/[0.045] text-blue-400';
              return (
                <div key={profile.eyebrow} className={`rounded-3xl border p-6 sm:p-7 ${accentClasses}`}>
                  <div className="flex items-center gap-3 mb-5">
                    <div className="w-11 h-11 rounded-xl bg-black/20 border border-current/20 flex items-center justify-center">
                      <Icon size={21} />
                    </div>
                    <p className="text-xs uppercase tracking-widest font-bold">{profile.eyebrow}</p>
                  </div>
                  <h3 className="text-xl sm:text-2xl font-bold font-serif text-white mb-3 leading-tight">{profile.title}</h3>
                  <p className="text-sm text-slate-400 leading-relaxed mb-5">{profile.body}</p>
                  <ul className="space-y-2.5">
                    {profile.bullets.map((bullet) => (
                      <li key={bullet} className="flex items-start gap-2 text-sm text-slate-300">
                        <CheckCircle size={14} className="text-green-400 shrink-0 mt-0.5" />
                        {bullet}
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>

          <div className="mt-7 glass-gold rounded-2xl p-5 sm:p-7 flex flex-col md:flex-row items-start md:items-center justify-between gap-5">
            <div>
              <p className="font-bold text-white text-lg mb-1">Start with one matter. Keep the same platform as the workload grows.</p>
              <p className="text-sm text-slate-400">No artificial split between an individual product and a law-firm product. It is CaseBuddy throughout.</p>
            </div>
            <Link to="/pricing" className="btn-gold shrink-0">Compare Plans <ArrowRight size={16} /></Link>
          </div>
        </div>
      </section>

      <section id="capabilities" className="py-14 sm:py-24 bg-gradient-to-b from-transparent via-slate-900/20 to-transparent">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-[0.8fr_1.2fr] gap-10 lg:gap-16 items-start">
            <div>
              <p className="text-gold-500 text-xs font-bold uppercase tracking-widest mb-3">Capabilities</p>
              <h2 className="text-3xl sm:text-5xl font-bold font-serif mb-4">A broad legal toolkit that works from shared context.</h2>
              <p className="text-sm sm:text-base text-slate-400 leading-relaxed mb-6">
                The platform combines specialized legal workflows without turning the experience into a maze of disconnected products. Use only what the matter needs—or bring multiple capabilities together around the same record.
              </p>
              <Link to="/app" className="btn-gold inline-flex">Explore CaseBuddy <ArrowRight size={16} /></Link>
            </div>

            <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
              {FEATURES.map((feature) => {
                const Icon = feature.icon;
                return (
                  <div key={feature.title} className="card p-5 border border-white/8 hover:border-gold-500/25 transition-colors">
                    <div className="w-10 h-10 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center mb-3">
                      <Icon size={19} className="text-gold-400" />
                    </div>
                    <p className="font-semibold text-white text-sm mb-1.5">{feature.title}</p>
                    <p className="text-xs text-slate-400 leading-relaxed">{feature.body}</p>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="mt-12 grid lg:grid-cols-2 gap-5">
            <div className="rounded-3xl border border-white/8 bg-slate-900/65 p-6 sm:p-8">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-11 h-11 rounded-xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center">
                  <Network size={21} className="text-violet-400" />
                </div>
                <div>
                  <p className="text-xs uppercase tracking-widest text-violet-400 font-bold">Specialized workflows</p>
                  <h3 className="text-xl font-bold font-serif">A coordinated CaseBuddy team</h3>
                </div>
              </div>
              <p className="text-sm text-slate-400 leading-relaxed mb-5">
                Specialized workflows can focus on research, drafting, trial preparation, jury analysis, deadlines, intake, and other recurring work while staying connected to the same matter.
              </p>
              <div className="flex flex-wrap gap-2">
                {OPERATIONAL_AGENTS.map((agent) => (
                  <span key={agent.id} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/[0.035] border border-white/8 text-xs text-slate-300">
                    <span>{agent.emoji}</span>{agent.name}
                  </span>
                ))}
              </div>
            </div>

            <div className="rounded-3xl border border-white/8 bg-slate-900/65 p-6 sm:p-8">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-11 h-11 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
                  <Scale size={21} className="text-blue-400" />
                </div>
                <div>
                  <p className="text-xs uppercase tracking-widest text-blue-400 font-bold">Practice-area support</p>
                  <h3 className="text-xl font-bold font-serif">Focused assistance across legal domains</h3>
                </div>
              </div>
              <p className="text-sm text-slate-400 leading-relaxed mb-5">
                Practice-area assistants provide focused analysis across the platform&apos;s supported legal domains without changing the CaseBuddy identity or forcing users into a separate product.
              </p>
              <div className="flex flex-wrap gap-2">
                {LEGAL_SPECIALISTS.map((specialist) => (
                  <span key={specialist.id} className="px-2.5 py-1 rounded-full bg-white/[0.035] border border-white/8 text-xs text-slate-300">
                    {specialist.practiceArea}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="py-14 sm:py-20">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="rounded-3xl border border-gold-500/20 bg-gradient-to-br from-gold-500/[0.08] via-slate-900/80 to-violet-500/[0.06] p-7 sm:p-10 text-center">
            <Zap size={28} className="text-gold-400 mx-auto mb-4" />
            <p className="text-gold-500 text-xs font-bold uppercase tracking-widest mb-3">Why CaseBuddy</p>
            <h2 className="text-3xl sm:text-4xl font-bold font-serif mb-4">Legal work is too important for scattered systems and wasted motion.</h2>
            <p className="text-slate-400 max-w-3xl mx-auto text-sm sm:text-base leading-relaxed mb-7">
              CaseBuddy is built to help people and legal teams spend more of their time on the work that changes outcomes: understanding the facts, finding the issue, making the argument, preparing the witness, meeting the deadline, serving the client, and being ready when it matters.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link to="/app" className="btn-gold text-base px-8 py-3.5">Start Using CaseBuddy <ArrowRight size={18} /></Link>
              <Link to="/pricing" className="btn-ghost text-base px-8 py-3.5">View Pricing</Link>
            </div>
          </div>
        </div>
      </section>

      <section id="security" className="py-14 sm:py-20 border-t border-white/5">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-10">
            <p className="text-gold-500 text-xs font-bold uppercase tracking-widest mb-3">Security & transparency</p>
            <h2 className="text-2xl sm:text-4xl font-bold font-serif mb-3">Serious legal work needs serious boundaries.</h2>
            <p className="text-sm text-slate-400 max-w-2xl mx-auto">The platform is being built around private case data, scoped access, controlled credentials, and clear limits on what automated assistance means.</p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {TRUST_POINTS.map((point) => {
              const Icon = point.icon;
              return (
                <div key={point.title} className="card p-5 text-center flex flex-col items-center border border-white/8">
                  <div className="w-10 h-10 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center mb-3">
                    <Icon size={18} className="text-gold-400" />
                  </div>
                  <p className="font-semibold text-white text-sm mb-2">{point.title}</p>
                  <p className="text-xs text-slate-500 leading-relaxed">{point.body}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section className="py-14 sm:py-24 relative overflow-hidden">
        <div className="orb orb-gold w-[520px] h-[520px] -top-24 left-1/2 -translate-x-1/2 opacity-15" />
        <div className="max-w-4xl mx-auto px-4 relative z-10 text-center">
          <div className="card-premium p-7 sm:p-11">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gold-500/10 border border-gold-500/20 mb-5 glow-gold-sm">
              <Gavel size={25} className="text-gold-400" />
            </div>
            <h2 className="text-3xl sm:text-5xl font-bold font-serif mb-4">
              Handle more. Prepare better.
              <span className="block text-gradient-gold">Make every legal matter more manageable.</span>
            </h2>
            <p className="text-slate-400 max-w-2xl mx-auto mb-8 text-sm sm:text-lg leading-relaxed">
              CaseBuddy brings the work into one place so individuals, attorneys, paralegals, and firms can accomplish more with the time and resources they already have.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link to="/app" className="btn-gold text-base px-8 py-3.5 glow-gold">Open CaseBuddy <ArrowRight size={18} /></Link>
              <Link to="/pricing" className="btn-ghost text-base px-8 py-3.5">See Plans</Link>
            </div>
          </div>
        </div>
      </section>

      <footer className="border-t border-white/5 py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row justify-between items-center gap-6">
            <Link to="/" className="flex items-center gap-2.5">
              <div className="p-1.5 rounded-lg bg-gold-500/10 border border-gold-500/20">
                <Gavel size={20} className="text-gold-400" />
              </div>
              <div>
                <span className="block text-base font-serif font-bold">CaseBuddy</span>
                <span className="block text-[10px] uppercase tracking-[0.2em] text-slate-600">Legal work, unified</span>
              </div>
            </Link>

            <div className="flex flex-wrap justify-center gap-6 text-sm text-slate-500">
              <Link to="/pricing" className="hover:text-white transition-colors">Pricing</Link>
              <Link to="/app/guide" className="hover:text-white transition-colors">User Guide</Link>
              <Link to="/privacy-policy" className="hover:text-white transition-colors">Privacy</Link>
              <Link to="/tos" className="hover:text-white transition-colors">Terms</Link>
              <a href="mailto:support@casebuddy.live" className="hover:text-white transition-colors">Support</a>
            </div>

            <p className="text-xs text-slate-600">© {new Date().getFullYear()} CaseBuddy. Legal assistance software; no outcome guaranteed.</p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default LandingPage;
