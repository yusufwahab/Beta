# Beta — Technology Stack

## Languages & Runtimes
- **TypeScript ~6.0.2** — frontend, backend, shared package (strict mode)
- **Python 3.12** — Modal.com ASR deployment only (`infra/modal_natlas_asr.py`)
- **Node.js 22.12+** (24 recommended) — runtime for server and build tools
- **ESM throughout** — all packages use `"type": "module"`

## Frontend (`apps/web`)
| Technology | Version | Role |
|---|---|---|
| React | ^19.2.8 | UI framework |
| Vite | ^8.3.0 | Dev server + bundler |
| Tailwind CSS | ^4.3.3 | Utility-first styling (via `@tailwindcss/vite`) |
| React Router | ^7.0.0 | Client-side routing (BrowserRouter) |
| TanStack Query | ^5.0.0 | Server state, caching, invalidation |
| Zod | ^4.0.0 | Form + API response validation |
| React Hook Form | ^7.0.0 | Form state management |
| @hookform/resolvers | ^5.0.0 | Zod ↔ RHF integration |
| @supabase/supabase-js | ^2.0.0 | Auth client (anonymous + email) |
| Recharts | ^3.0.0 | Sales trend area chart |
| Lucide React | ^0.468.0 | Icon set |
| @sentry/react | ^11.7.0 | Frontend error monitoring (optional) |

## Backend (`server`)
| Technology | Version | Role |
|---|---|---|
| Express | ^5.0.0 | HTTP server |
| pg | ^8.0.0 | PostgreSQL client (connection pool) |
| Zod | ^4.0.0 | Request body validation |
| @supabase/supabase-js | ^2.0.0 | Service-role token verification + OTP generation |
| multer | ^2.0.0 | Audio file upload (memory storage) |
| helmet | ^8.0.0 | Security headers |
| cors | ^2.8.5 | CORS with origin allowlist |
| express-rate-limit | ^8.0.0 | Rate limiting (120 req/min global; 8/min voice) |
| @sentry/node | ^11.7.0 | Server error monitoring (optional) |
| tsx | ^4.0.0 | Dev-time TypeScript execution (`tsx watch`) |

## Shared Package (`packages/shared`)
- Zod ^4.0.0 — schema definitions shared across frontend and backend
- TypeScript ~6.0.2 — compiled to `dist/` before use

## Database
- **Supabase PostgreSQL** (direct or session pooler connection)
- **Row Level Security** enforced via `beta_api` role + `set_config` JWT claims
- **18 tables** created by a single migration file (`supabase/migrations/202610120001_beta.sql`)
- Migration runner: custom advisory-lock + checksum history in `beta_migrations.history`
- Timezone: all date queries use `Africa/Lagos`

## Authentication
- **Supabase Anonymous Auth** — primary path (`/start`); no email required
- **Supabase Email/Password + OTP** — legacy path behind `VITE_LEGACY_AUTH_ENABLED=true`
- **Brevo API** — transactional email delivery (signup confirmation, recovery links)
- Service-role key is backend-only; never sent to the browser

## Voice / AI Services
| Service | Role |
|---|---|
| N-ATLAS (NCAIR models on Modal.com) | ASR: Nigerian English, Yoruba, Hausa, Igbo |
| YarnGPT | TTS: spoken replies in all 4 languages |
| Beta intent engine | Controlled NLU (no external LLM); interprets transcripts into structured actions |

### N-ATLAS Models
- `NCAIR1/NigerianAccentedEnglish` (en)
- `NCAIR1/Yoruba-ASR` (yo)
- `NCAIR1/Hausa-ASR` (ha)
- `NCAIR1/Igbo-ASR` (ig)
- Deployed on Modal.com: CPU-only, 4 cores, 8 GiB, float32, persistent HF cache
- Max audio: 30 seconds, 8 MiB

## Testing
- **Node built-in test runner** (`node --test`) — unit + integration tests in `server/`
- **Playwright** ^1.64.1 — end-to-end tests in `tests/e2e/`
- Integration tests require env vars: `BETA_TEST_DATABASE_URL`, `BETA_HTTP_TEST_DATABASE_URL`, `BETA_MIGRATION_TEST_DATABASE_URL`

## Tooling
- **ESLint** ^10.10.0 — flat config (`eslint.config.js`); plugins: `typescript-eslint`, `react-hooks`, `react-refresh`
- **npm workspaces** — monorepo dependency management
- **GitHub Actions** — CI pipeline (`.github/workflows/ci.yml`)

## Key Environment Variables

### Frontend (`apps/web/.env`)
```
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
VITE_API_BASE_URL=          # defaults to /api (proxied by Vite locally)
VITE_LEGACY_AUTH_ENABLED=   # true to enable email/OTP auth routes
VITE_SENTRY_DSN=            # optional
```

### Backend (`server/.env`)
```
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
DATABASE_URL=               # Supabase direct or session pooler
MIGRATION_DATABASE_URL=     # optional; privileged connection for migrations
AUTO_MIGRATE=false          # set true for fresh DB auto-migration on startup
PORT=5000
FRONTEND_URL=               # comma-separated allowed origins
TRUST_PROXY_HOPS=0          # set 1 behind Render/proxy
NATLAS_BASE_URL=
NATLAS_API_KEY=
NATLAS_ASR_MODEL_EN/YO/HA/IG=
YARNGPT_API_KEY=
YARNGPT_VOICE_EN/YO/HA/IG=
BREVO_API_KEY=
BREVO_SENDER_EMAIL=
BREVO_SENDER_NAME=
```

## Dev Commands
```sh
npm install                          # install all workspaces
npm run build -w packages/shared     # must run first
npm run dev:server                   # Express on :5000
npm run dev                          # Vite on :5173 (proxies /api)
npm run build                        # shared → server → web
npm test                             # server unit + integration tests
npm run test:e2e                     # Playwright e2e
npm run migrate -w server            # run migrations manually
```

## Deployment
- **Frontend**: Vercel (static); output `apps/web/dist`; SPA rewrites via `apps/web/vercel.json`
- **Backend**: Render (Node); `npm ci && npm run build`; start `npm start`; set `TRUST_PROXY_HOPS=1`
- **Health endpoint**: `GET /api/health` — reports config status (not live dependency health)
- **ASR**: Modal.com (`modal deploy infra/modal_natlas_asr.py`)
