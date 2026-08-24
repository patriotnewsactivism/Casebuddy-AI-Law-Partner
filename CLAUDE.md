# CLAUDE.md

Guidance for Claude Code when working in this repository.

> **Synchronization rule:** `QWEN.md`, `AGENTS.md`, and `CLAUDE.md` describe the
> same architecture. Update all three together when the architecture changes.
> This version was synchronized on 2026-08-24.

## Project Overview

**CaseBuddy** (`casebuddy-ai-lawfirm`, legacy internal name `lexsim`) is an
AI-powered legal-practice platform for case management, evidence analysis,
witness/trial simulation, intake automation, billing, document workflows, and
a multi-agent AI workforce.

Core stack:

- React 19 + TypeScript + Vite
- Supabase PostgreSQL + Auth + RLS + Realtime
- Vercel server/API deployment
- Netlify as a secondary deployment target
- Supabase Edge Functions for database-adjacent background work

Operating modes:

- `partner` — full firm practice
- `companion` — pro-se / individual case-work essentials

Product tiers are `personal`, `professional`, and `enterprise` (see
`TIER_FEATURES` and `services/tierService.ts`).

## Commands

```bash
npm install
npm run dev                 # Vite dev server, port 5000
npm run typecheck           # full legacy repository typecheck
npm run typecheck:security  # security-critical changed surface
npm run build               # security typecheck + Vite build + emitted-bundle secret scan
npm run verify:security     # same security build gate
npm run preview
```

`npm run build` is the deployment gate. Do not bypass a failed secret scan to
make a preview deploy.

The full legacy `npm run typecheck` can surface pre-existing issues outside the
current change surface. Fix those in focused work rather than weakening the
security build gate.

## Credential Boundary — Critical

Permanent provider credentials are **server-only**.

Never:

- add Gemini, Groq, OpenAI, Deepgram, ElevenLabs, Azure Vision, CourtListener,
  GitHub, Supabase service-role, email-provider, or worker secrets to browser
  environment variables;
- return permanent provider credentials from a browser-facing API route;
- cache permanent provider credentials on `window`;
- add a direct-browser provider fallback because a proxy call failed;
- use the Supabase service-role credential as generic worker authentication;
- weaken `vite.config.ts` or `scripts/check-client-secrets.mjs` to make a build
  pass.

The Vite configuration intentionally disables automatic exposure of arbitrary
`VITE_*` environment variables. Public browser configuration is explicitly
allow-listed.

Current public configuration includes only values deliberately intended for
client use, such as:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_FIRM_ID`
- `VITE_AZURE_VISION_ENDPOINT`
- `VITE_STRIPE_PUBLISHABLE_KEY`

The Supabase anon key is public by design; authorization still depends on RLS
and server-side checks.

Examples of **server-only** configuration include:

- `GEMINI_API_KEY`
- `GROQ_API_KEY`
- `OPENAI_API_KEY`
- `DEEPGRAM_API_KEY`
- `ELEVENLABS_API_KEY`
- `AZURE_VISION_KEY`
- `COURTLISTENER_API_KEY`
- `GITHUB_TOKEN`
- `SUPABASE_SERVICE_ROLE_KEY`
- `PIPELINE_WORKER_SECRET`
- `PIPELINE_ORCHESTRATOR_SECRET`
- `CRON_SECRET`
- transactional email/SMS/payment secret credentials

See `.env.example`, `API_PROXY_SETUP.md`, and `docs/SECURITY_FOUNDATION.md`.

## Voice Authentication

Browser voice sessions obtain a short-lived Deepgram bearer token from:

- `/api/ai/voice-keys` for authenticated users
- `/api/ai/voice-keys-public` for public intake

The browser must never receive the underlying permanent Deepgram API key.
Vercel and Netlify implementations must maintain the same response contract.

`hooks/useDeepgramVoiceAgent.ts` authenticates the Deepgram Agent WebSocket
with the temporary bearer token.

## AI Service Layer

Text-generation callers use `services/deepseek.ts` for backward-compatible
routing. The exported name `deepseekChat()` is legacy; callers should not infer
that the DeepSeek provider is necessarily being used.

Primary text requests go through the server proxy at `/api/ai/chat`, where
provider selection and credentials remain server-side.

**Do not restore direct Gemini/Groq/OpenAI browser fallbacks.** If a feature
still contains a legacy direct-provider call, the current Vite security boundary
intentionally denies it credentials. Migrate that operation behind an existing
or new authenticated server endpoint instead of exposing a key.

Multimodal/OCR/transcription features should follow the same rule: provider
credentials stay server-side, and the browser receives only the result or a
short-lived scoped credential when a provider protocol requires browser access.

## Storage & Pipeline Security

Case material is sensitive. Storage-backed processing follows these rules:

- case/document buckets are treated as private;
- workers use short-lived signed URLs when an external processor needs an
  object;
- do not replace signed URLs with public bucket URLs;
- pipeline orchestrator/worker calls use dedicated secrets;
- privileged functions fail closed when required server configuration is
  missing;
- job/document relationships must be validated before privileged processing.

Do not change production Storage visibility, RLS, grants, Edge Function
configuration, or credentials merely to make local/preview code work.

## Source Layout

There is no `src/` directory; the application lives at repository root.

```text
App.tsx             app shell, routes, AppContext, auth gate
index.tsx           browser entry point
components/         pages and UI features
services/           AI, Supabase, intake, billing, agent, integration services
agents/             personas, voice profiles, firm email helpers
api/                Vercel server endpoints
netlify/functions/  Netlify equivalents for secondary deployments
supabase/            migrations and Edge Functions
hooks/              React hooks
utils/              storage, errors, validation, PDF/audio helpers
config/             runtime configuration
```

`server/db.ts` is vestigial and excluded from the frontend TypeScript project.
Do not treat it as the canonical database layer.

## Bundling

Dependencies are real npm packages bundled by Vite. There is no importmap.
Tailwind is locally installed rather than loaded from a CDN.

New runtime dependencies belong in `package.json`.

`vite.config.ts` includes manual chunking and, more importantly, the client
credential boundary. Be careful when editing it.

## Routing

Routes are defined in `App.tsx` using `BrowserRouter`.

Public routes include the landing/auth/pricing/intake/client/legal pages.
Protected firm routes live under `/app/*` and are wrapped by the auth gate and
application layout.

`AuthGate` permits local-only/demo operation when Supabase is not configured;
otherwise unauthenticated users are redirected to login.

## State & Persistence

`AppContext` owns cases, active case, theme, operating mode, product tier, sync
status, user, and authentication loading state.

- local persistence uses `casebuddy_*` keys;
- `lexsim_*` names are migration fallbacks only;
- `services/caseStore.ts` handles Supabase case CRUD/realtime sync when cloud
  configuration is available;
- autonomous/background agent services start from application lifecycle code.

## Development Conventions

- Styling: Tailwind; dark slate + gold is the primary visual language.
- Path alias: `@/*` resolves to repository root.
- Pages are generally lazy-loaded from `App.tsx`; avoid unnecessarily moving
  heavy dependencies into the eager bundle.
- TypeScript target is ES2022 with bundler module resolution.
- Use shared error/retry utilities for provider/network workflows.
- Prefer comments that explain non-obvious constraints, especially security
  boundaries.
- There is no mature automated test suite; preview verification and focused
  build/type/security gates are important.

## Security Verification

The emitted browser bundle is scanned after every normal build by
`scripts/check-client-secrets.mjs`. It compares `dist` against configured
sensitive environment values and recognized credential signatures.

If the scan fails:

1. find the code path that materialized the secret in the bundle;
2. move the privileged operation server-side or explicitly remove the client
   exposure;
3. rebuild;
4. do **not** exclude the secret or relax the scanner as a workaround.

## Key Gotchas

1. Dev port is **5000**, not 3000.
2. `casebuddy_*` is the current localStorage namespace; `lexsim_*` is legacy.
3. `MOCK_CASES` is intentionally empty; use `MOCK_CASE_TEMPLATES` for fixtures.
4. `deepseekChat` is a compatibility name, not a promise to use DeepSeek.
5. Permanent AI/provider credentials are never browser configuration.
6. Voice browser auth uses short-lived Deepgram bearer tokens.
7. Vercel and Netlify must preserve equivalent security behavior.
8. Private legal documents use signed access, not public Storage URLs.
9. A legacy feature that expects a browser provider key should be migrated
   server-side, not "fixed" by exposing the key again.
10. `QWEN.md`, `AGENTS.md`, and `CLAUDE.md` must stay synchronized.
