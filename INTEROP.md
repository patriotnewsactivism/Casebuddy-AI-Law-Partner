# CaseBuddy Suite — Cross-App Interoperability Contract

Three apps, **one shared cloud**. This document is the contract the three
CaseBuddy products implement so they build on each other instead of siloing
data. It lives in `casebuddy-ai-law-partner` (the hub) and is the source of
truth for `Case-Companion` and `casebuddy-discoverylens`.

| App | `source_app` id | Role |
|-----|-----------------|------|
| **CaseBuddy Law Partner** | `law-partner` | Full agentic AI firm — start-to-end case management for the best outcome. Full automation. |
| **Case Companion** | `companion` | Personalized high-end product for a single lawyer or pro-se litigant to manage their case(s). |
| **DiscoveryLens** | `discoverylens` | Precision document intelligence — extract key facts, save for retrieval, intelligently rename, Bates-stamp. |

## 1. Shared backend

All three apps point at the **same Supabase project** (`jpzkumgndqsdwimbvjku`).
Because storage is shared, "sync" is not a copy — it's **provenance + adoption**:
a row created in any app already exists for the others; syncing tags it so the
target app surfaces it.

### Identity
- Scope every row to the practice with **`firm_id`** (see `caseStore.getFirmId()` /
  `firm_memberships` + `get_user_firm_id()`), and to the creator with `user_id`
  (defaults to `auth.uid()`).
- A case's stable cloud row id is a **UUID v5** derived from its app id
  (`caseStore.deriveCaseRowId(appId)`) so every app maps a case to exactly one
  row idempotently.

## 2. Shared tables & the sync columns

Both `documents` and `cases` carry:

| Column | Meaning |
|--------|---------|
| `source_app text` | Which app created the row (`law-partner` / `companion` / `discoverylens`). Set on insert; never rewritten. |
| `synced_to text[]` | Apps that have adopted/surfaced the row. Appended to on push/adopt. |

Every push/pull is recorded in **`app_sync_events`** (`entity_type`,
`entity_id`, `from_app`, `to_app`, `action`, `metadata`) so each app can render
a live sync feed and reconcile. RLS: firm members read; authenticated insert.

### `documents` — the shared document model (already DiscoveryLens-grade)
Key fields every app reads/writes:
`name`, `document_type`, `document_date`, `bates_prefix`, `bates_formatted`,
`ai_suggested_name`, `summary`, `key_facts`, `favorable_findings`,
`adverse_findings`, `entities`, `ocr_text`, `extracted_text`, `ocr_provider`,
`file_url`, `storage_path`, `status`, `source_app`, `synced_to`, `case_id`.

A DiscoveryLens upload therefore lands in a shape law-partner and companion
already understand — no translation needed.

## 3. DiscoveryLens signature features — shared helpers

Implemented in `services/documentNaming.ts` so all three apps behave identically:

### Intelligent filename
`intelligentFileName(extractedText, originalName, { caseCaption })` →
```
2026-03-15-Motion-to-Dismiss-ReardonvGalveston.pdf
```
- **Date**: operative date pulled from the document (filing/signature date for
  court filings), `YYYY-MM-DD`.
- **Title**: document type in Title Case (Motion to Dismiss, Complaint, …).
- **Caption**: `Party v Party` short form.
- AI-assisted via the shared `/api/ai/chat` proxy, with a deterministic regex
  fallback (`extractDateFromText`, `slugifyTitle`) for offline use.

### Bates numbering
`nextBatesNumber(caseRowId, prefix)` + `formatBates(prefix, n)` → `RG-000042`.
Reads the shared `documents` table so numbering is continuous across apps.

## 4. Sync operations (hub API — `services/interopSync.ts`)

| Function | What it does |
|----------|--------------|
| `adoptDocumentIntoCase(documentId, caseAppId, target)` | The "sync DiscoveryLens upload into Law Partner / Companion with one click" path — assigns the shared doc to a case + tags `synced_to`. |
| `pushCaseToApp(caseAppId, target)` | Surface a case in another app's workspace. |
| `listDocumentsFromApp(source, { unassignedOnly })` | Feed of documents another app produced, ready to adopt. |
| `listCasesFromApp(source)` | Cases another app created. |
| `recentSyncEvents()` | Cross-app activity feed. |
| `exportCaseBundle(case)` / `isValidCbif()` | Portable **CBIF** envelope for backup / cross-*project* transfer. |

## 5. CBIF — CaseBuddy Interchange Format (v1.0)

For transfer to a **separate** deployment (within the shared project, prefer
push/adopt — no copy needed). A versioned JSON envelope:

```jsonc
{
  "cbif_version": "1.0",
  "exported_at": "2026-07-06T…Z",
  "exported_by_app": "law-partner",
  "firm_id": "…",
  "case": { "id": "…", "title": "…", /* Case fields */ },
  "documents": [
    {
      "name": "2026-03-15-Motion-to-Dismiss-ReardonvGalveston.pdf",
      "document_type": "Motion",
      "document_date": "2026-03-15",
      "bates_formatted": "RG-000042",
      "summary": "…", "key_facts": [], "favorable_findings": [],
      "adverse_findings": [], "ocr_text": "…", "file_url": "…",
      "source_app": "discoverylens"
    }
  ]
}
```

## 6. What each app must implement

**All apps**
- On document insert, set `source_app` to your app id.
- Use `documentNaming` for rename + Bates so output is identical.
- Read `synced_to`/`source_app` to show provenance and a "synced from X" badge.

**DiscoveryLens**
- Write uploads to `documents` with extraction + Bates + `ai_suggested_name`,
  `source_app='discoverylens'`, `case_id=null` until adopted.
- Offer "Send to Law Partner / Companion" → `adoptDocumentIntoCase(...)`.

**Law Partner / Companion**
- Surface a "From DiscoveryLens" tray (`listDocumentsFromApp('discoverylens', { unassignedOnly:true })`)
  with one-click adopt into a case (see `components/ConnectedApps.tsx`).
- Expose "Push this case to …" (`pushCaseToApp`).

## 7. Migration

`supabase/migrations/20260706_cross_app_sync.sql` (applied to prod
2026-07-06): adds `source_app` + `synced_to` to `documents`/`cases`, creates
`app_sync_events` with RLS + realtime.
