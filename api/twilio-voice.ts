import type { VercelRequest, VercelResponse } from '@vercel/node';

// ── Shared helpers ─────────────────────────────────────────────────────────────
const SB_URL  = process.env.SUPABASE_URL              || '';
const SB_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const GEMINI_KEY = process.env.GEMINI_API_KEY         || '';
const TWILIO_SID  = process.env.TWILIO_ACCOUNT_SID    || '';
const TWILIO_AUTH = process.env.TWILIO_AUTH_TOKEN     || '';
const FIRM_EMAIL  = process.env.FIRM_OWNER_EMAIL      || '';
const SG_KEY      = process.env.SENDGRID_API_KEY      || '';
const BASE = 'https://casebuddy.live/api/twilio-voice';

function xmlSafe(url: string): string {
  return url.replace(/&/g, '&amp;');
}

async function sbFetch(path: string, opts: RequestInit = {}) {
  return fetch(`${SB_URL}/rest/v1/${path}`, {
    ...opts,
    headers: {
      apikey: SB_KEY,
      Authorization: `Bearer ${SB_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      ...(opts.headers || {}),
    },
  });
}

async function transcribeWithGemini(audioUrl: string, callSid: string): Promise<{ transcript: string; summary: string; keyFacts: string[] }> {
  if (!GEMINI_KEY) return { transcript: '[Gemini not configured]', summary: '', keyFacts: [] };
  try {
    const audioRes = await fetch(audioUrl + '.mp3', {
      headers: { Authorization: 'Basic ' + Buffer.from(`${TWILIO_SID}:${TWILIO_AUTH}`).toString('base64') },
    });
    if (!audioRes.ok) return { transcript: '[Audio fetch failed]', summary: '', keyFacts: [] };
    const audioBuffer = await audioRes.arrayBuffer();
    const base64Audio = Buffer.from(audioBuffer).toString('base64');
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
  } catch { return { transcript: '[Transcription failed]', summary: '', keyFacts: [] }; }
}

// ── Route: action=voice-inbound ────────────────────────────────────────────────
async function handleVoiceInbound(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Content-Type', 'text/xml');
  const body   = req.body  || {};
  const query  = req.query || {};
  const digits = String(body.Digits || query.Digits || '').replace(/\D/g, '');
  const from   = String(body.From   || query.From   || '');
  const ownerCell = (process.env.FIRM_OWNER_CELL || '').replace(/\D/g, '');
  const callerNum = from.replace(/\D/g, '');
  const isOwner   = ownerCell && callerNum.endsWith(ownerCell.slice(-10));

  if (digits === '9') {
    return res.status(200).send(`<?xml version="1.0" encoding="UTF-8"?><Response><Redirect method="POST">${BASE}?action=dial-in-recorder</Redirect></Response>`);
  }
  if (digits) {
    return res.status(200).send(`<?xml version="1.0" encoding="UTF-8"?><Response>
  <Say voice="Polly.Joanna">Please state your full name, best phone number, preferred callback time, and a brief description of your legal matter. Press pound when finished.</Say>
  <Record action="${BASE}?action=recording-complete" recordingStatusCallback="${BASE}?action=recording-complete" recordingStatusCallbackMethod="POST" maxLength="300" timeout="5" finishOnKey="#" playBeep="true"/>
  <Say voice="Polly.Joanna">Thank you. An attorney will follow up within one business day. Goodbye.</Say>
</Response>`);
  }
  // Initial menu
  const ownerOpt = isOwner ? '<Say voice="Polly.Joanna">Press 9 to use the outbound recorder.</Say>' : '';
  return res.status(200).send(`<?xml version="1.0" encoding="UTF-8"?><Response>
  <Gather numDigits="1" action="${BASE}?action=voice-inbound" method="POST" timeout="8">
    <Say voice="Polly.Joanna">Thank you for calling CaseBuddy. Press 1 to leave a message for an attorney. ${ownerOpt}</Say>
  </Gather>
  <Redirect method="POST">${BASE}?action=intake-record</Redirect>
</Response>`);
}

// ── Route: action=intake-record ────────────────────────────────────────────────
async function handleIntakeRecord(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Content-Type', 'text/xml');
  return res.status(200).send(`<?xml version="1.0" encoding="UTF-8"?><Response>
  <Say voice="Polly.Joanna">After the tone, please state your full name, best phone number, preferred callback day and time, and a brief description of your legal matter. Press pound when finished.</Say>
  <Record action="${BASE}?action=recording-complete" recordingStatusCallback="${BASE}?action=recording-complete" recordingStatusCallbackMethod="POST" maxLength="300" timeout="5" finishOnKey="#" transcribe="true" transcribeCallback="${BASE}?action=recording-complete" playBeep="true"/>
  <Say voice="Polly.Joanna">Thank you. An attorney will review your message and reach out within one business day. Goodbye.</Say>
</Response>`);
}

// ── Route: action=dial-in-recorder ─────────────────────────────────────────────
async function handleDialInRecorder(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Content-Type', 'text/xml');
  const body    = req.body  || {};
  const query   = req.query || {};
  const step    = String(body.step    || query.step    || '1');
  const stored  = String(body.stored  || query.stored  || '').replace(/\D/g, '');
  const digits  = String(body.Digits  || query.Digits  || '').replace(/\D/g, '');
  const FROM    = process.env.TWILIO_CALLER_ID || process.env.TWILIO_PHONE_NUMBER || '';
  const SELF    = `${BASE}?action=dial-in-recorder`;

  if (step === 'dial' && stored) {
    const target = stored.startsWith('1') ? `+${stored}` : `+1${stored}`;
    return res.status(200).send(`<?xml version="1.0" encoding="UTF-8"?><Response>
  <Say voice="Polly.Joanna">Connecting your call now. Recording will begin when the other party answers.</Say>
  <Dial callerId="${FROM}" record="record-from-answer-dual-channel" recordingStatusCallback="${BASE}?action=recording-complete" recordingStatusCallbackMethod="POST" recordingStatusCallbackEvent="completed" action="${xmlSafe(`${SELF}&step=done`)}" timeout="30">
    <Number>${target}</Number>
  </Dial>
</Response>`);
  }
  if (step === 'done') {
    return res.status(200).send(`<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="Polly.Joanna">Your call has ended. The recording is being processed. Goodbye.</Say></Response>`);
  }
  if (step === '2' && digits.length >= 7) {
    const num = digits.slice(0, 10);
    const formatted = `${num.slice(0,3)}, ${num.slice(3,6)}, ${num.slice(6,10)}`;
    const dialUrl = xmlSafe(`${SELF}&step=dial&stored=${num}`);
    return res.status(200).send(`<?xml version="1.0" encoding="UTF-8"?><Response>
  <Gather numDigits="1" action="${dialUrl}" method="POST" timeout="8">
    <Say voice="Polly.Joanna">Calling ${formatted}. Press 1 to connect. Press 2 to re-enter.</Say>
  </Gather>
  <Redirect method="POST">${dialUrl}</Redirect>
</Response>`);
  }
  return res.status(200).send(`<?xml version="1.0" encoding="UTF-8"?><Response>
  <Gather action="${xmlSafe(`${SELF}&step=2`)}" method="POST" numDigits="10" timeout="15">
    <Say voice="Polly.Joanna">Enter the 10 digit number to call. Area code first. Do not press pound.</Say>
  </Gather>
  <Say voice="Polly.Joanna">No number entered. Goodbye.</Say>
</Response>`);
}

// ── Route: action=outbound-connect ─────────────────────────────────────────────
async function handleOutboundConnect(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Content-Type', 'text/xml');
  const { to, caseId, label } = req.query as any;
  const digits = req.body?.Digits || req.query?.Digits || '';
  if (digits) {
    const safeLabel = label ? `Connecting to ${decodeURIComponent(label)}.` : 'Connecting now.';
    return res.status(200).send(`<?xml version="1.0" encoding="UTF-8"?><Response>
  <Say voice="Polly.Joanna">${safeLabel} This call is being recorded.</Say>
  <Dial record="record-from-answer-dual-channel" recordingStatusCallback="${BASE}?action=recording-complete" recordingStatusCallbackMethod="POST" recordingStatusCallbackEvent="completed" action="${BASE}?action=recording-complete" timeout="30">
    <Number statusCallbackEvent="answered completed" method="POST">${decodeURIComponent(to)}</Number>
  </Dial>
</Response>`);
  }
  return res.status(200).send(`<?xml version="1.0" encoding="UTF-8"?><Response>
  <Gather numDigits="1" action="${BASE}?action=outbound-connect&to=${encodeURIComponent(to)}&caseId=${encodeURIComponent(caseId||'')}&label=${encodeURIComponent(label||'')}" method="POST" timeout="15">
    <Say voice="Polly.Joanna">CaseBuddy outbound call. This call will be recorded. Press any key to connect.</Say>
  </Gather>
  <Say voice="Polly.Joanna">No input received. Ending call.</Say>
</Response>`);
}

// ── Route: action=recording-complete ──────────────────────────────────────────
async function handleRecordingComplete(req: VercelRequest, res: VercelResponse) {
  const body = req.body || {};
  const { RecordingUrl, RecordingSid, CallSid, RecordingStatus, RecordingDuration } = body;

  // Status update only
  if (RecordingStatus && !RecordingUrl) {
    if (SB_URL && SB_KEY && RecordingSid) {
      await sbFetch(`call_recordings?recording_sid=eq.${RecordingSid}`, {
        method: 'PATCH',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({ status: RecordingStatus }),
      });
    }
    return res.status(200).json({ ok: true });
  }

  if (!RecordingUrl) return res.status(200).json({ ok: true, skipped: true });

  const { transcript, summary, keyFacts } = await transcribeWithGemini(RecordingUrl, CallSid || RecordingSid);

  // Save to Supabase
  if (SB_URL && SB_KEY) {
    await sbFetch('call_recordings', {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({
        call_sid: CallSid, recording_sid: RecordingSid,
        recording_url: RecordingUrl, transcript, summary,
        key_facts: keyFacts, status: 'completed',
        duration: RecordingDuration ? parseInt(RecordingDuration) : null,
        created_at: new Date().toISOString(),
      }),
    });
  }

  // Email attorney
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
  return res.status(200).json({ ok: true });
}

// ── Main router ────────────────────────────────────────────────────────────────
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const action = String(req.query.action || req.body?.action || 'voice-inbound');
  switch (action) {
    case 'voice-inbound':      return handleVoiceInbound(req, res);
    case 'intake-record':      return handleIntakeRecord(req, res);
    case 'dial-in-recorder':   return handleDialInRecorder(req, res);
    case 'outbound-connect':   return handleOutboundConnect(req, res);
    case 'recording-complete': return handleRecordingComplete(req, res);
    default: return res.status(404).json({ error: `Unknown action: ${action}` });
  }
}
