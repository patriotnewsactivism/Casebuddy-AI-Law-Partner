import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const RESOLVE_TIMEOUT_MS = 5_000;

function supabaseUrl(): string {
  return (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').trim();
}

function serviceRoleKey(): string {
  return (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
}

export function intakeServiceClient(): SupabaseClient {
  const url = supabaseUrl();
  const key = serviceRoleKey();
  if (!url || !key) throw new Error('Supabase server configuration is unavailable.');
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

export interface ResolvedIntakeRoute {
  firmId: string;
  inviteId: string | null;
  isClientInvite: boolean;
}

/**
 * Resolve the receiving firm on the server. A browser never gets to choose a
 * trusted firm_id. Tokenized links are authoritative; the generic /intake
 * route uses only server-held deployment configuration and otherwise fails
 * closed unless the database contains exactly one firm.
 */
export async function resolveIntakeRoute(publicToken?: string | null): Promise<ResolvedIntakeRoute | null> {
  const supabase = intakeServiceClient();
  const candidate = (publicToken || '').trim();

  if (candidate) {
    if (candidate.length < 5 || candidate.length > 128) return null;
    const { data, error } = await Promise.race([
      supabase.rpc('resolve_public_intake_token', { p_token: candidate }),
      new Promise<{ data: null; error: Error }>(resolve =>
        setTimeout(() => resolve({ data: null, error: new Error('token resolution timeout') }), RESOLVE_TIMEOUT_MS),
      ),
    ] as const);
    if (error) return null;
    const row = Array.isArray(data) ? data[0] : data;
    if (!row?.firm_id) return null;
    return {
      firmId: String(row.firm_id),
      inviteId: row.invite_id ? String(row.invite_id) : null,
      isClientInvite: Boolean(row.is_client_invite),
    };
  }

  const configured = (
    process.env.CASEBUDDY_CANONICAL_FIRM_ID ||
    process.env.VITE_FIRM_ID ||
    ''
  ).trim();
  if (configured) return { firmId: configured, inviteId: null, isClientInvite: false };

  const { data, error } = await supabase.from('firm_memberships').select('firm_id').limit(50);
  if (error || !data) return null;
  const firms = Array.from(new Set(data.map(row => String(row.firm_id || '').trim()).filter(Boolean)));
  return firms.length === 1
    ? { firmId: firms[0], inviteId: null, isClientInvite: false }
    : null;
}

export function intakeCors(req: Request, methods = 'POST, OPTIONS'): Record<string, string> {
  const configured = (process.env.ALLOWED_ORIGIN || 'https://casebuddy.live')
    .split(',')
    .map(value => value.trim())
    .filter(Boolean);
  const origin = (req.headers.get('origin') || '').trim();
  let ownOrigin = '';
  try { ownOrigin = new URL(req.url).origin; } catch { /* invalid URL */ }
  const allowed = origin && (origin === ownOrigin || configured.includes(origin))
    ? origin
    : configured[0];
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': methods,
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Intake-Token',
    'Cache-Control': 'no-store',
    Vary: 'Origin',
  };
}

export function json(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...intakeCors(req), 'Content-Type': 'application/json; charset=utf-8' },
  });
}

export function clientIp(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for') || '';
  return (forwarded.split(',')[0] || req.headers.get('x-real-ip') || 'unknown').trim();
}

const buckets = new Map<string, { count: number; resetAt: number }>();
export function takeIntakeRateSlot(key: string, limit: number, windowMs = 60_000): boolean {
  const now = Date.now();
  const existing = buckets.get(key);
  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (existing.count >= limit) return false;
  existing.count += 1;
  return true;
}
