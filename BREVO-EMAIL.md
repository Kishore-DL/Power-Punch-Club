# Brevo transactional email — Admin notifications only

Application email is delivered only to the server-configured club administrator. Registration forms continue collecting participant email for contact details. Participant acknowledgements, payment messages, rejection/correction notices and resubmissions no longer generate participant-directed email. Participants use website tracking, acknowledgements and verified receipt downloads for updates.

## Server configuration

Set these values in the local `.env` or your hosting service's server environment:

```dotenv
BREVO_API_KEY=<your Brevo API key>
EMAIL_FROM_ADDRESS=<your verified sender email address>
EMAIL_FROM_NAME="Power Punch Club"
ADMIN_NOTIFICATION_EMAIL=<one club administrator email address>
```

Use a Brevo API key, not SMTP credentials. No value belongs in a `NEXT_PUBLIC_` variable, public website content, client bundle or browser settings. Editing the club contact email in Brand & homepage does not change the notification recipient. Restart the app after editing server environment settings. `RESEND_API_KEY` and the old `EMAIL_FROM` setting are no longer used for delivery.

The existing download/status/tracking workflows do not depend on email. Missing settings show a specific issue in Admin → Overview and Integrations & system. New Admin notifications remain pending until the configuration is available. A pending notification created with no recipient is bound once to the configured administrator when delivery becomes possible; participant or branding addresses are never used as a fallback.

Brevo's [transactional email endpoint](https://developers.brevo.com/reference/send-transac-email) is used directly: `POST https://api.brevo.com/v3/smtp/email`, authenticated with `api-key`. Requests contain `sender.email`, `sender.name`, one Admin `to` address, `subject` and `textContent`. There is no participant CC, BCC or reply-to routing.

## Notification events

The administrator receives only genuinely new tournament/individual/team registrations, new participant UPI proof revisions, and captured Razorpay payments. Initial manual registration plus proof produces one combined registration/payment-submitted email. Enquiries and trials are separate request kinds and do not email. Admin verification/rejection, approvals, notes/status edits, order creation, page visits, tracking and receipt downloads do not send notifications.

Messages use responsive, inline-styled HTML tables plus a labelled plain-text alternative. Applicable rows include registration number, participant/contact, tournament, individual/team and team size, contact information, IST submission time, payment method, INR amount, registration/payment status and transaction/reference. Manual submissions say **Awaiting Admin Verification**. Values are HTML-escaped; Aadhaar, tracking credentials, uploaded proof images and private notes are excluded. A configured public HTTPS logo is optional; the message remains readable with images blocked. An Admin-panel link is included only when `PPC_PUBLIC_ORIGIN` is validated HTTPS.

Registration idempotency and repeated payment-capture/webhook handling reuse deterministic outbox event IDs. Proof submissions are keyed to their proof revision. A failed email request never rolls back a saved registration or verified payment.

Notification entries are persisted before the website responds. Provider delivery runs in Next.js `after` callbacks, so a slow Brevo request does not hold up registration submission. If a hosting process stops before delivery completes, the durable pending entry remains available for the guarded retry workflow.

## Outbox and retry safety

- At enqueue, immediately before sending, and during retry, the recipient and allowed-event policy are checked again. The final provider `to` address comes directly from `ADMIN_NOTIFICATION_EMAIL`.
- Disallowed historical events (including manual Admin verification, rejection, status updates and duplicate initial proof notifications) are skipped with a reason, retaining original history. Only eligible submission events can retry.
- Legacy/participant-directed pending entries are marked `skipped` with a reason. Their original recipient, body and history remain in MongoDB. They are never silently redirected to the administrator. Entries for an administrator address that no longer matches configuration are also skipped.
- `npm.cmd run db:setup` applies this historical cleanup without sending emails. Admin outbox reads/retries and new notifications also enforce it, so forgetting the setup command cannot allow a historical participant email to be sent.
- Missing configuration leaves Admin notifications pending. Invalid API access, sender errors, quota exhaustion, rate limiting and network failures also preserve pending notifications, with a sanitized error and retry time. Raw provider messages and credentials are not logged or exposed.
- A MongoDB lease prevents concurrent workers from unnecessarily sending the same entry. Backoff and `Retry-After` are respected by manual retry. Retry processes at most 25 eligible entries per request.
- Requests reuse a stored UUID in Brevo's JSON `headers.idempotencyKey`. Brevo documents a [30-minute idempotency window](https://developers.brevo.com/docs/heterogenous-versions-batch-emails). Local event IDs and leases provide additional protection. After an uncertain timeout/crash, retries use the same payload/key within that window. Once it expires, or the sender/payload changes while acceptance is uncertain, the item remains pending with `retryBlocked` and a request to review Brevo logs. A duplicate-key response likewise requires review instead of blind resend.
- There is no force-resend button for uncertain outcomes. Check the Brevo transactional log first and reconcile the outbox with its provider message ID before any intentional resend. This avoids claiming permanent exactly-once delivery from a provider's limited idempotency window.

## Acceptance and delivery

A successful Brevo response with a message ID stores `providerMessageId`, `acceptedAt`, status `accepted` and `deliveryStatus: not_confirmed`. Admin displays “Accepted by Brevo (delivery unconfirmed).” A malformed success response without a usable ID remains pending as uncertain. Existing historical `sent` entries are preserved and labelled as historical provider submissions.

No email-delivery webhook is configured by this change, so inbox delivery, bounces, spam placement and opens are not asserted by the app. Verify these in your Brevo account. The configured recipient and API key are not returned by public status, Admin status or outbox APIs; the Admin queue shows recipient labels rather than environment values.

## Setup and tests

```powershell
npm.cmd run db:setup
npm.cmd run check:production
npm.cmd run build
```

The production check reports missing/invalid Brevo settings, but website registrations remain available while email is unconfigured. This check cannot validate live account activation or sender/domain authorization.

```powershell
# Existing disposable test setup; never point tests at club data.
docker start ppc-registration-tests-20261119
npm.cmd run test:registration
```

The regression runner clears real email/provider credentials. Mocked transport tests and an explicitly preloaded test-only Brevo interceptor verify the provider payload, failures and acceptance without sending real mail. The interceptor requires a local disposable `ppc_test_…` database, an exact fake key and an explicit `@example.invalid` Admin recipient. Production does not import it. `npm.cmd run test:email` runs the focused mocked adapter tests with `.env.registration-test`.

Before enabling live delivery, use your Brevo account to activate transactional sending, create an appropriately permitted API key, verify the sender/domain and authenticate DNS as needed, check credits/daily quota and restrictions, and perform a controlled test to your explicitly configured administrator mailbox. Check Brevo logs, inbox/spam results and failure/retry behavior. No real email is sent by automated tests.
