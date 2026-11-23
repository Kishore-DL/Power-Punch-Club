# Payment proof originals and display

## Inspection and cause

The complete current flow was inspected: registration/team and tracking file
selection, upload helpers, server upload validation/processing, MongoDB Binary
storage, Admin review, expanded viewer and download responses.

The participant registration and tracking uploaders already append the original
`File` to FormData. MongoDB already stores the supplied bytes directly. The
canvas resize/WebP conversion belongs to the separate **public branding/photo
uploader**, which remains unchanged. No square-cropping operation was found in
the current private participant upload path.

The old proof viewer relied on automatic CSS dimensions, maximum-height limits
and container-percentage zoom. It had no original-pixel-size mode or common
natural-dimension renderer. Local and Admin proof thumbnails were also missing,
and the earlier proof-image fixture was a square club logo. That coverage could
not establish correct behavior for portrait or very tall screenshots.

The display path is now explicit and proof-specific: both rendered dimensions
are calculated from the decoded image's natural dimensions using one scale
factor. Scoped raster rules override inherited square/cover sizing. Tests also
inject a conflicting square/cover rule to verify this isolation. This establishes
correct display for the tested originals; it does not establish that a user's
previous file was cropped before storage.

## Current flow

- File selection immediately creates a temporary local Blob preview. The same
  original File goes to registration or tracking upload, without a canvas,
  resizing, re-encoding or replacement. Blob URLs are revoked on replacement,
  removal or unmount. Selecting a replacement clears the previous attachment
  reference while upload is pending, avoiding an old/new proof mismatch.
- The existing 8 MB limit, signature validation, private storage and registration
  association remain. A private upload requesting background removal is now
  rejected before any external processing; public-image tooling is unchanged.
- Admin review shows an authenticated, bounded thumbnail of the entire original.
  No derived thumbnail file replaces the stored image.
- The expanded viewer has Fit image, Original size, zoom, keyboard scrolling,
  mouse dragging and native touch scrolling. Its toolbar stays outside the image
  scroll area. Original size displays one CSS pixel per decoded image pixel;
  image width/height, scroll limits and all edges remain available.
- Both Admin download actions use the record/revision-authorized original-proof
  endpoint with `download=1`. The response is the original stored byte sequence,
  with a safe `.png`, `.jpg` or `.webp` filename, validated image MIME,
  `private, no-store`, nosniff and attachment disposition. Preview uses inline
  disposition. Staff and anonymous requests remain denied.
- Existing stored originals use the same renderer. Valid legacy records without
  a proof revision also work without database rewrites; file ownership and the
  current screenshot association are still checked.

The restored public hero person, its responsive assets and masks, QR download,
email policy/templates, registration identifiers and payment workflows were not
reverted. No deployment or production data modification was performed.

## Verification

Disposable, edge-marked fixtures:

| Shape | Original pixels | Format |
|---|---:|---|
| 9:16 portrait | 900 × 1600 | PNG |
| 16:9 landscape | 1600 × 900 | JPEG |
| Square | 900 × 900 | WebP |
| Very tall screenshot | 600 × 6000 | PNG |

At 360, 390 and 1440 pixels, the proof regression verifies:

- The actual file-picker → upload → MongoDB flow preserves SHA-256 and decoded
  dimensions; both direct and actual browser downloads match the original hash.
- All four colored edge markers remain visible in local previews, Admin
  thumbnails and fitted expanded images. Rendered aspect ratio matches the
  natural ratio. Screenshots are checked for edge colors.
- Original-size geometry, zoom/refit, mouse panning, keyboard scrolling and
  access to top/left and bottom/right content. Controls remain on screen while
  scrolling. Escape, focus trapping and trigger-focus restoration work.
- PNG/JPEG/WebP filename extensions, MIME, private caching and nosniff headers.
  Anonymous and Staff preview/download attempts fail. Existing private media
  access remains restricted.
- Tracking-cookie resubmission also preserves the original bytes and local
  preview proportions. Legacy stored originals work without a revision field.
  Over-limit uploads and private transformation requests are rejected.

Production build/TypeScript and focused ESLint passed. The focused proof and
existing submission UI regressions passed. The final complete registration
regression PASSED, including two production server instances and restart
continuity, authentication/Staff isolation, QR download, submission-only mocked
email, payment verification/rejection/resubmission, tracking, PDF documents and
browser workflows. No remaining check failures were observed.

Artifacts: `outputs/proof-image-tests/verification.json` contains dimensions,
hashes and viewport results. The same folder contains marked source files,
actual downloads and local/thumbnail/fit/original-size screenshots.

Tests use the guarded disposable native replica set on loopback port 37028,
with real Brevo/Razorpay credentials disabled:

```powershell
$env:NODE_OPTIONS='--max-old-space-size=1024'
npm.cmd run test:registration -- .local-backups/registration-native.env
```

The native test server must be running. `.env` and production data are not used
for these destructive regression fixtures. No real emails or payment API calls
were made.

## Limitations

Production private files were not audited or modified. If a file was already
permanently cropped or re-encoded before it reached storage, missing content or
quality cannot be recovered with CSS. The original source must be uploaded again.
No claim is made that historical, already-cropped pixels have been restored.

Physical iOS/Android devices, OS-native download/share dialogs and JPEG EXIF
orientation variants were not tested. Responsive Chromium, marked screenshot
fixtures and byte/dimension comparisons were tested.

## Files changed for this fix

- `app/payment-proof-image.tsx`: shared natural-dimension renderer, fit and pan.
- `app/payment-proof-thumbnail.tsx`: private Admin thumbnail loading/errors.
- `app/payment-proof-viewer.tsx`: natural-size zoom, fixed controls and download.
- `app/manual-payment-fields.tsx`: original local preview and replacement cleanup.
- `app/form-controls.css`: scoped proof geometry and responsive viewer layout.
- `app/club.tsx`: Admin thumbnail and authorized original-download link.
- `app/api/[...path]/route.ts`: original download mode and private transform guard.
- `lib/payment-images.ts`: attachment response and safe legacy revision support.
- `tests/proof-images.mjs`: marked-image integrity, geometry, permissions and UI.
- `tests/submission-ui.mjs`: updated proof geometry/zoom assertions.
- `scripts/run-registration-regression.mjs`: new suite integration.
- `PAYMENT-PROOF-IMAGES.md`: findings, changes, verification and limitations.
