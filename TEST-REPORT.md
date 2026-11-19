# Power Punch Club retest — 18 November 2026

## Result

The updated MongoDB source builds and the executed local regression suites pass. Manual UPI QR payments are implemented alongside free registration and Razorpay. The project has not been deployed to the owner's production infrastructure during this retest. Live service verification listed below remains required before public launch.

## Executed checks

| Check | Result |
| --- | --- |
| Production build and TypeScript | Passed with Next.js 16.4.6, React 19.3.1 |
| npm clean-install lockfile check | `npm ci --dry-run --ignore-scripts --no-audit --no-fund` passed |
| MongoDB setup | Local MongoDB 7.0.24 replica set connected and indexes created |
| Existing MongoDB HTTP integration | Passed owner/staff authentication, simultaneous capacity decisions, duplicate submission, registration confirmation, receipt access, private upload and authorised staff download |
| UPI and security regression | 102 assertions passed against real local HTTP endpoints and MongoDB |
| Runtime dependency audit | `npm audit --omit=dev` reported 0 vulnerabilities at the time of this retest |
| Full dependency audit | 14 high-severity dependency entries remain in development tooling, caused by the picomatch advisory GHSA-fc5q-39xc-vjpf and its dependent lint packages. The audit offered a breaking downgrade, which was not applied. Review this advisory before a security sign-off. |
| Browser public flows | Completed fictional UPI registration and without-payment registration, reopened a saved registration, opened its confirmation, started another registration, checked mobile navigation and Escape dismissal |
| Responsive layout | Checked desktop layout and narrow CSS viewports around 454 px and 340 px using browser zoom. QR image displayed at 210 px at the narrow width. Form, receipt and modal had no measured horizontal overflow. This was not a physical-device test. |
| Admin/Staff UI | Login page inspected at narrow width. Authenticated Admin verification and Staff permissions were tested through HTTP endpoints. A complete authenticated Admin/Staff browser click-through was not performed. |

Browser automation caused an HTML-attribute hydration warning from its extension's injected cursor attributes. The browser also logged extension metadata errors. These environment messages were distinguished from application API failures.

## Manual UPI regression coverage

- QR upload and public image retrieval, tournament configuration validation and Gallery save/read.
- Transaction-ID-only, screenshot-only and team registrations with correct amount calculation.
- Missing evidence, invalid transaction ID, malformed registration input, incorrect consent, changed fee, invalid select value, disabled registration and expired tournament rejection.
- Duplicate transaction references, including case changes, rejected. Registration retries remain idempotent.
- A participant cannot reuse another registration token's screenshot. Unsupported uploads and oversized requests rejected.
- Payment remains pending after submission. Payment receipt denied before verification.
- Anonymous and Staff payment review denied. Cross-origin Admin writes rejected.
- Admin rejection requires a reason. Participant can read review status and resubmit new proof. Stale proof review rejected. History retained.
- Admin verifies pending evidence and a unique receipt becomes available. Concurrent review and repeated verification do not issue multiple payment IDs.
- Private payment screenshots downloadable by Admin. Anonymous/Staff download blocked. Staff registration output omits proof URLs.
- Free registration confirmation, Razorpay option and UPI option operate together.
- Razorpay webhook invalid-signature rejection and valid signed fixture capture/replay were tested. The fixture simulates a provider event and does not perform a real payment.
- Receipt token access enforced. Staff password reset invalidates the previous session.
- Public pages and separate Admin/Staff routes responded successfully and supplied security headers.

## Local load measurements

Built production server with a fresh local database and email/provider API credentials unset. The reverse-proxy IP header was a test fixture. The test did not run against customer hosting.

| Operation | Requests | In flight | Total time | p95 response | HTTP result |
| --- | ---: | ---: | ---: | ---: | --- |
| Content reads | 1,000 | 100 | 4.6 s | 995 ms | 1,000 × 200 |
| Tournament registration writes | 1,000 | 25 | 13.1 s | 1,813 ms | 1,000 × 200 |

These measurements do not establish capacity for 1,000 simultaneous users on a production hosting plan. Repeat representative load tests on the intended hosting and Atlas deployment with email enabled if it is part of launch.

## Fixes made during review

- Added UPI QR configuration, evidence submission, private proof access, Admin review, resubmission and verified receipts.
- Added a unique manual transaction index and proof revisions for concurrent review safety.
- Updated Next.js/React/Zod and removed unused SQL/Worker build dependencies from this MongoDB edition. Applied available nonbreaking dependency audit fixes.
- Added bounded request-body handling, stronger registration input checks, server-side field validation, fee-change detection and response security headers.
- Made write-rate limits configurable and separated upload, registration, status and authentication scopes. Trusted ingress IP configuration is required for public launch.
- Database failure now shows an unavailable message on the public page instead of silently falling back to empty content.
- Added same-browser registration recovery and an explicit way to start another registration.
- Added dialog keyboard focus handling and corrected receipt opening scroll position.

## Before launch

1. Configure the actual MongoDB Atlas cluster, network access, application environment and HTTPS origin. Run `db:setup` against that database. Existing D1 data is not automatically migrated.
2. Sign in to create the owner, confirm Admin/Staff accounts, remove the bootstrap password and run `check:production` with the real deployment environment.
3. Upload the actual club QR. Check the real payee and amount with a UPI app, perform a controlled transfer, submit evidence, verify the bank credit in Admin and download the resulting receipt. Repeat a rejection/resubmission.
4. If Razorpay is enabled, test its actual checkout, capture, webhook, cancellation/retry and receipt in staging. If email is enabled, verify the sender, recipient/Admin delivery and failed-message retry.
5. Repeat mobile testing on physical phones, including photo selection and same-device UPI payment. Perform a full authenticated Admin/Staff browser review on the deployment.
6. Configure backups, test restore, monitor errors, check shared-network rate limits and measure traffic on the intended hosting plan.

Mock content and test scripts remain included. The real QR, bank transfer, Atlas account, domain, hosting, Resend sender and Razorpay credentials were not supplied for this retest. A successful local test suite cannot guarantee zero future faults.
