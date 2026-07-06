# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**CaseBuddy** is an AI-powered legal trial preparation platform built with React 19, TypeScript, and Vite. The internal package name is `lexsim` (a legacy holdover — the brand is CaseBuddy). It integrates with Google's Gemini AI to provide:

- Interactive witness examination simulations
- AI-driven trial strategy analysis
- Real-time courtroom practice with live voice interaction
- Legal document analysis and drafting assistance
- Jury analysis, deposition prep, evidence vault, verdict prediction

## Development Commands

```bash
npm install          # Install dependencies
npm run dev          # Development server at http://localhost:5000
npm run build        # Production build
npm run preview      # Preview production build
```

### Environment Setup
- Set `GEMINI_API_KEY` in `.env.local`
- Vite exposes it as `process.env.API_KEY`, `process.env.GEMINI_API_KEY`, and `import.meta.env.VITE_GEMINI_API_KEY` (all three aliases are defined in `vite.config.ts`)

## Architecture

### Project Layout

All source files live at the **repository root** (no `src/` directory):

```
App.tsx          # Application shell, routing, AppContext, Sidebar
index.tsx        # Entry point
index.css        # Global styles (Tailwind)
types.ts         # All TypeScript types and enums
constants.ts     # MOCK_CASES (intentionally empty), MOCK_WITNESSES, MOCK_OPPONENT, MOCK_CASE_TEMPLATES
components/      # One file per page/feature
services/        # geminiService.ts — all Gemini API calls
utils/           # errorHandler.ts, storage.ts, fileValidation.ts
server/          # db.ts — Drizzle/Postgres stub (vestigial, not wired to the Vite frontend)
supabase/        # Supabase CLI state files
```

### Routing (BrowserRouter — Standard Routing)

Public routes (no Layout wrapper):
- `/` → `LandingPage`
- `/privacy-policy` → `PrivacyPolicy`
- `/tos` → `TermsOfService`

App routes (wrapped in `<Layout>` with sidebar):
- `/app` → Dashboard
- `/app/cases` → CaseManager (Case Files)
- `/app/evidence` → EvidenceVault
- `/app/practice` → ArgumentPractice (Trial Simulator — live audio)
- `/app/witness-lab` → WitnessLab
- `/app/jury` → JuryAnalyzer
- `/app/deposition` → DepositionPrep
- `/app/statements` → StatementBuilder
- `/app/docs` → DraftingAssistant
- `/app/strategy` → StrategyRoom (thinking models)
- `/app/verdict` → VerdictPredictor
- `/app/transcriber` → Transcriber & OCR
- `/app/client-update` → ClientUpdate
- `/app/settings` → Settings

### State Management

`AppContext` (defined in `App.tsx`) provides global case state:
- `cases: Case[]` / `activeCase: Case | null` / `setActiveCase` / `addCase`

`utils/storage.ts` provides localStorage persistence with `lexsim_*` keys for cases, active case ID, user preferences, and trial sessions. The storage utilities exist and work but must be explicitly called — `AppContext` does **not** auto-persist on its own.

### AI Service Layer (`services/geminiService.ts`)

All Gemini API calls go through here, wrapped with `retryWithBackoff` (3 retries, exponential backoff) and `withTimeout` (30s default) from `utils/errorHandler.ts`.

Key functions:
- **analyzeDocument** — structured JSON extraction from legal documents (text + image)
- **generateWitnessResponse** — personality-driven witness simulation (hostile/nervous/cooperative)
- **predictStrategy** — deep strategy analysis using `gemini-2.5-pro` with `thinkingConfig`
- **generateOpponentResponse** — opposing counsel simulation
- **getCoachingTip** — rhetorical feedback with fallacy detection
- **getTrialSimSystemInstruction** — dynamic system prompt for multi-phase trial simulation

**Models in use:**
- `gemini-2.5-flash` — fast chat, witness/opponent simulation
- `gemini-2.5-pro` — strategy (with `thinkingConfig: { thinkingBudget: 2048 }`)
- `gemini-live-2.5-flash-preview` — live audio in ArgumentPractice

**Patterns:**
- All non-live responses use `responseMimeType: "application/json"` + `responseSchema` for type-safe structured output
- Live API (ArgumentPractice only) uses function calling: `raiseObjection` and `sendCoachingTip`
- Audio: PCM 16kHz mono input/output — **not** standard WebM/MP3

### Type System (`types.ts`)

- `Case` — case metadata with `winProbability`
- `CaseStatus` — enum: PRE_TRIAL, DISCOVERY, TRIAL, APPEAL, CLOSED
- `DocumentType` — DEPOSITION, MOTION, EVIDENCE, CONTRACT, OTHER
- `TrialPhase` — union of 8 phase strings (pre-trial-motions through sentencing)
- `SimulationMode` — `'learn' | 'practice' | 'trial'`
- `Witness` — with `personality` string and `credibilityScore`
- `Message` — sender: `'user' | 'witness' | 'system' | 'opponent' | 'coach'`
- `CoachingAnalysis` — includes `fallaciesIdentified`, `rhetoricalEffectiveness`, `teleprompterScript`
- `OpposingProfile` — aggressiveness/settlement tendency modeling
- `Transcription` — audio transcription with optional speaker diarization

### Styling

Tailwind CSS with a dark slate + gold color scheme:
- Backgrounds: `bg-slate-950`, `bg-slate-900`, `bg-slate-800`
- Accents: `text-gold-500`, `text-gold-400`, `border-gold-500`

### Path Aliases

`@/*` maps to the repository root (configured in `tsconfig.json` and `vite.config.ts`).

## Key Gotchas

1. **API key**: Must be `GEMINI_API_KEY` in `.env.local` (Vite exposes it via 3 aliases — see `vite.config.ts`)
2. **Dev port is 5000**, not 3000
3. **`MOCK_CASES` is intentionally empty** — use `MOCK_CASE_TEMPLATES` in `constants.ts` for simulation templates
4. **Live audio format**: 16kHz PCM mono only — standard browser audio formats won't work with the Live API
5. **`server/db.ts`** is a Drizzle/Postgres stub that imports `@shared/schema` (which doesn't exist) — it is not wired to the Vite frontend and should be ignored unless adding a real backend
6. **localStorage keys** are prefixed `lexsim_*` — a legacy name from before the CaseBuddy rebrand

## Planned Work (see `TODO.md`)

Key upcoming features tracked in `TODO.md`:
- **Agent personas**: 8 named AI agents (Maya, Lex, Doc, Rex, Sol, Sierra, Jules, Max) to be assigned to each module via `src/agents/personas.ts` and a reusable `<AgentHeader />` component
- **JurySimulator page** (`/jury` — currently `JuryAnalyzer` exists; full simulator is planned)
- **WitnessPrep page** (`/witnesses` — route exists in plan but not yet in `App.tsx`)
- **API integrations**: CourtListener, PACER, Stripe, Twilio, DocuSign, Deepgram, SendGrid, Cal.com
- **Supabase cloud sync** for the case store (localStorage + cloud merge)
- **PDF export** for witness prep packages and intake summaries

## Testing

No test framework is configured. When adding tests, mock Gemini API responses to avoid live API calls, and use `MOCK_CASE_TEMPLATES` from `constants.ts` as fixture data.
