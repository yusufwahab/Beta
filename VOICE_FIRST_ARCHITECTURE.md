# Beta voice-first architecture

Updated October 15, 2026, Africa/Lagos.

## What is implemented

The existing React/TypeScript/Vite application now enters through `/start`.
The landing branding, dark style, hero, product illustrations and “Your Business.
Your Voice. Your Financial Identity.” tagline are preserved. Its main action is
“Start with Beta”; it remains visible outside the mobile hamburger menu.

The new flow is:

```text
Landing → /start → explicit tap → static welcome prompt → four language cards
  → private Supabase anonymous session
  → preferred name → what you sell → business name
  → ASR transcription and explicit confirmation of each answer
  → atomic profile/business/membership creation → ready → dashboard
```

The session is obtained on the first tap, before recording or private backend requests.
There is no autoplay on page load and no email/password/OTP in this primary journey.
The dashboard prioritizes four large icon actions: sale, expense, stock and customer debts.
Existing analytics, inventory, sales, expenses, debt and ajo screens remain.

## Identity and ownership

`supabase.auth.signInAnonymously()` creates a real Supabase Auth identity and JWT.
This is not the public `anon` database role and not voice biometrics. Existing sessions
are reused. An unconfirmed legacy email session may start a new anonymous session;
verified existing accounts with a business go to their existing dashboard.

Frontend protected routes and the Express `auth.getUser(token)` middleware accept
`user.is_anonymous` or a verified email account. Unverified non-anonymous users remain
blocked from business APIs. Client-provided user IDs and user metadata do not authorize
access. Existing transaction code still switches into `beta_api`, sets the verified user
claim, authorizes the business, and applies RLS. No ownership policies were weakened.
No new SQL table is required for this iteration.

**Earlier live check:** Supabase returned HTTP 422, `anonymous_provider_disabled`,
“Anonymous sign-ins are disabled”. Enable **Authentication → Sign In / Providers →
Anonymous Sign-ins** in the current project. No SQL statement enables this setting.
Until enabled, the live first-time journey cannot obtain its identity; the UI reports it. The user subsequently showed the anonymous-sign-in switch enabled; save dashboard changes before testing. A successful live anonymous session has not yet been independently reverified.

The SDK retains the session in this browser. Phone/PIN recovery, identity linking and
cross-device recovery are not implemented. Clearing browser storage can lose access.
The anonymous workspace does not offer a one-click sign-out button. Users must keep
their browser data until a recovery flow exists. Returning verified legacy accounts
still retain their existing sign-out functionality.

## Preserved authentication

Email/password components, signup, OTP, recovery, Supabase services, Brevo backend APIs
and related tests are preserved. Navigation does not expose conventional registration.
`/auth`, `/verify-otp`, and the old `/onboarding` UI redirect to `/start` by default.
Set frontend `VITE_LEGACY_AUTH_ENABLED=true` and restart/rebuild Vite to restore those
routes. Legacy backend APIs remain available; hiding navigation is not an authorization
mechanism. Their original authentication/email controls remain intact.

## Language and audio

`VoiceLanguageProvider` and `useVoiceLanguage()` share `en`, `yo`, `ha`, `ig` across the
application. The saved profile's `preferred_language` is the durable default, including
when it arrives asynchronously. A session override is scoped to the current account.
Onboarding persists the selected language; every ASR upload includes it.

`packages/shared/voice.ts` is the central localization dictionary and response-template
renderer. It covers onboarding, primary dashboard actions, clarification and report replies
in all four languages. Existing detailed business screens still have English labels.
Translations, number vocabulary and pronunciation need native-speaker review; complete
natural-language coverage is not claimed.

Onboarding uses **static prerecorded files only**, accessed through `playPrompt()`:

```text
apps/web/public/audio/{yo,ha,ig}/
  welcome.mp3
  name.mp3
  category.mp3
  business.mp3
  confirm.mp3
  again.mp3
  ready.mp3
```

The user supplied all seven MP3 recordings for Yoruba, Hausa and Igbo (21 files).
They are organized above and mapped in `apps/web/src/onboarding-recordings.json`.
English recordings are still missing; text onboarding remains usable with a localized
unavailable-audio notice. The initial tap only plays a recorded welcome when the
current language has one; each language card offers a welcome preview. Retry uses
the supplied `again` recording. The eight additional recordings per language are deferred.
No dynamic TTS or LLM is needed to play these files. See `apps/web/public/audio/README.md`
for importing more files and real browser playback checks.

`VoiceRecorder` obtains microphone access explicitly, stops after 30 seconds, stops all
tracks on completion/unmount, limits uploads to 8 MiB, and revokes replay object URLs.
The trader can replay their original short answer and reject/re-record a transcript.
The existing checkout recorder was preserved.

## ASR and actual deployment

```text
MediaRecorder → authenticated Express → private Modal HTTP API
  → selected official NCAIR ASR model on CPU → transcript
```

Actual deployed origin:
`https://yusufabdulwhab--beta-natlas-asr-api.us-east.modal.run`

The worker uses 4 CPUs, 8 GiB RAM, CPU-only torch and float32. Model files persist in a
Modal Volume; at most two requested models remain in warm RAM; containers scale to zero.
The private bearer key exists only in backend environment/Modal secrets. No 8B LLM or
external ASR substitute is used.

Real Nigerian English, Yoruba, Hausa and Igbo recordings passed. The initial Hausa/Igbo 403 responses were resolved after the user granted access; weights downloaded and both official models returned real transcripts. See
[NATLAS_MODAL_DEPLOYMENT.md](NATLAS_MODAL_DEPLOYMENT.md) for exact model IDs, actual responses,
model revisions, measured cold/warm latency and evidence. The final English cold request
was 13.634 seconds end to end, warm 4.467 seconds; Yoruba new-model request 6.814 seconds,
warm 5.812 seconds. These are smoke-test samples, not an accuracy or latency guarantee.

## Intent and conversation engine

`server/src/services/intent.service.ts` performs normalized rule matching, English and
limited local-language number/vocabulary parsing, conservative product matching, entity
extraction and heuristic confidence scoring. It has no network LLM dependency.

Supported command categories:

`RECORD_SALE`, `RECORD_EXPENSE`, `GET_TODAY_SALES`, `GET_PERIOD_SALES`, `CHECK_STOCK`,
`ADD_STOCK`, `RECORD_DEBT`, `CHECK_DEBT`, `RECORD_DEBT_PAYMENT`, `LIST_DEBTORS`,
`GET_EXPENSES`, `GET_PROFIT_SUMMARY`, `CONFIRM`, `CANCEL`, `HELP`.

The vocabulary supports controlled variations rather than one exact sentence. It does
not promise arbitrary speech comprehension. Unrecognized or ambiguous input requests
help/clarification. Multi-product ambiguity, unknown products/customers and unclear unit
pricing do not create a financial draft. Totals stated as “for 15000” are not silently
treated as unit prices; per-unit wording or clarification is required. Missing prices
are not invented from inventory. The initial sale engine produces one product line;
the existing editable checkout remains available for multi-product transactions.

Five-minute process-local state is keyed by verified user ID and business ID and bounded
to 2,000 entries. Example, covered by tests:

```text
“I sold two bags of rice.” → product rice, quantity 2, price missing
“Fifteen thousand.”       → fills the pending unit price
→ validated preview with total 30,000 → explicit confirmation → database transaction
```

Restarting Express discards drafts, safely requiring a new recording. There is no Redis
or cross-instance conversation persistence. Run one Express instance for this demo design.

`interpret()` uses this engine for the existing checkout. Dashboard `VoiceAssistant`
uploads to the existing business transcription route, then calls `/voice/command`.
Read-only queries use RLS-protected SQL and localized response templates. Sales, expense and profit windows support today, yesterday, this week/month and last week/month in Africa/Lagos. Profit is an
estimate and is unavailable where cost data is missing; it is not invented from sales.
Customer/debtor reports also link to the existing debt detail screen.

## Financial safety

```text
speech → ASR → controlled intent → entity extraction → Zod validation
  → deterministic preview → explicit user confirmation → authorized DB transaction
```

`voice-action.ts` validates drafts before review. Sale totals are computed by the existing
PostgreSQL-backed sale service. Other actions reuse existing expense, stock, debt and
repayment handlers through a server-owned allowlist. The server creates the action payload
and idempotency key; the browser cannot supply a replacement action during confirmation.

`/businesses/:business/voice/confirm` requires a server-issued confirmation ID and
`confirmed:true`. It checks the owner/business scope, expiry, current authorization and
financial constraints before writing. Cancel/new commands replace the pending preview.
Duplicate confirmation returns the existing result and does not repeat inventory changes.
A spoken “confirm” displays review again; saving still requires the explicit save button.
Unknown payment status remains unknown, never assumed paid. Existing negative-stock,
repayment-balance, tenant isolation, provenance and idempotency controls remain in force.

## YarnGPT TTS

N-ATLAS recognizes input; YarnGPT synthesizes output; Beta owns business rules and data.
The backend adapter implements the provider's documented streaming conversation endpoint:
`POST https://api.yarngpt.ai/api/v1/streaming/conversation`, private Bearer API key,
configured voice ID, idempotency key, MP3 output, timeouts, content-type and size validation.
The browser calls authenticated `/api/voice/speak` through `ttsService.speak({text,language})`.
Already-localized templates are sent as written; no runtime translation or LLM is required.

**Status: implemented and mock-tested; real synthesis blocked.** `YARNGPT_API_KEY` is absent.
The real integration test was executed and stopped explicitly for the missing key. No
audio response or provider timing is fabricated.

Obtain an API key from the [YarnGPT Account page](https://www.yarngpt.ai/api-docs), after
signing in and completing the provider's verification. Run `node infra/list_yarngpt_voices.mjs` after setting the key, or query its authenticated voice
catalogue at `GET https://api.yarngpt.ai/api/v1/voices` and configure suitable current IDs:

```dotenv
YARNGPT_API_KEY=
YARNGPT_VOICE_EN=
YARNGPT_VOICE_YO=
YARNGPT_VOICE_HA=
YARNGPT_VOICE_IG=
```

Put these only in ignored `server/.env`. Voice IDs are provider catalogue values, not
language codes or invented defaults. Ensure voices actually support the target languages.
Synthesis uses real provider credits; there is no mocked production fallback.

## CAPTCHA for anonymous sign-ins

Supabase recommends invisible CAPTCHA or Cloudflare Turnstile to limit anonymous-account
abuse. Cloudflare Turnstile is a suitable option for this voice-first flow. Configure its
private secret in Supabase Authentication ? Attack Protection and allow localhost in the
Turnstile site configuration while testing locally. Only the public site key belongs in
frontend configuration; the private Turnstile secret never belongs in VITE variables.

Current `/start` calls `signInAnonymously()` without `options.captchaToken`. CAPTCHA token
acquisition and forwarding must be implemented before enabling enforcement, otherwise new
anonymous sessions will be rejected. CAPTCHA is recommended for public release; it has not
been enabled or represented as working by this implementation. See
[Supabase anonymous sign-in guidance](https://supabase.com/docs/guides/auth/auth-anonymous)
and [CAPTCHA setup](https://supabase.com/docs/guides/auth/auth-captcha).

## Monitoring and security

Helmet, explicit frontend-origin CORS allowlist, JSON/upload limits and express-rate-limit
remain enabled. Authentication precedes onboarding transcription, dynamic TTS and business
voice routes. New upload and TTS routes have additional limits. Service URLs require HTTPS
outside local development; ASR fetches refuse redirects to avoid forwarding bearer keys.

Sentry Node/React adapters are wired to backend failures and frontend API/TTS failures.
Set backend `SENTRY_DSN` and frontend `VITE_SENTRY_DSN` for your Sentry projects. Current
DSNs are absent, so live error ingestion is not verified. Default integrations are disabled;
beforeSend retains only generic operation labels, severity, timestamp and event ID. It
does not send request bodies, financial values, transcripts, audio, user IDs, email,
breadcrumbs or raw error stacks. Financial queries and synthesis content are never logged
to monitoring. No session replay or tracing of sensitive payloads is enabled.

## Verification

- Production TypeScript/Vite build passed; new voice modules pass scoped ESLint.
- Node test suite: 31 passed, 3 DB-dependent tests skipped when DB variables are absent.
- Separate real local PostgreSQL tests passed RLS isolation, atomic sales, stock races,
  idempotency and reversal checks, plus an isolated concurrent-startup/rollback/checksum migration test.
- Separate real HTTP/PostgreSQL test passed anonymous-user access, tenant isolation,
  voice missing-price follow-up, read-only preview, rejected non-confirmation,
  confirmed sale and duplicate-confirmation safety, query totals, expenses, stock,
  debt creation and debt repayment. Auth and transcript fixtures are explicit mocks;
  intent parsing, HTTP, PostgreSQL and transactions in this test are real.
- Playwright: English and Yoruba three-answer onboarding, ready/dashboard, visible mobile
  Start, disabled legacy routes, voice sales query/TTS call, ambiguous sale clarification,
  and explicit save. Three test cases cover these five requested journey categories.
  Auth/microphone/ASR/TTS/browser business API responses are explicitly mocked in CI.
- Real deployed NCAIR inference: all four official models (English, Yoruba, Hausa, Igbo), documented separately. Hausa warm request 5.378 seconds; Igbo warm request 7.383 seconds.
- Real TTS: blocked; actual anonymous sign-in: disabled by project setting.
- `.github/workflows/ci.yml` runs build, Node tests, real disposable PostgreSQL/HTTP checks,
  isolated migration tests and Playwright. The workflow is created locally; it has not
  been pushed or observed running on GitHub.

## Exact remaining actions

1. Enable Supabase **Anonymous Sign-ins** in Authentication → Sign In / Providers.
2. Obtain/configure the YarnGPT API key and four suitable voice IDs in `server/.env`.
3. Generate static onboarding prompts, then review translations/pronunciation:

```powershell
npm.cmd run build
node infra/list_yarngpt_voices.mjs
node infra/test_tts.mjs --language en
node infra/test_tts.mjs --language yo
node infra/build_onboarding_audio.mjs
```

For native human recordings, use the canonical MP3/WAV names in the language folders
and run `node infra/import_onboarding_audio.mjs` to refresh the manifest (also after
running the optional generator). The supplied Yoruba/Hausa/Igbo files need no YarnGPT
configuration. No dynamic TTS is required during onboarding.

4. Configure Sentry DSNs if production monitoring should be active.
5. HF access for all four models is now verified; no additional access fix is currently required.
6. Restart local services in separate terminals:

```powershell
npm.cmd run dev:server
npm.cmd run dev
```

Open `http://localhost:5173/start`. Localhost can call the deployed Modal service through
Express; no Render deployment or Supabase email hook is required.

Tests:

```powershell
npm.cmd test
# Use installed Edge on this Windows machine:
$env:PLAYWRIGHT_CHANNEL='msedge'
npm.cmd run test:e2e
# Or install the CI browser once, then run without PLAYWRIGHT_CHANNEL:
npx.cmd playwright install chromium
```

For real ASR/redeployment commands, see NATLAS_MODAL_DEPLOYMENT.md. No Modal redeploy is
needed merely to enable anonymous sign-ins or configure YarnGPT/Sentry in Express/Vite.

## Main files changed

- Infrastructure: `infra/modal_natlas_asr.py`, `infra/natlas_tools.py`,
  `infra/deploy_natlas.ps1`, `infra/test_natlas.mjs`, `infra/test_tts.mjs`,
  `infra/build_onboarding_audio.mjs`, `infra/list_yarngpt_voices.mjs`.
- Frontend: `Start.tsx`, `VoiceRecorder.tsx`, `VoiceAssistant.tsx`, `audio.ts`,
  `VoiceLanguageProvider.tsx`, `voice-language.ts`, `monitoring.ts`; surgical changes to
  `App`, `Landing`, `Layout`, `Checkout`, `pages`, `session`, `lib`, `main`, `ui`, CSS.
- Shared localization: `packages/shared/voice.ts`, shared export; static audio folders/README.
- Backend: `voice-routes.ts`, `services/intent.service.ts`, `services/voice-action.ts`,
  `services/tts.service.ts`, `monitoring.ts`, `natlas.service.ts`, `index.ts`.
- Tests/config: intent/TTS/ASR tests, HTTP integration coverage, Playwright config/spec,
  GitHub Actions workflow, environment examples, package files/lockfile, gitignore.
- Documentation: this file, `NATLAS_MODAL_DEPLOYMENT.md`, README.

The prior auth/Brevo implementation and existing database migration are preserved.
Prompt assets, live anonymous auth and real YarnGPT remain the material release blockers;
the fully spoken four-language trader journey is not yet verified end to end.
