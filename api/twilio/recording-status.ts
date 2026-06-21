import type { VercelRequest, VercelResponse } from '@vercel/node';

const SB_URL = process.env.SUPABASE_URL              || '';
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { RecordingSid, RecordingStatus, RecordingDuration } = req.body as any;
  console.log(`[recording-status] ${RecordingSid} → ${RecordingStatus} (${RecordingDuration}s)`);

  // Update status in Supabase if record exists
  if (SB_URL && SB_KEY && RecordingSid) {
    await fetch(`${SB_URL}/rest/v1/call_recordings?recording_sid=eq.${RecordingSid}`, {
      method: 'PATCH',
      headers: {
        apikey: SB_KEY,
        Authorization: `Bearer ${SB_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({ status: RecordingStatus }),
    });
  }

  return res.status(200).json({ ok: true });
}
