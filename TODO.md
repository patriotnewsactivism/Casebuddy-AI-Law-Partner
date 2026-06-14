# CaseBuddy AI-Lawfirm — Master TODO & Roadmap
> Last updated: 2026-06-13 | Managed by Superagent
> Engineering guide for AI agents & contributors: see `CLAUDE.md`

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
- ⬜ Maya: Update `IntakePage.tsx` name + persona header + violet chat bubble
- ⬜ Assign remaining agents (Lex, Doc, Sol, Sierra, Max) to their module pages

### 1.2 Agent Assignment Map
| Agent | Module | File | Status |
|-------|--------|------|--------|
| **Maya** | Case Intake | `CaseManager.tsx` | ⬜ Header to add |
| **Lex** | Legal Research Hub | `StrategyRoom.tsx` | ⬜ Header to add |
| **Doc** | Document Lab + Discovery | `DraftingAssistant.tsx` | ⬜ Header to add |
| **Rex** | Trial Coach + Witness Prep | `WitnessPrep.tsx` | ✅ |
| **Sol** | Deadlines & SOL Tracker | `DeadlineTracker.tsx` | ✅ |
| **Sierra** | Legal Secretary | `ClientUpdate.tsx` | ⬜ Header to add |
| **Jules** | Jury Simulator | `JurySimulator.tsx` | ✅ |
| **Max** | E-Filing & Records | `Integrations.tsx` | ⬜ Header to add |

### 1.3 Meet the Team — Dashboard Section
- ✅ Add "Meet the Team" section to `Dashboard.tsx`
- ✅ Display all 8 agents as cards (name, role, emoji, route link)
- ✅ Each card links to the agent's module
- ⬜ Add agent availability status indicators (could show "busy" when AI is running)

---

## 🔴 PRIORITY 2 — Missing Pages

### 2.1 Witness Prep Page (`/witnesses`) — Agent: Rex
- ✅ Create `components/WitnessPrep.tsx`
- ✅ Add route `/app/witnesses` in `App.tsx`
- ✅ Add to sidebar nav under "Courtroom Prep"
- ✅ Input witness name, role, relationship to case
- ✅ AI generates direct examination questions (organized by topic)
- ✅ AI generates cross-examination questions (organized by topic)
- ✅ Impeachment strategy + credibility assessment (vulnerabilities, danger zones, opening gambit, closing question)
- ✅ Export questions as printable PDF outline (print-to-PDF via browser print dialog)
- ✅ Multi-witness roster with per-witness saved prep packages (localStorage)

### 2.2 Jury Simulator Page (`/jury-sim`) — Agent: Jules
- ✅ Create `components/JurySimulator.tsx`
- ✅ Add route `/app/jury-sim` in `App.tsx`
- ✅ Add to sidebar nav under "Courtroom Prep"
- ✅ 6 AI jurors with distinct personalities (preset panel of diverse jurors)
- ✅ Present opening statement → get per-juror reactions
- ✅ Persuasion meter per juror (0–100) with animated bar
- ✅ Juror deliberation simulation (8–12 exchange drama)
- ✅ Verdict probability tracker (guilty/not guilty vote + confidence)
- ✅ Closing argument feedback (modes: opening / evidence / closing / rebuttal)

### 2.3 Legal Team Page (`/legal-team`) — NEW FEATURE (user request)
- ✅ Create `components/LegalTeam.tsx`
- ✅ Add route `/app/legal-team` in `App.tsx`
- ✅ Add to sidebar nav under "Legal Team" group
- ✅ 12 AI specialist lawyers: Criminal, PI, Family, Immigration, IP, Corporate, Employment, Real Estate, Bankruptcy, Civil Lit, Estate Planning, Tax
- ✅ Full multi-turn chat with each specialist
- ✅ Active case context injected into all consultations automatically
- ✅ Voice input on chat interface (Web Speech API)
- ✅ Quick-start topic buttons per specialist
- ✅ Consultation history persisted per specialist (session)
- ✅ Disclaimer on all legal advice responses
- ✅ Persist consultation history to localStorage across sessions (key: `casebuddy_legal_sessions`)
- ⬜ Export consultation transcript as PDF

---

## 🟠 PRIORITY 3 — API Integrations

All integration service stubs written in `services/integrationService.ts`.
View status at `/app/integrations` (the Integrations page shows configured vs. not).

### 3.1 CourtListener API (Free — Real Case Law)
- ✅ Service stub: `searchCaseLaw()` in `integrationService.ts`
- 🔑 Add `VITE_COURTLISTENER_API_KEY` to `.env.local` to activate
- ⬜ Integrate into StrategyRoom / Lex's module as a search tab
- ⬜ Sign up at https://www.courtlistener.com/register/

### 3.2 PACER API (Federal Court Records)
- ✅ Service stub: `searchPacer()` in `integrationService.ts`
- 🏗️ Requires backend proxy (credentials must stay server-side)
- ⬜ Register at https://pacer.uscourts.gov/register-account
- ⬜ Add backend route `/api/pacer/search`

### 3.3 Stripe (SaaS Billing) 💰
- ✅ Service stub: `createCheckoutSession()` in `integrationService.ts`
- ✅ Pricing page at `/pricing` with Pro Se ($99/mo) and Law Firm ($499/mo) tiers
- 🏗️ Requires backend proxy (`STRIPE_SECRET_KEY` must stay server-side)
- ⬜ Create account at https://stripe.com
- ⬜ Add backend route `/api/stripe/create-checkout`
- ⬜ Add `VITE_STRIPE_PUBLISHABLE_KEY` to `.env.local`
- ⬜ Build subscription gate on premium features
- ⬜ Add billing portal in Settings

### 3.4 Twilio (SMS + Deadline Alerts)
- ✅ Service stubs: `sendSmsAlert()`, `scheduleDeadlineAlert()` in `integrationService.ts`
- 🏗️ Requires backend proxy (Twilio credentials must stay server-side)
- ⬜ Create account at https://twilio.com
- ⬜ Add backend route `/api/twilio/send-sms`
- ⬜ Add `VITE_TWILIO_ACCOUNT_SID` to `.env.local` (used for feature detection only)

### 3.5 DocuSign API (E-Signatures)
- ✅ Service stubs: `createSignatureEnvelope()`, `getEnvelopeStatus()` in `integrationService.ts`
- 🏗️ Requires backend proxy
- ⬜ Create dev account at https://developers.docusign.com
- ⬜ Add backend routes `/api/docusign/create-envelope` and `/api/docusign/envelope/:id/status`
- ⬜ Integrate into DraftingAssistant and Integrations page UI

### 3.6 Deepgram (Voice Transcription) ✅ API Key Saved
- ✅ Service stubs: `transcribeWithDeeepgram()`, `startDeepgramLiveSession()` in `integrationService.ts`
- 🔑 Add `VITE_DEEPGRAM_API_KEY` to `.env.local` to activate (key already obtained)
- ⬜ Add Deepgram mic button to WitnessLab chat input (falls back to Web Speech API without key)
- ⬜ Add deposition transcription toggle in Transcriber page

### 3.7 SendGrid (Transactional Email)
- ✅ Service stubs: `sendEmail()`, `sendCaseUpdateEmail()` in `integrationService.ts`
- 🏗️ Requires backend proxy (`SENDGRID_API_KEY` must stay server-side)
- ⬜ Create account at https://sendgrid.com
- ⬜ Add backend route `/api/sendgrid/send`
- ⬜ Wire `sendCaseUpdateEmail()` to ClientUpdate component's "Send via Email" button

### 3.8 Cal.com API (Consultation Booking)
- ✅ Service stubs: `createBooking()`, `getAvailability()` in `integrationService.ts`
- 🔑 Add `VITE_CALCOM_API_KEY` to `.env.local` to activate
- ⬜ Build booking widget in ClientUpdate or a new Appointments page

### 3.9 Lob API (Certified Physical Mail)
- ✅ Service stub: `sendCertifiedMail()` in `integrationService.ts`
- 🏗️ Requires backend proxy
- ⬜ Create account at https://lob.com
- ⬜ Add backend route `/api/lob/send-letter`
- ⬜ Wire to DraftingAssistant "Send as Certified Mail" button

### 3.10 Tyler Technologies eFile API (Direct Court Filing)
- ✅ Service stub: `eFileDocument()` in `integrationService.ts`
- 🏗️ Requires backend proxy + API access application
- ⬜ Research supported states and apply at https://www.tylertech.com

### 3.11 Westlaw / Casetext (Premium Legal Research)
- ✅ Stub listed in `INTEGRATIONS` config in `integrationService.ts`
- 🏗️ Requires commercial agreement + backend proxy
- ⬜ Contact Thomson Reuters or Casetext for API access

### 3.12 Google Maps / Places API (Courthouse Finder)
- ✅ Service stub: `findNearbyCourthouses()` in `integrationService.ts`
- 🔑 Add `VITE_GOOGLE_MAPS_KEY` to `.env.local` to activate (browser-callable)
- ⬜ Build courthouse finder UI in EvidenceVault or a new Locations widget

---

## 🟡 PRIORITY 4 — Feature Enhancements

### 4.1 Voice Input Everywhere
- ✅ Voice input on LegalTeam chat (Web Speech API, no external dep)
- ✅ Shared `VoiceMicButton` component extracted to `components/VoiceMicButton.tsx`
- ✅ Add Web Speech API mic button to WitnessLab chat input
- ✅ Add mic button to DraftingAssistant (instructions field)
- ✅ Add mic button to StatementBuilder (theory of case field)
- ✅ Add mic button to DepositionPrep (strategy field)

### 4.2 PDF Export
- ✅ WitnessPrep packages export via browser print dialog (print-to-PDF)
- ⬜ Export intake summaries, document analysis, consultation transcripts

### 4.3 Case File System + Cloud Sync
- ✅ `utils/storage.ts` — localStorage persistence for cases, active case, preferences, trial sessions
- ✅ App.tsx now wires localStorage on load and saves on every case change
- ✅ Convex schema defined: `convex/schema.ts` (cases, trialSessions, witnessPrepPackages, consultationSessions)
- ✅ Convex mutations written: `convex/cases.ts`
- 🏗️ To activate Convex cloud sync:
  1. `npm install convex`
  2. `npx convex dev` (authenticate + deploy)
  3. Add `VITE_CONVEX_URL=https://your-deployment.convex.cloud` to `.env.local`
  4. Wrap `<App>` in `<ConvexProvider client={convex}>` in `index.tsx`
- ⬜ Wire Convex mutations into CaseManager add/update/delete flows
- ⬜ Build `ActiveCaseBar` component injected at top of each module page
- ⬜ Build conflict checker (cross-reference new parties against existing case files)
- ⬜ Public client intake link at `/start` (clients talk to Maya, case lands in firm)

### 4.4 White-Label Mode
- ⬜ Platform-wide firm name + color theme in Settings
- ⬜ Firm logo upload (stored in localStorage / Supabase Storage)
- ⬜ Hide CaseBuddy branding in white-label mode

### 4.5 Mobile PWA Polish
- ✅ `manifest.json` created with theme color, icons, app name
- ✅ `manifest.json` linked in `index.html` with theme-color meta tag
- ⬜ Service worker for offline capability
- ⬜ Push notifications for deadlines (requires backend + VAPID keys)
- ⬜ Mobile-optimized touch targets for all pages

---

## 🔵 PRIORITY 5 — Growth & Sales

### 5.1 Pricing Page
- ✅ Create `components/Pricing.tsx` at route `/pricing`
- ✅ Pro Se plan ($99/mo) and Law Firm plan ($499/mo)
- ✅ Add-ons table (team members, SMS, DocuSign, CourtListener, Tyler)
- 🏗️ Stripe Checkout integration (needs Stripe account — see 3.3)

### 5.2 Onboarding Flow
- ✅ First-time user welcome modal `OnboardingModal.tsx` (5-step tour)
- ✅ Shows agents, specialist lawyers, tool highlights, API key setup
- ✅ Persists dismissal to localStorage (never shows again once closed)
- ⬜ Guided in-app product tour (highlight specific UI elements step by step)
- ⬜ "Start with Maya" CTA on dashboard → walks through creating first case

### 5.3 Analytics
- ⬜ Add PostHog or Mixpanel (privacy-respecting)
- ⬜ Track: most-used modules, intake completion rate, doc uploads, trial sessions
- ⬜ Billable-hours-saved tracker per agent action (ROI metric for dashboard)

### 5.4 SEO & Marketing
- ⬜ Complete `SeoPages.tsx` — landing pages per practice area + state
- ⬜ Submit sitemap to Google Search Console
- ⬜ Add LegalService structured data schema to landing page

---

## 🤖 AGENTIC ENHANCEMENTS (beyond original roadmap)

These are the additional features suggested to make CaseBuddy truly agentic:

### Agent Memory & Context
- ⬜ Persistent conversation memory for each specialist (localStorage + Convex sync)
- ⬜ Case handoff notes: when Maya creates a case, auto-brief Sol (deadlines), Doc (documents), Rex (trial dates)
- ⬜ Agent "war room" view — see all agents' tasks on a single active case

### Autonomous Monitoring
- ⬜ Sol: background deadline watcher that alerts when a statute of limitations is approaching
- ⬜ Auto SOL calculator: input case type + incident date → Sol calculates deadline + files reminder
- ⬜ Court date countdown widget on Dashboard

### Multi-Agent Workflows
- ⬜ Maya intake → auto-creates case → briefs Lex (research), Doc (draft retainer), Sol (SOL deadline), Max (file watch)
- ✅ "Send to Agent" panel: CaseManager shows quick links to Trial Simulator (Rex), Witness Prep (Rex), Jury Sim (Jules), Strategy Room (Lex), Deadline Tracker (Sol)
- ✅ Verdict Predictor → "Consult Jules" + "Run Jury Simulation" cross-links

### Voice & Real-Time
- ⬜ Firm-wide floating voice assistant (push-to-talk, any page) — calls the most relevant agent
- ⬜ Real-time case note dictation with auto-tagging to active case

### Lead Generation (Sierra)
- ⬜ Public `/start` intake widget powered by Maya (no login required)
- ⬜ Sierra emits `<LEAD_CAPTURED>` → promotes to case stub → briefs all departments
- ⬜ Leads board in Dashboard (potential clients vs. active cases)
