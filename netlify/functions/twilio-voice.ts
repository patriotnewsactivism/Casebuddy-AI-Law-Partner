/**
 * Netlify Function — Twilio voice handling (IVR, recording, transcription).
 * Ported from api/twilio-voice.ts (VercelRequest/VercelResponse → Request/Response).
 *
 * GET/POST /api/twilio-voice?action=voice-inbound|intake-record|dial-in-recorder|outbound-connect|recording-complete
 */

// ── Shared helpers ─────────────────────────────────────────────────────────────
const SB_URL     = process.env.SUPABASE_URL              || '';
const SB_KEY     = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const GEMINI_KEY = process.env.GEMINI_API_KEY            || '';
const TWILIO_SID = process.env.TWILIO_ACCOUNT_SID        || '';
const TWILIO_AUTH= process.env.TWILIO_AUTH_TOKEN          || '';
const FIRM_EMAIL = process.env.FIRM_OWNER_EMAIL          || '';
const SG_KEY     = process.env.SENDGRID_API_KEY          || '';
const BASE       = 'https://casebuddy.live/api/twilio-voice';

function xmlSafe(url: string): string { return url.replace(/&/g, '&amp;'); }

async function sbFetch(path: string, opts: RequestInit = {}) {
  return fetch(`${SB_URL}/rest/v1/${path}`, {
    ...opts,
    headers: {
      apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`,
      'Content-Type': 'application/json', Prefer: 'return=representation',
      ...(opts.headers || {}),
    },
  });
}

function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

async function transcribeWithGemini(audioUrl: string, _callSid: string) {
  if (!GEMINI_KEY) return { transcript: '[Gemini not configured]', summary: '', keyFacts: [] as string[] };
  try {
    const audioRes = await fetch(audioUrl + '.mp3', {
      headers: { Authorization: 'Basic ' + btoa(`${TWILIO_SID}:${TWILIO_AUTH}`) },
    });
    if (!audioRes.ok) return { transcript: '[Audio fetch failed]', summary: '', keyFacts: [] as string[] };
    const audioBuffer = await audioRes.arrayBuffer();
    const base64Audio = toBase64(audioBuffer);
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [
            { text: 'Transcribe this legal intake call. Return JSON: { transcript, summary, keyFacts: string[] }' },
            { inline_data: { mime_type: 'audio/mp3', data: base64Audio } }
          ]}],
        }),
      }
    );
    const gData = await geminiRes.json() as any;
    const raw = gData?.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
    const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    return JSON.parse(cleaned);
  } catch { return { transcript: '[Transcription failed]', summary: '', keyFacts: [] as string[] }; }
}

// ── Parse incoming body (form-urlencoded from Twilio or JSON) ───────────────
async function parseBody(req: Request): Promise<Record<string, string>> {
  const ct = req.headers.get('content-type') || '';
  if (ct.includes('application/x-www-form-urlencoded')) {
    const text = await req.text();
    const params = new URLSearchParams(text);
    const obj: Record<string, string> = {};
    for (const [k, v] of params.entries()) obj[k] = v;
    return obj;
  }
  if (ct.includes('application/json')) {
    try { return await req.json(); } catch { return {}; }
  }
  return {};
}

const xml = (body: string) =>
  new Response(body, { status: 200, headers: { 'Content-Type': 'text/xml' } });
const jsonResp = (body: object, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

// ── Route: voice-inbound ───────────────────────────────────────────────────────
async function handleVoiceInbound(query: URLSearchParams, body: Record<string, string>) {
  const digits    = String(body.Digits || query.get('Digits') || '').replace(/\D/g, '');
  const from      = String(body.From   || query.get('From')   || '');
  const ownerCell = (process.env.FIRM_OWNER_CELL || '').replace(/\D/g, '');
  const callerNum = from.replace(/\D/g, '');
  const isOwner   = !!(ownerCell && callerNum.endsWith(ownerCell.slice(-10)));

  if (digits === '9') {
    return xml(`<?xml version="1.0" encoding="UTF-8"?><Response><Redirect method="POST">${BASE}?action=dial-in-recorder</Redirect></Response>`);
  }
  if (digits) {
    return xml(`<?xml version="1.0" encoding="UTF-8"?><Response>
  <Say voice="Polly.Joanna">Please state your full name, best phone number, preferred callback time, and a brief description of your legal matter. Press pound when finished.</Say>
  <Record action="${BASE}?action=recording-complete" recordingStatusCallback="${BASE}?action=recording-complete" recordingStatusCallbackMethod="POST" maxLength="300" timeout="5" finishOnKey="#" playBeep="true"/>
  <Say voice="Polly.Joanna">Thank you. An attorney will follow up within one business day. Goodbye.</Say>
</Response>`);
  }
  const ownerOpt = isOwner ? '<Say voice="Polly.Joanna">Press 9 to use the outbound recorder.</Say>' : '';
  return xml(`<?xml version="1.0" encoding="UTF-8"?><Response>
  <Gather numDigits="1" action="${BASE}?action=voice-inbound" method="POST" timeout="8">
    <Say voice="Polly.Joanna">Thank you for calling CaseBuddy. Press 1 to leave a message for an attorney. ${ownerOpt}</Say>
  </Gather>
  <Redirect method="POST">${BASE}?action=intake-record</Redirect>
</Response>`);
}

// ── Route: intake-record ───────────────────────────────────────────────────────
async function handleIntakeRecord() {
  return xml(`<?xml version="1.0" encoding="UTF-8"?><Response>
  <Say voice="Polly.Joanna">After the tone, please state your full name, best phone number, preferred callback day and time, and a brief description of your legal matter. Press pound when finished.</Say>
  <Record action="${BASE}?action=recording-complete" recordingStatusCallback="${BASE}?action=recording-complete" recordingStatusCallbackMethod="POST" maxLength="300" timeout="5" finishOnKey="#" transcribe="true" transcribeCallback="${BASE}?action=recording-complete" playBeep="true"/>
  <Say voice="Polly.Joanna">Thank you. An attorney will review your message and reach out within one business day. Goodbye.</Say>
</Response>`);
}

// ── Route: dial-in-recorder ────────────────────────────────────────────────────
async function handleDialInRecorder(query: URLSearchParams, body: Record<string, string>) {
  const step   = String(body.step   || query.get('step')   || '1');
  const stored = String(body.stored || query.get('stored') || '').replace(/\D/g, '');
  const digits = String(body.Digits || query.get('Digits') || '').replace(/\D/g, '');
  const FROM   = process.env.TWILIO_CALLER_ID || process.env.TWILIO_PHONE_NUMBER || '';
  const SELF   = `${BASE}?action=dial-in-recorder`;

  if (step === 'dial' && stored) {
    const target = stored.startsWith('1') ? `+${stored}` : `+1${stored}`;
    return xml(`<?xml version="1.0" encoding="UTF-8"?><Response>
  <Say voice="Polly.Joanna">Connecting your call now. Recording will begin when the other party answers.</Say>
  <Dial callerId="${FROM}" record="record-from-answer-dual-channel" recordingStatusCallback="${BASE}?action=recording-complete" recordingStatusCallbackMethod="POST" recordingStatusCallbackEvent="completed" action="${xmlSafe(`${SELF}&step=done`)}" timeout="30">
    <Number>${target}</Number>
  </Dial>
</Response>`);
  }
  if (step === 'done') {
    return xml(`<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="Polly.Joanna">Your call has ended. The recording is being processed. Goodbye.</Say></Response>`);
  }
  if (step === '2' && digits.length >= 7) {
    const num = digits.slice(0, 10);
    const formatted = `${num.slice(0,3)}, ${num.slice(3,6)}, ${num.slice(6,10)}`;
    const dialUrl = xmlSafe(`${SELF}&step=dial&stored=${num}`);
    return xml(`<?xml version="1.0" encoding="UTF-8"?><Response>
  <Gather numDigits="1" action="${dialUrl}" method="POST" timeout="8">
    <Say voice="Polly.Joanna">Calling ${formatted}. Press 1 to connect. Press 2 to re-enter.</Say>
  </Gather>
  <Redirect method="POST">${dialUrl}</Redirect>
</Response>`);
  }
  return xml(`<?xml version="1.0" encoding="UTF-8"?><Response>
  <Gather action="${xmlSafe(`${SELF}&step=2`)}" method="POST" numDigits="10" timeout="15">
    <Say voice="Polly.Joanna">Enter the 10 digit number to call. Area code first. Do not press pound.</Say>
  </Gather>
  <Say voice="Polly.Joanna">No number entered. Goodbye.</Say>
</Response>`);
}

// ── Route: outbound-connect ────────────────────────────────────────────────────
async function handleOutboundConnect(query: URLSearchParams, body: Record<string, string>) {
  const to     = query.get('to') || '';
  const caseId = query.get('caseId') || '';
  const label  = query.get('label') || '';
  const digits = body.Digits || query.get('Digits') || '';

  if (digits) {
    const safeLabel = label ? `Connecting to ${decodeURIComponent(label)}.` : 'Connecting now.';
    return xml(`<?xml version="1.0" encoding="UTF-8"?><Response>
  <Say voice="Polly.Joanna">${safeLabel} This call is being recorded.</Say>
  <Dial record="record-from-answer-dual-channel" recordingStatusCallback="${BASE}?action=recording-complete" recordingStatusCallbackMethod="POST" recordingStatusCallbackEvent="completed" action="${BASE}?action=recording-complete" timeout="30">
    <Number statusCallbackEvent="answered completed" method="POST">${decodeURIComponent(to)}</Number>
  </Dial>
</Response>`);
  }
  return xml(`<?xml version="1.0" encoding="UTF-8"?><Response>
  <Gather numDigits="1" action="${BASE}?action=outbound-connect&to=${encodeURIComponent(to)}&caseId=${encodeURIComponent(caseId)}&label=${encodeURIComponent(label)}" method="POST" timeout="15">
    <Say voice="Polly.Joanna">CaseBuddy outbound call. This call will be recorded. Press any key to connect.</Say>
  </Gather>
  <Say voice="Polly.Joanna">No input received. Ending call.</Say>
</Response>`);
}

// ── Route: recording-complete ──────────────────────────────────────────────────
async function handleRecordingComplete(body: Record<string, string>) {
  const { RecordingUrl, RecordingSid, CallSid, RecordingStatus, RecordingDuration } = body;

  if (RecordingStatus && !RecordingUrl) {
    if (SB_URL && SB_KEY && RecordingSid) {
      await sbFetch(`call_recordings?recording_sid=eq.${RecordingSid}`, {
        method: 'PATCH', headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({ status: RecordingStatus }),
      });
    }
    return jsonResp({ ok: true });
  }
  if (!RecordingUrl) return jsonResp({ ok: true, skipped: true });

  const { transcript, summary, keyFacts } = await transcribeWithGemini(RecordingUrl, CallSid || RecordingSid);

  if (SB_URL && SB_KEY) {
    await sbFetch('call_recordings', {
      method: 'POST', headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({
        call_sid: CallSid, recording_sid: RecordingSid,
        recording_url: RecordingUrl, transcript, summary,
        key_facts: keyFacts, status: 'completed',
        duration: RecordingDuration ? parseInt(RecordingDuration) : null,
        created_at: new Date().toISOString(),
      }),
    });
  }

  if (SG_KEY && FIRM_EMAIL) {
    await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: { Authorization: `Bearer ${SG_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: FIRM_EMAIL }] }],
        from: { email: FIRM_EMAIL, name: 'CaseBuddy' },
        subject: `New Call Recording — ${new Date().toLocaleDateString()}`,
        content: [{ type: 'text/html', value: `<h2>New Call Recording</h2><p><strong>Summary:</strong> ${summary}</p><p><strong>Transcript:</strong> ${transcript}</p><p><a href="${RecordingUrl}.mp3">Download Recording</a></p>` }],
      }),
    });
  }
  return jsonResp({ ok: true });
}

// ── Main handler ───────────────────────────────────────────────────────────────
export default async function handler(req: Request): Promise<Response> {
  const url    = new URL(req.url);
  const action = url.searchParams.get('action') || 'voice-inbound';
  const body   = await parseBody(req);

  switch (action) {
    case 'voice-inbound':      return handleVoiceInbound(url.searchParams, body);
    case 'intake-record':      return handleIntakeRecord();
    case 'dial-in-recorder':   return handleDialInRecorder(url.searchParams, body);
    case 'outbound-connect':   return handleOutboundConnect(url.searchParams, body);
    case 'recording-complete': return handleRecordingComplete(body);
    default: return jsonResp({ error: `Unknown action: ${action}` }, 404);
  }
}

export const config = { path: "/api/twilio-voice" };
