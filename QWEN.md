# QWEN.md

Guidance for Qwen Code when working in this repository.

> **Note:** `QWEN.md`, `AGENTS.md`, and `CLAUDE.md` are kept in sync and
> describe the same verified architecture. Update all three together when the
> architecture changes. This file was synced to the current code (verified
> against `package.json`, `vite.config.ts`, `index.html`, `services/`, `api/`,
> and `App.tsx`) on 2026-07-29.

## Project Overview

**CaseBuddy** (npm package `casebuddy-ai-lawfirm`, internal legacy name `lexsim`)
is an AI-powered legal practice platform — case management, evidence analysis,
witness/trial simulation, intake automation, billing, and a multi-agent AI
workforce. Built with **React 19 + TypeScript + Vite**, backed by **Supabase**
(PostgreSQL + Auth + RLS + Realtime) and deployed to **Vercel** (static build +
serverless Edge Functions in `/api`).

The app supports two operating modes:
- **`partner`** — full firm practice (case files, intake, billing, team, CRM)
- **`companion`** — pro-se / individual mode (personal case-work essentials only)

…plus three product tiers: `personal`, `professional`, `enterprise`
(see `TIER_FEATURES` in `types.ts` and `services/tierService.ts`).

## Commands

```bash
npm install          # Install dev + runtime deps (all bundled by Vite)
npm run dev          # Dev server on port 5000 (NOT 3000)
npm run build        # Production build → dist/
npm run preview      # Preview the production build
```

There is **no** `lint`, `typecheck`, or `test` script in `package.json`.
Verify changes with `npm run build` (Vite/tsc will surface type errors).

## Environment

Copy `.env.example` → `.env.local`. Required for core functionality:

| Variable | Scope | Purpose |
|---|---|---|
| `GEMINI_API_KEY` / `VITE_GEMINI_API_KEY` | client + server | Primary AI model (Gemini 2.5 Flash). Required for all AI features. |
| `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` | client | Supabase auth + cloud sync. If unset, app runs in **local-only mode** (no auth gate, localStorage only). |
| `VITE_FIRM_ID` | client | Canonical firm UUID — scopes intake submissions to the correct firm in multi-firm RLS. Auto-generated into `firm_memberships` on first sign-in. |

Optional providers (see `.env.example` for the full list with comments):
`VITE_GROQ_API_KEY`, `OPENROUTER_API_KEY`, `GITHUB_TOKEN` (free GPT-4o via GitHub
Models), `COHERE_API_KEY`, `OPENAI_API_KEY` (last-resort paid fallback),
`VITE_DEEPGRAM_API_KEY` (voice STT), `VITE_ELEVENLABS_API_KEY` (TTS),
`VITE_AZURE_VISION_*` (OCR), `VITE_COURTLISTENER_API_KEY`,
`SENDGRID_API_KEY`, `TWILIO_*`, `CRON_SECRET`, `ALLOWED_ORIGIN`.

> ⚠️ **DeepSeek is deprecated** (credits exhausted). `services/deepseek.ts`
> still exports `deepseekChat()` / `parseDeepSeekJson()` for backward
> compatibility, but it no longer calls DeepSeek — see "AI Service Layer" below.

> **Security:** The Supabase anon key is safe to ship in the bundle (protected
> by RLS). `GEMINI_API_KEY` must NOT be baked into the client bundle in
> production — it lives server-side and is fetched at runtime via
> `/api/ai/voice-keys` after auth, then cached on `window.__GEMINI_API_KEY`.
> See `vite.config.ts` comments.

## Architecture

### Source Layout (no `src/` directory — everything at repo root)

```
App.tsx            # App shell, BrowserRouter, AppContext, Sidebar, Layout, AuthGate
index.tsx          # Entry point
index.html         # HTML shell (fonts, manifest, /index.tsx script — NO importmap)
index.css          # Global styles (Tailwind)
types.ts           # All TypeScript types/enums (Cases, Intake, Pipeline, Billing, RBAC…)
constants.ts       # MOCK_CASES (intentionally empty), MOCK_CASE_TEMPLATES, fixtures
components/         # ~90 files — one per page/feature, lazy-loaded in App.tsx
services/          # ~56 files — AI, Supabase sync, intake, billing, agents, integrations
agents/            # personas.ts (8 operational + 12 specialist agents), voiceProfiles.ts, firmEmail.ts
api/               # Vercel Edge Functions: ai/, cron/, email/, media/, stripe/, webhooks/
utils/             # errorHandler, storage, fileValidation, liveAudio, pdfExport, indexedDBAdapter…
hooks/             # React hooks
config/            # Runtime configuration
convex/, supabase/  # Supabase CLI state / migrations (supabase_migration*.sql)
netlify/           # Netlify config (secondary deploy target)
```

> `server/db.ts` (Drizzle/Postgres stub importing `@shared/schema`) is **vestigial
> and not wired to the frontend** — excluded in `tsconfig.json`. Ignore it.

### Critical: Dependencies ARE Bundled by Vite (NO importmap)

Unlike what `AGENTS.md`/`CLAUDE.md` claim, `index.html` contains **no
importmap**. All runtime dependencies (`react`, `react-dom`, `react-router-dom`,
`@google/genai`, `@supabase/supabase-js`, `framer-motion`, `lucide-react`,
`recharts`, `react-toastify`, `pdfjs-dist`, `@ffmpeg/ffmpeg`) are real npm
packages installed via `npm install` and bundled by Vite. Manual chunk-splitting
is configured in `vite.config.ts` (`rollupOptions.output.manualChunks`).
**DO NOT** add an importmap or expect CDN loading. New runtime deps go in
`package.json` `dependencies`.

### Routing (BrowserRouter)

Defined in `App.tsx`. Public routes (no `<Layout>`): `/`, `/login`, `/enroll`,
`/pricing`, `/start`, `/intake`, `/intake/:token`, `/client`,
`/privacy-policy`, `/tos` (alias `/terms-of-service`).

Protected routes are wrapped in `<AuthGate><Layout>…</Layout></AuthGate>`,
all under `/app/*`. The sidebar groups them into 4 nav groups (Daily, Case
Work, Courtroom, Firm Office) — see `NAV_GROUPS` in `App.tsx`. Tabbed hubs
(`/app/intake-hub`, `/app/media`, `/app/ai-team`, `/app/connected-apps`)
combine sibling features. Standalone routes for those sub-features stay
registered so old links keep working.

`AuthGate` skips auth entirely when `isSupabaseConfigured` is false (enables
local-only / demo usage); otherwise redirects unauthenticated users to `/login`.

### State & Storage

`AppContext` (in `App.tsx`) provides: `cases`, `activeCase`, `setActiveCase`,
`addCase`, `updateCase`, `deleteCase`, `theme`, `operatingMode`,
`productTier`, `syncStatus`, `user`, `authLoading`.

- **localStorage** (`utils/storage.ts`) uses `casebuddy_*` keys
  (`casebuddy_cases`, `casebuddy_active_case_id`, `casebuddy_preferences`,
  `casebuddy_trial_sessions`…). The `lexsim_*` keys are **legacy fallbacks
  for migration only** — `AGENTS.md`/`CLAUDE.md` are wrong on this point.
- **Cloud sync** (`services/caseStore.ts`): when Supabase is configured, cases
  sync to Postgres with realtime subscriptions (`subscribeCases`) so other
  devices see updates. `loadCasesWithSync` merges cloud + local on startup.
- `AppContext` persists explicitly (calls `saveCases`/`saveActiveCaseId`); the
  cloud sync layer (`upsertCaseToCloud`/`deleteCaseFromCloud`) is invoked in
  `addCase`/`updateCase`/`deleteCase`.
- The autonomous engine (`backgroundEngine`, `caseMonitor`, `orchestrator`)
  starts on mount; memory consolidation runs every 6h.

### AI Service Layer

**Text generation** flows through `services/deepseek.ts` → exported
`deepseekChat()` (name retained for backward compat, no longer calls DeepSeek).
It is a multi-provider router with this fallback chain:

1. **Server proxy** `POST /api/ai/chat` (`api/ai/chat.ts`, Vercel Edge) —
   the server-side chain is **Groq → Gemini → OpenRouter → GitHub Models
   (GPT-4o) → Cohere → OpenAI (paid, last-resort only)**. Free tiers first.
2. **Direct Gemini** client-side call (bypasses the 10s Vercel function
   timeout) — if a Gemini key is available.
3. **Direct Groq** client-side call — if a Groq key is available.

All wrapped with `retryWithBackoff` (429-rate-limit-aware, reads Gemini's
suggested `retryDelay`) and `withTimeout` (30s default) from
`utils/errorHandler.ts`. In `jsonMode`, responses are cleaned of markdown
fences (`cleanJsonResponse`) and the server proxy uses
`response_format: { type: "json_object" }`.

**Gemini** (`services/geminiService.ts`, `@google/genai` SDK) is retained for
**multimodal** functions DeepSeek/Groq can't handle: document analysis with
images (`analyzeDocument`), OCR, evidence analysis, and **live audio** in
`ArgumentPractice` (Gemini Live API, PCM 16kHz mono, function calling for
`raiseObjection`/`sendCoachingTip` — NOT JSON structured output). Most text
functions in `geminiService.ts` now delegate to `deepseekChat`/the `dsJson`
helper rather than calling Gemini directly.

**Voice services**: Deepgram STT (`services/deepgramService.ts`),
ElevenLabs TTS (`services/elevenlabsService.ts`), Cohere
(`services/cohere.ts`) for long-context document analysis. Runtime API keys
are fetched post-auth via `/api/ai/voice-keys` and cached on `window.__*`.

### Backend (Supabase + Vercel Functions)

- `services/supabaseClient.ts` — singleton client; `isSupabaseConfigured`
  gates auth + cloud sync. Anon key is public (RLS-protected).
- `services/authService.ts` — `onAuthStateChange`, `signOut`, `getSession`.
- `services/caseStore.ts` — case CRUD + realtime.
- `api/ai/chat.ts` — multi-provider AI proxy (Edge runtime).
- `api/ai/gemini.ts`, `ocr.ts`, `orchestrate.ts`, `voice-keys*.ts`.
- `api/cron/`, `api/email/`, `api/media/`, `api/stripe/`, `api/webhooks/`,
  `api/twilio-voice.ts`, `api/twilio-actions.ts`, `api/admin.ts`.

In local dev, `vite.config.ts` registers middleware stubs for
`/api/ai/gemini`, `/api/ai/voice-keys`, `/api/ai/orchestrate` so the frontend
works without the Vercel functions running.

### Agents (`agents/personas.ts`)

8 operational agents (Maya=Intake, Lex=Research, Doc=Documents, Rex=Trial,
Sol=Deadlines/SOL, Sierra, Jules, Max) + 12 legal specialists. Each has a
`systemInstruction`, `route`, and `capabilities`. Reusable `<AgentHeader />`
component in `components/`.

## Development Conventions

- **Styling**: Tailwind CSS (locally installed via `tailwind.config.js` +
  `postcss.config.js`, NOT CDN). Dark slate + gold theme:
  `bg-slate-950/900/800`, `text-gold-500/400`, `border-gold-500`. Light theme
  supported via `AppContext.theme`.
- **Path alias**: `@/*` → repo root (configured in `tsconfig.json` + `vite.config.ts`).
- **Pages are lazy-loaded** (`React.lazy`) in `App.tsx`; keep heavy deps out
  of the eager bundle (only `ErrorBoundary`, `ActiveCaseBar`, `CopilotSidebar`
  load eagerly).
- **TypeScript**: `target: ES2022`, `moduleResolution: bundler`, `jsx:
  react-jsx`, `noEmit: true`, `skipLibCheck`, `allowImportingTsExtensions`.
- **Error handling**: route through `utils/errorHandler.ts`
  (`handleError` shows a toast; `retryWithBackoff`/`withTimeout` wrap AI calls).
- **Comments**: default to none. Add only for non-obvious constraints/why.
- **No test framework** — when adding features, verify via `npm run build`
  (type-checks) and manual smoke testing. Use `MOCK_CASE_TEMPLATES` from
  `constants.ts` for fixture data (`MOCK_CASES` is intentionally empty).

## Key Gotchas

1. **Dev port is 5000**, not 3000.
2. **localStorage keys are `casebuddy_*`** — `lexsim_*` is legacy migration
   fallback only. (`AGENTS.md`/`CLAUDE.md` still say `lexsim_*` — wrong.)
3. **`MOCK_CASES` is intentionally empty** — use `MOCK_CASE_TEMPLATES`.
4. **`deepseekChat` no longer calls DeepSeek** — it's a multi-provider router.
   Don't "fix" callers to use a different import; the name is kept for compat.
5. **`GEMINI_API_KEY` must stay server-side in production** — fetch it at
   runtime via `/api/ai/voice-keys`, don't add a `VITE_` alias that bakes it
   into the bundle (see `vite.config.ts` security comment).
6. **`server/db.ts` is vestigial** (imports nonexistent `@shared/schema`),
   excluded from `tsconfig.json`, not wired to the frontend. Ignore it.
7. **Live audio** (ArgumentPractice) uses PCM 16kHz mono — standard browser
   formats (WebM/MP3) will NOT work with the Gemini Live API.
8. **Instruction files are synced** — `QWEN.md`, `AGENTS.md`, and
   `CLAUDE.md` describe the same architecture; update all three together when
   it changes. (An earlier version of these docs claimed a CDN importmap,
   DeepSeek as primary model, and Supabase as vestigial — all outdated.)
