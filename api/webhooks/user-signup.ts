export const config = { runtime: 'edge' };

// Fires when a new firm user signs up (auth.users INSERT), invoked by a
// Supabase Postgres trigger via net.http_post — see
// supabase/migrations/20260709_welcome_email_on_signup.sql
//
// Sends a personalized welcome email with onboarding tips + doc links using
// the firm's existing /api/email/send provider (SendGrid primary, Resend
// fallback) — no new email-sending logic, just composes the HTML and calls
// the existing endpoint.
//
// Auth: shared-secret header, same convention as the Vercel Cron jobs
// (`CRON_SECRET`). The Supabase trigger reads the same value from
// Vault (`signup_webhook_secret`) and sends it as `x-webhook-secret`.

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, x-webhook-secret',
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });

const APP_URL = 'https://casebuddy.live';

const ONBOARDING_LINKS: { label: string; href: string; blurb: string }[] = [
  { label: 'Your Dashboard', href: `${APP_URL}/app`, blurb: 'Firm-wide overview — active cases, deadlines, and what your AI team is working on.' },
  { label: 'Intake Inbox', href: `${APP_URL}/app/intake-inbox`, blurb: 'New client intakes captured by Maya (voice + chat) land here for you to review and accept into a case.' },
  { label: 'Case Manager', href: `${APP_URL}/app/cases`, blurb: 'Every active matter, with AI-assembled case briefs pulling together intake notes, documents, and transcripts.' },
  { label: 'Drafting Assistant', href: `${APP_URL}/app/docs`, blurb: 'Generate motions, letters, and discovery documents with full case context already loaded in.' },
  { label: 'Knowledge Base', href: `${APP_URL}/app/knowledge`, blurb: 'Firm playbooks, templates, and reference material your whole team can search.' },
  { label: 'Settings', href: `${APP_URL}/app/settings`, blurb: 'Set your notification preferences and firm details.' },
];

function welcomeHtml(displayName: string): string {
  const firstName = displayName.split(' ')[0] || displayName;
  const linkRows = ONBOARDING_LINKS.map(
    l => `
      <tr>
        <td style="padding:12px 0;border-bottom:1px solid #2a2f3a;">
          <a href="${l.href}" style="color:#d4a017;font-weight:600;font-size:15px;text-decoration:none;">${l.label} &rarr;</a>
          <div style="color:#9aa1ac;font-size:13px;margin-top:4px;line-height:1.4;">${l.blurb}</div>
        </td>
      </tr>`
  ).join('');

  return `
  <div style="background:#111318;padding:32px 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
    <div style="max-width:560px;margin:0 auto;background:#1a1d24;border-radius:12px;overflow:hidden;border:1px solid #2a2f3a;">
      <div style="padding:32px 32px 8px;">
        <h1 style="color:#fff;font-size:22px;margin:0 0 8px;">Welcome to CaseBuddy, ${firstName}!</h1>
        <p style="color:#c3c8d1;font-size:15px;line-height:1.6;margin:0 0 20px;">
          You're in. CaseBuddy pairs your firm with an AI legal team — Maya handles intake,
          Sol tracks deadlines, Lex builds strategy, and the rest of the crew is ready to help
          the moment you need them. Here's where to start:
        </p>
      </div>
      <table role="presentation" width="100%" style="padding:0 32px;border-collapse:collapse;">
        ${linkRows}
      </table>
      <div style="padding:24px 32px 32px;">
        <a href="${APP_URL}/app" style="display:inline-block;background:#d4a017;color:#111318;font-weight:700;font-size:14px;padding:12px 24px;border-radius:8px;text-decoration:none;">
          Open Your Dashboard
        </a>
        <p style="color:#6b7280;font-size:12px;line-height:1.6;margin:24px 0 0;">
          Questions? Just reply to this email — it reaches the CaseBuddy team directly.
        </p>
      </div>
    </div>
  </div>`;
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS_HEADERS });
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed' });

  const secret = req.headers.get('x-webhook-secret');
  if (!secret || secret !== process.env.CRON_SECRET) {
    return json(401, { error: 'Unauthorized' });
  }

  let payload: any;
  try {
    payload = await req.json();
  } catch {
    return json(400, { error: 'Invalid JSON body' });
  }

  const email = String(payload.email || '').trim();
  const displayName = String(payload.display_name || email.split('@')[0] || 'there').trim();
  if (!email || !/.+@.+\..+/.test(email)) {
    return json(400, { error: 'Missing or invalid email' });
  }

  try {
    const res = await fetch(`${APP_URL}/api/email/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: [email],
        subject: `Welcome to CaseBuddy, ${displayName.split(' ')[0]} — let's get you set up`,
        html: welcomeHtml(displayName),
      }),
    });
    const detail = await res.json().catch(() => ({}));
    if (!res.ok) return json(502, { error: 'Welcome email send failed', detail });
    return json(200, { ok: true, ...detail });
  } catch (err: any) {
    return json(502, { error: err?.message || 'Failed to reach email sender' });
  }
}
