# CaseBuddy Donor Repository Migration Matrix

This document records the initial repository audit for consolidating the CaseBuddy family into the canonical `Casebuddy-AI-Law-Partner` platform.

The rule is **port capabilities, tests, fixtures, prompts, and proven workflow logic — not entire legacy architectures**.

## Canonical repository

### `Casebuddy-AI-Law-Partner`

**Disposition:** KEEP / CANONICAL

**Role:** Commercial CaseBuddy platform and source of truth.

**Current strengths:**

- React 19 + TypeScript application
- Supabase Auth/Postgres/RLS/Storage
- Vercel deployment
- server-side provider credential handling
- multi-agent workflow orchestrator
- case-centered context assembly
- intake, case management, evidence, discovery, strategy, drafting, trial, witness, deposition, jury, client, billing, CRM, media, analytics, and firm operations surfaces

All shared product capabilities land here unless deliberately isolated as worker infrastructure.

---

## Tier 1 donor repositories — actively port from these

### `CaseBuddy-DiscoveryLens`

**Disposition:** IMPORT CORE CAPABILITIES → then redirect/archive standalone frontend

**Priority:** HIGHEST

**Port:**

- atomic Bates reservation
- recursive/nested ZIP expansion with safety caps
- format-aware extraction for PDF/DOCX/text-like files
- scanned-document OCR fallback strategy
- ffmpeg audio extraction/downsampling
- Deepgram + AssemblyAI transcription fallback pattern
- multi-provider analysis abstraction
- chronology extraction using structured date/event pairs
- Postgres full-text search
- cross-document Key Evidence synthesis with Bates citations
- signed-URL rehydration for persisted documents
- worker/job-queue concepts for bulk processing
- CLI/power-user workflow concepts where useful

**Do not port:**

- separate Next.js product shell
- separate authentication model
- duplicate project/case ownership concepts
- assumptions that bypass canonical CaseBuddy tenant boundaries

**Transition:** keep `discovery.casebuddy.live` only until canonical `/app/discovery` reaches parity and old links/storage paths are migrated.

### `case-companion`

**Disposition:** IMPORT SELECTED MATURE WORKFLOWS → then redirect/archive standalone frontend

**Priority:** HIGH

**Port:**

- Google Drive recursive import flow
- import-job progress model
- mature OCR/document-analysis patterns not already superseded
- trial-prep checklist
- trial binder ideas
- chronology/timeline features
- deposition workflow concepts
- Jitsi/video-room integration only if it remains preferable to the canonical conferencing direction
- useful Supabase tests/migrations after schema reconciliation

**Do not port:**

- separate frontend/navigation as a second product
- duplicate auth/session paths
- stale provider configuration or public-browser secrets

**Transition:** `companion.casebuddy.live` becomes a compatibility redirect/deep link after parity.

### `casebuddy-ai`

**Disposition:** IMPORT FEATURE MODULES → archive after parity

**Priority:** HIGH

The generic README understates this repository. The source contains concrete modules worth reviewing and porting:

- Client Portal
- Conflict Checker
- Deadlines & SOL
- Discovery Miner
- Docket Monitor
- Document Lab
- E-Filing
- FOIA Engine
- Legal Research Hub
- Settlement Calculator
- War Room
- onboarding patterns

**Rule:** port the best module implementation into canonical services/components; do not preserve its separate app shell or schema as a second system.

### `Casebuddy-Professional`

**Disposition:** IMPORT ENTERPRISE/SECURITY PATTERNS → archive app after parity

**Priority:** HIGH for enterprise readiness

**Port:**

- audit-log patterns
- authenticated WebSocket collaboration/presence concepts
- rate-limiting patterns
- CSRF/security-header patterns where relevant to the actual deployment model
- file upload MIME/signature validation
- secure filename/path handling
- collaboration/session ideas
- health/readiness concepts for worker services

**Do not port:**

- custom authentication as a replacement for Supabase Auth
- Drizzle/Cloud SQL schema as a second application database
- cloud deployment duplication that does not serve the canonical stack

### `casebuddyAI`

**Disposition:** IMPORT KNOWLEDGE/DOCUMENT GENERATION IDEAS → archive old implementation

**Priority:** HIGH

**Port:**

- source-attributed matter knowledge extraction
- structured document templates
- iterative document improvement
- concept/category browsing
- generated-document history/version ideas
- knowledge-to-drafting workflow

**Rebuild:** against canonical Supabase matter/document/work-product tables. The old in-memory persistence model is not acceptable for the licensed platform.

### `Casebuddy-AI-Trial-Prep`

**Disposition:** IMPORT AGENT/TRIAL LOGIC → archive redundant frontend

**Priority:** HIGH

**Port:**

- specialist department model
- jury simulation logic/personas
- trial coaching workflows
- intake handoff concepts
- shared case-file agent coordination ideas

**Evolve:** agents into governed CaseBuddy specialists with explicit tool/approval boundaries. Do not represent fictional personas as real human attorneys.

### `Casebuddy--Discovery-Scraper`

**Disposition:** IMPORT INGESTION IDEAS → archive standalone app

**Priority:** HIGH within Discovery workstream

**Port:**

- recursive local/Drive scanning concepts
- multi-format ingestion
- automatic Bates assignment concepts
- relevance scoring
- high-value-document flagging
- evidence/entity extraction concepts

**Replace:** localStorage Bates state with canonical atomic database reservation.

---

## Tier 2 donors — harvest selectively

### `casebuddy-pro` and `casebuddy-plus`

**Disposition:** DIFF → IMPORT UNIQUE DATA/WORKFLOW IDEAS → archive

The repositories appear to be closely related evolutionary branches.

**Useful concepts:**

- discovery file model
- timeline events
- deposition prep
- suggested filings
- legal briefs
- cloud folders
- persistent AI conversations/messages
- case export concepts

Do not import their unauthenticated/alternate database architecture.

### `CaseBuddy-Unified`

**Disposition:** USE AS FEATURE INVENTORY / REFERENCE, NOT CANONICAL

This repo is valuable as a checklist of previous consolidation work. Verify each claimed module against source before assuming parity.

Inventory includes:

- jury simulator
- Discovery Miner
- OCR/Bates Document Lab
- trial-prep checklist/binder
- timeline
- deposition manager
- conflict checker
- research
- e-filing
- Docket Monitor
- FOIA
- settlement calculator
- video evidence
- War Room
- agent personas and voice

### `CaseBuddyAdvance`

**Disposition:** HARVEST UX/WORKFLOW IDEAS → archive

**Potentially useful:**

- evidence taxonomy
- filings/procedure guides
- witness/task organization
- tactical trial-prep ideas
- older templates

Architecture is obsolete for the canonical platform.

### `Casebuddy-OCR` / `CaseBuddy--Document-OCR`

**Disposition:** HARVEST PROVIDER ADAPTERS / TEST FIXTURES IF UNIQUE → archive

Do not keep separate OCR frontends. OCR is a service capability behind canonical document/discovery ingestion.

---

## Tier 3 — likely archive after final source diff

### `casebuddy` and `casebuddy-app`

**Disposition:** ARCHIVE after final diff

These are effectively duplicate browser-only/static portals using localStorage/base64 persistence. Their useful case/evidence/timeline/FOIA concepts are already surpassed by canonical implementations.

### `voice-chatbot-casebuddy`

**Disposition:** ARCHIVE after preserving integration notes

Primarily an integration-plan shell. Voice belongs inside Ask CaseBuddy / specialist conversations rather than as a separate product.

### `ai-legal-interview`

**Disposition:** ARCHIVE after preserving any unique intake prompts/notes

Primarily an integration-plan shell. Intake belongs in canonical CaseBuddy.

### `legal-transcription-tools`

**Disposition:** ARCHIVE after preserving any unique transcription tests/notes

Transcription belongs behind the canonical media/document pipeline.

### Empty/minimal 2026 shells

Repositories such as `Casebuddy2026` and `casebuddypro2026` should be archived if a final source/history inspection confirms they contain no unique code or migration history.

---

## Quarantine until diffed

Do not archive these until an automated/manual source comparison confirms no unique capability:

- `casebuddy-react`
- `casebuddy-your-ai-legal-ally`
- `CaseBuddy---Trial-Preparation-`
- other CaseBuddy-named repositories discovered after this audit

For every newly found repository:

1. inspect README/package/dependency metadata;
2. inspect routes/pages/services/database/migrations;
3. search for unique feature names;
4. compare against canonical implementations;
5. record disposition here;
6. only then archive.

---

## Migration workstreams

### Workstream A — Universal CaseBuddy interaction

- Ask CaseBuddy request router
- automatic department/specialist selection
- active matter context
- conversational history
- voice
- tool/action planning
- explicit approval gates for consequential actions

### Workstream B — Discovery

Donors: DiscoveryLens + case-companion + Discovery Scraper + canonical discovery/OCR/transcription code.

Target: one canonical evidence/discovery ingestion, search, analysis, chronology, production, privilege, and export system.

### Workstream C — Work product / knowledge

Donors: casebuddyAI + casebuddy-pro/plus + canonical Drafting/Knowledge Base.

Target: matter knowledge, verified authority, templates, drafting, refinement, version history, citation/source provenance.

### Workstream D — Litigation execution

Donors: Trial Prep + case-companion + CaseBuddyAdvance + canonical trial/witness/deposition/jury tools.

Target: one hearing/deposition/trial preparation system tied to the actual matter record.

### Workstream E — Firm operations

Donors: Casebuddy-Professional + casebuddy-ai + canonical intake/client/billing/CRM/analytics/firm command.

Target: role-based multi-user workflows, auditability, assignments, client communication, billing, growth, and management visibility.

---

## Archive gate

A donor repository may be archived only when all applicable conditions are true:

- unique capabilities have been ported or explicitly rejected;
- canonical tests cover the ported workflow;
- live data/storage dependencies have been migrated or proven absent;
- old domains/links have redirects or documented retirement;
- credentials from legacy repos have been reviewed/rotated as needed;
- rollback path exists for the transition window;
- this matrix records the final disposition.
