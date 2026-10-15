# Beta

Responsive React + TypeScript + Vite + Tailwind web app with an Express API, Supabase Auth, and Supabase PostgreSQL. No separate mobile application.

## Run locally

Node.js 22.12+ (24 recommended), npm, and a Supabase project are required.

```sh
npm install
cp apps/web/.env.example apps/web/.env
cp server/.env.example server/.env
# Fill the two environment files. On Windows use Copy-Item instead of cp.
npm run build -w packages/shared
npm run dev:server
# In a second terminal:
npm run dev
```

Frontend: http://localhost:5173. API: http://localhost:5000/api. Vite proxies `/api` locally. The landing page is usable without credentials; authentication and business records require Supabase. All authenticated statistics are queried from the database.

## Database and authentication

The primary trader journey is now `/start`: silent Supabase Anonymous Auth, language selection and three voice answers. Enable Anonymous Sign-ins in Supabase; the earlier live check returned `anonymous_provider_disabled`; save the enabled dashboard setting and retest. Existing email/password, OTP, Brevo and recovery code remains behind `VITE_LEGACY_AUTH_ENABLED=true`, disabled by default. See [VOICE_FIRST_ARCHITECTURE.md](VOICE_FIRST_ARCHITECTURE.md).

Configure `DATABASE_URL` with the Supabase direct connection or session pooler URL. Set `AUTO_MIGRATE=true` in the backend environment to automatically apply pending files from `supabase/migrations` before the API starts listening. The initial migration creates all 18 required tables, indexes, checks, tenant RLS, provenance, idempotency constraints, and timestamp triggers. Its connection role must have membership in `beta_api` (the migration grants this to `postgres`). Database credentials are backend-only. Every API transaction switches to the non-bypass `beta_api` role and sets the verified user claims, so RLS also applies inside Express. Financial writes are not exposed directly to the browser. The service-role key verifies Supabase tokens and generates authentication OTPs/recovery links on the backend; it is never sent to the frontend.

Automatic migration is opt-in (`AUTO_MIGRATE=false` by default). It uses `MIGRATION_DATABASE_URL` when supplied, otherwise `DATABASE_URL`. Use a database account with schema and role creation permissions (normally the project's PostgreSQL account), and a direct or session-pooler connection. Migrations run in a transaction under an advisory lock, with filename/checksum history in the private `beta_migrations.history` table. Restarts skip completed files; concurrent starts serialize; errors roll back the pending batch and prevent API startup. Keep applied SQL files unchanged and add new files in increasing timestamp order, each with one outer `begin;`/`commit;` wrapper and no other transaction control statements. Include the repository's `supabase/migrations` directory in backend deployments.

Alternatively, run `npm run migrate -w server` as a deployment/release step before starting the backend and leave `AUTO_MIGRATE=false`. For an existing database where Beta SQL was applied manually or with the Supabase CLI, keep automatic migration disabled until its schema/history is reconciled: this runner refuses to recreate existing Beta tables and does not share the Supabase CLI's migration history. For a new database, choose one migration mechanism and use it consistently.

Configure Supabase Auth Site URL and allowed redirect URLs for `/app` and `/auth?mode=update` on your frontend origin. Registration with email confirmation needs configured email delivery. Recovery follows the same Supabase email flow. Onboarding creates the profile, business, and membership atomically. Current UI selects the account's first business.

For direct Brevo API email delivery from localhost, follow [the Brevo email setup guide](docs/BREVO_EMAIL_SETUP.md). Public, rate-limited backend endpoints handle signup, resend, and password recovery using Supabase's admin OTP/link generation and Brevo's API. Disable the old Supabase Send Email hook and keep Confirm Email enabled. No hook secret or tunnel is needed for these flows.

When the legacy feature flag is enabled, signup collects a name, email, and password, then opens the separate `/verify-otp` page with only a code input. Correct verification opens the app/onboarding; unconfirmed sessions cannot access business records. This screen supports resending after a 60-second cooldown and remembers the email across tab refreshes. The signup name is prefilled in onboarding. Delivery failures are shown explicitly; existing unconfirmed users can sign in to reach the OTP page and resend. Recovery uses a reset link sent directly through Brevo.

## Functionality

Implemented: registration/login/recovery/logout, onboarding/settings, manual and voice review/confirmation checkout, product CRUD/archive/search/restocking/history, payment-aware sales/history/filters/details/reversal, expenses/history/period summaries, database analytics, stock alerts, customer debts/repayments/history, ajo groups/members/contributions/payout history, and period-based printable/downloadable Business Activity Passports.

Simplified: debts are recordkeeping without reminders or gateways; ajo tracks records without holding money; passports print through the browser (choose Save as PDF) and offer a JSON data download. Profit appears only when every sold product in the period has cost data. Debt balances in period reports refer to debts originated in that period, with repayments through the period end. UI labels are English; voice language and major checkout controls support Nigerian English, Yoruba, Hausa, and Igbo.

Mocked and clearly labelled: ambient sample recognition, cooperative passport review, and credit-readiness indicators. Ambient confirmation never invokes a sales API. These demos have no background listening, external verification, credit score, or lender assessment.

## N-ATLAS status and contract

The official source is [NCAIR's model page](https://ncair.nitda.gov.ng/llm/), linking the official [NCAIR1 models](https://huggingface.co/NCAIR1). Model cards document model inference, not a verified public hosted HTTP endpoint. The [official Yoruba model card](https://huggingface.co/NCAIR1/Yoruba-ASR) requires model access and documents 16 kHz audio and a 30-second window.

`infra/modal_natlas_asr.py` now uses CPU only (4 cores, 8 GiB, float32) and persistent model caching. It is deployed at `https://yusufabdulwhab--beta-natlas-asr-api.us-east.modal.run`. Actual Nigerian English, Yoruba, Hausa and Igbo recordings passed; all four official models now have verified access and inference. Express holds the private bearer key. See [NATLAS_MODAL_DEPLOYMENT.md](NATLAS_MODAL_DEPLOYMENT.md) for actual responses, measured latency and redeployment commands.

Beta's controlled intent engine replaces the external 8B LLM dependency. It proposes validated drafts and asks for missing information. Financial changes reuse existing transaction handlers only after explicit confirmation. A shared language provider and centralized templates support onboarding, voice commands and dynamic YarnGPT responses. The seven supplied static onboarding MP3 prompts are installed for Yoruba, Hausa and Igbo; English recordings are still missing. See `apps/web/public/audio/README.md` for audio import and playback tests. Real YarnGPT synthesis has been verified in all four languages; credentials remain backend-only.

The dashboard continues with a saved five-step guide: add product, record sale, record expense, record debt, then view the summary. Traders can skip, mark a step as known, pause/resume, and replay guidance. Afterward, suggestions use actual sales, expenses and stock. Voice results support manual edits and spoken corrections, followed by a fresh review and explicit confirmation. See [guided journey and review](docs/GUIDED_JOURNEY_AND_REVIEW.md) for behavior, endpoints, verification and limits. No additional SQL table is required.

Beta records at most 30 seconds and allows 8 MiB uploads. It validates MIME and container headers, discards server audio buffers, keeps transcripts with the actual model ID, and never saves a proposed sale automatically. Existing validation, explicit confirmation, and atomic database/inventory updates remain in place.

## Validation evidence

Quiet background validation tracking and the team-only `/admin/validation` dashboard
are implemented. The validation tables and RLS policies have been installed without
seeding participants. Development uses `VALIDATION_MODE=test`; use `live` for actual
trials. See [validation setup, admin access and evidence rules](VALIDATION_TRACKING.md).
Normal trader navigation is unchanged by tracking. Device identities and team-confirmed
real people are reported separately; reloads do not create new participants.

## Checks

```sh
npm run build
npm test
```

Service unit tests cover input validation, unknown speech values, SQL-calculated totals, stock writes, previews, insufficient stock, idempotency, duplicate items, voice provenance, repayment reversal guard, and absent credentials. They use a database double. Optional PostgreSQL and HTTP integration tests are included in `npm test` and skip unless their database variables are supplied.

Verification on October 12, 2026: production build and 11 unit tests passed. Against a disposable local PostgreSQL 16 database, the migration/RLS/concurrency test and HTTP workflow test passed. HTTP coverage includes onboarding, tenant isolation, sale preview/confirmation/retry, inventory, analytics, expenses, debts/repayments, ajo, passports, reversals, and settings. HTTP authentication uses an explicit local Supabase Auth test double; that historical check did not verify live Supabase Auth or N-ATLAS. Current CPU inference evidence is documented separately.

To repeat database checks, set `BETA_TEST_DATABASE_URL` to an empty disposable local database and run `node --test server/dist/postgres.integration.test.js` after building. Then set `BETA_HTTP_TEST_DATABASE_URL` to that migrated database and run `node --test server/dist/http.integration.test.js`. Run these sequentially so the schema exists before the HTTP test. Never point the migration test at a production database. On Windows use `npm.cmd` if PowerShell blocks `npm.ps1`.

Automatic migration checks passed against a separate fresh PostgreSQL database: concurrent first starts apply once, restarts skip completed files, failed migrations roll back schema/history, modified applied files are rejected, and the API database role cannot read migration history. Repeat with `BETA_MIGRATION_TEST_DATABASE_URL` pointing to an empty disposable local database and `node --test server/dist/migrate.integration.test.js` after building.

## Deployment

- Vercel/static host: repository root install, build `npm run build`, output `apps/web/dist`; set frontend VITE variables before building. Set `VITE_API_BASE_URL=https://your-api-host/api`. Configure SPA rewrites (provided in `apps/web/vercel.json`).
- Render/Node host: build `npm ci && npm run build`; start `npm start`. Set backend variables listed in `server/.env.example`, exact `FRONTEND_URL` (comma-separated if multiple), and `TRUST_PROXY_HOPS=1` behind one trusted proxy. Health endpoint: `/api/health` reports configuration, not live dependency health.
- Apply the Supabase migration before accepting traffic; configure Auth redirects for the deployed frontend; enable HTTPS for microphone access. No credentials, remote database, or hosting are provisioned by this repository.
- To automate schema setup on a new database, set backend `AUTO_MIGRATE=true` and provide `DATABASE_URL` (optionally a separate privileged `MIGRATION_DATABASE_URL`). The API waits for migrations before accepting traffic. No database migration credentials belong in Vercel's frontend environment.

Current setup actions: enable Supabase Anonymous Sign-ins; configure YarnGPT key and language-appropriate voices; build/review static onboarding prompts; configure optional Sentry DSNs. CPU ASR is deployed and English/Yoruba are verified. All four official ASR models now have verified access and real inference. Legacy email features retain their own delivery/redirect requirements.
