# Registration and payment PDF layout

Implemented in the existing download generator on 19 November 2026. No new environment variables or database migration are required. Existing registration numbers, payment references, tracking codes, document authorization and payment verification checks are preserved.

## Layout and data behavior

- Shared A4 layout with 42-point side margins, a correctly scaled current uploaded/local logo, dynamic club identity/contact information, right-aligned document title/reference and generated Asia/Kolkata timestamp.
- Canonical state titles: Registration Confirmation, Registration Acknowledgement and Payment Receipt. Configured custom headings remain available as subtitles; configured notes have their own section.
- Bordered two-column registration, form, payment and tracking tables; bold labels, regular values, consistent padding and alternating row backgrounds.
- Measured natural word wrapping, grapheme-safe splitting of overlong references/Tamil words, multiline answers and variable-height rows. Ordinary rows stay intact. Rows longer than a page split with repeated section/field identification.
- Separate team table with serial number, participant name, age and belt. Column headings repeat when the table continues. Continuation pages identify the club, document type and reference.
- Payment and tracking sections stay together when they fit on a fresh page. Footers contain page totals and available contact details. Notes paginate without blank trailing pages.
- Dynamic answers follow stored field definitions and their captured order, including numeric field IDs. New registrations save `receiptFieldOrder`; legacy snapshots continue to use their stored definitions, and records without snapshots use the current form definitions/visibility settings.
- Empty optional answers are omitted; zero and false are retained. Permitted files appear as “Document submitted.” Aadhaar fields, hidden answers, private upload URLs, internal credentials and private Admin notes are excluded.
- Payment status comes from the current registration. A paid flag without the existing required payment reference does not qualify for a receipt or a “Payment verified” status. Receipt numbers remain separate from registration numbers.
- Private tracking codes remain restricted to authorized participant copies. Administrative copies keep the existing omission of private tracking credentials.
- Static embedded Noto Sans and Noto Sans Tamil regular/bold faces avoid the prior variable-font rendering defect. Text remains selectable. Representative PDFs measured approximately 669–953 KB, including multipage documents; fonts are embedded once per document.

## Changed files

| Files | Change |
|---|---|
| `lib/pdf-layout.ts` | New shared A4 renderer, tables, wrapping, pagination, team continuation, headers and footers. |
| `lib/registration-document.ts` | Maps real registration/snapshot/payment/branding data into the shared renderer; preserves download integration and verified-payment gating. |
| `lib/payment-receipt.ts` | Definition-based field order, stored snapshots, legacy visibility fallback, empty/zero/false handling and private-field filtering. |
| `lib/pdf-fonts.mjs` | Shared static regular/bold English and Tamil embedded fonts. |
| `assets/fonts/NotoSans.ttf`, `NotoSansTamil.ttf` | Replace variable faces with smaller static regular faces. |
| `assets/fonts/NotoSans-Bold.ttf`, `NotoSansTamil-Bold.ttf` | New static bold faces; existing OFL family license files are retained. |
| `app/api/[...path]/route.ts` | Capture the submitted form-field order alongside the existing registration snapshot. |
| `tests/pdf-layout.mjs` | Representative documents, all-page rasterization, geometry/bounds, pagination, team headings, logo aspect ratio and size checks. |
| `tests/pdf-document-data.mjs` | Actual HTTP-download tests against saved data and later Admin edits; current payment states and privacy checks. |
| `tests/pdf-rendering.mjs` | Allow rendering a specified continuation page. |
| `tests/registration-browser.mjs`, `tests/manual-payment.mjs` | Update extraction/title assertions for the structured table layout and canonical titles. |
| `scripts/run-registration-regression.mjs` | Include the layout and actual-document data tests in the full regression suite. |
| `package.json` | Add `test:pdf:layout`. |
| `PDF-LAYOUT-REPORT.md` | This report and reproduction details. |

## Executed verification

`npm.cmd run test:registration` passed using a disposable local MongoDB replica set and production Next.js servers. The run includes the optimized production build and TypeScript checks. Focused ESLint passed for the new layout, generator, font helper and PDF test modules.

### Representative PDFs: 9 documents, 25 rendered pages

| Fixture | Pages | Verified |
|---|---:|---|
| Confirmation | 1 | Header, contacts, zero amount, Tamil name, tracking and note fit on A4. |
| Acknowledgement | 2 | Awaiting-verification state, dynamic fields, zero/false, multiline text and document placeholder. |
| Payment receipt | 1 | Separate receipt number, verified state, transaction reference, confirmation time and note. |
| Team registration | 5 | Fifty members, long English/Tamil names and repeating column headings. |
| Many fields | 8 | Sixty variable-length fields, continued sections and final field preserved. |
| Oversized answers | 5 | One hundred multiline answer lines, a long unbroken reference, continued labels and final note preserved. |
| Missing optional details | 1 | No empty contact fields, no unwanted tracking code, sensible footer fallback. |
| Long contacts | 1 | Long club name, multiline address and long email wrap without clipping. |
| Wide logo | 1 | Raster measurement confirms the supplied 3:1 aspect ratio is preserved. |

Every representative page was rasterized, checked for A4 dimensions, selectable-text bounds, page totals, repeated identification and nonempty body content. All team pages with members were checked for repeated headings. First-page and continuation renders were visually inspected for readable text, aligned columns, table borders, spacing and page breaks.

### Actual downloaded documents: 6 states

The actual `/api/registration-document` endpoint generated confirmation, pending UPI acknowledgement, rejected UPI acknowledgement, verified UPI receipt, captured-state Razorpay receipt and an acknowledgement with an unverified paid flag. All pages of these downloaded documents were rendered (12 pages total).

Checks verified saved form labels and exact ordering after Admin edits, stored tournament title, numeric field IDs, zero/false, multiline answers, omitted optional empty fields, document placeholders, hidden/Aadhaar/token/Admin-note/private-URL exclusion, tracking-code presence only in authorized participant output, configured notes, transaction/correction reasons, separate receipt numbers and confirmation timestamps. A paid flag without a payment reference returned HTTP 409 for a receipt request. Legacy records without field snapshots respected current visibility settings.

The existing MongoDB integration suite and UPI/security suite passed, including 118 UPI/security assertions. The full run also passed scoped document authorization, Staff/Admin isolation, tracking recovery, two production instances, idempotency, restart continuity, real browser PDF download, clipboard fallback, mobile layouts and fresh-browser recovery using values extracted from the downloaded acknowledgement.

No real payment provider was charged and no production registration data was modified by these tests. Live provider delivery was not part of this layout change.

## Review and reproduce

Representative PDFs and PNGs: `outputs/pdf-layout/`. The actual browser-downloaded PDF and its rendered preview also remain under `outputs/registration-tests/`.

```powershell
npm.cmd run test:pdf:layout
npm.cmd run test:pdf
```

For the complete integration suite, use the existing `.env.registration-test` and local disposable replica set documented in `REGISTRATION-TRACKING.md`:

```powershell
docker start ppc-registration-tests-20261119
npm.cmd run test:registration
```

The integration runner deliberately resets only its guarded local `ppc_test_…` database. It builds into `.next-registration-tests` and stops test app instances after completion. Download a new document from the website to obtain the updated layout; existing downloaded files do not change.
