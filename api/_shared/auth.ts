/**
 * Shared server-side authentication/authorization helpers for Vercel Edge
 * functions under /api. Centralizes Supabase session verification and firm
 * membership resolution so every privileged route uses the same checks
 * instead of re-implementing (or forgetting) them.
 *
 * Never exposes SUPABASE_SERVICE_ROLE_KEY or any provider secret to a caller.
 */

const AUTH_TIMEOUT_MS = 5_000;

function supabaseUrl(): string {
  return (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').trim();
}

function supabaseAnonKey(): string {
  return (process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '').trim();
}

function serviceRoleKey(): string {
  return (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
}

export interface AuthedUser {
  userId: string;
  email: string | null;
  firmId: string | null;
}

export class AuthError extends Error {
  status: number;
  constructor(message: string, status = 401) {
    super(message);
    this.status = status;
  }
}

/**
 * Verifies a Supabase bearer token against GoTrue and resolves the caller's
 * firm_id via firm_memberships (service-role read — never trust a firm_id
 * supplied by the client itself).
 */
export async function requireFirmAuth(req: Request): Promise<AuthedUser> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    throw new AuthError('Unauthorized. Sign in first.', 401);
  }

  const url = supabaseUrl();
  const anonKey = supabaseAnonKey();
  if (!url || !anonKey) {
    throw new AuthError('Authentication service unavailable.', 503);
  }

  const sessionToken = authHeader.slice(7).trim();
  let userId: string;
  let email: string | null = null;
  try {
    const userResp = await fetch(`${url}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${sessionToken}`, apikey: anonKey },
      signal: AbortSignal.timeout(AUTH_TIMEOUT_MS),
    });
    if (!userResp.ok) throw new AuthError('Invalid or expired session. Please sign in again.', 401);
    const user = await userResp.json();
    if (!user?.id) throw new AuthError('Invalid session.', 401);
    userId = user.id;
    email = user.email ?? null;
  } catch (err) {
    if (err instanceof AuthError) throw err;
    throw new AuthError('Could not verify authentication.', 503);
  }

  const svcKey = serviceRoleKey();
  let firmId: string | null = null;
  if (svcKey) {
    try {
      const membershipResp = await fetch(
        `${url}/rest/v1/firm_memberships?user_id=eq.${encodeURIComponent(userId)}&select=firm_id&limit=1`,
        {
          headers: { apikey: svcKey, Authorization: `Bearer ${svcKey}` },
          signal: AbortSignal.timeout(AUTH_TIMEOUT_MS),
        }
      );
      if (membershipResp.ok) {
        const rows = await membershipResp.json();
        firmId = rows?.[0]?.firm_id ?? null;
      }
    } catch {
      // Firm lookup failure degrades to firmId: null — callers that require
      // firm scoping must check for it explicitly rather than assume access.
    }
  }

  return { userId, email, firmId };
}

/** Same as requireFirmAuth, but also rejects callers with no firm membership. */
export async function requireFirmMember(req: Request): Promise<AuthedUser> {
  const user = await requireFirmAuth(req);
  if (!user.firmId) throw new AuthError('No firm membership found for this account.', 403);
  return user;
}

/**
 * Authorizes either (a) a signed-in firm member, or (b) a trusted internal
 * server-to-server caller presenting the dedicated secret in `headerName`
 * (e.g. a Postgres-trigger webhook composing a system email before the new
 * user has a firm membership yet). Internal callers never get a firmId —
 * callers must not use one to bypass firm-scoped authorization checks.
 *
 * Each caller of this function must use its OWN dedicated secret env var —
 * never reuse CRON_SECRET or another endpoint's secret for a different
 * trust boundary.
 */
export async function requireFirmMemberOrInternalSecret(
  req: Request,
  envVarName: string,
  headerName = 'x-internal-secret'
): Promise<AuthedUser & { isInternal: boolean }> {
  const configuredSecret = (process.env[envVarName] || '').trim();
  const presented = req.headers.get(headerName) || '';
  if (configuredSecret && presented && presented === configuredSecret) {
    return { userId: 'system', email: null, firmId: null, isInternal: true };
  }
  const user = await requireFirmMember(req);
  return { ...user, isInternal: false };
}

/**
 * Confirms a case/matter id belongs to the given firm before a privileged
 * action is allowed to reference it. Returns false (never throws) so callers
 * decide whether a missing/foreign case should be a hard failure.
 */
export async function caseBelongsToFirm(caseId: string, firmId: string): Promise<boolean> {
  const url = supabaseUrl();
  const svcKey = serviceRoleKey();
  if (!url || !svcKey || !caseId) return false;
  try {
    const resp = await fetch(
      `${url}/rest/v1/cases?id=eq.${encodeURIComponent(caseId)}&select=id,firm_id&limit=1`,
      {
        headers: { apikey: svcKey, Authorization: `Bearer ${svcKey}` },
        signal: AbortSignal.timeout(AUTH_TIMEOUT_MS),
      }
    );
    if (!resp.ok) return false;
    const rows = await resp.json();
    return rows?.[0]?.firm_id === firmId;
  } catch {
    return false;
  }
}

/** Restrictive CORS: only the configured origin(s), never '*'. */
export function restrictiveCors(req: Request, methods = 'POST, OPTIONS'): Record<string, string> {
  const configured = (process.env.ALLOWED_ORIGIN || 'https://casebuddy.live')
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
  const origin = req.headers.get('origin') || '';
  const allowedOrigin = configured.includes(origin) ? origin : configured[0];
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Methods': methods,
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Cache-Control': 'no-store',
    Vary: 'Origin',
  };
}

/**
 * Best-effort, non-blocking audit event write. Never throws — a logging
 * failure must not block or fail the privileged action it is recording.
 * Durable/queryable audit trail depends on the `audit_events` table
 * (see supabase/migrations/20260904_audit_events.sql).
 */
export async function recordAuditEvent(event: {
  eventType: string;
  userId: string;
  firmId: string | null;
  matterId?: string | null;
  target?: string;
  payloadHash?: string;
  result: 'success' | 'failure' | 'denied';
  detail?: string;
}): Promise<void> {
  const url = supabaseUrl();
  const svcKey = serviceRoleKey();
  if (!url || !svcKey) return;
  try {
    await fetch(`${url}/rest/v1/audit_events`, {
      method: 'POST',
      headers: {
        apikey: svcKey,
        Authorization: `Bearer ${svcKey}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({
        event_type: event.eventType,
        user_id: event.userId,
        firm_id: event.firmId,
        matter_id: event.matterId ?? null,
        target: event.target ?? null,
        payload_hash: event.payloadHash ?? null,
        result: event.result,
        detail: event.detail ?? null,
      }),
      signal: AbortSignal.timeout(AUTH_TIMEOUT_MS),
    });
  } catch {
    // Best-effort only — see docstring.
  }
}

/**
 * Minimal in-process rate limiter. NOT durable across serverless instances —
 * acceptable only as a stopgap. A shared/durable limiter (Upstash Redis or a
 * Supabase-backed atomic counter) is required before this can be relied on as
 * the sole abuse control; see docs/SECURITY_REMEDIATION.md.
 */
const rateBuckets = new Map<string, { count: number; resetAt: number }>();

export function checkRateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const bucket = rateBuckets.get(key);
  if (!bucket || now > bucket.resetAt) {
    rateBuckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (bucket.count >= limit) return false;
  bucket.count += 1;
  return true;
}
