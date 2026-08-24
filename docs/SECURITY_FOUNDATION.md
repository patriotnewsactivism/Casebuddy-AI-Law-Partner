# CaseBuddy Security Foundation

CaseBuddy handles legal matter data. Security defaults therefore favor confidentiality, tenant isolation, least privilege, and fail-closed behavior over convenience.

## Credential boundaries

- Browser-readable `VITE_*` variables are public configuration only.
- Permanent AI, voice, email, payment, repository, and service-role credentials stay in approved server runtimes.
- Public voice clients receive only short-lived provider tokens, never account API keys.
- Internal workers authenticate with dedicated high-entropy secrets that are independent from Supabase service-role credentials.
- Credentials are never returned in diagnostics, error responses, source maps, or client logs.

## Storage boundaries

- Matter documents and discovery material are private by default.
- Server workflows resolve short-lived signed URLs when a downstream processor needs temporary object access.
- Application code must not depend on public Storage bucket URLs as a rollback mechanism.
- Cross-tenant and cross-matter authorization must be enforced below the UI layer.

## Server and worker boundaries

- Privileged handlers validate required configuration before using service-role access.
- Missing authentication configuration causes requests to fail closed.
- Webhooks and workers with gateway JWT verification disabled must verify their own dedicated signature or secret before performing privileged work.
- Caller-supplied resource identifiers are resolved against server-side records and ownership boundaries before action.
- Upstream provider error bodies are not reflected to callers.

## AI boundaries

- AI output is assistive work product, not self-authenticating fact or controlling legal authority.
- Legal conclusions, citations, deadlines, filings, and client-facing advice require the appropriate verification and human review for the workflow.
- General web-research providers may support discovery and orientation, but they do not establish controlling legal authority.
- High-impact autonomous actions require explicit policy gates, auditable inputs, and an authorized human decision where professional responsibility requires one.

## Change control

Repository hardening does not itself alter production infrastructure. Changes to Storage visibility, deployed Edge Functions, database grants/RLS, signing material, or production credentials require a separately reviewed deployment or incident-response action.

## Verification gates

Before promotion:

1. Run `npm run verify:security`.
2. Confirm the client-secret sentinel passes.
3. Confirm the production build succeeds without browser provider credentials.
4. Exercise tenant and matter isolation tests for affected data paths.
5. Exercise invalid/missing/replayed credential tests for workers and webhooks.
6. Verify private-document upload, preview, OCR, export, and download paths using authenticated or signed access.
7. Review the deployment diff separately from any database or infrastructure changes.

## Governance references

- OpenAI Agents documentation: https://developers.openai.com/api/docs/guides/agents
- ABA Formal Opinion 512: https://www.americanbar.org/content/dam/aba/administrative/professional_responsibility/ethics-opinions/aba-formal-opinion-512.pdf
- NIST AI Risk Management Framework: https://www.nist.gov/itl/ai-risk-management-framework
