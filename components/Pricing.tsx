
import React from 'react';
import { Link } from 'react-router-dom';
import { Check, Zap, Building2, Scale, ArrowRight, Shield, UserCheck } from 'lucide-react';

const PLANS = [
  {
    id: 'pro-se',
    name: 'Pro Se',
    price: '$99',
    period: '/month',
    description: 'For self-represented individuals navigating the legal system.',
    icon: Scale,
    color: 'text-blue-400',
    border: 'border-slate-700',
    badge: null,
    features: [
      'All 15+ AI legal tools',
      'Up to 25 active cases',
      'Unlimited document analysis',
      'Jury simulator & verdict predictor',
      'AI document drafting',
      'Deposition & witness prep',
      'Evidence vault',
      'Statement builder with teleprompter',
      'Transcription & OCR',
      'Email support',
    ],
    cta: 'Start Free Trial',
    href: '/app',
    trial: '14-day free trial, no credit card required',
  },
  {
    id: 'attorney',
    name: 'Attorney',
    price: '$199',
    period: '/month',
    description: 'For licensed solo attorneys who demand peak performance.',
    icon: UserCheck,
    color: 'text-gold-400',
    border: 'border-gold-500/50',
    badge: 'Best Value',
    features: [
      'Everything in Pro Se',
      'Voice intake pipeline (Maya AI)',
      'Firm Command — 8-agent orchestration',
      'Talk to the Firm — live voice AI lawyers',
      '12 specialist AI lawyers on call',
      'Live trial simulation with AI opposing counsel',
      'Advanced strategy (Gemini 2.5 Pro thinking models)',
      'FOIA & records request automation',
      'Deadline tracker with reminders',
      'Priority email & chat support',
    ],
    cta: 'Start Free Trial',
    href: '/app',
    trial: '14-day free trial, no credit card required',
  },
  {
    id: 'firm',
    name: 'Law Firm',
    price: '$499',
    period: '/month',
    description: 'For firms of 3+ attorneys. Includes team seats and firm-level features.',
    icon: Building2,
    color: 'text-violet-400',
    border: 'border-violet-500/40',
    badge: null,
    features: [
      'Everything in Attorney',
      '3 attorney seats included',
      '$199/mo per additional seat after 3',
      'Unlimited active cases',
      'Cloud sync via Supabase (cross-device)',
      'White-label mode (firm name & logo)',
      'Shared intake inbox with live lead feed',
      'Custom AI prompt templates',
      'Bulk export (PDF, Word)',
      'API integration support',
      'Audit log & session history',
      'Priority phone support',
    ],
    cta: 'Start Free Trial',
    href: '/app',
    trial: '14-day free trial, no credit card required',
  },
];

const ADD_ONS = [
  { name: 'Additional Seat', price: '$199/mo', description: 'Add attorneys, paralegals, or staff (Firm plan only)' },
  { name: 'SMS Deadline Alerts (Twilio)', price: '$29/mo', description: 'Text reminders 48hr, 24hr, 2hr before deadlines' },
  { name: 'E-Signature (DocuSign)', price: '$49/mo', description: 'Send documents for signature directly from CaseBuddy' },
  { name: 'Legal Research (CourtListener)', price: 'Free', description: 'Real case law integration — free tier available' },
  { name: 'Court Filing (Tyler Tech)', price: 'By state', description: 'Direct e-filing to participating courts' },
];

const PricingCard = ({ plan, featured }: { plan: typeof PLANS[0]; featured?: boolean }) => {
  const Icon = plan.icon;
  return (
    <div className={`relative bg-slate-800 border-2 ${plan.border} rounded-2xl p-7 flex flex-col ${featured ? 'ring-2 ring-gold-500/30 shadow-2xl shadow-gold-500/10 scale-[1.02]' : ''}`}>
      {plan.badge && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2">
          <span className="bg-gold-500 text-slate-950 text-xs font-bold px-4 py-1 rounded-full">{plan.badge}</span>
        </div>
      )}

      <div className="flex items-center gap-3 mb-4">
        <div className="p-2 rounded-xl bg-slate-900 border border-slate-700">
          <Icon size={22} className={plan.color} />
        </div>
        <div>
          <h3 className="text-lg font-bold text-white">{plan.name}</h3>
          <p className="text-xs text-slate-400 leading-snug mt-0.5">{plan.description}</p>
        </div>
      </div>

      <div className="mb-6">
        <div className="flex items-baseline gap-1">
          <span className={`text-4xl font-bold ${plan.color}`}>{plan.price}</span>
          <span className="text-slate-400 text-sm">{plan.period}</span>
        </div>
        {plan.trial && (
          <p className="text-xs text-green-400 mt-1">✓ {plan.trial}</p>
        )}
      </div>

      <ul className="space-y-2.5 flex-1 mb-8">
        {plan.features.map(f => (
          <li key={f} className="flex items-start gap-2.5 text-sm text-slate-300">
            <Check size={15} className="text-green-400 mt-0.5 shrink-0" />
            {f}
          </li>
        ))}
      </ul>

      <Link to={plan.href}
        className={`w-full py-3 rounded-xl font-bold text-center transition-colors flex items-center justify-center gap-2 ${
          featured
            ? 'bg-gold-500 hover:bg-gold-400 text-slate-950'
            : plan.id === 'firm'
            ? 'bg-violet-600 hover:bg-violet-500 text-white'
            : 'bg-slate-700 hover:bg-slate-600 text-white'
        }`}>
        {plan.cta}
        <ArrowRight size={16} />
      </Link>
    </div>
  );
};

const Pricing: React.FC = () => (
  <div className="min-h-screen bg-slate-950 text-white">
    <div className="max-w-6xl mx-auto px-6 py-20">
      {/* Header */}
      <div className="text-center mb-16">
        <div className="flex items-center justify-center gap-2 mb-4">
          <Scale size={28} className="text-gold-500" />
          <span className="text-gold-500 font-bold text-lg">CaseBuddy</span>
        </div>
        <h1 className="text-4xl md:text-5xl font-bold font-serif mb-4">
          Simple, Transparent Pricing
        </h1>
        <p className="text-slate-400 text-lg max-w-xl mx-auto">
          The AI legal platform that pays for itself with the first case it helps you win.
        </p>
      </div>

      {/* Plans */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-16 items-start">
        {PLANS.map(plan => (
          <PricingCard key={plan.id} plan={plan} featured={plan.id === 'attorney'} />
        ))}
      </div>

      {/* Extra seat callout */}
      <div className="bg-violet-500/10 border border-violet-500/30 rounded-2xl p-6 mb-12 flex flex-col sm:flex-row items-center gap-4 justify-between">
        <div>
          <p className="font-bold text-white text-base mb-1">Scaling your firm?</p>
          <p className="text-slate-400 text-sm">The Firm plan includes 3 attorney seats. Add as many as you need at <span className="text-violet-300 font-semibold">$199/month per seat</span>. No limit.</p>
        </div>
        <Link to="/app" className="shrink-0 px-6 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-bold text-sm transition-colors flex items-center gap-2">
          Get Started <ArrowRight size={15} />
        </Link>
      </div>

      {/* Add-ons */}
      <div className="bg-slate-800/50 border border-slate-700 rounded-2xl p-8 mb-16">
        <div className="flex items-center gap-2 mb-6">
          <Zap size={18} className="text-gold-400" />
          <h2 className="text-lg font-bold text-white">Optional Add-ons</h2>
        </div>
        <div className="space-y-4">
          {ADD_ONS.map(addon => (
            <div key={addon.name} className="flex items-center justify-between gap-4 py-3 border-b border-slate-700 last:border-0">
              <div>
                <p className="font-semibold text-white text-sm">{addon.name}</p>
                <p className="text-xs text-slate-400 mt-0.5">{addon.description}</p>
              </div>
              <span className="text-gold-400 font-bold text-sm shrink-0">{addon.price}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Trust signals */}
      <div className="text-center space-y-4">
        <div className="flex flex-wrap items-center justify-center gap-6 text-sm text-slate-400">
          <span className="flex items-center gap-1.5"><Shield size={14} className="text-green-400" /> Attorney-client privilege preserved</span>
          <span className="flex items-center gap-1.5"><Shield size={14} className="text-green-400" /> Your data stays yours</span>
          <span className="flex items-center gap-1.5"><Shield size={14} className="text-green-400" /> Cancel anytime</span>
        </div>
        <p className="text-xs text-slate-600">
          Not legal advice. CaseBuddy is an AI-assisted tool for licensed attorneys. Requires valid Gemini API key.{' '}
          <Link to="/privacy-policy" className="hover:text-slate-400 underline">Privacy Policy</Link>
          {' · '}
          <Link to="/tos" className="hover:text-slate-400 underline">Terms of Service</Link>
        </p>
      </div>
    </div>
  </div>
);

export default Pricing;
