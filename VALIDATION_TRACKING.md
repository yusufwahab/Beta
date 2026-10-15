# Beta validation tracking

Background tracking records real product usage without adding trader screens, forms,
navigation or confirmation steps. The separate team page is **`/admin/validation`**.

## Installed database changes

On 2026-10-15, these migrations were successfully installed in the database configured
in `server/.env`:

- `supabase/migrations/202610120002_validation.sql`
- `supabase/migrations/202610150001_validation_integrity.sql`

They create `validation_sessions`, `validation_events`, indexes, deduplication keys,
foreign keys, a collision-free participant-ID sequence, RLS policies and restricted
grants. **No participants or interaction evidence were seeded.** Existing Beta business
tables and records were not rewritten. Keep `AUTO_MIGRATE=false` for the manually
initialized database until its original migration history is reconciled.

For another manually initialized Beta database, run from the repository root:

```powershell
node infra/install_validation.mjs --check
node infra/install_validation.mjs --apply
```

The installer only applies missing validation migrations in a transaction. Databases
already managed by the automatic migration runner should use
`npm.cmd run migrate -w server` instead, to retain checksum history.

## Required configuration

The actual local `server/.env` now contains:

```env
VALIDATION_MODE=test
```

- `test`: development/test traffic is recorded separately and excluded from live totals.
- `live`: use during trials with actual participants.
- `off`: disables recording; existing business actions remain available.

Before real-user trials, set **`VALIDATION_MODE=live`** in the backend environment
(Render, or `server/.env` for localhost trials), then restart/redeploy the backend.
Do not change modes midway through a participant's trial. A user has a separate row
per mode so developer history is never silently promoted into live evidence.
No frontend secret or new N-ATLAS credential is needed.

## Team-only access

Use a confirmed, non-anonymous Supabase team account. Create it through Supabase
Authentication → Users if needed. Copy its Auth user UUID, then run:

```powershell
node infra/validation_admin.mjs --user-id YOUR_TEAM_AUTH_USER_UUID
```

This uses the existing backend service-role key to set the server-owned
`app_metadata.beta_validation_admin=true`. It preserves other app metadata. Sign in
again afterward. To revoke access:

```powershell
node infra/validation_admin.mjs --user-id YOUR_TEAM_AUTH_USER_UUID --revoke
```

Visit `/admin/validation` in a **separate browser profile** and sign in with that
team account. This preserves the anonymous trader session in the testing browser.
There is no admin link in trader navigation. Every admin API request independently
verifies the Supabase user and app metadata. User metadata, URL keys and client event
payloads cannot grant access. Team accounts are automatically excluded from trial totals.

## What is counted

- A participant ID such as `BETA-001` is allocated by PostgreSQL. Reloads and returns
  reuse the same `(Supabase user, mode)` row. IDs can have gaps after rolled-back
  transactions; the progress indicator counts rows with evidence, never ID numbers.
- **Live Participants Documented / 50** counts non-excluded live identities with
  server-side N-ATLAS success, or a failed processing attempt that actually reached
  the provider-call boundary. Opening the page or submitting client telemetry alone
  does not increment this count.
- **Team-confirmed distinct people / 50** is a separate count. Logs cannot prove that
  two browser accounts belong to two different humans. During real-person testing,
  the team confirms each anonymous participant in the dashboard and excludes duplicate
  identities, team tests or withdrawn records. No trader enters validation information.
- Voice interactions count distinct `(session, recording interaction ID)` combinations
  with a recording start or server processing start. Uploads are included without
  inventing a recording-start event.
- Success/failure and average processing duration use server ASR results. Retry rate
  counts observed recording interactions retried, divided by recording interactions.
- Recording cancellation counts only recording-phase cancellation, not discarding an
  already transcribed draft. Edit percentage uses participants with server ASR evidence.
- Completed sale/expense/stock/debt workflows use successful backend save results,
  deduplicated by actual record ID. Previews do not count. An idempotent save retry
  cannot create extra saved/completed events.
- Voice end-to-end workflows require a server-completed workflow correlated to a
  successful ASR event for that same participant and interaction.
- `core_flow_completed` covers sale, expense, stock, debt and explicit voice business
  summary queries. Business setup is documented as onboarding but does not by itself
  set this core-flow flag.

Language breakdown uses the participant's most recent selected language. Each event
retains its own language, so a trader who switches language is not counted twice.
`started_at` is the first visit for that identity/mode. `completed_at` is the most recent
successful core workflow or page-hide completion signal; `last_seen_at` records activity.
These rows aggregate return visits, rather than manufacturing a participant per visit.

## Evidence and privacy

Recorded event types:

```text
VOICE_STARTED, VOICE_PAUSED, VOICE_RESUMED, VOICE_CANCELLED, VOICE_SUBMITTED
NATLAS_PROCESSING_STARTED, NATLAS_SUCCESS, NATLAS_FAILED
TRANSCRIPT_RETRY, TRANSCRIPT_EDITED, RESULT_CONFIRMED
TRANSACTION_SAVED, FLOW_COMPLETED
```

Recording controls and some edit/confirmation intent events are **device-reported**.
N-ATLAS results, interpreted-result edit validation, saved transactions and completed
workflows are **server events**. The client endpoint rejects server-only event types.
All rows retain their provenance. The dashboard timeline labels these sources clearly.

The server measures processing time. Client event times have bounded clock-skew
checks; receipt time is retained separately. The UI displays Africa/Lagos times.
Session identity is resolved from authenticated Supabase tokens; a browser cannot
submit events into another participant's session. Event IDs deduplicate retried batches.

Validation records contain **no names, email addresses, phone values, transcripts,
raw recordings, product names, prices, amounts, IP addresses or raw user-agent strings**.
An edited field is recorded as a type such as `quantity`, never its value. Device/browser
information is bucketed. Metadata is a strict allowlist of safe flags and model IDs.
No recording-storage feature is enabled or implemented by this tracking addition.

An internal Auth UUID is retained only to deduplicate identity and enforce RLS; this is
pseudonymous data, not irreversible anonymization. It is excluded from admin responses
and exports. Direct browser roles have no validation-table grants. Express uses the
existing non-login `beta_api` role with per-user RLS and a transaction-local admin scope.

Tracking failures do not roll back legitimate business actions: financial evidence uses
a savepoint inside the existing transaction. ASR and UI breadcrumbs are best effort;
network failures, tab termination or a tracking outage can lose events. They never
create substitute evidence. A backend warning identifies unavailable tracking.

## Dashboard and exports

The dashboard includes progress, language counts, voice interaction/ASR metrics, retry
and edit rates, cancellations, saved workflow counts and core-flow completion. Select
a participant for chronological evidence, source labels, durations, edited field types
and success/failure. Review controls mark distinct real people and exclude duplicates
or tests without deleting the audit history.

Exports are authenticated downloads, never URLs containing admin keys:

- Participants CSV: anonymized participant records.
- Events CSV: anonymized chronological evidence, including language, workflow,
  result, edit field, timing and source.
- Metrics CSV: aggregate measures for the selected dataset.
- Print report: print-friendly metrics and the selected participant's loaded history.

Live exports exclude excluded records; test exports are clearly separated. CSV cells
use proper quoting and spreadsheet-formula protection. Large datasets are limited to
100,000 exported rows per request; use an approved database report beyond that size.

Admin API endpoints:

```text
GET   /api/admin/validation/summary?mode=live
GET   /api/admin/validation/sessions?mode=live&limit=50&offset=0
GET   /api/admin/validation/sessions/:id/events?mode=live&limit=200&offset=0
PATCH /api/admin/validation/sessions/:id
GET   /api/admin/validation/export.csv?mode=live&type=sessions|events|metrics
```

Background authenticated trader endpoints are `/api/validation/session`,
`/api/validation/events` and `/api/validation/heartbeat`. They cannot write ASR results,
saved workflow evidence, admin status, dataset mode or another user's session ID.

## Checks

Verified on 2026-10-15: production build passed; the standard suite passed 35 tests
with four database-dependent tests skipped. The validation database suite (two tests)
and existing HTTP business-workflow integration test passed separately against the
disposable local PostgreSQL database. All 16 browser checks passed, and the new
tracking/admin modules passed ESLint. The Supabase schema check confirmed both tables,
the integrity columns and RLS policies. No fixture records were written to Supabase.

Tracking uses short database timeouts to protect trader requests. Under heavy local
test load, one concurrent session test initially hit that timeout; it passed when
rerun without the competing build/browser workload. Failed tracking writes do not
roll back successful business actions, but evidence can be missing during an outage.

```powershell
npm.cmd run build
npm.cmd test
$env:PLAYWRIGHT_CHANNEL='msedge'
node node_modules/@playwright/test/cli.js test --workers=1
```

Real local PostgreSQL tests use `BETA_VALIDATION_TEST_DATABASE_URL` pointing to an
explicit disposable localhost database with Beta's original schema. Run
`node --test server/dist/validation.integration.test.js`. The test installs the new
validation migrations there and uses clearly labeled Auth/ASR fixtures. It verifies
deduplication, authoritative event restrictions, privacy, RLS/admin access, mode
separation, idempotent workflow counts, CSV protection and non-disruptive logging failure.
These fixtures are **not real participants or official validation evidence**.

Browser tests likewise use explicit fixtures for dashboard/telemetry behavior. They do
not seed Supabase or claim to have recruited 50 people. Collect actual live trials and
team-confirm distinct people before using exported metrics in the official submission.

Spreadsheet invitations and masked email evidence are documented in [VALIDATION_INVITATIONS.md](VALIDATION_INVITATIONS.md).
