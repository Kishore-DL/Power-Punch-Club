# Registration implementation and verification

## PDF font-rendering correction

The downloaded-PDF rendering defect was reproduced: subsetting the bundled variable Noto fonts retained extractable text but dropped many visible glyph outlines. Earlier text-extraction tests did not detect this. PDFs now embed the complete fonts through `lib/pdf-fonts.mjs`, including the shaping runtime needed for Tamil text.

`tests/pdf-rendering.mjs` fails against the former subset configuration with an invisible-glyph assertion and passes with the fix: all 68 tested letters, digits and reference punctuation have visible rasterized ink. The browser regression now also renders the actual downloaded acknowledgement to `outputs/registration-tests/browser-acknowledgement-rendered.png`; the resulting page was visually inspected. `npm.cmd run test:registration`, the production build, TypeScript and focused lint passed after this correction. Run `npm.cmd run test:pdf` for the standalone rendering check. Previously downloaded files must be downloaded again to obtain the corrected embedded fonts.

Additional changed files for this correction: `lib/pdf-fonts.mjs`, `lib/registration-document.ts`, `tests/pdf-rendering.mjs`, `tests/registration-browser.mjs`, `scripts/run-registration-regression.mjs`, `package.json` and `package-lock.json`.

Implemented and tested on 19 November 2026 (Asia/Kolkata).

## Delivered behavior

- Global atomic MongoDB registration counter, configurable prefixes and legacy suffixes, minimum six digits, continuation above 999999, unique partial reference index and collision retries. Historical identifiers and payment references are preserved.
- Cryptographically random six-character private codes, keyed verification digests, authenticated encryption with a versioned server-side key ring, a unique digest index, idempotent retries and secure on-demand legacy assignment.
- Visible Track Registration navigation, case/whitespace normalization, matching number/code lookup, short-lived scoped sessions, shared MongoDB IP/number/service cooldowns, participant-safe status/details and existing UPI correction flow.
- Success-screen copy controls with accessible fallback, actual PDF downloads, same-device archive, fresh credentials for subsequent registrations, and cross-device recovery from the downloaded PDF.
- Multipage acknowledgements/confirmations and separately numbered verified payment receipts, embedded club logo/fonts, IST timestamps, team/form details and tracking instructions. Aadhaar, hidden fields, screenshots and private notes are excluded. Private tracking codes are omitted from general portal lists and administrative PDF downloads.

## Changed files

Server and persistence:

- `lib/registration-identity.mjs` — counter, cryptography, migration preflight/indexes, tracking limits, sessions and authorization.
- `lib/mongodb.ts`, `lib/registration-access.ts` — identity collision handling and portal credential redaction.
- `lib/registration-document.ts`, `lib/payment-receipt.ts`, `lib/manual-payment.ts` — real PDFs, visibility filtering and safe participant payment state.
- `lib/participant-types.ts`, `lib/defaults.ts` — shared participant types and configurable default registration prefixes.
- `app/api/[...path]/route.ts` — registration identity, tracking/status, scoped uploads/proof correction, document downloads and participant-facing rejection reasons.
- `app/[[...slug]]/page.tsx` — credential-safe content failure diagnostics.
- `scripts/setup-mongodb.mjs`, `scripts/check-production.mjs` — indexes, conflict checks and required-key validation.

Interface and assets:

- `app/track-registration.tsx`, `app/registration-actions.tsx`, `app/registration.css` — recovery UI, copy/download controls and responsive layout.
- `app/club.tsx`, `app/payment-receipt.tsx`, `app/layout.tsx`, `app/globals.css` — navigation, success/review flows, downloads and styles.
- `assets/fonts/NotoSans.ttf`, `assets/fonts/NotoSansTamil.ttf` and their two OFL license files — portable embedded PDF fonts.

Tests, configuration and documentation:

- `tests/registration-identity.mjs`, `tests/registration-tracking.mjs`, `tests/registration-browser.mjs`.
- `tests/manual-payment.mjs` — additional PDF-state/privacy and scoped UPI recovery checks.
- `scripts/run-registration-regression.mjs`, `scripts/create-registration-test-env.mjs`.
- `package.json`, `package-lock.json`, `next.config.ts`, `tsconfig.json`, `eslint.config.mjs`, `.gitignore`.
- `mongodb.env.example`, local ignored `.env`, local ignored `.env.registration-test`, `README.md`, `REGISTRATION-TRACKING.md` and this report.

The `.env` change added independent random tracking keys while preserving existing connection, session and login credentials. Generated test builds and local backups are ignored. No test registrations were submitted to the configured club database.

## Executed checks

`npm.cmd run test:registration` completed successfully against an isolated Docker `mongo:8` replica set and disposable `ppc_test_registration_20261119` database. The runner builds production code and exercises production servers on localhost ports 3010 and 3011, then stops them.

| Check | Result |
|---|---|
| Next.js optimized production build and TypeScript | Passed |
| Concurrent counter initialization and allocation across Mongo clients | Passed |
| Prefix/suffix changes, forced reference and tracking-code collisions, 1000000 continuation | Passed |
| Idempotent submissions across two production instances and process restart | Passed |
| Legacy long-token recovery and concurrent one-code assignment | Passed |
| GCM tamper/record binding and versioned encryption-key rotation | Passed |
| Historical duplicate detection without rewriting records | Passed |
| Shared IP, number and global limits; temporary cooldown; session isolation/expiry | Passed |
| Existing MongoDB owner/staff, capacity, upload and receipt integration | Passed |
| UPI/security regression including pending, rejection, scoped proof upload/resubmission, verification and webhook fixtures | Passed, 118 assertions |
| Free/trial/team registration, scoped acknowledgements and verified receipts | Passed |
| PDF text checks for tracking codes, hidden/Aadhaar exclusion, payment-state headings and final team member across multiple pages | Passed |
| Chromium real PDF download and fresh-browser recovery using extracted PDF values | Passed |
| Clipboard API and selected-text fallback; two participants on one browser | Passed |
| Desktop 1440px and narrow 390px/320px layouts and horizontal-overflow checks | Passed |
| Focused ESLint on new modules, tests and runner scripts | Passed |

Expected duplicate-record and malformed-request errors are deliberately exercised by the regression suite. They are not failures of the suite.

Repository-wide `npm.cmd run lint` is not clean: the existing application uses many explicit `any` types and React hook patterns rejected by the current lint configuration. That broader cleanup was not part of this registration change. Focused lint and the production TypeScript build pass.

Visual artifacts and actual downloaded PDFs are under `outputs/registration-tests/`, including desktop/mobile success screens, recovered tracking, normal acknowledgement and a multipage team acknowledgement.

## Configured database and local website

Before migration, inspection found one historical registration and no duplicate reference/digest groups. `npm.cmd run db:setup` was then applied successfully to the configured database. Setup created indexes/counter infrastructure without rewriting historical registration documents.

The stale development server was restarted. Chromium verified that both `/` and `/track-registration` load without the unavailable message and that the tracking form is visible at `http://localhost:3000`. Preview remains disabled. These were read-only page checks.

The disposable MongoDB test container is stopped after testing; the updated local development website is left running on port 3000. A final read-only check confirmed both identity indexes and the counter in the configured club database.

## Setup and remaining deployment checks

See [REGISTRATION-TRACKING.md](REGISTRATION-TRACKING.md) for reproducible Docker setup, migration and regression commands. Required tracking variables are `PPC_TRACKING_DIGEST_KEY`, `PPC_TRACKING_ACTIVE_KEY`, `PPC_TRACKING_KEYS` and the existing `PPC_SESSION_SECRET`. Preserve/securely back up these keys. Production also needs the exact HTTPS `PPC_PUBLIC_ORIGIN` and a correctly trusted ingress IP header.

Migration command: `npm.cmd run db:setup`. Production commands: `npm.cmd run build`, then `npm.cmd start`. Local development: `npm.cmd run dev`.

Unverified live integrations: real UPI bank transfers, real Razorpay checkout/capture/webhook delivery, email delivery, public HTTPS/proxy/session behavior and production-host load. Regression payment providers and email were deliberately disabled; only signed fictional Razorpay webhook/capture state fixtures were used.
