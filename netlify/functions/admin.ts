/**
 * Netlify Function — Admin + PACER handler.
 * Ported from api/admin.ts (VercelRequest/VercelResponse → Request/Response).
 *
 * GET/POST /api/admin?action=run-migration|pacer-search
 */

const SB_URL = process.env.SUPABASE_URL || '';
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': 'https://casebuddy.live',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

const jsonResp = (body: object, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

// ── run-migration ─────────────────────────────────────────────────────────────
async function handleRunMigration(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const secret = url.searchParams.get('secret') || req.headers.get('x-migration-secret') || '';
  if (secret !== process.env.CRON_SECRET) return jsonResp({ error: 'Unauthorized' }, 401);

  if (!SB_URL || !SB_KEY) return jsonResp({ error: 'Supabase not configured' }, 503);

  const results: string[] = [];

  const testTable = async (table: string) => {
    try {
      const r = await fetch(`${SB_URL}/rest/v1/${table}?limit=0`, {
        headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
      });
      results.push(r.ok ? `✓ ${table}: exists` : `✗ ${table}: missing`);
    } catch (e: any) {
      results.push(`✗ ${table}: ${e.message}`);
    }
  };

  await testTable('firm_emails');
  await testTable('agent_deadlines');
  await testTable('agent_cron_logs');

  return jsonResp({
    ok: true, results,
    note: 'For any missing tables, run the SQL from supabase/migrations/ in your Supabase Dashboard → SQL Editor',
    migrationFiles: ['supabase/migrations/0004_agent_infrastructure.sql', 'supabase/migrations/0005_firm_emails.sql'],
  });
}

// ── pacer-search ──────────────────────────────────────────────────────────────
async function handlePacerSearch(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'POST') return jsonResp({ error: 'Method not allowed' }, 405);

  const username = process.env.PACER_USERNAME;
  const password = process.env.PACER_PASSWORD;
  if (!username || !password) {
    return jsonResp({ error: 'PACER not configured.', instructions: 'Register at https://pacer.uscourts.gov/register-account and add PACER_USERNAME + PACER_PASSWORD to env vars.' }, 503);
  }

  let query: string;
  try {
    const body = await req.json() as any;
    query = body.query;
    if (!query?.trim()) return jsonResp({ error: 'Missing required field: query' }, 400);
  } catch { return jsonResp({ error: 'Invalid JSON body' }, 400); }

  try {
    const resp = await fetch('https://pcl.uscourts.gov/pcl/pages/search/results/cases.jsf', {
      method: 'GET',
      headers: { Authorization: `Basic ${btoa(`${username}:${password}`)}`, Accept: 'application/json' },
    });
    if (!resp.ok) return jsonResp({ error: `PACER returned ${resp.status}` }, resp.status);
    const data = await resp.json();
    return jsonResp({ results: data });
  } catch (err: any) {
    return jsonResp({ error: 'Failed to reach PACER API.', detail: err?.message }, 502);
  }
}

// ── Router ────────────────────────────────────────────────────────────────────
export default async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const action = url.searchParams.get('action') || 'pacer-search';
  switch (action) {
    case 'run-migration': return handleRunMigration(req);
    case 'pacer-search':  return handlePacerSearch(req);
    default: return jsonResp({ error: `Unknown action: ${action}` }, 404);
  }
}

export const config = { path: "/api/admin" };
