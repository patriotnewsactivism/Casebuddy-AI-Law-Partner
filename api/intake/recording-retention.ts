import { intakeServiceClient } from './_shared';

export const config = { runtime: 'edge' };

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });

function authorized(req: Request): boolean {
  const secret = (process.env.CRON_SECRET || '').trim();
  if (!secret) return false;
  const presented = (req.headers.get('authorization') || '').trim();
  return presented === `Bearer ${secret}`;
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'GET' && req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  if (!authorized(req)) return json({ error: 'Unauthorized' }, 401);

  const supabase = intakeServiceClient();
  const now = new Date().toISOString();
  const { data: rows, error } = await supabase
    .from('intake_cases')
    .select('id, firm_id, recording_path')
    .not('recording_path', 'is', null)
    .is('recording_deleted_at', null)
    .lte('recording_retention_until', now)
    .limit(100);

  if (error) return json({ error: 'Could not load expired recordings.' }, 503);
  if (!rows?.length) return json({ purged: 0 });

  let purged = 0;
  const failures: string[] = [];

  for (const row of rows) {
    const intakeId = String(row.id || '');
    const firmId = String(row.firm_id || '');
    const path = String(row.recording_path || '');
    if (!intakeId || !firmId || !path.startsWith(`${firmId}/${intakeId}/`) || path.includes('..')) {
      failures.push(intakeId || 'unknown');
      continue;
    }

    const { error: removeError } = await supabase.storage.from('intake-recordings').remove([path]);
    if (removeError) {
      failures.push(intakeId);
      continue;
    }

    const { error: updateError } = await supabase
      .from('intake_cases')
      .update({
        recording_path: null,
        recording_seconds: 0,
        recording_deleted_at: now,
      })
      .eq('id', intakeId)
      .eq('firm_id', firmId);

    if (updateError) {
      failures.push(intakeId);
      continue;
    }

    await supabase.from('intake_recording_access_events').insert({
      intake_id: intakeId,
      firm_id: firmId,
      actor_user_id: null,
      action: 'purged',
      detail: 'Automatic retention purge',
    });
    purged += 1;
  }

  return json({ purged, failures: failures.length, remainingBatch: rows.length === 100 });
}
