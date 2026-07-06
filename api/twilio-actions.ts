/**
 * Consolidated Twilio Actions — outbound dialer + SMS
 * POST /api/twilio-actions?action=outbound-dialer|send-sms
 */

export const config = { runtime: 'edge' };

const CORS = {
  'Access-Control-Allow-Origin': 'https://casebuddy.live',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

const json = (body: object, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });

async function handleSendSms(req: Request): Promise<Response> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken  = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_FROM_NUMBER || process.env.TWILIO_PHONE_NUMBER;
  if (!accountSid || !authToken || !fromNumber) return json({ error: 'Twilio not configured' }, 503);

  let to: string, message: string;
  try {
    const body = await req.json();
    to = body.to; message = body.message;
    if (!to || !message) return json({ error: 'Missing required fields: to, message' }, 400);
  } catch { return json({ error: 'Invalid JSON body' }, 400); }

  const resp = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
    {
      method: 'POST',
      headers: {
        Authorization: `Basic ${btoa(`${accountSid}:${authToken}`)}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ To: to, From: fromNumber, Body: message }).toString(),
    }
  );
  const data = await resp.json() as any;
  if (!resp.ok) return json({ error: data.message || 'SMS failed' }, 502);
  return json({ ok: true, sid: data.sid, status: data.status });
}

async function handleOutboundDialer(req: Request): Promise<Response> {
  const TWILIO_SID  = process.env.TWILIO_ACCOUNT_SID || '';
  const TWILIO_AUTH = process.env.TWILIO_AUTH_TOKEN  || '';
  const TWILIO_FROM = process.env.TWILIO_PHONE_NUMBER || '';

  let body: any;
  try { body = await req.json(); } catch { return json({ error: 'Invalid JSON body' }, 400); }

  const { to, caseId, label, callMyNumber } = body;
  if (!to) return json({ error: 'Missing required field: to' }, 400);
  if (!TWILIO_SID || !TWILIO_AUTH) return json({ error: 'Twilio credentials not configured' }, 500);

  const myCell = callMyNumber || process.env.FIRM_OWNER_CELL || '';
  if (!myCell) return json({ error: 'No callback number. Pass callMyNumber or set FIRM_OWNER_CELL env var.' }, 400);

  const twimlUrl = `https://casebuddy.live/api/twilio-voice?action=outbound-connect&to=${encodeURIComponent(to)}&caseId=${encodeURIComponent(caseId || '')}&label=${encodeURIComponent(label || '')}`;

  const auth = btoa(`${TWILIO_SID}:${TWILIO_AUTH}`);
  const twilioRes = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Calls.json`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      To: myCell, From: TWILIO_FROM, Url: twimlUrl, Method: 'GET',
      StatusCallback: 'https://casebuddy.live/api/twilio-voice?action=recording-complete',
      StatusCallbackMethod: 'POST', StatusCallbackEvent: 'completed',
      Record: 'true',
      RecordingStatusCallback: 'https://casebuddy.live/api/twilio-voice?action=recording-complete',
      RecordingStatusCallbackMethod: 'POST',
    }).toString(),
  });

  const callData = await twilioRes.json() as any;
  if (!twilioRes.ok) return json({ error: callData.message || 'Twilio call failed', detail: callData }, 502);

  return json({ ok: true, message: `Calling your cell now. Pick up and press any key to connect to ${to}.`, callSid: callData.sid, status: callData.status, to, myCell, caseId: caseId || null });
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const url = new URL(req.url);
  const action = url.searchParams.get('action') || 'send-sms';

  switch (action) {
    case 'send-sms':         return handleSendSms(req);
    case 'outbound-dialer':  return handleOutboundDialer(req);
    default: return json({ error: `Unknown action: ${action}` }, 404);
  }
}
