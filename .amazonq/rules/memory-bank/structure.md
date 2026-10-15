# Beta — Project Structure

## Monorepo Layout
```
beta/                          # npm workspaces root
├── apps/web/                  # React + TypeScript + Vite frontend (@beta/web)
│   ├── src/
│   │   ├── App.tsx            # Router, providers, lazy-loaded routes
│   │   ├── pages.tsx          # All page components (Overview, Inventory, Sales, Expenses, Debts, Ajo, Passport, Settings)
│   │   ├── Start.tsx          # Primary voice-first onboarding flow
│   │   ├── Auth.tsx           # Legacy email auth + onboarding (feature-flagged)
│   │   ├── Checkout.tsx       # Voice/manual sale recording
│   │   ├── VoiceAssistant.tsx # Dashboard voice command UI
│   │   ├── VoiceRecorder.tsx  # MediaRecorder wrapper
│   │   ├── VoiceLanguageProvider.tsx # Language context provider
│   │   ├── JourneyGuide.tsx   # 5-step guided onboarding widget
│   │   ├── RecordForm.tsx     # Generic form renderer (fields config → JSX)
│   │   ├── Layout.tsx         # App shell + nav
│   │   ├── session.tsx        # Auth context, Protected route, useBusinessQuery/useBusinessApi hooks
│   │   ├── audio.ts           # TTS (YarnGPT), static prompt playback, onboarding transcription
│   │   ├── lib.ts             # api(), supabase client, naira(), today(), languageNames
│   │   ├── voice-language.ts  # useVoiceLanguage hook
│   │   ├── monitoring.ts      # Sentry frontend wrapper
│   │   ├── ui.tsx             # Shared UI primitives (Card, Button, Field, Badge, Empty, Loading, Logo, ErrorBox)
│   │   └── auth-verification.ts # OTP/recovery helpers
│   ├── public/audio/          # Static onboarding MP3 prompts (yo/ha/ig; en missing)
│   ├── .env / .env.example    # VITE_ prefixed frontend env vars
│   └── vite.config.ts         # Vite config; proxies /api → localhost:5000
│
├── server/                    # Express + TypeScript API (@beta/server)
│   ├── src/
│   │   ├── index.ts           # All Express routes, middleware, error handler, app entry
│   │   ├── db.ts              # pg Pool, transaction(), authorize(), audit(), AppError
│   │   ├── migrate.ts         # Migration runner (advisory lock, checksum history)
│   │   ├── migrate-cli.ts     # CLI entry for `npm run migrate`
│   │   ├── voice-routes.ts    # /voice/transcribe, /voice/interpret, /voice/speak routes
│   │   ├── auth-email.ts      # Public email auth routes (signup/OTP/recovery via Brevo)
│   │   ├── monitoring.ts      # Sentry server wrapper
│   │   ├── services/
│   │   │   ├── sales.service.ts       # createSale(), reverseSale()
│   │   │   ├── natlas.service.ts      # transcribe(), interpret(), natlasStatus()
│   │   │   ├── tts.service.ts         # YarnGPT speak()
│   │   │   ├── intent.service.ts      # Controlled intent engine (no external LLM)
│   │   │   ├── journey.service.ts     # getJourney(), changeJourney(), journeySaved()
│   │   │   ├── voice-review.service.ts# Voice review/confirmation helpers
│   │   │   ├── voice-action.ts        # Voice action dispatch
│   │   │   └── email.service.ts       # Brevo email delivery, emailStatus()
│   │   └── *.test.ts / *.integration.test.ts  # Unit + integration tests
│   ├── .env / .env.example    # Backend env vars (no VITE_ prefix)
│   └── tsconfig.json          # Compiles to dist/
│
├── packages/shared/           # Shared types + validation (@beta/shared)
│   ├── index.ts               # saleSchema, intentSchema, money, languages, Product type
│   ├── voice.ts               # VoiceLocale, VoiceMessage, voiceText(), voiceReview(), voiceFieldLabel(), voiceActionLabel()
│   ├── review.ts              # ReviewMessage, reviewText() — review screen i18n copy
│   └── journey.ts             # Journey step types
│
├── supabase/
│   └── migrations/
│       └── 202610120001_beta.sql  # Single migration: all 18 tables, RLS, indexes, triggers, beta_api role
│
├── infra/
│   ├── modal_natlas_asr.py    # Modal.com deployment: NCAIR ASR (4 languages, CPU, persistent cache)
│   ├── natlas_tools.py        # N-ATLAS utility helpers
│   ├── build_onboarding_audio.mjs  # YarnGPT batch audio generation
│   ├── import_onboarding_audio.mjs # Audio import helper
│   └── test_natlas.mjs / test_tts.mjs  # Manual integration tests
│
├── tests/e2e/                 # Playwright end-to-end tests
├── docs/                      # BREVO_EMAIL_SETUP.md, GUIDED_JOURNEY_AND_REVIEW.md
├── package.json               # Workspace root; scripts: dev, dev:server, build, test, test:e2e
└── eslint.config.js           # Flat ESLint config (TS + react-hooks + react-refresh)
```

## Architectural Patterns

### Multi-tenant RLS
Every API transaction calls `transaction(userId, fn)` which:
1. Sets `role = beta_api` (non-bypass role)
2. Sets `request.jwt.claim.sub` and `request.jwt.claims` via `set_config`
3. Runs the handler inside a PostgreSQL transaction with RLS enforced
4. Calls `authorize(db, businessId)` to verify business membership before any data access

### API Route Pattern
All business-scoped routes use the `route(method, path, handler)` helper in `index.ts`:
- Mounts at `/api/businesses/:business{path}`
- Validates business UUID, calls `authorize()`, runs handler in `transaction()`
- POST routes for sales/expenses/debts/stock automatically call `journeySaved()` to advance the guided journey

### Frontend Data Layer
- `useBusinessQuery(path)` — TanStack Query GET for business-scoped endpoints
- `useBusinessApi()` — POST/PATCH wrapper that auto-invalidates business queries after mutation
- `api(path, body?, method?)` in `lib.ts` — raw fetch with Supabase Bearer token injection

### Voice Pipeline
1. `VoiceRecorder` captures audio (max 30s, 8 MiB)
2. POST to `/voice/transcribe` → N-ATLAS ASR → stores `voice_interactions` row
3. POST to `/voice/interpret` → intent engine → returns structured `SaleIntent`
4. User reviews draft (editable), confirms
5. POST to `/sales` (or other action) with `voice_interaction_id` provenance

### Shared Package
`@beta/shared` is the single source of truth for:
- Zod schemas (`saleSchema`, `intentSchema`, `money`)
- TypeScript types (`Product`, `SaleInput`, `SaleIntent`, `VoiceLocale`, `VoiceMessage`)
- i18n helpers (`voiceText`, `voiceReview`, `reviewText`, `voiceFieldLabel`)
- Constants (`languages`)
Used by both frontend and backend — built first (`npm run build -w packages/shared`).

### Database Tables (18 total)
`profiles`, `businesses`, `business_memberships`, `products`, `stock_movements`, `sales`, `sale_items`, `customers`, `debts`, `debt_repayments`, `expenses`, `ajo_groups`, `ajo_memberships`, `ajo_contributions`, `ajo_payouts`, `voice_interactions`, `transaction_suggestions`, `activity_events`
