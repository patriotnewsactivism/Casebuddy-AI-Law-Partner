export const config = { runtime: 'edge' };

// Outbound email for the firm. Primary provider is SendGrid; if it's not
// configured or the send fails, we automatically fall back to Resend. The
// firm's secret API keys live only here (server-side env vars), never in the
// client bundle.
//
// Every send requires an authenticated firm member (see api/_shared/auth.ts)
// — this endpoint is a privileged relay through the firm's paid provider
// accounts and must never be reachable anonymously.
//
// Required Vercel env vars (set at least one):
//   SENDGRID_API_KEY   — primary
//   RESEND_API_KEY     — fallback
// Optional:
//   FIRM_ARCHIVE_BCC   — firm-configured archive address. There is no default;
//                        an unset value means no archive BCC is added. Do not
//                        hardcode a personal/archive address in source.

import { requireFirmMemberOrInternalSecret, caseBelongsToFirm, restrictiveCors, recordAuditEvent, checkRateLimit, AuthError } from '../_shared/auth';

const FIRM_DOMAIN = 'casebuddy.live';
const FIRM_EMAIL = `firm@${FIRM_DOMAIN}`;
const FIRM_NAME = 'CaseBuddy Law';

const MAX_RECIPIENTS = 50;
const MAX_HTML_BYTES = 200_000;
const RATE_LIMIT_PER_HOUR = 60;

const json = (req: Request, status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...restrictiveCors(req), 'Content-Type': 'application/json' },
  });

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

const toList = (v: unknown): string[] => {
  if (!v) return [];
  const arr = Array.isArray(v) ? v : [v];
  return arr
    .map(x => String(x).trim())
    .filter(x => /.+@.+\..+/.test(x));
};

// Only let the firm send "as" its own verified domain. Anything else is
// rewritten to the firm address so we can't be used to spoof outside senders.
const safeFrom = (email?: string, name?: string): { email: string; name: string } => {
  const e = (email || '').trim().toLowerCase();
  const ok = e.endsWith(`@${FIRM_DOMAIN}`);
  return { email: ok ? e : FIRM_EMAIL, name: name || FIRM_NAME };
};

const uniq = (arr: string[]) => Array.from(new Set(arr.map(s => s.toLowerCase())));

async function sendViaSendgrid(p: {
  to: string[]; cc: string[]; bcc: string[]; from: { email: string; name: string };
  replyTo?: string; subject: string; html: string;
}): Promise<{ ok: boolean; status: number; detail?: string }> {
  const key = process.env.SENDGRID_API_KEY;
  if (!key) return { ok: false, status: 503, detail: 'SendGrid not configured' };

  const personalization: Record<string, unknown> = { to: p.to.map(email => ({ email })) };
  if (p.cc.length) personalization.cc = p.cc.map(email => ({ email }));
  if (p.bcc.length) personalization.bcc = p.bcc.map(email => ({ email }));

  const body: Record<string, unknown> = {
    personalizations: [personalization],
    from: { email: p.from.email, name: p.from.name },
    subject: p.subject,
    content: [{ type: 'text/html', value: p.html }],
  };
  if (p.replyTo) body.reply_to = { email: p.replyTo };

  try {
    const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (res.ok) return { ok: true, status: res.status };
    return { ok: false, status: res.status, detail: (await res.text()).slice(0, 300) };
  } catch (err: any) {
    return { ok: false, status: 502, detail: err?.message || 'SendGrid request failed' };
  }
}

async function sendViaResend(p: {
  to: string[]; cc: string[]; bcc: string[]; from: { email: string; name: string };
  replyTo?: string; subject: string; html: string;
}): Promise<{ ok: boolean; status: number; detail?: string }> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { ok: false, status: 503, detail: 'Resend not configured' };

  const body: Record<string, unknown> = {
    from: `${p.from.name} <${p.from.email}>`,
    to: p.to,
    subject: p.subject,
    html: p.html,
  };
  if (p.cc.length) body.cc = p.cc;
  if (p.bcc.length) body.bcc = p.bcc;
  if (p.replyTo) body.reply_to = p.replyTo;

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (res.ok) return { ok: true, status: res.status };
    return { ok: false, status: res.status, detail: (await res.text()).slice(0, 300) };
  } catch (err: any) {
    return { ok: false, status: 502, detail: err?.message || 'Resend request failed' };
  }
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: restrictiveCors(req) });
  if (req.method !== 'POST') return json(req, 405, { error: 'Method not allowed' });

  // ── Authentication & authorization ────────────────────────────────────────
  // Accepts a signed-in firm member OR a trusted internal caller (e.g. the
  // Supabase signup-trigger webhook) presenting EMAIL_SEND_INTERNAL_SECRET —
  // a secret dedicated to this endpoint, never CRON_SECRET or another
  // endpoint's secret.
  let user;
  try {
    user = await requireFirmMemberOrInternalSecret(req, 'EMAIL_SEND_INTERNAL_SECRET');
  } catch (err) {
    const status = err instanceof AuthError ? err.status : 401;
    return json(req, status, { error: err instanceof Error ? err.message : 'Unauthorized' });
  }

  // ── Rate limiting (best-effort in-process; see api/_shared/auth.ts) ────────
  if (!checkRateLimit(`email-send:${user.userId}`, RATE_LIMIT_PER_HOUR, 60 * 60 * 1000)) {
    await recordAuditEvent({
      eventType: 'email.send', userId: user.userId, firmId: user.firmId,
      result: 'denied', detail: 'rate limit exceeded',
    });
    return json(req, 429, { error: 'Too many send requests. Please try again later.' });
  }

  let payload: any;
  try {
    payload = await req.json();
  } catch {
    return json(req, 400, { error: 'Invalid JSON body' });
  }

  const to = toList(payload.to);
  const subject = String(payload.subject || '').trim().slice(0, 500);
  const html = String(payload.html || payload.htmlBody || '').trim();
  const matterId = payload.caseId ? String(payload.caseId) : null;

  if (!to.length) return json(req, 400, { error: 'At least one valid "to" recipient is required' });
  if (!subject) return json(req, 400, { error: 'Missing subject' });
  if (!html) return json(req, 400, { error: 'Missing html body' });
  if (new TextEncoder().encode(html).length > MAX_HTML_BYTES) {
    return json(req, 413, { error: 'Email body exceeds the size limit.' });
  }

  const from = safeFrom(payload.fromEmail, payload.fromName);
  const cc = uniq(toList(payload.cc));
  // Archive BCC is opt-in, firm-configured only — never a hardcoded personal
  // address. Unset means no archive copy is sent.
  const archiveConfigured = (process.env.FIRM_ARCHIVE_BCC || '').trim();
  const bcc = uniq([...toList(payload.bcc), ...(archiveConfigured ? [archiveConfigured] : [])])
    .filter(e => !to.includes(e) && !cc.includes(e));
  const replyTo = toList(payload.replyTo)[0];

  const totalRecipients = to.length + cc.length + bcc.length;
  if (totalRecipients > MAX_RECIPIENTS) {
    return json(req, 413, { error: `Too many recipients (max ${MAX_RECIPIENTS}).` });
  }

  // If the send is tied to a matter, the matter must belong to the caller's firm.
  if (matterId && user.firmId && !(await caseBelongsToFirm(matterId, user.firmId))) {
    await recordAuditEvent({
      eventType: 'email.send', userId: user.userId, firmId: user.firmId, matterId,
      result: 'denied', detail: 'matter does not belong to caller firm',
    });
    return json(req, 403, { error: 'The referenced case is not accessible to your firm.' });
  }

  const params = { to, cc, bcc, from, replyTo, subject, html };
  const payloadHash = await sha256Hex(JSON.stringify({ to, cc, bcc, subject, from }));

  const hasSendgrid = !!process.env.SENDGRID_API_KEY;
  const hasResend = !!process.env.RESEND_API_KEY;
  if (!hasSendgrid && !hasResend) {
    return json(req, 503, { error: 'Email is not configured. Set SENDGRID_API_KEY or RESEND_API_KEY.' });
  }

  // Try SendGrid first, then fall back to Resend on any failure.
  let primary = await sendViaSendgrid(params);
  if (primary.ok) {
    await recordAuditEvent({
      eventType: 'email.send', userId: user.userId, firmId: user.firmId, matterId,
      target: to.join(','), payloadHash, result: 'success', detail: 'provider=sendgrid',
    });
    return json(req, 200, { ok: true, provider: 'sendgrid' });
  }

  const fallback = await sendViaResend(params);
  if (fallback.ok) {
    await recordAuditEvent({
      eventType: 'email.send', userId: user.userId, firmId: user.firmId, matterId,
      target: to.join(','), payloadHash, result: 'success', detail: 'provider=resend (sendgrid fallback)',
    });
    return json(req, 200, { ok: true, provider: 'resend', primaryError: primary.detail });
  }

  await recordAuditEvent({
    eventType: 'email.send', userId: user.userId, firmId: user.firmId, matterId,
    target: to.join(','), payloadHash, result: 'failure',
    detail: `sendgrid=${primary.detail || 'n/a'}; resend=${fallback.detail || 'n/a'}`,
  });
  return json(req, 502, {
    error: 'All email providers failed',
    sendgrid: hasSendgrid ? primary.detail : 'not configured',
    resend: hasResend ? fallback.detail : 'not configured',
  });
}
