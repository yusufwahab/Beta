# Beta — Development Guidelines

## Code Style

### Formatting
- **Ultra-compact single-line style** is the established pattern throughout the codebase. Functions, conditionals, and JSX are written on single lines with no blank lines between statements. Do not introduce multi-line reformatting when editing existing files.
- No semicolons at statement ends in some files; follow the file's existing convention.
- Single quotes for strings in TypeScript/JavaScript.
- Arrow functions preferred over `function` declarations for handlers and callbacks.
- Imports are grouped: Node built-ins → third-party → internal (`@beta/shared`) → local.

### Naming
- `camelCase` for variables, functions, hooks.
- `PascalCase` for React components, classes, and Zod schema names.
- `SCREAMING_SNAKE_CASE` for top-level constants in Python (`APP_NAME`, `MAX_BYTES`, `CACHE`).
- Route handler variables: `b` = businessId, `u` = userId, `v` = validated Zod parse result, `r` = query result, `p` = period.
- Test database env vars: `BETA_TEST_DATABASE_URL`, `BETA_HTTP_TEST_DATABASE_URL`, `BETA_MIGRATION_TEST_DATABASE_URL`.

### TypeScript
- Strict mode enabled in all `tsconfig.json` files.
- Prefer `z.infer<typeof schema>` for derived types rather than hand-writing interfaces.
- Use `as const` for literal arrays (e.g. `languages`, route method strings).
- `type` imports (`import type {...}`) for type-only symbols.
- Avoid `any`; use `unknown` for caught errors and untyped API responses.

---

## Backend Patterns

### Every DB write must use `transaction()` + `authorize()`
```ts
// Always this pattern for business-scoped routes:
const data = await transaction(res.locals.user.id, async db => {
  await authorize(db, businessId);
  // ... query
});
```
`transaction()` sets `role = beta_api` and JWT claims before running the handler, enforcing RLS.

### Route registration via `route()` helper
```ts
route('post', '/expenses', async (db, b, u, req) => {
  const v = key.extend({ amount: money, category: text, ... }).parse(req.body);
  // ...
});
```
- Never use `app.post(...)` directly for business-scoped endpoints — always use `route()`.
- `route()` automatically calls `authorize()`, wraps in `transaction()`, and triggers `journeySaved()` for sales/expenses/debts/products.

### Idempotency keys on all mutating POST routes
Every POST that creates a financial record must include `idempotency_key: z.uuid()` in its Zod schema and use `ON CONFLICT(business_id, idempotency_key) DO UPDATE SET idempotency_key=excluded.idempotency_key` in the SQL, or check for an existing row before inserting.

```ts
const v = key.extend({ amount: money, ... }).parse(req.body);
// key = z.object({ idempotency_key: z.uuid() })
const old = await db.query('select * from expenses where business_id=$1 and idempotency_key=$2', [b, v.idempotency_key]);
if (old.rowCount) return old.rows[0];
```

### Zod validation — always parse at the route boundary
```ts
const v = z.object({ name: text, selling_price: money }).parse(req.body);
```
- Use shared primitives: `money` (string regex), `text` (trimmed, 1–200 chars), `date` (ISO date), `id` (UUID), `key` (idempotency_key object) — all defined at the top of `index.ts`.
- Never access `req.body.x` without parsing through Zod first.

### Error handling
- Throw `AppError(status, message)` for expected errors (404, 403, 409, etc.).
- The global error handler in `index.ts` maps `ZodError`, `AppError`, `MulterError`, and PostgreSQL error codes to appropriate HTTP responses.
- PostgreSQL error codes mapped: `23503` (FK), `23514` (check), `42501` (permission), `23505` (unique), `22P02` (invalid value).
- Call `reportFailure(label)` from `monitoring.ts` for 5xx errors before rethrowing.

### Audit trail
```ts
await audit(db, businessId, userId, 'product_created', record.id);
```
Call `audit()` after creating/modifying significant records (products, sales, debts, repayments, ajo).

### SQL conventions
- All date filtering uses `Africa/Lagos` timezone: `(created_at at time zone 'Africa/Lagos')::date`
- Monetary aggregates cast to `::text` to avoid floating-point issues: `coalesce(sum(amount),0)::text`
- Use `for update` when reading a row before a conditional write (stock, debt repayment).
- Parameterised queries only — never string interpolation in SQL.

---

## Frontend Patterns

### Data fetching hooks
```ts
// Read:
const q = useBusinessQuery<Product[]>('/products');

// Write (auto-invalidates business queries):
const { request } = useBusinessApi();
await request('/products', { name, selling_price }, 'POST');
```
Never call `api()` directly from page components for business-scoped data — use these hooks.

### Query client config
```ts
new QueryClient({ defaultOptions: { queries: { retry: 1, staleTime: 30000, refetchOnWindowFocus: false } } })
```
Do not override these defaults per-query unless there is a specific reason.

### Lazy loading
All page-level components are lazy-loaded via `React.lazy()` + `Suspense`:
```ts
const Inventory = lazy(() => import('./pages').then(m => ({ default: m.Inventory })));
```
Keep this pattern for any new top-level route component.

### Voice language i18n
Always use `@beta/shared` helpers — never hardcode UI strings that need translation:
```ts
import { voiceText, voiceReview, reviewText } from '@beta/shared';
const label = voiceText(language, 'sale');           // → "Record Sale" / "Ṣàkọsílẹ̀ títà" / ...
const review = voiceReview(language, 'RECORD_SALE', { quantity, product, unit_price, total });
```
`useVoiceLanguage()` provides the current `language: VoiceLocale` from context.

### Audio / TTS
```ts
import { ttsService, playPrompt, stopAudio, beginVoiceCapture } from './audio';

// Speak dynamic text:
await ttsService.speak({ text, language });

// Play static onboarding prompt:
await playPrompt(language, 'welcome');

// Stop all audio before recording:
const release = beginVoiceCapture();  // also calls stopAudio()
// ... recording ...
release();
```
- Always call `stopAudio()` before starting a new recording or playback.
- Use `beginVoiceCapture()` / release pattern to prevent TTS from playing during recording.
- Check `hasPrompt(language, prompt)` before calling `playPrompt()`.

### Form pattern
Use `RecordForm` with a `fields` config array for all data-entry forms:
```ts
<RecordForm
  fields={[
    { name: 'amount', label: 'Amount (₦)', type: 'number', min: 0.01 },
    { name: 'category', label: 'Category', options: [...] },
  ]}
  label="Save expense"
  onSubmit={d => request('/expenses', d)}
/>
```
`RecordForm` automatically appends an `idempotency_key` (UUID) to every submission.

### UI primitives
Use components from `ui.tsx` — do not create one-off styled wrappers:
- `Card`, `Button` (+ `secondary` prop), `Field`, `Badge`, `Empty`, `Loading`, `ErrorBox`, `Logo`

### CSS class conventions (from `app-interface.css` / `index.css`)
- Layout: `page-heading`, `dashboard-grid`, `task-grid`, `task-card`, `inventory-grid`
- Records: `record-row`, `record-button`, `summary-line`, `debt-record`
- Misc: `panel-title`, `button-row`, `filter-row`, `date-filter`, `tabs`, `muted`, `warning`, `eyebrow`
- Print: `no-print` hides elements from the passport PDF

---

## Shared Package (`@beta/shared`)

### Adding new shared types/schemas
1. Define Zod schema in the appropriate file (`index.ts`, `voice.ts`, `review.ts`, `journey.ts`)
2. Export the inferred TypeScript type: `export type Foo = z.infer<typeof fooSchema>`
3. Run `npm run build -w packages/shared` before using in frontend or backend
4. Import in backend with `.js` extension: `import { money } from '@beta/shared'`

### `money` type
```ts
import { money } from '@beta/shared';
// Validates: string matching /^\d{1,10}(\.\d{1,2})?$/
// Use for all monetary fields — never z.number() for currency
```

---

## Migration Guidelines
- Migration files live in `supabase/migrations/`, named `YYYYMMDDHHmm_description.sql`
- Each file must have exactly one outer `BEGIN;` / `COMMIT;` wrapper — no nested transactions
- Never modify an applied migration file — add a new file instead
- New files must sort after all existing files (increasing timestamp order)
- The runner stores checksums in `beta_migrations.history`; modified applied files are rejected
- Use `AUTO_MIGRATE=false` (default) for existing databases; set `true` only for fresh databases
- Run `npm run migrate -w server` as a deployment step, or set `AUTO_MIGRATE=true` for auto-apply on startup

---

## Voice Pipeline — Adding a New Action
1. Add the intent type to `packages/shared/voice.ts` (`actions`, `reviews` maps for all 4 languages)
2. Add the Zod schema to `packages/shared/index.ts` if new fields are needed
3. Register the route handler in `server/src/index.ts` using `route('post', '/your-path', handler)`
4. Add the path to the `voiceActions` Map in `index.ts` so voice confirmation can dispatch it
5. Update `intent.service.ts` to recognise and produce the new intent
6. Add review copy to `packages/shared/review.ts` for all 4 locales

---

## Security Rules
- **Never** put `SUPABASE_SERVICE_ROLE_KEY`, `NATLAS_API_KEY`, `YARNGPT_API_KEY`, or `BREVO_API_KEY` in frontend env vars or commit them to source
- **Never** expose `DATABASE_URL` to the frontend
- All financial writes go through the Express API — never direct Supabase DB calls from the browser
- Audio buffers are zeroed after transcription: `file.buffer.fill(0)`
- MIME type + magic-byte validation on audio uploads before sending to N-ATLAS
- Bearer token verified server-side on every `/api` request via Supabase service-role `getUser()`

---

## Testing
- Unit tests use a database double (no real DB required)
- Integration tests require a disposable local PostgreSQL 16 database — **never point at production**
- Run tests sequentially: postgres integration → HTTP integration (HTTP test needs migrated schema)
- On Windows: use `npm.cmd` if PowerShell blocks `npm.ps1`
- Test files are compiled to `dist/` and run with `node --test dist/*.test.js`
