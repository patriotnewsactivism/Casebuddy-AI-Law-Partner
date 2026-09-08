import { getSupabase } from './supabaseClient';

/**
 * Intake call recording.
 *
 * Captures both sides of a Maya intake call only after the prospect has made an
 * explicit recording choice in the public intake UI. Audio is stored in the
 * private `intake-recordings` bucket for the narrow purpose of intake accuracy.
 * The browser never receives general INSERT authority on that bucket: it asks a
 * server endpoint for an intake-scoped signed upload token after the intake row
 * exists.
 */

export const RECORDING_BUCKET = 'intake-recordings';

/** Ordered by preference; the first the browser supports wins. */
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

export interface IntakeRecording {
  blob: Blob;
  mimeType: string;
  seconds: number;
}

export interface IntakeRecorderHandle {
  /** False when the browser cannot record; the call still proceeds normally. */
  readonly active: boolean;
  stop: () => Promise<IntakeRecording | null>;
}

/**
 * Begin recording a mixed call stream. Never throws — a browser that cannot
 * record must not take the intake down with it, so failures return an inert
 * handle and the call continues without audio.
 */
export function startIntakeRecorder(stream: MediaStream): IntakeRecorderHandle {
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
    stop: () =>
      new Promise<IntakeRecording | null>(resolve => {
        if (recorder.state === 'inactive') {
          resolve(null);
          return;
        }
        recorder.addEventListener(
          'stop',
          () => {
            const blob = new Blob(chunks, { type: mimeType });
            resolve(
              blob.size > 0
                ? { blob, mimeType, seconds: Math.round((Date.now() - startedAt) / 1000) }
                : null,
            );
          },
          { once: true },
        );
        try {
          recorder.stop();
        } catch {
          resolve(null);
        }
      }),
  };
}

export interface UploadRecordingArgs {
  recording: IntakeRecording;
  intakeId: string;
  resumeToken: string;
  publicToken?: string;
  consent: boolean;
}

/**
 * Upload a finished recording through an intake-scoped signed upload token.
 * Returns the storage path to persist on the intake row, or null if storage is
 * unavailable. The intake itself is never lost because audio could not upload.
 */
export async function uploadIntakeRecording(
  args: UploadRecordingArgs,
): Promise<{ path: string; seconds: number } | null> {
  const supabase = getSupabase();
  if (!supabase || !args.consent) return null;

  const intakeId = args.intakeId.trim();
  const resumeToken = args.resumeToken.trim();
  if (!intakeId || resumeToken.length < 16) {
    console.warn('[intakeRecording] refusing upload without a valid intake session');
    return null;
  }

  let grantResponse: Response;
  try {
    grantResponse = await fetch('/api/intake/recording-upload', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(args.publicToken ? { 'X-Intake-Token': args.publicToken } : {}),
      },
      body: JSON.stringify({
        intakeId,
        resumeToken,
        publicToken: args.publicToken || undefined,
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
 * that the intake belongs to the caller's firm and records the access event.
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
