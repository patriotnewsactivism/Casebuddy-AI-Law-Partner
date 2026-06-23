
/**
 * Integration service stubs for third-party APIs.
 * Each integration checks for its API key and throws a descriptive error if not configured.
 * Drop the key into .env.local and the call will go live.
 */

const getEnv = (key: string): string => {
  const val = (import.meta as any).env?.[key] || (window as any).__ENV?.[key] || '';
  return val;
};

const requireKey = (envKey: string, serviceName: string): string => {
  const key = getEnv(envKey);
  if (!key) throw new Error(`${serviceName} is not configured. Add ${envKey} to your .env.local file.`);
  return key;
};

// ─── CourtListener (free — real case law) ───────────────────────────────────

export const searchCaseLaw = async (query: string, court?: string): Promise<any[]> => {
  const key = requireKey('VITE_COURTLISTENER_API_KEY', 'CourtListener');
  const params = new URLSearchParams({ q: query, format: 'json', ...(court ? { court } : {}) });
  const res = await fetch(`https://www.courtlistener.com/api/rest/v3/search/?${params}`, {
    headers: { Authorization: `Token ${key}` },
  });
  if (!res.ok) throw new Error(`CourtListener error: ${res.status}`);
  const data = await res.json();
  return data.results ?? [];
};

// ─── Stripe (billing) ────────────────────────────────────────────────────────

export const createCheckoutSession = async (priceId: string, successUrl: string, cancelUrl: string): Promise<{ url: string }> => {
  requireKey('VITE_STRIPE_PUBLISHABLE_KEY', 'Stripe');
  // This must be proxied through a backend endpoint that uses STRIPE_SECRET_KEY
  const res = await fetch('/api/stripe/create-checkout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ priceId, successUrl, cancelUrl }),
  });
  if (!res.ok) throw new Error('Stripe checkout session creation failed');
  return res.json();
};

// ─── Twilio (SMS alerts) ──────────────────────────────────────────────────────

export const sendSmsAlert = async (to: string, message: string): Promise<void> => {
  requireKey('VITE_TWILIO_ACCOUNT_SID', 'Twilio');
  // Must proxy through backend — Twilio credentials cannot be exposed client-side
  const res = await fetch('/api/twilio/send-sms', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ to, message }),
  });
  if (!res.ok) throw new Error('SMS send failed');
};

export const scheduleDeadlineAlert = async (deadline: { title: string; date: string; phone: string }): Promise<void> => {
  const message = `⚖️ CaseBuddy Reminder: "${deadline.title}" is due ${deadline.date}. Log in to review.`;
  await sendSmsAlert(deadline.phone, message);
};

// ─── DocuSign (e-signatures) ─────────────────────────────────────────────────

export const createSignatureEnvelope = async (documentBase64: string, signerEmail: string, signerName: string, documentName: string): Promise<{ envelopeId: string; signingUrl: string }> => {
  requireKey('VITE_DOCUSIGN_INTEGRATION_KEY', 'DocuSign');
  const res = await fetch('/api/docusign/create-envelope', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ documentBase64, signerEmail, signerName, documentName }),
  });
  if (!res.ok) throw new Error('DocuSign envelope creation failed');
  return res.json();
};

export const getEnvelopeStatus = async (envelopeId: string): Promise<{ status: string; completedAt?: string }> => {
  requireKey('VITE_DOCUSIGN_INTEGRATION_KEY', 'DocuSign');
  const res = await fetch(`/api/docusign/envelope/${envelopeId}/status`);
  if (!res.ok) throw new Error('Failed to get envelope status');
  return res.json();
};

// ─── Deepgram (voice transcription) ─────────────────────────────────────────

export const transcribeWithDeeepgram = async (audioBlob: Blob, fileName?: string): Promise<string> => {
  const key = requireKey('VITE_DEEPGRAM_API_KEY', 'Deepgram');

  // Detect media type — Deepgram supports audio AND video natively (mp4, mov, avi, mkv, etc.)
  const ext = (fileName || '').split('.').pop()?.toLowerCase() || '';
  const mimeMap: Record<string, string> = {
    mp4: 'video/mp4', mov: 'video/quicktime', avi: 'video/x-msvideo',
    mkv: 'video/x-matroska', wmv: 'video/x-ms-wmv', webm: 'video/webm',
    mp3: 'audio/mpeg', wav: 'audio/wav', m4a: 'audio/mp4',
    ogg: 'audio/ogg', flac: 'audio/flac', aac: 'audio/aac',
  };
  const contentType = mimeMap[ext] || audioBlob.type || 'audio/webm';

  // Use nova-2 for audio, nova-2 for video — both supported by Deepgram
  // diarize=true labels speakers (great for depositions/calls)
  // smart_format=true adds paragraphs and punctuation
  const params = new URLSearchParams({
    model: 'nova-2',
    punctuate: 'true',
    diarize: 'true',
    smart_format: 'true',
  });

  const res = await fetch(`https://api.deepgram.com/v1/listen?${params}`, {
    method: 'POST',
    headers: {
      Authorization: `Token ${key}`,
      'Content-Type': contentType,
    },
    body: audioBlob,
  });

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`Deepgram error ${res.status}: ${errBody}`);
  }

  const data = await res.json();

  // If diarization is on, stitch transcript with speaker labels
  const words = data?.results?.channels?.[0]?.alternatives?.[0]?.words;
  if (words && words.length > 0 && words[0]?.speaker !== undefined) {
    let transcript = '';
    let currentSpeaker = -1;
    for (const w of words) {
      if (w.speaker !== currentSpeaker) {
        currentSpeaker = w.speaker;
        transcript += `\n[Speaker ${currentSpeaker + 1}]: `;
      }
      transcript += w.punctuated_word ?? w.word;
      transcript += ' ';
    }
    return transcript.trim();
  }

  return data?.results?.channels?.[0]?.alternatives?.[0]?.transcript ?? '';
};

export const startDeepgramLiveSession = (onTranscript: (text: string) => void): { stop: () => void } => {
  const key = requireKey('VITE_DEEPGRAM_API_KEY', 'Deepgram');
  const ws = new WebSocket(`wss://api.deepgram.com/v1/listen?model=nova-2&punctuate=true&interim_results=true`, ['token', key]);

  let mediaRecorder: MediaRecorder | null = null;

  navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
    mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
    mediaRecorder.ondataavailable = e => ws.readyState === WebSocket.OPEN && ws.send(e.data);
    mediaRecorder.start(250);
  });

  ws.onmessage = e => {
    const msg = JSON.parse(e.data);
    const transcript = msg?.channel?.alternatives?.[0]?.transcript ?? '';
    if (transcript && msg.is_final) onTranscript(transcript);
  };

  return {
    stop: () => {
      mediaRecorder?.stop();
      ws.close();
    },
  };
};


// ─── Video audio extraction (via /api/media/extract-audio) ──────────────────

/**
 * Sends a video file to the Vercel edge function, which uses ffmpeg WASM
 * to strip the audio track and return an MP3 blob.
 * The resulting MP3 is small (16kHz mono, 64kbps) — ideal for Whisper/Deepgram.
 */
export const extractAudioFromVideo = async (videoFile: File): Promise<File> => {
  const formData = new FormData();
  formData.append('file', videoFile, videoFile.name);

  const res = await fetch('/api/media/extract-audio', {
    method: 'POST',
    body: formData,
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Audio extraction failed: ${err}`);
  }

  const blob = await res.blob();
  const outputName = videoFile.name.replace(/\.[^.]+$/, '') + '_audio.mp3';
  return new File([blob], outputName, { type: 'audio/mpeg' });
};

// ─── Email (SendGrid primary, Resend fallback — via /api/email/send) ──────────
// The provider API keys are server-side only. Each message is sent FROM an AI
// employee's firm address (firstname@casebuddy.live) and silently archived to
// the partner's inbox by the backend.

import { agentIdentity, FIRM_ARCHIVE_BCC } from '../agents/firmEmail';

export interface SendEmailOptions {
  to: string | string[];
  subject: string;
  html: string;
  /** Which AI employee sends it (e.g. "sierra", "maya"); defaults to the firm. */
  fromAgentId?: string;
  cc?: string | string[];
  bcc?: string | string[];
  replyTo?: string;
}

export const sendEmail = async (opts: SendEmailOptions): Promise<{ provider: string }> => {
  const from = agentIdentity(opts.fromAgentId);
  const res = await fetch('/api/email/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
      fromEmail: from.email,
      fromName: from.name,
      cc: opts.cc,
      bcc: opts.bcc,
      replyTo: opts.replyTo,
    }),
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => ({} as any));
    throw new Error(detail.error || 'Email send failed');
  }
  return res.json();
};

const emailShell = (title: string, bodyHtml: string, footer: string): string => `
  <div style="font-family: Georgia, serif; max-width: 620px; margin: 0 auto; color: #1a1a1a; line-height: 1.6;">
    <h2 style="color: #333; border-bottom: 2px solid #c9a84c; padding-bottom: 8px;">${title}</h2>
    ${bodyHtml}
    <hr style="margin-top: 32px; border-color: #eee;" />
    <p style="font-size: 11px; color: #999;">${footer}</p>
  </div>`;

export const sendCaseUpdateEmail = async (clientEmail: string, clientName: string, caseTitle: string, letterContent: string): Promise<void> => {
  const html = emailShell(
    `Case Update — ${caseTitle}`,
    `<pre style="font-family: Georgia, serif; white-space: pre-wrap; font-size: 14px;">${letterContent}</pre>`,
    'Sent via CaseBuddy Law · This communication is attorney-client privileged and confidential.'
  );
  // Goes out as Sierra, the firm's client-relations secretary.
  await sendEmail({ to: clientEmail, subject: `Case Update: ${caseTitle}`, html, fromAgentId: 'sierra' });
};

/**
 * Internal firm email — one AI employee writing to another (and/or the firm
 * line). Used by the orchestration layer so the staff hand work off on the
 * record. The partner is always BCC'd by the backend.
 */
export const sendFirmEmail = async (opts: {
  fromAgentId: string;
  toAgentIds?: string[];          // resolved to firm addresses
  toEmails?: string[];            // or explicit addresses
  subject: string;
  bodyHtml: string;
  footer?: string;
}): Promise<{ provider: string }> => {
  const to = [
    ...(opts.toAgentIds || []).map(id => agentIdentity(id).email),
    ...(opts.toEmails || []),
  ];
  const html = emailShell(
    opts.subject,
    opts.bodyHtml,
    opts.footer || `Internal correspondence · CaseBuddy Law · Archived to ${FIRM_ARCHIVE_BCC}`
  );
  return sendEmail({ to, subject: opts.subject, html, fromAgentId: opts.fromAgentId });
};

// ─── Cal.com (booking) ────────────────────────────────────────────────────────

export const createBooking = async (eventTypeId: number, start: string, name: string, email: string, notes?: string): Promise<{ uid: string; meetingUrl?: string }> => {
  const key = requireKey('VITE_CALCOM_API_KEY', 'Cal.com');
  const res = await fetch('https://api.cal.com/v1/bookings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({ eventTypeId, start, attendees: [{ name, email }], notes }),
  });
  if (!res.ok) throw new Error('Cal.com booking failed');
  return res.json();
};

export const getAvailability = async (username: string, eventTypeSlug: string, dateFrom: string, dateTo: string): Promise<any[]> => {
  const key = requireKey('VITE_CALCOM_API_KEY', 'Cal.com');
  const params = new URLSearchParams({ username, eventTypeSlug, dateFrom, dateTo });
  const res = await fetch(`https://api.cal.com/v1/slots?${params}`, {
    headers: { Authorization: `Bearer ${key}` },
  });
  if (!res.ok) throw new Error('Failed to fetch availability');
  const data = await res.json();
  return data.slots ?? [];
};

// ─── Lob (certified physical mail) ───────────────────────────────────────────

export const sendCertifiedMail = async (opts: {
  toName: string; toAddress: string; toCity: string; toState: string; toZip: string;
  fromName: string; fromAddress: string; fromCity: string; fromState: string; fromZip: string;
  content: string; description: string;
}): Promise<{ id: string; trackingNumber: string }> => {
  requireKey('VITE_LOB_API_KEY', 'Lob');
  const res = await fetch('/api/lob/send-letter', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(opts),
  });
  if (!res.ok) throw new Error('Lob mail send failed');
  return res.json();
};

// ─── Google Maps / Places (courthouse finder) ─────────────────────────────────

export const findNearbyCourthouses = async (location: string): Promise<{ name: string; address: string; placeId: string }[]> => {
  const key = requireKey('VITE_GOOGLE_MAPS_KEY', 'Google Maps');
  const params = new URLSearchParams({ input: `${location} courthouse`, inputtype: 'textquery', fields: 'name,formatted_address,place_id', key });
  const res = await fetch(`https://maps.googleapis.com/maps/api/place/findplacefromtext/json?${params}`);
  if (!res.ok) throw new Error('Google Maps request failed');
  const data = await res.json();
  return (data.candidates ?? []).map((c: any) => ({ name: c.name, address: c.formatted_address, placeId: c.place_id }));
};

// ─── PACER (federal court records) ───────────────────────────────────────────

export const searchPacer = async (query: string, courtId?: string): Promise<any[]> => {
  requireKey('VITE_PACER_USERNAME', 'PACER');
  // PACER requires backend proxy — cannot be called directly from browser
  const res = await fetch('/api/pacer/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, courtId }),
  });
  if (!res.ok) throw new Error('PACER search failed');
  return res.json();
};

// ─── Tyler Technologies e-filing ─────────────────────────────────────────────

export const eFileDocument = async (courtId: string, caseNumber: string, documentBase64: string, filingType: string): Promise<{ filingId: string; status: string }> => {
  requireKey('VITE_TYLER_API_KEY', 'Tyler Technologies');
  const res = await fetch('/api/tyler/efile', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ courtId, caseNumber, documentBase64, filingType }),
  });
  if (!res.ok) throw new Error('E-filing failed');
  return res.json();
};

// ─── Integration status check ─────────────────────────────────────────────────

export interface IntegrationStatus {
  id: string;
  name: string;
  envKey: string;
  configured: boolean;
  description: string;
  signupUrl: string;
  category: 'research' | 'billing' | 'communication' | 'filing' | 'tools';
}

export const INTEGRATIONS: IntegrationStatus[] = [
  { id: 'courtlistener', name: 'CourtListener', envKey: 'VITE_COURTLISTENER_API_KEY', configured: false, description: 'Real case law, opinions, PACER dockets, citations. Free tier available.', signupUrl: 'https://www.courtlistener.com/register/', category: 'research' },
  { id: 'pacer', name: 'PACER', envKey: 'VITE_PACER_USERNAME', configured: false, description: 'Federal court case lookup, docket retrieval, document access.', signupUrl: 'https://pacer.uscourts.gov/register-account', category: 'research' },
  { id: 'stripe', name: 'Stripe', envKey: 'VITE_STRIPE_PUBLISHABLE_KEY', configured: false, description: 'Client billing, subscription management, invoicing.', signupUrl: 'https://stripe.com', category: 'billing' },
  { id: 'twilio', name: 'Twilio SMS', envKey: 'VITE_TWILIO_ACCOUNT_SID', configured: false, description: 'SMS deadline alerts 48hr, 24hr, 2hr before court dates.', signupUrl: 'https://twilio.com', category: 'communication' },
  { id: 'docusign', name: 'DocuSign', envKey: 'VITE_DOCUSIGN_INTEGRATION_KEY', configured: false, description: 'E-signatures on demand letters, retainers, settlement agreements.', signupUrl: 'https://developers.docusign.com', category: 'tools' },
  { id: 'deepgram', name: 'Deepgram', envKey: 'VITE_DEEPGRAM_API_KEY', configured: false, description: 'Live transcription with speaker diarization for depositions and hearings.', signupUrl: 'https://deepgram.com', category: 'tools' },
  { id: 'sendgrid', name: 'SendGrid', envKey: 'VITE_SENDGRID_API_KEY', configured: false, description: 'Transactional email for client updates, intake summaries, deadline alerts.', signupUrl: 'https://sendgrid.com', category: 'communication' },
  { id: 'calcom', name: 'Cal.com', envKey: 'VITE_CALCOM_API_KEY', configured: false, description: 'Client consultation booking directly from the app.', signupUrl: 'https://cal.com', category: 'tools' },
  { id: 'lob', name: 'Lob', envKey: 'VITE_LOB_API_KEY', configured: false, description: 'Certified physical mail for demand letters and legal notices with delivery proof.', signupUrl: 'https://lob.com', category: 'communication' },
  { id: 'tyler', name: 'Tyler Technologies', envKey: 'VITE_TYLER_API_KEY', configured: false, description: 'Direct e-filing to participating courts without leaving CaseBuddy.', signupUrl: 'https://www.tylertech.com', category: 'filing' },
  { id: 'westlaw', name: 'Westlaw / Casetext', envKey: 'VITE_WESTLAW_API_KEY', configured: false, description: 'Premium legal research with AI-assisted analysis. Law Firm plan only.', signupUrl: 'https://casetext.com', category: 'research' },
  { id: 'googlemaps', name: 'Google Maps', envKey: 'VITE_GOOGLE_MAPS_KEY', configured: false, description: 'Courthouse locator, process servers, court reporters near any address.', signupUrl: 'https://cloud.google.com/maps-platform/', category: 'tools' },
];

export const getIntegrationStatuses = (): IntegrationStatus[] =>
  INTEGRATIONS.map(integration => ({
    ...integration,
    configured: !!getEnv(integration.envKey),
  }));
