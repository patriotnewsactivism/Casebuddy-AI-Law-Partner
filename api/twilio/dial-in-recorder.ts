import type { VercelRequest, VercelResponse } from '@vercel/node';

const TWILIO_FROM = process.env.TWILIO_PHONE_NUMBER || '';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Content-Type', 'text/xml');

  const rawDigits = String(req.body?.Digits || req.query?.Digits || '');
  const digits    = rawDigits.replace(/[^0-9]/g, '');  // strip # and anything non-numeric
  const step      = String(req.body?.step   || req.query?.step   || '1');
  const stored    = String(req.body?.stored || req.query?.stored || '').replace(/[^0-9]/g, '');

  console.log(`[dial-in-recorder] step=${step} rawDigits="${rawDigits}" digits="${digits}" stored="${stored}"`);

  // ── Step 3: confirmed — dial out and record ────────────────────────────────
  if (step === '3' && stored) {
    const target   = stored.startsWith('1') ? '+' + stored : '+1' + stored;
    const callerId = process.env.TWILIO_CALLER_ID || TWILIO_FROM;
    console.log(`[dial-in-recorder] Dialing ${target} as ${callerId}`);

    return res.status(200).send(
      '<?xml version="1.0" encoding="UTF-8"?>' +
      '<Response>' +
        '<Say voice="Polly.Joanna">Connecting now. This call will be recorded. Good luck.</Say>' +
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

  // ── Step done — call ended ─────────────────────────────────────────────────
  if (step === 'done') {
    return res.status(200).send(
      '<?xml version="1.0" encoding="UTF-8"?>' +
      '<Response>' +
        '<Say voice="Polly.Joanna">Call ended. Your recording is being transcribed and will be emailed to you shortly. Goodbye.</Say>' +
      '</Response>'
    );
  }

  // ── Step 2: read number back, press 1 to confirm ──────────────────────────
  if (step === '2') {
    const num = digits.slice(0, 10);

    if (num.length < 7) {
      // Not enough digits — restart
      return res.status(200).send(
        '<?xml version="1.0" encoding="UTF-8"?>' +
        '<Response>' +
          '<Say voice="Polly.Joanna">I did not get enough digits. Let\'s try again.</Say>' +
          '<Redirect method="POST">https://casebuddy.live/api/twilio/dial-in-recorder</Redirect>' +
        '</Response>'
      );
    }

    const padded    = num.padEnd(10, '0');
    const formatted = padded.slice(0,3) + ', ' + padded.slice(3,6) + ', ' + padded.slice(6,10);
    // Encode number into the action URL so it survives the next POST
    const confirmUrl = 'https://casebuddy.live/api/twilio/dial-in-recorder?step=3&stored=' + encodeURIComponent(num);

    // Accept "1" or "#" as confirm — so if user reflexively presses # it still works
    return res.status(200).send(
      '<?xml version="1.0" encoding="UTF-8"?>' +
      '<Response>' +
        '<Gather numDigits="1" action="' + confirmUrl + '" method="POST" timeout="15" finishOnKey="">' +
          '<Say voice="Polly.Joanna">I heard ' + formatted + '. Press 1 to connect and record. Press 2 to re-enter the number.</Say>' +
        '</Gather>' +
        // Timeout with no input — just connect anyway (attorney probably put phone down)
        '<Redirect method="POST">' + confirmUrl + '</Redirect>' +
      '</Response>'
    );
  }

  // ── Step 3 via confirm digit ───────────────────────────────────────────────
  // If user pressed 2 at step 2, digits="2" and we restart
  if (step === '3' && !stored && digits === '2') {
    return res.status(200).send(
      '<?xml version="1.0" encoding="UTF-8"?>' +
      '<Response>' +
        '<Redirect method="POST">https://casebuddy.live/api/twilio/dial-in-recorder</Redirect>' +
      '</Response>'
    );
  }

  // ── Step 1: collect the number (NO numDigits limit — only finishOnKey="#") ─
  // Critical: do NOT set numDigits here. Let finishOnKey="#" be the ONLY trigger.
  // If numDigits is set alongside finishOnKey, Twilio fires at numDigits count
  // BEFORE the user can press #, then # leaks into the next Gather.
  return res.status(200).send(
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<Response>' +
      '<Gather action="https://casebuddy.live/api/twilio/dial-in-recorder?step=2" method="POST" timeout="20" finishOnKey="#">' +
        '<Say voice="Polly.Joanna">' +
          'Welcome to CaseBuddy outbound recorder. ' +
          'Enter the 10 digit number you want to call, including area code, then press pound.' +
        '</Say>' +
      '</Gather>' +
      '<Say voice="Polly.Joanna">No number received. Goodbye.</Say>' +
    '</Response>'
  );
}
