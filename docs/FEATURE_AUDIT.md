# CaseBuddy Feature Audit

_Pass 1 — 2026-09-04_

## Purpose and scope

This is Phase 0 of the CaseBuddy production-readiness program: a verified
inventory of what actually exists in the repository, cross-checked against
what `README.md`, `IMPLEMENTATION_STATUS.md`, and `TODO.md` claim, and
against the routes/components/services that actually run.

**This is not exhaustive.** CaseBuddy has ~40 routed screens and a large
service layer; Pass 1 verifies a representative set in depth (client access,
outbound communications, admin/privileged endpoints — the highest-risk
surfaces) and inventories the rest at the "exists and is routed" level
without yet re-verifying every claim end-to-end. Rows marked **Not yet
audited** are not implied to be broken or working — they are simply
unverified in this pass and must not be read as "production-ready."

A screen rendering is not evidence of completeness. See per-row notes.

## Status legend

- **Verified** — inspected this pass; finding recorded below or in
  `docs/SECURITY_REMEDIATION.md`.
- **Claimed** — asserted by README/IMPLEMENTATION_STATUS/TODO but not yet
  independently verified in this pass.
- **Not yet audited** — routed/exists, no verification performed yet.

## Cross-document consistency check

`IMPLEMENTATION_STATUS.md` lists "client portal/communications" among
surfaces "implemented or actively integrated in the canonical application."
`TODO.md`'s backlog separately lists "Client portal — clients log in, see
case status, message agents" as **not started**. Both statements describe
the same feature. Verification in this pass (see below) confirms
`components/ClientPortal.tsx` is fully built and routed, but its access
control is prototype-grade (`localStorage` + guessable access codes, no
Supabase Auth). Neither document is fully accurate: the UI is real, but it
is not production-authorized client access. `TODO.md`'s backlog entry should
be replaced with the concrete remediation tracked in
`docs/SECURITY_REMEDIATION.md` (finding SEC-2) rather than left as "not
started," since real work already exists that must be replaced, not
authored from scratch.

## Feature matrix

| Feature | Claimed status | UI | Backend | DB | Auth'd | Tenant-scoped | Real provider | Real persistence | Error handling | Tests | E2E | Production-ready | Known defects | Required remediation |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **Client portal** (`/client`, `components/ClientPortal.tsx`) | Implemented (IMPLEMENTATION_STATUS) / Backlog (TODO) — contradictory | Yes | Partial (real upload pipeline; no session backend) | Partial (`client_invites` exists, unused by this component) | **No** | **No** | Partial | **No** (chat/session in `localStorage`) | Minimal | None | None | **Prototype — not production-ready** | Public route with no `AuthGate`; login accepts case-ID/prefix/client-name match against the full in-browser case list; "sandbox" one-click login as any client rendered in production; messages/escalation state in unscoped `localStorage`. See SEC-2. | Rebuild on Supabase Auth + `client_matter_memberships` per SEC-2. |
| **Outbound email** (`api/email/send.ts`, `netlify/functions/email-send.ts`, `services/integrationService.ts`) | Implemented, "URGENT — blocking" per TODO.md | Yes (Mail Room, agent replies) | Yes | Partial (no delivery-state table yet) | **Fixed this pass** (was: none) | **Fixed this pass** (matter check added) | Yes (SendGrid/Resend) | Yes | Basic | None | None | **Was P0-insecure; now firm-auth-gated** — see SEC-1 | Was fully anonymous, wildcard CORS, hardcoded personal archive BCC (`casebuddylaw@gmail.com`, also duplicated in `agents/firmEmail.ts`). Fixed in this pass; durable rate limiting and full delivery-state tracking (Phase 9) remain outstanding. | Add durable rate limiter (Upstash or equivalent); build delivery-state/thread model per Phase 9. |
| **Admin / PACER search** (`api/admin.ts`) | Not documented in README/IMPLEMENTATION_STATUS | Yes (internal tool) | Yes | N/A | **Fixed this pass** (was: none) | N/A | Yes (PACER) | N/A | Minimal | None | None | **Was P0 — anonymous use of paid PACER credentials; now firm-auth-gated** | File declares `runtime: 'edge'` but `handleRunMigration` uses Node (`VercelRequest`/`VercelResponse`) request/response conventions — these are incompatible; this handler's actual behavior on Vercel is unverified and may not work as written. Also contained a dead but dangerous open-RLS SQL string (removed this pass). | Resolve edge-vs-node runtime mismatch; verify `run-migration` actually executes against a real Vercel deployment; migrate its secret off shared `CRON_SECRET`. |
| **Client invite tokens** (`supabase/migrations/20260623_client_invite_tokens.sql`, `20260824_public_intake_token_rpc.sql`, `services/clientInviteStore.ts`) | Not directly documented | N/A | Yes | Yes | RPC-scoped (anon by design) | Yes (token-scoped RPC) | N/A | Yes | Reasonable | None | None | Mostly sound; one residual issue | The original anon table-level RLS policies (`anon_resolve_client_token`, `anon_mark_opened`) were dangerously permissive but were **already closed** by a later migration (`20260824205339_...lockdown.sql`) before this audit — confirmed fixed, not a live issue. Residual: `resolve_public_intake_token()` returns the `notes` column (documented as "internal notes only — never shown to client") to `anon` callers. | Drop `notes` from the RPC's return columns, or rename/repurpose the field so its access contract matches its use. |
| **AI provider access (browser)** (`services/geminiService.ts`, `services/cohere.ts`, `services/courtListenerService.ts`, `components/ArgumentPractice.tsx`, `components/IntercomPanel.tsx`) | "Finish the incomplete Gemini migration" (this program's own framing) | Yes | N/A (client-side calls) | N/A | N/A | N/A | Direct-browser calls to Gemini/Groq/Azure Vision/CourtListener | N/A | try/catch fallback chains | None | None | **Currently inert, not removed** | `vite.config.ts` zeroes all `VITE_*` provider keys at build time, so these code paths cannot obtain a real key through that route today. But they remain live code, and `App.tsx` previously cached `window.__GEMINI_API_KEY`/`__GROQ_API_KEY`-shaped globals that these files also check — that caching was removed this pass, closing the only other path capable of activating them. The call sites themselves are unchanged. | Phase 7: replace with the canonical model-gateway capability calls; delete these files' direct-provider branches once callers are migrated. |
| **Deadlines** (`components/PracticeTools.tsx` and related; `deadlines` table) | "deadlines/calendar/case pipeline" implemented | Yes | Not yet audited | Yes (firm-scoped per 0009) | Not yet audited | Yes (RLS confirmed) | Not yet audited | Yes | Not yet audited | None | None | **Not yet audited** | Not yet reviewed for Phase 2's deterministic-rule-engine requirement — current calculation logic (LLM vs. rule table) unknown pending review. | Phase 2 audit: confirm whether deadline dates are LLM-generated or rule-computed before further claims are made. |
| **Discovery / evidence vault** (`components/EvidenceVault.tsx`, `components/DiscoveryManager.tsx`, `services/documentPipeline.ts`) | "evidence vault and discovery" implemented | Yes | Real (Supabase Storage + OCR pipeline referenced by `ClientPortal.tsx` upload) | Yes | Not yet audited | Not yet audited | Yes (OCR/Vision chain per code comments) | Yes | Not yet audited | None | None | **Not yet audited** | Not yet reviewed for Bates numbering, privilege/redaction workflow, chain-of-custody per Phase 4. | Phase 4 audit. |
| **Legal research** (`services/courtListenerService.ts`, `StrategyRoom`, `CourtRules`) | "legal-research surfaces" implemented | Yes | Partial (direct-browser CourtListener call found — inert per credential boundary) | Not yet audited | Not yet audited | Not yet audited | Partial | Not yet audited | Not yet audited | None | None | **Not yet audited** | `courtListenerService.ts` reads `VITE_COURTLISTENER_API_KEY`, zeroed at build; unclear if a server-proxied path exists in parallel. | Phase 5 audit: confirm whether a working server-side CourtListener proxy exists; consolidate. |
| **Billing / Stripe** (`api/stripe/*`) | "billing, CRM/growth, analytics" implemented | Not yet audited | Not yet audited | Not yet audited | Not yet audited | Not yet audited | Not yet audited | Not yet audited | Not yet audited | None | None | **Not yet audited** | Not reviewed this pass. | Phase 10 audit. |
| **Firm command / Mail Room / Intercom** (`CaseOrchestrator`, `MailRoom`, `IntercomPanel`) | "firm command, mail room" implemented | Yes | Yes (rides on `firm_emails`, now firm-scoped per 0009) | Yes | Yes (via `firm_emails` RLS) | Yes | Partial | Yes | Not yet audited | None | None | **Not yet audited beyond email-send fix** | `IntercomPanel.tsx` contains a `window.__GEMINI_API_KEY` fallback read (currently inert, see AI provider row above). | Phase 7 cleanup as above. |
| All other routed screens (~25 remaining: witness/deposition prep, trial/jury simulation, transcription, analytics, connected apps, settings, firm admin, etc.) | Implemented per IMPLEMENTATION_STATUS | Yes (routed, all under `AuthGate`) | Not yet audited | Not yet audited | Yes (route-level `AuthGate`; per-feature authorization not yet audited) | Not yet audited | Not yet audited | Not yet audited | Not yet audited | None | None | **Not yet audited** | None recorded yet. | Continue Phase 0 in subsequent passes before any is claimed production-ready. |

## What was corrected this pass

- `TODO.md` and `IMPLEMENTATION_STATUS.md` disagree about client-portal
  maturity; this document is now the authoritative statement until `TODO.md`
  is edited to match (out of scope for this pass — flagged, not yet edited,
  since `TODO.md` is described as "live source of truth" maintained by the
  team's own workflow).

## Next steps

1. Continue Phase 0 verification for the "Not yet audited" rows above,
   prioritizing Deadlines (Phase 2 — deterministic-calculation requirement)
   and Discovery/Evidence (Phase 4 — provenance requirement), since both are
   named as non-negotiable product rules.
2. Do not mark any row "production-ready" without: an authenticated,
   tenant-scoped path from UI → API → DB; error handling; and at least a
   manual end-to-end verification note (automated tests do not exist yet —
   see `docs/TEST_MATRIX.md`, to be created when Phase 14 begins).
