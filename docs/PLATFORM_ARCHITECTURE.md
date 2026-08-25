# CaseBuddy Canonical Platform Architecture

## Product boundary

`Casebuddy-AI-Law-Partner` is the canonical CaseBuddy commercial codebase and `casebuddy.live` is the canonical product entry point.

CaseBuddy is one legal-work platform serving:

- self-represented litigants and defendants;
- solo practitioners;
- small and growing firms;
- larger multi-attorney firms.

Audience differences should change permissions, workflow emphasis, collaboration, and licensing — not create separate products or separate data silos.

## Core product principle

Users should start with the legal problem or work to be accomplished, not with a module name.

`Ask CaseBuddy` is the universal conversational front door. It routes a request to the appropriate department or specialist while preserving the active matter context. Dedicated workspaces remain available for deep workflows such as discovery review, drafting, trial preparation, billing, and firm administration.

## Canonical data spine

Every feature should attach to a common ownership hierarchy instead of creating standalone application state:

```text
Firm / Account
  ├─ Members / roles / permissions
  ├─ Clients / contacts
  └─ Matters / cases
       ├─ Parties / counsel / witnesses
       ├─ Claims / charges / issues / defenses
       ├─ Documents / evidence / media
       │    ├─ originals + immutable hashes
       │    ├─ extracted text / OCR
       │    ├─ transcripts + page/time anchors
       │    ├─ Bates / exhibit metadata
       │    └─ analysis / tags / provenance
       ├─ Discovery / productions / privilege
       ├─ Timeline / events
       ├─ Research / authorities / citations
       ├─ Drafts / work product / versions
       ├─ Tasks / deadlines / approvals
       ├─ Communications / client updates
       ├─ Agent runs / tool calls / handoffs
       ├─ Billing / time / usage
       └─ Audit / access history
```

A document ingested once should be usable by Discovery, Ask CaseBuddy, Research, Drafting, Witness Prep, Trial Prep, client reporting, and case strategy without duplicate uploads or divergent ownership rules.

## Runtime architecture

### Web application

- React + TypeScript
- Vercel for the primary web application, CDN, and short-lived API endpoints
- Browser receives public configuration only; permanent provider credentials remain server-side

### Canonical backend

- Supabase PostgreSQL for relational matter state
- Supabase Auth for identity
- Row Level Security for firm/user/matter boundaries
- Supabase Storage for private evidence and work product
- Supabase Realtime where it materially improves collaboration
- PostgreSQL full-text/vector capabilities for matter retrieval

Do not add a second production application database without an explicit architecture decision showing why Supabase cannot meet the requirement.

### Heavy processing

Resource-intensive or long-running work should execute outside the browser and outside short request lifetimes:

- archive expansion;
- large PDF processing;
- OCR batches;
- ffmpeg/media conversion;
- transcription batches;
- embeddings and indexing;
- large discovery analysis runs;
- production/export generation;
- multi-document synthesis.

Render workers/workflows are the preferred external worker direction when Supabase Edge Functions or Vercel functions are not an appropriate runtime. Worker interfaces must be replaceable and authenticated; do not make beta-provider-specific behavior part of the domain model.

## Agent architecture

CaseBuddy should have one orchestrator and a controlled set of specialists rather than dozens of unrelated chatbots.

Initial departments:

- Intake and conflict screening
- Case / matter management
- Research
- Discovery and evidence
- Drafting and work product
- Deadlines and procedure
- Client communications / office operations
- Trial, witness, and deposition preparation
- Jury / persuasion analysis
- Firm operations

The orchestrator may route work to practice-area specialists when the legal domain matters more than the workflow type.

### Shared agent context

Agents should receive the same governed matter context assembled from canonical stores. They should not depend on raw localStorage as the long-term source of truth.

Context must preserve distinctions among:

- record facts;
- user allegations or recollections;
- AI/model inference;
- legal analysis;
- facts or authorities requiring verification.

### Autonomy levels

**May run automatically:**

- classify and organize documents;
- OCR/transcribe/index;
- summarize;
- identify issues, contradictions, dates, and possible missing records;
- prepare internal analysis and drafts;
- recommend tasks and research questions;
- generate internal status reports.

**Requires explicit review/approval before consequential side effects:**

- court filing or service;
- sending client/opposing-party communications;
- producing discovery externally;
- changing authoritative deadlines;
- deleting or destroying evidence/work product;
- spending money or purchasing services;
- making binding representations or commitments.

The UI must distinguish "prepared" from "performed."

## Discovery architecture

Discovery is a flagship CaseBuddy capability and the first major consolidation target.

### Ingestion

Accept:

- individual files;
- folders;
- nested ZIP archives;
- Google Drive / Dropbox imports;
- PDFs and Office documents;
- email/message exports;
- images;
- audio and video.

For each original:

1. verify file type and size;
2. calculate an immutable content hash;
3. deduplicate safely within tenant/matter scope;
4. store the original privately;
5. atomically reserve Bates numbers when applicable;
6. extract text or transcribe media;
7. preserve page/time offsets;
8. index searchable text;
9. perform structured analysis;
10. store every derived conclusion with provenance.

### Provenance contract

Substantive evidence findings should be traceable to the source, for example:

- `DEF-001842 p.17`
- `Interview-2026-05-12 00:34:12–00:35:05`

Never let cross-document synthesis sever the connection to the source material that supports it.

### Discovery intelligence

Target capabilities include:

- chronology extraction;
- people/organization/entity extraction;
- admissions;
- contradictions;
- favorable and adverse facts;
- credibility/impeachment issues;
- missing-record detection;
- privilege/confidentiality designation;
- near-duplicate detection;
- document comparison;
- custodians and communication maps;
- saved searches and issue coding;
- exhibits and trial binders;
- production and privilege-log exports.

## Legal research architecture

General web retrieval is not controlling legal authority.

CaseBuddy research should preserve source provenance and prioritize:

1. controlling statutes, rules, regulations, and court opinions;
2. official government/court sources;
3. reputable secondary authority;
4. general web sources for orientation only.

Research answers should preserve jurisdiction, court, citation, decision/publication date, source location, relevant passage/page, and retrieval date where available. The system must not invent authority when retrieval fails.

## Provider policy

Keep domain code provider-neutral.

AI, OCR, transcription, research, email, payments, and workers should sit behind explicit service interfaces so a provider can be changed without rewriting case/matter logic.

Current direction:

- OpenAI agent tooling: governed orchestration/evals where appropriate
- multi-provider model gateway: retain failover capability
- Deepgram / configured transcription fallbacks: voice/transcription
- Firecrawl / Exa / Tavily: retrieval and research discovery, not controlling authority
- Stripe: billing/licensing
- Resend: transactional email

## Observability and audit

Every background or agent operation should have:

- immutable run ID;
- tenant/user/matter IDs;
- initiating user/event;
- tool/provider used;
- timestamps and duration;
- input/output references rather than unnecessary copies of privileged data;
- success/failure state;
- approval state for consequential actions;
- retry/failure details safe for logs.

Legal-data access and external side effects should be auditable.

## Consolidation rules

1. Port capabilities, not entire legacy architectures.
2. Use the canonical Supabase ownership model.
3. Do not share service-role credentials across apps.
4. Do not make a private bucket public to ease migration.
5. Preserve tests and useful fixtures from donor repos.
6. Keep legacy subdomains only during verified transition windows.
7. Archive a donor repo only after feature parity, data migration, redirect behavior, and rollback boundaries are documented.
8. New shared CaseBuddy product work lands in the canonical repo by default.
