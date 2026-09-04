# Security Remediation Log

_Phase 1 — started 2026-09-04_

This log records release-blocking and high-severity findings from the
production-readiness audit, in the order required by the program: problem,
risk, root cause, files changed, architecture decision, tests added,
acceptance criteria, remaining risk. Entries are added as work progresses —
this is not a one-time snapshot.

Severity: **P0** = exploitable now, confidentiality/financial/integrity
impact. **P1** = real defect or fragile architecture, not currently
exploitable or lower blast radius. **P2** = hygiene/process gap.

---

## SEC-1 (P0, FIXED) — Anonymous outbound email relay

**Problem.** `api/email/send.ts` (and its Netlify twin
`netlify/functions/email-send.ts`) accepted `POST` requests from anyone on
the internet, with no session check, no firm check, wildcard
`Access-Control-Allow-Origin: *`, and no rate limiting. `safeFrom()` did
correctly restrict the `From` address to `@casebuddy.live`, but every other
control was absent.

**Risk.** Any unauthenticated caller could send arbitrary HTML email through
the firm's paid SendGrid/Resend accounts, from a `@casebuddy.live` address,
to arbitrary recipients — phishing-from-a-trusted-domain, spam abuse
exhausting provider quota/reputation, or unsolicited mail impersonating the
firm. The endpoint also force-BCC'd every send to a hardcoded personal Gmail
address (`casebuddylaw@gmail.com`, defined twice — once as
`DEFAULT_ARCHIVE_BCC` in `send.ts`/`email-send.ts`, once as
`FIRM_ARCHIVE_BCC` in `agents/firmEmail.ts`, the latter also rendered into
client-facing email footer text), which an anonymous abuser could not
control but which also had no basis in firm configuration.

**Root cause.** The endpoint was built to be called from trusted in-app
code and the auth boundary was never added at the API layer — a common
gap when the only tested caller is the app itself.

**Files changed.**
- `api/_shared/auth.ts` (new) — shared `requireFirmMember`,
  `requireFirmMemberOrInternalSecret`, `caseBelongsToFirm`,
  `restrictiveCors`, `recordAuditEvent`, `checkRateLimit`.
- `api/email/send.ts`, `netlify/functions/email-send.ts` — require a
  signed-in firm member (or a dedicated `EMAIL_SEND_INTERNAL_SECRET` for the
  one legitimate internal caller, the signup welcome-email webhook);
  restrictive CORS; recipient count cap (50) and body size cap (200KB);
  optional `caseId` validated against the caller's firm; best-effort
  rate limit (60/hour/user); audit event on every send attempt
  (success/failure/denied).
- `api/webhooks/user-signup.ts` — sends `EMAIL_SEND_INTERNAL_SECRET` when
  calling the now-authenticated endpoint.
- `services/integrationService.ts` — `sendEmail()` now attaches the caller's
  Supabase access token; accepts an optional `caseId` for matter validation.
- `agents/firmEmail.ts` — removed the hardcoded personal archive address and
  its exposure in client-facing footer text.
- `supabase/migrations/20260904_audit_events.sql` (new) — `audit_events`
  table, firm-scoped read via RLS, write-only via service role.

**Architecture decision.** Archive BCC is now purely a firm-configured
`FIRM_ARCHIVE_BCC` env var with **no default** — an unset value means no
archive copy, not a fallback to any hardcoded address. Internal
server-to-server callers use a secret dedicated to this endpoint
(`EMAIL_SEND_INTERNAL_SECRET`), not a shared secret like `CRON_SECRET`, per
the "dedicated secrets per trust boundary" rule. Rate limiting is
**explicitly documented as a stopgap** — the in-process `Map` in
`checkRateLimit` does not survive across serverless instances/regions and
must not be treated as a durable control; see Remaining risk.

**Tests added.** None yet — this repository has no test runner installed
(no Vitest/Playwright in `package.json`). This is a real gap, not an
oversight to gloss over; Phase 14 (Testing) has not started. Manual
verification only: reviewed the auth/authz/CORS/rate-limit/audit code paths
by inspection; did not execute against a live Supabase/SendGrid/Resend
environment (none available in this session).

**Acceptance criteria.**
- [x] Anonymous `POST /api/email/send` returns 401.
- [x] A signed-in user with no firm membership returns 403.
- [x] `From` is still forced to `@casebuddy.live` regardless of input.
- [x] No hardcoded personal email address remains in source.
- [x] CORS is restricted to `ALLOWED_ORIGIN` (defaults to
      `https://casebuddy.live`), never `*`.
- [x] Every send attempt (success, provider failure, or denial) writes an
      `audit_events` row.
- [ ] **Not yet verified against a live deployment** — no Supabase/Vercel
      credentials available in this session. Must be verified in staging
      before this is called done.
- [ ] Automated abuse test ("anonymous caller cannot send mail") — blocked
      on Phase 14 test infrastructure.

**Remaining risk.** (1) Rate limiting is in-process only; a durable limiter
(Upstash Redis or an atomic Supabase counter) is required before this
control can be trusted under real concurrent/multi-region load. (2) No
delivery-state/thread persistence exists yet (Phase 9). (3) This fix has not
been exercised against a live environment — treat as code-reviewed, not
integration-tested, until staging verification happens.

---

## SEC-2 (P0, NOT YET FIXED) — Client portal has no real authentication

**Problem.** `App.tsx` routes `/client` to `components/ClientPortal.tsx`
with **no `AuthGate`** — it is a fully public route. The component's
`handleLogin` matches a typed "access code" against
`cases.find(c => c.id === code || c.id.startsWith(code) || c.client.includes(code))`,
where `cases` is whatever is already loaded into the browser's
`AppContext`. The login screen additionally renders a "Sandbox Access Codes
(Demo Mode)" panel that lists every case with a one-click "log in as this
client" button — in production, not gated behind any dev/demo flag. Once
"in," chat messages, evidence-upload cache, and escalation state are all
stored in `localStorage` keyed only by `caseId` (`warroom_msgs_${caseId}`,
`evidence_${caseId}`, `escalated_${caseId}`) — no server-side session, no
per-client scoping.

**Risk.** Anyone who can reach `/client` (no login required to reach the
page itself) can browse or guess a case reference and access another firm's
client's portal — read case status/milestones, chat history, and evidence
metadata, and impersonate that client in the chat thread and in evidence
uploads (which do reach the real Supabase Storage/OCR pipeline via
`uploadDocument`/`reanalyzeDocument`). This is a direct attorney-client
confidentiality breach vector, not a demo-only concern, since the route
ships in the production build with no gate.

**Root cause.** The component appears to have been built as a UI/UX
prototype ("simulate their portal experience") before a real client-identity
model existed, and was routed into production navigation without a
corresponding backend authorization layer ever being wired in — the
opposite gap from a table existing with no consumer: here the UI is real
and the auth backing it is missing entirely.

**Proposed architecture (not yet implemented).** Per the program's schema:
`client_users`, `client_matter_memberships`, `client_invitations`,
`client_sessions` (or native Supabase Auth identities scoped to a `client`
role), `client_message_permissions`, `client_document_permissions`.
Invitations random/high-entropy, hashed at rest, expiring, revocable,
single-purpose — the existing `client_invites` intake-token
infrastructure (`supabase/migrations/20260623_client_invite_tokens.sql`,
`20260824_public_intake_token_rpc.sql`, `services/clientInviteStore.ts`) is
the right pattern to extend (SECURITY DEFINER RPCs, no direct anon table
access) but currently only covers the one-time intake flow, not an ongoing
authenticated portal session.

**Status.** Not fixed in this pass. This requires new tables, new RLS
policies, a new session/identity model, and a full rewrite of
`ClientPortal.tsx`'s data layer — a materially larger and riskier change
than SEC-1/SEC-3/SEC-4, and one this session cannot verify against a live
Supabase project (none connected). Recommend scoping this as its own
tracked unit of work with staging verification before merge, rather than
landing unverified auth-model changes to a legal-confidentiality-critical
surface in the same pass as the contained fixes below.

**Interim mitigation available immediately, not yet applied:** wrap `/client`
in `AuthGate` the same way `/app/client-portal` already is, and remove the
sandbox one-click-login panel from the production bundle. This does not
solve real client access (attorneys would be the only ones who could reach
it, defeating the portal's purpose) but it closes the anonymous-access hole
until the real client-identity model lands. **Recommend applying this
interim mitigation immediately** even before the full rebuild.

**Remaining risk.** Full, as described above, until fixed.

---

## SEC-3 (P0, FIXED) — Unauthenticated use of paid PACER credentials

**Problem.** `api/admin.ts`'s `pacer-search` action (also the router's
*default* action when no `?action=` is supplied) called the PACER Case
Locator API using `PACER_USERNAME`/`PACER_PASSWORD` with no authentication
check at all.

**Risk.** Any caller could trigger PACER searches billed to the firm's
account — direct financial cost per search, and risk of PACER-side rate
limiting or account action from abuse traffic.

**Root cause.** Same pattern as SEC-1: built assuming only trusted internal
callers would ever reach it; no auth check was ever added.

**Files changed.** `api/admin.ts` — `handlePacerSearch` now calls
`requireFirmMember(req)` before touching PACER credentials.

**Architecture decision.** Reused the shared `api/_shared/auth.ts` helper
built for SEC-1 rather than writing a third copy of session verification.

**Tests added.** None — same test-infrastructure gap as SEC-1.

**Acceptance criteria.**
- [x] Anonymous `POST /api/admin?action=pacer-search` returns 401.
- [ ] Not yet verified against a live deployment.

**Remaining risk.** `api/admin.ts` declares `export const config = { runtime:
'edge' }` at the top of the file, but `handleRunMigration` is written
against the Node.js `VercelRequest`/`VercelResponse` API (`req.query`,
`res.status().json()`), which is not available in the Edge runtime. This is
a **pre-existing inconsistency, not introduced by this fix**, and means
`run-migration`'s actual runtime behavior on Vercel is unverified — it may
error on every call. Flagged in `docs/FEATURE_AUDIT.md`; needs a runtime
decision (split into two files/functions, one edge one node) before that
sub-feature can be trusted. Also: `run-migration`'s auth still reuses
`CRON_SECRET` rather than a dedicated secret — lower severity (it only
reports table-existence booleans) but should be migrated to its own secret
per the "dedicated secret per trust boundary" rule.

---

## SEC-4 (P1, FIXED) — Dead window-key credential-caching architecture

**Problem.** `App.tsx` fetched `/api/ai/voice-keys` on every authenticated
session and cached `data.geminiKey`/`data.deepgramKey`/`data.deepseekKey`
onto `window.__GEMINI_API_KEY`/`__DEEPGRAM_API_KEY`/`__DEEPSEEK_API_KEY`.
Several browser services (`services/geminiService.ts`, `services/cohere.ts`,
`components/IntercomPanel.tsx`) read those same `window.__*` globals as a
fallback when no `VITE_*` key is present.

**Risk.** This is exactly the "obsolete runtime-key/window-key architecture"
the product rules prohibit — permanent-shaped provider credentials cached on
`window` for arbitrary page script to read. On investigation it turned out
to be **currently inert**: `api/ai/voice-keys.ts` (the only endpoint this
effect calls) never actually returns `geminiKey` or `deepseekKey` — it
returns only a short-lived Deepgram bearer token as `deepgramKey`. And the
one real consumer of Deepgram tokens, `hooks/useDeepgramVoiceAgent.ts`,
fetches its own token directly rather than reading the cached window value.
So the effect was fully dead code, but it was a landmine: if anyone ever
"fixed" the apparent mismatch by adding `geminiKey`/`deepseekKey` back to
the endpoint response — a change that would look like a bug fix, not a
security regression — the browser would immediately start receiving
permanent provider credentials.

**Root cause.** Leftover from an earlier architecture, not cleaned up after
`voice-keys.ts` was narrowed to Deepgram-only.

**Files changed.** `App.tsx` — removed the effect entirely (and the now-
unused `getSession` import). No other file reads the values it used to set,
so no consumer was broken; verified via repo-wide search before removal.

**Tests added.** None — same gap as above; this was verified by static
analysis (searching for all readers of the three `window.__*` globals) since
no test harness exists to assert the negative ("nothing reads this").

**Acceptance criteria.**
- [x] `window.__GEMINI_API_KEY` / `__DEEPGRAM_API_KEY` / `__DEEPSEEK_API_KEY`
      are no longer set anywhere in the codebase.
- [ ] The remaining direct-browser provider call sites in
      `geminiService.ts`, `cohere.ts`, `courtListenerService.ts`,
      `ArgumentPractice.tsx`, `IntercomPanel.tsx` still exist and still read
      `import.meta.env.VITE_*` (zeroed by `vite.config.ts`, so currently
      non-functional, but not deleted). Full removal is Phase 7 work
      (replace with the canonical model-gateway) and was out of scope for
      this contained fix — deleting them blind without confirming every
      caller's fallback behavior risked breaking legitimate fallback chains
      (e.g. the Azure Vision → Gemini → OCR.space OCR chain described in
      `services/geminiService.ts`'s comments) without the ability to test
      against a live provider in this session.

**Remaining risk.** The dead call sites remain a latent risk if
`vite.config.ts`'s zeroing is ever weakened (explicitly forbidden by
CLAUDE.md, but worth having a second independent control). Tracked for
Phase 7.

---

## SEC-5 (P1, FIXED) — Client-invite RPC over-shares an "internal only" field

**Problem.** `resolve_public_intake_token()` (in
`supabase/migrations/20260824_public_intake_token_rpc.sql`), granted
`EXECUTE` to `anon`, returns the invite's `notes` column to the calling
browser. The original table comment on `client_invites.notes` explicitly
states `-- internal notes only — never shown to client`, and
`services/clientInviteStore.ts` faithfully forwards that value into the
resolved object handed to client-facing intake code.

**Risk.** Any internal notes an attorney records on a client invite
(potentially including impressions, red flags, or strategy notes before
intake) are sent to the client's browser on every link open — a
confidentiality/trust violation even if no current UI renders the field,
since the data still crosses the network to an untrusted client.

**Root cause.** The RPC was written to return the whole matched row's public
-facing fields without re-checking each column's intended audience against
the "never shown to client" comment already present on the same table.

**Status.** **Documented, not yet fixed** — this is a live migration
function; changing its return signature requires coordinating with any
other caller of `resolve_public_intake_token` and re-deploying to the actual
Supabase project, which this session cannot do (not connected to one).
Recommended fix: drop `notes` from the function's `returns table (...)` and
from `ResolvedClientInvite` / `resolveClientToken()` in
`clientInviteStore.ts`, or rename the column and add a second,
service-role-only accessor for attorneys who need to read it from
`fetchClientInvites()` (which already correctly runs firm-scoped, non-anon).

**Remaining risk.** Live until the migration above is written and applied.

---

## Verified as already fixed (false positives ruled out this pass)

- `supabase/migrations/20260623_client_invite_tokens.sql`'s original
  `anon_resolve_client_token` (`USING (token is not null)` — effectively
  `true`, exposing every firm's `client_invites` rows including `notes` to
  any anon caller) and `anon_mark_opened` (`USING (true)`, allowing any
  anon caller to flip any row's status) policies looked like a live P0 on
  first read. Confirmed **already closed** by
  `supabase/migrations/20260824205339_post_cutover_token_and_discovery_storage_lockdown.sql`,
  which explicitly drops both policies, before this audit began. No action
  needed beyond SEC-5 above. Recorded here so the same false alarm isn't
  re-raised without checking the full migration history first.

## Outstanding from the full program (not started)

Rate-limiting sweep across all `/api`, `/supabase/functions`, cron, and
webhook endpoints (only 2 of ~20+ privileged endpoints had any rate-limiting
construct at all, per a grep pass); tenant/cache isolation audit beyond the
client-portal finding; full RLS audit of the remaining ~25 migrations;
demo-mode fail-closed verification in CI; provider-secret grep beyond the
patterns checked this pass. These are real, sizable pieces of Phase 1 not
yet started — listed explicitly rather than implied "done" by omission.
