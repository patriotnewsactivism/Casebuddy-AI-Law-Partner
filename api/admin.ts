/**
 * Consolidated Admin + PACER Handler
 * Routes via ?action= parameter
 * Replaces: setup/run-migration, pacer/search
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireFirmMember, AuthError } from './_shared/auth';

// ── run-migration (diagnostic: reports table existence only, never runs DDL) ──
//
// NOTE: this used to embed a copy of the firm_emails CREATE TABLE/RLS SQL as a
// string constant "for reference," including the original wide-open
// `USING (true) WITH CHECK (true)` policy + `GRANT ALL ... TO anon`. That
// policy was intentionally closed by migration 0009_strict_attorney_client_rls
// (firm-scoped RLS, anon revoked). The constant was never executed by this
// handler, but it was dangerous copy-paste bait — anyone "helpfully" running
// it from the Supabase dashboard would have reopened a firm-wide-anonymous
// hole in firm_emails. Removed; the real, current source of truth is
// supabase/migrations/0009_strict_attorney_client_rls.sql.

const SB_URL = process.env.SUPABASE_URL || '';
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

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

  const checkTable = async (table: string) => {
    try {
      const testRes = await fetch(`${SB_URL}/rest/v1/${table}?limit=0`, {
        headers: {
          apikey: SB_KEY,
          Authorization: `Bearer ${SB_KEY}`,
        },
      });
      if (testRes.ok) {
        results.push(`✓ ${table}: table already exists`);
        return true;
      }
      results.push(`✗ ${table}: table missing — run the migration SQL in Supabase Dashboard`);
      return false;
    } catch (e: any) {
      results.push(`✗ ${table}: ${e.message}`);
      return false;
    }
  };

  await checkTable('firm_emails');

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

  // PACER charges the firm's account per search — must never be reachable
  // by an unauthenticated caller.
  try {
    await requireFirmMember(req);
  } catch (err) {
    const status = err instanceof AuthError ? err.status : 401;
    return json({ error: err instanceof Error ? err.message : 'Unauthorized' }, status);
  }

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
