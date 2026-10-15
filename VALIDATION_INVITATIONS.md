# Spreadsheet invitations for Beta validation

The team-only `/admin/validation` page now includes **Tester invitations**. Normal
trader onboarding still allows anonymous use and does not ask for email.

## Setup

The new `202610150002_validation_invitations.sql` migration was applied successfully
to the Supabase database configured in `server/.env`. It adds only the invitation
table, indexes, foreign keys, constraints and restricted RLS access. No contacts,
test participants or emails were added or sent to production.

For another manually initialized Beta database, use
`node infra/install_validation.mjs --apply`. Databases with migration history should
use `npm.cmd run migrate -w server` instead. Keep the current manually initialized
database's `AUTO_MIGRATE=false` until its baseline history is reconciled.

Backend environment:

```env
VALIDATION_MODE=live
VALIDATION_INVITE_BASE_URL=https://YOUR-VERCEL-SITE.vercel.app
BREVO_API_KEY=YOUR_EXISTING_BREVO_KEY
BREVO_SENDER_EMAIL=YOUR_VERIFIED_SENDER
BREVO_SENDER_NAME=Beta
```

Use your actual frontend origin, without a path. `FRONTEND_URL`'s first origin is the
fallback when the invitation origin is unset. HTTP localhost is allowed for local
checks. Existing Supabase backend credentials are reused; no new frontend secret is
required. Test invitations must use `VALIDATION_MODE=test`. The invitation dataset
must match the backend mode when a tester accepts it.

Deploy the updated Node backend and Vercel frontend before sending invitations.
The earlier Render `ENETUNREACH` database connection issue must be resolved for
imports, acceptance and evidence writes to work.

## Team workflow

1. Sign in at `/admin/validation` and select Live users or Test traffic.
2. Upload CSV or XLSX, preview validation results, then **Import valid contacts**.
3. Review the imported contacts and click **Send pending invitations**. Importing
   alone does not send mail. Individual send/resend/revoke actions are available.
4. Monitor Imported, Invited, Opened, Accepted, Started and Completed counts.
5. Open a linked participant's existing chronological interaction history.
6. Download **Masked invitation evidence CSV**, or print the report. Full email
   addresses appear only in the protected admin/API contact view; print uses masking.

Example headers:

```csv
Name,Email,Phone,Participant ID
```

Email is required; other columns are optional. Email Address, Full Name, Phone Number
and Reference ID headers are also recognized. Email matching is case-insensitive.
Preview reports invalid emails, oversized fields, duplicates in the file, previously
imported/invited contacts and already-completed invitation testers. External IDs are
stored as references; Beta allocates its own participant ID. Only ready rows import.

Limits: 1,000 contacts per upload, 2 MB file size, 50 columns. XLSX uses the first
worksheet and rejects workbooks exceeding the expanded archive limits. Macros and
legacy XLS are unsupported; formulas are never executed. Format phone columns as
text to preserve leading zeros. Files are parsed in memory and not retained.

## Tester and evidence behavior

The private email link opens `/test/invite#token=...`. The fragment keeps the token
out of normal HTTP access logs and referrers; the page removes it from the address
bar. The database stores a SHA-256 hash of a random 256-bit token, not the raw token.
Links expire after seven days, are consumed only on explicit acceptance, and are
invalidated by revocation or resend. If a used link is needed again before completion,
the team can resend it. Failed sends invalidate the token and are not marked invited.

Opening shows a masked email and a participation/privacy notice. The tester explicitly
agrees, then Beta uses Supabase's server-side generateLink/verifyOtp APIs to establish
an email-confirmed account without a password. No Supabase email hook is used. The
session is installed in the browser and the existing `/start` flow continues. A current
browser account is switched only after the tester accepts; use a separate profile to
preserve another trader/admin session. Team admin accounts cannot accept tester invites.

Returning with the same email reuses its Auth identity and validation session. If an
existing validation session predates the import, the invitation adopts that existing
participant ID; its external spreadsheet reference is retained. Existing evidence
before acceptance is not credited to the invitation trial.

**Imports, email sends, opens and acceptance never manufacture ASR evidence.** Started
requires a server-observed N-ATLAS attempt that reached the provider boundary. Completed
requires a saved core workflow linked to a successful server-side transcription after
acceptance. Merely creating a business, saving a manual record, refreshing or sending
client telemetry cannot satisfy invitation completion. Normal non-invited usage keeps
its existing tracking rules. Test and live datasets remain separate.

The report joins existing language, attempts, successes/failures, retry interactions,
edits, corrected field types and completed workflows. Client edits remain reported
actions; provider results and saved workflows come from server evidence. Emails/names/
phones are stored only in the restricted invitations table, never event metadata.
Evidence CSV masks emails, excludes revoked/excluded trials, omits names, phones,
external references, Auth IDs, tokens and transcripts, and protects spreadsheet cells.

Brevo acceptance is not proof of inbox delivery; delivery webhooks are not implemented.
Email scanners may produce an open, so opens are not counted as testing. Email access
does not establish distinct humans; keep the dashboard's team-review process for the
50-person requirement. Forwarded links grant the recipient access to the invited
account, so treat them as private credentials. Contact the inviting team to withdraw;
revocation stops outstanding links and removes the invitation from completion exports.
Retention/deletion of stored contact details remains a team responsibility.

## Verification

Verified during implementation: production build and scoped ESLint passed; the
standard suite passed 38 tests with five environment-dependent database checks skipped.
The validation HTTP/database suite and invitation lifecycle suite passed separately
against disposable local PostgreSQL. Six relevant browser checks passed (five together,
then the new admin preview/import/send check separately). The dependency lockfile also
passed `npm ci --dry-run`, with existing cross-platform esbuild entries preserved.

```powershell
npm.cmd run build
npm.cmd test
# Disposable localhost database with the existing validation schema only:
$env:BETA_VALIDATION_TEST_DATABASE_URL='YOUR_DISPOSABLE_LOCAL_DATABASE_URL'
node --test server/dist/validation-invitations.integration.test.js
$env:PLAYWRIGHT_CHANNEL='msedge'
node node_modules/@playwright/test/cli.js test tests/e2e/invitations.spec.ts tests/e2e/validation.spec.ts --workers=1
```

CSV and real XLSX parsing tests use fixture files. PostgreSQL checks use explicit
local Supabase Auth/Brevo fixtures, including delivery rejection and token replay.
Browser checks use fixtures too. They are not real emails, model inference, recruited
participants or official competition evidence. No live email delivery was exercised.
