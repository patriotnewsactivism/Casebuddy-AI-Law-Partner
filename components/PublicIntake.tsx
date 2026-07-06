import React, { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Phone, PhoneOff, Scale, Mic, Volume2, ShieldCheck, CheckCircle2, Clock, HeartHandshake, AlertCircle, Loader2, Copy, Upload } from 'lucide-react';
import { useDeepgramVoiceAgent } from '../hooks/useDeepgramVoiceAgent';
import { extractIntake, scoreIntake } from '../services/intakeService';
import { submitIntake } from '../services/intakeStore';
import { resolveClientToken, markInviteCompleted, ResolvedClientInvite } from '../services/clientInviteStore';
import { emailIntakeHandoff } from '../services/firmComms';
import { IntakeData, IntakeScore } from '../types';
import { toast } from 'react-toastify';
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
const MAYA_VOICE = 'aura-asteria-en';

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

type Phase = 'welcome' | 'talking' | 'processing' | 'result';

const PublicIntake: React.FC = () => {
  const { token } = useParams<{ token?: string }>();
  const [firmId, setFirmId] = React.useState<string | null>(null);

  const [clientInvite, setClientInvite] = React.useState<ResolvedClientInvite | null>(null);

  // Resolve the client invite token on mount — gets firm_id + client context for Maya
  React.useEffect(() => {
    if (token) {
      resolveClientToken(token).then(invite => {
        if (invite) {
          setFirmId(invite.firm_id);
          setClientInvite(invite);
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

  // When a client token resolves, inject client context so Maya greets by name
  // and skips re-asking for info the attorney already captured
  const firstName = clientInvite?.client_name?.split(' ')[0] ?? '';

  // Get Maya's language profile (defaults to English, switches if Spanish detected)
  const storedLang = (localStorage.getItem('casebuddy_maya_language') || 'en') as SupportedLanguage;
  const mayaProfile = getMayaLanguageProfile(storedLang);

  // Build system instruction with language-aware Maya prompt
  const basePrompt = mayaProfile.systemPrompt || MAYA_INTAKE_PROMPT;

  const systemInstruction = clientInvite?.client_name
    ? `${basePrompt}

IMPORTANT — you already know who you are speaking with:
Client name: ${clientInvite.client_name}${clientInvite.client_phone ? `
Phone on file: ${clientInvite.client_phone}` : ''}${clientInvite.client_email ? `
Email on file: ${clientInvite.client_email}` : ''}${clientInvite.notes ? `
Attorney notes: ${clientInvite.notes}` : ''}

Open with: "Hi ${firstName}, thanks for calling in — " and use their name naturally. You already have their contact info so skip asking for it unless they want to update it.`
    : basePrompt;

  const voice = useDeepgramVoiceAgent({
    voiceModel: MAYA_VOICE,
    agentId: 'maya',
    useElevenLabs: true,
    systemInstruction,
    greeting: mayaProfile.greeting,
    publicEndpoint: true,
  });
  const { status, error, liveCaption, transcript, inputLevel, agentSpeaking, start, stop } = voice;

  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [transcript, liveCaption]);

  // Detect language from the first few exchanges
  useEffect(() => {
    if (transcript.length >= 3 && transcript.length <= 5) {
      const text = transcript.map(t => t.text).join(' ');
      detectAndSwitchLanguage(text).catch(() => {});
    }
  }, [transcript.length]);

  const begin = async () => {
    setSubmitError(null);
    setPhase('talking');
    await start();
  };

  const finish = async () => {
    stop();
    if (transcript.length === 0) {
      setPhase('welcome');
      return;
    }
    setPhase('processing');

    // A prospect just told us their whole story — never lose the lead to a
    // transient AI hiccup. Extract and score best-effort, but always persist
    // what we have (at minimum the full transcript) and give the caller a warm,
    // human close. If the AI steps failed, the case is routed for manual review.
    let intake: IntakeData;
    try {
      intake = await extractIntake(transcript);
    } catch {
      intake = fallbackIntake(transcript);
    }

    let score: IntakeScore;
    try {
      score = await scoreIntake(intake);
    } catch {
      score = fallbackScore();
    }

    let intakeId: string | undefined;
    try {
      const result = await submitIntake({
        firmId:         firmId ?? undefined,
        clientInviteId: clientInvite?.invite_id,
        intake,
        score,
        transcript,
      });
      intakeId = result?.id;
      // Mark the invite as completed so attorney can track it
      if (clientInvite?.invite_id && result?.id) {
        void markInviteCompleted(clientInvite.invite_id, result.id);
      }
    } catch (saveErr: any) {
      // submitIntake already falls back to localStorage on Supabase errors, so
      // reaching here is rare — but log what happened for debugging.
      console.error('[PublicIntake] submitIntake failed:', saveErr?.message);
    }
    // Hand the case off to the routed specialist by email (best-effort — never
    // blocks the prospect's confirmation screen).
    void emailIntakeHandoff(intake, score);
    setResult(score);
    // Generate document upload request for this intake
    if (intakeId) {
      const docReq = generateDocumentRequestLink(intakeId);
      setDocRequest(docReq);
    }
    setPhase('result');
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
                <Mic size={13} /> Free Voice Consultation
              </div>
              <h1 className="text-3xl sm:text-4xl font-serif font-bold text-white leading-tight">
                Let's talk about your case
              </h1>
              <p className="text-slate-400 mt-4 max-w-md mx-auto leading-relaxed">
                Tap below and <span className="text-gold-400 font-semibold">Maya</span>, our intake
                specialist, will pick up — just like calling the office. No forms. Just talk.
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
                <Phone size={22} /> Start my consultation
              </button>
              <p className="text-[11px] text-slate-600 mt-4">
                You'll be asked to allow your microphone so Maya can hear you.
              </p>
            </div>
          )}

          {phase === 'talking' && (
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
