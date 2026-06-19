import type { VercelRequest, VercelResponse } from '@vercel/node';

// Called by Twilio when the attorney picks up their cell phone.
// Announces recording, waits for keypress, then dials the target.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { to, caseId, label } = req.query as any;
  const digits = req.body?.Digits || req.query?.Digits || '';

  res.setHeader('Content-Type', 'text/xml');

  // Step 2: attorney pressed a key — now connect to the target
  if (digits) {
    const safeLabel = label ? `Connecting to ${decodeURIComponent(label)}.` : 'Connecting now.';
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna">${safeLabel} This call is being recorded.</Say>
  <Dial
    record="record-from-answer-dual-channel"
    recordingStatusCallback="https://casebuddy.live/api/twilio/recording-complete"
    recordingStatusCallbackMethod="POST"
    recordingStatusCallbackEvent="completed"
    action="https://casebuddy.live/api/twilio/recording-complete"
    timeout="30">
    <Number statusCallbackEvent="answered completed" method="POST">${decodeURIComponent(to)}</Number>
  </Dial>
</Response>`;
    return res.status(200).send(twiml);
  }

  // Step 1: attorney just picked up — prompt them to press any key
  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather numDigits="1" action="https://casebuddy.live/api/twilio/outbound-connect?to=${encodeURIComponent(to)}&caseId=${encodeURIComponent(caseId||'')}&label=${encodeURIComponent(label||'')}" method="POST" timeout="15">
    <Say voice="Polly.Joanna">
      CaseBuddy outbound call. This call will be recorded and transcribed for your case file. Press any key to connect.
    </Say>
  </Gather>
  <Say voice="Polly.Joanna">No input received. Ending call.</Say>
</Response>`;

  return res.status(200).send(twiml);
}
