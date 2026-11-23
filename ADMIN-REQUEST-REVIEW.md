# Admin Request Review

## Scope

Replaced only the Admin request-review modal. The attachment contained the written request, without a separate screenshot; the existing implementation and locally generated browser screenshots were inspected.

- Balanced participant heading, labelled human-readable status badges, dark readable values and scoped responsive styles.
- Actual tournament snapshot/title, copyable registration number and transaction reference, contact details, submitted field snapshots, zero/false values, multiline messages and team table.
- Prominent payment amount and original proof thumbnail; existing private proof enlargement, zoom, scrolling and original download are reused. Free registrations have no empty payment panels.
- Separate registration decision/private note and payment decision/correction reason. Existing server validation and confirmation prompts remain in force. An operation lock and disabled controls prevent overlapping submissions; errors and successful saves scroll into view.
- Secondary internal references and previous review history are collapsed. Participant message, private Admin note and applicable correction reasons are distinct.
- Saves update the current local row from the successful operation. No polling, automatic registration-list refresh or notification calls were added.

No authentication, payment, notification, storage or public homepage code was changed for this task. Earlier uncommitted changes in the workspace were preserved. No deployment or production-data changes were made.

## Files changed for this task

| File | Purpose |
| --- | --- |
| `app/request-review.tsx` | Shared Admin review modal, explicit actions, feedback and private proof/document integration |
| `app/request-review.css` | Styles confined to this modal; desktop columns and mobile stacking |
| `lib/admin-review.mjs` | Display labels, tournament/snapshot resolution and submitted-answer formatting |
| `app/club.tsx` | Connect the existing Review button to the new component and update the saved row locally |
| `tests/admin-review.mjs` | Presenter and snapshot regression checks |
| `tests/request-review.mjs` | Responsive browser, permission, saved-action and mocked Razorpay checks |
| `tests/fixtures/mock-review-razorpay.mjs` | Isolated fake Razorpay verification responses; never calls live Razorpay |
| `tests/submission-ui.mjs` | Update the proof action's accessible name |
| `tests/proof-images.mjs` | Update the action name and keep the hostile image-CSS regression scoped to the new modal |
| `scripts/run-registration-regression.mjs` | Include the new review tests in the overall regression suite |
| `ADMIN-REQUEST-REVIEW.md` | This implementation and verification report |

## Verification

Tests use a guarded local MongoDB replica set and `ppc_test_` database. Live Brevo and Razorpay credentials are disabled; external-provider tests use mocks.

- Production build and its TypeScript check passed.
- Focused ESLint passed for the new component, presenter, tests, mock and regression runner, including the updated proof/submission tests. Linting `app/club.tsx` separately still fails with 103 errors and 11 warnings in the existing large component (primarily explicit `any` types and hook/static-component rules). Running the same lint against its Git HEAD version reports 112 errors and 12 warnings; this task does not undertake an unrelated cleanup of that file. `git diff --check` passes.
- Review presenter and browser checks passed: individual/team, free/manual/Razorpay, pending/verified/rejected/resubmitted, transaction-only/no screenshot, snapshots, zero/false, long values, multiline notes, copy/clipboard fallback, original download hash, proof enlargement, modal keyboard/Escape/focus, server failures, loading/operation lock, persisted registration actions, permission denials and no review-triggered emails or registration-list refresh.
- Razorpay verification uses the real handler against mocked authorized/captured provider responses, invalid signatures and repeated confirmation. Signed webhook replay is checked for one payment notification.
- Browser screenshots were generated at 360, 390, 768 and 1440 pixels. Representative desktop/mobile header, proof and action captures were visually inspected. Outputs are in `outputs/request-review-tests/` (ignored local artifacts).

Overall checks completed successfully across the initial run and the affected/remaining rerun:

- Authentication: separate Admin/Staff login/logout, revocation/expiry/legacy/replay, Staff entry/refresh/deep links, read-only permissions, password toggles and mobile validation.
- MongoDB registration: concurrent capacity, duplicate submissions, identity allocation/collisions, private uploads and authorized downloads.
- Manual UPI/security: 118 assertions covering submission, verification, rejection, resubmission and guards.
- Mocked Brevo: Admin-only routing, skip/history, retries, concurrency, provider errors, idempotency, notification deduplication and no email for Admin review actions.
- Submission UI: original QR display/download and errors, private proof associations, persistent hero handling and escaped notification content.
- Proof images: all four marked aspect ratios at 360/390/1440 pixels, original storage/download dimensions and hashes, all edges, original-size zoom/panning/keyboard scrolling, current/legacy authorization and tracking-cookie resubmission.
- Request Review: all new responsive and saved-action tests passed against the final build, including mocked Razorpay verification and signed webhook replay.
- PDF tests: visible embedded glyphs, nine representative documents/25 rendered A4 pages, pagination, snapshot/actual download content and state-specific receipt gating.
- Tracking/browser: secret isolation, free/team/verified downloads, fresh browser PDF text recovery, mobile layout and copy fallbacks.
- Two production server instances: 20 distinct concurrent registrations, 10 duplicate concurrent submissions, unique identifiers and continuity after restart.

Commands: `npm.cmd run test:registration -- .local-backups/registration-native.env` built the app and passed all groups before a Chromium resource interruption in proof testing. The ignored local helper `.local-backups/run-review-tail.mjs .local-backups/registration-native.env` reran the complete proof group and all remaining groups against that same production build/disposable database; every one passed, including the final two-instance/restart checks. The complete suite was therefore covered across these runs, rather than one uninterrupted run.

During development, the browser check identified a missing explicit accessible name on the status selector, which was fixed. A repeated test run also exposed non-unique fixture transaction references; the fixtures now use unique references. These initial failed runs were not reported as successful checks. The first overall run was interrupted by Chromium `ERR_INSUFFICIENT_RESOURCES` during the very-tall proof case; completed groups and the affected/remaining rerun are reported separately below.

## Limits

No physical-device testing, live email delivery, live bank transfer, live Razorpay checkout or production deployment was performed. Browser checks use Chromium device-sized viewports, not physical mobile hardware. Production records and old uploaded files were not audited.

## Local preview

In PowerShell:

```powershell
cd D:\Power-Punch-Club-MongoDB\Power-Punch-Club-MongoDB
npm.cmd run dev
```

Open `http://localhost:3000/admin`, sign in with your existing Admin credentials, choose **Registrations & enquiries**, and click **Review** on a registration. Use your existing configuration; do not copy the disposable test settings into the real `.env`.
