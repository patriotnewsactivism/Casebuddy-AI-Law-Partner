/**
 * Vercel Edge Function — Twilio SMS proxy.
 *
 * Sends an SMS via Twilio. Requires TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN,
 * and TWILIO_FROM_NUMBER in Vercel environment variables.
 *
 * POST /api/twilio/send-sms
 * Body: { to, message }
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

export default async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken  = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_FROM_NUMBER;

  if (!accountSid || !authToken || !fromNumber) {
    return json({ error: 'Twilio not configured. Add TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER to Vercel env vars.' }, 503);
  }

  let to: string, message: string;
  try {
    const body = await req.json();
    to      = body.to;
    message = body.message;
    if (!to || !message) return json({ error: 'Missing required fields: to, message' }, 400);
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  const params = new URLSearchParams({ To: to, From: fromNumber, Body: message });

  try {
    const resp = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
      {
        method: 'POST',
        headers: {
          Authorization: `Basic ${btoa(`${accountSid}:${authToken}`)}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params.toString(),
      }
    );
    const data = await resp.json() as any;
    if (!resp.ok) return json({ error: data?.message ?? 'Twilio error' }, resp.status);
    return json({ success: true, sid: data.sid });
  } catch (err: any) {
    return json({ error: 'Failed to reach Twilio API', detail: err?.message }, 502);
  }
}
