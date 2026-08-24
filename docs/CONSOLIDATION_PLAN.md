# CaseBuddy Platform Consolidation Plan

## Canonical platform

`Casebuddy-AI-Law-Partner` is the canonical licensed CaseBuddy platform. New shared product capabilities should land here unless they are deliberately isolated as worker infrastructure.

## Repository disposition

### case-companion

Merge its strongest pro-se workflows, accessibility patterns, and tests into the canonical platform behind an appropriate product mode. After parity and data-migration verification, archive the redundant standalone application.

### CaseBuddy-DiscoveryLens

Merge its strongest discovery workflows into a first-class Discovery workspace inside CaseBuddy. Temporarily retain the existing DiscoveryLens subdomain while traffic, links, storage access, and user workflows are migrated. Archive redundant application code after parity is proven.

### Trial, OCR, transcription, and similar repositories

Import useful capabilities as bounded modules or workers with explicit interfaces, authentication, ownership validation, observability, and failure behavior. Archive redundant frontends/services after the canonical implementation is verified.

## Infrastructure direction

Keep as primary platform dependencies:

- Supabase for relational data, auth, and private object storage.
- Vercel for the primary web application and short-lived server endpoints.
- OpenAI agent tooling for governed agent workflows where it fits the task.
- Stripe for payments and billing.
- Resend for transactional email.

Use Render conditionally for long-running or resource-intensive workers that do not fit short-lived server execution.

Defer additional core datastore/runtime dependencies such as Neon, Convex, AppDeploy, and Hatchable until a concrete requirement outweighs the operational and security cost of another system.

## Research providers

Exa, Tavily, and Firecrawl may support general research, discovery, source collection, and orientation. They must not be treated as the source of controlling legal authority. Legal-authority workflows should preserve source provenance and verify primary authority through authoritative legal sources before relying on it.

## Consolidation rules

1. Preserve tenant, firm, matter, document, and user ownership boundaries during every import.
2. Prefer one canonical schema and one canonical authentication model over cross-app credential sharing.
3. Never solve migration friction by making legal data publicly readable.
4. Use signed or authenticated access for private objects across temporary compatibility layers.
5. Port tests with the workflow being merged, then add regression tests for the new canonical path.
6. Keep legacy subdomains only while they provide a concrete transition benefit.
7. Archive a redundant repository only after feature parity, data migration, redirects, and rollback boundaries are verified.
