# Audio Testing Guide - Trial Simulator

This guide helps you test and verify the 2-way audio and voice recognition features in the Trial Simulator.

## How the Audio System Works

### Voice Recognition (Speech-to-Text)
Your spoken words are captured by your microphone and sent to Google's Gemini Live API, which:
1. Transcribes your speech in real-time
2. Displays your words in the transcript
3. Triggers the AI to respond

### 2-Way Audio (Text-to-Speech)
The AI responds with:
1. **Audio**: Natural voice output through your speakers
2. **Transcription**: Text version of what the AI said
3. **Visual feedback**: Avatar animation when speaking

### Real-Time Features
- **Instant objections**: AI can interrupt you with procedural objections
- **Live coaching**: Feedback appears while you speak
- **Fallacy detection**: Identifies logical errors in arguments
- **Voice analysis**: Monitors volume and pacing

## Pre-Test Checklist

### 1. Hardware Requirements
- [ ] Working microphone (built-in or external)
- [ ] Speakers or headphones
- [ ] Stable internet connection (audio streaming requires good bandwidth)

### 2. Browser Requirements
- [ ] **Chrome 90+** (Recommended)
- [ ] **Edge 90+** (Recommended)
- [ ] **Safari 14+** (macOS/iOS)
- [ ] Firefox is NOT recommended (limited Web Audio API support)

### 3. Environment Setup
- [ ] Quiet environment (reduces background noise)
- [ ] Close other apps using the microphone (Zoom, Teams, Discord)
- [ ] Test microphone in system settings first

### 4. API Configuration
- [ ] `GEMINI_API_KEY` set in `.env.local`
- [ ] API key has access to Gemini Live API
- [ ] No API quota limits reached

## Step-by-Step Testing

### Test 1: Microphone Access

1. Open LexSim in your browser: `http://localhost:3000`
2. Navigate to **Trial Simulator**
3. Select any case (or create one)
4. Choose a trial phase (e.g., "Cross Examination")
5. Select a difficulty mode (start with "Learn")
6. Click **"Enter Courtroom"**
7. Click the gold **"Start"** button

**Expected Result:**
- Browser prompts for microphone permission
- You see "Allow" or "Block" dialog
- Click **"Allow"**

**If it fails:**
- Check browser permissions: `chrome://settings/content/microphone`
- Ensure no other app is using the microphone
- Try refreshing the page

### Test 2: Voice Recognition (You → AI)

Once the session starts:

1. Wait for "Listening..." status to appear
2. Speak clearly into your microphone:
   - **"Your Honor, may I proceed with my cross-examination?"**
3. Wait 2-3 seconds after speaking

**Expected Result:**
- Volume indicator shows activity while you speak
- Your words appear in the transcript within 3-5 seconds
- AI responds with voice + text

**If voice isn't recognized:**
- Speak louder and more clearly
- Check microphone isn't muted
- Move closer to microphone
- Reduce background noise
- Check browser console for errors (F12)

### Test 3: AI Voice Output (AI → You)

After the AI responds:

**Expected Result:**
- You hear the AI's voice through speakers/headphones
- Voice is clear and natural (not robotic)
- Avatar animates/pulses during speech
- Transcript shows AI's words

**If you don't hear audio:**
- Check speaker volume
- Unmute system audio
- Check browser tab isn't muted
- Try headphones to rule out speaker issues
- Check browser console for "AudioContext suspended" errors

### Test 4: Objection System

Try triggering an objection:

1. In **Cross Examination** mode (Practice or Trial difficulty)
2. Ask a leading question (which is improper on cross):
   - **"So you saw the defendant at the scene, didn't you?"**

**Expected Result:**
- AI interrupts with "OBJECTION!"
- Large red overlay appears with grounds
- Audio plays the objection clearly
- You must respond to the objection

**To trigger different objections:**
- **Hearsay**: "What did your friend tell you they heard?"
- **Leading (on direct)**: In Direct Examination: "You saw the defendant, correct?"
- **Asked and Answered**: Repeat the same question twice
- **Speculation**: "What do you think the defendant was thinking?"

### Test 5: Live Coaching

The AI should provide real-time feedback:

1. Continue the examination for 2-3 exchanges
2. Watch the **"Real-time Coaching"** panel on the right

**Expected Result:**
- Coaching appears after each exchange
- Shows critique, suggestions, and sample responses
- Fallacy detection (if you make logical errors)
- Rhetorical effectiveness score

### Test 6: Continuous Conversation

Test the full conversation flow:

1. Speak multiple questions in sequence
2. Let AI respond fully before speaking again
3. Continue for 5+ exchanges

**Expected Result:**
- Smooth back-and-forth conversation
- No audio cutouts or delays
- Transcription remains accurate
- Objections trigger appropriately

## Common Issues & Solutions

### Issue: "Permission Denied" Error

**Causes:**
- Browser blocked microphone access
- System-level permission denied
- Another app is using the microphone

**Solutions:**
```
1. Check Chrome: chrome://settings/content/microphone
2. Ensure LexSim is in the "Allow" list
3. On macOS: System Preferences → Security & Privacy → Microphone
4. On Windows: Settings → Privacy → Microphone
5. Close Zoom, Discord, OBS, or other audio apps
```

### Issue: No Audio Output from AI

**Causes:**
- AudioContext suspended (browser policy)
- Muted tab or system
- Audio device issues

**Solutions:**
```
1. Check browser tab isn't muted (right-click tab)
2. Check system volume is up
3. Try headphones/speakers
4. Open browser console (F12) and look for:
   - "AudioContext suspended"
   - "Audio playback failed"
5. Click anywhere on the page to resume AudioContext
6. Restart the session
```

### Issue: Voice Not Recognized

**Causes:**
- Microphone too quiet
- Background noise
- Wrong input device selected

**Solutions:**
```
1. Test microphone: chrome://settings/content/microphone
2. Speak louder and more clearly
3. Check correct mic is selected in system settings
4. Move closer to microphone
5. Use external microphone instead of built-in
6. Reduce background noise (close windows, turn off fans)
```

### Issue: Laggy or Delayed Responses

**Causes:**
- Slow internet connection
- High API latency
- Network congestion

**Solutions:**
```
1. Check internet speed: fast.com (need 5+ Mbps upload)
2. Close bandwidth-heavy apps (Netflix, downloads)
3. Use wired connection instead of WiFi
4. Restart router
5. Check Gemini API status
```

### Issue: Session Disconnects

**Causes:**
- Network interruption
- API quota exceeded
- Browser tab backgrounded

**Solutions:**
```
1. Keep browser tab active (don't minimize)
2. Check API quota: aistudio.google.com
3. Verify stable internet
4. Restart session and try again
```

## Performance Tips

### For Best Audio Quality:
1. **Use headphones** - Prevents echo and feedback
2. **External microphone** - Better than built-in laptop mic
3. **Quiet room** - Essential for accurate recognition
4. **Close to mic** - 6-12 inches away is ideal
5. **Clear speech** - Pause between questions

### For Lower Latency:
1. **Good internet** - 10+ Mbps recommended
2. **Wired connection** - More stable than WiFi
3. **Close other tabs** - Reduces browser load
4. **Use Learn mode first** - Less aggressive interruptions

### For Better Recognition:
1. **Speak in sentences** - Complete thoughts work best
2. **Legal terminology** - AI is trained on legal language
3. **Pause after speaking** - Give AI time to process
4. **Avoid filler words** - "Um", "uh", "like" confuse the AI

## Debugging Audio Issues

### Enable Verbose Logging

Open browser console (F12) and check for:

```javascript
// Good signs:
"Live Connected"
"AudioContext resumed"
"Audio buffer created"

// Bad signs:
"AudioContext suspended"
"getUserMedia failed"
"API error: 403"
"Network error"
```

### Test Audio Pipeline

Run this in browser console to test raw audio:

```javascript
// Test microphone
navigator.mediaDevices.getUserMedia({ audio: true })
  .then(stream => {
    console.log("✅ Microphone working", stream);
    stream.getTracks().forEach(t => t.stop());
  })
  .catch(e => console.error("❌ Microphone failed", e));

// Test AudioContext
const ctx = new AudioContext();
console.log("AudioContext state:", ctx.state);
if (ctx.state === 'suspended') {
  ctx.resume().then(() => console.log("✅ Resumed"));
}
```

### Check API Connection

Verify API key is working:

```bash
# In terminal:
curl -H "Content-Type: application/json" \
  -d '{"contents":[{"parts":[{"text":"test"}]}]}' \
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=YOUR_API_KEY"
```

## Testing Checklist

Use this checklist to verify all features:

- [ ] Microphone permission granted
- [ ] Volume indicator shows activity when speaking
- [ ] Your speech is transcribed accurately
- [ ] AI responds with voice (not just text)
- [ ] AI voice is clear and natural
- [ ] Objections trigger and display properly
- [ ] Coaching feedback appears in real-time
- [ ] Multiple back-and-forth exchanges work
- [ ] Session can be stopped and restarted
- [ ] No audio cutouts or stuttering
- [ ] Latency is acceptable (<2 seconds)

## Advanced Testing

### Test All Trial Phases

Each phase has different AI behavior:

- [ ] **Pre-Trial Motions** - Judge asks clarifying questions
- [ ] **Voir Dire** - Juror personas switch frequently
- [ ] **Opening Statement** - Objections for argumentative language
- [ ] **Direct Examination** - Strict no-leading-questions rule
- [ ] **Cross Examination** - Hostile witness, evasive answers
- [ ] **Defendant Testimony** - You're being cross-examined
- [ ] **Closing Argument** - Objections for misstating evidence
- [ ] **Sentencing** - Judge weighs mitigation/aggravation

### Test All Difficulty Modes

- [ ] **Learn** - AI provides scripts, rarely objects
- [ ] **Practice** - Balanced, helpful feedback
- [ ] **Trial** - Aggressive, realistic, no hand-holding

## Reporting Issues

If you encounter persistent issues:

1. Note the exact error message
2. Check browser console (F12) for errors
3. Note your setup:
   - Browser + version
   - Operating system
   - Microphone type
   - Trial phase and mode
4. Open an issue in the repository with:
   - Steps to reproduce
   - Expected vs actual behavior
   - Console logs
   - Screenshots/recordings

## API Usage Notes

**Live API is expensive!** Each session uses:
- Continuous audio streaming (input)
- Real-time transcription (bidirectional)
- Audio synthesis (output)
- Function calling (objections, coaching)

**Cost optimization:**
- Use Learn mode for initial practice (less aggressive)
- Keep sessions short (5-10 minutes)
- Monitor usage at: https://aistudio.google.com/

---

**Ready to practice?** Start with **Learn mode** in **Cross Examination** to get comfortable with the audio flow!
