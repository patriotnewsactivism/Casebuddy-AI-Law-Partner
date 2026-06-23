/**
 * Vercel Cron — Health Check
 * Schedule: every 15 minutes
 *
 * Validates that critical env vars are set and Supabase is reachable.
 * Returns structured JSON so external monitors (UptimeRobot, Better Uptime,
 * etc.) can alert when things break.
 *
 * GET /api/cron/health
 */

export const config = { runtime: 'edge' };

interface CheckResult {
  name: string;
  ok: boolean;
  detail?: string;
}

const json = (body: object, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'GET') return json({ error: 'Method not allowed' }, 405);

  const checks: CheckResult[] = [];

  // 1. Required env vars
  const required = [
    'GEMINI_API_KEY',
    'SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
  ];
  for (const key of required) {
    checks.push({
      name: `env:${key}`,
      ok: !!process.env[key],
      detail: process.env[key] ? 'set' : 'MISSING',
    });
  }

  // 2. Optional but important env vars
  const optional = [
    'CRON_SECRET',
    'RESEND_API_KEY',
    'FIRM_OWNER_EMAIL',
    'DEEPGRAM_API_KEY',
  ];
  for (const key of optional) {
    checks.push({
      name: `env:${key}`,
      ok: !!process.env[key],
      detail: process.env[key] ? 'set' : 'not set (optional)',
    });
  }

  // 3. Supabase connectivity
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (supabaseUrl && supabaseKey) {
    try {
      const resp = await fetch(`${supabaseUrl}/rest/v1/intake_cases?select=id&limit=1`, {
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
        },
      });
      checks.push({
        name: 'supabase:intake_cases',
        ok: resp.ok,
        detail: resp.ok ? `reachable (${resp.status})` : `error (${resp.status})`,
      });
    } catch (err: any) {
      checks.push({
        name: 'supabase:intake_cases',
        ok: false,
        detail: `unreachable: ${err?.message}`,
      });
    }
  }

  // 4. Gemini API reachability
  const geminiKey = process.env.GEMINI_API_KEY;
  if (geminiKey) {
    try {
      const resp = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${geminiKey}`,
      );
      checks.push({
        name: 'gemini:api',
        ok: resp.ok,
        detail: resp.ok ? 'reachable' : `error (${resp.status})`,
      });
    } catch (err: any) {
      checks.push({
        name: 'gemini:api',
        ok: false,
        detail: `unreachable: ${err?.message}`,
      });
    }
  }

  const allOk = checks.every(c => c.ok || c.detail?.includes('optional'));
  const criticalFail = checks.filter(c => !c.ok && !c.detail?.includes('optional'));

  return json(
    {
      status: allOk ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      checks,
      ...(criticalFail.length > 0 && {
        critical_failures: criticalFail.map(c => c.name),
      }),
    },
    allOk ? 200 : 503,
  );
}
