/**
 * Consolidated Admin + PACER Handler
 * Routes via ?action= parameter
 * Replaces: setup/run-migration, pacer/search
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';

// ── run-migration ─────────────────────────────────────────────────────────────

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

async function handleRunMigration(req: VercelRequest, res: VercelResponse) {
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


// ── pacer/search ──────────────────────────────────────────────────────────────
/**
 * Vercel Edge Function — PACER federal court records proxy.
 *
 * Requires PACER_USERNAME and PACER_PASSWORD in Vercel environment variables.
 * Register at https://pacer.uscourts.gov/register-account
 *
 * POST /api/pacer/search
 * Body: { query, court?, dateRange? }
 */

export const config = { runtime: 'edge' };

const CORS = {
  'Access-Control-Allow-Origin': 'https://casebuddy.live',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

const json = (body: object, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });

async function handlePacerSearch(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const username = process.env.PACER_USERNAME;
  const password = process.env.PACER_PASSWORD;

  if (!username || !password) {
    return json({
      error: 'PACER not configured.',
      instructions: 'Register at https://pacer.uscourts.gov/register-account and add PACER_USERNAME + PACER_PASSWORD to Vercel env vars.',
    }, 503);
  }

  let query: string;
  try {
    const body = await req.json();
    query = body.query;
    if (!query?.trim()) return json({ error: 'Missing required field: query' }, 400);
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  // PACER Case Locator API
  const params = new URLSearchParams({ case_search: query });
  try {
    const resp = await fetch('https://pcl.uscourts.gov/pcl/pages/search/results/cases.jsf', {
      method: 'GET',
      headers: {
        Authorization: `Basic ${btoa(`${username}:${password}`)}`,
        Accept: 'application/json',
      },
    });
    if (!resp.ok) return json({ error: `PACER returned ${resp.status}` }, resp.status);
    const data = await resp.json() as any;
    return json({ results: data });
  } catch (err: any) {
    return json({ error: 'Failed to reach PACER API.', detail: err?.message }, 502);
  }
}


// ── Router ────────────────────────────────────────────────────────────────────
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const action = String(req.query.action || 'pacer-search');
  switch (action) {
    case 'run-migration': return handleRunMigration(req, res);
    case 'pacer-search':  return handlePacerSearch(req as any) as any;
    default: res.status(404).json({ error: 'Unknown action: ' + action }); return;
  }
}
