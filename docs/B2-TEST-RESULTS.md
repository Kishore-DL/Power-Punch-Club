> Updated migration/load verification: [25 November results](B2-MIGRATION-LOAD-RESULTS.md). This supersedes older statements below about real-B2 checks, migration and CORS. Git publication is recorded in the Git history; deployment and live-reference activation remain separate.

# B2 / Owner local verification — 25 November 2026

All work remains uncommitted on local `main`; original HEAD `981c1d6` is unchanged. No Git push, Render deployment, production migration, real email/payment or real registration deletion was performed. Existing `.env` was not modified. Dedicated disposable loopback MongoDB databases and SDK mocks were used. Test application servers and the test-owned MongoDB process were stopped afterwards.

## Commands actually run

| Command | Result |
| --- | --- |
| `npm.cmd run lint` | PASS, no ESLint findings |
| `npx.cmd tsc --noEmit` | PASS |
| `git diff --check` | PASS; Git reports only its normal package-lock LF/CRLF conversion notice |
| `npm.cmd run test:registration -- .local-backups/registration-native.env` | PASS after fixes; includes production build, registration/payment/email/auth/tracking/PDF/browser regressions, two production instances and restart continuity |
| `npm.cmd run test:storage -- .local-backups/registration-native.env --build` | PASS on final implementation; isolated Next.js **production** build/start plus SDK, migration, Owner API/UI and B2 application workflow tests |
| `node --env-file=.local-backups/registration-native.env tests/report-query.mjs` | PASS; 6,005-row pagination and real filter engine |
| `node --env-file=.local-backups/registration-native.env tests/report-exports.mjs` with `PPC_TEST_URL=http://localhost:3042` | PASS; both genuine PDF/XLSX contain all 6,005 matching rows |
| `node --env-file=.local-backups/registration-native.env tests/report-browser.mjs` with `PPC_TEST_URL=http://localhost:3042` | PASS; browser filters, columns, presets, exports and responsive views |

Production builds used the isolated `.next-registration-tests` output and actual `next build` / `next start` commands. The normal `.next` output was not substituted for a development-only test. The report tests used the existing ignored, guarded local test-server helper on port 3042. To repeat, start a disposable local replica set and use the existing test configuration generator or the existing ignored native environment; never point these runners at Atlas/production.

## What passed

- B2 configuration: independent restricted credentials/buckets; endpoint/region checks; incomplete configuration fails closed; Admin gets sanitized missing/connection feedback. SDK mocks assert no visibility/ACL changes.
- Original uploads: PNG/JPEG/WebP, portrait/landscape/square/very-tall originals, exact hashes and pixel dimensions. Existing browser proof suite verifies marked edges at 360/390/1440px, local preview, thumbnail, expanded viewer, zoom/keyboard scrolling and downloads. Public Admin upload no longer automatically resizes/converts files.
- Media/private access: approved website record access, unapproved/pending/private denial, immutable keys, exact version-bound signed GET with five-minute expiry/no-store, QR originals, correct MIME/extensions, Admin proof access, Staff proof denial and Staff permitted-photo download.
- B2 app integration: **actual compiled Next routes + official SDK**, intercepted exclusively in the guarded test process; no remote SDK transport. Required upload ownership/purpose checks, failed upload without Mongo binary fallback, pending-object denial, malformed-image rejection and interrupted-claim content readability.
- Actual generated registration PDF contains the B2-backed logo. Receipt remains unavailable before payment verification. Streamed B2 PDF/XLSX files parse correctly, have checksums and create no new GridFS binary files.
- Migration: inventory, copy, checksum/size verification, source retention, resume/idempotence, rollback while source exists, explicit source cleanup, refusal to roll back missing source, abandoned-only cleanup and shared-reference retention.
- Deletion: actual Owner binding; anonymous/Admin/Staff/forged-owner rejection; Origin checks; POST-only; password/phrase/token scope/expiry; concurrent changes/additions; exact registration/student/paid/file counts; optional sanitized backup; Mongo transaction/tombstones; counters/accounts preserved; cancelled/redacted outbox; revoked/deleted exports; shared file retention; exact-key versions/delete markers; simulated Object Lock partial status and successful retry; deleted registration cannot be recreated by replay.
- Archive/history: closed event remains in reports; removed content with surviving registrations remains discoverable from snapshots; complete tournament/history purge removes its historical option.
- Owner Settings UI: collapsed entry, actual preview counts/password/confirmation controls and no horizontal overflow at 360/390/1440px. Captured images inspected at 390/1440px.
- Report regression: OR within a field / AND between fields; current/new/renamed/removed fields; privacy, zero/false, inclusive IST dates, registration/student views; genuine 6,005-row exports; preset create/rename/delete; 360/390/768/1440px browser views.
- Existing registration/payment/email regressions include mocked provider failures, session isolation, manual UPI review/reject/resubmit, verified receipt gating, tracking recovery, selectable Tamil-capable PDFs and original proof downloads.

## Failures found and corrected during implementation

- New upload-purpose enforcement exposed the **real tracking-page resubmission upload** missing `payment-proof`. Fixed that production caller and reran the full suite successfully. Direct synthetic proof-upload helpers were updated to the same explicit contract.
- An expiry-test fixture initially hashed a token differently from the implementation. Corrected the fixture; expiry checks pass.
- A temporary browser-test edit had a syntax error; corrected before final successful runs.
- Browser interception did not receive the cross-origin target of an already redirected image request in this environment. Final browser mock resolves the **real app signed redirect** through an explicit first-hop test bridge to synthetic B2 bytes. This is not represented as a live CORS/remote delivery test.
- A non-fatal Node 24 `Buffer()` deprecation warning occurred in the report dependency/test path. It did not fail parsing, rendering, hashing or build checks.

## Not verified / remaining live checks

There are no real B2 variables in the existing `.env`. No credentials were invented or requested for this local implementation. The following require separately configured dedicated B2 test buckets/keys: actual bucket visibility inspection, remote upload/download/delete capabilities, real CORS at exact origins, remote signature expiration after five minutes, real lazy-load/refresh transport, actual Object Lock/retention and multipart failure behavior. Five-minute signing bounds, fresh request signing, version selection, retention failures and retries were checked with mocks, not claimed as live service verification.

No Render settings/deployed behavior was changed or verified. No production migration/dry-run against live data was run. No 5,000-concurrent-registration capacity claim is made. Per-action deletion bounds are 10,000 records / 12 MB registration text. Reports are conservatively revoked globally after a deletion. Backups are separate retained copies and are not full database restore archives.

## Actual screenshots (ignored test artifacts)

- [Owner confirmation UI — 390px](../outputs/storage-owner/owner-390.png)
- [Owner confirmation UI — 1440px](../outputs/storage-owner/owner-1440.png)
- [Mock B2 media refresh — 390px](../outputs/storage-owner/b2-media-390.png)
- [Mock B2 media refresh — 1440px](../outputs/storage-owner/b2-media-1440.png)

Configuration, key mapping, CORS, startup, migration, cleanup, Owner workflow and later Render steps: [Tamil handoff](B2-OWNER-HANDOFF-TA.md), [technical instructions](B2-OWNER-GUIDE.md), [placeholder environment](../.env.b2.example).

## Changed files

- `.env.b2.example`
- `.gitignore`
- `README.md`
- `app/api/[...path]/route.ts`
- `app/club-api.ts`
- `app/club.tsx`
- `app/data-management.tsx`
- `app/track-registration.tsx`
- `docs/B2-OWNER-GUIDE.md`
- `docs/B2-OWNER-HANDOFF-TA.md`
- `docs/B2-TEST-RESULTS.md`
- `docs/b2-cors.json`
- `lib/admin-notifications.mjs`
- `lib/b2-storage.mjs`
- `lib/club-types.ts`
- `lib/data-management.ts`
- `lib/file-references.mjs`
- `lib/file-storage.ts`
- `lib/manual-payment.ts`
- `lib/mongodb.ts`
- `lib/mutation-lock.mjs`
- `lib/payment-images.ts`
- `lib/registration-access.ts`
- `lib/registration-report.ts`
- `lib/report-exports.ts`
- `lib/storage-maintenance.mjs`
- `package-lock.json`
- `package.json`
- `scripts/b2-maintenance.mjs`
- `scripts/check-production.mjs`
- `scripts/run-registration-regression.mjs`
- `scripts/run-storage-regression.mjs`
- `scripts/setup-mongodb.mjs`
- `tests/b2-sdk-preload.mjs`
- `tests/b2-storage.mjs`
- `tests/b2-workflows.mjs`
- `tests/data-management.mjs`
- `tests/manual-payment.mjs`
- `tests/request-review.mjs`
- `tests/submission-ui.mjs`
