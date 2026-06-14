
import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Gavel, ArrowRight, ChevronRight, CheckCircle, AlertCircle, Loader2, Clock, Phone, Mail, User, FileText, Calendar } from 'lucide-react';
import { GoogleGenAI } from '@google/genai';
import AgentHeader from './AgentHeader';
import { OPERATIONAL_AGENTS } from '../agents/personas';

/* ─── Types ──────────────────────────────────────────────────────────────── */

interface IntakeFormData {
  // Step 1
  name: string;
  email: string;
  phone: string;
  // Step 2
  matterType: string;
  description: string;
  // Step 3
  courtDate: string;
  urgency: 'immediately' | 'days' | 'weeks' | '';
}

interface MayaAssessment {
  greeting: string;
  summary: string;
  nextSteps: string[];
  urgencyAssessment: string;
}

/* ─── Constants ──────────────────────────────────────────────────────────── */

const MATTER_TYPES = [
  'Criminal',
  'Civil',
  'Family',
  'Immigration',
  'Business',
  'Other',
];

const URGENCY_OPTIONS: { value: 'immediately' | 'days' | 'weeks'; label: string; desc: string }[] = [
  { value: 'immediately', label: 'Immediately', desc: 'I need help today / urgent deadline' },
  { value: 'days',        label: 'Within a few days', desc: 'Pressing but not today' },
  { value: 'weeks',       label: 'Within a few weeks', desc: 'Planning ahead' },
];

const TOTAL_STEPS = 3;

const mayaAgent = OPERATIONAL_AGENTS.find(a => a.id === 'maya')!;

/* ─── Step pill ──────────────────────────────────────────────────────────── */

const StepPill: React.FC<{ step: number; current: number; label: string }> = ({ step, current, label }) => {
  const done   = step < current;
  const active = step === current;
  return (
    <div className="flex items-center gap-2">
      <div className={`
        w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold border transition-all
        ${done   ? 'bg-violet-500 border-violet-500 text-white' : ''}
        ${active ? 'bg-violet-500/20 border-violet-500 text-violet-400' : ''}
        ${!done && !active ? 'bg-slate-800 border-slate-700 text-slate-500' : ''}
      `}>
        {done ? <CheckCircle size={16} /> : step}
      </div>
      <span className={`text-sm font-medium hidden sm:inline ${active ? 'text-violet-300' : done ? 'text-slate-300' : 'text-slate-600'}`}>
        {label}
      </span>
    </div>
  );
};

const StepDivider: React.FC<{ passed: boolean }> = ({ passed }) => (
  <div className={`flex-1 h-px mx-1 transition-all ${passed ? 'bg-violet-500/50' : 'bg-slate-800'}`} />
);

/* ─── Main component ─────────────────────────────────────────────────────── */

const IntakePage: React.FC = () => {
  const [step, setStep]           = useState(1);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState<string | null>(null);
  const [assessment, setAssessment] = useState<MayaAssessment | null>(null);

  const [form, setForm] = useState<IntakeFormData>({
    name: '',
    email: '',
    phone: '',
    matterType: '',
    description: '',
    courtDate: '',
    urgency: '',
  });

  const set = (field: keyof IntakeFormData) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => setForm(prev => ({ ...prev, [field]: e.target.value }));

  /* validation per step */
  const canAdvance = () => {
    if (step === 1) return form.name.trim() && form.email.trim();
    if (step === 2) return form.matterType && form.description.trim().length >= 20;
    if (step === 3) return form.urgency !== '';
    return false;
  };

  const handleNext = () => {
    if (step < TOTAL_STEPS) setStep(s => s + 1);
    else handleSubmit();
  };

  const handleSubmit = async () => {
    setLoading(true);
    setError(null);

    try {
      const apiKey = (process.env.API_KEY as string) || '';
      const ai = new GoogleGenAI({ apiKey });

      const prompt = `You are Maya, a warm and professional AI Case Intake Specialist for CaseBuddy — an AI-powered legal platform.

A potential client has submitted an intake form with the following details:
- Name: ${form.name}
- Email: ${form.email}
- Phone: ${form.phone || 'Not provided'}
- Type of legal matter: ${form.matterType}
- Description: ${form.description}
- Court date (if any): ${form.courtDate || 'None specified'}
- How soon they need help: ${form.urgency}

Based on this intake, provide a personalized response as Maya. Be warm, professional, and empathetic. Address the client by their first name.

Return a JSON object with exactly these fields:
- greeting: A warm 1-2 sentence personal greeting addressing the client by first name and acknowledging their situation
- summary: A 2-3 sentence professional summary of the client's legal matter, showing you understood the key details
- nextSteps: An array of 3-5 concrete next steps the client should take (actionable items)
- urgencyAssessment: A 1-2 sentence assessment of the urgency level and any time-sensitive concerns to flag`;

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        config: {
          responseMimeType: 'application/json',
        },
      });

      const raw = response.text ?? '';
      const parsed: MayaAssessment = JSON.parse(raw);
      setAssessment(parsed);
      setStep(4); // show results
    } catch (err: any) {
      setError(err?.message ?? 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  /* ── label helper ── */
  const inputCls = 'w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500/30 transition-all';
  const labelCls = 'block text-sm font-semibold text-slate-300 mb-1.5';

  return (
    <div className="min-h-screen bg-[#020617] text-slate-100">

      {/* ── Top nav ── */}
      <header className="border-b border-slate-800/60 bg-slate-950/80 backdrop-blur-sm sticky top-0 z-30">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
            <Gavel size={22} className="text-gold-500" />
            <span className="text-lg font-serif font-bold text-white">CaseBuddy</span>
          </Link>
          <span className="text-sm text-slate-400">Free Intake · No account required</span>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-10 space-y-8">

        {/* ── Maya intro ── */}
        <div>
          <AgentHeader agent={mayaAgent} />
        </div>

        {/* ── Step progress (only during form) ── */}
        {step <= TOTAL_STEPS && (
          <div className="flex items-center gap-1">
            <StepPill step={1} current={step} label="Contact Info" />
            <StepDivider passed={step > 1} />
            <StepPill step={2} current={step} label="Legal Matter" />
            <StepDivider passed={step > 2} />
            <StepPill step={3} current={step} label="Urgency & Timeline" />
          </div>
        )}

        {/* ════════════════════════════════════════════════════
            STEP 1 — Contact info
        ════════════════════════════════════════════════════ */}
        {step === 1 && (
          <div className="card-premium p-6 sm:p-8 space-y-5">
            <div className="space-y-1">
              <h2 className="text-xl font-bold font-serif text-white">Let's get started</h2>
              <p className="text-slate-400 text-sm">I'm Maya. Tell me a bit about yourself so I can reach back out.</p>
            </div>

            <div>
              <label className={labelCls}><User size={13} className="inline mr-1" />Full name <span className="text-red-400">*</span></label>
              <input type="text" value={form.name} onChange={set('name')} placeholder="Jane Smith" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}><Mail size={13} className="inline mr-1" />Email address <span className="text-red-400">*</span></label>
              <input type="email" value={form.email} onChange={set('email')} placeholder="jane@example.com" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}><Phone size={13} className="inline mr-1" />Phone number <span className="text-slate-500 font-normal">(optional)</span></label>
              <input type="tel" value={form.phone} onChange={set('phone')} placeholder="(555) 000-0000" className={inputCls} />
            </div>
          </div>
        )}

        {/* ════════════════════════════════════════════════════
            STEP 2 — Legal matter
        ════════════════════════════════════════════════════ */}
        {step === 2 && (
          <div className="card-premium p-6 sm:p-8 space-y-5">
            <div className="space-y-1">
              <h2 className="text-xl font-bold font-serif text-white">Tell me about your legal matter</h2>
              <p className="text-slate-400 text-sm">The more detail you share, the better I can assess your situation.</p>
            </div>

            <div>
              <label className={labelCls}><FileText size={13} className="inline mr-1" />Type of legal matter <span className="text-red-400">*</span></label>
              <select value={form.matterType} onChange={set('matterType')} className={inputCls}>
                <option value="" disabled>Select a category…</option>
                {MATTER_TYPES.map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>

            <div>
              <label className={labelCls}>Brief description <span className="text-red-400">*</span></label>
              <textarea
                value={form.description}
                onChange={set('description')}
                rows={5}
                placeholder="Describe what happened, who is involved, and what outcome you're seeking. The more detail, the better Maya can help."
                className={`${inputCls} resize-none`}
              />
              <p className={`text-xs mt-1.5 ${form.description.length < 20 ? 'text-slate-600' : 'text-violet-400'}`}>
                {form.description.length < 20 ? `${20 - form.description.length} more characters needed` : `${form.description.length} characters — good detail`}
              </p>
            </div>
          </div>
        )}

        {/* ════════════════════════════════════════════════════
            STEP 3 — Urgency & timeline
        ════════════════════════════════════════════════════ */}
        {step === 3 && (
          <div className="card-premium p-6 sm:p-8 space-y-5">
            <div className="space-y-1">
              <h2 className="text-xl font-bold font-serif text-white">Urgency & timeline</h2>
              <p className="text-slate-400 text-sm">This helps me flag any time-sensitive risks in your case.</p>
            </div>

            <div>
              <label className={labelCls}><Calendar size={13} className="inline mr-1" />Court date or deadline <span className="text-slate-500 font-normal">(if any)</span></label>
              <input type="date" value={form.courtDate} onChange={set('courtDate')} className={inputCls} />
            </div>

            <div>
              <label className={labelCls}><Clock size={13} className="inline mr-1" />How soon do you need legal help? <span className="text-red-400">*</span></label>
              <div className="space-y-3 mt-2">
                {URGENCY_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setForm(prev => ({ ...prev, urgency: opt.value }))}
                    className={`w-full text-left px-4 py-3 rounded-xl border transition-all flex items-start gap-3
                      ${form.urgency === opt.value
                        ? 'bg-violet-500/20 border-violet-500 text-violet-300'
                        : 'bg-slate-900 border-slate-700 text-slate-300 hover:border-slate-600'
                      }`}
                  >
                    <div className={`w-5 h-5 mt-0.5 rounded-full border-2 flex items-center justify-center shrink-0
                      ${form.urgency === opt.value ? 'border-violet-400 bg-violet-400' : 'border-slate-600'}`}>
                      {form.urgency === opt.value && <div className="w-2 h-2 rounded-full bg-white" />}
                    </div>
                    <div>
                      <div className="font-semibold text-sm">{opt.label}</div>
                      <div className="text-xs text-slate-400 mt-0.5">{opt.desc}</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ════════════════════════════════════════════════════
            LOADING state
        ════════════════════════════════════════════════════ */}
        {loading && (
          <div className="card-premium p-10 flex flex-col items-center gap-4 text-center">
            <Loader2 size={36} className="text-violet-400 animate-spin" />
            <div>
              <p className="font-semibold text-slate-200">Maya is reviewing your intake…</p>
              <p className="text-sm text-slate-400 mt-1">Preparing a personalised assessment for you</p>
            </div>
          </div>
        )}

        {/* ════════════════════════════════════════════════════
            ERROR state
        ════════════════════════════════════════════════════ */}
        {error && !loading && (
          <div className="flex items-start gap-3 p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300">
            <AlertCircle size={18} className="shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-sm">Something went wrong</p>
              <p className="text-xs mt-0.5">{error}</p>
            </div>
          </div>
        )}

        {/* ════════════════════════════════════════════════════
            STEP 4 — Maya's assessment (results)
        ════════════════════════════════════════════════════ */}
        {step === 4 && assessment && !loading && (
          <div className="space-y-6">

            {/* Greeting */}
            <div className="card-premium p-6 sm:p-8">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl bg-violet-500/10 border border-violet-500/30 shrink-0">
                  {mayaAgent.emoji}
                </div>
                <div>
                  <h2 className="text-lg font-bold font-serif text-violet-300">Maya's Assessment</h2>
                  <p className="text-xs text-slate-400">Case Intake Specialist · CaseBuddy</p>
                </div>
              </div>

              <p className="text-slate-200 leading-relaxed mb-5">{assessment.greeting}</p>

              <div className="border-t border-slate-800 pt-5 space-y-5">
                {/* Summary */}
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-violet-400 mb-2">Case Summary</h3>
                  <p className="text-slate-300 text-sm leading-relaxed">{assessment.summary}</p>
                </div>

                {/* Urgency */}
                <div className="flex items-start gap-3 p-3 rounded-xl bg-amber-500/10 border border-amber-500/30">
                  <Clock size={16} className="text-amber-400 shrink-0 mt-0.5" />
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-amber-400 mb-1">Urgency Assessment</h3>
                    <p className="text-slate-300 text-sm leading-relaxed">{assessment.urgencyAssessment}</p>
                  </div>
                </div>

                {/* Next steps */}
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-violet-400 mb-3">Recommended Next Steps</h3>
                  <ol className="space-y-2.5">
                    {assessment.nextSteps.map((step, i) => (
                      <li key={i} className="flex items-start gap-3">
                        <span className="w-6 h-6 rounded-full bg-violet-500/20 border border-violet-500/40 text-violet-400 text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
                          {i + 1}
                        </span>
                        <span className="text-slate-300 text-sm leading-relaxed">{step}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              </div>
            </div>

            {/* CTA */}
            <div className="card-premium p-6 sm:p-8 text-center space-y-4">
              <h3 className="text-lg font-bold font-serif text-white">Ready to talk to an attorney?</h3>
              <p className="text-slate-400 text-sm max-w-md mx-auto">
                CaseBuddy gives you AI-powered legal tools — trial simulators, witness prep, case strategy, and 12 specialist AI lawyers.
              </p>
              <Link
                to="/app"
                className="btn-gold inline-flex items-center gap-2 px-7 py-3 rounded-xl text-sm font-bold transition-all hover:scale-105"
              >
                Launch CaseBuddy <ArrowRight size={16} />
              </Link>
            </div>

          </div>
        )}

        {/* ── Next / Submit button (during form, not loading, not results) ── */}
        {step <= TOTAL_STEPS && !loading && (
          <div className="flex justify-between items-center pt-2">
            {step > 1 ? (
              <button
                onClick={() => setStep(s => s - 1)}
                className="text-sm text-slate-400 hover:text-white transition-colors flex items-center gap-1"
              >
                ← Back
              </button>
            ) : (
              <div />
            )}
            <button
              onClick={handleNext}
              disabled={!canAdvance()}
              className={`flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-bold transition-all
                ${canAdvance()
                  ? 'btn-gold hover:scale-105'
                  : 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700'
                }`}
            >
              {step === TOTAL_STEPS ? 'Submit to Maya' : 'Continue'}
              <ChevronRight size={15} />
            </button>
          </div>
        )}

      </main>

      {/* ── Footer ── */}
      <footer className="border-t border-slate-800/60 mt-16 py-6 text-center text-xs text-slate-600">
        <p>
          CaseBuddy is not a law firm and does not provide legal advice. This intake is for informational purposes only.{' '}
          <Link to="/privacy-policy" className="hover:text-slate-400 transition-colors">Privacy Policy</Link>
          {' · '}
          <Link to="/tos" className="hover:text-slate-400 transition-colors">Terms of Service</Link>
        </p>
      </footer>
    </div>
  );
};

export default IntakePage;
