# Beta — N-ATLaS integration evidence

Status: template; live integration has not yet been evidenced. Replace placeholders with observed results before submission.

## Purpose and architecture

Beta helps traders record sales through voice. Browser recording → authenticated Express upload → official language-specific NCAIR ASR → transcript → NCAIR1/N-ATLaS sale extraction → user review and correction → confirmed sale and inventory update in PostgreSQL.

Implementation: `server/src/services/natlas.service.ts` and voice routes in `server/src/index.ts`. The configured gateway must actually run the official models. Adapter code alone does not prove this.

## Deployment evidence

- Test date/time and timezone: [fill]
- Beta version/commit and app URL: [fill]
- Gateway operator and contract: [fill]
- LLM checkpoint and actual ASR checkpoints tested: [fill]
- Operator/model-loading evidence establishing checkpoint identity: [attach]

## Observed end-to-end example

- Anonymous tester and interaction ID: [fill]
- Language and spoken task: [fill]
- Actual transcript: [fill]
- Actual extracted intent: [fill]
- User corrections and final confirmed sale: [fill]
- Linked database interaction/sale IDs: [fill]

## Attachments

Attach redacted real requests/responses for `/v1/audio/transcriptions` and `/v1/chat/completions`; service logs with timestamps and model identity; screenshots showing transcription, extracted fields, review, and saved sale. Remove authorization headers, secrets and participant identifiers. Label any illustrative samples as illustrative.

## Results and limitations

List only languages and workflows actually tested. Record observed failures, latency, and unresolved issues. Distinguish configuration, successful live calls, and verified model identity.
