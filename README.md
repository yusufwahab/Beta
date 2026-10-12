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

Configure `DATABASE_URL` with the Supabase direct connection or session pooler URL. Set `AUTO_MIGRATE=true` in the backend environment to automatically apply pending files from `supabase/migrations` before the API starts listening. The initial migration creates all 18 required tables, indexes, checks, tenant RLS, provenance, idempotency constraints, and timestamp triggers. Its connection role must have membership in `beta_api` (the migration grants this to `postgres`). Database credentials are backend-only. Every API transaction switches to the non-bypass `beta_api` role and sets the verified user claims, so RLS also applies inside Express. Financial writes are not exposed directly to the browser. The service-role key is used only to verify Supabase tokens, never sent to the frontend.

Automatic migration is opt-in (`AUTO_MIGRATE=false` by default). It uses `MIGRATION_DATABASE_URL` when supplied, otherwise `DATABASE_URL`. Use a database account with schema and role creation permissions (normally the project's PostgreSQL account), and a direct or session-pooler connection. Migrations run in a transaction under an advisory lock, with filename/checksum history in the private `beta_migrations.history` table. Restarts skip completed files; concurrent starts serialize; errors roll back the pending batch and prevent API startup. Keep applied SQL files unchanged and add new files in increasing timestamp order, each with one outer `begin;`/`commit;` wrapper and no other transaction control statements. Include the repository's `supabase/migrations` directory in backend deployments.

Alternatively, run `npm run migrate -w server` as a deployment/release step before starting the backend and leave `AUTO_MIGRATE=false`. For an existing database where Beta SQL was applied manually or with the Supabase CLI, keep automatic migration disabled until its schema/history is reconciled: this runner refuses to recreate existing Beta tables and does not share the Supabase CLI's migration history. For a new database, choose one migration mechanism and use it consistently.

Configure Supabase Auth Site URL and allowed redirect URLs for `/app` and `/auth?mode=update` on your frontend origin. Registration with email confirmation needs Supabase email delivery. For production configure SMTP. Recovery follows the same Supabase email flow. Onboarding creates the profile, business, and membership atomically. Current UI selects the account's first business.

## Functionality

Implemented: registration/login/recovery/logout, onboarding/settings, manual and voice review/confirmation checkout, product CRUD/archive/search/restocking/history, payment-aware sales/history/filters/details/reversal, expenses/history/period summaries, database analytics, stock alerts, customer debts/repayments/history, ajo groups/members/contributions/payout history, and period-based printable/downloadable Business Activity Passports.

Simplified: debts are recordkeeping without reminders or gateways; ajo tracks records without holding money; passports print through the browser (choose Save as PDF) and offer a JSON data download. Profit appears only when every sold product in the period has cost data. Debt balances in period reports refer to debts originated in that period, with repayments through the period end. UI labels are English; voice language and major checkout controls support Nigerian English, Yoruba, Hausa, and Igbo.

Mocked and clearly labelled: ambient sample recognition, cooperative passport review, and credit-readiness indicators. Ambient confirmation never invokes a sales API. These demos have no background listening, external verification, credit score, or lender assessment.

## N-ATLAS status and contract

The official source is [NCAIR's model page](https://ncair.nitda.gov.ng/llm/), linking the official [NCAIR1 models](https://huggingface.co/NCAIR1). Model cards document model inference, not a verified public hosted HTTP endpoint. The [official Yoruba model card](https://huggingface.co/NCAIR1/Yoruba-ASR) requires model access and documents 16 kHz audio and a 30-second window.

`server/src/services/natlas.service.ts` implements server-side audio upload, ASR, LLM extraction, timeouts, errors, and Zod validation. It has **no default service URL and is not externally verified**. An explicit compatibility adapter uses the [N-ATLAS Kit gateway's documented contract](https://natlas-docs.vercel.app/gateway); that kit is an independently maintained gateway, not an official NCAIR hosted API. It must run the official NCAIR1 models, not another provider. Configure `NATLAS_BASE_URL`, `NATLAS_API_KEY`, `NATLAS_ASR_MODEL`, `NATLAS_LLM_MODEL`, and set `NATLAS_GATEWAY_CONTRACT=natlas-kit-v1` only after confirming the deployment implements that contract. If official access supplies a different contract, adapt this single service to that documented API before claiming integration.

The gateway selects the ASR checkpoint by language; its model form field is accepted but ignored. Authorized gateway configuration must use `NCAIR1/NigerianAccentedEnglish`, `NCAIR1/Yoruba-ASR`, `NCAIR1/Hausa-ASR`, and `NCAIR1/Igbo-ASR` for the relevant languages. LLM model is `NCAIR1/N-ATLaS`. Beta records at most 30 seconds and allows 8 MB uploads. It validates MIME and container headers, discards server audio buffers, keeps transcripts, and never saves a proposed transaction automatically. LLM totals are ignored; PostgreSQL numeric arithmetic computes totals. Confirm official model licensing and access with the deployment operator.

## Checks

```sh
npm run build
npm test
```

Service unit tests cover input validation, unknown speech values, SQL-calculated totals, stock writes, previews, insufficient stock, idempotency, duplicate items, voice provenance, repayment reversal guard, and absent credentials. They use a database double. Optional PostgreSQL and HTTP integration tests are included in `npm test` and skip unless their database variables are supplied.

Verification on October 12, 2026: production build and 11 unit tests passed. Against a disposable local PostgreSQL 16 database, the migration/RLS/concurrency test and HTTP workflow test passed. HTTP coverage includes onboarding, tenant isolation, sale preview/confirmation/retry, inventory, analytics, expenses, debts/repayments, ajo, passports, reversals, and settings. HTTP authentication uses an explicit local Supabase Auth test double; live Supabase Auth and N-ATLAS remain unverified.

To repeat database checks, set `BETA_TEST_DATABASE_URL` to an empty disposable local database and run `node --test server/dist/postgres.integration.test.js` after building. Then set `BETA_HTTP_TEST_DATABASE_URL` to that migrated database and run `node --test server/dist/http.integration.test.js`. Run these sequentially so the schema exists before the HTTP test. Never point the migration test at a production database. On Windows use `npm.cmd` if PowerShell blocks `npm.ps1`.

Automatic migration checks passed against a separate fresh PostgreSQL database: concurrent first starts apply once, restarts skip completed files, failed migrations roll back schema/history, modified applied files are rejected, and the API database role cannot read migration history. Repeat with `BETA_MIGRATION_TEST_DATABASE_URL` pointing to an empty disposable local database and `node --test server/dist/migrate.integration.test.js` after building.

## Deployment

- Vercel/static host: repository root install, build `npm run build`, output `apps/web/dist`; set frontend VITE variables before building. Set `VITE_API_BASE_URL=https://your-api-host/api`. Configure SPA rewrites (provided in `apps/web/vercel.json`).
- Render/Node host: build `npm ci && npm run build`; start `npm start`. Set backend variables listed in `server/.env.example`, exact `FRONTEND_URL` (comma-separated if multiple), and `TRUST_PROXY_HOPS=1` behind one trusted proxy. Health endpoint: `/api/health` reports configuration, not live dependency health.
- Apply the Supabase migration before accepting traffic; configure Auth redirects for the deployed frontend; enable HTTPS for microphone access. No credentials, remote database, or hosting are provisioned by this repository.
- To automate schema setup on a new database, set backend `AUTO_MIGRATE=true` and provide `DATABASE_URL` (optionally a separate privileged `MIGRATION_DATABASE_URL`). The API waits for migrations before accepting traffic. No database migration credentials belong in Vercel's frontend environment.

Remaining deployment prerequisites: populated Supabase credentials and database URL, migration applied automatically or through the chosen deployment step, configured email delivery/redirects, authorized N-ATLAS deployment and its confirmed contract. Browser/audio and remote-service verification require that configured environment.
