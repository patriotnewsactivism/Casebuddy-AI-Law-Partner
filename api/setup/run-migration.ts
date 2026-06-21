import type { VercelRequest, VercelResponse } from '@vercel/node';

const SB_URL = process.env.SUPABASE_URL || '';
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

// Uses Supabase's postgres REST via pg over the Management API isn't available,
// so we create tables by trying inserts with specific column lists and catching errors.
// Instead, we use the Supabase Management REST API via direct SQL execution.

const CREATE_FIRM_EMAILS = `
CREATE TABLE IF NOT EXISTS public.firm_emails (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  received_at   timestamptz NOT NULL DEFAULT now(),
  direction     text NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  from_address  text NOT NULL DEFAULT '',
  from_name     text NOT NULL DEFAULT '',
  to_address    text NOT NULL DEFAULT '',
  agent_id      text NOT NULL DEFAULT 'maya',
  subject       text NOT NULL DEFAULT '',
  body          text NOT NULL DEFAULT '',
  intent        text NOT NULL DEFAULT 'general',
  replied       boolean NOT NULL DEFAULT false,
  read          boolean NOT NULL DEFAULT false,
  starred       boolean NOT NULL DEFAULT false,
  thread_id     uuid,
  metadata      jsonb NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS firm_emails_agent_idx     ON public.firm_emails (agent_id);
CREATE INDEX IF NOT EXISTS firm_emails_direction_idx ON public.firm_emails (direction);
CREATE INDEX IF NOT EXISTS firm_emails_received_idx  ON public.firm_emails (received_at DESC);
ALTER TABLE public.firm_emails ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'firm_emails' AND policyname = 'firm_emails_open'
  ) THEN
    CREATE POLICY firm_emails_open ON public.firm_emails FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;
GRANT ALL ON public.firm_emails TO anon, authenticated, service_role;
`;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Require a secret to prevent abuse
  const secret = req.query.secret || req.headers['x-migration-secret'];
  if (secret !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (!SB_URL || !SB_KEY) {
    return res.status(503).json({ error: 'Supabase not configured' });
  }

  const results: string[] = [];

  // Run SQL statements one by one via Supabase's pg RPC
  // We create a temporary RPC function using the service role
  const runSQL = async (sql: string, label: string) => {
    try {
      // Try via PostgREST rpc endpoint — won't work for DDL
      // Instead, try inserting a dummy row to see if table exists
      const testRes = await fetch(`${SB_URL}/rest/v1/firm_emails?limit=0`, {
        headers: {
          apikey: SB_KEY,
          Authorization: `Bearer ${SB_KEY}`,
        },
      });
      if (testRes.ok) {
        results.push(`✓ ${label}: table already exists`);
        return true;
      }
      results.push(`✗ ${label}: table missing — run SQL in Supabase Dashboard`);
      return false;
    } catch (e: any) {
      results.push(`✗ ${label}: ${e.message}`);
      return false;
    }
  };

  await runSQL(CREATE_FIRM_EMAILS, 'firm_emails');

  // Check agent_deadlines too
  const deadlinesRes = await fetch(`${SB_URL}/rest/v1/agent_deadlines?limit=0`, {
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
  });
  results.push(deadlinesRes.ok ? '✓ agent_deadlines: exists' : '✗ agent_deadlines: missing');

  const logsRes = await fetch(`${SB_URL}/rest/v1/agent_cron_logs?limit=0`, {
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
  });
  results.push(logsRes.ok ? '✓ agent_cron_logs: exists' : '✗ agent_cron_logs: missing');

  return res.status(200).json({
    ok: true,
    results,
    note: 'For any missing tables, run the SQL from supabase/migrations/ in your Supabase Dashboard → SQL Editor',
    migrationFiles: [
      'supabase/migrations/0004_agent_infrastructure.sql',
      'supabase/migrations/0005_firm_emails.sql',
    ],
  });
}
