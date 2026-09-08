# Maya Intake Recording Privacy Contract

Maya voice intake recordings exist for one purpose: **intake accuracy**. They are not public media, marketing assets, training data, or general-purpose call archives.

## Capture

- Voice recording requires affirmative prospect consent before `MediaRecorder` starts.
- Declining recording redirects the prospect to the secure text intake rather than recording them anyway.
- The spoken Maya disclosure remains an additional notice; it is not treated as the sole consent mechanism.
- The transcript may still be retained as part of the legal intake record according to the firm's normal intake-data policy.

## Routing and ownership

- Public intake links use opaque tokens; user UUIDs are never exposed in share links.
- The browser attaches the token as `X-Intake-Token`.
- PostgreSQL independently resolves that token through `resolve_public_intake_token()` and verifies that any claimed firm matches the token.
- In a multi-tenant deployment, anonymous intake without a referral token fails closed. A no-token fallback is allowed only when the database contains exactly one firm.

## Audio storage

- `intake-recordings` is always a private Supabase Storage bucket.
- Anonymous browsers have no general INSERT policy on the bucket.
- A public caller receives an intake-scoped signed upload token only after the server verifies the intake UUID, resume token, consent, and receiving firm.
- Recording object paths are bound to `<firm_id>/<intake_id>/<random-file>`.
- Upload paths cannot be overwritten.

## Staff playback

- Playback requires a valid authenticated CaseBuddy session and firm membership.
- The server verifies that the intake belongs to the caller's firm and that the recording path matches the same firm/intake custody prefix.
- Playback URLs expire after 60 seconds.
- Playback grants and denials are written to `intake_recording_access_events`.

## Retention

- Stored audio receives a default 90-day retention deadline.
- The daily Vercel retention job deletes expired audio from Storage and clears the live storage path from the intake row while keeping the audit/consent metadata.
- Purges are logged.
- A firm may adopt a different retention period when required by applicable law, ethics obligations, litigation hold, insurance requirements, or a documented client/firm policy. Such changes should be explicit rather than indefinite-by-default.

## Secrets and deployment

Required server-side configuration:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `CRON_SECRET`
- `ALLOWED_ORIGIN`

Optional server-side generic-route fallback:

- `CASEBUDDY_CANONICAL_FIRM_ID`

`VITE_*` variables remain browser-readable and must never contain service-role or provider secrets.
