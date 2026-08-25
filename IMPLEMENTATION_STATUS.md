# CaseBuddy Implementation Status

_Last updated: 2026-08-24_

This file describes the **current canonical platform**. Older statements that CaseBuddy had no backend, no authentication, browser-exposed provider keys, or localStorage-only persistence referred to an early prototype and are no longer current.

Git history preserves that prototype-era status if it is needed for historical comparison.

## Canonical platform

Repository: `patriotnewsactivism/Casebuddy-AI-Law-Partner`

Production: `https://casebuddy.live`

Primary stack:

- React 19 + TypeScript + Vite
- Supabase Postgres/Auth/RLS/Storage
- Vercel
- server-side AI/provider credential handling
- authenticated background/Edge Function workflows

## Current product surfaces

Implemented or actively integrated in the canonical application:

- dashboard and case files;
- intake and public/client intake flows;
- evidence vault and discovery;
- document OCR/transcription/media workflows;
- strategy and legal-research surfaces;
- drafting/work product;
- deadlines/calendar/case pipeline;
- witness and deposition preparation;
- trial simulation and jury analysis;
- client portal/communications;
- AI specialist conversations and voice workflows;
- firm command, mail room, CRM/growth, billing, connected apps, and analytics;
- case-centered agent workflow orchestration.

Not every surface is at the same maturity level. A visible screen is not considered "done" merely because it renders; workflows must be verified against real canonical data, tenancy rules, provider configuration, and end-to-end tests before being classified as production-complete.

## Current consolidation work

CaseBuddy accumulated multiple experimental and partially overlapping repositories. The platform is now being consolidated into this repository rather than creating another successor app.

Current consolidation priorities:

1. **Universal Ask CaseBuddy experience** — users start with the problem/task; CaseBuddy routes the work automatically.
2. **Discovery consolidation** — merge the strongest ingestion, Bates, OCR, transcription, search, chronology, cross-document analysis, production, and provenance features from DiscoveryLens, case-companion, Discovery Scraper, and canonical services.
3. **Matter knowledge and work product** — source-attributed knowledge, legal research, templates, drafting, refinement, and version history.
4. **Litigation execution** — one coherent witness/deposition/hearing/trial/jury preparation system tied to the matter record.
5. **Firm operations** — multi-user assignments, auditability, client workflows, billing, CRM, management visibility, and enterprise controls.

See `docs/MODULE_MIGRATION_MATRIX.md` for the donor-repository disposition.

## Security state

The canonical application has undergone a production security-hardening pass covering browser credential exposure, internal worker authentication, RLS/view hardening, public-intake access, storage visibility, and sensitive Edge Function behavior.

Security remains an ongoing release gate, not a one-time milestone.

Normal production verification:

```bash
npm run build
```

The build runs:

1. `typecheck:security`
2. Vite production build
3. emitted client-bundle secret sentinel

The broader legacy `npm run typecheck` may expose unrelated historical TypeScript debt and should be repaired rather than removed from the repository.

## Data architecture direction

Supabase is the canonical application database/auth/storage platform.

New donor modules must use the existing tenant/firm/user/matter ownership model instead of creating a parallel datastore or authentication system.

The correct production Supabase project must be reconciled before applying donor-repository schema changes. Never replay old migrations blindly based only on filenames.

## Agent architecture direction

CaseBuddy uses one orchestrated legal-work system with a controlled set of departments/specialists rather than independent chatbots.

Agents may autonomously perform reversible internal work such as analysis, classification, summarization, drafting, issue spotting, and task recommendations.

Consequential external side effects — filings, service, client/opposing-party messages, external discovery production, evidence deletion, purchases, or binding commitments — require explicit review/authorization.

## Discovery quality bar

The target Discovery system must preserve source provenance.

Important conclusions should be traceable to the underlying source by Bates/page or media timestamp. Cross-document synthesis must not sever the link between a conclusion and the evidence supporting it.

Target features include:

- private original-file preservation and hashing;
- recursive archive/folder/cloud ingestion;
- atomic Bates reservation;
- OCR and media transcription;
- exact/full-text and semantic retrieval;
- chronology and entity extraction;
- admissions/contradictions/favorable/adverse findings;
- privilege/confidentiality/redaction workflows;
- document comparison and near-duplicate detection;
- exhibits, trial binders, privilege logs, and production exports.

## Definition of done for migrated features

A donor capability is not complete until:

- it uses canonical authentication and ownership boundaries;
- server-side secrets remain server-side;
- errors fail safely;
- matter context/provenance are preserved;
- tests or smoke checks cover the workflow;
- production deployment passes the security build gate;
- legacy data/links are migrated or intentionally retired;
- rollback behavior is understood.

## Next technical gate

Once the correct Supabase account/project is available again, reconcile:

- migration history;
- tables/functions/views;
- RLS policies and grants;
- storage buckets/object policies;
- Edge Functions/secrets;
- existing DiscoveryLens/case-companion shared schema assumptions.

Only after that reconciliation should new Discovery consolidation migrations be applied to production.
