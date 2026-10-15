# Beta — real-user validation evidence

Status: template; no completed participant sessions or results are asserted.

## Method

- Session dates, location/channel and Beta version: [fill]
- Recruitment and participant relevance to trading: [fill]
- Actual number of participants: [fill]
- Actual number of documented interactions: [fill]
- Languages tested: [fill]
- Consent: participants agreed to testing and anonymised reporting [record actual process]

Suggested plan: recruit 10 real traders, each completing five distinct voice tasks. This is 50 planned interactions, not 50 completed interactions. Use test inventory and clearly marked test transactions. One assisted device can be used; observer-assigned participant IDs do not imply separate app accounts.

## Five tasks per participant

1. Record a simple paid sale.
2. Record a sale containing two products.
3. Record an unpaid sale.
4. Record a sale with a missing detail; observe clarification and review.
5. Record another sale, inspect its interpretation and correct any error before confirmation.

Participants should speak naturally in a supported language they know. Count one spoken task as one interaction, not each API call or screenshot. Retain failures and retries with their relationship to the original task; do not inflate the count by counting technical steps.

## Interaction records

Maintain `interaction-log.csv`. Record expected details from the participant independently of model output. Include failures even when no database row was saved. Never fill results for sessions that did not occur.

## Actual results

- Completed spoken tasks: [fill]
- Correct interpretation without correction: [fill]/[total]
- Completed after correction: [fill]/[total]
- Failed tasks: [fill]/[total]
- Median latency, if measured: [fill with measurement method]
- Common errors and participant feedback: [fill]

Attach anonymised session notes, selected screenshots and database references. Describe assisted testing and test transactions honestly. The database corroborates saved interactions but does not independently prove participant identity or capture upstream failures.

## Conclusion and limitations

[Describe observed usefulness, language coverage and remaining issues. If fewer than 50 interactions occurred, state the actual count.]
