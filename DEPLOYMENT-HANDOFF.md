# Complete code release and separate content transfer

## Current authorized publication (23 November 2026)

This section supersedes the earlier dry-run/hold status below. The user subsequently explicitly authorized publication of the selected presentation content.

- Full-project lint is now **0 errors and 0 warnings**. Project-owned explicit `any` contracts were replaced with content/API/registration types; navigation components are stable, effect-driven browser synchronization is asynchronous, password toggles retain uncontrolled values, and public images use Next image markup without changing their stored URLs. No blanket rule disabling or new ignores were added.
- The existing configured `power_punch_club` destination received 8 gallery rows, 4 classes, 1 separate championship and its form (14 rows), plus 8 reviewed WebP public images and the unchanged non-payable PNG QR (9 files). No whole-database transfer occurred.
- Public photo references now point to their deterministic `/api/media/public%2F...` file IDs, so stored content does not depend on a localhost URL or an untracked filesystem upload. The original eight public WebPs remain tracked in Git.
- Existing genuine tournament `89e13617-2adb-4ebe-b9e4-9f4f8db630c3` was preserved. Branding was not written; saved hero `/power-punch-banner.webp` and position `50% 65%` were verified unchanged.
- New presentation records carry explicit publication metadata. They may appear in production without enabling local mock mode. The championship cannot offer Razorpay/real online checkout; it uses the existing manual-proof/review flow and its non-payable QR. Verification, acknowledgement and receipt gating remain unchanged. No additional public demo/mock badge was introduced.
- The new championship is selected for the existing homepage tournament card; the genuine event remains available in the tournament listing.
- `scripts/publish-presentation-content.mjs` defaults to a precise dry run. Applying requires explicit source/target files and exact database confirmation. It validates image hashes and decodes the QR, creates a private ACL-restricted scoped content backup and rollback journal under ignored `.local-backups/published-content-*`, then atomically appends missing rows/files. Existing IDs and differing files are never overwritten. Concurrent content edits abort the transaction. The protected live-import journal was marked committed after post-import verification.
- A subsequent read-only comparison confirmed all 14 records and 9 files identical, with no duplicate additions. The rollback journal retains only inserted IDs, fingerprints and public file hashes; do not restore whole arrays or remove pre-existing records. Stop rollback if imported records were edited or an event now has registrations.

Validation: production build and TypeScript passed. Full regression groups passed across the initial run and sequential continuation; an initial password-toggle value failure was fixed in the component, and a Chromium target crash during overlapping browser suites passed on the sequential proof rerun. The disposable content/publication suite passed dry-run/apply/repeat, scoped backup/journal creation, existing event/hero preservation, production-mode image URLs and full manual registration/review/tracking/receipt flow. Tests include 360/390/768/desktop viewports across the browser suites. No real email or payment requests were made by tests.

Read-only verification against the actual imported database through `http://localhost:3030` passed homepage/gallery/training/tournament pages and the registration QR at 360/390/768/1440px. Nine selected image URLs returned image MIME types and decoded dimensions; the QR download decoded to the original non-payable payload. Browser errors: zero. Mutation requests: zero. Screenshots are ignored under `outputs/published-content-readonly/`. This temporary local URL is not the Render website.

Render is not connected in this session, the repository has no Render API configuration/deployment metadata, and the public service URL has not been supplied. The final report identifies the pushed commit to select. No Render setting was changed and no manual Render deployment was triggered. Read-only rendering of the real imported database is checked through a temporary localhost renderer with all live providers blanked; it must not be reported as verification of the actual Render deployment.

Reproducible checks:

```powershell
npm run lint
npx tsc --noEmit
npm run test:registration -- .local-backups/registration-native.env
node scripts/run-content-regression.mjs .local-backups/registration-native.env
```

The local test environment and MongoDB executable/data remain ignored and are not part of the release. The production import was separately authorized; do not add it to startup or Render build commands.


## What belongs to this code update

The pending working tree was reviewed across application code, styles, server helpers, tools, tests, documentation, package changes and public assets. The release contains the completed work below; earlier reports document individual tasks and their historical test results.

| Completed work | Principal files |
| --- | --- |
| QR image download, loading/error feedback and original-format download | `app/manual-payment-fields.tsx`, `lib/payment-images.ts`, `app/api/[...path]/route.ts` |
| Private Admin proof thumbnail/viewer, original pixel ratio, zoom/scroll and original-byte download | `app/payment-proof-image.tsx`, `app/payment-proof-thumbnail.tsx`, `app/payment-proof-viewer.tsx`, `app/form-controls.css`, `lib/payment-images.ts` |
| Structured Admin review with separate registration/payment decisions | `app/request-review.tsx`, `app/request-review.css`, `lib/admin-review.mjs`, `app/club.tsx` |
| Escaped structured Admin-only emails, permitted submission events and historical outbox restrictions | `lib/admin-notifications.mjs`, `lib/notification-layout.mjs`, `lib/server.ts`, API route, Brevo tests/documentation |
| Restored homepage person and removal of unwanted Admin mock preview | Existing hero assets/implementation retained; `lib/hero-photo.mjs`, `app/club.tsx`, server content handling |
| Shared saved Gallery and natural image proportions/credits | `app/club-gallery.tsx`, `app/gallery-media.css`, gallery portions of `app/club-home.tsx`, eight files under `public/gallery/karate-worldwide/` |
| Local-only tournament/classes, non-payable QR and wording cleanup | `lib/local-mock-content.mjs`, `lib/karate-content-copy.mjs`, local seed/preview tools and tests |
| PDF tracking-help and duplicate top payment-instruction removals | Already committed in `8b6d4ca`; retained by this release |
| Selected content dry-run/conflict/rollback plan | `scripts/plan-content-transfer.mjs`, `lib/content-transfer-plan.mjs`, `content/production-transfer-dry-run.json` |

No credentials, `.env` files, generated build output, logs, database dumps, private uploads or participant/payment proof files belong to the commit. Eight licensed, optimized public gallery images do belong to Git. Sources/licenses are in `GALLERY-IMAGE-SOURCES.md`. No application startup seeding was introduced.

The fresh root `main` code checkout will now have the QR download implementation and its server endpoint, not just the previous wording-only commit. A code deployment does not insert MongoDB gallery/event/class rows or uploaded file documents.

## Verification for this release

- Production build and TypeScript: passed using isolated registration-test settings with live providers disabled.
- Existing overall regression groups: passed across the initial run and a continuation rerun. The first run stopped on a password-visibility fixture assertion; the unchanged password implementation/test passed on rerun. The continuation completed authentication/role isolation, 118 manual UPI/security assertions, mocked Brevo policy/delivery/retries, submission/QR/hero browser checks, four proof shapes at 360/390/1440 pixels, Admin review, mocked Razorpay verification/webhook replay, targeted wording checks, tracking, actual PDF downloads and browser recovery, and two-server/restart continuity.
- PDF layout: nine representative documents and 23 rasterized pages passed layout/selectable-text checks. The tracking-help row remains absent while separate credentials remain.
- `node scripts/run-content-regression.mjs .local-backups/registration-native.env`: passed on a newly created disposable `ppc_test_content_*` database. Includes repeat imports/seeds with no duplicates, all gallery images, Admin edit/reorder/delete/save/refresh, class/event editing/trial action, non-payable QR decode/download, optional local email, original portrait hash/dimensions, proof reject/resubmit/verify and acknowledgement/receipt gating. Mock-mode-off boundary denies mock QR/registration access. Its temporary database is cleaned up without touching the user's preview database. An initial Chromium screenshot capture failed while browser suites overlapped; the complete standalone rerun passed.
- Focused ESLint covering new components/helpers/tools/tests: zero errors, two gallery `<img>` warnings. Generated preview build output is now excluded from lint.
- Full-project lint remains failing in legacy files. The initial full scan had 157 errors/22 warnings; two new explicit-any annotations were corrected. The final full scan reports 155 legacy errors and 22 warnings. Comparison against Git HEAD for affected files found 170 pre-existing errors before this release. No global disabling of lint rules or unrelated legacy refactor was performed.
- `git diff --check`, selected asset hashes/licenses and staged secret/path checks are part of the final review.

No physical-device test, live bank transfer, live Razorpay checkout, real email delivery or Render production deployment was performed. Live behavior must be verified after Render identifies the released commit.

## Database content is NOT transferred

The read-only plan compares the isolated preview source against the remote database specified by the supplied target environment. Its association with Render is **not verified**. Recheck the target identity and regenerate the plan after any content changes.

```powershell
node scripts/plan-content-transfer.mjs --source=.env.content-preview --target=.env --output=outputs/content-transfer-review.json
```

This planner has no apply/rollback mode. It reads only selected `content` documents and the known public QR file, and never reads or copies registrations, accounts, payments, sessions, outbox history or private uploads. Output contains selected public content and fingerprints, not credentials or connection strings.

Current reviewed plan:

| Selection | Plan |
| --- | --- |
| Eight `karate-worldwide-01` through `karate-worldwide-08` gallery rows | Proposed additions only; eight associated public image files are included in the code push |
| Kids Beginner, Junior, Advanced and Weekend classes | Hold all four: schedules/fees/location/instructor are still fictional source records despite development wording being removed |
| `8b407d36-73f6-4fd8-9f2c-4084bc4b5601`, Power Punch Karate Championship | Hold: fictional event, venue, 7 January 2027 date, 31 December 2026 deadline, INR 500 entry and rules require real approval; production mock guards intentionally hide it |
| `89e13617-2adb-4ebe-b9e4-9f4f8db630c3`, existing power punch club event | Conflict: source is a disabled incomplete draft; target is an existing open/manual event. Preserve target unchanged; do not overwrite or create a duplicate |
| Public QR file `public/1e85942a-2bfa-4c8a-856b-5cac5eb06526` | Hold: PNG exists only locally. Its unchanged payload is plain non-payable text, not `upi://`. No production file insertion is proposed |
| Championship form | Held dependency of the held local-only championship; no automatic production form insertion |

The exact source records, safe existing-target summaries, eight image hashes/licenses and proposed fingerprints are in `content/production-transfer-dry-run.json`. No updates or deletions are proposed. No production write was executed. The existing constrained gallery/draft importer remains append-only; do not treat it as approval to run a production import.

For a future approved import, first replace/approve fictional details and genuine payment assets through a separate review. Do not enable the local-mock flag on Render to bypass its isolation guard.

### Undo only a future import

A future write operation must first create an import journal listing only newly inserted IDs and their exact saved fingerprints, plus newly inserted file IDs/hashes. Rollback removes only those inserted records when the current fingerprint still matches; if Admin has edited a record or registrations reference an imported event, stop for review. Never remove/restore the entire collection or database. Skipped/conflicting pre-existing records remain untouched. Remove newly inserted files only when their hashes still match and no records reference them; keep shared Git assets and old uploaded files. No rollback write is implemented or executed by this dry-run planner.

## Exact Render handoff

Render settings cannot be inspected with the current available connections. GitHub public metadata is checked separately, but absence of a GitHub check does not establish whether a Render webhook fired.

1. Open the intended Render **Web Service**, not another similarly named service.
2. Confirm repository `https://github.com/Kishore-DL/Power-Punch-Club.git` and branch `main`.
3. Root Directory: repository root (`.`/blank). This repository already has `package.json` at its Git root; do not add the extra nested Windows folder name.
4. Node version: at least `22.13.0`, matching `package.json` engines; a supported Node 24 release matches local testing.
5. Build Command: `npm ci --include=dev && npm run build`.
6. Start Command: `npm start`. The actual script is `next start`; Render supplies `PORT`. Do not run `npm run dev` as the production start command.
7. Keep real `MONGODB_URI`, `MONGODB_DATABASE`, session/tracking keys, Admin credentials and provider credentials in Render's environment only. Preserve stable existing keys. Set `PPC_CLIENT_PREVIEW=false`; leave `PPC_LOCAL_MOCK_CONTENT` absent/false. Leave `PPC_BUILD_DIR` unset so production uses `.next`, not either local test build directory. Set `PPC_PUBLIC_ORIGIN` to the real HTTPS origin. Do not paste the local preview environment into Render.
8. After this release push, select **Manual Deploy → Deploy latest commit** if an automatic deploy has not already started. Confirm the selected/deployed SHA matches the final commit reported to the user, rather than `8b6d4ca` or `3a6b528`.
9. Verify deployment status **Live** and inspect logs for a successful `next build` and `next start`. These scripts do not transfer content; do not add a seed/import command to Render startup.
10. Verify public assets return successfully; open an existing, correctly configured manual-payment event and check Download QR. Check Admin proof enlargement/download and the current registration workflow. Check active production content independently through Admin. Only after commit/data verification should browser/CDN cache be investigated.

The live site must not be described as updated until both Render's deployed SHA and its behavior have been checked. No Render settings or deployment were changed by this task.
