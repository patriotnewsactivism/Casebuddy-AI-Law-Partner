import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Content-Type', 'text/xml');

  const body    = req.body  || {};
  const query   = req.query || {};
  const digits  = String(body.Digits || query.Digits || '').replace(/\D/g, '');
  const from    = String(body.From   || query.From   || '');
  const callSid = String(body.CallSid || query.CallSid || '');

  const ownerCell = (process.env.FIRM_OWNER_CELL || '').replace(/\D/g, '');
  const callerNum = from.replace(/\D/g, '');
  const isOwner   = ownerCell && callerNum.endsWith(ownerCell.slice(-10));

  console.log(`[voice-inbound] digits="${digits}" from="${from}" isOwner=${isOwner} callSid=${callSid}`);

  // ── Attorney dialed 9 — hand off to outbound recorder ─────────────────────
  if (digits === '9') {
    return res.status(200).send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Redirect method="POST">https://casebuddy.live/api/twilio/dial-in-recorder</Redirect>
</Response>`);
  }

  // ── Any other key — client intake voicemail ────────────────────────────────
  if (digits) {
    return res.status(200).send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna">Please state your full name, best phone number, preferred callback time, and a brief description of your legal matter. Press pound when finished.</Say>
  <Record
    action="https://casebuddy.live/api/twilio/recording-complete"
    recordingStatusCallback="https://casebuddy.live/api/twilio/recording-complete"
    recordingStatusCallbackMethod="POST"
    maxLength="300"
    timeout="5"
    finishOnKey="#"
    playBeep="true"
  />
  <Say voice="Polly.Joanna">Thank you. An attorney will follow up within one business day. Goodbye.</Say>
</Response>`);
  }

  // ── Initial greeting ───────────────────────────────────────────────────────
  return res.status(200).send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna">Thank you for calling CaseBuddy AI Law. This call may be recorded for legal documentation purposes.</Say>
  <Gather numDigits="1" action="https://casebuddy.live/api/twilio/voice-inbound" method="POST" timeout="10">
    <Say voice="Polly.Joanna">To speak with an intake specialist, press any key now.</Say>
  </Gather>
  <Say voice="Polly.Joanna">We didn't receive your input. Please call back during business hours. Goodbye.</Say>
</Response>`);
}
