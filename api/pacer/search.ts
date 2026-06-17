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

export default async function handler(req: Request): Promise<Response> {
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
