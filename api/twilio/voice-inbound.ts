import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const callSid    = req.body?.CallSid    || req.query?.CallSid    || '';
  const from       = req.body?.From       || req.query?.From       || '';
  const to         = req.body?.To         || req.query?.To         || '';
  const callStatus = req.body?.CallStatus || '';
  const digits     = req.body?.Digits     || '';

  console.log(`[voice-inbound] CallSid=${callSid} From=${from} To=${to} Status=${callStatus} Digits=${digits}`);

  res.setHeader('Content-Type', 'text/xml');

  // Step 2: caller pressed a key after the initial prompt — now record full intake
  if (digits) {
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna">
    Perfect. Please state your full name, the best phone number to reach you, your preferred callback time, and a brief description of your legal matter. Speak clearly after the tone. When finished, press pound or simply stay silent for five seconds.
  </Say>
  <Record
    action="https://casebuddy.live/api/twilio/recording-complete"
    recordingStatusCallback="https://casebuddy.live/api/twilio/recording-status"
    recordingStatusCallbackMethod="POST"
    maxLength="300"
    timeout="5"
    finishOnKey="#"
    transcribe="true"
    transcribeCallback="https://casebuddy.live/api/twilio/recording-complete"
    playBeep="true"
  />
  <Say voice="Polly.Joanna">Thank you. An attorney from CaseBuddy will review your message and reach out within one business day. Goodbye.</Say>
</Response>`;
    return res.status(200).send(twiml);
  }

  // Step 1: greet and collect info via Gather keypress, then record
  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna">
    Thank you for calling CaseBuddy AI Law. This call will be recorded for legal documentation purposes.
  </Say>
  <Gather numDigits="1" action="https://casebuddy.live/api/twilio/voice-inbound" method="POST" timeout="10">
    <Say voice="Polly.Joanna">
      To leave a message for one of our attorneys, please press any key. After the tone, please state your full name, the best phone number to reach you, your preferred callback time and timezone, and a brief description of your legal matter. Press any key to begin.
    </Say>
  </Gather>
  <Say voice="Polly.Joanna">
    We did not receive your input. Please call back and press any key to leave your message. Goodbye.
  </Say>
</Response>`;

  return res.status(200).send(twiml);
}
