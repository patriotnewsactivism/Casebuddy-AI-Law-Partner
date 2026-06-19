import type { VercelRequest, VercelResponse } from '@vercel/node';

const TWILIO_FROM = process.env.TWILIO_PHONE_NUMBER || '';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Content-Type', 'text/xml');

  // Read step and stored from BOTH body and query (Twilio POSTs body, but we
  // embed step/stored in the action URL query string so they arrive as query params)
  const rawDigits = String(req.body?.Digits || req.query?.Digits || '');
  const digits    = rawDigits.replace(/[^0-9]/g, '');   // strip # and non-digits
  const step      = String(req.body?.step   || req.query?.step   || '1');
  const stored    = String(req.body?.stored || req.query?.stored || '').replace(/[^0-9]/g, '');

  console.log(`[dial-in-recorder] step=${step} digits=${digits} stored=${stored}`);

  // ── Step 3: attorney confirmed — dial and record ──────────────────────────
  if (step === '3' && stored) {
    const target   = stored.startsWith('1') ? '+' + stored : '+1' + stored;
    const callerId = process.env.TWILIO_CALLER_ID || TWILIO_FROM;

    console.log(`[dial-in-recorder] Dialing ${target} with callerId ${callerId}`);

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

  // ── Step done — call ended ────────────────────────────────────────────────
  if (step === 'done') {
    return res.status(200).send(
      '<?xml version="1.0" encoding="UTF-8"?>' +
      '<Response>' +
        '<Say voice="Polly.Joanna">Call ended. Your recording is being transcribed and will be emailed to you shortly. Goodbye.</Say>' +
      '</Response>'
    );
  }

  // ── Step 2: read back number, ask to confirm ──────────────────────────────
  if (step === '2') {
    // digits may have come in from step 1 gather
    const num = (digits || stored).slice(0, 10).padEnd(10, '0');
    if (!num.replace(/0/g, '')) {
      // No number captured — restart
      return res.status(200).send(
        '<?xml version="1.0" encoding="UTF-8"?>' +
        '<Response>' +
          '<Say voice="Polly.Joanna">I did not catch a number. Let\'s try again.</Say>' +
          '<Redirect method="POST">https://casebuddy.live/api/twilio/dial-in-recorder</Redirect>' +
        '</Response>'
      );
    }
    const formatted = num.slice(0,3) + ', ' + num.slice(3,6) + ', ' + num.slice(6,10);
    // Encode number into action URL so it survives the POST
    const confirmUrl = 'https://casebuddy.live/api/twilio/dial-in-recorder?step=3&stored=' + encodeURIComponent(num);
    const restartUrl = 'https://casebuddy.live/api/twilio/dial-in-recorder';

    return res.status(200).send(
      '<?xml version="1.0" encoding="UTF-8"?>' +
      '<Response>' +
        '<Gather numDigits="1" action="' + confirmUrl + '" method="POST" timeout="15">' +
          '<Say voice="Polly.Joanna">I heard ' + formatted + '. Press 1 to connect and start recording. Press any other key to re-enter the number.</Say>' +
        '</Gather>' +
        // Timeout — restart cleanly via POST
        '<Redirect method="POST">' + restartUrl + '</Redirect>' +
      '</Response>'
    );
  }

  // ── Step 1: initial greeting — collect number ─────────────────────────────
  // Use finishOnKey="#" with a generous maxDigits — no numDigits limit so
  // the attorney just dials 10 digits and hits # without worrying about count.
  return res.status(200).send(
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<Response>' +
      '<Gather action="https://casebuddy.live/api/twilio/dial-in-recorder?step=2" method="POST" timeout="20" finishOnKey="#" numDigits="10">' +
        '<Say voice="Polly.Joanna">' +
          'Welcome to CaseBuddy outbound recorder. ' +
          'Enter the 10 digit number you want to call, then press pound. ' +
          'Do not include the country code.' +
        '</Say>' +
      '</Gather>' +
      '<Say voice="Polly.Joanna">No number received. Goodbye.</Say>' +
    '</Response>'
  );
}
