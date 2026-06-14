
import React, { useState } from 'react';
import { Scale, Gavel, Users, BrainCircuit, FileText, Mic, ChevronRight, X, Key, CheckCircle } from 'lucide-react';
import { OPERATIONAL_AGENTS } from '../agents/personas';

interface Step {
  title: string;
  description: string;
  icon: React.ReactNode;
  action?: React.ReactNode;
}

interface OnboardingModalProps {
  onClose: () => void;
}

const STEPS: Step[] = [
  {
    title: 'Welcome to CaseBuddy',
    description: 'Your AI-powered law firm. 8 specialized AI agents + 12 AI lawyers ready to work your cases from intake through verdict.',
    icon: <Scale size={48} className="text-gold-500" />,
  },
  {
    title: 'Meet Your AI Team',
    description: 'Each module is powered by a named AI agent with a specific specialty. Together, they handle everything from intake to verdict.',
    icon: <Users size={48} className="text-violet-400" />,
    action: (
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-4">
        {OPERATIONAL_AGENTS.map(agent => (
          <div key={agent.id} className={`p-3 rounded-xl border ${agent.bgClass} ${agent.borderClass} text-center`}>
            <div className="text-2xl mb-1">{agent.emoji}</div>
            <p className={`text-xs font-bold ${agent.colorClass}`}>{agent.name}</p>
            <p className="text-xs text-slate-500 mt-0.5 leading-tight">{agent.role}</p>
          </div>
        ))}
      </div>
    ),
  },
  {
    title: 'Consult 12 Specialist Lawyers',
    description: 'Need expert advice on criminal defense, IP, immigration, family law, or 8 other practice areas? Your Legal Team is ready for multi-turn consultations.',
    icon: <BrainCircuit size={48} className="text-blue-400" />,
    action: (
      <div className="flex flex-wrap gap-2 mt-4 justify-center">
        {['Criminal Defense', 'Personal Injury', 'Family Law', 'Immigration', 'IP & Patent', 'Corporate', 'Employment', 'Real Estate', 'Bankruptcy', 'Civil Litigation', 'Estate Planning', 'Tax Law'].map(area => (
          <span key={area} className="text-xs bg-slate-800 border border-slate-700 text-slate-300 px-3 py-1.5 rounded-full">{area}</span>
        ))}
      </div>
    ),
  },
  {
    title: 'Courtroom-Ready Tools',
    description: 'Trial Simulator with live voice, Witness Lab, Jury Simulator, Statement Builder, Deposition Prep, Evidence Vault — everything you need to walk into court prepared.',
    icon: <Gavel size={48} className="text-gold-500" />,
    action: (
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4">
        {[
          { icon: <Mic size={16} />, label: 'Live Trial Simulator', desc: 'Real-time voice with AI opposing counsel' },
          { icon: <Users size={16} />, label: 'Jury Simulator', desc: '6 AI jurors with persuasion tracking' },
          { icon: <FileText size={16} />, label: 'Witness Prep', desc: 'Direct/cross exam + impeachment strategy' },
          { icon: <BrainCircuit size={16} />, label: 'Strategy Room', desc: 'AI-powered case strategy analysis' },
        ].map(item => (
          <div key={item.label} className="flex items-start gap-3 p-3 bg-slate-800 border border-slate-700 rounded-xl">
            <span className="text-gold-400 mt-0.5">{item.icon}</span>
            <div>
              <p className="text-sm font-semibold text-white">{item.label}</p>
              <p className="text-xs text-slate-400">{item.desc}</p>
            </div>
          </div>
        ))}
      </div>
    ),
  },
  {
    title: 'Set Your Gemini API Key',
    description: 'CaseBuddy runs on Google Gemini AI. Add your API key in Settings to activate all AI features. Get a free key at aistudio.google.com.',
    icon: <Key size={48} className="text-green-400" />,
    action: (
      <div className="mt-4 space-y-3">
        <div className="p-4 bg-green-500/10 border border-green-500/30 rounded-xl">
          <p className="text-sm text-green-300 font-semibold mb-1">Quick Setup</p>
          <ol className="text-xs text-green-200/80 space-y-1 list-decimal list-inside">
            <li>Visit <span className="font-mono bg-green-500/10 px-1 rounded">aistudio.google.com</span></li>
            <li>Create a free API key</li>
            <li>Add it to your <span className="font-mono bg-green-500/10 px-1 rounded">.env.local</span> file as <span className="font-mono bg-green-500/10 px-1 rounded">GEMINI_API_KEY=your_key</span></li>
            <li>Restart the dev server</li>
          </ol>
        </div>
        <p className="text-xs text-slate-500 text-center">Or configure in Settings → API Configuration after getting started.</p>
      </div>
    ),
  },
];

const OnboardingModal: React.FC<OnboardingModalProps> = ({ onClose }) => {
  const [step, setStep] = useState(0);
  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;

  return (
    <div className="fixed inset-0 z-[100] bg-black/80 flex items-center justify-center p-4">
      <div className="w-full max-w-2xl bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-0">
          <div className="flex gap-1.5">
            {STEPS.map((_, i) => (
              <div key={i} className={`h-1.5 rounded-full transition-all duration-300 ${i <= step ? 'bg-gold-500' : 'bg-slate-700'} ${i === step ? 'w-8' : 'w-3'}`} />
            ))}
          </div>
          <button onClick={onClose} className="p-1.5 text-slate-500 hover:text-white transition-colors rounded-lg hover:bg-slate-800">
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="p-8 text-center">
          <div className="flex justify-center mb-6">{current.icon}</div>
          <h2 className="text-2xl font-bold text-white font-serif mb-3">{current.title}</h2>
          <p className="text-slate-400 leading-relaxed max-w-md mx-auto">{current.description}</p>
          {current.action && <div className="mt-2">{current.action}</div>}
        </div>

        {/* Footer */}
        <div className="px-8 pb-8 flex items-center justify-between gap-4">
          <button
            onClick={() => step > 0 ? setStep(s => s - 1) : onClose()}
            className="text-slate-500 hover:text-slate-300 text-sm transition-colors">
            {step === 0 ? 'Skip tour' : '← Back'}
          </button>

          <button
            onClick={() => isLast ? onClose() : setStep(s => s + 1)}
            className="flex items-center gap-2 px-6 py-3 bg-gold-500 hover:bg-gold-400 text-slate-950 font-bold rounded-xl transition-colors">
            {isLast ? (
              <><CheckCircle size={16} /> Get Started</>
            ) : (
              <>Next <ChevronRight size={16} /></>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default OnboardingModal;
