import { getSupabase } from './supabaseClient';

/**
 * Intake call recording.
 *
 * Captures both sides of a Maya intake call and stores the audio in the private
 * `intake-recordings` bucket. Recording is consent-gated at the call site: this
 * module records only what it is handed, and the caller is told the call is
 * recorded before capture begins.
 *
 * Object paths are `<firm_id>/<intake_id>/<timestamp>.<ext>` because the
 * bucket's read policy scopes on the first path segment
 * (`storage.foldername(name))[1] = get_user_firm_id()`). Changing the path
 * shape without changing that policy would expose one firm's audio to another.
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

function extensionFor(mimeType: string): string {
  if (mimeType.includes('ogg')) return 'ogg';
  if (mimeType.includes('mp4')) return 'm4a';
  return 'webm';
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

  // A timeslice means a crashed or force-closed tab still leaves whole chunks
  // behind rather than one unflushed buffer.
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
  firmId: string;
  intakeId: string;
}

/**
 * Upload a finished recording. Returns the storage path to persist on the
 * intake row, or null if the upload failed — the intake itself is never lost
 * because audio could not be stored.
 */
export async function uploadIntakeRecording(
  args: UploadRecordingArgs,
): Promise<{ path: string; seconds: number } | null> {
  const supabase = getSupabase();
  if (!supabase) return null;

  const firmId = args.firmId.trim();
  const intakeId = args.intakeId.trim();
  if (!firmId || !intakeId) {
    console.warn('[intakeRecording] refusing to upload without both firm and intake id');
    return null;
  }

  const ext = extensionFor(args.recording.mimeType);
  const path = `${firmId}/${intakeId}/${Date.now()}.${ext}`;

  const { error } = await supabase.storage
    .from(RECORDING_BUCKET)
    .upload(path, args.recording.blob, {
      contentType: args.recording.mimeType,
      upsert: false,
    });

  if (error) {
    console.warn('[intakeRecording] upload failed:', error.message);
    return null;
  }
  return { path, seconds: args.recording.seconds };
}

/**
 * Short-lived signed URL for firm staff to play a recording back. The bucket is
 * private; never swap this for a public URL.
 */
export async function getRecordingPlaybackUrl(
  path: string,
  expiresInSeconds = 600,
): Promise<string | null> {
  const supabase = getSupabase();
  if (!supabase || !path) return null;
  const { data, error } = await supabase.storage
    .from(RECORDING_BUCKET)
    .createSignedUrl(path, expiresInSeconds);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}
