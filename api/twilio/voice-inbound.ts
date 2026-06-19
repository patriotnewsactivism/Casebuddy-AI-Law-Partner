import type { VercelRequest, VercelResponse } from '@vercel/node';

// Twilio Voice webhook — called when a call comes in to your Twilio number
// Responds with TwiML to record the call and bridge it

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const callSid   = req.body?.CallSid   || req.query?.CallSid   || '';
  const from      = req.body?.From      || req.query?.From      || '';
  const to        = req.body?.To        || req.query?.To        || '';
  const callStatus = req.body?.CallStatus || '';

  console.log(`[voice-inbound] CallSid=${callSid} From=${from} To=${to} Status=${callStatus}`);

  // TwiML response — greet, then record the entire call
  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna">
    Thank you for calling CaseBuddy AI Law. This call may be recorded for legal documentation purposes. Please hold while we connect you.
  </Say>
  <Record
    action="https://casebuddy.live/api/twilio/recording-complete"
    recordingStatusCallback="https://casebuddy.live/api/twilio/recording-status"
    recordingStatusCallbackMethod="POST"
    maxLength="3600"
    timeout="5"
    transcribe="false"
    playBeep="true"
  />
  <Say voice="Polly.Joanna">The call has ended. Goodbye.</Say>
</Response>`;

  res.setHeader('Content-Type', 'text/xml');
  return res.status(200).send(twiml);
}
