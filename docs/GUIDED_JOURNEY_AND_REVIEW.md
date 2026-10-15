# Guided journey and editable voice results

Beta now guides each trader through **add product → record sale → record expense →
record debt → view business summary**. The guide is available throughout the business
app, so moving between screens does not lose the current step.

## Progress and controls

- Successful product, sale, expense and debt writes mark their steps inside the same
  PostgreSQL transaction. A preview, failed save or microphone recording does not.
- Progress, visits, skipped steps, known steps, pause status and dismissed suggestions
  live in `activity_events` under `guided_journey_v1`, scoped to business and trader.
  These are existing tables and permissions: **no additional SQL migration is needed**.
- Existing business records count toward completed steps. The first visit reconciles
  them into the saved state. Reversing a sale does not erase an already saved lesson.
- Skip advances without creating a transaction. “I know how to do this” records a
  separate reason. Pause persists, and Resume continues from the current step.
- A returning trader resumes where they stopped; the expense-step greeting explicitly
  mentions their previously recorded sale.
- The summary button completes the last step and opens the dashboard. The completion
  message can be closed to reveal contextual recommendations.

`GET /api/businesses/:business/journey` reads progress. `POST` to the same URL accepts
`visit`, `pause`, `resume`, `skip`, `known`, `summary` or `dismiss`. Step changes must
refer to the current step; a stale tab receives 409 instead of skipping another step.

After the sequence, recommendations use real records: today's positive sales with
no recorded expenses, or non-archived stock at/below its warning threshold. Expense
suggestions are dismissed for that Lagos-calendar day; stock suggestions stay dismissed
until that product changes. Recommendations do not automatically speak on every visit.

## Review before saving

- Onboarding lets traders edit each transcribed answer and review/edit all three
  answers together. Name/category/business creation occurs only on **Confirm record**.
- The dashboard assistant shows the actual transcript, an editable transcript, the
  interpreted fields and the calculated total. Changing the transcript disables
  confirmation until it is interpreted again.
- **Edit manually** changes product, quantity, price, payment status/customer, expense
  details, stock reason, or debt/repayment details as appropriate to the action.
  **Review changes** validates the fields on Express and recalculates the preview.
- `POST /api/businesses/:business/voice/review` accepts a current `confirmation_id`,
  optional response `language`, and an `edits` object. It resolves inventory/customers
  within the authorized business and returns a new confirmation ID. The old ID stops
  working. It cannot modify a saved transaction or choose an arbitrary API route.
- **Correct with voice** reparses a correction such as “No, I said two bags” against
  the existing draft, preserving the other recognized fields. A new review is shown;
  neither the correction nor a spoken “yes” saves the transaction.
- The existing checkout keeps its editable product/quantity/price/payment form and
  preview/confirm handlers. It additionally supports transcript edits and spoken
  correction of a single-product draft. Edit multi-product sales manually.
- Shared business forms support **Fill a field with voice**. Choose a field, record,
  edit the recognized value and apply it. Voice-filled forms require a second review
  and **Confirm record** before the existing submit handler runs. This covers products,
  profile/business names, expenses, debts, customers, stock updates and other forms.
  Structured numeric values are parsed conservatively; unclear numbers require editing.

The browser never sends a replacement total for a voice sale. Express calculates it,
and confirmation reuses the existing atomic/idempotent financial handlers. Recordings
stop pending speech requests; guidance cannot start speaking while a microphone is active.

## Speech and configuration

Guide copy and controls are defined for English, Yoruba, Hausa and Igbo in
`packages/shared/journey.ts` and `review.ts`. The app-wide selected language is reused.
Personalized dashboard guidance uses the backend YarnGPT service, with the existing
`YARNGPT_API_KEY` and `YARNGPT_VOICE_EN/YO/HA/IG` settings. The seven prerecorded
onboarding files remain static. No new recordings or external LLM are required.

Restart the backend and rebuild/redeploy the frontend for these changes. Keep
`AUTO_MIGRATE=false` on the manually initialized database until migration history is
reconciled. This feature does not require changing that setting.

## Verification

From the repository root:

```powershell
npm.cmd run build
npm.cmd test
$env:PLAYWRIGHT_CHANNEL='msedge'
node node_modules/@playwright/test/cli.js test --workers=1
node infra/test_tts.mjs --language en --text 'Welcome, Mama Amina. Let us start by adding something you sell.'
```

The last command calls the real YarnGPT provider and consumes credits. Successful
local synthesis on 2026-10-15 produced a 50,400-byte / 6.3-second English greeting.
Real short ready-prompt synthesis also succeeded in Yoruba (9,792 bytes), Hausa
(7,488 bytes), and Igbo (8,928 bytes). All four resulting MP3s fully decoded with
FFmpeg; measurements are in `artifacts/journey-real-tts.json`. Native-speaker
pronunciation review is still needed; successful decoding does not establish accuracy.

`tests/e2e/guided-review.spec.ts` explicitly mocks Auth, ASR, TTS and server persistence
to test UI behavior. `server/src/http.integration.test.ts` uses real PostgreSQL and
real financial handlers with an Auth stub and transcript fixtures. It tests journey
progress/reload data, skipped tasks, two-trader isolation, contextual dismissals,
quantity correction, all five financial review types, stale confirmations and replay.

## Limits

- Browsers can block automatic audio after a fresh page load. The visible guide and
  Hear again button remain available. Provider failures also leave the text controls usable.
- Anonymous progress belongs to that Supabase user. Clearing browser session data or
  switching devices creates a different identity unless an account recovery flow is used.
- Unconfirmed financial drafts expire after five minutes and live in one Express
  process. A restart/replaced draft returns 409 and requires a fresh review; journey
  progress survives because it is stored in PostgreSQL.
- The deterministic parser supports a bounded vocabulary. Arbitrary corrections,
  ambiguous inventory/customer matches, and complex multilingual numbers may need
  manual edits. Translation and speech quality require native-speaker review.
- Editing after a save uses the existing correction/reversal workflow; these changes
  do not silently overwrite the original financial record.
