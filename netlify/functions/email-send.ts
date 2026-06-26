/**
 * Netlify Function — Outbound email (SendGrid primary, Resend fallback).
 * Ported from api/email/send.ts
 *
 * POST /api/email/send
 * Body: { to, subject, html, fromEmail?, fromName?, cc?, bcc?, replyTo? }
 */

const FIRM_DOMAIN = 'casebuddy.live';
const FIRM_EMAIL = `firm@${FIRM_DOMAIN}`;
const FIRM_NAME = 'CaseBuddy Law';
const DEFAULT_ARCHIVE_BCC = 'casebuddylaw@gmail.com';

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });

const toList = (v: unknown): string[] => {
  if (!v) return [];
  const arr = Array.isArray(v) ? v : [v];
  return arr.map(x => String(x).trim()).filter(x => /.+@.+\..+/.test(x));
};

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
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS_HEADERS });
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed' });

  let payload: any;
  try { payload = await req.json(); } catch { return json(400, { error: 'Invalid JSON body' }); }

  const to = toList(payload.to);
  const subject = String(payload.subject || '').trim();
  const html = String(payload.html || payload.htmlBody || '').trim();

  if (!to.length) return json(400, { error: 'At least one valid "to" recipient is required' });
  if (!subject) return json(400, { error: 'Missing subject' });
  if (!html) return json(400, { error: 'Missing html body' });

  const from = safeFrom(payload.fromEmail, payload.fromName);
  const cc = uniq(toList(payload.cc));
  const archive = (process.env.FIRM_ARCHIVE_BCC || DEFAULT_ARCHIVE_BCC).trim();
  const bcc = uniq([...toList(payload.bcc), archive]).filter(e => !to.includes(e) && !cc.includes(e));
  const replyTo = toList(payload.replyTo)[0];

  const params = { to, cc, bcc, from, replyTo, subject, html };

  const hasSendgrid = !!process.env.SENDGRID_API_KEY;
  const hasResend = !!process.env.RESEND_API_KEY;
  if (!hasSendgrid && !hasResend)
    return json(503, { error: 'Email is not configured. Set SENDGRID_API_KEY or RESEND_API_KEY.' });

  const primary = await sendViaSendgrid(params);
  if (primary.ok) return json(200, { ok: true, provider: 'sendgrid' });

  const fallback = await sendViaResend(params);
  if (fallback.ok) return json(200, { ok: true, provider: 'resend', primaryError: primary.detail });

  return json(502, {
    error: 'All email providers failed',
    sendgrid: hasSendgrid ? primary.detail : 'not configured',
    resend: hasResend ? fallback.detail : 'not configured',
  });
}

export const config = { path: "/api/email/send" };
