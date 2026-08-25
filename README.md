# CaseBuddy

**Legal work, unified.**

CaseBuddy is an all-in-one agentic legal-work platform for self-represented litigants and defendants, solo practitioners, and multi-attorney law firms. It brings case management, evidence and discovery, legal research, drafting, deadlines, client workflows, trial preparation, and firm operations into one matter-centered system.

Production: `https://casebuddy.live`

## Product direction

CaseBuddy is one product — not a collection of separate “AI law partner,” “case companion,” discovery, OCR, and trial-prep applications.

The canonical commercial codebase is this repository. Strong capabilities from older CaseBuddy repositories are being migrated here behind a common authentication, tenancy, matter, document, and audit model.

See:

- [`docs/PLATFORM_ARCHITECTURE.md`](./docs/PLATFORM_ARCHITECTURE.md)
- [`docs/MODULE_MIGRATION_MATRIX.md`](./docs/MODULE_MIGRATION_MATRIX.md)
- [`docs/CONSOLIDATION_PLAN.md`](./docs/CONSOLIDATION_PLAN.md)
- [`SECURITY.md`](./SECURITY.md)

## Core experience

### Ask CaseBuddy

Users should be able to start with the legal problem or task rather than guessing which module to open.

Ask CaseBuddy routes a plain-English request to the appropriate legal-work department or practice-area specialist while keeping the active matter context attached. Dedicated workspaces remain available when the user needs a deeper workflow.

### Matter-centered workspaces

Current platform areas include:

- case files and intake;
- evidence vault and discovery;
- OCR and transcription;
- legal research and strategy;
- drafting and work product;
- deadlines and case pipeline;
- witness and deposition preparation;
- trial and jury simulation;
- client portal and communications;
- billing, CRM/growth, analytics, and firm command;
- connected-app and media workflows.

## Architecture

### Web

- React 19 + TypeScript
- Vite
- Tailwind CSS
- Vercel production hosting and short-lived API routes

### Backend

- Supabase PostgreSQL
- Supabase Auth
- Row Level Security
- Supabase Storage for private matter files
- Realtime where useful for collaboration

### AI / voice

Permanent third-party provider credentials stay server-side. Browser code uses CaseBuddy server endpoints or short-lived provider grants where supported.

The model/provider layer is intentionally replaceable. Domain logic should not depend on one model vendor.

### Background processing

Supabase Edge Functions and authenticated workers handle asynchronous work. Long-running discovery/media/OCR/export workloads may be moved to dedicated worker infrastructure when request-lifetime limits make that appropriate.

## Security principles

CaseBuddy handles information that can be confidential, privileged, or highly sensitive.

- No permanent AI/provider secrets in browser bundles.
- Tenant, firm, user, and matter boundaries are enforced at the data layer.
- Sensitive object storage is private; temporary access uses authenticated or signed URLs.
- Service-role and internal worker credentials are server-only.
- Consequential external actions should remain reviewable and require explicit authorization.
- Agent/research output must distinguish record facts, allegations, inference, legal analysis, and items requiring verification.

The normal production build includes a client-secret sentinel:

```bash
npm run build
```

This runs the security-focused TypeScript gate, Vite production build, and emitted-bundle credential scan.

## Development

Prerequisite: Node.js 18+.

```bash
npm install
npm run dev
```

Production verification:

```bash
npm run build
```

Additional scripts:

```bash
npm run typecheck
npm run typecheck:security
npm run check:client-secrets
npm run verify:security
```

Environment configuration belongs in local/deployment secrets. Use `.env.example` for variable names and never commit real credentials.

## Consolidation policy

New shared CaseBuddy product work lands here by default.

Legacy CaseBuddy repositories are donor sources. Useful capabilities, prompts, tests, migrations, and workflow logic are ported into the canonical platform. Redundant frontends and services are archived only after parity, data migration, redirects, credentials, and rollback boundaries are verified.

The first major consolidation workstream is **Discovery**, combining the strongest parts of DiscoveryLens, case-companion, the Discovery Scraper, and the existing canonical document/OCR/transcription pipeline.

## Legal-use boundary

CaseBuddy assists with organization, research, analysis, drafting, preparation, and legal workflows. It does not guarantee outcomes and must not represent fictional AI personas as real licensed attorneys. Users should obtain licensed legal counsel where appropriate.
