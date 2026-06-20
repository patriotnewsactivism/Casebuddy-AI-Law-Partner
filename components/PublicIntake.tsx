import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Phone, PhoneOff, Scale, Mic, Volume2, ShieldCheck, CheckCircle2, Clock, HeartHandshake, AlertCircle, Loader2 } from 'lucide-react';
import { useDeepgramVoiceAgent } from '../hooks/useDeepgramVoiceAgent';
import { extractIntake, scoreIntake } from '../services/intakeService';
import { submitIntake } from '../services/intakeStore';
import { emailIntakeHandoff } from '../services/firmComms';
import { IntakeScore } from '../types';

// Public, link-shareable voice intake. A prospect opens the link, Maya picks up
// in her own voice, greets them, and conducts the intake. On finish we distill
// the conversation, score it, route it, and persist it for the firm — then show
// the prospect a warm, human outcome.

// Maya's voice — Thalia is Deepgram's warmest, most natural-sounding American female.
const MAYA_VOICE = 'aura-2-thalia-en';

const MAYA_INTAKE_PROMPT = `You are Maya, the intake specialist at CaseBuddy. Warm, quick, and sharp.

YOUR GOAL: learn these four things, then wrap up:
1. What happened (let them say it once — never re-ask)
2. When it happened
3. Who's involved (them + the other party)
4. What they want (advice, representation, or referral?)

PACING — efficient, but NEVER cut them off:
- Let them finish completely before you respond. If they pause to think, wait — silence is fine. Only take your turn once they've clearly finished a thought.
- If they're mid-story or on a roll, stay quiet and let them keep going. A scared or upset person may ramble — that's good, let them. Capture all of it; don't rush them to the next question.
- Once a point is genuinely answered, move on — don't pad or re-ask. But "move on" means after they're done talking, not over them.
- Once you have all four points, give a warm 1-sentence wrap-up and tell them the team will be in touch. No hard time limit — let their story take the time it needs.

VOICE STYLE — sound human, not scripted:
- Short sentences. Contractions. Real phrases: "Got it", "Okay and—", "Makes sense."
- Never say "I understand your frustration" or "Thank you for sharing that" — robotic.
- If they're upset: "I hear you." Then move forward with care.
- NEVER say "Certainly!", "Absolutely!", "Of course!" — ever.
- No legal advice. If they ask about their case: "Our attorneys will review everything and reach out."

CRITICAL — NO LOOPING:
- Track what they've already told you. Never re-ask anything.
- If they covered multiple items at once, move forward — don't retrace.
- You do NOT need every detail. Name + what happened + basic context = enough to wrap up.

If directly asked: you're an AI intake specialist at CaseBuddy — not a licensed attorney.`;

// Short, punchy greeting — gets Maya talking fast without a long intro
const MAYA_GREETING = "Hey — Maya at CaseBuddy. What's going on?";

type Phase = 'welcome' | 'talking' | 'processing' | 'result';

const PublicIntake: React.FC = () => {
  const [phase, setPhase] = useState<Phase>('welcome');
  const [result, setResult] = useState<IntakeScore | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const transcriptEndRef = useRef<HTMLDivElement>(null);

  const voice = useDeepgramVoiceAgent({
    voiceModel: MAYA_VOICE,
    systemInstruction: MAYA_INTAKE_PROMPT,
    greeting: MAYA_GREETING,
    publicEndpoint: true,
  });
  const { status, error, liveCaption, transcript, inputLevel, agentSpeaking, start, stop } = voice;

  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [transcript, liveCaption]);

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
    try {
      const intake = await extractIntake(transcript);
      const score = await scoreIntake(intake);
      await submitIntake({ intake, score, transcript });
      // Hand the case off to the routed specialist by email (best-effort — never
      // blocks the prospect's confirmation screen).
      void emailIntakeHandoff(intake, score);
      setResult(score);
      setPhase('result');
    } catch (e) {
      setSubmitError(
        'We captured your information but hit a snag finishing up. Please try submitting again, or call the office directly.'
      );
      setPhase('result');
    }
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
                      Case priority: {result.priority ?? 'Standard'}
                    </div>
                  )}
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
