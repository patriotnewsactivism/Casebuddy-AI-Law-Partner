
import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Gavel, ArrowRight, ChevronRight, CheckCircle, AlertCircle, Loader2, Clock, Phone, Mail, User, FileText, Calendar, ShieldCheck, ShieldAlert, ScrollText, Copy, Download, Printer } from 'lucide-react';
import { GoogleGenAI } from '@google/genai';
import AgentHeader from './AgentHeader';
import { OPERATIONAL_AGENTS } from '../agents/personas';
import { printAsPdf, textToPdfHtml } from '../utils/pdfExport';

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

interface Lead {
  id: string;
  name: string;
  email: string;
  phone: string;
  matterType: string;
  description: string;
  urgency: string;
  courtDate: string;
  aiAssessment: MayaAssessment;
  submittedAt: number;
}

interface ConflictMatch {
  party: string;          // the name that matched
  reason: string;         // human-readable explanation
  severity: 'warning' | 'high';
}

interface ConflictResult {
  clear: boolean;
  matches: ConflictMatch[];
}

function saveLead(form: IntakeFormData, assessment: MayaAssessment) {
  try {
    const raw = localStorage.getItem('casebuddy_leads');
    const existing: Lead[] = raw ? JSON.parse(raw) : [];
    const lead: Lead = {
      id: `lead_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      name: form.name,
      email: form.email,
      phone: form.phone,
      matterType: form.matterType,
      description: form.description,
      urgency: form.urgency,
      courtDate: form.courtDate,
      aiAssessment: assessment,
      submittedAt: Date.now(),
    };
    const updated = [lead, ...existing].slice(0, 50);
    localStorage.setItem('casebuddy_leads', JSON.stringify(updated));
  } catch {
    // ignore storage errors
  }
}

/* ─── Conflict check (heuristic, client-side) ────────────────────────────── */

// Normalize a name to a comparable token form (lowercase, collapse whitespace)
function normName(s: string): string {
  return (s || '').toLowerCase().replace(/[^a-z\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

// Extract candidate proper-noun names from a free-text description.
// Heuristic: capitalized words (optionally multi-word), excluding common starts.
function extractNames(text: string): string[] {
  if (!text) return [];
  const matches = text.match(/\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})\b/g) || [];
  const stop = new Set(['I', 'The', 'A', 'An', 'My', 'We', 'They', 'He', 'She', 'It', 'On', 'In', 'At', 'For']);
  return Array.from(new Set(matches.map(m => m.trim()).filter(m => !stop.has(m))));
}

// Returns true if two names share a meaningful surname/word token.
function namesOverlap(a: string, b: string): boolean {
  const ta = new Set(normName(a).split(' ').filter(w => w.length >= 3));
  const tb = normName(b).split(' ').filter(w => w.length >= 3);
  return tb.some(w => ta.has(w));
}

function runConflictCheck(form: IntakeFormData): ConflictResult {
  const matches: ConflictMatch[] = [];
  try {
    // Candidate names involved on the new client's side
    const newParties = Array.from(new Set([
      form.name,
      ...extractNames(form.description),
    ].map(n => n.trim()).filter(Boolean)));

    // 1) Existing cases
    let cases: any[] = [];
    try {
      const raw = localStorage.getItem('casebuddy_cases') || localStorage.getItem('lexsim_cases');
      cases = raw ? JSON.parse(raw) : [];
    } catch { cases = []; }
    if (!Array.isArray(cases)) cases = [];

    for (const c of cases) {
      const title = c?.title || 'an existing case';
      const client = c?.client || '';
      const opposing = c?.opposingCounsel || '';

      for (const party of newParties) {
        if (opposing && namesOverlap(party, opposing)) {
          matches.push({
            party,
            reason: `Name "${party}" matches opposing counsel "${opposing}" in case "${title}"`,
            severity: 'high',
          });
        }
        if (client && namesOverlap(party, client)) {
          matches.push({
            party,
            reason: `Name "${party}" matches an existing client "${client}" in case "${title}"`,
            severity: 'warning',
          });
        }
      }
    }

    // 2) Prior leads
    let leads: any[] = [];
    try {
      const raw = localStorage.getItem('casebuddy_leads');
      leads = raw ? JSON.parse(raw) : [];
    } catch { leads = []; }
    if (!Array.isArray(leads)) leads = [];

    for (const l of leads) {
      const leadName = l?.name || '';
      if (!leadName) continue;
      // Skip self-match against a freshly saved identical lead by ignoring exact same email+name
      if (normName(leadName) === normName(form.name) && (l?.email || '') === form.email) continue;
      for (const party of newParties) {
        if (namesOverlap(party, leadName)) {
          matches.push({
            party,
            reason: `Name "${party}" matches a prior intake lead "${leadName}"`,
            severity: 'warning',
          });
        }
      }
      // Names mentioned inside a prior lead's description
      for (const otherParty of extractNames(l?.description || '')) {
        if (namesOverlap(form.name, otherParty)) {
          matches.push({
            party: form.name,
            reason: `Client "${form.name}" is named in a prior intake lead from "${leadName}"`,
            severity: 'high',
          });
        }
      }
    }

    // De-duplicate by reason text
    const seen = new Set<string>();
    const unique = matches.filter(m => {
      if (seen.has(m.reason)) return false;
      seen.add(m.reason);
      return true;
    });

    return { clear: unique.length === 0, matches: unique };
  } catch {
    return { clear: true, matches: [] };
  }
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
  const [conflict, setConflict]   = useState<ConflictResult | null>(null);

  // Engagement letter
  const [letter, setLetter]           = useState<string | null>(null);
  const [letterLoading, setLetterLoading] = useState(false);
  const [letterError, setLetterError] = useState<string | null>(null);
  const [letterOpen, setLetterOpen]   = useState(false);
  const [copied, setCopied]           = useState(false);

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

      // Run conflict check BEFORE saving the new lead so we don't match against ourselves.
      const conflictResult = runConflictCheck(form);
      setConflict(conflictResult);

      setAssessment(parsed);
      saveLead(form, parsed);
      setStep(4); // show results
    } catch (err: any) {
      setError(err?.message ?? 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  /* ── Engagement letter generation ── */
  const generateLetter = async () => {
    setLetterLoading(true);
    setLetterError(null);
    setLetterOpen(true);
    try {
      const apiKey = (process.env.API_KEY as string) || '';
      const ai = new GoogleGenAI({ apiKey });

      const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
      const prompt = `Draft a professional attorney-client engagement letter for a law firm onboarding a new client. Output ONLY the letter text (plain text, no markdown code fences).

Use these intake details:
- Date: ${today}
- Client name: ${form.name}
- Client email: ${form.email}
- Client phone: ${form.phone || 'Not provided'}
- Matter type: ${form.matterType}
- Matter description: ${form.description}

The letter MUST include these clearly labeled sections:
1. A header with date and addressed to the client by name.
2. Scope of Representation — describe the matter and what the firm will and will not handle.
3. Fee Structure — use the literal placeholder [FEE STRUCTURE] where rates/retainer terms would go, plus a short explanation that fees and billing terms will be specified there.
4. Client Responsibilities — what the client must do (provide information, communicate, etc.).
5. Signature blocks — separate signature/date lines for both the attorney (with [ATTORNEY NAME] / [FIRM NAME] placeholders) and the client.

Keep it professional, clear, and use placeholders like [FIRM NAME], [ATTORNEY NAME], [FIRM ADDRESS] where firm-specific details are unknown.`;

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
      });

      setLetter(response.text ?? '');
    } catch (err: any) {
      setLetterError(err?.message ?? 'Failed to generate the engagement letter. Please try again.');
    } finally {
      setLetterLoading(false);
    }
  };

  const copyLetter = async () => {
    if (!letter) return;
    try {
      await navigator.clipboard.writeText(letter);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore clipboard errors
    }
  };

  const downloadLetter = () => {
    if (!letter) return;
    const blob = new Blob([letter], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const safeName = (form.name || 'client').replace(/[^a-z0-9]+/gi, '_').toLowerCase();
    a.download = `engagement_letter_${safeName}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const saveAsPdf = () => {
    if (!letter) return;
    const safeName = (form.name || 'Client').replace(/[^a-z0-9]+/gi, ' ').trim();
    const html = textToPdfHtml(
      'Engagement Letter',
      `Prepared for ${safeName} — ${form.matterType || 'General Inquiry'}`,
      letter,
    );
    printAsPdf(`Engagement Letter — ${safeName}`, html);
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

            {/* ── Conflict check result ── */}
            {conflict && (
              conflict.clear ? (
                <div className="card-premium p-5 sm:p-6 border border-green-500/30 bg-green-500/5">
                  <div className="flex items-start gap-3">
                    <ShieldCheck size={22} className="text-green-400 shrink-0 mt-0.5" />
                    <div>
                      <h3 className="text-sm font-bold text-green-300">✓ No conflicts detected</h3>
                      <p className="text-slate-400 text-sm mt-1">
                        We compared this client and the parties mentioned in their description against your existing case files and prior intake leads, and found no obvious matches.
                      </p>
                      <p className="text-xs text-slate-500 mt-2">
                        This is an automated heuristic screen only — a manual conflict-of-interest review is still required before accepting the matter.
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="card-premium p-5 sm:p-6 border border-amber-500/40 bg-amber-500/8">
                  <div className="flex items-start gap-3">
                    <ShieldAlert size={22} className="text-amber-400 shrink-0 mt-0.5" />
                    <div className="min-w-0">
                      <h3 className="text-sm font-bold text-amber-300">⚠ Potential conflict — review required</h3>
                      <p className="text-slate-400 text-sm mt-1">
                        Our automated screen found {conflict.matches.length} possible {conflict.matches.length === 1 ? 'match' : 'matches'} against your existing records:
                      </p>
                      <ul className="mt-3 space-y-2">
                        {conflict.matches.map((m, i) => (
                          <li key={i} className="flex items-start gap-2 text-sm">
                            <span className={`mt-0.5 w-1.5 h-1.5 rounded-full shrink-0 ${m.severity === 'high' ? 'bg-red-400' : 'bg-amber-400'}`} />
                            <span className={m.severity === 'high' ? 'text-red-200' : 'text-amber-100'}>{m.reason}</span>
                          </li>
                        ))}
                      </ul>
                      <p className="text-xs text-slate-500 mt-3">
                        This is an automated heuristic screen and may produce false positives. A manual conflict-of-interest review by an attorney is still required before accepting this matter.
                      </p>
                    </div>
                  </div>
                </div>
              )
            )}

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

            {/* ── Engagement letter ── */}
            <div className="card-premium p-6 sm:p-8 space-y-4">
              <div className="flex items-start gap-3">
                <div className="w-11 h-11 rounded-2xl flex items-center justify-center bg-gold-500/10 border border-gold-500/30 shrink-0">
                  <ScrollText size={20} className="text-gold-400" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-lg font-bold font-serif text-white">Engagement Letter</h3>
                  <p className="text-slate-400 text-sm mt-0.5">
                    Draft a professional attorney-client engagement letter from this intake — scope, fees, responsibilities, and signature blocks.
                  </p>
                </div>
              </div>

              {!letter && !letterLoading && (
                <button
                  onClick={generateLetter}
                  className="btn-gold inline-flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-bold transition-all hover:scale-105"
                >
                  <ScrollText size={16} /> Generate Engagement Letter
                </button>
              )}

              {letterLoading && (
                <div className="flex items-center gap-3 text-slate-300 text-sm">
                  <Loader2 size={18} className="text-gold-400 animate-spin" />
                  Drafting engagement letter…
                </div>
              )}

              {letterError && !letterLoading && (
                <div className="flex items-start gap-3 p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300">
                  <AlertCircle size={18} className="shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold text-sm">Could not generate letter</p>
                    <p className="text-xs mt-0.5">{letterError}</p>
                  </div>
                </div>
              )}

              {letter && !letterLoading && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      onClick={() => setLetterOpen(o => !o)}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold bg-slate-800 border border-slate-700 text-slate-200 hover:border-slate-600 transition-all"
                    >
                      {letterOpen ? <ChevronRight size={15} className="rotate-90 transition-transform" /> : <ChevronRight size={15} className="transition-transform" />}
                      {letterOpen ? 'Hide letter' : 'Show letter'}
                    </button>
                    <button
                      onClick={copyLetter}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold bg-slate-800 border border-slate-700 text-slate-200 hover:border-slate-600 transition-all"
                    >
                      <Copy size={15} /> {copied ? 'Copied!' : 'Copy'}
                    </button>
                    <button
                      onClick={downloadLetter}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold bg-slate-800 border border-slate-700 text-slate-200 hover:border-slate-600 transition-all"
                    >
                      <Download size={15} /> Download
                    </button>
                    <button
                      onClick={saveAsPdf}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold bg-slate-800 border border-slate-700 text-slate-200 hover:border-slate-600 transition-all"
                    >
                      <Printer size={15} /> Save as PDF
                    </button>
                    <button
                      onClick={generateLetter}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold text-slate-400 hover:text-white transition-all"
                    >
                      Regenerate
                    </button>
                  </div>

                  {letterOpen && (
                    <pre className="whitespace-pre-wrap break-words text-sm text-slate-200 leading-relaxed bg-slate-950/60 border border-slate-800 rounded-xl p-4 max-h-[28rem] overflow-y-auto font-sans">
                      {letter}
                    </pre>
                  )}

                  <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-200 text-xs">
                    <AlertCircle size={14} className="shrink-0 mt-0.5" />
                    <span>
                      This is an AI-generated draft. It must be reviewed, customized (fees, scope, firm details), and approved by a licensed attorney before it is sent to or signed by any client.
                    </span>
                  </div>
                </div>
              )}
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
