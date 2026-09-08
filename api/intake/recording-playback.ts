import { AuthError, requireFirmMember, restrictiveCors } from '../_shared/auth';
import { intakeServiceClient } from './_shared';

export const config = { runtime: 'edge' };

const asString = (value: unknown, max = 1000): string =>
  typeof value === 'string' ? value.trim().slice(0, max) : '';

const json = (req: Request, body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...restrictiveCors(req), 'Content-Type': 'application/json; charset=utf-8' },
  });

async function audit(
  intakeId: string,
  firmId: string,
  userId: string,
  action: 'playback_granted' | 'playback_denied',
  detail = '',
) {
  const supabase = intakeServiceClient();
  try {
    await supabase.from('intake_recording_access_events').insert({
      intake_id: intakeId || null,
      firm_id: firmId || null,
      actor_user_id: userId || null,
      action,
      detail: detail.slice(0, 500) || null,
    });
  } catch {
    // Best effort only; playback authorization remains fail-closed independently.
  }
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: restrictiveCors(req) });
  if (req.method !== 'POST') return json(req, { error: 'Method not allowed' }, 405);

  let user;
  try {
    user = await requireFirmMember(req);
  } catch (error) {
    const status = error instanceof AuthError ? error.status : 401;
    return json(req, { error: error instanceof Error ? error.message : 'Unauthorized.' }, status);
  }

  let body: any;
  try { body = await req.json(); } catch { return json(req, { error: 'Invalid JSON body.' }, 400); }
  const intakeId = asString(body?.intakeId, 64);
  if (!intakeId) return json(req, { error: 'intakeId is required.' }, 400);

  const supabase = intakeServiceClient();
  const { data: intake, error } = await supabase
    .from('intake_cases')
    .select('id, firm_id, recording_path, recording_consent, recording_retention_until')
    .eq('id', intakeId)
    .eq('firm_id', user.firmId!)
    .maybeSingle();

  if (error || !intake?.recording_path || intake.recording_consent !== true) {
    await audit(intakeId, user.firmId!, user.userId, 'playback_denied', 'missing, foreign, or unconsented recording');
    return json(req, { error: 'Recording not available.' }, 404);
  }

  if (intake.recording_retention_until && Date.parse(intake.recording_retention_until) <= Date.now()) {
    await audit(intakeId, user.firmId!, user.userId, 'playback_denied', 'recording retention period expired');
    return json(req, { error: 'Recording retention period has expired.' }, 410);
  }

  const path = String(intake.recording_path);
  if (!path.startsWith(`${user.firmId}/${intakeId}/`) || path.includes('..')) {
    await audit(intakeId, user.firmId!, user.userId, 'playback_denied', 'recording path failed custody validation');
    return json(req, { error: 'Recording custody validation failed.' }, 403);
  }

  const { data, error: signError } = await supabase.storage
    .from('intake-recordings')
    .createSignedUrl(path, 60);
  if (signError || !data?.signedUrl) return json(req, { error: 'Could not authorize playback.' }, 503);

  await audit(intakeId, user.firmId!, user.userId, 'playback_granted');
  return json(req, {
    signedUrl: data.signedUrl,
    expiresIn: 60,
    purpose: 'intake_accuracy',
  });
}
