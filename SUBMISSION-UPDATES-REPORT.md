# Submission, payment image and hero updates

> Hero correction: the original public person image/fallback, sizing, blending
> and responsive source selection have been restored. Only the Admin mock banner
> preview and default-asset thumbnail are hidden; upload/settings controls remain.
> The earlier absent-person description below records the superseded requirement.
> QR, proof-viewer and email changes remain intact.

## What changed and where to preview

1. **UPI QR download:** open a tournament with manual UPI enabled, choose
   **Individual & pay** or **Team & pay**, then **Download QR**. The displayed
   image stays complete, without corner cropping. The server resolves the
   configured tournament's public upload and returns its original bytes with
   the correct PNG/JPG/WebP extension. Loading, missing-image, error and
   open-image/save-image fallback feedback are provided. Temporary Blob URLs
   are revoked; downloads are cancelled when the form unmounts.
2. **Admin proof viewer:** `/admin` → **Registrations & enquiries** → **Review**
   → **View payment proof**. The viewer fits the full image initially, supports
   zoom and scrolling, and shows the participant, registration number,
   transaction ID and payment status. Keyboard focus stays in the viewer;
   Escape closes only the viewer and restores the trigger's focus. The existing
   authenticated download, verification and rejection actions remain available.
3. **Hero foreground:** `/admin` → **Brand & homepage** → **Hero foreground
   photo**. Upload/replace a custom image, or select **Remove foreground photo**,
   then **Save changes**. Preview `/` and refresh. The bundled default person
   and its automatic fallback are gone. Custom photos, logo, background,
   headings and actions remain configurable. Empty foreground settings use a
   balanced single-column hero. Bundled assets and existing database records
   were not deleted.
4. **Submission-only Admin emails:** new tournament/individual/team registration,
   new participant UPI proof revisions, and trusted captured Razorpay payments
   are the only permitted events. Initial registration plus UPI proof creates
   **one combined notification**. Admin approval, verification/rejection,
   status/notes/content/account edits, enquiries/trials, order creation,
   tracking and downloads do not email. Participant contact email is still
   collected. Notifications go only to `ADMIN_NOTIFICATION_EMAIL`.

Emails now have a responsive HTML label/value table and a readable text
alternative. Applicable details include team size, contact information, IST time,
INR amount, statuses and transaction reference. Manual proof is labelled
**Awaiting Admin Verification**. User values are escaped. Private proof images,
tracking credentials, Aadhaar, notes and secrets are excluded. Only validated
public HTTPS branding/link URLs are included. Messages remain readable when
images are blocked.

## Security and history

- QR downloads accept a tournament ID, not an arbitrary URL to fetch.
- Proof previews require server-validated Admin authentication on every request.
  The server resolves the current proof through its registration, checks the
  revision and upload ownership, and validates image signature/MIME. Anonymous
  and Staff requests are denied. Responses use `inline`, private/no-store and
  nosniff; existing generic private-file downloads retain `attachment` behavior.
- Old pending events no longer permitted by the submission policy are marked
  skipped with a reason; their original history is retained. Policy checks run
  at enqueue, delivery and retry, including immediately before provider sending.
- Deterministic event IDs, proof revisions, MongoDB leases, backoff, Brevo
  idempotency and uncertain-acceptance review safeguards are retained. Provider
  acceptance remains distinct from inbox delivery. Email failures do not undo
  saved registration/payment data.
- Tests did not insert, delete or modify production data. Real secret values were not
  changed. No live emails, live payment API calls, deployment or project ZIP
  were made during this work.

## Verification

Focused production-browser checks passed for QR original-byte downloads,
missing/download-error feedback, private/current/associated proof access,
loading/error states, zoom, focus trapping, Escape, custom hero persistence and
escaped HTML/text email. Screenshots were generated at **360, 390, 768 and
1440 pixels** under `outputs/submission-tests/`. Standalone layout/hero unit
checks and focused ESLint passed. Optimized production builds and TypeScript
checks passed.

The final clean full registration regression **PASSED**, including two production
server instances and restart continuity. It covered the new QR/proof/hero/email
checks (including PNG, JPEG and WebP download MIME/extension/byte equality),
submission-only HTTP/mock-provider delivery, existing authentication/Staff
permissions, registration numbering, tracking, 118 UPI/security assertions,
9 representative PDFs / 25 rasterized pages and real browser PDF downloads.
Focused ESLint passed with no remaining errors/warnings. The observed nested
Escape/focus issue was fixed and verified. Hero animation is disabled for stable screenshot capture. A further read-only
review checked the actual local public hero at all four requested widths.

Docker/WSL failed to start reliably on this machine. Testing therefore used an
isolated native MongoDB 7.0 replica set on `127.0.0.1:37028`, with a guarded
`ppc_test_` database and an ignored test-environment copy. Only the official
MongoDB executable was selectively downloaded; no ZIP file was created.
Regression builds use two workers to reduce local memory pressure.

Not verified: physical iOS/Android devices, native Save Image dialogs, scanning
from an actual UPI app, live Razorpay transactions, or live Brevo inbox delivery.
Chromium responsive/browser tests and mocked provider checks cover the local
implementation; real payment QR scanability is preserved by returning identical
stored bytes, rather than re-encoding the QR.

## Local commands

Use the existing `.env`; do not overwrite its real settings from the example.

```powershell
cd D:\Power-Punch-Club-MongoDB\Power-Punch-Club-MongoDB
npm.cmd run dev
```

Open `http://localhost:3000`. Stop another running project server with Ctrl+C
first if it already occupies that port. For production mode, stop the dev
server, then run:

```powershell
npm.cmd run build
npm.cmd run start
```

The disposable regression runner includes an optimized production build:

```powershell
# With the existing Docker test replica set available:
docker start ppc-registration-tests-20261119
npm.cmd run test:registration

# Native fallback used for this machine's verification:
$env:NODE_OPTIONS='--max-old-space-size=1024'
npm.cmd run test:registration -- .local-backups/registration-native.env
```

The native fallback requires the local test MongoDB process running on 37028.
Its tools, database files, copied test environment, screenshots and generated
email previews are ignored by Git. Never point destructive regression tests at
the real club database.

## Changed files

- `app/api/[...path]/route.ts`: QR/proof routes, notification call restrictions
  and safe registration logo snapshots.
- `lib/payment-images.ts`: original image downloads and private associated proof
  responses with signature/MIME checks.
- `app/manual-payment-fields.tsx`: QR download, cancellation and fallback UI.
- `app/payment-proof-viewer.tsx`, `app/dialog-focus.ts`, `app/club.tsx`: Admin
  preview, nested-dialog focus/keyboard handling, existing download action and
  explicit hero foreground removal.
- `lib/hero-photo.mjs`, `lib/defaults.ts`, `lib/server.ts`, `app/club-home.tsx`:
  default foreground suppression, custom-photo preservation and email dispatch.
- `app/form-controls.css`: responsive QR/proof controls and absent-photo hero.
- `lib/admin-notifications.mjs`, `lib/notification-layout.mjs`: allowed-event
  queue/delivery/retry policy and HTML/text notification layout.
- `tests/notification-layout.mjs`, `tests/submission-ui.mjs`,
  `tests/brevo-notifications.mjs`, `tests/brevo-notification-flows.mjs`:
  new/updated layout, image, UI, event-policy and mocked-provider checks.
- `scripts/run-registration-regression.mjs`, `next.config.ts`: test integration
  and resource-bounded regression build workers.
- `BREVO-EMAIL.md`, `SUBMISSION-UPDATES-REPORT.md`: current behavior and handoff.
