import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Content-Type', 'text/xml');

  const digits = String(req.body?.Digits || req.query?.Digits || '');

  // ── Silent backdoor — press 9 to access outbound recorder (never announced) ──
  if (digits === '9') {
    return res.status(200).send(
      '<?xml version="1.0" encoding="UTF-8"?>' +
      '<Response>' +
        '<Redirect method="GET">https://casebuddy.live/api/twilio/dial-in-recorder</Redirect>' +
      '</Response>'
    );
  }

  // ── Any other key — standard client intake recording ─────────────────────
  if (digits) {
    return res.status(200).send(
      '<?xml version="1.0" encoding="UTF-8"?>' +
      '<Response>' +
        '<Say voice="Polly.Joanna">' +
          'Perfect. After the tone, please state your full name, the best phone number to reach you, ' +
          'your preferred callback day and time, and a brief description of your legal matter. ' +
          'Press pound or stay silent for five seconds when finished.' +
        '</Say>' +
        '<Record' +
          ' action="https://casebuddy.live/api/twilio/recording-complete"' +
          ' recordingStatusCallback="https://casebuddy.live/api/twilio/recording-complete"' +
          ' recordingStatusCallbackMethod="POST"' +
          ' maxLength="300"' +
          ' timeout="5"' +
          ' finishOnKey="#"' +
          ' transcribe="true"' +
          ' transcribeCallback="https://casebuddy.live/api/twilio/recording-complete"' +
          ' playBeep="true"' +
        ' />' +
        '<Say voice="Polly.Joanna">' +
          'Thank you. An attorney from CaseBuddy will review your message and reach out within one business day. Goodbye.' +
        '</Say>' +
      '</Response>'
    );
  }

  // ── Initial greeting — clients hear this, press any key for intake, 9 for recorder ──
  return res.status(200).send(
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<Response>' +
      '<Say voice="Polly.Joanna">' +
        'Thank you for calling CaseBuddy AI Law. This call may be recorded for legal documentation purposes.' +
      '</Say>' +
      '<Gather numDigits="1" action="https://casebuddy.live/api/twilio/voice-inbound" method="POST" timeout="10">' +
        '<Say voice="Polly.Joanna">' +
          'To leave a message for one of our attorneys, please press any key.' +
        '</Say>' +
      '</Gather>' +
      '<Say voice="Polly.Joanna">We did not receive your input. Please call back. Goodbye.</Say>' +
    '</Response>'
  );
}
