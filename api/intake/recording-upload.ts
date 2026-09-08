import { clientIp, intakeCors, intakeServiceClient, json, resolveIntakeRoute, takeIntakeRateSlot } from './_shared';

export const config = { runtime: 'edge' };

const MIME_TO_EXT: Record<string, string> = {
  'audio/webm;codecs=opus': 'webm',
  'audio/webm': 'webm',
  'audio/ogg;codecs=opus': 'ogg',
  'audio/ogg': 'ogg',
  'audio/mp4': 'm4a',
};

const asString = (value: unknown, max = 1000): string =>
  typeof value === 'string' ? value.trim().slice(0, max) : '';

export default async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: intakeCors(req) });
  if (req.method !== 'POST') return json(req, { error: 'Method not allowed' }, 405);
  if (!takeIntakeRateSlot(`recording-upload:${clientIp(req)}`, 12)) {
    return json(req, { error: 'Too many recording upload requests. Please try again shortly.' }, 429);
  }

  let body: any;
  try { body = await req.json(); } catch { return json(req, { error: 'Invalid JSON body.' }, 400); }

  const resumeToken = asString(body?.resumeToken, 128);
  const intakeId = asString(body?.intakeId, 64);
  const intakeToken = asString(req.headers.get('X-Intake-Token') || body?.publicToken, 128) || null;
  const mimeType = asString(body?.mimeType, 100).toLowerCase();
  const consent = body?.consent === true;

  if (!consent) return json(req, { error: 'Recording consent is required.' }, 403);
  if (resumeToken.length < 16 || !intakeId) return json(req, { error: 'Invalid intake session.' }, 400);
  const ext = MIME_TO_EXT[mimeType];
  if (!ext) return json(req, { error: 'Unsupported recording format.' }, 415);

  let route;
  try { route = await resolveIntakeRoute(intakeToken); }
  catch { return json(req, { error: 'Intake routing is unavailable.' }, 503); }
  if (!route) return json(req, { error: 'A valid CaseBuddy intake link is required.' }, 401);

  const supabase = intakeServiceClient();
  const { data: intake, error: intakeError } = await supabase
    .from('intake_cases')
    .select('id, firm_id, resume_token, completion_state')
    .eq('id', intakeId)
    .eq('resume_token', resumeToken)
    .maybeSingle();

  if (intakeError) return json(req, { error: 'Could not verify the intake session.' }, 503);
  if (!intake || String(intake.firm_id) !== route.firmId) {
    return json(req, { error: 'Recording upload is not authorized for this intake.' }, 403);
  }

  const path = `${route.firmId}/${intakeId}/${crypto.randomUUID()}.${ext}`;
  const { data, error } = await supabase.storage
    .from('intake-recordings')
    .createSignedUploadUrl(path, { upsert: false });

  if (error || !data?.token) {
    return json(req, { error: 'Could not authorize private recording storage.' }, 503);
  }

  return json(req, {
    bucket: 'intake-recordings',
    path,
    token: data.token,
    purpose: 'intake_accuracy',
  });
}
