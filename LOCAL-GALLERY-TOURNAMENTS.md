# Local gallery and tournament content

## Result and isolation

The current `.env` uses remote Atlas and was neither changed nor used for content writes. A separate ignored `.env.content-preview` was generated with fresh local Admin/session/tracking credentials and blank email/payment credentials. Before import, its target was confirmed as `ppc_preview_gallery_v1`, loopback `127.0.0.1:37029`, replica set `ppcPreview`, backed by `outputs/content-preview-mongodb/`.

The local site runs at **http://localhost:3020**. `PPC_CLIENT_PREVIEW=false` makes it read persisted content rather than the older hardcoded demonstration content. The preview runner explicitly blanks live sending/payment keys. No real emails, payments, registrations, deployment or remote database writes occurred.

## Added content

Eight distinct photographs, all in the **Karate worldwide** album:

1. World championship kumite
2. Kumite on the competition mat
3. Close-range kumite exchange
4. Tournament sparring
5. Tournament kick and counter
6. Flexibility practice
7. Group conditioning
8. Practising the fighting stance

The homepage shows three featured records from the same saved gallery collection. The full Gallery page shows all eight, including visible photographer/source/license credits. The images are explicitly identified as other dojos/competitions, not club history. All were visually inspected, resized without cropping to at most 1400 pixels, and converted to WebP; combined optimized size is 1,510,466 bytes. Natural dimensions, alt text and lazy loading are supplied. Gallery styles preserve the complete image on desktop/mobile and are confined to gallery elements.

See [GALLERY-IMAGE-SOURCES.md](GALLERY-IMAGE-SOURCES.md) for the eight original Wikimedia Commons pages, photographers, CC BY/CC BY-SA/CC0 licenses and modification disclosure. No unlicensed bundled `/demo/` photos, participant identity records or private uploads were used.

One **disabled draft**, titled **power punch club**, uses the ID of the existing configured event (`89e13617-2adb-4ebe-b9e4-9f4f8db630c3`) to prevent duplication during future transfer. Its existing configured date (30 November 2026), deadline (24 November 2026), city (Vellore) and fee (INR 500) are retained as supplied values requiring confirmation. They were not independently verified as official information.

The existing description, categories, eligibility and rules contain placeholders/ambiguous text. The prepared draft leaves those fields empty and includes an editable Admin checklist. Confirm the official title, full venue/address, dates/deadline, fee, categories, age/belt eligibility and rules; supply an approved poster. No complete genuine tournament could be published from the available material, so **no tournament registration was opened**. The public listing remains empty and the draft's direct public URL is unavailable. View/edit it under Admin → Tournaments.

## Payment configuration

Inspection showed the configured event's poster and purported UPI QR both contain the same unrelated avatar screenshot. Neither was copied into the selected content. No valid approved QR or UPI ID was available. Supply the correct club QR, confirm its payee/UPI ID and instructions, and verify the event details before enabling manual UPI. The draft has `registrationMode=disabled`, `manualPaymentEnabled=false` and empty payment/image URLs. No payable QR or payment identity was invented.

The existing QR display/download, proof viewer, receipts, tracking, forms, notification policy, Admin review and hero implementation were not modified by this task. Only the gallery subsection of `club-home.tsx` changed. The existing remote event and its payment configuration were not altered.

## Import and persistence

`content/local-gallery-tournaments.json` is the reviewed package, including stable IDs, credits, source/license URLs and asset SHA-256 hashes. The importer has no startup hook. Its default is an offline plan with no database connection. Applying requires an explicit environment file and, normally, a loopback database named `ppc_preview_*` or `ppc_test_*`.

Only the `gallery` and `tournaments` content arrays are appended, inside one MongoDB transaction. Existing IDs, edits and order are retained; new entries append. Registrations, private files, payments and other content keys are not imported or replaced. First local run added 8 gallery items/1 draft; subsequent runs skipped all 9. Both the database and production preview server were restarted without importing again; all eight items and the disabled draft remained present.

## Verification performed

- Production build through `node scripts/run-content-preview.mjs --build`: passed, including TypeScript.
- `node tests/content-import.mjs`: passed; hashes/licenses, loopback/database guards, append-only/idempotent merge, preservation of edited/unrelated records, rejection of private asset paths and protection against enabled/incomplete drafts.
- `node tests/content-preview.mjs`: passed against the actual isolated database and production preview. Homepage/full gallery share saved records; all images load with meaningful alt text and natural proportions; no horizontal overflow at 360/390/1440px; credits and source notice; lightbox/Escape; hero cutout; unpublished draft/direct-link exclusion; existing Admin editing, reordering, removal, save and refresh. Temporary gallery edits were restored. Zero registration/outbox records were created.
- Screenshots in `outputs/content-preview-tests/` were generated at 360/390/1440px and representative captures visually inspected.
- `node tests/admin-review.mjs` and `node tests/notification-layout.mjs`: passed, including review presentation and existing hero selection rules.
- Focused ESLint: no errors in new scripts, tests or gallery component; two `no-img-element` warnings remain for the optimized gallery images/lightbox. Full-project lint is not claimed clean; the existing large application components have previously reported lint errors.
- Current selected-record export and packaged asset/hash validation: passed. Export is read-only to the database.
- The first browser run failed only on an overly strict selector for an existing Admin control; the selector was corrected and the complete browser test passed.

Not performed: physical-device/cross-browser testing, live payments/email, production publishing, or a public detail page for an unverified event. QR display/download was not tested with a real approved club QR because the configured image is not a QR. The entire authentication/payment/PDF regression suite was not rerun for this gallery-only change; those implementations were left unchanged.

## Exact local preview commands

The preview is currently running. Open:

- `http://localhost:3020/`
- `http://localhost:3020/gallery`
- `http://localhost:3020/tournaments` (no published complete events)
- `http://localhost:3020/admin` → Photo & video gallery / Tournaments

Admin ID: `preview-admin`. Read its generated password from `.env.content-preview` (`PPC_BOOTSTRAP_ADMIN_PASSWORD`); it is separate from the real Admin account and is not printed in logs or committed.

After restarting the computer, run in PowerShell:

```powershell
cd D:\Power-Punch-Club-MongoDB\Power-Punch-Club-MongoDB
.\scripts\start-content-preview-db.ps1
node scripts/initialize-content-preview-db.mjs
node scripts/run-content-preview.mjs
```

The database script uses an installed `mongod` or the existing ignored local MongoDB executable; alternatively pass `-MongoExecutable 'C:\path\to\mongod.exe'`. MongoDB is bound only to loopback. Initial setup on another checkout additionally requires `node scripts/create-content-preview-env.mjs`, then this explicit reviewed import:

```powershell
node scripts/import-preview-content.mjs
node scripts/import-preview-content.mjs --env=.env.content-preview --apply
```

Do not recreate an existing environment file or change the real `.env`. To build/start the production preview instead of development mode:

```powershell
node scripts/run-content-preview.mjs --build
node scripts/run-content-preview.mjs --production
```

## Future selected-content publication — not executed

Code deployment does **not** move MongoDB content. A read-only export of the currently selected local records and associated assets has been prepared at `outputs/selected-content-current/`. Export again to a **new** directory after caption/order edits:

```powershell
node scripts/import-preview-content.mjs --env=.env.content-preview --export=outputs/selected-content-final
node scripts/import-preview-content.mjs --manifest=outputs/selected-content-final/content.json --assets=outputs/selected-content-final/public
```

Export retains the selected records' saved order/edits and respects deletions. It excludes unselected records and private files. New image uploads or an enabled tournament require a reviewed updated manifest; the current validator deliberately rejects unreviewed assets and enabled drafts.

For a later authorized release, include the selected `public/gallery/` assets and their credits with the code deployment, preserving existing files. Review the package and take an appropriate production backup, then separately run the append-only importer using a server-only production environment file and the exact intended database name:

```powershell
# FUTURE RELEASE ONLY — not run in this task
node scripts/import-preview-content.mjs --manifest=outputs/selected-content-final/content.json --assets=outputs/selected-content-final/public --env=.env.production-content --apply --publish --confirm-database=YOUR_EXACT_DATABASE_NAME
```

The explicit publish mode permits the intended remote database only when the exact database name is confirmed. Existing IDs are skipped; therefore the already-existing live tournament will be preserved, not overwritten or duplicated. Review/complete that event through Admin separately before opening registration. No production transfer command has been executed.

## Files changed for this task

Gallery UI: `app/club-gallery.tsx`, `app/gallery-media.css`, gallery portions of `app/club.tsx` and `app/club-home.tsx`, and the stylesheet import in `app/layout.tsx`.

Content/assets: `content/local-gallery-tournaments.json`, eight WebP files in `public/gallery/karate-worldwide/`, `GALLERY-IMAGE-SOURCES.md`, this report.

Import/preview tooling: `lib/content-import.mjs`, `scripts/import-preview-content.mjs`, `scripts/create-content-preview-env.mjs`, `scripts/run-content-preview.mjs`, `scripts/start-content-preview-db.ps1`, `scripts/initialize-content-preview-db.mjs`.

Checks/configuration: `tests/content-import.mjs`, `tests/content-preview.mjs`, `.gitignore` for the separate build directory, `next.config.ts` to bound workers for that local build, and Next.js-generated preview type includes in `tsconfig.json`.

Local environment, database, screenshots and transfer bundles are ignored artifacts. Earlier unrelated uncommitted changes were preserved.
