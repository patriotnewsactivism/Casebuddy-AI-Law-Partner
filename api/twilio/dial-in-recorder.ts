import type { VercelRequest, VercelResponse } from '@vercel/node';

const TWILIO_FROM = process.env.TWILIO_PHONE_NUMBER || '';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Content-Type', 'text/xml');

  const digits = String(req.body?.Digits || req.query?.Digits || '');
  const step   = String(req.body?.step   || req.query?.step   || '1');
  const stored = String(req.body?.stored || req.query?.stored || '');

  // Step 3: confirmed — bridge and record
  if (step === '3' && stored) {
    const cleaned = stored.replace(/\D/g, '');
    const target  = cleaned.startsWith('1') ? '+' + cleaned : '+1' + cleaned;
    const callerId = process.env.TWILIO_CALLER_ID || TWILIO_FROM;

    return res.status(200).send(
      '<?xml version="1.0" encoding="UTF-8"?>' +
      '<Response>' +
        '<Say voice="Polly.Joanna">Connecting and recording now. Good luck.</Say>' +
        '<Dial' +
          ' callerId="' + callerId + '"' +
          ' record="record-from-answer-dual-channel"' +
          ' recordingStatusCallback="https://casebuddy.live/api/twilio/recording-complete"' +
          ' recordingStatusCallbackMethod="POST"' +
          ' recordingStatusCallbackEvent="completed"' +
          ' action="https://casebuddy.live/api/twilio/dial-in-recorder?step=done"' +
          ' timeout="30">' +
          '<Number>' + target + '</Number>' +
        '</Dial>' +
      '</Response>'
    );
  }

  // Step done — call ended
  if (step === 'done') {
    return res.status(200).send(
      '<?xml version="1.0" encoding="UTF-8"?>' +
      '<Response>' +
        '<Say voice="Polly.Joanna">Call ended. Your recording will be transcribed and emailed to you shortly. Goodbye.</Say>' +
      '</Response>'
    );
  }

  // Step 2 — confirm number back to attorney
  if (step === '2' && digits) {
    const cleaned = digits.replace(/\D/g, '');
    const d = cleaned.padEnd(10, '0');
    const formatted = d.slice(0,3) + ', ' + d.slice(3,6) + ', ' + d.slice(6,10);
    const confirm1url = 'https://casebuddy.live/api/twilio/dial-in-recorder?step=3&stored=' + encodeURIComponent(cleaned);
    const restartUrl  = 'https://casebuddy.live/api/twilio/dial-in-recorder';
    return res.status(200).send(
      '<?xml version="1.0" encoding="UTF-8"?>' +
      '<Response>' +
        '<Gather numDigits="1" action="' + confirm1url + '" method="POST" timeout="10">' +
          '<Say voice="Polly.Joanna">I heard ' + formatted + '. Press 1 to connect and start recording. Press 2 to re-enter the number.</Say>' +
        '</Gather>' +
        '<Redirect method="GET">' + restartUrl + '</Redirect>' +
      '</Response>'
    );
  }

  // Step 1 — initial greeting
  return res.status(200).send(
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<Response>' +
      '<Gather numDigits="11" action="https://casebuddy.live/api/twilio/dial-in-recorder?step=2" method="POST" timeout="15" finishOnKey="#">' +
        '<Say voice="Polly.Joanna">' +
          'Welcome to CaseBuddy call recorder. ' +
          'This call will be recorded and transcribed to your case file. ' +
          'Enter the 10 digit number you want to call, then press pound. Include the area code.' +
        '</Say>' +
      '</Gather>' +
      '<Say voice="Polly.Joanna">No number received. Please call back to try again. Goodbye.</Say>' +
    '</Response>'
  );
}
