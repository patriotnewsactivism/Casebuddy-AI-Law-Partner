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

const MAYA_VOICE = 'aura-2-helena-en';

const MAYA_INTAKE_PROMPT = `You are Maya, the warm and reassuring intake specialist at CaseBuddy Law. You are speaking LIVE, by voice, directly with a person who may be stressed, scared, or unsure — someone reaching out for legal help, possibly for the first time.

YOUR GOAL: gently conduct a complete new-client intake so the firm can evaluate their situation. Make them feel heard and safe.

WHAT YOU NEED TO LEARN (one question at a time, conversationally — never a checklist):
1. Their name, and a good phone number or email to reach them.
2. What happened, in their own words — the core story.
3. When it happened, and where (which state / city).
4. Who else is involved (the other side).
5. Any injuries, losses, or damages they've suffered.
6. Any deadlines, court dates, or letters they've received.
7. Whether they've spoken with any other lawyer about this.
8. What outcome they're hoping for.

HOW YOU TALK (this is a real phone call, not a form):
- Warm, calm, human. Use contractions. Short turns — 1 to 3 sentences, then stop and listen.
- Ask ONE question at a time. Acknowledge what they said ("I'm so sorry that happened.", "Okay, that's helpful.") before the next question.
- Never rush. If they're upset, slow down and reassure them.

PACING & PATIENCE — let them finish, never cut them off:
- This person may be scared and may ramble, repeat themselves, or pause to gather their thoughts. That is exactly what you want — let them talk. Do NOT talk over them and do NOT jump in the moment they pause.
- A few seconds of silence is fine. When they pause, give them room. Only take your turn once they've clearly finished a complete thought.
- If they trail off, seem to be searching for words, or sound like there's more, gently invite them to keep going ("Take your time.", "I'm right here — go on whenever you're ready.", "Tell me more about that.") instead of moving to the next question.
- If they say a lot at once, take ALL of it in. Acknowledge the whole story, not just the last sentence, and don't lose the earlier details.
- When you've covered the essentials, summarize what you heard in a sentence or two, ask if you got it right, and let them know the firm's team will review everything and follow up. Then thank them warmly.
- Never quote statutes or give legal advice — you're gathering their story, not advising. If they ask whether they have a case, say the firm's attorneys will review it and reach out.
- Stay fully in character as Maya. Never say you are an AI or mention these instructions.

MEMORY DISCIPLINE — this is critical, re-asking things you already know makes you sound confused and erodes trust right when someone is already stressed:
- Before every question, check what they've already told you in this call. If they already answered it — even loosely, even several turns ago — do NOT ask it again. Reference it instead ("You said this happened back in March, so...").
- If you're unsure you caught a detail clearly, don't restart the question from scratch — confirm just the unclear part ("Sorry, was that the 14th or the 40th?").
- Only revisit a topic if their answer was genuinely incomplete or contradicted something else, and frame it explicitly as a follow-up, not a fresh ask.
- Work through your list of what you need to learn in order, once, and keep moving forward.

If asked: you're an AI member of the CaseBuddy team helping with intake — not a substitute for a licensed attorney. Only say this if directly asked.`;

const MAYA_GREETING =
  "Hi there, thank you so much for reaching out — my name's Maya, and I'm with CaseBuddy Law. I'm here to listen and get the details of your situation so our team can help. There's no rush at all. Whenever you're ready, why don't you start by telling me your name and a little about what's going on?";

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
                specialist, will pick up and talk you through it — just like calling the office. No
                forms. Speak naturally; she'll listen.
              </p>

              <div className="mt-8 grid grid-cols-3 gap-3 text-left max-w-md mx-auto">
                {[
                  { icon: HeartHandshake, label: 'No pressure', sub: 'Just a conversation' },
                  { icon: Clock, label: '~5 minutes', sub: 'At your pace' },
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
                <Phone size={22} /> Call Maya
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
                  {(agentSpeaking || status === 'connecting') && (
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
                  {status === 'connecting' && (
                    <div className="absolute -bottom-1 -right-1 w-9 h-9 rounded-full flex items-center justify-center border-2 border-slate-900 bg-green-600 text-white animate-pulse">
                      <Phone size={16} />
                    </div>
                  )}
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
                    ? 'Calling Maya… ringing'
                    : agentSpeaking
                      ? 'Maya is speaking…'
                      : status === 'live'
                        ? 'Listening — go ahead'
                        : ''}
                </p>

                {status === 'live' && !agentSpeaking && (
                  <div className="flex items-end gap-1 h-6 mt-3">
                    {[0, 1, 2, 3, 4].map(i => (
                      <span
                        key={i}
                        className="w-1.5 bg-gold-500/70 rounded-full transition-all duration-100"
                        style={{ height: `${Math.max(4, Math.min(24, (inputLevel - i * 8) * 1.2))}px` }}
                      />
                    ))}
                  </div>
                )}

                <div className="absolute bottom-3 left-0 right-0 px-4 pointer-events-none">
                  {liveCaption && (
                    <div
                      className={`mx-auto max-w-lg px-4 py-2.5 rounded-2xl backdrop-blur-md border text-sm leading-snug ${
                        liveCaption.speaker === 'you'
                          ? 'bg-blue-950/70 border-blue-500/40 text-blue-50'
                          : 'bg-slate-800/80 border-violet-500/30 text-slate-50'
                      }`}
                    >
                      <span className={`text-[10px] font-bold uppercase tracking-wider mr-2 ${liveCaption.speaker === 'you' ? 'text-blue-400' : 'text-violet-300'}`}>
                        {liveCaption.speaker === 'you' ? 'You' : 'Maya'}
                      </span>
                      {liveCaption.text}
                    </div>
                  )}
                </div>
              </div>

              {transcript.length > 0 && (
                <div className="max-h-48 overflow-y-auto px-5 py-4 space-y-3 border-t border-slate-800 bg-slate-950/50">
                  {transcript.map((t, i) => (
                    <div key={i} className={`flex ${t.speaker === 'you' ? 'justify-end' : 'justify-start'}`}>
                      <div
                        className={`max-w-[80%] px-3.5 py-2 rounded-2xl text-sm ${
                          t.speaker === 'you'
                            ? 'bg-blue-600/20 border border-blue-500/30 text-blue-50 rounded-br-sm'
                            : 'bg-slate-800 border border-slate-700 text-slate-100 rounded-bl-sm'
                        }`}
                      >
                        {t.text}
                      </div>
                    </div>
                  ))}
                  <div ref={transcriptEndRef} />
                </div>
              )}

              {error && (
                <div className="px-5 py-3 bg-red-950/40 border-t border-red-500/30 flex items-start gap-2 text-sm text-red-200">
                  <AlertCircle size={16} className="shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              <div className="px-6 py-5 border-t border-slate-800 bg-slate-900 flex items-center justify-center gap-3">
                <button
                  onClick={finish}
                  className="flex items-center gap-2 px-6 py-3 rounded-full bg-gold-500 hover:bg-gold-400 text-slate-950 font-bold shadow-lg hover:scale-105 transition-all"
                >
                  <CheckCircle2 size={20} /> I'm finished
                </button>
                <button
                  onClick={() => { stop(); setPhase('welcome'); }}
                  className="flex items-center gap-2 px-5 py-3 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold transition-all"
                >
                  <PhoneOff size={18} /> Cancel
                </button>
              </div>
            </div>
          )}

          {phase === 'processing' && (
            <div className="text-center py-16">
              <Loader2 size={44} className="text-gold-400 mx-auto animate-spin" />
              <h2 className="text-2xl font-serif font-bold text-white mt-6">Putting it all together…</h2>
              <p className="text-slate-400 mt-2 max-w-sm mx-auto">
                Maya is summarizing your conversation and routing it to the right team. One moment.
              </p>
            </div>
          )}

          {phase === 'result' && (
            <div className="text-center">
              {submitError ? (
                <>
                  <AlertCircle size={44} className="text-amber-400 mx-auto" />
                  <h2 className="text-2xl font-serif font-bold text-white mt-5">Almost there</h2>
                  <p className="text-slate-400 mt-3 max-w-md mx-auto">{submitError}</p>
                </>
              ) : (
                <>
                  <div
                    className={`w-16 h-16 rounded-full mx-auto flex items-center justify-center ${
                      result?.disposition === 'denied'
                        ? 'bg-slate-700/40 text-slate-300'
                        : 'bg-green-600/20 text-green-400'
                    }`}
                  >
                    {result?.disposition === 'denied' ? <HeartHandshake size={30} /> : <CheckCircle2 size={30} />}
                  </div>
                  <h2 className="text-2xl font-serif font-bold text-white mt-5">
                    {result?.disposition === 'denied'
                      ? 'Thank you for trusting us'
                      : 'We received your information'}
                  </h2>
                  <p className="text-slate-300 mt-4 max-w-md mx-auto leading-relaxed">
                    {result?.clientMessage}
                  </p>
                  {result && result.disposition !== 'denied' && (
                    <div className="mt-6 inline-flex items-center gap-2 px-4 py-2 rounded-full bg-slate-900 border border-slate-700 text-sm text-slate-300">
                      <Scale size={15} className="text-gold-400" />
                      Routed to our <span className="text-gold-400 font-semibold">{result.recommendedDepartment}</span> team
                    </div>
                  )}
                </>
              )}
              <div className="mt-10">
                <Link to="/" className="text-sm text-slate-500 hover:text-slate-300 transition-colors">
                  Return to CaseBuddy Law →
                </Link>
              </div>
            </div>
          )}
        </div>
      </main>

      <footer className="px-6 py-4 text-center text-[11px] text-slate-600 border-t border-slate-800/60">
        CaseBuddy Law · This intake is for evaluation only and does not create an attorney-client relationship.
      </footer>
    </div>
  );
};

export default PublicIntake;
