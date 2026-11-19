# Brevo and Admin-only notification verification

Completed on 19 November 2026. The existing Resend delivery path has been replaced with Brevo transactional email. All application notification events now target only the server's `ADMIN_NOTIFICATION_EMAIL`; participant email collection and website recovery/documents remain intact.

## Changed files

| File | Change |
|---|---|
| `lib/admin-notifications.mjs` | Brevo REST adapter, validated server configuration, Admin-only policy, durable event deduplication, atomic delivery leases, provider IDs, failure classification, backoff and guarded retries. |
| `lib/server.ts` | Replaced recipient-taking notification functions with typed registration events. Persist notifications first and schedule provider delivery using Next.js `after`. |
| `app/api/[...path]/route.ts` | Updated every registration/proof/rejection/status notification, added captured-payment notifications with replay deduplication, private Admin configuration status and guarded outbox history/retry. |
| `app/email-configuration.tsx` | Clear Admin configuration issues, Admin-only policy and acceptance-versus-inbox explanation. |
| `app/club.tsx` | Brevo integration status, authenticated configuration refresh, queue retry outcomes, error/backoff/skip reasons and provider acceptance labels. |
| `scripts/check-production.mjs` | Validate Brevo sender/key/name and Admin recipient; no Resend configuration dependency. |
| `scripts/setup-mongodb.mjs` | Mark historical participant/legacy pending messages skipped, retaining body/recipient/history. This never sends email. |
| `mongodb.env.example`, ignored local `.env` | Add the four server-only Brevo/Admin setting names. Existing local MongoDB, session and login secrets are preserved. |
| `tests/brevo-notifications.mjs` | Mocked-provider and MongoDB outbox regression tests. |
| `tests/brevo-notification-flows.mjs` | Actual notification HTTP workflows and Admin browser checks, using disabled or intercepted provider calls only. |
| `tests/fixtures/mock-brevo-provider.mjs` | Explicitly loaded, tightly guarded test-only provider interceptor; never imported by production. |
| `scripts/run-registration-regression.mjs`, `scripts/create-registration-test-env.mjs` | Email safety settings and new tests in the disposable integration runner. |
| `package.json` | Add `test:email`. No provider SDK dependency is required. |
| `README.md`, `VS-CODE-START.md`, `UPI-PAYMENTS.md`, `BREVO-EMAIL.md`, `BREVO-TEST-REPORT.md` | Current setup, queue policy, live-account checks and verification results. |

## Executed checks

The final `npm.cmd run test:registration` passed against the disposable local MongoDB replica set. Its production build compiled and completed TypeScript, static generation and optimization. Standalone TypeScript and focused ESLint on the new email modules/tests and updated setup/validation/runner scripts also passed.

An initial build attempt hit a local out-of-memory error during TypeScript. A subsequent build and the final complete suite passed with development processes stopped; type checking was not disabled or bypassed.

### Mocked Brevo transport and outbox tests

- Correct fixed HTTPS endpoint, POST method, `api-key` authentication, sender object, one Admin recipient, subject and `textContent`.
- No participant `to`, CC, BCC or reply-to; participant contact data stays in the notification body only.
- Configuration rejects invalid/multiple recipient addresses and malformed sender settings. Environment values/API keys are omitted from configuration responses and sanitized errors.
- Deterministic event IDs prevent duplicate outbox entries; MongoDB leases prevent concurrent retry workers from sending the same entry unnecessarily.
- Successful provider acceptance stores the actual mock `providerMessageId`, status `accepted` and `deliveryStatus: not_confirmed`; it does not invent `deliveredAt` or claim inbox delivery.
- Missing credentials/recipient retain pending Admin notifications. A notification created without a recipient binds only to the server-configured Admin when available.
- Legacy participant messages, including a legacy message addressed to the same address as the Admin, are skipped instead of sent. Original recipients/bodies and historical sent entries remain unchanged.
- API 401, sender rejection, daily quota/credits, 429 with `Retry-After`, 503, network timeout and malformed-success responses remain safely pending with useful sanitized reasons.
- Backoff prevents immediate repeated requests. Safe retries reuse the documented JSON UUID idempotency key. Duplicate-key responses and expired uncertain acceptance require review instead of blind resend.
- Changing the configured Admin does not silently redirect historical messages for a former recipient.

### Website HTTP and browser tests

- New registrations, enquiries, trial/free registrations, initial manual UPI proof, rejection, resubmission, verification and Razorpay capture fixtures produce Admin-only notification events.
- Notification bodies include registration number, participant name, tournament/program, applicable amount and current payment status. Participant form email collection is preserved.
- Submission retries, repeated Admin verification and repeated capture webhooks do not create/send duplicate event messages.
- Website registration status, private tracking recovery, actual PDF acknowledgement/receipt downloads and payment authorization continue to work.
- Missing Admin/provider settings still allow registration, tracking and PDF download on a separate production app instance. Admin explicitly shows the missing `ADMIN_NOTIFICATION_EMAIL` issue.
- A test-only Brevo interceptor returned mock acceptance and a mock API authentication failure through the actual HTTP notification path. The first registration response completed while the provider was held behind an explicit release gate; acceptance occurred afterward. Invalid provider access did not fail registration and left its notification pending.
- Public status excludes Admin-only configuration details. Status/outbox responses omit the configured recipient and API key, and the configured test Admin address is absent from browser bundles.
- Chromium verified the Admin Brevo integration section, missing-configuration alert, skipped history and “Accepted by Brevo (delivery unconfirmed)” state. Screenshot: `outputs/email-tests/admin-missing-config.png`.

The full run also passed existing MongoDB owner/staff/capacity/file authorization checks, 118 UPI/security assertions, sequential numbering/concurrency/restart tests, tracking isolation and limits, nine PDF layout fixtures (25 rendered pages), actual state-specific document downloads, clipboard fallback, desktop/narrow-mobile layouts and fresh-browser recovery. Production test instances on ports 3010–3013 were stopped by their runners.

All provider calls were mocked or explicitly intercepted. Real provider keys were cleared by the test runner. No real email was sent and no test registrations were written to the configured club database.

## Configured database and remaining setup

`npm.cmd run db:setup` was applied to the configured club database without sending email. It marked **six** historical pending notification messages skipped with reasons, retaining their original recipient/body/history.

Local `EMAIL_FROM_NAME` is set to `Power Punch Club`. The configuration check still reports missing `BREVO_API_KEY`, `EMAIL_FROM_ADDRESS` and `ADMIN_NOTIFICATION_EMAIL`. Add real values to the server `.env`/hosting environment and restart. Registrations continue, and new Admin notifications remain pending in the meantime. Do not put these values into website content or `NEXT_PUBLIC_` variables.

Live account checks still requiring the user's Brevo account:

1. Activate/approve transactional sending and create a permitted API key.
2. Verify the configured sender and authenticate its domain/DNS as required.
3. Check credits, daily quota, account restrictions and any permitted-IP policy.
4. Perform a controlled test to the explicitly configured administrator mailbox, then inspect Brevo logs, inbox/spam results and retry behavior.
5. Configure and verify delivery-event webhooks separately if confirmed inbox delivery/bounce states are needed. This change deliberately records provider acceptance only.

See [BREVO-EMAIL.md](BREVO-EMAIL.md) for environment examples, safe retry rules, setup commands and links to the official Brevo endpoint/idempotency documentation.
