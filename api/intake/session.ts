import { clientIp, intakeCors, intakeServiceClient, json, resolveIntakeRoute, takeIntakeRateSlot } from './_shared';

export const config = { runtime: 'edge' };

const MAX_BODY_BYTES = 768 * 1024;
const COMPLETIONS = new Set(['partial', 'complete', 'abandoned']);

const asString = (value: unknown, max = 5000): string =>
  typeof value === 'string' ? value.trim().slice(0, max) : '';

const asObject = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};

const asArray = (value: unknown): unknown[] => Array.isArray(value) ? value : [];

function publicToken(req: Request, body: Record<string, unknown>): string | null {
  const header = asString(req.headers.get('X-Intake-Token'), 128);
  const fromBody = asString(body.publicToken, 128);
  if (header && fromBody && header !== fromBody) return '__mismatch__';
  return header || fromBody || null;
}

function buildInsertPayload(
  payload: Record<string, unknown>,
  firmId: string,
  resumeToken: string,
  completion: string,
  inviteId: string | null,
) {
  const intake = asObject(payload.intake);
  return {
    firm_id: firmId,
    resume_token: resumeToken,
    completion_state: completion,
    last_activity_at: new Date().toISOString(),
    full_name: asString(payload.full_name, 200) || 'Prospective Client',
    contact: asString(payload.contact, 500),
    matter_type: asString(payload.matter_type, 200) || 'General Inquiry',
    jurisdiction: asString(payload.jurisdiction, 300),
    summary: asString(payload.summary, 20_000),
    score: Math.max(0, Math.min(100, Number(payload.score) || 0)),
    disposition: asString(payload.disposition, 32) || 'review',
    status: asString(payload.status, 32) || 'new',
    urgency: asString(payload.urgency, 32) || 'medium',
    intake,
    score_detail: asObject(payload.score_detail),
    transcript: asArray(payload.transcript),
    extracted: asObject(payload.extracted),
    recording_consent: payload.recording_consent === true,
    recording_path: null,
    recording_seconds: 0,
    client_invite_id: inviteId,
  };
}

function buildUpdatePayload(
  payload: Record<string, unknown>,
  firmId: string,
  intakeId: string,
  completion: string,
  inviteId: string | null,
): Record<string, unknown> {
  const update: Record<string, unknown> = {
    completion_state: completion,
    last_activity_at: new Date().toISOString(),
  };

  const stringFields: Array<[string, number]> = [
    ['full_name', 200], ['contact', 500], ['matter_type', 200], ['jurisdiction', 300],
    ['summary', 20_000], ['disposition', 32], ['status', 32], ['urgency', 32],
  ];
  for (const [field, max] of stringFields) {
    if (field in payload) {
      const value = asString(payload[field], max);
      if (value) update[field] = value;
    }
  }

  if ('score' in payload) update.score = Math.max(0, Math.min(100, Number(payload.score) || 0));
  if ('intake' in payload) update.intake = asObject(payload.intake);
  if ('score_detail' in payload) update.score_detail = asObject(payload.score_detail);
  if ('transcript' in payload) update.transcript = asArray(payload.transcript);
  if ('extracted' in payload) update.extracted = asObject(payload.extracted);
  if ('recording_consent' in payload) update.recording_consent = payload.recording_consent === true;
  if (inviteId) update.client_invite_id = inviteId;

  if ('recording_seconds' in payload) {
    update.recording_seconds = Math.max(0, Math.min(24 * 60 * 60, Number(payload.recording_seconds) || 0));
  }

  const recordingPath = asString(payload.recording_path, 1000);
  if (recordingPath) {
    if (payload.recording_consent !== true) throw new Error('recording consent is required before attaching audio');
    const expectedPrefix = `${firmId}/${intakeId}/`;
    if (!recordingPath.startsWith(expectedPrefix) || recordingPath.includes('..')) {
      throw new Error('invalid recording path');
    }
    update.recording_path = recordingPath;
  }

  return update;
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: intakeCors(req) });
  if (req.method !== 'POST') return json(req, { error: 'Method not allowed' }, 405);

  const contentLength = Number(req.headers.get('content-length') || 0);
  if (contentLength > MAX_BODY_BYTES) return json(req, { error: 'Intake payload is too large.' }, 413);
  if (!takeIntakeRateSlot(`session:${clientIp(req)}`, 90)) {
    return json(req, { error: 'Too many intake updates. Please try again shortly.' }, 429);
  }

  let body: Record<string, unknown>;
  try {
    body = asObject(await req.json());
  } catch {
    return json(req, { error: 'Invalid JSON body.' }, 400);
  }

  const resumeToken = asString(body.resumeToken, 128);
  const completion = asString(body.completion, 32) || 'partial';
  const token = publicToken(req, body);
  if (token === '__mismatch__') return json(req, { error: 'Intake token mismatch.' }, 400);
  if (resumeToken.length < 16 || resumeToken.length > 128) return json(req, { error: 'Invalid resume token.' }, 400);
  if (!COMPLETIONS.has(completion)) return json(req, { error: 'Invalid completion state.' }, 400);

  let route;
  try {
    route = await resolveIntakeRoute(token);
  } catch {
    return json(req, { error: 'Intake routing is unavailable.' }, 503);
  }
  if (!route) return json(req, { error: 'A valid CaseBuddy intake link is required.' }, 401);

  const payload = asObject(body.payload);
  const supabase = intakeServiceClient();

  const { data: existing, error: lookupError } = await supabase
    .from('intake_cases')
    .select('id, firm_id, completion_state')
    .eq('resume_token', resumeToken)
    .maybeSingle();
  if (lookupError) return json(req, { error: 'Could not save intake progress.' }, 503);

  if (existing) {
    if (String(existing.firm_id) !== route.firmId) {
      return json(req, { error: 'This intake session belongs to a different receiving firm.' }, 403);
    }
    if (existing.completion_state === 'complete') return json(req, { intakeId: existing.id, immutable: true });

    let update;
    try {
      update = buildUpdatePayload(payload, route.firmId, String(existing.id), completion, route.inviteId);
    } catch (error) {
      return json(req, { error: error instanceof Error ? error.message : 'Invalid intake update.' }, 400);
    }
    const { error } = await supabase.from('intake_cases').update(update).eq('id', existing.id).eq('firm_id', route.firmId);
    if (error) return json(req, { error: 'Could not save intake progress.' }, 503);
    return json(req, { intakeId: existing.id });
  }

  if (asString(payload.recording_path, 1000)) {
    return json(req, { error: 'A recording cannot be attached before the intake session exists.' }, 400);
  }

  const insert = buildInsertPayload(payload, route.firmId, resumeToken, completion, route.inviteId);
  const { data, error } = await supabase.from('intake_cases').insert(insert).select('id').single();
  if (error || !data?.id) return json(req, { error: 'Could not create the intake session.' }, 503);
  return json(req, { intakeId: data.id }, 201);
}
