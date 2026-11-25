# B2 migration and local load verification — 25 November 2026

## Real migration

Both configured buckets were checked private. A recoverable backup contains 41 BSON documents, 25 original files (10,831,392 bytes), and 32 associations. Backup and source binaries remain intact in the private, ignored `.local-backups` directory.

All 25 files were copied to immutable B2 versions and checksum/size verified: 15 media and 10 documents. Copies are staged; **zero live file references were switched**. Render returned HTTP 503 during the earlier compatibility check. Deploy compatible code and verify it before separately activating existing copies. Do not run source cleanup yet.

A real signed GET succeeded, expired after its explicitly configured 30-second lifetime (HTTP 401), and a fresh URL returned matching bytes. Both buckets had no CORS configuration. Public images use signed redirects; authorized QR/proof/report downloads now stream through the application and do not require browser bucket CORS. This uses application bandwidth. The PDF logo tested was the existing bundled logo, not a B2 object.

## Isolated load results

Windows host: 16 GB RAM, 16 logical CPUs. Disposable loopback MongoDB replica set, WiredTiger cache 256 MiB; application heap limit 384 MiB, Mongo pool 30. Email/payment providers were disabled. Bulk screenshots used a local filesystem-backed S3 SDK mock, **not real B2**. An earlier local HTTP S3 gateway was also exercised before infrastructure failure.

5,000 saved synthetic registrations and 5,000 correctly claimed originals were reconciled. All originals were read back and SHA-256 checked, totalling 3,315,622,171 bytes. No duplicate registration numbers, cross-student associations, or capacity overflow were found. Ten unclaimed retry uploads remain retained. Two interrupted notification enqueues were recovered by idempotent replay; final outbox count is 5,000 without provider delivery.

Screenshot fixtures: 900×1600 (~528 KB), 900×3000 (~1,135 KB), 1200×900 (~325 KB), plus unique synthetic identifiers. Payment proofs remain awaiting verification; submissions were not automatically paid.

The final measured pass lasted 606 seconds, creating 3,727 registrations and recovering/verifying 1,273 earlier saved records. It did not freshly create all 5,000 under the final binary. Dataset and resumable checkpoints remain under private `.local-backups/b2-load/2026-11-25T06-29-17-694Z`.

| Active flows | Fresh attempts | Saved | Duration | Upload p95 | Submit p95 |
| --- | ---: | ---: | ---: | ---: | ---: |
| 10 | 150 | 150 | 17.2 s | 1,267 ms | 712 ms |
| 25 | 200 | 200 | 27.5 s | 3,455 ms | 3,498 ms |
| 50 | 250 | 250 | 37.1 s | 5,153 ms | 5,724 ms |
| 100 | 300 | 263 | 59.5 s | 10,623 ms | 9,898 ms |

Escalation stopped at 100: 37 flows exhausted retries, with HTTP 503 and network timeouts. Highest fully successful short stage was 50, not sustained 50 for ten minutes. Remaining 2,864 flows ran successfully at concurrency 5 for about 352 seconds. Maximum in-flight HTTP requests was 101 including background activity; critical writes remain serialized by the durable lease. **5,000 concurrent users were not tested.**

Mixed content/status reads: 1,533 successful responses, p95 22 ms. Tracking: 76 successful, p95 5,283 ms. Admin filtering: 76 successful, p95 3,424 ms. Duplicate replays: 148 successful. Intentional rate probe: 300 successful and 5 expected HTTP 429 responses. One interrupted upload and one Admin review were exercised. Public HTML reads were not separately latency-instrumented.

Application RSS peaked at about 199.5 MiB, heap at 86.3 MiB; sampled CPU peaked at 1.45 cores. Mongo connections ranged 12–42. Late heap/RSS did not show a continuing growth trend, but this is not proof of no leak. Database RSS was not separately measured.

## Failures and fixes

Native MongoDB crashed from out-of-memory during early testing and again during later focused checks; it was recovered with all 5,000 records/claims intact. Initial host virtual-memory headroom was only 0.3–0.4 GB. A Docker engine outage also blocked the container alternative; its exact cause was not established. The final 606-second application run itself had no crash/restart.

Fixed quadratic pending-email scans during enqueue, durable mutation-lock fairness/backpressure, and idempotent replay recovery of missing notification events. Authorization, payment verification, and rate safeguards remain enabled. The serialized mutation lease is still a bottleneck at high concurrency.

## Checks and preview

Production build, TypeScript build checks, lint, storage/Owner regression suite, B2 copy-resume tests, mutation fairness, bounded notification enqueue, and Brevo mocked tests passed. Actual browser preview checked public routes at 390/1440 px, original QR/proof hashes, unauthorized/Staff proof denial, and genuine PDF/XLSX exports. Earlier overall regressions were reused; the complete 5,000 workload was not repeated after the targeted idempotent-notification fix.

Normal preview: `http://localhost:3055` (`/admin` for Owner). It uses a separate preview database, original public content and 11 anonymized registration records, not the load dataset. Real B2 originals are read-only; new preview uploads/reports use local mock storage. Private local login details are in `.local-backups/b2-preview/preview.env`.

Restart from the project directory:

```powershell
node .local-backups/start-b2-test-mongo.mjs
node scripts/run-b2-review-preview.mjs .local-backups/b2-preview/preview.env
```

## Deployment boundary

Local mock storage does not establish Render Starter/Atlas Free/real B2 capacity, latency, quotas or bandwidth. No real emails/payments, source cleanup, or production load testing was performed. Code deployment does not activate staged migration references or copy database content.

A separately approved staging follow-up could use 200 synthetic registrations at 10 then 25 flows: approximately 133 MB screenshots, 200 PUT, 200 HEAD and 200 verification GET operations, excluding retries/public reads. Do not start automatically. Preserve the backup and Mongo originals until live compatibility and rollback are verified.
