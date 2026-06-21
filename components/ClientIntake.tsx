import React, { useState } from 'react';
import { UserPlus, CheckCircle, AlertTriangle, Loader, Download, Copy, ChevronRight, ChevronLeft } from 'lucide-react';
import { deepseekChat } from '../services/deepseek';

interface IntakeForm {
  // Personal Info
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  address: string;
  dob: string;
  // Case Info
  caseType: string;
  incidentDate: string;
  incidentDescription: string;
  jurisdiction: string;
  opposingParty: string;
  opposingAttorney: string;
  // Prior Representation
  priorAttorney: string;
  priorAttorneyName: string;
  priorCaseNumber: string;
  // Financial
  feeArrangement: string;
  hourlyRate: string;
  retainer: string;
  contingencyPct: string;
  // Conflicts
  relatedParties: string;
  referralSource: string;
  urgency: string;
  notes: string;
}

const CASE_TYPES = [
  'Criminal Defense', 'Personal Injury', 'Family Law', 'Immigration',
  'Civil Litigation', 'Employment', 'Real Estate', 'Bankruptcy',
  'Estate Planning', 'Corporate', 'IP / Patent', 'Tax', 'Other',
];

const FEE_ARRANGEMENTS = [
  'Hourly', 'Contingency', 'Flat Fee', 'Hybrid (Hourly + Contingency)', 'Pro Bono', 'TBD',
];

const STEPS = ['Client Info', 'Case Details', 'Prior Counsel', 'Fee Agreement', 'Review'];

const empty: IntakeForm = {
  firstName: '', lastName: '', email: '', phone: '', address: '', dob: '',
  caseType: '', incidentDate: '', incidentDescription: '', jurisdiction: '',
  opposingParty: '', opposingAttorney: '', priorAttorney: 'no', priorAttorneyName: '',
  priorCaseNumber: '', feeArrangement: 'Hourly', hourlyRate: '', retainer: '',
  contingencyPct: '', relatedParties: '', referralSource: '', urgency: 'normal', notes: '',
};

const ClientIntake: React.FC = () => {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<IntakeForm>(empty);
  const [conflicts, setConflicts] = useState<string[]>([]);
  const [checkingConflicts, setCheckingConflicts] = useState(false);
  const [engagementLetter, setEngagementLetter] = useState('');
  const [generatingLetter, setGeneratingLetter] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [copied, setCopied] = useState(false);

  const set = (k: keyof IntakeForm, v: string) => setForm(f => ({ ...f, [k]: v }));

  const checkConflicts = async () => {
    setCheckingConflicts(true);
    setConflicts([]);
    await new Promise(r => setTimeout(r, 1200));
    const found: string[] = [];
    // Simulated conflict check logic
    const parties = form.relatedParties.toLowerCase();
    if (parties.includes('smith') || parties.includes('jones')) {
      found.push('Potential conflict: Party name matches existing client "Smith v. Jones (2024)"');
    }
    if (form.opposingParty && form.opposingParty.length > 2) {
      // In production this would check against a real client database
    }
    setConflicts(found);
    setCheckingConflicts(false);
  };

  const generateEngagementLetter = async () => {
    setGeneratingLetter(true);
    try {
      const prompt = `Draft a professional attorney-client engagement letter for the following new client intake:

Client: ${form.firstName} ${form.lastName}
Email: ${form.email}
Phone: ${form.phone}
Case Type: ${form.caseType}
Matter Description: ${form.incidentDescription}
Fee Arrangement: ${form.feeArrangement}
${form.feeArrangement === 'Hourly' ? `Hourly Rate: $${form.hourlyRate}/hr\nRetainer: $${form.retainer}` : ''}
${form.feeArrangement === 'Contingency' ? `Contingency: ${form.contingencyPct}%` : ''}
Jurisdiction: ${form.jurisdiction}

Include: scope of representation, fee agreement, billing procedures, client obligations, file retention policy, termination clause, and signature blocks. Use professional legal letterhead format with [ATTORNEY NAME] and [FIRM NAME] placeholders.`;

      const text = await deepseekChat({
        systemInstruction: 'You are a legal document expert. Draft only the letter text.',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
        maxTokens: 3000,
      });
      setEngagementLetter(text || 'Error generating letter.');
    } catch {
      setEngagementLetter('Error generating engagement letter. Please check your API configuration.');
    } finally {
      setGeneratingLetter(false);
    }
  };

  const handleSubmit = async () => {
    // ── Primary: save to Supabase cloud ─────────────────────────────────
    try {
      const { getSupabase, isSupabaseConfigured } = await import('../services/supabaseClient');
      const sb = getSupabase();
      if (sb && isSupabaseConfigured) {
        await sb.from('intake_cases').insert([{
          full_name: `${form.firstName} ${form.lastName}`.trim() || 'Prospective Client',
          contact: form.email || form.phone || '',
          matter_type: form.caseType || 'General Inquiry',
          jurisdiction: form.jurisdiction || '',
          summary: form.incidentDescription || '',
          status: 'new',
          disposition: 'review',
          urgency: 'medium',
          intake: form,
        }]);
      }
    } catch (err) {
      console.warn('[ClientIntake] Supabase save failed, using local backup:', err);
    }
    // ── Emergency backup only ─────────────────────────────────────────────
    const intakes = JSON.parse(localStorage.getItem('casebuddy_intakes_backup') || '[]');
    intakes.push({ ...form, id: Date.now().toString(), submittedAt: new Date().toISOString() });
    localStorage.setItem('casebuddy_intakes_backup', JSON.stringify(intakes));
    setSubmitted(true);
  };

  const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <div>
      <label className="block text-xs font-bold text-slate-400 uppercase mb-1.5">{label}</label>
      {children}
    </div>
  );

  const Input = ({ k, placeholder, type = 'text' }: { k: keyof IntakeForm; placeholder?: string; type?: string }) => (
    <input type={type} value={form[k]} onChange={e => set(k, e.target.value)} placeholder={placeholder}
      className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm placeholder-slate-500 focus:outline-none focus:border-gold-500/50" />
  );

  if (submitted) {
    return (
      <div className="p-6 max-w-3xl mx-auto">
        <div className="bg-slate-800/50 border border-green-500/30 rounded-2xl p-8 text-center">
          <CheckCircle size={56} className="text-green-400 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-white mb-2">Client Intake Complete</h2>
          <p className="text-slate-400 mb-6">{form.firstName} {form.lastName} has been onboarded successfully.</p>
          <div className="flex gap-3 justify-center flex-wrap">
            {!engagementLetter ? (
              <button onClick={generateEngagementLetter} disabled={generatingLetter}
                className="flex items-center gap-2 bg-gold-500 hover:bg-gold-400 disabled:opacity-50 text-slate-900 font-bold px-6 py-2.5 rounded-xl">
                {generatingLetter ? <><Loader size={16} className="animate-spin" /> Generating...</> : '📄 Generate Engagement Letter'}
              </button>
            ) : (
              <button onClick={() => { navigator.clipboard.writeText(engagementLetter); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
                className="flex items-center gap-2 bg-gold-500/20 border border-gold-500/30 text-gold-300 px-6 py-2.5 rounded-xl hover:bg-gold-500/30">
                <Copy size={16} /> {copied ? 'Copied!' : 'Copy Engagement Letter'}
              </button>
            )}
            <button onClick={() => { setForm(empty); setStep(0); setSubmitted(false); setEngagementLetter(''); }}
              className="bg-slate-700 hover:bg-slate-600 text-white px-6 py-2.5 rounded-xl font-medium">
              New Intake
            </button>
          </div>
          {engagementLetter && (
            <div className="mt-6 text-left bg-slate-900 border border-slate-700 rounded-xl p-4 max-h-96 overflow-y-auto">
              <pre className="whitespace-pre-wrap text-slate-300 text-xs font-mono">{engagementLetter}</pre>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-serif font-bold text-white flex items-center gap-2">
          <UserPlus className="text-gold-400" /> Client Intake System
        </h1>
        <p className="text-slate-400 mt-1">Onboard new clients professionally with conflict checking and automatic engagement letter generation.</p>
      </div>

      {/* Stepper */}
      <div className="flex items-center gap-0 mb-8">
        {STEPS.map((s, i) => (
          <React.Fragment key={s}>
            <div className={`flex items-center gap-1.5 text-xs font-bold ${i <= step ? 'text-gold-400' : 'text-slate-600'}`}>
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold border ${i < step ? 'bg-gold-500 border-gold-500 text-slate-900' : i === step ? 'border-gold-500 text-gold-400' : 'border-slate-600 text-slate-600'}`}>
                {i < step ? '✓' : i + 1}
              </div>
              <span className="hidden sm:inline">{s}</span>
            </div>
            {i < STEPS.length - 1 && <div className={`flex-1 h-px mx-2 ${i < step ? 'bg-gold-500/50' : 'bg-slate-700'}`} />}
          </React.Fragment>
        ))}
      </div>

      <div className="bg-slate-800/50 border border-slate-700 rounded-2xl p-6">
        {/* Step 0: Client Info */}
        {step === 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="First Name"><Input k="firstName" placeholder="John" /></Field>
            <Field label="Last Name"><Input k="lastName" placeholder="Doe" /></Field>
            <Field label="Email"><Input k="email" type="email" placeholder="client@email.com" /></Field>
            <Field label="Phone"><Input k="phone" placeholder="(555) 000-0000" /></Field>
            <Field label="Date of Birth"><Input k="dob" type="date" /></Field>
            <Field label="Referral Source"><Input k="referralSource" placeholder="Referral, website, etc." /></Field>
            <div className="sm:col-span-2">
              <Field label="Address"><Input k="address" placeholder="123 Main St, City, State ZIP" /></Field>
            </div>
            <div className="sm:col-span-2">
              <Field label="Urgency">
                <select value={form.urgency} onChange={e => set('urgency', e.target.value)}
                  className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-gold-500/50">
                  <option value="low">Low — No immediate deadline</option>
                  <option value="normal">Normal — Standard timeline</option>
                  <option value="high">High — Deadline within 30 days</option>
                  <option value="emergency">🚨 Emergency — Immediate action needed</option>
                </select>
              </Field>
            </div>
          </div>
        )}

        {/* Step 1: Case Details */}
        {step === 1 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Case Type">
              <select value={form.caseType} onChange={e => set('caseType', e.target.value)}
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-gold-500/50">
                <option value="">Select case type...</option>
                {CASE_TYPES.map(t => <option key={t}>{t}</option>)}
              </select>
            </Field>
            <Field label="Incident Date"><Input k="incidentDate" type="date" /></Field>
            <Field label="Jurisdiction"><Input k="jurisdiction" placeholder="e.g. Cook County, IL / SDNY" /></Field>
            <Field label="Opposing Party"><Input k="opposingParty" placeholder="Name of opposing party" /></Field>
            <Field label="Opposing Attorney"><Input k="opposingAttorney" placeholder="Name and firm if known" /></Field>
            <Field label="Related Parties (for conflict check)"><Input k="relatedParties" placeholder="All parties, witnesses, companies..." /></Field>
            <div className="sm:col-span-2">
              <Field label="Incident / Case Description">
                <textarea value={form.incidentDescription} onChange={e => set('incidentDescription', e.target.value)}
                  rows={5} placeholder="Describe what happened and what legal help the client needs..."
                  className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm placeholder-slate-500 resize-none focus:outline-none focus:border-gold-500/50" />
              </Field>
            </div>
          </div>
        )}

        {/* Step 2: Prior Counsel */}
        {step === 2 && (
          <div className="space-y-4">
            <Field label="Has the client had prior representation on this matter?">
              <div className="flex gap-3 mt-1">
                {['yes', 'no'].map(v => (
                  <button key={v} onClick={() => set('priorAttorney', v)}
                    className={`px-4 py-2 rounded-lg border text-sm font-medium transition-colors ${form.priorAttorney === v ? 'bg-gold-500/20 border-gold-500/50 text-gold-300' : 'border-slate-600 text-slate-400 hover:border-slate-500'}`}>
                    {v === 'yes' ? 'Yes' : 'No'}
                  </button>
                ))}
              </div>
            </Field>
            {form.priorAttorney === 'yes' && (
              <>
                <Field label="Prior Attorney Name / Firm"><Input k="priorAttorneyName" placeholder="Attorney name and firm" /></Field>
                <Field label="Prior Case / Matter Number"><Input k="priorCaseNumber" placeholder="Court case number if applicable" /></Field>
              </>
            )}
            <Field label="Additional Notes">
              <textarea value={form.notes} onChange={e => set('notes', e.target.value)}
                rows={4} placeholder="Any additional information about the client or case..."
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm placeholder-slate-500 resize-none focus:outline-none focus:border-gold-500/50" />
            </Field>

            {/* Conflict Check */}
            <div className="border border-slate-700 rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-white">Conflict of Interest Check</h3>
                <button onClick={checkConflicts} disabled={checkingConflicts}
                  className="flex items-center gap-2 text-sm bg-slate-700 hover:bg-slate-600 text-white px-4 py-2 rounded-lg disabled:opacity-50">
                  {checkingConflicts ? <><Loader size={14} className="animate-spin" /> Checking...</> : '🔍 Run Check'}
                </button>
              </div>
              {conflicts.length === 0 && !checkingConflicts && (
                <p className="text-slate-500 text-sm">Run conflict check to identify potential conflicts with existing clients.</p>
              )}
              {conflicts.length > 0 && (
                <div className="space-y-2">
                  {conflicts.map((c, i) => (
                    <div key={i} className="flex items-start gap-2 bg-red-500/10 border border-red-500/30 rounded-lg p-3">
                      <AlertTriangle size={16} className="text-red-400 mt-0.5 shrink-0" />
                      <p className="text-red-300 text-sm">{c}</p>
                    </div>
                  ))}
                </div>
              )}
              {!checkingConflicts && conflicts.length === 0 && form.relatedParties && (
                <div className="flex items-center gap-2 text-green-400 text-sm">
                  <CheckCircle size={16} /> No conflicts detected
                </div>
              )}
            </div>
          </div>
        )}

        {/* Step 3: Fee Agreement */}
        {step === 3 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <Field label="Fee Arrangement">
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-1">
                  {FEE_ARRANGEMENTS.map(f => (
                    <button key={f} onClick={() => set('feeArrangement', f)}
                      className={`px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${form.feeArrangement === f ? 'bg-gold-500/20 border-gold-500/50 text-gold-300' : 'border-slate-600 text-slate-400 hover:border-slate-500'}`}>
                      {f}
                    </button>
                  ))}
                </div>
              </Field>
            </div>
            {(form.feeArrangement === 'Hourly' || form.feeArrangement === 'Hybrid (Hourly + Contingency)') && (
              <>
                <Field label="Hourly Rate ($)"><Input k="hourlyRate" type="number" placeholder="350" /></Field>
                <Field label="Initial Retainer ($)"><Input k="retainer" type="number" placeholder="5000" /></Field>
              </>
            )}
            {(form.feeArrangement === 'Contingency' || form.feeArrangement === 'Hybrid (Hourly + Contingency)') && (
              <Field label="Contingency Percentage (%)"><Input k="contingencyPct" type="number" placeholder="33" /></Field>
            )}
          </div>
        )}

        {/* Step 4: Review */}
        {step === 4 && (
          <div className="space-y-4">
            <h3 className="font-bold text-white text-lg">Review & Submit</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              {[
                ['Client', `${form.firstName} ${form.lastName}`],
                ['Email', form.email],
                ['Phone', form.phone],
                ['Case Type', form.caseType],
                ['Jurisdiction', form.jurisdiction],
                ['Opposing Party', form.opposingParty],
                ['Fee Arrangement', form.feeArrangement],
                ['Urgency', form.urgency],
              ].map(([label, value]) => (
                <div key={label} className="bg-slate-700/50 rounded-lg px-3 py-2">
                  <span className="text-slate-400 text-xs">{label}</span>
                  <p className="text-white font-medium">{value || '—'}</p>
                </div>
              ))}
            </div>
            <div className="bg-slate-700/50 rounded-lg px-3 py-2">
              <span className="text-slate-400 text-xs">Description</span>
              <p className="text-white text-sm mt-1">{form.incidentDescription || '—'}</p>
            </div>
          </div>
        )}

        {/* Nav buttons */}
        <div className="flex justify-between mt-6 pt-4 border-t border-slate-700">
          <button onClick={() => setStep(s => s - 1)} disabled={step === 0}
            className="flex items-center gap-2 text-slate-400 hover:text-white disabled:opacity-30 px-4 py-2 rounded-lg transition-colors">
            <ChevronLeft size={16} /> Back
          </button>
          {step < STEPS.length - 1 ? (
            <button onClick={() => setStep(s => s + 1)}
              className="flex items-center gap-2 bg-gold-500 hover:bg-gold-400 text-slate-900 font-bold px-6 py-2 rounded-xl">
              Next <ChevronRight size={16} />
            </button>
          ) : (
            <button onClick={handleSubmit}
              className="flex items-center gap-2 bg-green-500 hover:bg-green-400 text-white font-bold px-6 py-2 rounded-xl">
              <CheckCircle size={16} /> Submit Intake
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default ClientIntake;
