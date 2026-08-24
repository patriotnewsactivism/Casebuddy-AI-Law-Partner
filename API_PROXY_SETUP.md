# CaseBuddy API Proxy & Credential Boundary

CaseBuddy uses a **server-mediated credential model**. Permanent provider credentials must never be delivered to browser JavaScript, stored in `window`, or exposed through client-prefixed environment variables.

The current implementation already includes server endpoints for Vercel and Netlify. A separate Express backend is **not required** for the standard deployment.

## Security rules

1. **Permanent provider credentials are server-only.**
   Keep Gemini, Groq, OpenAI, Deepgram, ElevenLabs, Azure Vision, GitHub, email-provider, service-role, worker, and similar secrets in the hosting platform's server environment or Supabase Edge Function secrets.
2. **Do not create browser-prefixed versions of provider secrets.**
   In particular, do not add provider API keys to `VITE_*` variables. CaseBuddy's Vite configuration intentionally prevents arbitrary client-prefixed values from being bundled.
3. **Only explicitly public configuration belongs in the browser.**
   Current examples include the Supabase project URL, Supabase anon key, firm identifier, Azure Vision endpoint, and Stripe publishable key. The Supabase anon key is public by design; authorization must still be enforced with RLS and server-side controls.
4. **AI requests use server proxies.**
   Frontend code should call the repository's `/api/*` endpoints instead of calling paid/provider APIs with long-lived credentials from the browser.
5. **Voice uses short-lived credentials.**
   Voice credential endpoints grant a short-lived Deepgram bearer token. They must not return the underlying Deepgram API key or unrelated AI-provider credentials.
6. **Privileged worker-to-worker calls use dedicated secrets.**
   Do not reuse the Supabase service-role key as a generic function invocation credential.
7. **Storage objects containing case material are private.**
   Server workers should obtain short-lived signed URLs when a provider needs temporary access to a document.
8. **Fail closed.**
   Missing authentication, worker secrets, provider configuration, or signing configuration must disable the privileged operation rather than silently falling back to a browser credential.

## Current request paths

### AI text and multimodal requests

Use the existing server endpoints, including the relevant `/api/ai/*` routes. Provider credentials are read only by server handlers.

Frontend pattern:

```ts
const response = await fetch('/api/ai/chat', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(payload),
});

if (!response.ok) {
  throw new Error(`AI request failed (${response.status})`);
}

const result = await response.json();
```

Do **not** add a fallback that reads a provider key from `import.meta.env` or `window` and calls the provider directly.

### Voice Agent

The browser requests a temporary credential from:

- authenticated users: `/api/ai/voice-keys`
- public intake: `/api/ai/voice-keys-public`

The response contains a short-lived Deepgram bearer token and expiration metadata, not a permanent provider API key. The Voice Agent WebSocket authenticates with that temporary token.

Both the Vercel and Netlify implementations must preserve this contract.

### OCR and document processing

OCR/provider keys remain server-side. Case documents should remain in private storage and be exposed to processing services only through short-lived signed URLs when required.

## Environment layout

### Public browser configuration

These values may be intentionally exposed when needed by the client:

```bash
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
VITE_FIRM_ID=
VITE_AZURE_VISION_ENDPOINT=
VITE_STRIPE_PUBLISHABLE_KEY=
```

Do not infer from the `VITE_` prefix that another value is safe. The list above is an explicit allow-list for this application.

### Server-only configuration

Examples:

```bash
GEMINI_API_KEY=
GROQ_API_KEY=
OPENAI_API_KEY=
DEEPGRAM_API_KEY=
ELEVENLABS_API_KEY=
AZURE_VISION_KEY=
COURTLISTENER_API_KEY=
GITHUB_TOKEN=
SUPABASE_SERVICE_ROLE_KEY=
PIPELINE_WORKER_SECRET=
PIPELINE_ORCHESTRATOR_SECRET=
CRON_SECRET=
SENDGRID_API_KEY=
RESEND_API_KEY=
TWILIO_AUTH_TOKEN=
STRIPE_SECRET_KEY=
```

This is not an exhaustive inventory. If a value grants privileged access, costs money, bypasses authorization, signs requests, or permits data mutation, treat it as server-only unless the provider explicitly defines it as public.

## Vite boundary

`vite.config.ts` deliberately disables automatic exposure of arbitrary `VITE_*` values. Public values are explicitly defined. Legacy provider-key references are compiled to empty values so they fail closed rather than inheriting a hosting-platform environment secret.

Do not weaken this boundary to make an old browser integration work. Move that integration behind a server endpoint instead.

## Build verification

The normal build runs three security-relevant stages:

```bash
npm run typecheck:security
vite build
npm run check:client-secrets
```

The final stage scans the emitted `dist` artifacts for configured sensitive values and recognized credential signatures. A failed credential scan is a deployment blocker; fix the source of the exposure rather than excluding the finding.

For the complete security model and deployment boundary, see [`docs/SECURITY_FOUNDATION.md`](docs/SECURITY_FOUNDATION.md).

## Deployment checklist

- [ ] Provider credentials exist only in server/Edge Function secret stores.
- [ ] No permanent provider key is returned by a browser-facing API route.
- [ ] Voice endpoints return only short-lived credentials and non-secret capability metadata.
- [ ] Supabase service-role credentials are not used as generic worker authentication.
- [ ] Sensitive document buckets are private and workers use signed URLs.
- [ ] Server endpoints enforce authentication/authorization appropriate to the route.
- [ ] CORS is restricted to the intended application origin where practical.
- [ ] `npm run build` passes, including the emitted-bundle secret scan.
- [ ] Preview deployment is tested before production promotion.
- [ ] Credentials suspected of prior exposure are rotated through the provider's secret-management workflow after the hardened code is deployed.

## If a feature still expects a browser key

Treat that as technical debt, not as a reason to re-enable browser credentials. The safe migration pattern is:

1. identify the provider operation the browser is performing;
2. add or reuse an authenticated server endpoint for that operation;
3. move the provider credential to server-only configuration;
4. update the client to call the endpoint;
5. verify the emitted browser bundle contains no credential material;
6. remove the obsolete client-key configuration and documentation.
