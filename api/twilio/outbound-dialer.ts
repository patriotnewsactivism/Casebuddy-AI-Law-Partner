import type { VercelRequest, VercelResponse } from '@vercel/node';

const TWILIO_SID  = process.env.TWILIO_ACCOUNT_SID || '';
const TWILIO_AUTH = process.env.TWILIO_AUTH_TOKEN  || '';
const TWILIO_FROM = process.env.TWILIO_PHONE_NUMBER || '';  // your Twilio number e.g. +15551234567

// ── Outbound Dialer ────────────────────────────────────────────────────────────
// POST { to: "+15559876543", caseId?: "abc123", label?: "Client - John Doe" }
// → Twilio calls YOUR cell first, then bridges to the target number, records everything.
// GET  → health check
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'GET') return res.status(200).json({ ok: true, service: 'CaseBuddy Outbound Dialer' });
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { to, caseId, label, callMyNumber } = req.body as any;

  if (!to) return res.status(400).json({ error: 'Missing required field: to (phone number)' });
  if (!TWILIO_SID || !TWILIO_AUTH) return res.status(500).json({ error: 'Twilio credentials not configured' });

  // The number to call first — either a specific cell number passed in, or default firm owner cell
  const myCell = callMyNumber || process.env.FIRM_OWNER_CELL || '';
  if (!myCell) return res.status(400).json({ error: 'No callback number. Pass callMyNumber or set FIRM_OWNER_CELL env var.' });

  const callbackBase = 'https://casebuddy.live/api/twilio';

  // TwiML that plays when attorney picks up their cell:
  // "Recording this call. Press any key to connect." → then dials the target
  const twimlUrl = `${callbackBase}/outbound-connect?to=${encodeURIComponent(to)}&caseId=${encodeURIComponent(caseId || '')}&label=${encodeURIComponent(label || '')}`;

  try {
    const auth = Buffer.from(`${TWILIO_SID}:${TWILIO_AUTH}`).toString('base64');
    const twilioRes = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Calls.json`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        To:     myCell,
        From:   TWILIO_FROM,
        Url:    twimlUrl,
        Method: 'GET',
        StatusCallback: `${callbackBase}/recording-complete`,
        StatusCallbackMethod: 'POST',
        StatusCallbackEvent: 'completed',
        Record: 'true',
        RecordingStatusCallback: `${callbackBase}/recording-complete`,
        RecordingStatusCallbackMethod: 'POST',
      }).toString(),
    });

    const callData = await twilioRes.json() as any;
    if (callData.status === 'failed' || callData.code) {
      return res.status(500).json({ error: callData.message || 'Twilio call failed', detail: callData });
    }

    return res.status(200).json({
      ok: true,
      message: `Calling your cell now. Pick up and press any key to connect to ${to}.`,
      callSid: callData.sid,
      status: callData.status,
      to,
      myCell,
      caseId: caseId || null,
      label: label || null,
    });
  } catch (err: any) {
    console.error('[outbound-dialer]', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
}
