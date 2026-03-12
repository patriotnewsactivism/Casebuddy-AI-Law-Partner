# Voice Features Guide

LexSim's Trial Simulator provides industry-leading voice recognition and 2-way audio for immersive legal training.

## What Makes Our Audio Special?

### 🎤 Real-Time Voice Recognition
- **Instant transcription** - Your words appear as you speak
- **Legal terminology** - Trained on courtroom language
- **Natural flow** - Speak conversationally, no commands needed
- **Interrupt handling** - AI can object mid-sentence (like a real trial!)

### 🔊 AI Voice Response
- **Natural speech** - Not robotic text-to-speech
- **Emotional range** - Aggressive, defensive, or cooperative tones
- **Character voices** - Different personas for judges, witnesses, opposing counsel
- **Procedural accuracy** - Says "Objection!" with proper grounds

### 🧠 Live Coaching System
- **Real-time feedback** - Critique appears as you speak
- **Fallacy detection** - Identifies logical errors instantly
- **Rhetorical analysis** - Scores persuasiveness
- **Teleprompter scripts** - Suggested responses to read

## How It Works (Technical Overview)

```
┌─────────────────────────────────────────────────────────────┐
│                    YOUR VOICE                                │
│                       ↓                                      │
│              Microphone (16kHz PCM)                          │
│                       ↓                                      │
│            Browser Audio Processing                          │
│                       ↓                                      │
│           Gemini Live API (WebSocket)                        │
│                       ↓                                      │
│         ┌─────────────┴─────────────┐                       │
│         ↓                           ↓                        │
│   Transcription              AI Processing                   │
│   (Speech-to-Text)           (Context + Personality)         │
│         ↓                           ↓                        │
│   Display in UI              Generate Response               │
│                                     ↓                        │
│                            ┌────────┴────────┐              │
│                            ↓                 ↓               │
│                       Audio (PCM)      Text (Transcript)     │
│                            ↓                 ↓               │
│                       Speakers          Display in UI        │
│                            ↓                                 │
│                       YOUR EARS                              │
└─────────────────────────────────────────────────────────────┘
```

### Audio Pipeline Details

1. **Capture**: ScriptProcessor captures 4096-sample chunks at 16kHz
2. **Encode**: Convert Float32Array to 16-bit PCM, then base64
3. **Stream**: Send to Gemini via WebSocket
4. **Process**: AI analyzes speech, context, and generates response
5. **Decode**: Receive base64 PCM audio (24kHz)
6. **Play**: Convert to AudioBuffer and queue for playback
7. **Sync**: Maintain timing to prevent audio gaps

## Trial Phase Behaviors

Each trial phase has unique AI behavior programmed via system instructions:

### Pre-Trial Motions
**You:** Attorney arguing motion
**AI:** Judge + Opposing Counsel
- Judge asks clarifying questions
- Opposing counsel counters your arguments
- Legal citations expected

### Voir Dire (Jury Selection)
**You:** Attorney questioning jurors
**AI:** Multiple juror personas + Opposing Counsel
- Objections for: pre-conditioning jury, asking for commitments
- Jurors give varied responses based on demographics
- Opposing counsel challenges improper questions

### Opening Statement
**You:** Attorney giving opening
**AI:** Judge + Opposing Counsel
- Objections for: arguing (not just stating facts), vouching for credibility
- Judge sustains/overrules
- Must establish narrative without argument

### Direct Examination
**You:** Attorney questioning own witness
**AI:** Your witness (cooperative) + Opposing Counsel
- **CRITICAL**: NO LEADING QUESTIONS allowed
  - ❌ "You saw the car, didn't you?"
  - ✅ "What did you see?"
- Objections for: leading, hearsay, speculation, compound questions
- Witness provides helpful details when asked properly

### Cross Examination
**You:** Attorney questioning hostile witness
**AI:** Hostile witness + Opposing Counsel
- Witness is evasive and defensive
- Leading questions ARE allowed here
- Objections for: badgering, argumentative, asked and answered
- Pin witness down with facts

### Defendant Testimony
**You:** Defendant on the stand
**AI:** Prosecutor (aggressive)
- You're being cross-examined
- Prosecutor tries to catch you in lies
- Impeachment with prior statements
- High-pressure scenario

### Closing Argument
**You:** Attorney giving closing
**AI:** Judge + Opposing Counsel
- Objections for: misstating evidence/law, golden rule argument
- Synthesize all evidence
- Persuasive storytelling allowed

### Sentencing Hearing
**You:** Attorney arguing sentence
**AI:** Judge
- Present mitigation or aggravation factors
- Judge weighs arguments
- Delivers sentence at end

## Difficulty Modes

### 🎓 Learn Mode (Easy)
**Best for:** First-time users, learning courtroom procedure

**AI Behavior:**
- Rarely interrupts
- Provides full scripts in teleprompter
- Explains concepts before challenging you
- Gentle corrections

**Use when:**
- Learning a new trial phase
- Practicing foundational skills
- Building confidence

### 🎯 Practice Mode (Medium)
**Best for:** Intermediate practitioners

**AI Behavior:**
- Objects when you make clear errors
- Provides tips after objections
- Balanced feedback
- Realistic but forgiving

**Use when:**
- Refining technique
- Preparing for specific scenarios
- Testing new strategies

### ⚔️ Trial Mode (Hard)
**Best for:** Experienced attorneys, exam prep

**AI Behavior:**
- Aggressive and interrupts immediately
- Objects to everything remotely objectionable
- No hints or guidance
- Realistic adversarial environment

**Use when:**
- Final trial prep
- Bar exam practice
- Building resilience under pressure

## Voice Commands & Natural Language

You don't need special commands - just speak naturally!

### What You Can Say

**Starting:**
- "Your Honor, may I proceed?"
- "I'd like to call my next witness."
- "May I approach the bench?"

**Questioning:**
- Ask questions naturally (mind leading vs. non-leading!)
- "What happened next?"
- "Where were you at 9 PM?"
- "Isn't it true that you were there?" (leading - only OK on cross)

**Objecting:**
- "Objection, hearsay!"
- "Objection, Your Honor. Counsel is leading the witness."
- "I object on the grounds of relevance."

**Responding to Objections:**
- "I'll rephrase."
- "I withdraw the question."
- "Your Honor, this goes to credibility."
- "Foundation will be established."

**Arguing Motions:**
- "Your Honor, we move to suppress..."
- "The evidence was obtained in violation of..."
- "Case law supports our position in Smith v. Jones..."

### What the AI Understands

The AI has been trained on:
- Legal terminology and Latin phrases
- Federal Rules of Evidence
- Courtroom protocol
- Trial procedure
- Rhetorical devices
- Logical fallacies

It can detect:
- Leading vs. non-leading questions
- Hearsay and its exceptions
- Speculation and opinion
- Relevance issues
- Prejudicial vs. probative balance
- Improper character evidence

## Objection System

### How Objections Work

When the AI objects:
1. **Audio**: You hear "OBJECTION! [Grounds]"
2. **Visual**: Red overlay flashes on screen
3. **Transcript**: Objection appears in messages
4. **Your response**: You must address it

### Common Objections You'll Face

| Objection | Meaning | How to Cure |
|-----------|---------|-------------|
| **Leading** | Question suggests answer (improper on direct) | Rephrase as open-ended |
| **Hearsay** | Out-of-court statement for truth | Show exception or different purpose |
| **Speculation** | Witness guessing | Ask what they directly observed |
| **Relevance** | Not related to case issues | Explain connection |
| **Asked and Answered** | Repetitive questioning | Move on |
| **Badgering** | Harassing witness | Tone down aggression |
| **Compound** | Two questions in one | Split into separate questions |
| **Argumentative** | Arguing with witness | Ask questions, don't argue |
| **Assumes facts not in evidence** | Assumes unproven facts | Establish foundation first |
| **Calls for narrative** | Too broad, witness rambles | Ask specific questions |

### Objection Strategies

**When you should object:**
- Trial mode: Object frequently to practice
- Learn mode: Let some slide to keep flow

**Objection phrases:**
- "Objection, hearsay, Your Honor."
- "Objection. Counsel is leading."
- "I object on relevance grounds."

## Coaching & Feedback System

### Real-Time Coaching Panel

Located on the right side during sessions:

**Critique** - What you did wrong
- "Your question was leading on direct examination."
- "You failed to establish foundation."

**Next Step** - What to do now
- "Rephrase as an open-ended question."
- "First ask where they were standing."

**Sample Response** - Example of good phrasing
- "What did you observe at that time?"

**Fallacies** - Logical errors detected
- Ad Hominem (attacking person, not argument)
- Straw Man (misrepresenting opponent's position)
- False Equivalence
- Circular reasoning

**Rhetorical Effectiveness** - Score 0-100
- Measures persuasiveness, tone, structure

### Teleprompter Scripts

In **Learn mode**, the AI generates full scripts:

```
SUGGESTED QUESTIONS FOR DIRECT EXAMINATION:
1. "Please state your name for the record."
2. "Where were you on the evening of March 15th?"
3. "What time did you arrive at the location?"
4. "Can you describe what you saw when you entered?"
5. "What happened next?"
```

Use these as a guide or read them verbatim for practice.

## Performance Optimization

### For Best Results:

**Hardware:**
- External microphone (Blue Yeti, Rode, etc.) > Built-in laptop mic
- Headphones (prevents echo) > Speakers
- Wired internet > WiFi

**Environment:**
- Quiet room (library, office) > Coffee shop
- Close windows and doors
- Turn off fans and AC

**Technique:**
- Speak clearly and at normal pace
- Pause briefly between questions (let AI respond)
- Don't overlap with AI speech
- Complete sentences (not fragments)

**Browser:**
- Chrome or Edge (best support)
- Keep tab active (not minimized)
- Close other tabs using audio
- Disable browser extensions that affect audio

## Troubleshooting Quick Reference

| Problem | Quick Fix |
|---------|-----------|
| Mic not working | Check permissions: `chrome://settings/content/microphone` |
| Can't hear AI | Unmute tab, check system volume, try headphones |
| AI doesn't respond | Speak louder, check internet, verify API key |
| Laggy responses | Close other apps, use wired connection |
| Session disconnects | Keep tab active, check API quota |
| "Permission denied" | Allow mic in browser AND system settings |
| Echo/feedback | Use headphones instead of speakers |
| Background noise interfering | Use push-to-talk apps or noise-cancelling mic |

See [AUDIO_TESTING.md](AUDIO_TESTING.md) for detailed troubleshooting.

## API Cost Awareness

**Live audio is expensive!** Here's why:

- Continuous audio streaming (16kHz = ~128 kbps)
- Real-time transcription (bidirectional)
- Audio synthesis (24kHz output)
- Long context windows (full conversation history)
- Function calling (objections, coaching)

**Cost saving tips:**
- Keep sessions under 10 minutes
- Use Practice/Trial mode (less coaching = fewer tokens)
- Don't leave sessions running idle
- Monitor usage: https://aistudio.google.com/

**Estimated costs** (varies by usage):
- 5-minute session: ~$0.50-$1.00
- 30-minute session: ~$3.00-$6.00

Always monitor your API quota and set billing alerts.

## Future Enhancements (Roadmap)

Planned features:
- [ ] Multiple voice options (different judges, attorneys)
- [ ] Regional accents (Southern, New York, etc.)
- [ ] Emotion detection (detect nervousness, confidence)
- [ ] Background courtroom ambiance (murmurs, gavel sounds)
- [ ] Recording and playback of sessions
- [ ] Transcription export (PDF, DOCX)
- [ ] Multi-party simulations (3+ people)
- [ ] Custom jury instructions
- [ ] Real case law integration
- [ ] Performance analytics (word choice, pacing, filler words)

---

**Ready to start?** Head to **Trial Simulator** and select your first phase!

For technical details, see [AUDIO_TESTING.md](AUDIO_TESTING.md)
