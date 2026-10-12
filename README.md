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

Apply `supabase/migrations/202610120001_beta.sql` once using the Supabase SQL editor or `supabase db push`. The migration creates all 18 required tables, indexes, checks, tenant RLS, provenance, idempotency constraints, and timestamp triggers. It is not automatically applied on API startup. Configure `DATABASE_URL` with the Supabase direct connection or session pooler URL. Its connection role must have membership in `beta_api` (the migration grants this to `postgres`). Database credentials are backend-only. Every API transaction switches to the non-bypass `beta_api` role and sets the verified user claims, so RLS also applies inside Express. Financial writes are not exposed directly to the browser. The service-role key is used only to verify Supabase tokens, never sent to the frontend.

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

## Deployment

- Vercel/static host: repository root install, build `npm run build`, output `apps/web/dist`; set frontend VITE variables before building. Set `VITE_API_BASE_URL=https://your-api-host/api`. Configure SPA rewrites (provided in `apps/web/vercel.json`).
- Render/Node host: build `npm ci && npm run build`; start `npm start`. Set backend variables listed in `server/.env.example`, exact `FRONTEND_URL` (comma-separated if multiple), and `TRUST_PROXY_HOPS=1` behind one trusted proxy. Health endpoint: `/api/health` reports configuration, not live dependency health.
- Apply the Supabase migration before accepting traffic; configure Auth redirects for the deployed frontend; enable HTTPS for microphone access. No credentials, remote database, or hosting are provisioned by this repository.

Remaining deployment prerequisites: populated Supabase credentials and database URL, applied migration, configured email delivery/redirects, authorized N-ATLAS deployment and its confirmed contract. Browser/audio and remote-service verification require that configured environment.
