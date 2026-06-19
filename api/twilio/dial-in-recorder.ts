import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Content-Type', 'text/xml');

  const body    = req.body  || {};
  const query   = req.query || {};
  const step    = String(body.step    || query.step    || '1');
  const stored  = String(body.stored  || query.stored  || '').replace(/\D/g, '');
  const rawDig  = String(body.Digits  || query.Digits  || '');
  const digits  = rawDig.replace(/\D/g, '');
  const callSid = String(body.CallSid || query.CallSid || '');

  const FROM     = process.env.TWILIO_CALLER_ID || process.env.TWILIO_PHONE_NUMBER || '';
  const BASE_URL = 'https://casebuddy.live/api/twilio/dial-in-recorder';

  console.log(`[recorder] step=${step} digits="${digits}" stored="${stored}" callSid=${callSid}`);

  // ── STEP: dial ── connect and record immediately ──────────────────────────
  if (step === 'dial' && stored) {
    const target = stored.startsWith('1') ? `+${stored}` : `+1${stored}`;
    console.log(`[recorder] Dialing ${target} from ${FROM}`);
    return res.status(200).send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna">Connecting your call now. Recording will begin when the other party answers.</Say>
  <Dial callerId="${FROM}"
        record="record-from-answer-dual-channel"
        recordingStatusCallback="https://casebuddy.live/api/twilio/recording-complete"
        recordingStatusCallbackMethod="POST"
        recordingStatusCallbackEvent="completed"
        action="${BASE_URL}?step=done"
        timeout="30">
    <Number>${target}</Number>
  </Dial>
</Response>`);
  }

  // ── STEP: done ── call ended ───────────────────────────────────────────────
  if (step === 'done') {
    return res.status(200).send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna">Your call has ended. The recording is being processed and will be emailed to you shortly. Goodbye.</Say>
</Response>`);
  }

  // ── STEP: 2 ── received digits, read back and confirm ─────────────────────
  if (step === '2' && digits.length >= 7) {
    const num       = digits.slice(0, 10);
    const formatted = `${num.slice(0,3)}, ${num.slice(3,6)}, ${num.slice(6,10)}`;
    const dialUrl   = `${BASE_URL}?step=dial&stored=${encodeURIComponent(num)}`;
    return res.status(200).send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather numDigits="1" action="${dialUrl}" method="POST" timeout="8">
    <Say voice="Polly.Joanna">Calling ${formatted}. Press 1 to connect. Press 2 to re-enter.</Say>
  </Gather>
  <Redirect method="POST">${dialUrl}</Redirect>
</Response>`);
  }

  // Step 2 but digits too short — re-prompt
  if (step === '2') {
    return res.status(200).send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna">I didn't get a complete number. Please try again.</Say>
  <Redirect method="POST">${BASE_URL}</Redirect>
</Response>`);
  }

  // ── STEP: 1 ── collect 10 digits, fires automatically, NO pound needed ────
  return res.status(200).send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather action="${BASE_URL}?step=2" method="POST" numDigits="10" timeout="15">
    <Say voice="Polly.Joanna">Enter the 10 digit number you want to call. Do not press pound. Start with the area code.</Say>
  </Gather>
  <Say voice="Polly.Joanna">No number entered. Goodbye.</Say>
</Response>`);
}
