
import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Scale, Mic, Users, BrainCircuit, TrendingUp, CheckCircle, Zap, Shield,
  Star, ArrowRight, Menu, X, FileAudio, Gavel, UserCheck, ClipboardList,
  FileText, Mail, Archive, BookOpen, ChevronRight, PhoneCall, Network,
  Inbox, BarChart3, Lock, UserCog, Download, Globe, AlertTriangle
} from 'lucide-react';
import { OPERATIONAL_AGENTS, LEGAL_SPECIALISTS } from '../agents/personas';

/* ─── Static data ────────────────────────────────────────────────────────── */

const FEATURES = [
  {
    icon: Mic,
    title: 'Live Voice Trial Simulation',
    description: 'Real-time AI opposing counsel with live objections, coaching tips, and rhetorical scoring — just like in court.',
    color: 'text-gold-400',
    bg: 'bg-gold-500/10',
    border: 'border-gold-500/20',
  },
  {
    icon: Scale,
    title: '12 Specialist AI Lawyers',
    description: 'Multi-turn consultations with AI attorneys in Criminal, IP, Family, Immigration, Corporate, Tax, and 6 more practice areas.',
    color: 'text-violet-400',
    bg: 'bg-violet-500/10',
    border: 'border-violet-500/20',
  },
  {
    icon: Users,
    title: 'Full Jury Simulator',
    description: '6 diverse AI jurors react to your arguments in real time. Run deliberations and get verdicts with confidence scores.',
    color: 'text-cyan-400',
    bg: 'bg-cyan-500/10',
    border: 'border-cyan-500/20',
  },
  {
    icon: UserCheck,
    title: 'Witness Prep Packages',
    description: 'AI generates direct/cross exam questions, impeachment strategy, credibility assessment, and printable PDF packages.',
    color: 'text-gold-400',
    bg: 'bg-gold-500/10',
    border: 'border-gold-500/20',
  },
  {
    icon: BrainCircuit,
    title: 'Case Strategy Analysis',
    description: 'AI thinking models analyze your case, identify risks, predict opponent tactics, and surface opportunities.',
    color: 'text-blue-400',
    bg: 'bg-blue-500/10',
    border: 'border-blue-500/20',
  },
  {
    icon: TrendingUp,
    title: 'Verdict & Settlement Predictor',
    description: 'Data-driven win probability, damages range estimation, and settlement sweet-spot analysis for any case type.',
    color: 'text-green-400',
    bg: 'bg-green-500/10',
    border: 'border-green-500/20',
  },
  {
    icon: FileAudio,
    title: 'Transcription & OCR',
    description: 'Convert depositions, hearings, and evidence documents to searchable text with speaker diarization.',
    color: 'text-orange-400',
    bg: 'bg-orange-500/10',
    border: 'border-orange-500/20',
  },
  {
    icon: FileText,
    title: 'AI Document Drafting',
    description: 'Motions, demand letters, briefs, discovery requests, opening and closing statements — drafted in seconds.',
    color: 'text-pink-400',
    bg: 'bg-pink-500/10',
    border: 'border-pink-500/20',
  },
  {
    icon: ClipboardList,
    title: 'Deposition Prep',
    description: 'AI generates comprehensive question outlines organized by topic, purpose, and legal strategy.',
    color: 'text-teal-400',
    bg: 'bg-teal-500/10',
    border: 'border-teal-500/20',
  },
];

const STATS = [
  { value: '8', label: 'AI Agent Specialists', suffix: '+' },
  { value: '12', label: 'Practice Area Lawyers', suffix: '' },
  { value: '15', label: 'Legal AI Tools', suffix: '+' },
  { value: '24/7', label: 'AI Availability', suffix: '' },
];

const PIPELINE_STEPS = [
  {
    step: '01',
    icon: PhoneCall,
    color: 'text-violet-400',
    bg: 'bg-violet-500/10',
    border: 'border-violet-500/20',
    title: 'Client clicks your intake link',
    body: 'Share one link — in your email signature, on your website, via text. No login, no forms. The client taps the link on any device.',
  },
  {
    step: '02',
    icon: Mic,
    color: 'text-blue-400',
    bg: 'bg-blue-500/10',
    border: 'border-blue-500/20',
    title: 'Maya greets them by voice',
    body: 'Your AI intake specialist welcomes the prospect, conducts a professional intake interview, and gathers everything needed to evaluate the case.',
  },
  {
    step: '03',
    icon: BarChart3,
    color: 'text-gold-400',
    bg: 'bg-gold-500/10',
    border: 'border-gold-500/20',
    title: 'AI scores and routes the case',
    body: 'Gemini analyzes the transcript, scores the case 0–100, decides Accept / Review / Deny, and routes it to the right specialist department automatically.',
  },
  {
    step: '04',
    icon: Inbox,
    color: 'text-green-400',
    bg: 'bg-green-500/10',
    border: 'border-green-500/20',
    title: 'Lead arrives in your Inbox — live',
    body: 'You see the score, transcript, and routing recommendation in real time. On any device. Accept the lead with one tap.',
  },
  {
    step: '05',
    icon: Network,
    color: 'text-orange-400',
    bg: 'bg-orange-500/10',
    border: 'border-orange-500/20',
    title: 'All 8 agents deploy automatically',
    body: 'Accept a lead and CaseBuddy creates the case file and fires all 8 AI agents in parallel. In minutes you have legal research, a motion strategy, a jury analysis, a draft document set, and a client letter — ready to go.',
  },
];

const TESTIMONIALS = [
  {
    name: 'Sarah M.',
    role: 'Criminal Defense Attorney',
    firm: 'Beta Tester',
    quote: "CaseBuddy's AI jury simulation saved us thousands in jury consultant fees and helped us win a difficult case. The 12 AI lawyers let me quickly consult on criminal procedure I haven't touched in years.",
    rating: 5,
  },
  {
    name: 'David C.',
    role: 'Senior Litigator',
    firm: 'Beta Tester',
    quote: "The live voice simulation is like having a sparring partner 24/7. The witness prep packages are exceptional — I walked into cross-examination better prepared than I've ever been.",
    rating: 5,
  },
  {
    name: 'Maria R.',
    role: 'Trial Attorney',
    firm: 'Beta Tester',
    quote: "I use CaseBuddy before every trial. The verdict predictor, the jury simulator, the strategy analysis — this is what BigLaw clients pay consultants six figures for.",
    rating: 5,
  },
];
const PRACTICE_AREAS = [
  'Criminal Defense', 'Personal Injury', 'Family Law', 'Immigration',
  'IP & Patent', 'Corporate', 'Employment', 'Real Estate',
  'Bankruptcy', 'Civil Litigation', 'Estate Planning', 'Tax Law',
];


const PRO_SE_BENEFITS = [
  { icon: BookOpen,   title: 'Understand What\'s Happening',  body: 'Plain-language explanations of legal documents, court orders, and procedures. No law degree required.' },
  { icon: FileText,   title: 'Draft Real Legal Documents',     body: 'Motions, answers, declarations, and demand letters — AI-drafted, legally structured, and ready to file.' },
  { icon: UserCheck,  title: 'Prepare for Hearings',           body: 'Practice your arguments, prep witness questions, and walk into court knowing exactly what to say.' },
  { icon: Scale,      title: 'Consult 12 AI Lawyers',          body: 'Ask any legal question across 12 practice areas. Get real analysis, not generic disclaimers.' },
  { icon: TrendingUp, title: 'Know Your Odds',                 body: 'Verdict predictor and case strength analysis tell you where you stand before you step into court.' },
  { icon: Shield,     title: 'Fight Back on Equal Footing',    body: 'BigLaw has teams of attorneys and consultants. CaseBuddy gives you the same firepower — for $99/mo.' },
];

const ATTORNEY_BENEFITS = [
  { icon: PhoneCall,  title: 'Never Miss a Lead Again',        body: 'Maya answers your intake line 24/7, conducts a full intake interview, scores the case, and routes it to your inbox — while you sleep.' },
  { icon: Network,    title: '8 Agents Fire in Parallel',      body: 'Accept a lead and CaseBuddy deploys research, strategy, drafts, jury analysis, and a client letter simultaneously.' },
  { icon: UserCog,    title: 'Your Own AI Legal Team',         body: 'Lex on research, Doc on drafting, Rex on trial prep, Jules on jury psych, Sol on deadlines — a full firm behind every case.' },
  { icon: FileText,   title: 'Draft 10x Faster',               body: 'Motions, briefs, demand letters, discovery — generated in seconds with your case context already loaded.' },
  { icon: Mic,        title: 'Trial-Ready Every Time',         body: 'Live voice simulation with objections, witness prep packages, and verdict prediction before you step in court.' },
  { icon: BarChart3,  title: 'Built for Solo Practitioners',   body: 'No BigLaw budget needed. CaseBuddy gives solo attorneys and small firms the same AI firepower at a fraction of the cost.' },
];

const TRUST_POINTS = [
  { icon: Lock,          title: 'Your Data Stays Yours',          body: 'Cases, documents, and transcripts are stored in your account only. We never use your data to train models or share it with third parties.' },
  { icon: Download,      title: 'Export Everything, Anytime',     body: 'One-click export of all your cases, documents, and session history in standard formats. No lock-in, ever.' },
  { icon: Globe,         title: 'Works Anywhere, No Install',     body: 'Fully browser-based. Works on desktop, tablet, and mobile. No download, no plugin, no IT department required.' },
  { icon: AlertTriangle, title: 'AI Assistance, Not Legal Advice', body: 'CaseBuddy helps you prepare, research, and draft. It does not replace a licensed attorney and does not create an attorney-client relationship.' },
];

/* ─── Sub-components ─────────────────────────────────────────────────────── */

const NavLink = ({ href, children }: { href: string; children: React.ReactNode }) => (
  <a href={href} className="text-slate-400 hover:text-white transition-colors text-sm font-medium">{children}</a>
);

const StarRating = ({ rating }: { rating: number }) => (
  <div className="flex gap-0.5">
    {[...Array(rating)].map((_, i) => (
      <Star key={i} size={14} className="text-gold-500 fill-gold-500" />
    ))}
  </div>
);

/* ─── Page ─────────────────────────────────────────────────────────────────── */

const LandingPage = () => {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="min-h-screen bg-[#020617] text-white overflow-x-hidden">

      {/* ── Navigation ───────────────────────────────────────────────────── */}
      <nav className="glass-dark sticky top-0 z-50 border-b border-white/5">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2.5 group">
            <div className="p-1.5 rounded-lg bg-gold-500/10 border border-gold-500/20 group-hover:glow-gold-sm transition-all">
              <Gavel size={22} className="text-gold-400" />
            </div>
            <span className="text-lg font-serif font-bold tracking-tight">CaseBuddy</span>
          </Link>

          <div className="hidden md:flex items-center gap-6">
            <NavLink href="#pipeline">How It Works</NavLink>
            <NavLink href="#features">Features</NavLink>
            <NavLink href="#agents">AI Team</NavLink>
            <NavLink href="#pro-se">Pro Se</NavLink>
            <NavLink href="#attorneys">Attorneys</NavLink>
            <NavLink href="#testimonials">Reviews</NavLink>
            <Link to="/pricing" className="text-slate-400 hover:text-white transition-colors text-sm font-medium">Pricing</Link>
          </div>

          <div className="hidden md:flex items-center gap-3">
            <Link to="/app" className="btn-ghost text-sm px-4 py-2">Sign In</Link>
            <Link to="/app" className="btn-gold text-sm px-5 py-2">
              Start Free Trial <ArrowRight size={15} />
            </Link>
          </div>

          <button onClick={() => setMobileOpen(!mobileOpen)} className="md:hidden p-2 text-slate-400 hover:text-white">
            {mobileOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>

        {mobileOpen && (
          <div className="md:hidden border-t border-white/5 px-4 py-4 space-y-3 animate-slide-up">
            {['#features','#agents','#lawyers','#testimonials'].map(href => (
              <a key={href} href={href} onClick={() => setMobileOpen(false)}
                className="block text-slate-300 hover:text-white py-1.5 capitalize text-sm">
                {href.replace('#','')}
              </a>
            ))}
            <Link to="/pricing" className="block text-slate-300 hover:text-white py-1.5 text-sm" onClick={() => setMobileOpen(false)}>Pricing</Link>
            <Link to="/app" className="btn-gold w-full justify-center mt-2" onClick={() => setMobileOpen(false)}>
              Launch App <ArrowRight size={15} />
            </Link>
          </div>
        )}
      </nav>

      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section className="relative min-h-[90vh] flex items-center overflow-hidden">
        {/* Glow orbs */}
        <div className="orb orb-gold w-[600px] h-[600px] -top-40 -left-40 animate-float" />
        <div className="orb orb-violet w-[400px] h-[400px] top-20 right-10" style={{ animationDelay: '2s' }} />
        <div className="orb orb-gold w-[300px] h-[300px] bottom-20 left-1/3 opacity-10" style={{ animationDelay: '4s' }} />

        {/* Grid overlay */}
        <div className="absolute inset-0 opacity-[0.03]"
          style={{ backgroundImage: 'linear-gradient(rgba(212,175,55,1) 1px, transparent 1px), linear-gradient(90deg, rgba(212,175,55,1) 1px, transparent 1px)', backgroundSize: '60px 60px' }} />

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10 py-24 text-center">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 glass-gold rounded-full text-gold-400 text-xs font-semibold mb-8 animate-fade-in">
            <Zap size={13} />
            The Ultimate Legal Intelligence Platform
          </div>

          <h1 className="text-3xl sm:text-5xl lg:text-7xl font-bold font-serif leading-[1.1] mb-6 animate-slide-up">
            One Platform.<br />
            <span className="text-gradient-gold">Two Powerful Modes.</span>
          </h1>

          <p className="text-base sm:text-lg sm:text-xl text-slate-400 max-w-2xl mx-auto mb-10 leading-relaxed animate-slide-up" style={{ animationDelay: '0.1s' }}>
            Whether you're an individual representing yourself with <strong className="text-white">CaseBuddy CaseCompanion</strong> or a law firm deploying our full <strong className="text-white">AI Law Partner</strong> suite—CaseBuddy gives you the tools you need to win. From simple case organization to a 24/7 autonomous legal team.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center mb-12 animate-slide-up" style={{ animationDelay: '0.2s' }}>
            <Link to="/app" className="btn-gold text-base px-8 py-3.5 glow-gold">
              Start Free Trial — 14 Days Free <ArrowRight size={18} />
            </Link>
            <a href="#pipeline" className="btn-ghost text-base px-8 py-3.5">
              See How It Works
            </a>
          </div>

          <div className="flex flex-wrap justify-center gap-3 sm:gap-6 text-xs sm:text-sm text-slate-500 animate-fade-in" style={{ animationDelay: '0.3s' }}>
            {['No credit card required', '$99/mo Pro Se · $199/mo Attorney · $499/mo Firm', 'Cancel anytime'].map(t => (
              <span key={t} className="flex items-center gap-1.5">
                <CheckCircle size={14} className="text-green-500" />
                {t}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ── Stats ────────────────────────────────────────────────────────── */}
      <div className="section-divider" />
      <section className="py-12 glass">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-8">
            {STATS.map(s => (
              <div key={s.label} className="text-center">
                <p className="text-3xl sm:text-4xl font-bold text-gradient-gold font-serif mb-1">{s.value}{s.suffix}</p>
                <p className="text-xs sm:text-sm text-slate-500">{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
      <div className="section-divider" />

      {/* ── Pipeline ─────────────────────────────────────────────────────── */}
      <section id="pipeline" className="py-12 sm:py-24 relative overflow-hidden">
        <div className="orb orb-gold w-80 h-80 left-0 bottom-10 opacity-10 pointer-events-none" />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-8 sm:mb-14">
            <p className="text-gold-500 text-xs font-bold uppercase tracking-widest mb-3">The Intake Pipeline</p>
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold font-serif mb-4">From First Call to Full Case — Automatically</h2>
            <p className="text-slate-400 max-w-2xl mx-auto text-sm sm:text-base">
              Most firms spend 3–5 hours per intake — vetting, screening, creating the file, briefing the team. CaseBuddy compresses that into minutes with zero manual effort.
            </p>
          </div>

          <div className="grid md:grid-cols-5 gap-4 mb-12">
            {PIPELINE_STEPS.map((s, i) => {
              const Icon = s.icon;
              return (
                <div key={i} className={`relative flex flex-col items-start p-5 rounded-2xl border ${s.border} ${s.bg}`}>
                  <span className="text-xs font-black text-slate-600 mb-3">{s.step}</span>
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 ${s.bg} border ${s.border}`}>
                    <Icon size={20} className={s.color} />
                  </div>
                  <p className={`font-bold text-sm mb-2 ${s.color}`}>{s.title}</p>
                  <p className="text-xs text-slate-400 leading-relaxed">{s.body}</p>
                  {i < PIPELINE_STEPS.length - 1 && (
                    <div className="hidden md:block absolute -right-3 top-1/2 -translate-y-1/2 z-10">
                      <ChevronRight size={18} className="text-slate-600" />
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="glass-gold rounded-2xl p-6 sm:p-8 text-center">
            <p className="text-2xl font-bold font-serif text-white mb-2">
              The intake link that never sleeps.
            </p>
            <p className="text-slate-400 mb-6 max-w-xl mx-auto text-sm sm:text-base">
              Put your CaseBuddy intake link in your email signature today. Every prospect who clicks it gets Maya's professional voice intake — scored, routed, and waiting in your inbox by the time you check it.
            </p>
            <Link to="/app" className="btn-gold inline-flex">
              Get Your Intake Link <ArrowRight size={16} />
            </Link>
          </div>
        </div>
      </section>

      {/* ── Meet the AI Team ─────────────────────────────────────────────── */}
      <section id="agents" className="py-12 sm:py-24 relative overflow-hidden">
        <div className="orb orb-violet w-80 h-80 right-0 top-10 opacity-10 pointer-events-none" />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-8 sm:mb-14">
            <p className="text-gold-500 text-xs font-bold uppercase tracking-widest mb-3">Your AI Firm</p>
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold font-serif mb-4">Meet the Team</h2>
            <p className="text-slate-400 max-w-xl mx-auto text-sm sm:text-base">8 specialized AI agents that handle your case from intake to verdict.</p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {OPERATIONAL_AGENTS.map(agent => (
              <Link key={agent.id} to="/app"
                className={`group flex flex-col items-center gap-3 p-5 rounded-2xl border transition-all duration-200 hover-glow-gold hover:scale-105 ${agent.bgClass} ${agent.borderClass}`}>
                <div className="text-4xl">{agent.emoji}</div>
                <div className="text-center">
                  <p className={`font-bold text-sm ${agent.colorClass}`}>{agent.name}</p>
                  <p className="text-xs text-slate-500 mt-0.5 leading-tight">{agent.role}</p>
                </div>
                <div className="flex flex-wrap gap-1 justify-center">
                  {agent.capabilities.slice(0,2).map(c => (
                    <span key={c} className="text-xs bg-black/30 px-2 py-0.5 rounded-full text-slate-400">{c}</span>
                  ))}
                </div>
              </Link>
            ))}
          </div>

          <div className="text-center mt-8">
            <Link to="/app/legal-team" className="btn-ghost inline-flex">
              Meet the 12 Specialist Lawyers <ChevronRight size={16} />
            </Link>
          </div>
        </div>
      </section>

      {/* ── Specialist Lawyers ────────────────────────────────────────────── */}
      <section id="lawyers" className="py-12 sm:py-24 bg-gradient-to-b from-transparent via-slate-900/30 to-transparent">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-8 sm:mb-14">
            <p className="text-gold-500 text-xs font-bold uppercase tracking-widest mb-3">Legal Consultation</p>
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold font-serif mb-4">12 AI Lawyers On Call</h2>
            <p className="text-slate-400 max-w-xl mx-auto text-sm sm:text-base">Multi-turn consultations with AI specialists who know their practice area cold. Available 24/7. No billing clock.</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 mb-10">
            {LEGAL_SPECIALISTS.map(s => (
              <Link key={s.id} to="/app/legal-team"
                className={`group flex items-center gap-3 p-4 rounded-xl border transition-all hover:scale-[1.02] ${s.bgClass} ${s.borderClass}`}>
                <span className="text-2xl">{s.emoji}</span>
                <div className="min-w-0">
                  <p className={`font-semibold text-sm truncate ${s.colorClass}`}>{s.name}</p>
                  <p className="text-xs text-slate-500 truncate">{s.practiceArea}</p>
                </div>
              </Link>
            ))}
          </div>

          <div className="glass-gold rounded-2xl p-4 sm:p-8 flex flex-col md:flex-row items-center justify-between gap-4 sm:gap-6">
            <div>
              <p className="font-bold text-lg text-white mb-1">Consult any specialist now</p>
              <p className="text-slate-400 text-sm">Full multi-turn chat. Active case context injected automatically. Voice input supported.</p>
            </div>
            <Link to="/app/legal-team" className="btn-gold shrink-0">
              Open Legal Team <ArrowRight size={16} />
            </Link>
          </div>

          {/* Practice area pills */}
          <div className="flex flex-wrap gap-2 justify-center mt-10">
            {PRACTICE_AREAS.map(area => (
              <span key={area} className="glass border border-white/8 text-slate-400 text-xs px-3 py-1.5 rounded-full">
                {area}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ── Features ─────────────────────────────────────────────────────── */}
      <section id="features" className="py-12 sm:py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-8 sm:mb-14">
            <p className="text-gold-500 text-xs font-bold uppercase tracking-widest mb-3">Platform</p>
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold font-serif mb-4">Every Tool You Need to Win</h2>
            <p className="text-slate-400 max-w-xl mx-auto text-sm sm:text-base">CaseBuddy covers the full litigation lifecycle — from intake through verdict.</p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
            {FEATURES.map((f, i) => (
              <div key={i} className={`card group p-6 hover:border-${f.color.replace('text-','')} transition-all`}>
                <div className={`w-11 h-11 rounded-xl flex items-center justify-center mb-4 ${f.bg} border ${f.border}`}>
                  <f.icon size={22} className={f.color} />
                </div>
                <h3 className="text-base font-bold text-white mb-2">{f.title}</h3>
                <p className="text-slate-400 text-sm leading-relaxed">{f.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Testimonials ─────────────────────────────────────────────────── */}
      <section id="testimonials" className="py-12 sm:py-24 bg-gradient-to-b from-transparent via-slate-900/20 to-transparent">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-8 sm:mb-14">
            <p className="text-gold-500 text-xs font-bold uppercase tracking-widest mb-3">Beta Reviews</p>
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold font-serif mb-4">What Beta Testers Are Saying</h2>
          </div>

          <div className="grid md:grid-cols-3 gap-4 sm:gap-6">
            {TESTIMONIALS.map((t, i) => (
              <div key={i} className="card-premium p-5 sm:p-7 flex flex-col">
                <StarRating rating={t.rating} />
                <p className="text-slate-300 my-5 leading-relaxed flex-1 italic text-sm">"{t.quote}"</p>
                <div className="border-t border-white/5 pt-4">
                  <p className="font-semibold text-white text-sm">{t.name}</p>
                  <p className="text-gold-500 text-xs mt-0.5">{t.role}</p>
                  <p className="text-slate-600 text-xs mt-0.5">{t.firm}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
      {/* ── Pricing Preview ───────────────────────────────────────────────── */}
      <section className="py-12 sm:py-20">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-10">
            <p className="text-gold-500 text-xs font-bold uppercase tracking-widest mb-3">Pricing</p>
            <h2 className="text-3xl sm:text-4xl font-bold font-serif mb-3">One Billable Hour Pays for the Month</h2>
            <p className="text-slate-400 max-w-xl mx-auto text-sm sm:text-base">Every plan includes a 14-day free trial. No credit card required.</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[
              { name: 'Pro Se', price: '$99', desc: 'Self-represented individuals', color: 'text-blue-400', border: 'border-slate-700', items: ['All 15+ AI tools', '25 active cases', 'Document analysis', 'Email support'] },
              { name: 'Attorney', price: '$199', desc: 'Licensed solo attorneys', color: 'text-gold-400', border: 'border-gold-500/50', badge: 'Best Value', items: ['Everything in Pro Se', 'Voice intake pipeline', 'Firm Command (8 agents)', '12 AI lawyers on call', 'Priority support'] },
              { name: 'Law Firm', price: '$499', desc: '3+ attorney firms', color: 'text-violet-400', border: 'border-violet-500/40', items: ['Everything in Attorney', '3 seats included', '$199/mo per extra seat', 'Cloud sync', 'White-label mode'] },
            ].map(plan => (
              <div key={plan.name} className={`relative bg-slate-800/60 border-2 ${plan.border} rounded-2xl p-6 flex flex-col ${plan.badge ? 'ring-1 ring-gold-500/30' : ''}`}>
                {plan.badge && <div className="absolute -top-3 left-1/2 -translate-x-1/2"><span className="bg-gold-500 text-slate-950 text-xs font-bold px-3 py-0.5 rounded-full">{plan.badge}</span></div>}
                <p className="font-bold text-white mb-1">{plan.name}</p>
                <p className="text-xs text-slate-500 mb-3">{plan.desc}</p>
                <div className="flex items-baseline gap-1 mb-4">
                  <span className={`text-3xl font-bold ${plan.color}`}>{plan.price}</span>
                  <span className="text-slate-500 text-sm">/mo</span>
                </div>
                <ul className="space-y-1.5 flex-1 mb-5">
                  {plan.items.map(f => (
                    <li key={f} className="flex items-center gap-2 text-xs text-slate-300">
                      <CheckCircle size={12} className="text-green-400 shrink-0" />{f}
                    </li>
                  ))}
                </ul>
                <Link to="/app" className={`text-center py-2.5 rounded-xl font-bold text-sm transition-colors ${plan.badge ? 'bg-gold-500 hover:bg-gold-400 text-slate-950' : 'bg-slate-700 hover:bg-slate-600 text-white'}`}>
                  Start Free Trial
                </Link>
              </div>
            ))}
          </div>
          <div className="text-center mt-6">
            <Link to="/pricing" className="text-gold-400 hover:text-gold-300 text-sm font-semibold">
              See full pricing details & add-ons →
            </Link>
          </div>
        </div>
      </section>

      
      {/* ── For Self-Represented Litigants ───────────────────────────────── */}
      <section id="pro-se" className="py-12 sm:py-24 relative overflow-hidden">
        <div className="orb orb-gold w-80 h-80 right-0 bottom-0 opacity-10 pointer-events-none" />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-10 lg:gap-16 items-center">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 glass-gold rounded-full text-gold-400 text-xs font-bold uppercase tracking-wider mb-5">
                <UserCheck size={13} /> For Self-Represented Litigants
              </div>
              <h2 className="text-3xl sm:text-4xl font-bold font-serif mb-5 leading-tight">
                You Don&apos;t Need a Lawyer.<br />
                <span className="text-gradient-gold">You Need the Right Tools.</span>
              </h2>
              <p className="text-slate-400 mb-6 leading-relaxed text-sm sm:text-base">
                Representing yourself in court is one of the hardest things you can do. The other side has attorneys, paralegals, and consultants. CaseBuddy levels the playing field — giving you the same research, drafting, and preparation tools, in plain English, for $99/mo.
              </p>
              <Link to="/app" className="btn-gold inline-flex mb-4">
                Start Your Free Trial <ArrowRight size={16} />
              </Link>
              <p className="text-xs text-slate-600 mt-2">AI assistance only — not a substitute for licensed legal counsel.</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {PRO_SE_BENEFITS.map((b, i) => (
                <div key={i} className="card p-5">
                  <div className="w-9 h-9 rounded-xl bg-gold-500/10 border border-gold-500/20 flex items-center justify-center mb-3">
                    <b.icon size={18} className="text-gold-400" />
                  </div>
                  <p className="font-semibold text-white text-sm mb-1">{b.title}</p>
                  <p className="text-xs text-slate-400 leading-relaxed">{b.body}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── For Attorneys & Small Firms ───────────────────────────────────── */}
      <section id="attorneys" className="py-12 sm:py-24 bg-gradient-to-b from-transparent via-slate-900/30 to-transparent relative overflow-hidden">
        <div className="orb orb-violet w-80 h-80 left-0 top-10 opacity-10 pointer-events-none" />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-10 lg:gap-16 items-center">
            <div className="order-2 lg:order-1 grid grid-cols-1 sm:grid-cols-2 gap-4">
              {ATTORNEY_BENEFITS.map((b, i) => (
                <div key={i} className="card p-5">
                  <div className="w-9 h-9 rounded-xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center mb-3">
                    <b.icon size={18} className="text-violet-400" />
                  </div>
                  <p className="font-semibold text-white text-sm mb-1">{b.title}</p>
                  <p className="text-xs text-slate-400 leading-relaxed">{b.body}</p>
                </div>
              ))}
            </div>
            <div className="order-1 lg:order-2">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-violet-500/10 border border-violet-500/30 text-violet-400 text-xs font-bold uppercase tracking-wider mb-5">
                <Scale size={13} /> For Solo Attorneys &amp; Small Firms
              </div>
              <h2 className="text-3xl sm:text-4xl font-bold font-serif mb-5 leading-tight">
                A Full Firm.<br />
                <span className="text-gradient-gold">Without the Overhead.</span>
              </h2>
              <p className="text-slate-400 mb-6 leading-relaxed text-sm sm:text-base">
                BigLaw clients pay seven figures for teams of associates, paralegals, jury consultants, and AI tools. CaseBuddy packages all of that into one platform. Your intake is automated. Your agents are deployed. Your case is prepped. All before your morning coffee.
              </p>
              <Link to="/app" className="btn-gold inline-flex">
                Get Your Intake Link Today <ArrowRight size={16} />
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ── Trust & Privacy ───────────────────────────────────────────────── */}
      <section id="trust" className="py-12 sm:py-20">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-10">
            <p className="text-gold-500 text-xs font-bold uppercase tracking-widest mb-3">Security &amp; Transparency</p>
            <h2 className="text-2xl sm:text-3xl font-bold font-serif mb-3">Built to Be Trusted with Your Cases</h2>
            <p className="text-slate-400 max-w-xl mx-auto text-sm">Legal work is sensitive. Here is exactly how we handle it.</p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {TRUST_POINTS.map((t, i) => (
              <div key={i} className="card p-5 text-center flex flex-col items-center">
                <div className="w-10 h-10 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center mb-3">
                  <t.icon size={18} className="text-slate-400" />
                </div>
                <p className="font-semibold text-white text-sm mb-2">{t.title}</p>
                <p className="text-xs text-slate-500 leading-relaxed">{t.body}</p>
              </div>
            ))}
          </div>
          <div className="mt-8 flex flex-wrap justify-center gap-4 text-xs text-slate-500">
            <Link to="/privacy-policy" className="hover:text-white transition-colors underline underline-offset-2">Privacy Policy</Link>
            <Link to="/tos" className="hover:text-white transition-colors underline underline-offset-2">Terms of Service</Link>
            <span className="text-slate-700">·</span>
            <span>AI outputs are for assistance only and do not constitute legal advice.</span>
          </div>
        </div>
      </section>

{/* ── CTA ──────────────────────────────────────────────────────────── */}
      <section className="py-12 sm:py-24 relative overflow-hidden">
        <div className="orb orb-gold w-[500px] h-[500px] -top-20 left-1/2 -translate-x-1/2 opacity-20" />
        <div className="max-w-3xl mx-auto px-4 text-center relative z-10">
          <div className="card-premium p-6 sm:p-10 md:p-12">
            <div className="inline-flex items-center justify-center w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-gold-500/10 border border-gold-500/20 mb-5 sm:mb-6 glow-gold-sm">
              <Scale size={26} className="text-gold-400" />
            </div>
            <h2 className="text-2xl sm:text-4xl font-bold font-serif mb-3 sm:mb-4">
              Your competitors are already using AI.<br />
              <span className="text-gradient-gold">Are you?</span>
            </h2>
            <p className="text-slate-400 mb-6 sm:mb-8 text-base sm:text-lg">
              The attorneys winning today aren't working harder — they're working with better tools. CaseBuddy gives every solo practitioner and small firm the same AI firepower that BigLaw pays seven figures for.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link to="/app" className="btn-gold text-base px-8 py-3.5 glow-gold">
                Start Your Free Trial <ArrowRight size={18} />
              </Link>
              <Link to="/pricing" className="btn-ghost text-base px-8 py-3.5">
                View Pricing
              </Link>
            </div>
            <p className="mt-5 text-xs text-slate-600">14-day free trial · No credit card required · Cancel anytime</p>
          </div>
        </div>
      </section>

      {/* ── Trust & Security ─────────────────────────────────────────── */}
      <section className="py-16 sm:py-20 border-t border-white/5">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-2xl sm:text-3xl font-serif font-bold mb-8">
            Built for <span className="text-gradient-gold">Legal Professionals</span>
          </h2>
          <div className="grid sm:grid-cols-3 gap-6">
            <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800">
              <Shield size={28} className="text-gold-400 mx-auto mb-3" />
              <h3 className="text-white font-semibold mb-2">Your Data, Your Control</h3>
              <p className="text-sm text-slate-400 leading-relaxed">Data stored locally or in your private Supabase instance. Export or delete all data anytime. No vendor lock-in.</p>
            </div>
            <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800">
              <Lock size={28} className="text-gold-400 mx-auto mb-3" />
              <h3 className="text-white font-semibold mb-2">Secure by Design</h3>
              <p className="text-sm text-slate-400 leading-relaxed">API keys server-side, encrypted auth via Supabase, Row Level Security. Your cases are private to your firm.</p>
            </div>
            <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800">
              <AlertTriangle size={28} className="text-gold-400 mx-auto mb-3" />
              <h3 className="text-white font-semibold mb-2">AI-Assisted, Not AI-Replaced</h3>
              <p className="text-sm text-slate-400 leading-relaxed">CaseBuddy is a tool, not a lawyer. AI outputs require attorney review. Clear disclaimers on every AI-generated work product.</p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Footer ───────────────────────────────────────────────────────── */}
      <footer className="border-t border-white/5 py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row justify-between items-center gap-6">
            <Link to="/" className="flex items-center gap-2.5">
              <div className="p-1.5 rounded-lg bg-gold-500/10 border border-gold-500/20">
                <Gavel size={20} className="text-gold-400" />
              </div>
              <span className="text-base font-serif font-bold">CaseBuddy</span>
            </Link>

            <div className="flex flex-wrap justify-center gap-6 text-sm text-slate-500">
              <Link to="/pricing" className="hover:text-white transition-colors">Pricing</Link>
              <Link to="/app/guide" className="hover:text-white transition-colors">User Guide</Link>
              <Link to="/privacy-policy" className="hover:text-white transition-colors">Privacy</Link>
              <Link to="/tos" className="hover:text-white transition-colors">Terms</Link>
              <a href="mailto:support@casebuddy.live" className="hover:text-white transition-colors">Support</a>
            </div>

            <p className="text-xs text-slate-600">© {new Date().getFullYear()} CaseBuddy. Not legal advice.</p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default LandingPage;
