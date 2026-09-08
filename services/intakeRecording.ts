import { getSupabase } from './supabaseClient';

/**
 * Intake call recording.
 *
 * Captures both sides of a Maya intake call only after the prospect affirmatively
 * consents. Audio is stored in the private `intake-recordings` bucket solely to
 * preserve intake accuracy. The browser never receives general INSERT authority
 * on that bucket; it receives an intake-scoped signed upload token instead.
 */

export const RECORDING_BUCKET = 'intake-recordings';

const CANDIDATE_TYPES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/ogg;codecs=opus',
  'audio/mp4',
];

function pickMimeType(): string | null {
  if (typeof MediaRecorder === 'undefined') return null;
  for (const type of CANDIDATE_TYPES) {
    try {
      if (MediaRecorder.isTypeSupported(type)) return type;
    } catch { /* older browsers throw instead of returning false */ }
  }
  return null;
}

function currentIntakeToken(): string {
  if (typeof window === 'undefined') return '';
  try {
    const match = window.location.pathname.match(/^\/intake\/([^/]+)\/?$/i);
    return match?.[1] ? decodeURIComponent(match[1]).trim() : '';
  } catch {
    return '';
  }
}

function currentResumeToken(): string {
  if (typeof window === 'undefined') return '';
  try { return sessionStorage.getItem('casebuddy_intake_resume') || ''; }
  catch { return ''; }
}

/**
 * Explicit pre-capture consent. The mixed stream exists at this point, but the
 * MediaRecorder has not started and the voice WebSocket is not open yet, so no
 * call audio has been captured when this choice is presented.
 *
 * Declining sends the prospect to the non-recorded secure chat intake instead
 * of silently recording or forcing them to abandon the intake.
 */
function obtainRecordingConsent(): boolean {
  if (typeof window === 'undefined') return false;
  let consent = false;
  try {
    consent = window.confirm(
      'For intake accuracy, may CaseBuddy privately record this Maya voice consultation? ' +
      'The recording is used only to verify what was said, is not public, and is subject to the firm’s retention policy.\n\n' +
      'Choose OK to consent to recording. Choose Cancel to continue with the secure text intake without audio recording.'
    );
  } catch {
    consent = false;
  }

  try {
    if (consent) {
      sessionStorage.setItem('casebuddy_intake_recording_consent', new Date().toISOString());
    } else {
      sessionStorage.removeItem('casebuddy_intake_recording_consent');
      const next = new URL(window.location.href);
      next.searchParams.set('mode', 'chat');
      setTimeout(() => window.location.replace(next.toString()), 0);
    }
  } catch { /* private mode / navigation edge case */ }

  return consent;
}

export interface IntakeRecording {
  blob: Blob;
  mimeType: string;
  seconds: number;
}

export interface IntakeRecorderHandle {
  readonly active: boolean;
  stop: () => Promise<IntakeRecording | null>;
}

export function startIntakeRecorder(stream: MediaStream): IntakeRecorderHandle {
  if (!obtainRecordingConsent()) {
    return { active: false, stop: async () => null };
  }

  const mimeType = pickMimeType();
  if (!mimeType) {
    console.warn('[intakeRecording] MediaRecorder unavailable — continuing without audio');
    return { active: false, stop: async () => null };
  }

  let recorder: MediaRecorder;
  try {
    recorder = new MediaRecorder(stream, { mimeType, audioBitsPerSecond: 64_000 });
  } catch (err) {
    console.warn('[intakeRecording] could not start recorder:', err);
    return { active: false, stop: async () => null };
  }

  const chunks: Blob[] = [];
  const startedAt = Date.now();
  recorder.addEventListener('dataavailable', event => {
    if (event.data && event.data.size > 0) chunks.push(event.data);
  });

  try {
    recorder.start(5_000);
  } catch (err) {
    console.warn('[intakeRecording] recorder refused to start:', err);
    return { active: false, stop: async () => null };
  }

  return {
    active: true,
    stop: () => new Promise<IntakeRecording | null>(resolve => {
      if (recorder.state === 'inactive') {
        resolve(null);
        return;
      }
      recorder.addEventListener('stop', () => {
        const blob = new Blob(chunks, { type: mimeType });
        resolve(
          blob.size > 0
            ? { blob, mimeType, seconds: Math.round((Date.now() - startedAt) / 1000) }
            : null,
        );
      }, { once: true });
      try { recorder.stop(); } catch { resolve(null); }
    }),
  };
}

export interface UploadRecordingArgs {
  recording: IntakeRecording;
  intakeId: string;
  /** Legacy field retained for call-site compatibility; server ignores it. */
  firmId?: string;
  resumeToken?: string;
  publicToken?: string;
  consent?: boolean;
}

/**
 * Upload a finished recording through an intake-scoped signed upload token.
 * The receiving firm comes from the referral token/server configuration, never
 * from the browser-provided firmId.
 */
export async function uploadIntakeRecording(
  args: UploadRecordingArgs,
): Promise<{ path: string; seconds: number } | null> {
  const supabase = getSupabase();
  if (!supabase) return null;

  const intakeId = args.intakeId.trim();
  const resumeToken = (args.resumeToken || currentResumeToken()).trim();
  const publicToken = (args.publicToken || currentIntakeToken()).trim();
  const consent = args.consent ?? Boolean(
    typeof window !== 'undefined' && (() => {
      try { return sessionStorage.getItem('casebuddy_intake_recording_consent'); }
      catch { return ''; }
    })()
  );

  if (!consent || !intakeId || resumeToken.length < 16) {
    console.warn('[intakeRecording] refusing upload without consent and a valid intake session');
    return null;
  }

  let grantResponse: Response;
  try {
    grantResponse = await fetch('/api/intake/recording-upload', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(publicToken ? { 'X-Intake-Token': publicToken } : {}),
      },
      body: JSON.stringify({
        intakeId,
        resumeToken,
        publicToken: publicToken || undefined,
        mimeType: args.recording.mimeType,
        consent: true,
      }),
    });
  } catch (error) {
    console.warn('[intakeRecording] upload authorization failed:', error);
    return null;
  }

  if (!grantResponse.ok) {
    const message = await grantResponse.json().catch(() => ({})) as any;
    console.warn('[intakeRecording] upload authorization refused:', message?.error || grantResponse.status);
    return null;
  }

  const grant = await grantResponse.json().catch(() => null) as any;
  if (!grant?.path || !grant?.token || grant?.bucket !== RECORDING_BUCKET) return null;

  const { error } = await supabase.storage
    .from(RECORDING_BUCKET)
    .uploadToSignedUrl(grant.path, grant.token, args.recording.blob, {
      contentType: args.recording.mimeType,
      upsert: false,
    });

  if (error) {
    console.warn('[intakeRecording] signed upload failed:', error.message);
    return null;
  }
  return { path: grant.path, seconds: args.recording.seconds };
}

/**
 * Request a 60-second, staff-authenticated playback URL. The server verifies
 * firm ownership and records the access event before issuing the URL.
 */
export async function getRecordingPlaybackUrl(intakeId: string): Promise<string | null> {
  const supabase = getSupabase();
  if (!supabase || !intakeId) return null;
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) return null;

  try {
    const response = await fetch('/api/intake/recording-playback', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ intakeId }),
    });
    if (!response.ok) return null;
    const data = await response.json() as any;
    return typeof data?.signedUrl === 'string' ? data.signedUrl : null;
  } catch {
    return null;
  }
}
