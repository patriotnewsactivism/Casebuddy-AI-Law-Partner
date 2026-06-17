# AGENTS.md

CaseBuddy is an AI-powered legal trial preparation platform (React 19, TypeScript, Vite). Internal package name is `lexsim`.

## Commands

```bash
npm run dev          # Start dev server on port 5000 (not 3000)
npm run build        # Production build to dist/
npm run preview      # Preview production build
```

There is no `lint`, `typecheck`, or `test` command in package.json.

## Environment

Set `GEMINI_API_KEY` and `DEEPSEEK_API_KEY` in `.env.local`. Vite exposes them as:
- Gemini: `process.env.API_KEY`, `process.env.GEMINI_API_KEY`, `import.meta.env.VITE_GEMINI_API_KEY`
- DeepSeek: `process.env.DEEPSEEK_API_KEY`, `import.meta.env.VITE_DEEPSEEK_API_KEY`

(all defined in `vite.config.ts`)

## Critical: Importmap CDN Architecture

**Third-party runtime dependencies are loaded from CDN via an importmap in `index.html`, NOT bundled by Vite.** `npm install` only installs devDependencies (typescript, vite, @vitejs/plugin-react, @types/node). The packages listed in `dependencies` in package.json serve as type declarations only — they are not actually bundled.

Runtime imports resolve to:
- `react`, `react-dom`, `react-router-dom`, `lucide-react`, `recharts`, `react-toastify` → aistudiocdn.com / jsdelivr
- `@google/genai` → aistudiocdn.com

Tailwind CSS is also loaded from CDN (`https://cdn.tailwindcss.com`) with config defined inline in `index.html`. There is no local Tailwind installation, PostCSS config, or `tailwind.config.js`.

**DO NOT** add new npm runtime dependencies expecting them to bundle. They must be added to the importmap in `index.html`.

## Project Layout

Source files live at **repo root** (no `src/` directory):

```
App.tsx           # App shell, HashRouter, AppContext, Sidebar, Layout
index.tsx         # Entry point
index.html        # Importmap, Tailwind CDN config
types.ts          # All TypeScript types/enums
constants.ts      # MOCK_CASES (intentionally empty), MOCK_CASE_TEMPLATES
components/       # One file per page/feature (36 files)
services/         # geminiService.ts — all Gemini API calls
utils/            # errorHandler.ts, storage.ts, fileValidation.ts
agents/           # personas.ts — 8 operational agents + 12 legal specialists
server/           # db.ts — Drizzle/Postgres stub (vestigial); ignore it
supabase/         # Supabase CLI state files only
```

## Routing (HashRouter — required for static hosting)

Public: `/`, `/privacy-policy`, `/tos`, `/pricing`

App (wrapped in `<Layout>` with sidebar):
`/app` `/app/cases` `/app/evidence` `/app/practice` `/app/witness-lab`
`/app/witnesses` `/app/jury` `/app/jury-sim` `/app/deposition`
`/app/statements` `/app/docs` `/app/strategy` `/app/verdict`
`/app/transcriber` `/app/client-update` `/app/settings`
`/app/legal-team` `/app/integrations` `/app/deadlines`
`/app/document-center` `/app/intake` `/app/deadline-engine`
`/app/case-strength` `/app/foia`

The `<AICopilot />` component renders globally in every Layout page.

## State & Storage

`AppContext` (App.tsx) manages `cases`, `activeCaseId`, `activeCase`, `setActiveCase`, `addCase`. Storage is persisted to localStorage by `utils/storage.ts` using keys prefixed `lexsim_*` (legacy name). `AppContext` calls `saveCases`/`saveActiveCaseId` explicitly — there is no auto-sync layer.

## AI Service

**Primary model: DeepSeek `deepseek-chat`** via OpenAI-compatible API (`services/deepseek.ts`). All text generation (strategies, witness simulation, document drafting, jury analysis, specialist consulting) routes through DeepSeek.

**Gemini (`@google/genai`) is retained only for multimodal functions** that DeepSeek cannot handle:
- `transcribeAudio`, `performOCR`, `analyzeEvidence` (file upload) in `geminiService.ts`
- Live audio in ArgumentPractice (`gemini-2.5-flash-native-audio-preview-09-2025`, PCM 16kHz mono)

**None of the Gemini models use thinkingConfig.** The `deepseek-chat` model does not support think mode either.

The `deepseekChat()` wrapper in `services/deepseek.ts` handles all API calls with `retryWithBackoff` (3 retries) + `withTimeout` (30s default). When jsonMode is set, it uses DeepSeek's `response_format: { type: "json_object" }` and cleans markdown wrappers from the response.

## Audio Gotcha

Live audio (ArgumentPractice) uses PCM 16kHz mono input/output. Standard browser audio formats (WebM, MP3) will not work with the Gemini Live API. The Live API uses function calling (`raiseObjection`, `sendCoachingTip`), not JSON structured output.

## Styling

Dark slate + gold: `bg-slate-950/900/800`, `text-gold-500/400`, `border-gold-500`. Config defined inline in `index.html`.

## Path Alias

`@/*` → repo root (tsconfig.json + vite.config.ts).

## Key Gotchas

1. Dev port is **5000**, not 3000
2. `MOCK_CASES` is intentionally empty — use `MOCK_CASE_TEMPLATES` for fixture data
3. `server/db.ts` imports `@shared/schema` which doesn't exist; the file is not wired to the frontend
4. localStorage keys use `lexsim_*` prefix (legacy from before CaseBuddy rebrand)
5. `agents/personas.ts` defines 8 operational agents (Maya, Lex, Doc, Rex, Sol, Sierra, Jules, Max) and 12 legal specialists — the `AgentHeader.tsx` reusable component is already implemented
