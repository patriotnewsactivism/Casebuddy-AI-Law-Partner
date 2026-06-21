import type { VercelRequest, VercelResponse } from '@vercel/node';

const SB_URL  = process.env.SUPABASE_URL              || '';
const SB_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const GEMINI_KEY = process.env.GEMINI_API_KEY         || '';
const TWILIO_SID  = process.env.TWILIO_ACCOUNT_SID    || '';
const TWILIO_AUTH = process.env.TWILIO_AUTH_TOKEN     || '';
const FIRM_EMAIL  = process.env.FIRM_OWNER_EMAIL      || '';
const SG_KEY      = process.env.SENDGRID_API_KEY      || '';

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
    // Fetch the recording audio from Twilio (requires auth)
    const audioRes = await fetch(audioUrl + '.mp3', {
      headers: {
        Authorization: 'Basic ' + Buffer.from(`${TWILIO_SID}:${TWILIO_AUTH}`).toString('base64'),
      },
    });

    if (!audioRes.ok) {
      console.error('[recording] Could not fetch audio:', await audioRes.text());
      return { transcript: '[Audio fetch failed]', summary: '', keyFacts: [] };
    }

    const audioBuffer = await audioRes.arrayBuffer();
    const base64Audio = Buffer.from(audioBuffer).toString('base64');

    // Use Gemini to transcribe + analyze
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              {
                inline_data: {
                  mime_type: 'audio/mp3',
                  data: base64Audio,
                },
              },
              {
                text: `You are a legal evidence analyst at CaseBuddy AI Law.

Transcribe this call recording verbatim. Then provide:
1. A concise summary (2-3 sentences) of what was discussed
2. Key facts and admissions (bullet points) that could be relevant as legal evidence

Format your response as JSON:
{
  "transcript": "full verbatim transcript here...",
  "summary": "2-3 sentence summary...",
  "keyFacts": ["fact 1", "fact 2", "..."]
}`,
              },
            ],
          }],
          generationConfig: { temperature: 0.2, maxOutputTokens: 4000 },
        }),
      }
    );

    const geminiData = await geminiRes.json() as any;
    const rawText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || '';

    // Parse JSON from response
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        transcript: parsed.transcript || rawText,
        summary: parsed.summary || '',
        keyFacts: parsed.keyFacts || [],
      };
    }

    return { transcript: rawText, summary: '', keyFacts: [] };
  } catch (err: any) {
    console.error('[recording] Gemini transcription error:', err.message);
    return { transcript: '[Transcription failed]', summary: err.message, keyFacts: [] };
  }
}

async function notifyFirm(record: any) {
  if (!SG_KEY || !FIRM_EMAIL) return;
  const keyFactsHtml = record.key_facts?.length
    ? '<ul>' + record.key_facts.map((f: string) => `<li>${f}</li>`).join('') + '</ul>'
    : '<p>None identified</p>';

  await fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: { Authorization: `Bearer ${SG_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: FIRM_EMAIL }] }],
      from: { email: 'lex@casebuddy.live', name: 'Lex · CaseBuddy AI Law' },
      subject: `📞 New Call Recording — ${record.from_number} (${record.duration}s)`,
      content: [{
        type: 'text/html',
        value: `<div style="font-family:Arial,sans-serif;max-width:600px;color:#1e293b">
          <div style="background:#0f172a;padding:16px 24px;border-radius:8px 8px 0 0">
            <span style="color:#f59e0b;font-size:18px">⚖️</span>
            <span style="color:#f8fafc;font-weight:600;font-size:15px;margin-left:8px">CaseBuddy AI Law — Call Recording</span>
          </div>
          <div style="padding:24px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 8px 8px">
            <table style="width:100%;font-size:14px;margin-bottom:16px">
              <tr><td style="color:#64748b;padding:4px 0">From:</td><td><strong>${record.from_number}</strong></td></tr>
              <tr><td style="color:#64748b;padding:4px 0">To:</td><td>${record.to_number}</td></tr>
              <tr><td style="color:#64748b;padding:4px 0">Duration:</td><td>${record.duration} seconds</td></tr>
              <tr><td style="color:#64748b;padding:4px 0">Date:</td><td>${new Date(record.created_at).toLocaleString()}</td></tr>
              <tr><td style="color:#64748b;padding:4px 0">Recording:</td><td><a href="${record.recording_url}" style="color:#f59e0b">Download MP3</a></td></tr>
            </table>
            <h3 style="color:#0f172a;margin:16px 0 8px">Summary</h3>
            <p style="color:#475569">${record.summary || 'No summary available'}</p>
            <h3 style="color:#0f172a;margin:16px 0 8px">Key Facts / Admissions</h3>
            ${keyFactsHtml}
            <h3 style="color:#0f172a;margin:16px 0 8px">Full Transcript</h3>
            <pre style="background:#f8fafc;padding:16px;border-radius:8px;font-size:12px;white-space:pre-wrap;color:#334155">${record.transcript || 'Transcript pending...'}</pre>
            <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0">
            <p style="color:#94a3b8;font-size:12px">Call SID: ${record.call_sid} · CaseBuddy AI Law</p>
          </div>
        </div>`,
      }],
    }),
  });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).end();

  const {
    CallSid, RecordingSid, RecordingUrl, RecordingDuration,
    From, To, RecordingStatus,
  } = req.body as any;

  console.log(`[recording-complete] CallSid=${CallSid} RecordingSid=${RecordingSid} Status=${RecordingStatus} Duration=${RecordingDuration}s`);

  if (RecordingStatus && RecordingStatus !== 'completed') {
    return res.status(200).send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
  }

  try {
    // Transcribe + analyze with Gemini
    const { transcript, summary, keyFacts } = await transcribeWithGemini(RecordingUrl, CallSid);

    // Save to Supabase
    const record = {
      call_sid: CallSid,
      recording_sid: RecordingSid,
      recording_url: RecordingUrl + '.mp3',
      duration: parseInt(RecordingDuration || '0', 10),
      from_number: From,
      to_number: To,
      transcript,
      summary,
      key_facts: keyFacts,
      status: 'completed',
      created_at: new Date().toISOString(),
    };

    if (SB_URL && SB_KEY) {
      await sbFetch('call_recordings', {
        method: 'POST',
        body: JSON.stringify(record),
      });
    }

    // Email the firm owner with the full report
    await notifyFirm(record);

    res.setHeader('Content-Type', 'text/xml');
    return res.status(200).send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
  } catch (err: any) {
    console.error('[recording-complete]', err);
    res.setHeader('Content-Type', 'text/xml');
    return res.status(200).send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
  }
}
