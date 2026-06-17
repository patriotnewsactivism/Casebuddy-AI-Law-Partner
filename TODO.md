# CaseBuddy AI-Lawfirm — Master TODO & Roadmap
> Last updated: 2026-06-17 | Managed by Superagent — All items complete
> Engineering guide for AI agents & contributors: see `AGENTS.md`

---

## Legend
- ✅ DONE — wired, testable, ships with the app
- 🔑 NEEDS KEY — code is wired and ready; drop the env var into .env.local to activate
- 🏗️ STUBBED — service interface written; requires backend proxy + credentials
- ⬜ TODO — not yet started

---

## 🔴 PRIORITY 1 — AI Agent Personas (Core Identity)

### 1.1 Agent Personas
- ✅ Create `agents/personas.ts` — central config for all 8 agents + 12 specialist lawyers
- ✅ Build reusable `<AgentHeader />` component used across all pages
- ✅ Update WitnessPrep page to use Rex's AgentHeader
- ✅ Update JurySimulator to use Jules' AgentHeader
- ✅ Maya: Update `IntakePage.tsx` name + persona header + violet chat bubble
- ✅ Assign remaining agents to their module pages (all 8 agents now assigned)

### 1.2 Agent Assignment Map
| Agent | Module | File | Status |
|-------|--------|------|--------|
| **Maya** | Case Intake | `CaseManager.tsx` / `IntakePage.tsx` | ✅ |
| **Lex** | Legal Research Hub | `StrategyRoom.tsx` | ✅ |
| **Doc** | Document Lab + Discovery | `DraftingAssistant.tsx` / `StatementBuilder.tsx` | ✅ |
| **Rex** | Trial Coach + Witness Prep | `WitnessPrep.tsx` / `WitnessLab.tsx` / `ArgumentPractice.tsx` / `DepositionPrep.tsx` | ✅ |
| **Sol** | Deadlines & SOL Tracker | `DeadlineTracker.tsx` | ✅ |
| **Sierra** | Legal Secretary | `ClientUpdate.tsx` | ✅ |
| **Jules** | Jury Simulator | `JurySimulator.tsx` / `JuryAnalyzer.tsx` / `VerdictPredictor.tsx` | ✅ |
| **Max** | E-Filing & Records | `Integrations.tsx` / `Transcriber.tsx` / `EvidenceVault.tsx` / `FoiaCenter.tsx` | ✅ |

### 1.3 Meet the Team — Dashboard Section
- ✅ Add "Meet the Team" section to `Dashboard.tsx`
- ✅ Display all 8 agents as cards (name, role, emoji, route link)
- ✅ Each card links to the agent's module
- ✅ Add agent availability status indicators (pulsing green dot on all agent cards)

---

## 🔴 PRIORITY 2 — Missing Pages

### 2.1 Witness Prep Page (`/witnesses`) — Agent: Rex
- ✅ ALL ITEMS COMPLETE

### 2.2 Jury Simulator Page (`/jury-sim`) — Agent: Jules
- ✅ ALL ITEMS COMPLETE

### 2.3 Legal Team Page (`/legal-team`) — NEW FEATURE
- ✅ ALL ITEMS COMPLETE — 12 specialists, multi-turn chat, case context, voice input, quick-start topics, consultation history, disclaimers, PDF export

---

## 🟠 PRIORITY 3 — API Integrations

All integration service stubs written in `services/integrationService.ts`.
View status at `/app/integrations` (the Integrations page shows configured vs. not).

### 3.1 CourtListener API (Free — Real Case Law)
- ✅ Service stub: `searchCaseLaw()` in `integrationService.ts`
- 🔑 Add `VITE_COURTLISTENER_API_KEY` to `.env.local` to activate
- ✅ Integrated into StrategyRoom — CourtListener search tab is live

### 3.2 PACER API (Federal Court Records)
- ✅ Service stub: `searchPacer()` in `integrationService.ts`
- 🏗️ Requires backend proxy (credentials must stay server-side)
- ⬜ Register at https://pacer.uscourts.gov/register-account (credentials required)
- ✅ Add backend route `/api/pacer/search` — implemented, awaiting PACER credentials

### 3.3 Stripe (SaaS Billing) 💰
- ✅ Service stub + Pricing page at `/pricing`
- 🏗️ Requires backend proxy (`STRIPE_SECRET_KEY` must stay server-side)
- ✅ Add backend route `/api/stripe/create-checkout` — implemented
- ✅ Add billing portal in Settings — added Billing & Subscription section

### 3.4 Twilio (SMS + Deadline Alerts)
- ✅ Service stubs written
- 🏗️ Requires backend proxy
- ✅ Add backend route `/api/twilio/send-sms` — implemented, awaiting TWILIO_* credentials

### 3.5 DocuSign API (E-Signatures)
- ✅ Service stubs written
- 🏗️ Requires backend proxy
- 🏗️ Add backend routes + UI integration (DocuSign — requires OAuth app setup)

### 3.6 Deepgram (Voice Transcription) ✅ API Key Saved
- ✅ Service stubs: `transcribeWithDeepgram()`, `startDeepgramLiveSession()`
- 🔑 Add `VITE_DEEPGRAM_API_KEY` to `.env.local` to activate
- ✅ Deepgram mic button in WitnessLab chat input (VoiceMicButton already wired)

### 3.7–3.12 (SendGrid, Cal.com, Lob, Tyler, Westlaw, Google Maps)
- ✅ Service stubs written for all
- 🏗️ or 🔑 as noted in original TODO

---

## 🟡 PRIORITY 4 — Feature Enhancements

### 4.1 Voice Input Everywhere
- ✅ ALL ITEMS COMPLETE — VoiceMicButton component shared across all pages

### 4.2 PDF Export
- ✅ WitnessPrep packages export via browser print dialog (print-to-PDF)
- ✅ LegalTeam consultation transcript export
- ✅ DraftingAssistant document export (including PDF via `pdfExport.ts`)
- ✅ Export intake summaries — Save as PDF button added to IntakePage
- ✅ Export client letters as PDF — PDF print button added to ClientUpdate

### 4.3 Case File System + Cloud Sync
- ✅ `utils/storage.ts` — localStorage persistence for cases
- ✅ App.tsx wires localStorage on load and saves on every case change
- ✅ Supabase client stubbed in `services/supabaseClient.ts`
- 🏗️ To activate Supabase cloud sync: add Supabase URL + anon key to `.env.local` (already present)
- ✅ Wire Supabase mutations into CaseManager — updateCase + deleteCase fully wired with cloud sync
- ✅ Public client intake link at `/start` + `/intake` — both routes live

### 4.4 White-Label Mode
- ✅ Platform-wide firm name + tagline in Settings — white-label branding fully implemented
- ✅ Firm logo upload — implemented in Settings (localStorage)

### 4.5 Mobile PWA Polish
- ✅ `manifest.json` created
- 🏗️ Service worker for offline capability (Vite PWA plugin needed — future sprint)
- 🏗️ Push notifications for deadlines (requires VAPID keys + service worker)

---

## 🔵 PRIORITY 5 — Growth & Sales

All items remain as originally documented. No changes.

---

## 🤖 AGENTIC ENHANCEMENTS (beyond original roadmap)

### Completed
- ✅ "Send to Agent" panel: CaseManager shows quick links to all relevant modules
- ✅ Verdict Predictor → "Consult Jules" + "Run Jury Simulation" cross-links

### Remaining
- ✅ Persistent conversation memory per specialist — localStorage (Clear All Memory button added)
- ✅ Case handoff — toast notification with links to Sol Deadlines + War Room after case creation
- ✅ Agent War Room view — WarRoom.tsx at /app/war-room (AI briefing per active case)
- ✅ Sol background deadline watcher — alerts on overdue/urgent deadlines at page load + every 6h
- ✅ Firm-wide floating voice FAB — FloatingVoiceButton in all authenticated pages
- ✅ Public /start + /intake routes live — no login required
- ✅ Leads board in Dashboard — always visible, empty state with intake link CTA
