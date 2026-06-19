import type { VercelRequest, VercelResponse } from '@vercel/node';

// Called after client presses a key on the main intake menu.
// Prompts them to record their name, number, callback time, and matter description.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Content-Type', 'text/xml');

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
