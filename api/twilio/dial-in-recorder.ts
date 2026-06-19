import type { VercelRequest, VercelResponse } from '@vercel/node';

const TWILIO_FROM = process.env.TWILIO_PHONE_NUMBER || '';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Content-Type', 'text/xml');

  const rawDigits = String(req.body?.Digits || req.query?.Digits || '');
  const digits    = rawDigits.replace(/\D/g, '');
  const step      = String(req.body?.step   || req.query?.step   || '1');
  const stored    = String(req.body?.stored || req.query?.stored || '').replace(/\D/g, '');

  console.log(`[dial-in-recorder] step=${step} rawDigits="${rawDigits}" digits="${digits}" stored="${stored}"`);

  // ── Step 3: dial out and record ────────────────────────────────────────────
  if (step === '3' && stored) {
    const target   = stored.startsWith('1') ? '+' + stored : '+1' + stored;
    const callerId = process.env.TWILIO_CALLER_ID || TWILIO_FROM;
    console.log(`[dial-in-recorder] DIALING ${target} as ${callerId}`);

    return res.status(200).send(
      '<?xml version="1.0" encoding="UTF-8"?>' +
      '<Response>' +
        '<Say voice="Polly.Joanna">Connecting now. This call will be recorded.</Say>' +
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

  // ── Step done ──────────────────────────────────────────────────────────────
  if (step === 'done') {
    return res.status(200).send(
      '<?xml version="1.0" encoding="UTF-8"?>' +
      '<Response>' +
        '<Say voice="Polly.Joanna">Call ended. Your recording will be transcribed and emailed to you shortly. Goodbye.</Say>' +
      '</Response>'
    );
  }

  // ── Step 2: read back number, press 1 to connect ──────────────────────────
  if (step === '2' && digits.length >= 7) {
    const num       = digits.slice(0, 10);
    const padded    = num.padEnd(10, '0');
    const formatted = padded.slice(0,3) + ' ' + padded.slice(3,6) + ' ' + padded.slice(6,10);
    const connectUrl = 'https://casebuddy.live/api/twilio/dial-in-recorder?step=3&stored=' + encodeURIComponent(num);
    const restartUrl = 'https://casebuddy.live/api/twilio/dial-in-recorder';

    return res.status(200).send(
      '<?xml version="1.0" encoding="UTF-8"?>' +
      '<Response>' +
        '<Gather numDigits="1" action="' + connectUrl + '" method="POST" timeout="10">' +
          '<Say voice="Polly.Joanna">I heard ' + formatted + '. Press 1 to connect and record. Press 2 to enter a different number.</Say>' +
        '</Gather>' +
        // Timeout — connect automatically rather than looping
        '<Redirect method="POST">' + connectUrl + '</Redirect>' +
      '</Response>'
    );
  }

  // Step 2 but not enough digits — restart
  if (step === '2') {
    return res.status(200).send(
      '<?xml version="1.0" encoding="UTF-8"?>' +
      '<Response>' +
        '<Say voice="Polly.Joanna">I did not receive a complete number. Let\'s try again.</Say>' +
        '<Redirect method="POST">https://casebuddy.live/api/twilio/dial-in-recorder</Redirect>' +
      '</Response>'
    );
  }

  // ── Step 1: collect exactly 10 digits — NO finishOnKey, NO pound needed ───
  // numDigits="10" fires automatically once 10 digits are entered.
  // No # key required. This is the most reliable Twilio number-collection pattern.
  return res.status(200).send(
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<Response>' +
      '<Gather action="https://casebuddy.live/api/twilio/dial-in-recorder?step=2" method="POST" numDigits="10" timeout="15">' +
        '<Say voice="Polly.Joanna">' +
          'CaseBuddy outbound recorder. ' +
          'Enter the 10 digit number to call. Area code first. Do not press pound.' +
        '</Say>' +
      '</Gather>' +
      '<Say voice="Polly.Joanna">No number received. Goodbye.</Say>' +
    '</Response>'
  );
}
