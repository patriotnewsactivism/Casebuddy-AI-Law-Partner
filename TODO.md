# CaseBuddy AI Law — TODO.md
> Live source of truth. Updated as tasks are completed.

---

## 🔴 URGENT — Blocking Email Pipeline

- [ ] **Resend domain verification** — Go to resend.com/domains, add `casebuddy.live`, add the DNS records they give you. Must show **Verified** before outbound emails work.
- [ ] **Resend API key** — Confirm key at resend.com/api-keys has **Full Access** (not restricted to a specific domain).
- [ ] **Test real email** — Send from personal inbox to `maya@casebuddy.live`, confirm reply arrives within 30s.

---

## 🟡 NEEDS SETUP IN EXTERNAL DASHBOARDS

- [ ] **SendGrid Inbound Parse** — Confirm row exists at app.sendgrid.com/settings/parse:
      Domain: `casebuddy.live` → URL: `https://casebuddy.live/api/webhooks/email-inbound`
      This is what forwards inbound emails to the agents. Without it, emails are received but never processed.
- [ ] **Resend Webhook** (optional) — resend.com → Webhooks → Add `https://casebuddy.live/api/webhooks/resend-events` for `email.delivered` + `email.bounced` delivery tracking.
- [ ] **Vercel env vars** — Confirm all set in Production:
      `RESEND_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
      `GEMINI_API_KEY`, `CRON_SECRET`, `FIRM_OWNER_EMAIL`,
      `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER`

---

## 🟡 IN PROGRESS

- [ ] **Mail Center UI** — Verify Mail Room at casebuddy.live shows inbound + outbound threads.
- [ ] **Phone / Intercom** — Real-time voice communication with AI agents inside Mail Center (Twilio Voice).

---

## ✅ COMPLETED

- [x] Supabase `firm_emails` table created
- [x] `/api/webhooks/email-inbound` — routes to correct agent, classifies intent, saves to Supabase
- [x] Thread memory — agents recall last 8 messages per sender
- [x] Gemini integration — each agent replies in their own voice and personality
- [x] Outbound sender swapped SendGrid → Resend
- [x] Vercel Cron jobs — daily briefing 8am CT, deadline monitor hourly, Sierra client updates Fri 9am CT
- [x] `/api/webhooks/case-event` — event-driven triggers on case state changes
- [x] Mail Center module wired to all agent workflows
- [x] MX record — `mx.sendgrid.net` on `casebuddy.live` ✅

---

## 🔵 BACKLOG

- [ ] SMS pipeline — Twilio inbound SMS routed to agents
- [ ] PACER integration — automated court filing lookups
- [ ] Client portal — clients log in, see case status, message agents
- [ ] Agent escalation — hand off to human attorney when needed
- [ ] Stripe billing — automated invoices per case milestone
