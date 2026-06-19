import type { VercelRequest, VercelResponse } from '@vercel/node';

const FIRM_OWNER_CELL = process.env.FIRM_OWNER_CELL || '';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Content-Type', 'text/xml');

  const digits     = String(req.body?.Digits || req.query?.Digits || '');
  const callStatus = String(req.body?.CallStatus || '');
  const from       = String(req.body?.From || req.query?.From || '');

  // ── Route based on menu selection ─────────────────────────────────────────
  if (digits === '1') {
    // ── Client intake — go through Maya ───────────────────────────────────
    return res.status(200).send(
      '<?xml version="1.0" encoding="UTF-8"?>' +
      '<Response>' +
        '<Say voice="Polly.Joanna">Connecting you to our intake team. Please hold.</Say>' +
        '<Gather numDigits="1" action="https://casebuddy.live/api/twilio/intake-record" method="POST" timeout="10">' +
          '<Say voice="Polly.Joanna">' +
            'To leave a message for one of our attorneys, press any key. ' +
            'After the tone, state your full name, best phone number, preferred callback time, and a brief description of your legal matter.' +
          '</Say>' +
        '</Gather>' +
        '<Say voice="Polly.Joanna">We did not receive your input. Please call back. Goodbye.</Say>' +
      '</Response>'
    );
  }

  if (digits === '2') {
    // ── Redirect to dial-in recorder ──────────────────────────────────────
    return res.status(200).send(
      '<?xml version="1.0" encoding="UTF-8"?>' +
      '<Response>' +
        '<Redirect method="GET">https://casebuddy.live/api/twilio/dial-in-recorder</Redirect>' +
      '</Response>'
    );
  }

  // ── Main menu — detect if this is the firm owner calling ────────────────
  // If FIRM_OWNER_CELL is set and matches the caller, skip straight to recorder option
  const isFirmOwner = FIRM_OWNER_CELL && from && from.replace(/\D/g,'').endsWith(FIRM_OWNER_CELL.replace(/\D/g,'').slice(-10));

  if (isFirmOwner) {
    // Owner calling in — offer both options
    return res.status(200).send(
      '<?xml version="1.0" encoding="UTF-8"?>' +
      '<Response>' +
        '<Gather numDigits="1" action="https://casebuddy.live/api/twilio/voice-inbound" method="POST" timeout="10">' +
          '<Say voice="Polly.Joanna">' +
            'Welcome back. ' +
            'Press 1 for client intake. ' +
            'Press 2 to record an outbound call.' +
          '</Say>' +
        '</Gather>' +
        '<Say voice="Polly.Joanna">No input received. Goodbye.</Say>' +
      '</Response>'
    );
  }

  // Everyone else — standard intake menu
  return res.status(200).send(
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<Response>' +
      '<Say voice="Polly.Joanna">' +
        'Thank you for calling CaseBuddy AI Law. This call may be recorded for legal documentation purposes.' +
      '</Say>' +
      '<Gather numDigits="1" action="https://casebuddy.live/api/twilio/voice-inbound" method="POST" timeout="10">' +
        '<Say voice="Polly.Joanna">' +
          'To leave a message for one of our attorneys, press any key.' +
        '</Say>' +
      '</Gather>' +
      '<Say voice="Polly.Joanna">We did not receive your input. Please call back. Goodbye.</Say>' +
    '</Response>'
  );
}
