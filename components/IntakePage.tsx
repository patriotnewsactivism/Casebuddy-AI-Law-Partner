import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  Gavel, ArrowRight, ChevronRight, CheckCircle, AlertCircle, Loader2,
  Phone, Mail, FileText, ShieldCheck, ShieldAlert, ScrollText, Copy, Printer,
  Send, MessageSquare, Sparkles, Bot
} from 'lucide-react';
import { printAsPdf, textToPdfHtml } from '../utils/pdfExport';
import { submitIntake } from '../services/intakeStore';
import { scoreIntake, callGeminiProxy } from '../services/intakeService';
import { deepseekChat } from '../services/deepseek';
import { OPERATIONAL_AGENTS } from '../agents/personas';
import type { IntakeData, IntakeScore } from '../types';

/* ─── Types ────────────────────────────────────────────────────────────── */

type ContactMethod = 'phone' | 'email';

interface IntakeFormData {
  name: string; contactMethod: ContactMethod; phone: string; email: string;
  matterType: string; description: string; courtDate: string;
  urgency: 'immediately' | 'days' | 'weeks' | '';
  jurisdiction: string; incidentDate: string; opposingParty: string;
  injuriesOrDamages: string; desiredOutcome: string; priorCounsel: string;
}

interface MayaAssessment {
  greeting: string; summary: string; nextSteps: string[];
  urgency: 'low' | 'medium' | 'high' | 'critical';
  strengths?: string[]; concerns?: string[]; specialist?: string;
  recommendation?: 'proceed' | 'schedule-consult' | 'refer-out' | 'decline';
  score?: number; clientMessage?: string;
}

interface ConversationMessage { role: 'maya' | 'user'; content: string; timestamp: number; }

interface Lead {
  id: string; name: string; email: string; phone: string; matterType: string;
  description: string; urgency: string; courtDate: string;
  aiAssessment: MayaAssessment; submittedAt: number;
}

interface ConflictMatch { party: string; reason: string; severity: 'warning' | 'high'; }
interface ConflictResult { clear: boolean; matches: ConflictMatch[]; }

/* ─── Helpers ──────────────────────────────────────────────────────────── */

function unifiedContact(form: IntakeFormData): string {
  return form.contactMethod === 'phone' ? form.phone.trim() : form.email.trim();
}

function saveLead(form: IntakeFormData, assessment: MayaAssessment) {
  try {
    const raw = localStorage.getItem('casebuddy_leads');
    const existing: Lead[] = raw ? JSON.parse(raw) : [];
    const lead: Lead = {
      id: `lead_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      name: form.name, email: form.email, phone: form.phone,
      matterType: form.matterType, description: form.description,
      urgency: form.urgency, courtDate: form.courtDate,
      aiAssessment: assessment, submittedAt: Date.now(),
    };
    const updated = [lead, ...existing].slice(0, 50);
    localStorage.setItem('casebuddy_leads', JSON.stringify(updated));
  } catch { /* ignore */ }
}

function normName(s: string): string {
  return (s || '').toLowerCase().replace(/[^a-z\s]/g, ' ').replace(/\s+/g, ' ').trim();
}
function extractNames(text: string): string[] {
  if (!text) return [];
  const matches = text.match(/\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})\b/g) || [];
  const stop = new Set(['I','The','A','An','My','We','They','He','She','It','On','In','At','For']);
  return Array.from(new Set(matches.map(m => m.trim()).filter(m => !stop.has(m))));
}
function namesOverlap(a: string, b: string): boolean {
  const ta = new Set(normName(a).split(' ').filter(w => w.length >= 3));
  return normName(b).split(' ').filter(w => w.length >= 3).some(w => ta.has(w));
}
function runConflictCheck(form: IntakeFormData): ConflictResult {
  const matches: ConflictMatch[] = [];
  try {
    const newParties = Array.from(new Set([form.name, ...extractNames(form.description)].map(n => n.trim()).filter(Boolean)));
    let cases: any[] = [];
    try { const r = localStorage.getItem('casebuddy_cases') || localStorage.getItem('lexsim_cases'); cases = r ? JSON.parse(r) : []; } catch { cases = []; }
    if (!Array.isArray(cases)) cases = [];
    for (const c of cases) {
      for (const party of newParties) {
        if (c?.opposingCounsel && namesOverlap(party, c.opposingCounsel)) matches.push({ party, reason: `"${party}" matches opposing counsel "${c.opposingCounsel}" in "${c.title}"`, severity: 'high' });
        if (c?.client && namesOverlap(party, c.client)) matches.push({ party, reason: `"${party}" matches existing client "${c.client}" in "${c.title}"`, severity: 'warning' });
      }
    }
    let leads: any[] = [];
    try { const r = localStorage.getItem('casebuddy_leads'); leads = r ? JSON.parse(r) : []; } catch { leads = []; }
    if (!Array.isArray(leads)) leads = [];
    for (const l of leads) {
      if (!l?.name) continue;
      if (normName(l.name) === normName(form.name) && l?.email === form.email) continue;
      for (const party of newParties) {
        if (namesOverlap(party, l.name)) matches.push({ party, reason: `"${party}" matches prior lead "${l.name}"`, severity: 'warning' });
      }
    }
    const seen = new Set<string>();
    return { clear: matches.length === 0, matches: matches.filter(m => { if (seen.has(m.reason)) return false; seen.add(m.reason); return true; }) };
  } catch { return { clear: true, matches: [] }; }
}

/* ─── Maya's system prompt ─────────────────────────────────────────────── */

const MAYA_SYSTEM_PROMPT = `You are Maya, the client intake specialist at CaseBuddy AI Law Firm. You are conducting a text-based intake interview.

PERSONA — sound like a real person, not a chatbot:
- Warm, professional, efficient. Use contractions naturally: "I'm", "we'll", "that's", "you're".
- Vary acknowledgments: "Got it.", "Okay.", "Right.", "I see.", "That makes sense." — never the same one twice in a row.
- NEVER say "Certainly!", "Absolutely!", "Of course!", "Great question!" — ever.
- NEVER say "I understand your frustration" or "Thank you for sharing that" — robotic and hollow.
- If they describe something hard or scary: "That sounds really stressful." or "I hear you — that's a lot." Then move on naturally.
- One question per message. Short responses (2–4 sentences). Clear and direct.

STEP 0 — REASON BEFORE YOU REPLY, EVERY SINGLE TURN:
Before writing your response, silently work through this checklist against the ENTIRE conversation so far (not just the last message):
  1. Re-read every message the client has sent, start to finish.
  2. Build your current knowledge state across all 11 fields below — mark each one KNOWN (with the value) or MISSING.
  3. Scan for information given "out of order" — e.g. they may state their contact info while answering a totally different question, or mention the opposing party while describing what happened. Capture it the moment it appears, regardless of which question you were asking.
  4. Pick the single highest-priority MISSING field (priority order is the numbered list below) and ask ONLY about that one.
  5. Before sending, double-check: "Am I about to ask for something already marked KNOWN?" If yes, STOP, re-pick from the MISSING list instead. Asking for something already given is the single worst mistake you can make in this job — it makes the firm look incompetent and the client feel unheard.
Do not show this reasoning to the client. Only the final natural-sounding message goes in your reply.

YOUR GOAL — gather all of this, in this PRIORITY ORDER:
1. Full NAME — ask this FIRST, before anything else, immediately after your opening. Something like: "Before we dive in — who am I speaking with?"
2. CONTACT INFO (best phone or email to reach them) — ask this SECOND, right after you have their name, still before hearing the story: "And what's the best number or email to reach you at?"
3. Only once you have both NAME and CONTACT INFO, invite the story: "Okay — now tell me what's going on."
4. MATTER TYPE (criminal, civil, family, injury, immigration, business, VA/veterans benefits, other)
5. What HAPPENED — let them tell the full story without interrupting
6. WHEN it happened (approximate date or timeframe is fine)
7. WHO they're up against (person, company, employer, insurance company, the VA, etc.)
8. Any INJURIES, damages, or financial losses
9. What they're hoping to achieve
10. Have they talked to another attorney before?
11. Any upcoming COURT DATES or deadlines, and how soon they need help (URGENCY)

FLOW:
- Open warmly, then immediately ask for their name (see priority order above) — do NOT ask what brings them in until you have name + contact.
- Once you have name + contact, let them talk. Don't interrupt mid-story.
- After they finish, acknowledge briefly, then gather what's still missing per the STEP 0 checklist — one item at a time, never something already known.
- If they give you multiple things at once, absorb it all and only ask about what's still unknown.
- When you have everything, offer a consultation time directly: "The attorney has some availability — would Tuesday afternoon or Thursday morning work better for a quick consultation?" Confirm a time before wrapping up.
- Close warmly: "Okay [name], I've got everything I need. One of our attorneys will take a look at this and be in touch at [their contact]. You did the right thing reaching out."

When all key info is collected and the intake is complete, end your final message with exactly: [INTAKE_COMPLETE]

CRITICAL RULES:
- NEVER re-ask for the client's name once given, in any form. NEVER re-ask for contact info once given. NEVER re-ask anything already stated anywhere in the transcript, even if phrased differently or given unprompted.
- Never give legal advice. If asked: "Our attorneys will review everything and advise you directly — I'm just making sure we have all the details."
- If asked directly whether you're AI: "I'm Maya, CaseBuddy's AI intake specialist. Not a licensed attorney, but I'll make sure the right one sees your case."
- Never invent or assume facts. Only use what the client actually says.`;

/* ─── Constants ────────────────────────────────────────────────────────── */

const MATTER_TYPES = [
  'Criminal Defense', 'Personal Injury', 'Family Law', 'Immigration',
  'Civil Litigation', 'Employment', 'Real Estate', 'Bankruptcy',
  'Estate Planning', 'Corporate / Business', 'Other',
];

const emptyForm = (): IntakeFormData => ({
  name: '', contactMethod: 'phone', phone: '', email: '', matterType: '',
  description: '', courtDate: '', urgency: '', jurisdiction: '',
  incidentDate: '', opposingParty: '', injuriesOrDamages: '',
  desiredOutcome: '', priorCounsel: '',
});

/* ─── Typing indicator ────────────────────────────────────────────────── */

const TypingIndicator: React.FC = () => (
  <div className="flex items-end gap-2 mb-4">
    <div className="w-8 h-8 rounded-full bg-violet-500/20 border border-violet-500/30 flex items-center justify-center shrink-0">
      <Bot size={14} className="text-violet-400" />
    </div>
    <div className="bg-slate-800 border border-slate-700 rounded-2xl rounded-bl-sm px-4 py-3">
      <div className="flex items-center gap-1.5">
        {[0, 150, 300].map(d => <div key={d} className="w-2 h-2 rounded-full bg-slate-500 animate-bounce" style={{ animationDelay: `${d}ms` }} />)}
      </div>
    </div>
  </div>
);

/* ─── Main ─────────────────────────────────────────────────────────────── */

const IntakePage: React.FC = () => {
  const [mode, setMode] = useState<'select' | 'chat' | 'form' | 'processing' | 'result'>('select');
  const [conversation, setConversation] = useState<ConversationMessage[]>([]);
  const [userInput, setUserInput] = useState('');
  const [mayaTyping, setMayaTyping] = useState(false);
  const [intakeComplete, setIntakeComplete] = useState(false);
  const [assessment, setAssessment] = useState<MayaAssessment | null>(null);
  const [conflict, setConflict] = useState<ConflictResult | null>(null);
  const [extractedForm, setExtractedForm] = useState<IntakeFormData>(emptyForm());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [letterState, setLetterState] = useState<{ text: string | null; loading: boolean; error: string | null; open: boolean; copied: boolean; }>({ text: null, loading: false, error: null, open: false, copied: false });
  const setLetter = (v: string | null) => setLetterState(s => ({ ...s, text: v }));
  const setLetterLoading = (v: boolean) => setLetterState(s => ({ ...s, loading: v }));
  const setLetterError = (v: string | null) => setLetterState(s => ({ ...s, error: v }));
  const setLetterOpen = (v: boolean) => setLetterState(s => ({ ...s, open: v }));
  const setCopied = (v: boolean) => setLetterState(s => ({ ...s, copied: v }));

  const [formStep, setFormStep] = useState(1);
  const [formData, setFormData] = useState<IntakeFormData>(emptyForm());

  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [conversation, mayaTyping]);

  /* ── Start chat ──────────────────────────────────────────────────────── */

  const startChat = useCallback(async () => {
    setMode('chat');
    setMayaTyping(true);
    await new Promise(r => setTimeout(r, 800 + Math.random() * 400));
    setConversation([{
      role: 'maya',
      content: "Hi! I'm Maya, the intake specialist here at CaseBuddy. I'll be gathering some details about your situation so our attorneys can review it.\n\nTo get started — what's going on? Tell me what brings you in today.",
      timestamp: Date.now(),
    }]);
    setMayaTyping(false);
    setTimeout(() => inputRef.current?.focus(), 100);
  }, []);

  /* ── Send message ────────────────────────────────────────────────────── */

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || mayaTyping || intakeComplete) return;
    const userMsg: ConversationMessage = { role: 'user', content: text.trim(), timestamp: Date.now() };
    const updatedConvo = [...conversation, userMsg];
    setConversation(updatedConvo);
    setUserInput('');
    setMayaTyping(true);
    try {
      const messages = updatedConvo.map(m => ({ role: m.role === 'maya' ? 'assistant' as const : 'user' as const, content: m.content }));
      let raw: string;
      try {
        raw = await deepseekChat({ systemInstruction: MAYA_SYSTEM_PROMPT, messages, temperature: 0.72, maxTokens: 380, timeoutMs: 30000 });
      } catch {
        const gc = messages.map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] }));
        raw = await callGeminiProxy({ model: 'gemini-2.5-flash', contents: gc, config: { systemInstruction: MAYA_SYSTEM_PROMPT } });
      }
      const isComplete = raw.includes('[INTAKE_COMPLETE]');
      const cleanResponse = raw.replace('[INTAKE_COMPLETE]', '').trim();
      const elapsed = Date.now() - userMsg.timestamp;
      const typingMs = Math.max(0, Math.min(2200, 700 + cleanResponse.length * 7) - elapsed);
      await new Promise(r => setTimeout(r, typingMs));
      const mayaMsg: ConversationMessage = { role: 'maya', content: cleanResponse, timestamp: Date.now() };
      setConversation(prev => [...prev, mayaMsg]);
      setMayaTyping(false);
      if (isComplete) {
        setIntakeComplete(true);
        setTimeout(() => processConversationalIntake([...updatedConvo, mayaMsg]), 2000);
      }
    } catch {
      setMayaTyping(false);
      setConversation(prev => [...prev, { role: 'maya', content: "Sorry, I hit a snag — could you give me just a moment and try again?", timestamp: Date.now() }]);
    }
  }, [conversation, mayaTyping, intakeComplete]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(userInput); }
  };

  /* ── Extract + process conversation ─────────────────────────────────── */

  const processConversationalIntake = async (convo: ConversationMessage[]) => {
    setMode('processing');
    setLoading(true);
    setError(null);
    try {
      const transcriptText = convo.map(m => `${m.role === 'maya' ? 'MAYA' : 'CLIENT'}: ${m.content}`).join('\n\n');
      const extractPrompt = `Read this intake conversation. Extract ONLY what the CLIENT explicitly stated. Never invent or infer.

CONVERSATION:
${transcriptText}

Return ONLY valid JSON:
{
  "fullName": "",
  "phone": "",
  "email": "",
  "contactMethod": "phone or email",
  "matterType": "practice area",
  "jurisdiction": "",
  "incidentDate": "",
  "summary": "1-2 sentence summary",
  "description": "full description of what happened",
  "opposingParty": "",
  "injuriesOrDamages": "",
  "desiredOutcome": "",
  "priorCounsel": "",
  "courtDate": "",
  "urgency": "immediately | days | weeks",
  "keyFacts": [],
  "openQuestions": [],
  "clientQuotes": []
}`;
      let extractRaw: string;
      try {
        extractRaw = await deepseekChat({ systemInstruction: 'Return ONLY valid JSON. No markdown.', messages: [{ role: 'user', content: extractPrompt }], temperature: 0.15, jsonMode: true, maxTokens: 1500, timeoutMs: 30000 });
      } catch {
        extractRaw = await callGeminiProxy({ model: 'gemini-2.5-flash', contents: [{ role: 'user', parts: [{ text: extractPrompt }] }], config: { responseMimeType: 'application/json' } });
      }
      const cleaned = extractRaw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
      let ext: any;
      try { ext = JSON.parse(cleaned); } catch {
        const s = cleaned.indexOf('{'); const e = cleaned.lastIndexOf('}');
        if (s !== -1 && e > s) ext = JSON.parse(cleaned.slice(s, e + 1));
        else throw new Error('Parse failed');
      }
      const built: IntakeFormData = {
        name: ext.fullName || 'Prospective Client',
        contactMethod: (ext.contactMethod as ContactMethod) || 'phone',
        phone: ext.phone || '', email: ext.email || '',
        matterType: ext.matterType || 'General Inquiry',
        description: ext.description || ext.summary || '',
        courtDate: ext.courtDate || '',
        urgency: (ext.urgency as any) || 'weeks',
        jurisdiction: ext.jurisdiction || '',
        incidentDate: ext.incidentDate || '',
        opposingParty: ext.opposingParty || '',
        injuriesOrDamages: ext.injuriesOrDamages || '',
        desiredOutcome: ext.desiredOutcome || '',
        priorCounsel: ext.priorCounsel || '',
      };
      setExtractedForm(built);
      await runAssessment(built, {
        keyFacts: Array.isArray(ext.keyFacts) ? ext.keyFacts : [],
        openQuestions: Array.isArray(ext.openQuestions) ? ext.openQuestions : [],
        clientQuotes: Array.isArray(ext.clientQuotes) ? ext.clientQuotes : [],
        summary: ext.summary || '',
      }, convo);
    } catch (err: any) {
      setError('Processing error. Please try again or use the form.');
      setLoading(false);
      setMode('chat');
    }
  };

  /* ── Core assessment logic ───────────────────────────────────────────── */

  const runAssessment = async (
    form: IntakeFormData,
    extras: { keyFacts: string[]; openQuestions: string[]; clientQuotes: string[]; summary: string },
    convo?: ConversationMessage[],
  ) => {
    const contact = unifiedContact(form);
    const firstName = form.name.split(' ')[0] || form.name;
    const assessPrompt = `You are Maya, intake specialist at CaseBuddy AI Law Firm. Analyze this intake and provide your professional assessment.

Client: ${form.name}
Contact (${form.contactMethod}): ${contact}
Matter: ${form.matterType}
Description: ${form.description}
When: ${form.incidentDate || 'Not stated'}
Opposing party: ${form.opposingParty || 'Not stated'}
Jurisdiction: ${form.jurisdiction || 'Not stated'}
Injuries/damages: ${form.injuriesOrDamages || 'Not stated'}
Desired outcome: ${form.desiredOutcome || 'Not stated'}
Prior counsel: ${form.priorCounsel || 'None stated'}
Court date: ${form.courtDate || 'None stated'}
Urgency: ${form.urgency || 'Not stated'}

RULES: Only use what the client stated. No hallucination. "greeting" must address ${firstName} by first name naturally. "clientMessage" must be warm and personal — reference their specific situation.

Return ONLY valid JSON:
{
  "greeting": "warm 1-2 sentence greeting using first name",
  "urgency": "low | medium | high | critical",
  "summary": "2 sentences covering the matter and core legal issue",
  "strengths": ["2-3 concrete positive factors"],
  "concerns": ["1-2 risks or gaps"],
  "nextSteps": ["3 specific actions"],
  "specialist": "agent id (maya/lex/sol/rex/sierra/doc/jules/max)",
  "recommendation": "proceed | schedule-consult | refer-out | decline",
  "score": 0,
  "clientMessage": "warm personal closing shown to client"
}`;

    let parsed: MayaAssessment;
    try {
      let raw: string;
      try { raw = await deepseekChat({ systemInstruction: 'Return ONLY valid JSON.', messages: [{ role: 'user', content: assessPrompt }], temperature: 0.4, jsonMode: true, maxTokens: 900, timeoutMs: 30000 }); }
      catch { raw = await callGeminiProxy({ model: 'gemini-2.5-flash', contents: [{ role: 'user', parts: [{ text: assessPrompt }] }], config: { responseMimeType: 'application/json' } }); }
      const c = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
      parsed = JSON.parse(c);
    } catch {
      parsed = {
        greeting: `Thanks ${firstName}, we've received your intake.`,
        urgency: 'medium', summary: form.description.slice(0, 200),
        strengths: extras.keyFacts.slice(0, 3), concerns: extras.openQuestions.slice(0, 2),
        nextSteps: ['An attorney will review your matter within 1 business day.', 'You will be contacted at the info you provided.', 'If urgent, call our office directly.'],
        recommendation: 'proceed', score: 50,
        clientMessage: `Thank you ${firstName}. We've received your intake and an attorney will review your ${form.matterType} matter and be in touch.`,
      };
    }

    const conflictResult = runConflictCheck(form);
    setConflict(conflictResult);
    setAssessment(parsed);
    saveLead(form, parsed);

    const intakeData: IntakeData = {
      fullName: form.name, contact, matterType: form.matterType,
      jurisdiction: form.jurisdiction || '', summary: extras.summary || parsed.summary || form.description.slice(0, 200),
      incidentDate: form.incidentDate || '', opposingParties: form.opposingParty || '',
      deadlines: form.courtDate || '', injuriesOrDamages: form.injuriesOrDamages || '',
      desiredOutcome: form.desiredOutcome || '', priorCounsel: form.priorCounsel || '',
      detailedNarrative: form.description,
      keyFacts: extras.keyFacts.length ? extras.keyFacts : (parsed.strengths ?? []),
      openQuestions: extras.openQuestions.length ? extras.openQuestions : (parsed.concerns ?? []),
      timeline: form.courtDate ? [{ date: form.courtDate, event: 'Court / deadline date' }] : [],
      parties: [{ name: form.name, role: 'Prospective client' }],
      clientQuotes: extras.clientQuotes, emotionalState: '', witnesses: '',
      evidenceMentioned: '', financialImpact: '', priorLegalActions: '',
    };

    let intakeScore: IntakeScore;
    try { intakeScore = await scoreIntake(intakeData); }
    catch {
      const urgencyMap: Record<string, IntakeScore['urgency']> = { immediately: 'high', days: 'medium', weeks: 'low' };
      intakeScore = {
        score: parsed.score ?? 50,
        disposition: (parsed.score ?? 50) >= 65 ? 'accepted' : (parsed.score ?? 50) >= 45 ? 'review' : 'denied',
        recommendedDepartment: form.matterType, recommendedAgentId: 'civil-litigation',
        factors: [...(parsed.strengths ?? []).map(s => ({ label: s, impact: 'positive' as const, note: '' })), ...(parsed.concerns ?? []).map(c => ({ label: c, impact: 'negative' as const, note: '' }))],
        reasoning: parsed.summary ?? '',
        clientMessage: parsed.clientMessage ?? `Thank you ${firstName}. We've received your intake and will be in touch soon.`,
        urgency: urgencyMap[form.urgency] ?? 'medium',
      };
    }
    try {
      const transcriptForSave = convo ? convo.map(m => ({ speaker: m.role, text: m.content })) : [];
      await submitIntake({ intake: intakeData, score: intakeScore, transcript: transcriptForSave });
    } catch (e: any) { console.error('[IntakePage] submitIntake error:', e?.message); }

    setLoading(false);
    setMode('result');
  };

  /* ── Form submit ─────────────────────────────────────────────────────── */

  const handleFormSubmit = async () => {
    setMode('processing');
    setLoading(true);
    await runAssessment(formData, { keyFacts: [], openQuestions: [], clientQuotes: [], summary: '' });
  };

  /* ── Generate engagement letter ──────────────────────────────────────── */

  const generateEngagementLetter = async () => {
    const form = conversation.length > 0 ? extractedForm : formData;
    setLetterLoading(true); setLetterError(null);
    try {
      const prompt = `Draft a professional attorney-client engagement letter. Plain text only, no markdown.

Client: ${form.name}
Contact: ${unifiedContact(form)}
Case Type: ${form.matterType}
Matter: ${form.description}
Jurisdiction: ${form.jurisdiction || 'To be determined'}

Include: scope of representation, fee agreement placeholder, client obligations, file retention, termination clause, signature blocks. Use [ATTORNEY NAME] and [FIRM NAME] placeholders.`;
      let letterText: string;
      try { letterText = await deepseekChat({ systemInstruction: 'You are a legal document expert. Draft only the letter text, plain text, no markdown.', messages: [{ role: 'user', content: prompt }], temperature: 0.25, maxTokens: 2500, timeoutMs: 30000 }); }
      catch { letterText = await callGeminiProxy({ model: 'gemini-2.5-flash', contents: [{ role: 'user', parts: [{ text: prompt }] }] }); }
      setLetter(letterText); setLetterOpen(true);
    } catch { setLetterError('Failed to generate letter. Please try again.'); }
    finally { setLetterLoading(false); }
  };

  const resetIntake = () => {
    setMode('select'); setConversation([]); setAssessment(null); setConflict(null);
    setIntakeComplete(false); setExtractedForm(emptyForm()); setFormData(emptyForm());
    setFormStep(1); setLetter(null); setUserInput(''); setError(null);
  };

  /* ──────────────────────────────────────────────────────────────────────
   * RENDER
   * ──────────────────────────────────────────────────────────────────── */

  /* Mode: Select */
  if (mode === 'select') return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-serif font-bold text-white flex items-center gap-2">
          <Gavel className="text-violet-400" size={24} /> Client Intake — Maya
        </h1>
        <p className="text-slate-400 mt-1 text-sm">Onboard a new client or prospective matter. Choose how you'd like to proceed.</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <button onClick={startChat} className="group relative overflow-hidden rounded-2xl border border-violet-500/40 bg-violet-500/5 p-7 text-left hover:border-violet-500/70 hover:bg-violet-500/10 transition-all">
          <div className="absolute -top-12 -right-12 w-40 h-40 rounded-full bg-violet-500/10 blur-3xl group-hover:bg-violet-500/20 transition-all" />
          <div className="relative">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-xl bg-violet-500/20 border border-violet-500/30 flex items-center justify-center"><MessageSquare size={22} className="text-violet-400" /></div>
              <div>
                <div className="flex items-center gap-2"><h2 className="text-lg font-bold text-white">Chat with Maya</h2><span className="text-xs font-bold px-2 py-0.5 rounded-full bg-violet-500/20 text-violet-300 border border-violet-500/30">RECOMMENDED</span></div>
                <p className="text-xs text-slate-500">AI-guided conversational intake</p>
              </div>
            </div>
            <p className="text-sm text-slate-300 mb-5 leading-relaxed">Maya will have a natural conversation — asking the right questions in the right order, just like a real intake coordinator. The fastest and most thorough way to capture a new matter.</p>
            <div className="flex items-center gap-2 text-violet-400 text-sm font-semibold">Start conversation <ArrowRight size={16} /></div>
          </div>
        </button>
        <button onClick={() => setMode('form')} className="group relative overflow-hidden rounded-2xl border border-slate-700 bg-slate-800/30 p-7 text-left hover:border-slate-600 hover:bg-slate-800/50 transition-all">
          <div className="relative">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-xl bg-slate-700 flex items-center justify-center"><FileText size={22} className="text-slate-300" /></div>
              <div><h2 className="text-lg font-bold text-white">Structured Form</h2><p className="text-xs text-slate-500">Step-by-step intake form</p></div>
            </div>
            <p className="text-sm text-slate-400 mb-5 leading-relaxed">Prefer filling out a form directly? Use our guided multi-step intake to capture all case details manually — including extended details like injuries, opposing party, and desired outcome.</p>
            <div className="flex items-center gap-2 text-slate-400 text-sm font-semibold">Open form <ArrowRight size={16} /></div>
          </div>
        </button>
      </div>
      <div className="mt-5 flex items-center gap-2 text-xs text-slate-500"><ShieldCheck size={13} /> All intake data is encrypted and subject to attorney-client privilege</div>
    </div>
  );

  /* Mode: Chat */
  if (mode === 'chat') return (
    <div className="flex flex-col max-w-3xl mx-auto" style={{ height: 'calc(100vh - 120px)' }}>
      <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-800 bg-slate-900/80 backdrop-blur-sm">
        <div className="w-9 h-9 rounded-full bg-violet-500/20 border border-violet-500/30 flex items-center justify-center"><Bot size={17} className="text-violet-400" /></div>
        <div><p className="text-sm font-bold text-white">Maya · CaseBuddy Intake</p><div className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" /><span className="text-xs text-slate-500">Online</span></div></div>
        <div className="ml-auto flex items-center gap-3">
          {intakeComplete && <span className="text-xs text-green-400 font-semibold flex items-center gap-1"><CheckCircle size={12} /> Complete</span>}
          <button onClick={() => setMode('select')} className="text-xs text-slate-500 hover:text-slate-300 transition-colors">← Back</button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-4 bg-slate-900/40">
        {conversation.map((msg, i) => (
          <div key={i} className={`flex items-end gap-2 mb-4 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
            {msg.role === 'maya' && <div className="w-8 h-8 rounded-full bg-violet-500/20 border border-violet-500/30 flex items-center justify-center shrink-0"><Bot size={14} className="text-violet-400" /></div>}
            <div className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${msg.role === 'maya' ? 'bg-slate-800 border border-slate-700 text-slate-100 rounded-bl-sm' : 'bg-violet-600 text-white rounded-br-sm'}`}>{msg.content}</div>
          </div>
        ))}
        {mayaTyping && <TypingIndicator />}
        <div ref={chatEndRef} />
      </div>
      <div className="px-4 py-3 border-t border-slate-800 bg-slate-900/80 backdrop-blur-sm">
        {intakeComplete ? (
          <div className="text-center py-2 text-sm text-slate-400"><Loader2 size={16} className="animate-spin inline mr-2" />Processing your intake…</div>
        ) : (
          <div className="flex items-end gap-3">
            <textarea ref={inputRef} value={userInput} onChange={e => setUserInput(e.target.value)} onKeyDown={handleKeyDown} placeholder="Type your message… (Enter to send, Shift+Enter for new line)" disabled={mayaTyping || intakeComplete} rows={2} className="flex-1 bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-violet-500/50 resize-none disabled:opacity-50" />
            <button onClick={() => sendMessage(userInput)} disabled={!userInput.trim() || mayaTyping || intakeComplete} className="w-10 h-10 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center transition-colors shrink-0"><Send size={16} className="text-white" /></button>
          </div>
        )}
        <p className="text-xs text-slate-600 mt-1.5 text-center">Maya is an AI intake specialist — not a licensed attorney</p>
      </div>
    </div>
  );

  /* Mode: Processing */
  if (mode === 'processing') return (
    <div className="p-6 max-w-lg mx-auto text-center py-24">
      <div className="w-16 h-16 rounded-2xl bg-violet-500/20 border border-violet-500/30 flex items-center justify-center mx-auto mb-5"><Sparkles size={28} className="text-violet-400 animate-pulse" /></div>
      <h2 className="text-xl font-bold text-white mb-2">Maya is reviewing your intake</h2>
      <p className="text-slate-400 text-sm">Analyzing the matter, running a conflict check, scoring the case, and preparing the file…</p>
      <div className="mt-6 flex justify-center"><Loader2 size={20} className="text-violet-400 animate-spin" /></div>
    </div>
  );

  /* Mode: Form */
  if (mode === 'form') {
    const STEPS = ['Contact', 'Matter', 'Details', 'Urgency'];
    const setF = (k: keyof IntakeFormData) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setFormData(prev => ({ ...prev, [k]: e.target.value }));
    const canAdvance = () => {
      if (formStep === 1) { const hasName = formData.name.trim().length >= 2; const hasContact = formData.contactMethod === 'phone' ? formData.phone.trim().length >= 7 : formData.email.trim().includes('@'); return hasName && hasContact; }
      if (formStep === 2) return !!(formData.matterType && formData.description.trim().length >= 15);
      if (formStep === 3) return true;
      if (formStep === 4) return formData.urgency !== '';
      return false;
    };
    const Inp = ({ k, placeholder, type = 'text' }: { k: keyof IntakeFormData; placeholder?: string; type?: string }) => (
      <input type={type} value={formData[k] as string} onChange={setF(k)} placeholder={placeholder} className="w-full bg-slate-700/60 border border-slate-600 rounded-xl px-3 py-2.5 text-white text-sm placeholder-slate-500 focus:outline-none focus:border-violet-500/50 transition-colors" />
    );
    const Lbl = ({ label, children }: { label: string; children: React.ReactNode }) => (
      <div><label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">{label}</label>{children}</div>
    );
    return (
      <div className="p-6 max-w-2xl mx-auto">
        <div className="mb-6 flex items-center gap-3"><button onClick={() => setMode('select')} className="text-slate-500 hover:text-slate-300 text-sm transition-colors">← Back</button><h1 className="text-xl font-serif font-bold text-white">Client Intake Form</h1></div>
        <div className="flex items-center gap-0 mb-8">
          {STEPS.map((label, i) => { const s = i + 1; const done = s < formStep; const active = s === formStep; return (
            <React.Fragment key={s}>
              <div className="flex items-center gap-2"><div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold border transition-all ${done ? 'bg-violet-500 border-violet-500 text-white' : active ? 'bg-violet-500/20 border-violet-500 text-violet-400' : 'bg-slate-800 border-slate-700 text-slate-500'}`}>{done ? <CheckCircle size={14} /> : s}</div><span className={`text-sm font-medium hidden sm:inline ${active ? 'text-violet-300' : done ? 'text-slate-300' : 'text-slate-600'}`}>{label}</span></div>
              {i < STEPS.length - 1 && <div className={`flex-1 h-px mx-2 transition-all ${done ? 'bg-violet-500/50' : 'bg-slate-800'}`} />}
            </React.Fragment>
          ); })}
        </div>
        <div className="bg-slate-800/40 border border-slate-700/50 rounded-2xl p-6 space-y-5">
          {formStep === 1 && (<>
            <Lbl label="Full Name"><Inp k="name" placeholder="First and last name" /></Lbl>
            <Lbl label="Preferred Contact Method"><div className="flex gap-3">{(['phone', 'email'] as ContactMethod[]).map(m => (<button key={m} onClick={() => setFormData(p => ({ ...p, contactMethod: m }))} className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border text-sm font-medium transition-all ${formData.contactMethod === m ? 'bg-violet-500/20 border-violet-500 text-violet-300' : 'border-slate-600 text-slate-400 hover:border-slate-500'}`}>{m === 'phone' ? <><Phone size={15} /> Phone</> : <><Mail size={15} /> Email</>}</button>))}</div></Lbl>
            {formData.contactMethod === 'phone' ? <Lbl label="Phone Number"><Inp k="phone" placeholder="(555) 555-5555" type="tel" /></Lbl> : <Lbl label="Email Address"><Inp k="email" placeholder="client@example.com" type="email" /></Lbl>}
          </>)}
          {formStep === 2 && (<>
            <Lbl label="Type of Legal Matter"><select value={formData.matterType} onChange={setF('matterType')} className="w-full bg-slate-700/60 border border-slate-600 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:border-violet-500/50"><option value="">Select matter type…</option>{MATTER_TYPES.map(t => <option key={t} value={t}>{t}</option>)}</select></Lbl>
            <Lbl label="Describe the Situation"><textarea value={formData.description} onChange={setF('description')} rows={5} placeholder="What happened? Include dates, parties, what you're hoping to achieve…" className="w-full bg-slate-700/60 border border-slate-600 rounded-xl px-3 py-2.5 text-white text-sm placeholder-slate-500 focus:outline-none focus:border-violet-500/50 resize-none" /></Lbl>
          </>)}
          {formStep === 3 && (<>
            <Lbl label="Date of Incident"><Inp k="incidentDate" placeholder="e.g. March 15, 2025" /></Lbl>
            <Lbl label="Opposing Party"><Inp k="opposingParty" placeholder="Person, company, employer, insurer…" /></Lbl>
            <Lbl label="Jurisdiction"><Inp k="jurisdiction" placeholder="State or city" /></Lbl>
            <Lbl label="Injuries or Damages"><Inp k="injuriesOrDamages" placeholder="Physical injuries, financial losses, property damage…" /></Lbl>
            <Lbl label="Desired Outcome"><Inp k="desiredOutcome" placeholder="What do you hope to achieve?" /></Lbl>
            <Lbl label="Prior Counsel"><Inp k="priorCounsel" placeholder="Have you spoken to another attorney?" /></Lbl>
            <Lbl label="Upcoming Court Date or Deadline"><Inp k="courtDate" type="date" /></Lbl>
          </>)}
          {formStep === 4 && (
            <Lbl label="How soon do you need legal assistance?"><div className="space-y-3 mt-1">{[{value:'immediately',label:'Immediately',desc:'Today — urgent deadline or emergency'},{value:'days',label:'Within a few days',desc:'Pressing, but not today'},{value:'weeks',label:'Within a few weeks',desc:'Planning ahead'}].map(opt => (<button key={opt.value} onClick={() => setFormData(p => ({ ...p, urgency: opt.value as any }))} className={`w-full flex items-center gap-4 p-4 rounded-xl border text-left transition-all ${formData.urgency === opt.value ? 'border-violet-500 bg-violet-500/10' : 'border-slate-700 bg-slate-800/40 hover:border-slate-600'}`}><div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${formData.urgency === opt.value ? 'border-violet-500 bg-violet-500' : 'border-slate-600'}`}>{formData.urgency === opt.value && <div className="w-2 h-2 rounded-full bg-white" />}</div><div><p className={`text-sm font-semibold ${formData.urgency === opt.value ? 'text-violet-300' : 'text-slate-200'}`}>{opt.label}</p><p className="text-xs text-slate-500 mt-0.5">{opt.desc}</p></div></button>))}</div></Lbl>
          )}
        </div>
        <div className="flex gap-3 mt-5">
          {formStep > 1 && <button onClick={() => setFormStep(s => s - 1)} className="px-5 py-2.5 rounded-xl border border-slate-700 text-slate-300 hover:bg-slate-800 text-sm font-medium transition-colors">Back</button>}
          <button onClick={() => formStep < 4 ? setFormStep(s => s + 1) : handleFormSubmit()} disabled={!canAdvance() || loading} className="flex-1 flex items-center justify-center gap-2 bg-violet-600 hover:bg-violet-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold px-6 py-2.5 rounded-xl transition-colors text-sm">
            {loading ? <><Loader2 size={16} className="animate-spin" />Processing…</> : formStep < 4 ? <>Continue <ChevronRight size={16} /></> : <>Submit Intake <CheckCircle size={16} /></>}
          </button>
        </div>
      </div>
    );
  }

  /* Mode: Result */
  if (mode === 'result' && assessment) {
    const form = conversation.length > 0 ? extractedForm : formData;
    const urgencyColor = { low: 'text-green-400 bg-green-500/10 border-green-500/30', medium: 'text-amber-400 bg-amber-500/10 border-amber-500/30', high: 'text-orange-400 bg-orange-500/10 border-orange-500/30', critical: 'text-red-400 bg-red-500/10 border-red-500/30' }[assessment.urgency] ?? 'text-slate-400 bg-slate-800 border-slate-700';
    const recColor = { proceed: 'text-green-400', 'schedule-consult': 'text-blue-400', 'refer-out': 'text-amber-400', decline: 'text-red-400' }[assessment.recommendation ?? 'proceed'] ?? 'text-slate-400';
    const recLabel = { proceed: '✓ Proceed with Intake', 'schedule-consult': '📅 Schedule Consultation', 'refer-out': '→ Refer to Specialist', decline: '✕ Decline Matter' }[assessment.recommendation ?? 'proceed'] ?? 'Review';
    return (
      <div className="p-6 max-w-3xl mx-auto space-y-5">
        <div className="rounded-2xl border border-green-500/30 bg-green-500/5 p-6"><div className="flex items-start gap-4"><CheckCircle size={34} className="text-green-400 shrink-0 mt-0.5" /><div><h2 className="text-xl font-bold text-white mb-1">Intake Complete — {form.name}</h2><p className="text-slate-300 text-sm leading-relaxed">{assessment.clientMessage || assessment.greeting}</p></div></div></div>
        {conflict && !conflict.clear && (<div className="rounded-2xl border border-red-500/40 bg-red-500/5 p-5"><div className="flex items-center gap-2 mb-3"><ShieldAlert size={18} className="text-red-400" /><h3 className="text-sm font-bold text-red-300">Conflict Check — Potential Issues</h3></div><div className="space-y-2">{conflict.matches.map((m, i) => (<div key={i} className={`flex items-start gap-2 text-xs p-2.5 rounded-lg ${m.severity === 'high' ? 'bg-red-500/10 text-red-300' : 'bg-amber-500/10 text-amber-300'}`}><AlertCircle size={12} className="shrink-0 mt-0.5" />{m.reason}</div>))}</div></div>)}
        {conflict?.clear && <div className="flex items-center gap-2 text-xs text-green-400 bg-green-500/5 border border-green-500/20 rounded-xl px-4 py-2.5"><ShieldCheck size={14} /> No conflicts detected in current case files</div>}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="rounded-xl border border-slate-700 bg-slate-800/40 p-4"><p className="text-xs text-slate-500 uppercase font-bold tracking-wider mb-1.5">Case Viability</p><div className="flex items-end gap-2"><p className="text-3xl font-bold text-white">{assessment.score ?? '—'}</p><p className="text-slate-500 text-sm mb-1">/100</p></div></div>
          <div className={`rounded-xl border p-4 ${urgencyColor}`}><p className="text-xs uppercase font-bold tracking-wider mb-1.5 opacity-70">Urgency</p><p className="text-lg font-bold capitalize">{assessment.urgency}</p></div>
          <div className="rounded-xl border border-slate-700 bg-slate-800/40 p-4"><p className="text-xs text-slate-500 uppercase font-bold tracking-wider mb-1.5">Recommendation</p><p className={`text-sm font-bold ${recColor}`}>{recLabel}</p></div>
        </div>
        <div className="rounded-2xl border border-slate-700 bg-slate-800/40 p-5"><p className="text-xs text-slate-500 uppercase font-bold tracking-wider mb-3">Case Summary</p><p className="text-slate-200 text-sm leading-relaxed">{assessment.summary}</p></div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {(assessment.strengths?.length ?? 0) > 0 && (<div className="rounded-2xl border border-green-500/20 bg-green-500/5 p-5"><p className="text-xs text-green-400 uppercase font-bold tracking-wider mb-3">Strengths</p><ul className="space-y-2">{assessment.strengths!.map((s, i) => <li key={i} className="flex items-start gap-2 text-sm text-slate-200"><CheckCircle size={13} className="text-green-400 shrink-0 mt-0.5" />{s}</li>)}</ul></div>)}
          {(assessment.concerns?.length ?? 0) > 0 && (<div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-5"><p className="text-xs text-amber-400 uppercase font-bold tracking-wider mb-3">Concerns / Gaps</p><ul className="space-y-2">{assessment.concerns!.map((c, i) => <li key={i} className="flex items-start gap-2 text-sm text-slate-200"><AlertCircle size={13} className="text-amber-400 shrink-0 mt-0.5" />{c}</li>)}</ul></div>)}
        </div>
        {(assessment.nextSteps?.length ?? 0) > 0 && (<div className="rounded-2xl border border-blue-500/20 bg-blue-500/5 p-5"><p className="text-xs text-blue-400 uppercase font-bold tracking-wider mb-3">Next Steps</p><ol className="space-y-2">{assessment.nextSteps.map((s, i) => <li key={i} className="flex items-start gap-3 text-sm text-slate-200"><span className="w-5 h-5 rounded-full bg-blue-500/20 text-blue-400 text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">{i + 1}</span>{s}</li>)}</ol></div>)}
        <div className="flex flex-wrap gap-3 pt-1">
          {!letterState.text ? (
            <button onClick={generateEngagementLetter} disabled={letterState.loading} className="flex items-center gap-2 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white font-bold px-5 py-2.5 rounded-xl text-sm transition-colors">
              {letterState.loading ? <><Loader2 size={15} className="animate-spin" />Generating…</> : <><ScrollText size={15} />Generate Engagement Letter</>}
            </button>
          ) : (
            <button onClick={() => setLetterOpen(!letterState.open)} className="flex items-center gap-2 bg-violet-500/20 border border-violet-500/30 text-violet-300 px-5 py-2.5 rounded-xl hover:bg-violet-500/30 text-sm font-medium transition-colors"><ScrollText size={15} />{letterState.open ? 'Hide' : 'View'} Letter</button>
          )}
          {letterState.text && (<>
            <button onClick={() => { navigator.clipboard.writeText(letterState.text!); setCopied(true); setTimeout(() => setCopied(false), 2000); }} className="flex items-center gap-2 border border-slate-700 text-slate-300 px-4 py-2.5 rounded-xl hover:bg-slate-800 text-sm transition-colors"><Copy size={14} />{letterState.copied ? 'Copied!' : 'Copy'}</button>
            <button onClick={() => printAsPdf(textToPdfHtml(letterState.text!, `Engagement Letter — ${form.name}`))} className="flex items-center gap-2 border border-slate-700 text-slate-300 px-4 py-2.5 rounded-xl hover:bg-slate-800 text-sm transition-colors"><Printer size={14} />Print / PDF</button>
          </>)}
          <button onClick={resetIntake} className="flex items-center gap-2 border border-slate-700 text-slate-400 px-4 py-2.5 rounded-xl hover:bg-slate-800 text-sm transition-colors ml-auto">+ New Intake</button>
        </div>
        {letterState.error && <p className="text-xs text-red-400">{letterState.error}</p>}
        {letterState.text && letterState.open && (<div className="mt-3 bg-slate-900 border border-slate-700 rounded-xl p-5 max-h-96 overflow-y-auto"><pre className="whitespace-pre-wrap text-slate-300 text-xs font-mono leading-relaxed">{letterState.text}</pre></div>)}
      </div>
    );
  }

  return null;
};

export default IntakePage;
