import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  Phone, PhoneOff, Scale, Mic, Volume2, ShieldCheck, CheckCircle2, Clock,
  HeartHandshake, AlertCircle, Loader2, Copy, Upload, Bot, Send,
  ChevronRight, CheckCircle, MessageSquare, FileText, Check, ArrowRight, Mail
} from 'lucide-react';
import { useDeepgramVoiceAgent } from '../hooks/useDeepgramVoiceAgent';
import { extractIntake, scoreIntake, callGeminiProxy } from '../services/intakeService';
import { submitIntake } from '../services/intakeStore';
import { resolveClientToken, markInviteCompleted, ResolvedClientInvite } from '../services/clientInviteStore';
import { emailIntakeHandoff } from '../services/firmComms';
import { IntakeData, IntakeScore } from '../types';
import { toast } from 'react-toastify';
import { deepseekChat } from '../services/deepseek';
import {
  detectAndSwitchLanguage, getMayaLanguageProfile, getMayaWrapUpText,
  generateDocumentRequestLink, getDocumentRequestText,
  type SupportedLanguage, type MayaLanguageProfile
} from '../services/mayaEnhancementsService';

// Public, link-shareable voice intake. A prospect opens the link, Maya picks up
// in her own voice, greets them, and conducts the intake. On finish we distill
// the conversation, score it, route it, and persist it for the firm — then show
// the prospect a warm, human outcome.

// Maya's voice — Thalia is Deepgram's warmest, most natural-sounding American female.
const MAYA_VOICE = 'aura-2-thalia-en';

// When a client token is present, Maya already knows who she's speaking with
// This is injected at runtime inside the component after invite resolves
const MAYA_INTAKE_PROMPT = `You are Maya, the intake specialist at CaseBuddy. You answer the phone like a real person at a real law firm — warm, professional, and genuinely interested in helping. You're the first voice people hear, and you make them feel like they called the right place.

YOUR GOAL — come away with ALL of this (it goes straight into the attorney's file):
1. Their NAME — right after they explain what's going on, ask naturally: "Of course — and who am I speaking with?" Then use their first name for the rest of the call.
2. What HAPPENED — let them tell the full story. Don't interrupt, don't rush. If they pause, wait — silence is fine.
3. WHEN it happened (rough timeframe is fine)
4. WHO they're up against (person, company, employer, insurer, landlord, etc.)
5. Any INJURIES, damages, or financial impact
6. What they're hoping for — advice, representation, or a referral?
7. Their CONTACT INFO — ask before wrapping up: "What's the best number to reach you at?" Read it back to confirm.
8. SCHEDULING — offer a consultation directly. Don't just say "we'll be in touch." Give them real options: "The attorney has some availability — would Tuesday afternoon or Thursday morning work better?" Lock in a time and confirm it.

PACING — efficient, never rushed:
- Let them finish completely. If they're mid-story, stay quiet. A scared or upset person may ramble — that's okay. Capture everything.
- Never re-ask something they've already told you. Track what you know.
- Once you have a piece of info, move forward — don't pad or repeat.
- After you have everything, wrap up warmly and confirm contact info and consultation time.

VOICE STYLE — sound like a real human:
- Contractions always: "I'm", "we'll", "that's", "you're", "don't".
- Natural transitions: "So…", "Okay, and…", "Got it — and when did this happen?", "Tell me a little more about…"
- Vary acknowledgments: "Got it.", "Okay.", "Right.", "I see.", "Mm-hmm." — never the same one back to back.
- NEVER say "Certainly!", "Absolutely!", "Of course!" — ever. These are dead giveaways of a script.
- NEVER say "I understand your frustration" or "Thank you for sharing that" — hollow and robotic.
- When they describe something hard: "That sounds really stressful." or "That's a lot." — then a brief natural pause, then continue.
- When they finish a long story: "Okay, I got all of that." or "Okay, I'm with you." Then move forward.

CRITICAL — NO LOOPING:
- Never re-ask for their name once given. Never re-ask for contact info. Never re-ask anything.
- If they gave you multiple pieces at once, absorb it all and only ask about what's genuinely still missing.
- Track the conversation state in your head. Move forward, not in circles.

WRAPPING UP:
- Before closing, confirm you have: their name, a phone number or email, and a consultation time (or that they declined one).
- Close warmly: "Okay [name], I've got everything I need. One of our attorneys is going to take a look at this and reach out to you at the number you gave me. You did the right thing calling." If they booked a time, confirm it once more.

BOUNDARIES:
- No legal advice. If asked: "Our attorneys will review everything and advise you — I'm just making sure they have all the details."
- If asked directly whether you're AI: "I'm Maya, CaseBuddy's AI intake specialist — not a licensed attorney, but I'll make sure the right one sees your case."
- Never invent facts, dates, names, or legal conclusions the caller didn't state.`;

// Professional, warm greeting// Professional, warm greeting — like a real receptionist picking up the phone
const MAYA_GREETING = "Hi, this is Maya over at CaseBuddy — how can I help you today?";

type Transcript = { speaker: string; text: string }[];

// If AI extraction is unavailable, we still keep the lead: build a minimal
// record from the raw conversation so the firm can follow up by hand. The full
// transcript is persisted alongside this, so nothing the caller said is lost.
const fallbackIntake = (transcript: Transcript): IntakeData => {
  const summary =
    transcript
      .filter(t => t.speaker === 'you' || t.speaker === 'user')
      .map(t => t.text)
      .join(' ')
      .slice(0, 280) || 'Voice intake — see transcript for details.';
  return {
    fullName: 'Prospective Client',
    contact: '',
    matterType: 'General Inquiry',
    jurisdiction: '',
    summary,
    incidentDate: '',
    opposingParties: '',
    deadlines: '',
    injuriesOrDamages: '',
    desiredOutcome: '',
    priorCounsel: '',
  };
};

// If scoring is unavailable, route to manual review rather than denying — a real
// person decides, and the caller still hears a warm, human close.
const fallbackScore = (): IntakeScore => ({
  score: 50,
  disposition: 'review',
  recommendedDepartment: 'General Practice',
  recommendedAgentId: 'civil-litigation',
  factors: [],
  reasoning: 'Automated scoring was unavailable; routed for manual review.',
  clientMessage:
    "Thanks so much for taking the time to share what's going on. I've passed everything along to our team, and one of our attorneys will review it and reach out to you shortly.",
  urgency: 'medium',
});

type ContactMethod = 'phone' | 'email';

interface IntakeFormData {
  name: string; contactMethod: ContactMethod; phone: string; email: string;
  matterType: string; description: string; courtDate: string;
  urgency: 'immediately' | 'days' | 'weeks' | '';
  jurisdiction: string; incidentDate: string; opposingParty: string;
  injuriesOrDamages: string; desiredOutcome: string; priorCounsel: string;
}

interface ConversationMessage { role: 'maya' | 'user'; content: string; timestamp: number; }

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

const MAYA_CHAT_SYSTEM_PROMPT = `You are Maya, the client intake specialist at CaseBuddy AI Law Firm. You are conducting a text-based intake interview.

PERSONA — sound like a real person, not a chatbot:
- Warm, professional, efficient. Use contractions naturally: "I'm", "we'll", "that's", "you're".
- Vary acknowledgments: "Got it.", "Okay.", "Right.", "I see.", "That makes sense." — never the same one twice in a row.
- NEVER say "Certainly!", "Absolutely!", "Of course!", "Great question!" — ever.
- NEVER say "I understand your frustration" or "Thank you for sharing that" — robotic and hollow.
- If they describe something hard or scary: "That sounds really stressful." or "I hear you — that's a lot." Then move on naturally.
- One question per message. Short responses (2–4 sentences). Clear and direct.

YOUR GOAL — gather all of this through conversation:
1. Full NAME (ask right after they explain what's going on: "Of course — and who am I speaking with?")
2. CONTACT INFO (best phone or email to reach them)
3. MATTER TYPE (criminal, civil, family, injury, immigration, business, other)
4. What HAPPENED — let them tell the full story without interrupting
5. WHEN it happened (approximate date or timeframe is fine)
6. WHO they're up against (person, company, employer, insurance company, etc.)
7. Any INJURIES, damages, or financial losses
8. What they're hoping to achieve
9. Have they talked to another attorney before?
10. Any upcoming COURT DATES or deadlines?
11. How soon they need help (URGENCY)

FLOW:
- Open warmly and ask what brings them in.
- Let them talk. Don't interrupt mid-story.
- After they finish, acknowledge briefly, then gather what's still missing — one item at a time.
- If they give you multiple things at once, absorb it all and only ask about what's still unknown.
- When you have everything, offer a consultation time directly: "The attorney has some availability — would Tuesday afternoon or Thursday morning work better for a quick consultation?" Confirm a time before wrapping up.
- Close warmly: "Okay [name], I've got everything I need. One of our attorneys will take a look at this and be in touch at [their contact]. You did the right thing reaching out."

When all key info is collected and the intake is complete, end your final message with exactly: [INTAKE_COMPLETE]

CRITICAL RULES:
- Never give legal advice. If asked: "Our attorneys will review everything and advise you directly — I'm just making sure we have all the details."
- If asked directly whether you're AI: "I'm Maya, CaseBuddy's AI intake specialist. Not a licensed attorney, but I'll make sure the right one sees your case."
- Never invent or assume facts. Only use what the client actually says.`;

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

type Phase = 'welcome' | 'talking' | 'processing' | 'result';

const PublicIntake: React.FC = () => {
  const { token } = useParams<{ token?: string }>();
  const [firmId, setFirmId] = React.useState<string | null>(null);

  const [clientInvite, setClientInvite] = React.useState<ResolvedClientInvite | null>(null);
  const [mode, setMode] = useState<'voice' | 'chat' | 'form'>('voice');

  // Resolve the client invite token on mount — gets firm_id + client context for Maya
  React.useEffect(() => {
    // Check URL parameters for mode
    const searchParams = new URLSearchParams(window.location.search);
    const modeParam = searchParams.get('mode') as 'voice' | 'chat' | 'form' | null;
    if (modeParam && ['voice', 'chat', 'form'].includes(modeParam)) {
      setMode(modeParam);
    }

    if (token) {
      resolveClientToken(token).then(invite => {
        if (invite) {
          setFirmId(invite.firm_id);
          setClientInvite(invite);

          // If mode wasn't explicitly set in URL, check notes metadata tag
          if (!modeParam) {
            const match = (invite.notes || '').match(/\[mode:(voice|chat|form)\]/);
            if (match && ['voice', 'chat', 'form'].includes(match[1])) {
              setMode(match[1] as any);
            }
          }
        } else {
          console.warn('[PublicIntake] Unknown token — intake will use default firm_id');
        }
      });
    }
  }, [token]);

  const [phase, setPhase] = useState<Phase>('welcome');
  const [result, setResult] = useState<IntakeScore | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [docRequest, setDocRequest] = useState<ReturnType<typeof generateDocumentRequestLink> | null>(null);
  const transcriptEndRef = useRef<HTMLDivElement>(null);

  // New Chat/Form states
  const [conversation, setConversation] = useState<ConversationMessage[]>([]);
  const [userInput, setUserInput] = useState('');
  const [mayaTyping, setMayaTyping] = useState(false);
  const [intakeComplete, setIntakeComplete] = useState(false);
  const [formStep, setFormStep] = useState(1);
  const [formData, setFormData] = useState<IntakeFormData>(emptyForm());
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // When a client token resolves, inject client context so Maya greets by name
  // and skips re-asking for info the attorney already captured
  const firstName = clientInvite?.client_name?.split(' ')[0] ?? '';
  const cleanNotes = clientInvite?.notes ? clientInvite.notes.replace(/\[mode:(voice|chat|form)\]/g, '').trim() : '';

  // Force Maya to English unless the attorney explicitly noted they are hispanic/spanish speaking
  const isHispanic = clientInvite?.notes?.toLowerCase().match(/\b(hispanic|spanish)\b/);
  const storedLang = (isHispanic ? 'es' : 'en') as SupportedLanguage;
  const mayaProfile = getMayaLanguageProfile(storedLang);

  // Build system instruction with language-aware Maya prompt
  const basePrompt = mayaProfile.systemPrompt || MAYA_INTAKE_PROMPT;

  const systemInstruction = clientInvite?.client_name
    ? `${basePrompt}

IMPORTANT — you already know who you are speaking with:
Client name: ${clientInvite.client_name}${clientInvite.client_phone ? `
Phone on file: ${clientInvite.client_phone}` : ''}${clientInvite.client_email ? `
Email on file: ${clientInvite.client_email}` : ''}${cleanNotes ? `
Attorney notes: ${cleanNotes}` : ''}

Open with: "Hi ${firstName}, thanks for calling in — " and use their name naturally. You already have their contact info so skip asking for it unless they want to update it.`
    : basePrompt;

  const voice = useDeepgramVoiceAgent({
    voiceModel: MAYA_VOICE,
    agentId: 'maya',
    // Use Deepgram's native Aura-2 voice (Thalia — warm, natural American
    // female). The ElevenLabs BYO path opens a second WebSocket to
    // ElevenLabs that fails with FAILED_TO_SPEAK when the voice/key/format
    // don't line up; Aura-2 is single-connection and needs no external key,
    // so intake always has a working voice.
    useElevenLabs: false,
    systemInstruction,
    greeting: mayaProfile.greeting,
    publicEndpoint: true,
  });
  const { status, error, liveCaption, transcript, inputLevel, agentSpeaking, start, stop } = voice;

  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [transcript, liveCaption]);

  // Language detection disabled — user requested English only unless explicitly specified.

  const finishIntake = async (intake: IntakeData, score?: IntakeScore | null, transcriptForSave: any[] = []) => {
    let finalScore: IntakeScore;
    if (score) {
      finalScore = score;
    } else {
      try {
        finalScore = await scoreIntake(intake);
      } catch {
        finalScore = fallbackScore();
      }
    }

    let intakeId: string | undefined;
    try {
      const result = await submitIntake({
        firmId:         firmId ?? undefined,
        clientInviteId: clientInvite?.invite_id,
        intake,
        score: finalScore,
        transcript: transcriptForSave,
      });
      intakeId = result?.id;
      // Mark the invite as completed so attorney can track it
      if (clientInvite?.invite_id && result?.id) {
        void markInviteCompleted(clientInvite.invite_id, result.id);
      }
    } catch (saveErr: any) {
      console.error('[PublicIntake] submitIntake failed:', saveErr?.message);
    }
    // Hand the case off to the routed specialist by email
    void emailIntakeHandoff(intake, finalScore);
    setResult(finalScore);
    // Generate document upload request for this intake
    if (intakeId) {
      const docReq = generateDocumentRequestLink(intakeId);
      setDocRequest(docReq);
    }
    setPhase('result');
  };

  const begin = async () => {
    setSubmitError(null);
    if (mode === 'chat') {
      setPhase('talking');
      setMayaTyping(true);
      await new Promise(r => setTimeout(r, 800 + Math.random() * 400));
      const initialGreeting = clientInvite?.client_name
        ? `Hi ${firstName}! I'm Maya, the intake specialist at CaseBuddy. I've got your contact info, but I'd like to understand what brings you in today — what's going on?`
        : "Hi! I'm Maya, the intake specialist here at CaseBuddy. I'll be gathering some details about your situation so our attorneys can review it.\n\nTo get started — what's going on? Tell me what brings you in today.";
      setConversation([{
        role: 'maya',
        content: initialGreeting,
        timestamp: Date.now(),
      }]);
      setMayaTyping(false);
      setTimeout(() => inputRef.current?.focus(), 100);
    } else if (mode === 'form') {
      if (clientInvite) {
        setFormData(prev => ({
          ...prev,
          name: clientInvite.client_name || '',
          phone: clientInvite.client_phone || '',
          email: clientInvite.client_email || '',
          contactMethod: clientInvite.client_phone ? 'phone' : 'email',
        }));
      }
      setPhase('talking');
    } else {
      setPhase('talking');
      await start();
    }
  };

  const finish = async () => {
    stop();
    if (transcript.length === 0) {
      setPhase('welcome');
      return;
    }
    setPhase('processing');

    let intake: IntakeData;
    try {
      intake = await extractIntake(transcript);
    } catch {
      intake = fallbackIntake(transcript);
    }
    await finishIntake(intake, null, transcript);
  };

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
        raw = await deepseekChat({ systemInstruction, messages, temperature: 0.72, maxTokens: 380, timeoutMs: 30000 });
      } catch {
        const gc = messages.map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] }));
        raw = await callGeminiProxy({ model: 'gemini-2.5-flash', contents: gc, config: { systemInstruction } });
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
  }, [conversation, mayaTyping, intakeComplete, systemInstruction, firstName, clientInvite]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(userInput); }
  };

  const processConversationalIntake = async (convo: ConversationMessage[]) => {
    setPhase('processing');
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
      const built: IntakeData = {
        fullName: ext.fullName || clientInvite?.client_name || 'Prospective Client',
        contact: ext.contactMethod === 'phone' ? (ext.phone || clientInvite?.client_phone || '') : (ext.email || clientInvite?.client_email || ''),
        matterType: ext.matterType || 'General Practice',
        jurisdiction: ext.jurisdiction || '',
        summary: ext.summary || ext.description?.slice(0, 200) || '',
        incidentDate: ext.incidentDate || '',
        opposingParties: ext.opposingParty || '',
        deadlines: ext.courtDate || '',
        injuriesOrDamages: ext.injuriesOrDamages || '',
        desiredOutcome: ext.desiredOutcome || '',
        priorCounsel: ext.priorCounsel || '',
        detailedNarrative: ext.description || ext.summary || '',
      };
      
      const transcriptForSave = convo.map(m => ({ speaker: m.role === 'maya' ? 'agent' : 'user', text: m.content }));
      await finishIntake(built, null, transcriptForSave);
    } catch (err: any) {
      setSubmitError('Failed to process your conversation. Please reload and try again.');
      setPhase('result');
    }
  };

  const unifiedContact = (form: IntakeFormData): string => {
    return form.contactMethod === 'phone' ? form.phone.trim() : form.email.trim();
  };

  const handleFormSubmit = async () => {
    setPhase('processing');
    const contact = unifiedContact(formData);
    const intakeData: IntakeData = {
      fullName: formData.name,
      contact,
      matterType: formData.matterType,
      jurisdiction: formData.jurisdiction || '',
      summary: formData.description.slice(0, 200),
      incidentDate: formData.incidentDate || '',
      opposingParties: formData.opposingParty || '',
      deadlines: formData.courtDate || '',
      injuriesOrDamages: formData.injuriesOrDamages || '',
      desiredOutcome: formData.desiredOutcome || '',
      priorCounsel: formData.priorCounsel || '',
      detailedNarrative: formData.description,
    };
    await finishIntake(intakeData, null, []);
  };

  return (
    <div className="min-h-screen bg-[#020617] text-slate-100 flex flex-col">
      {/* Top bar */}
      <header className="h-16 px-6 flex items-center border-b border-slate-800/60">
        <Link to="/" className="flex items-center gap-2">
          <Scale size={22} className="text-gold-500" />
          <span className="text-lg font-serif font-bold text-white">CaseBuddy Law</span>
        </Link>
        <span className="ml-auto flex items-center gap-1.5 text-xs text-slate-500">
          <ShieldCheck size={14} className="text-green-500" /> Private &amp; confidential
        </span>
      </header>

      <main className="flex-1 flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-xl">
          {phase === 'welcome' && (
            <div className="text-center">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-gold-500/10 border border-gold-500/30 text-gold-400 text-xs font-bold uppercase tracking-wider mb-6">
                {mode === 'voice' ? <Mic size={13} /> : mode === 'chat' ? <MessageSquare size={13} /> : <FileText size={13} />}
                {mode === 'voice' ? 'Free Voice Consultation' : mode === 'chat' ? 'Free AI Consultation' : 'Secure Case Review'}
              </div>
              <h1 className="text-3xl sm:text-4xl font-serif font-bold text-white leading-tight">
                {mode === 'voice' ? "Let's talk about your case" : mode === 'chat' ? "Chat with our intake assistant" : "Describe your legal matter"}
              </h1>
              <p className="text-slate-400 mt-4 max-w-md mx-auto leading-relaxed">
                {mode === 'voice' ? (
                  <>Tap below and <span className="text-gold-400 font-semibold">Maya</span>, our intake specialist, will pick up — just like calling the office. No forms. Just talk.</>
                ) : mode === 'chat' ? (
                  <>Start a confidential text chat with <span className="text-gold-400 font-semibold">Maya</span>. She will ask a few simple questions to understand your situation.</>
                ) : (
                  <>Fill out our secure step-by-step form to tell us what happened and send details directly to our attorneys.</>
                )}
              </p>

              <div className="mt-8 grid grid-cols-3 gap-3 text-left max-w-md mx-auto">
                {[
                  { icon: HeartHandshake, label: 'No pressure', sub: 'Just a conversation' },
                  { icon: Clock, label: '~3 minutes', sub: 'Quick and direct' },
                  { icon: ShieldCheck, label: 'Confidential', sub: 'Stays private' },
                ].map(({ icon: Icon, label, sub }) => (
                  <div key={label} className="bg-slate-900/60 border border-slate-800 rounded-xl p-3 text-center">
                    <Icon size={18} className="text-gold-400 mx-auto" />
                    <p className="text-xs font-semibold text-white mt-2">{label}</p>
                    <p className="text-[10px] text-slate-500">{sub}</p>
                  </div>
                ))}
              </div>

              <button
                onClick={begin}
                className="mt-9 inline-flex items-center gap-3 px-9 py-4 rounded-full bg-green-600 hover:bg-green-500 text-white font-bold text-lg shadow-xl shadow-green-900/40 hover:scale-105 transition-all"
              >
                {mode === 'voice' ? <Phone size={22} /> : mode === 'chat' ? <MessageSquare size={22} /> : <FileText size={22} />}
                {mode === 'voice' ? 'Start my consultation' : mode === 'chat' ? 'Start chat consultation' : 'Open intake form'}
              </button>
              <p className="text-[11px] text-slate-600 mt-4">
                {mode === 'voice' ? "You'll be asked to allow your microphone so Maya can hear you." : "All data is secured and encrypted."}
              </p>
            </div>
          )}

          {phase === 'talking' && mode === 'voice' && (
            <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl">
              <div className="relative flex flex-col items-center justify-center px-6 pt-12 pb-8 bg-gradient-to-b from-slate-900 to-slate-950 min-h-[20rem]">
                <div className="relative mb-6">
                  {agentSpeaking && (
                    <>
                      <span className="absolute inset-0 rounded-full bg-violet-500/20 animate-ping opacity-40" />
                      <span className="absolute -inset-3 rounded-full border border-violet-500/40 animate-pulse" />
                    </>
                  )}
                  <div
                    className={`relative w-32 h-32 rounded-full flex items-center justify-center text-6xl border-2 bg-violet-500/10 border-violet-500/40 transition-transform duration-300 ${
                      agentSpeaking ? 'scale-110' : 'scale-100'
                    }`}
                  >
                    ⚖️
                  </div>
                  {status === 'live' && (
                    <div className={`absolute -bottom-1 -right-1 w-9 h-9 rounded-full flex items-center justify-center border-2 border-slate-900 ${agentSpeaking ? 'bg-gold-500 text-slate-950' : 'bg-slate-700 text-slate-300'}`}>
                      {agentSpeaking ? <Volume2 size={16} /> : <Mic size={16} />}
                    </div>
                  )}
                </div>

                <h2 className="text-2xl font-serif font-bold text-violet-300">Maya</h2>
                <p className="text-slate-400 text-sm mt-0.5">Intake Specialist</p>
                <p className="text-slate-500 text-sm mt-4 italic h-5">
                  {status === 'connecting'
                    ? 'Connecting you to Maya…'
                    : agentSpeaking
                    ? 'Maya is speaking…'
                    : status === 'live'
                    ? 'Listening…'
                    : ''}
                </p>

                {status === 'error' && error && (
                  <div className="mt-4 flex items-start gap-2 text-red-400 text-sm bg-red-950/40 border border-red-800/50 rounded-xl px-4 py-3 max-w-sm text-center">
                    <AlertCircle size={16} className="mt-0.5 shrink-0" />
                    <span>{error}</span>
                  </div>
                )}
              </div>

              {/* Live caption */}
              {liveCaption && (
                <div className="px-6 py-3 bg-slate-950/80 border-t border-slate-800/50 min-h-[3rem] flex items-center">
                  <p className={`text-sm leading-snug ${liveCaption.speaker === 'agent' ? 'text-violet-300' : 'text-slate-200'}`}>
                    <span className="font-semibold mr-1">{liveCaption.speaker === 'agent' ? 'Maya:' : 'You:'}</span>
                    {liveCaption.text}
                  </p>
                </div>
              )}

              {/* Scroll transcript */}
              {transcript.length > 0 && (
                <div className="max-h-48 overflow-y-auto px-6 py-3 border-t border-slate-800/50 space-y-2">
                  {transcript.map((turn, i) => (
                    <div key={i} className={`flex gap-2 text-xs ${turn.speaker === 'agent' ? 'text-violet-400' : 'text-slate-300'}`}>
                      <span className="font-semibold shrink-0">{turn.speaker === 'agent' ? 'Maya' : 'You'}:</span>
                      <span>{turn.text}</span>
                    </div>
                  ))}
                  <div ref={transcriptEndRef} />
                </div>
              )}

              {/* Controls */}
              <div className="px-6 py-5 border-t border-slate-800/50 flex items-center justify-between gap-4">
                {inputLevel > 0 && (
                  <div className="flex items-center gap-1.5">
                    {[...Array(5)].map((_, i) => (
                      <div
                        key={i}
                        className={`w-1 rounded-full transition-all duration-100 ${
                          inputLevel > i * 20 ? 'bg-green-400' : 'bg-slate-700'
                        }`}
                        style={{ height: `${8 + i * 4}px` }}
                      />
                    ))}
                  </div>
                )}
                <button
                  onClick={finish}
                  disabled={status === 'connecting'}
                  className="ml-auto flex items-center gap-2 px-5 py-2.5 rounded-full bg-red-700 hover:bg-red-600 text-white font-semibold text-sm disabled:opacity-50 transition-colors"
                >
                  <PhoneOff size={16} /> End call
                </button>
              </div>
            </div>
          )}

          {phase === 'talking' && mode === 'chat' && (
            <div className="flex flex-col bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl h-[32rem]">
              <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-800 bg-slate-900">
                <div className="w-9 h-9 rounded-full bg-violet-500/20 border border-violet-500/30 flex items-center justify-center">
                  <Bot size={17} className="text-violet-400" />
                </div>
                <div>
                  <p className="text-sm font-bold text-white">Maya · Intake Assistant</p>
                  <div className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                    <span className="text-xs text-slate-500 font-medium">Online</span>
                  </div>
                </div>
                <div className="ml-auto">
                  {intakeComplete && (
                    <span className="text-xs text-green-400 font-semibold flex items-center gap-1">
                      <CheckCircle2 size={12} /> Complete
                    </span>
                  )}
                </div>
              </div>

              <div className="flex-1 overflow-y-auto px-5 py-5 space-y-4">
                {conversation.map((msg, i) => (
                  <div key={i} className={`flex items-end gap-2 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                    {msg.role === 'maya' && (
                      <div className="w-8 h-8 rounded-full bg-violet-500/20 border border-violet-500/30 flex items-center justify-center shrink-0">
                        <Bot size={14} className="text-violet-400" />
                      </div>
                    )}
                    <div
                      className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap ${
                        msg.role === 'maya'
                          ? 'bg-slate-800 border border-slate-700/60 text-slate-200 rounded-bl-sm'
                          : 'bg-violet-600 text-white rounded-br-sm shadow-md shadow-violet-600/10'
                      }`}
                    >
                      {msg.content}
                    </div>
                  </div>
                ))}
                {mayaTyping && <TypingIndicator />}
                <div ref={transcriptEndRef} />
              </div>

              <div className="px-5 py-4 border-t border-slate-800 bg-slate-900">
                {intakeComplete ? (
                  <div className="text-center py-2 text-sm text-slate-400 flex items-center justify-center gap-2 font-medium">
                    <Loader2 size={16} className="animate-spin text-gold-400" /> Processing your intake…
                  </div>
                ) : (
                  <div className="flex items-end gap-3">
                    <textarea
                      ref={inputRef}
                      value={userInput}
                      onChange={e => setUserInput(e.target.value)}
                      onKeyDown={handleKeyDown}
                      placeholder="Type your message here… (Enter to send)"
                      disabled={mayaTyping || intakeComplete}
                      rows={2}
                      className="flex-1 bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-violet-500/50 resize-none disabled:opacity-50"
                    />
                    <button
                      onClick={() => sendMessage(userInput)}
                      disabled={!userInput.trim() || mayaTyping || intakeComplete}
                      className="w-10 h-10 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center transition-colors shrink-0 shadow-md shadow-violet-600/20"
                    >
                      <Send size={16} className="text-white" />
                    </button>
                  </div>
                )}
                <p className="text-[10px] text-slate-600 mt-2 text-center">Maya is an AI intake specialist — not a licensed attorney</p>
              </div>
            </div>
          )}

          {phase === 'talking' && mode === 'form' && (() => {
            const STEPS = ['Contact', 'Matter', 'Details', 'Urgency'];
            const setF = (k: keyof IntakeFormData) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setFormData(prev => ({ ...prev, [k]: e.target.value }));
            
            const canAdvance = () => {
              if (formStep === 1) {
                const hasName = formData.name.trim().length >= 2;
                const hasContact = formData.contactMethod === 'phone' ? formData.phone.trim().length >= 7 : formData.email.trim().includes('@');
                return hasName && hasContact;
              }
              if (formStep === 2) return !!(formData.matterType && formData.description.trim().length >= 15);
              if (formStep === 3) return true;
              if (formStep === 4) return formData.urgency !== '';
              return false;
            };

            const Inp = ({ k, placeholder, type = 'text' }: { k: keyof IntakeFormData; placeholder?: string; type?: string }) => (
              <input type={type} value={formData[k] as string} onChange={setF(k)} placeholder={placeholder} className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2.5 text-white text-sm placeholder-slate-600 focus:outline-none focus:border-violet-500/50 transition-colors" />
            );

            const Lbl = ({ label, children }: { label: string; children: React.ReactNode }) => (
              <div><label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">{label}</label>{children}</div>
            );

            return (
              <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl">
                <div className="mb-6">
                  <h1 className="text-xl font-serif font-bold text-white">Client Intake Form</h1>
                  <p className="text-xs text-slate-500 mt-1">Please provide the details below so our team can evaluate your case.</p>
                </div>

                <div className="flex items-center gap-0 mb-8 overflow-x-auto pb-2">
                  {STEPS.map((label, i) => {
                    const s = i + 1;
                    const done = s < formStep;
                    const active = s === formStep;
                    return (
                      <React.Fragment key={s}>
                        <div className="flex items-center gap-2 shrink-0">
                          <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border transition-all ${done ? 'bg-violet-500 border-violet-500 text-white' : active ? 'bg-violet-500/20 border-violet-500 text-violet-400' : 'bg-slate-800 border-slate-700 text-slate-500'}`}>{done ? <CheckCircle size={13} /> : s}</div>
                          <span className={`text-xs font-semibold ${active ? 'text-violet-300' : done ? 'text-slate-300' : 'text-slate-600'}`}>{label}</span>
                        </div>
                        {i < STEPS.length - 1 && <div className={`flex-1 min-w-[1.5rem] h-px mx-2 transition-all ${done ? 'bg-violet-500/50' : 'bg-slate-800'}`} />}
                      </React.Fragment>
                    );
                  })}
                </div>

                <div className="space-y-5">
                  {formStep === 1 && (<>
                    <Lbl label="Full Name"><Inp k="name" placeholder="First and last name" /></Lbl>
                    <Lbl label="Preferred Contact Method">
                      <div className="flex gap-3">
                        {(['phone', 'email'] as ContactMethod[]).map(m => (
                          <button key={m} type="button" onClick={() => setFormData(p => ({ ...p, contactMethod: m }))} className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border text-sm font-medium transition-all ${formData.contactMethod === m ? 'bg-violet-500/20 border-violet-500 text-violet-300' : 'border-slate-700 text-slate-400 hover:border-slate-600'}`}>
                            {m === 'phone' ? <><Phone size={14} /> Phone</> : <><Mail size={14} /> Email</>}
                          </button>
                        ))}
                      </div>
                    </Lbl>
                    {formData.contactMethod === 'phone' ? (
                      <Lbl label="Phone Number"><Inp k="phone" placeholder="(555) 555-5555" type="tel" /></Lbl>
                    ) : (
                      <Lbl label="Email Address"><Inp k="email" placeholder="client@example.com" type="email" /></Lbl>
                    )}
                  </>)}

                  {formStep === 2 && (<>
                    <Lbl label="Type of Legal Matter">
                      <select value={formData.matterType} onChange={setF('matterType')} className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2.5 text-white text-sm focus:outline-none focus:border-violet-500/50">
                        <option value="">Select matter type…</option>
                        {MATTER_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </Lbl>
                    <Lbl label="Describe what happened"><textarea value={formData.description} onChange={setF('description')} rows={5} placeholder="Give a detailed narrative of your situation. Include dates, who is involved, and what happened…" className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2.5 text-white text-sm placeholder-slate-600 focus:outline-none focus:border-violet-500/50 resize-none" /></Lbl>
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
                    <Lbl label="How soon do you need assistance?">
                      <div className="space-y-3 mt-1">
                        {[
                          { value: 'immediately', label: 'Immediately', desc: 'Today — urgent deadline or emergency' },
                          { value: 'days', label: 'Within a few days', desc: 'Pressing, but not today' },
                          { value: 'weeks', label: 'Within a few weeks', desc: 'Planning ahead' }
                        ].map(opt => (
                          <button key={opt.value} type="button" onClick={() => setFormData(p => ({ ...p, urgency: opt.value as any }))} className={`w-full flex items-center gap-4 p-4 rounded-xl border text-left transition-all ${formData.urgency === opt.value ? 'border-violet-500 bg-violet-500/10' : 'border-slate-800 bg-slate-850 hover:border-slate-700'}`}>
                            <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${formData.urgency === opt.value ? 'border-violet-500 bg-violet-500' : 'border-slate-700'}`}>
                              {formData.urgency === opt.value && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                            </div>
                            <div>
                              <p className={`text-sm font-semibold ${formData.urgency === opt.value ? 'text-violet-300' : 'text-slate-200'}`}>{opt.label}</p>
                              <p className="text-xs text-slate-500 mt-0.5">{opt.desc}</p>
                            </div>
                          </button>
                        ))}
                      </div>
                    </Lbl>
                  )}
                </div>

                <div className="flex gap-3 mt-8">
                  {formStep > 1 && (
                    <button type="button" onClick={() => setFormStep(s => s - 1)} className="px-5 py-2.5 rounded-xl border border-slate-700 text-slate-400 hover:text-slate-200 hover:bg-slate-800 text-xs font-semibold transition-colors">
                      Back
                    </button>
                  )}
                  <button type="button" onClick={() => formStep < 4 ? setFormStep(s => s + 1) : handleFormSubmit()} disabled={!canAdvance()} className="flex-1 flex items-center justify-center gap-2 bg-violet-600 hover:bg-violet-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold px-6 py-2.5 rounded-xl transition-colors text-xs">
                    {formStep < 4 ? <>Continue <ChevronRight size={14} /></> : <>Submit Intake <CheckCircle size={14} /></>}
                  </button>
                </div>
              </div>
            );
          })()}

          {phase === 'processing' && (
            <div className="text-center py-24">
              <Loader2 size={40} className="animate-spin text-gold-400 mx-auto mb-4" />
              <p className="text-slate-300 font-medium">Reviewing your intake…</p>
              <p className="text-slate-500 text-sm mt-1">This takes just a moment.</p>
            </div>
          )}

          {phase === 'result' && (
            <div className="text-center">
              {submitError ? (
                <div className="bg-red-950/40 border border-red-700/50 rounded-2xl p-8">
                  <AlertCircle size={36} className="text-red-400 mx-auto mb-4" />
                  <p className="text-white font-semibold">Something went wrong</p>
                  <p className="text-slate-400 text-sm mt-2">{submitError}</p>
                </div>
              ) : (
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8">
                  <CheckCircle2 size={44} className="text-green-400 mx-auto mb-4" />
                  <h2 className="text-2xl font-serif font-bold text-white">You're all set</h2>
                  <p className="text-slate-400 mt-3 max-w-sm mx-auto leading-relaxed">
                    We've captured everything. A member of the team will review your situation and reach out shortly.
                  </p>
                  {result && (
                    <div className="mt-6 inline-flex items-center gap-2 px-4 py-2 rounded-full bg-gold-500/10 border border-gold-500/30 text-gold-400 text-sm font-semibold">
                      Case priority: {result.urgency ?? 'Standard'}
                    </div>
                  )}
                </div>
              )}
              {/* Document Upload CTA */}
              {docRequest && (
                <div className="mt-4 bg-blue-500/10 border border-blue-500/30 rounded-xl p-4">
                  <div className="flex items-start gap-3">
                    <Upload size={18} className="text-blue-400 mt-0.5 shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-blue-300">
                        {storedLang === 'es' ? 'Subir Documentos' : 'Upload Documents'}
                      </p>
                      <p className="text-xs text-slate-400 mt-1">
                        {storedLang === 'es'
                          ? 'Use este enlace para subir fotos, informes policiales, registros médicos o cualquier documento relacionado con su caso.'
                          : 'Use this link to upload photos, police reports, medical records, or any documents related to your case.'
                        }
                      </p>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(docRequest.uploadUrl);
                          toast.success(storedLang === 'es' ? 'Enlace copiado' : 'Link copied');
                        }}
                        className="mt-2 flex items-center gap-1.5 text-xs bg-blue-500/20 border border-blue-500/40 text-blue-300 px-3 py-1.5 rounded-lg hover:bg-blue-500/30 transition-all"
                      >
                        <Copy size={12} />
                        {storedLang === 'es' ? 'Copiar Enlace' : 'Copy Upload Link'}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default PublicIntake;
