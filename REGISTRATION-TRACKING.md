# Registration numbers, tracking and PDFs

New registrations use one MongoDB atomic sequence across all tournaments and app instances. The default format is `PPC-000001`. Admin can change the global prefix in Branding and override it per tournament. Changing a prefix or optional legacy suffix never resets the counter. Existing registration numbers, UUIDs, payment references and old long-token recovery remain unchanged. The migration seeds a missing counter from historical numeric references; it never resets an existing counter. Failed submissions may leave gaps.

Every new registration also gets a private six-character letter-and-digit code. It is a reusable credential, not an OTP. MongoDB stores a keyed digest for verification and AES-256-GCM ciphertext for authorized recovery. Codes and verification material are excluded from general Admin/Staff lists, public content and logs. Administrative document downloads omit the private code.

## Configure and migrate

Keep the real connection and credentials in `.env`, never `mongodb.env.example`. Preview must be off. The local `.env` was configured with new random tracking keys; retain and back them up securely.

```dotenv
PPC_CLIENT_PREVIEW=false
PPC_SESSION_SECRET=<stable random secret, at least 32 characters>
PPC_TRACKING_DIGEST_KEY=<64 hexadecimal characters from 32 random bytes>
PPC_TRACKING_ACTIVE_KEY=v1
PPC_TRACKING_KEYS='{"v1":"<independent 64 hexadecimal characters>"}'
PPC_PUBLIC_ORIGIN=http://localhost:3000
```

Use the actual HTTPS origin when deployed. Set `PPC_TRUSTED_IP_HEADER` only to the client-IP header that your hosting ingress securely overwrites/appends. For local direct use, leave it unset: untrusted request headers are ignored and visitors share an IP bucket. Never use the test-only `x-ppc-test-ip` header in a public deployment. `MONGODB_DNS_SERVERS` remains an optional override for Atlas SRV resolution.

Generate each key independently:

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Then run:

```powershell
npm.cmd install
npm.cmd run db:setup
npm.cmd run build
npm.cmd start
```

For local development use `npm.cmd run dev` instead of build/start. Restart after changing environment settings.

`db:setup` scans historical references for duplicates (including case/outer-whitespace conflicts) before creating partial unique indexes on `data.registrationNumber` and `tracking.digest`. Conflicts report affected record IDs and stop setup; no historical reference is silently rewritten. Resolve conflicts manually with the club before retrying. New registrations and legacy code assignment require these indexes.

Back up the encryption key ring and digest key together with the database. To rotate encryption keys, add `v2` to `PPC_TRACKING_KEYS` and set `PPC_TRACKING_ACTIVE_KEY=v2` on every instance; retain `v1` for existing records. Do not replace the digest key or remove old encryption keys: doing so breaks existing credential verification or acknowledgement recovery. Session-secret rotation expires existing sessions.

## Participant and administrator flows

- Success displays the registration number and private tracking code, separate copy controls, a real PDF download, tracking link and start-another control. Completed registrations remain saved on that browser; starting again creates a fresh submission ID and long token.
- `/track-registration` requires both values, ignoring letter case and surrounding whitespace. Successful lookup sets an HttpOnly, Secure, SameSite=Lax cookie valid for 30 minutes and scoped to one registration. A second device can recover using the downloaded acknowledgement alone.
- MongoDB-backed 10-minute limits apply per normalized registration number (10), trusted client IP (30), and service (1,000). Limits include successful attempts, work across app instances and expire without permanent lockout. HTTP 429 includes a retry interval. Unknown registrations and incorrect codes use the same failure message.
- Legacy long-token recovery securely assigns one code on demand; it never replaces an existing reference. Legacy records without a stored number retain the former derived `PPC-REG-<id>` reference.
- Tracking shows safe participant details, team members, payment state/reference, participant-facing rejection reasons, acknowledgement and verified receipt downloads. Manual UPI proof correction uses the existing proof/review workflow. General private files, Aadhaar, screenshot images and private Admin notes are never included in these PDFs.
- Free entries receive registration confirmations. Pending UPI submissions receive acknowledgements marked “Awaiting payment verification.” Rejected proof includes its correction reason. Verified UPI and captured Razorpay payments qualify for separately numbered payment receipts. Pending/unverified payments cannot download receipts.
- Staff stays read-only and cannot verify payments or download a participant's private tracking credential. Admin has a distinct participant-facing correction-reason field in request review, separate from private notes.

## Reproduce regression tests

The full suite resets **only the local database named `ppc_test_…` in `.env.registration-test`**. Never put real records or live provider keys in that database. The runner also starts/stops production instances on ports 3010 and 3011 and builds into `.next-registration-tests`, preserving the normal `.next` build.

Create a disposable replica set (Docker Desktop must be running):

```powershell
docker run -d --name ppc-registration-tests -p 127.0.0.1:27028:27017 mongo:8 --replSet ppcTest --bind_ip_all
'rs.initiate({_id:"ppcTest",members:[{_id:0,host:"localhost:27017"}]})' | docker exec -i ppc-registration-tests mongosh --quiet
npm.cmd run test:registration:env
npx.cmd playwright install chromium
npm.cmd run test:registration
```

If `.env.registration-test` already exists, review/reuse it instead of regenerating keys. The suite needs local MongoDB transaction support, Chromium and available test ports. To stop the test database after testing, use `docker stop ppc-registration-tests` (the implementation session used container name `ppc-registration-tests-20261119`).

The implementation session's test container is stopped after verification. To reuse that container, run `docker start ppc-registration-tests-20261119` before `npm.cmd run test:registration`.

The suite includes multi-client and multi-server races, atomic initialization, number/code collisions, >999999 rollover, prefixes/suffixes, process restart, idempotency, legacy CAS recovery, key rotation/tamper detection, historical conflicts, per-IP/number/global cooldowns, scoped sessions and expiry, Admin/Staff isolation, the existing UPI rejection/resubmission/verification and Razorpay webhook regressions, real multipage PDF downloads, hidden/Aadhaar exclusion, clipboard fallback, multiple participants, and fresh-browser recovery using values extracted from a downloaded PDF. Screenshots and PDF fixtures are written under `outputs/registration-tests/`.

Live bank transfers, Razorpay checkout/capture delivery, email delivery, public HTTPS/proxy behavior and production-host load still require tests on the actual deployment. Test fixtures never contact a real payment provider or send email.
