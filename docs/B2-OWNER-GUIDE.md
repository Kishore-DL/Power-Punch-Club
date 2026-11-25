# Private B2 + Owner Data Management — local handoff

Both buckets stay **PRIVATE**. This implementation never changes a bucket ACL, policy or visibility. No production copy, deletion, Git push or deployment is part of this change.

## Server configuration

Copy the names from `.env.b2.example` into your server environment **manually**; do not replace your existing `.env`.

| Variable | Backblaze value |
| --- | --- |
| B2_ENDPOINT | Bucket details → S3 Endpoint, prefixed with `https://`, without bucket/path |
| B2_REGION | Region segment of that endpoint, e.g. `us-west-004` |
| B2_MEDIA_BUCKET | Exact name of existing PRIVATE website-media bucket |
| B2_MEDIA_KEY_ID | `keyID` of a non-master application key restricted to that bucket |
| B2_MEDIA_APPLICATION_KEY | That key's `applicationKey`, shown at creation |
| B2_DOCUMENTS_BUCKET | Exact name of separate existing PRIVATE documents bucket |
| B2_DOCUMENTS_KEY_ID | Separate non-master key's `keyID`, restricted to documents bucket |
| B2_DOCUMENTS_APPLICATION_KEY | That documents key's `applicationKey` |

Both keys: `listBuckets`, `listFiles`, `readFiles`, `writeFiles`, `deleteFiles`. No `writeBuckets`, key management, public ACL or governance bypass capability in the application. No filename restriction unless it covers **all** `objects/`, `reports/`, `migration/` prefixes used for that bucket. The application does not use S3 ListBuckets, so it does not require `listAllBucketNames`. Version-specific erasure needs `deleteFiles`; Object Lock/legal hold/retention can prevent it and produces a partial result. Do not disable retention to hide a failure.

Official capability mapping: [Backblaze S3 application keys](https://www.backblaze.com/docs/cloud-storage-s3-compatible-app-keys), [access-control mapping](https://www.backblaze.com/docs/cloud-storage-map-iam-policies-and-s3-acls-to-backblaze-b2-access-controls).

Any partially supplied B2 configuration fails closed for new uploads/reports. No silent MongoDB binary fallback. With **all eight absent**, existing legacy MongoDB storage remains active for backward compatibility. Existing Mongo binaries remain readable during migration. Configure all eight together and restart.

```powershell
cd D:\Power-Punch-Club-MongoDB\Power-Punch-Club-MongoDB
npm.cmd install
npm.cmd run db:setup
node --env-file=.env scripts/b2-maintenance.mjs check
npm.cmd run dev
```

Open `http://localhost:3000/admin` → Integrations & system → Private Backblaze B2 storage → Check B2 connection. Health checks only reachability, **not** live upload/delete permissions, CORS, retention or visibility certification. Check that both buckets are private in Backblaze yourself; the app never changes visibility.

## Upload/delivery choice and CORS

Uploads remain server-mediated, bounded to 8 MB and validated by signature, image metadata, purpose and registration token. Browser direct PUT was deliberately avoided: no reusable writable bearer URL exists, so a browser cannot replay/overwrite a validated final file. Random immutable versioned B2 keys; metadata is created before upload; pending objects cannot be displayed. Stored length/type/checksum metadata is checked before linking. No automatic image resize/crop/conversion. Explicit Admin background removal remains opt-in and is unrelated to private proof originals.

This bounded-upload approach uses Render ingress/egress for upload; public/private **delivery** normally uses fresh five-minute version-bound signed GET redirects, with no-store/no-referrer. Stable `/api/media/...` URLs remain in content/PDF settings; signed URLs are never saved as permanent references. They are temporary bearer access: do not copy them into logs or public pages. A previously issued link can remain usable until expiry or physical version deletion; reopening the app URL obtains a fresh link.

Normal image display needs no CORS. Authorized QR, proof and report downloads stream through the application; bucket CORS is not required for the current flow. This consumes application bandwidth. The optional CORS commands below apply only to future direct browser fetches. No PUT/POST/DELETE browser CORS is required. Edit `docs/b2-cors.json` to the exact local port and real deployed/custom origins in use; remove unused origins. Do not add `*` or credentials permissions.

Using an independently configured, private AWS CLI profile with Backblaze CORS-management permission (`writeBuckets`, **not** the application's restricted keys), run only after reviewing the two bucket names and origins:

```powershell
aws --profile b2-cors-admin --endpoint-url https://s3.YOUR-REGION.backblazeb2.com s3api put-bucket-cors --bucket YOUR-PRIVATE-MEDIA-BUCKET --cors-configuration file://docs/b2-cors.json
aws --profile b2-cors-admin --endpoint-url https://s3.YOUR-REGION.backblazeb2.com s3api put-bucket-cors --bucket YOUR-PRIVATE-DOCUMENTS-BUCKET --cors-configuration file://docs/b2-cors.json
aws --profile b2-cors-admin --endpoint-url https://s3.YOUR-REGION.backblazeb2.com s3api get-bucket-cors --bucket YOUR-PRIVATE-MEDIA-BUCKET
aws --profile b2-cors-admin --endpoint-url https://s3.YOUR-REGION.backblazeb2.com s3api get-bucket-cors --bucket YOUR-PRIVATE-DOCUMENTS-BUCKET
```

These commands update CORS only, never ACL/visibility. They were **not executed**. Never pass keys as command-line arguments or commit CLI credential files.

Safe live test later: use a disposable local database, a separate test bucket pair or dedicated test account, and test-only restricted keys. Upload clearly synthetic portrait/landscape/square/tall files, compare downloaded SHA-256/dimensions, test QR download, Admin proof preview, Staff denial, refresh/lazy loading after >5 minutes and PDF logo. Do not use private production files or real payments/emails. Do not perform a deletion permission test against production.

## Explicit migration (not run on production)

Take a private verified database backup first. Migration reads the `files` collection, preserving its IDs and stable URLs. Existing GridFS reports are kept readable until expiry or explicit data deletion; new reports use B2 when enabled.

```powershell
node --env-file=.env scripts/b2-maintenance.mjs inventory
node --env-file=.env scripts/b2-maintenance.mjs copy
# Above is dry-run. Below write commands require exact database-name acknowledgement.
node --env-file=.env scripts/b2-maintenance.mjs copy --apply --confirm-database=YOUR_DATABASE
node --env-file=.env scripts/b2-maintenance.mjs verify
node --env-file=.env scripts/b2-maintenance.mjs rollback
node --env-file=.env scripts/b2-maintenance.mjs rollback --apply --confirm-database=YOUR_DATABASE
```

Copy uses immutable B2 versions, verifies source/destination SHA-256 + size, journals privately in ignored `.local-backups/b2-migration/journal.jsonl`, then CAS-switches metadata. Repeating copy resumes/reverifies without duplicating completed copies. Source bytes remain. Explicit rollback restores MongoDB resolution only while verified source bytes still exist; the B2 copy remains separately retained. Keep/protect the journal outside Git. Failed copy objects remain discoverable in `migrationCopy`; do not blanket-delete them.

Only after inspection and verified backup:

```powershell
node --env-file=.env scripts/b2-maintenance.mjs cleanup-source
node --env-file=.env scripts/b2-maintenance.mjs cleanup-source --apply --confirm-database=YOUR_DATABASE
```

This rechecks B2 and Mongo checksums, then removes source bytes. Rollback via Mongo is unavailable afterwards. MongoDB source bytes/allocated space do not disappear at copy time; removing binaries frees logical storage, while physical disk reclamation depends on MongoDB's storage/maintenance policy.

Abandoned upload cleanup is separate, explicit, bounded to 100 objects per invocation, and only selects expired/unclaimed uploads; surviving content/registration references protect files:

```powershell
node --env-file=.env scripts/b2-maintenance.mjs cleanup-abandoned
node --env-file=.env scripts/b2-maintenance.mjs cleanup-abandoned --apply --confirm-database=YOUR_DATABASE
```

No automatic startup migration/seeding/deletion. No TTL index deletes file metadata behind B2's back. Interrupted multipart uploads can require Backblaze's unfinished-large-file lifecycle management; use a bucket-admin reviewed age policy, never delete completed claimed originals.

## Owner-only deletion

Admin → **Settings → Advanced → Data Management** (both details collapsed). Only the actual `private-auth-owner` account is accepted server-side; ordinary Admin, Staff and a forged owner flag are denied.

1. Choose one registration, closed tournament registrations, all request kinds, or closed tournament plus its history. Registration number or UUID identifies a single record.
2. Preview exact registration/student/paid/file counts and included kinds. All-record deletion includes enquiries/trials too. Close included active tournaments first. Missing/deleted historical tournaments also appear in the Owner tournament selector; their report dropdown survives while rows exist.
3. Optionally download a **separate retained private JSON text backup**, using current password. This intentionally excludes uploads, Aadhaar and auth/tracking secrets; it is not a complete database restore archive. Protect/delete it yourself.
4. Enter current Owner password + exact displayed `DELETE N REGISTRATIONS` phrase. Confirmation expires after five minutes and is bound to Owner/version/scope/content hash. Concurrent record changes/additions require another preview. Same-origin and rate limits apply.
5. Confirmed Mongo deletion + tombstones + notification cancellation/redaction + report revocation + durable cleanup job occur in one Mongo transaction. Counters/accounts/branding/secrets stay unchanged. This requires Atlas/a local replica set.
6. Press **Resume cleanup**; refresh jobs until complete. Existing shared references are checked again before file erasure. All exact-key B2 versions and delete markers must be absent before erasure is reported complete. Retention/missing capabilities/network failures remain **partial**, safely retryable. Active export workers may need their lease to finish before cleanup can complete. Reports are conservatively revoked globally, rather than risking a retained export containing deleted data.

Safe per-action limits: 10,000 records and 12 MB of registration text; larger scopes are refused, not silently truncated. Use smaller closed-tournament scopes. Normal HTTP mutations and deletion serialize through a Mongo lease, favoring safety over throughput; **no measured 5,000-concurrent-registration claim**. No refund is initiated. No real deletion was requested for execution during implementation.

Archive remains ordinary tournament `status=closed`; its historical filters remain. Deleting a content item alone cannot make surviving registration history disappear from report selection. A full tournament/history purge removes its report dropdown only once all history is gone.

## Render later (not performed)

After local/live-test approval: configure the same eight server-only values in Render Environment; preserve MongoDB, email/payment/session settings. Buckets stay private. For future direct cross-origin fetches only, configure exact origins in CORS; use this repository's `npm ci`, `npm run build`, `npm run start` scripts. Run `db:setup` deliberately for indexes, `check:production` and B2 connection check. Deploy code only after separate push approval. Code deployment does not migrate Mongo binaries or database content. Run production migration as a separate reviewed/backup-protected operation later.


Current migration, load limits and streaming behavior: [verified results](B2-MIGRATION-LOAD-RESULTS.md). This newer report supersedes earlier test limitations.
