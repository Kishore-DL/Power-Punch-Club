# Admin registration reports

## Current behavior

Open /admin and select Registrations & enquiries. Choose a tournament first. Only fields in its CURRENT linked form and Registration status are offered in filters, sorting and Choose Columns. Historical-only fields and generic payment/contact/date/team columns are not added. Private fields remain excluded. Existing submitted answers/snapshots and review/payment/tracking endpoints are not rewritten.

One row per student is the initial UI mode; One row per registration remains available. Team rows share registration-level form answers: member-specific information that was not collected is not invented. Counts distinguish registrations, students and matching rows. REVIEW always opens the parent registration.

Values within a field match OR; fields combine using AND. Text supports selectable values, Equals and Contains; numbers support exact/range; dates use inclusive IST boundaries; booleans use Yes/No and uploads presence only. Search form answers searches only permitted current form answers. Options combine current configured options and submitted values from the selected tournament.

Tournament changes reset filters/columns to the newly selected form. Current form edits/reassignment refresh within four seconds or on window focus; removed columns/filters are removed from the active query. Stable field IDs distinguish duplicate labels. Server validation rejects fields not in the current catalogue. Saved presets are private to the Admin; loading an outdated preset requires reviewing unavailable fields before Apply.

## Mobile

At widths below 768 CSS pixels, Add Filter scrolls/focuses the new filter, Choose Columns opens and scrolls/focuses column choices, and Apply/Clear All/Refresh/pagination scroll to results after loading. Loading a preset scrolls to its column choices. Export initiation/progress and completion scroll to report feedback. Closing REVIEW returns to the table. Background polling and restored historical jobs do not initiate scrolling. Desktop does not auto-scroll. Reduced-motion preferences are respected; section focus does not open the keyboard.

Advanced options are collapsible. The mobile Apply/Clear All bar stays available at the bottom of the controls; touch targets are at least 44px there. Existing Admin review/proof styles and public layouts remain separate.

## Genuine downloads

The replaced implementation only generated CSV from a loaded subset and revoked its object URL immediately. There was no genuine Admin report PDF/XLSX endpoint in that branch; a specific earlier HTML download could not be reproduced. The new client checks HTTP status, MIME and PDF/ZIP signatures, so HTML/JSON/login errors are not saved as documents.

One validated query is reused for lists, counts and export jobs. MongoDB snapshot sessions, stable sorting and bounded cursors cover all matching rows, not just a visible page. ExcelJS emits real XLSX with text-typed values, safe formula-looking input, frozen headers, wrapping and filters. PDF-lib emits selectable Tamil/Latin landscape tables, repeated headings, complete long-row pagination, IST metadata and column groups for wide selections.

Jobs/files belong to the creating Admin account/version. Atomic claims, request-ID deduplication and a unique active-job index prevent unnecessary concurrent exports. Polling resumes queued jobs. Private GridFS files are streamed with no-store headers. Expired/interrupted/empty/failed exports do not offer partial files. Existing acknowledgement/receipt font defaults remain unchanged; only report Tamil fonts use shaped-glyph subsetting.

## Limits and destination setup

16 filters; 50 values per filter; 24 selected columns; 2,000 current fields; list pages up to 100 rows. XLSX maximum 100,000 rows and 32,767 characters per cell. PDF maximum 10,000 rows, 2 million characters and 1,500 pages. Files maximum 50MB, eight-minute generation deadline, ten-minute interrupted-worker lease, 24-hour expiry with lazy file/chunk cleanup. Limit violations fail explicitly, not by truncation.

Run the updated npm run db:setup on a destination before enabling export jobs; it adds query/idempotency indexes without indexing every form answer. This work does not run database setup against production.

## Local practice and tests

```powershell
cd D:\Power-Punch-Club-MongoDB\Power-Punch-Club-MongoDB
node scripts/run-filter-practice.mjs
```

Open http://localhost:3043/admin?practice=filters . The explicit setup uses a separate loopback replica set/database, disables providers, and idempotently prepares three tournaments, three forms, four masters and twelve individual registrations. It does not read/change real .env credentials. Practice credentials are fictional local-only credentials printed by this command. No practice seeding occurs during regular application startup, and no practice database/files are transferred by a Git push.

```powershell
node tests/current-form-practice.mjs
node tests/mobile-report-navigation.mjs
```

The overall runner uses a different guarded disposable database and mocked providers:

```powershell
npm.cmd run test:registration -- .local-backups/registration-native.env
node --env-file=.local-backups/registration-native.env tests/report-query.mjs
node scripts/run-report-preview.mjs .local-backups/registration-native.env --port=3042
```

After the seed and local production server are ready, in another terminal:

```powershell
$env:PPC_TEST_URL="http://localhost:3042"
node --env-file=.local-backups/registration-native.env tests/report-exports.mjs
node --env-file=.local-backups/registration-native.env tests/report-browser.mjs
node tests/report-pdf-layout.mjs
```

Use --dev with run-report-preview.mjs for the development server and --build to rebuild production first. Run report-query AFTER the overall runner, because the overall runner resets only its own disposable database. All generated screenshots, PDFs/workbooks and local configurations stay in ignored outputs/.local-backups folders. The exercised large dataset has 6,005 rows; the 100,000-row ceiling is not a benchmark result. Physical mobile devices, other browser engines and live Render require separate verification.

## Verified before the main-branch push

- Full registration regression passed, including role/session isolation, original proof bytes at four aspect ratios and three widths, review decisions, mocked UPI/Razorpay/email, tracking/documents, two production servers and restart continuity.
- Content/public layout regression passed on fresh disposable databases: homepage/classes/tournaments/gallery, 320/360/390/430/768/1366/1440/1920px, 48 cold/refresh measurements, 32 actions, no browser errors and no server mutations in the read-only layout audit. The layout test distinguishes a card without a photo from an actual image card.
- Current-form query tests passed, including current/new/renamed/removed/duplicate fields, OR/AND, zero/false, inclusive IST dates, private-field rejection, student/registration counts and 6,005-record pagination.
- Both real XLSX/PDF export tests parsed all 6,005 matching rows, with column order, phone/reference text, formula-like input, role isolation, private files, idempotency, expiry and empty/error cases verified.
- Production Admin browser tests passed for presets, filters, selectable/reordered columns, real downloads, rejected HTML downloads, current-form-only choices, review and session expiry.
- Final practice and mobile-navigation browser tests passed: fresh login, three tournaments/twelve registrations, automatic form edits/reassignment, approval, exports, 320?1440px, section scrolling/focus, keyboard/reduced-motion behavior, default student mode and optional registration mode.
- Production build, TypeScript, PDF text/raster layout checks and full-project ESLint passed. Initial Windows commit-memory/pagefile failures were retried serially after stopping only our completed test services.

Live Render behavior and physical mobile devices were not verified. A Git push transfers code, not local practice content or database records. Production index setup remains a destination operation; it was not executed against live data.
