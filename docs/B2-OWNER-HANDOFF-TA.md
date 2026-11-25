> Updated migration/load verification: [25 November results](B2-MIGRATION-LOAD-RESULTS.md). This supersedes older statements below about real-B2 checks, migration and CORS. Git publication is recorded in the Git history; deployment and live-reference activation remain separate.

# B2 / Owner Data Management — தமிழ் வழிகாட்டி

இந்த வேலை local code மற்றும் disposable test data-வில் மட்டும் செய்யப்பட்டது. Git commit/push, Render deploy, production migration அல்லது உண்மையான registration deletion செய்யப்படவில்லை. உண்மையான `.env` மாற்றப்படவில்லை.

## என்ன மாறியது?

- இரண்டு B2 buckets-மும் PRIVATE ஆகவே இருக்கும். Website media ஒரு bucket; proof/student documents/reports மற்றொரு bucket.
- Website URL `/api/media/...` மாறாது. Server அனுமதி பார்த்து ஐந்து நிமிட signed GET URL தரும். Bucket public ஆகாது.
- புதிய upload-க்கு original bytes/MIME/proportions பாதுகாக்கப்படும். Admin upload-ல் இருந்த automatic resize/WebP conversion நீக்கப்பட்டது. Explicit background-removal option மட்டும் தொடர்கிறது.
- B2 configured என்றால் புதிய upload/report bytes MongoDB-ல் சேமிக்கப்படாது. B2 failure வந்தால் Mongo binary fallback இல்லை.
- பழைய Mongo files படிக்க முடியும். Migration copy → checksum verify → reference switch; source binary cleanup தனியான explicit command.
- Owner மட்டும் Settings → Advanced → Data Management திறக்கலாம். மற்ற Admin/Staff-க்கு server-லும் தடை.
- Delete முன் counts, தற்போதைய Owner password, confirmation phrase, ஐந்து நிமிட token தேவை. இடையில் data மாறினால் புதிய preview தேவை.
- Files பகிரப்பட்டிருந்தால் அவை இருக்கும். B2 versions/delete markers அனைத்தும் அழியாத வரை job complete என்று சொல்லாது. Partial job-ஐ Resume cleanup மூலம் தொடரலாம்.
- Pending notifications cancel/redact ஆகும். Stored exports revoke ஆகும். Counters/accounts/branding மாற்றப்படாது. Delete செய்தால் refund கிடையாது.
- Closed/archived tournament history reports/filter dropdown-ல் இருக்கும். Tournament மற்றும் முழு history நீங்கிய பிறகே அந்த historical entry மறையும்.

## Environment எங்கிருந்து எடுக்க வேண்டும்?

[Placeholder template](../.env.b2.example)-ல் உள்ள எட்டு பெயர்களையும் server environment-ல் நிரப்ப வேண்டும். Existing `.env`-ஐ replace செய்ய வேண்டாம்.

| பெயர் | Backblaze-ல் எடுக்க வேண்டியது |
| --- | --- |
| B2_ENDPOINT | Bucket details-ல் S3 Endpoint; முன்னால் `https://` |
| B2_REGION | Endpoint-ல் உள்ள region, உதாரணம் `us-west-004` |
| B2_MEDIA_BUCKET | PRIVATE media bucket-ன் சரியான பெயர் |
| B2_MEDIA_KEY_ID | அந்த bucket-க்கு மட்டும் restricted application key-ன் `keyID` |
| B2_MEDIA_APPLICATION_KEY | அதே key-ன் `applicationKey` |
| B2_DOCUMENTS_BUCKET | PRIVATE documents bucket-ன் பெயர் |
| B2_DOCUMENTS_KEY_ID | Documents bucket-க்கு தனி restricted key-ன் `keyID` |
| B2_DOCUMENTS_APPLICATION_KEY | Documents key-ன் `applicationKey` |

Master key பயன்படுத்த வேண்டாம். இரண்டு app keys-க்கும் `listBuckets`, `listFiles`, `readFiles`, `writeFiles`, `deleteFiles` தேவை. App keys-க்கு `writeBuckets`/key-management/governance-bypass தேவையில்லை. Object Lock/retention இருந்தால் deletion partial ஆகலாம்; அதை bypass செய்ய code இல்லை.

## CORS

[CORS JSON](b2-cors.json)-ல் actual localhost port மற்றும் production/custom domain மட்டும் வைக்கவும். `GET`, `HEAD` மட்டும்; `*` origin வேண்டாம். இரு buckets-க்கும் அமைக்க வேண்டும். Browser uploads server வழியாக நடப்பதால் browser PUT CORS தேவையில்லை. QR/proof/report fetch downloads-க்கு GET CORS தேவை.

CORS அமைப்பதற்கான exact AWS CLI commands [technical guide-ல்](B2-OWNER-GUIDE.md#uploaddelivery-choice-and-cors) உள்ளன. CORS management-க்கு தனி private admin CLI profile பயன்படுத்தவும்; application key permissions அதிகரிக்க வேண்டாம். அந்த commands visibility/ACL மாற்றாது; இந்த வேலையில் அவை இயக்கப்படவில்லை.

## Local start / connection check

Existing `.env`-ஐ மாற்றாமல் தனி `.env.b2-local-test` உருவாக்கவும். அதில் loopback `mongodb://127.0.0.1:...` replica set, `ppc_test_` அல்லது `ppc_preview_` என்ற தனி database name, test-only session/tracking configuration மற்றும் dedicated B2 test bucket keys மட்டும் வைக்கவும். Production/shared MongoDB பயன்படுத்த வேண்டாம்.

```powershell
cd D:\Power-Punch-Club-MongoDB\Power-Punch-Club-MongoDB
npm.cmd install
node --env-file=.env.b2-local-test scripts/setup-mongodb.mjs
node --env-file=.env.b2-local-test scripts/b2-maintenance.mjs check
node scripts/run-report-preview.mjs .env.b2-local-test --dev --port=3055
```

URL: `http://localhost:3055/admin`. இந்த existing preview runner loopback/disposable MongoDB மட்டும் அனுமதிக்கும்; email/payment providers-ஐ disable செய்கிறது. B2 GET CORS-ல் இந்த port-ஐ பயன்படுத்தவும். Integrations & system → Check B2 connection. எட்டு B2 values இல்லாமல் connection check வெற்றி பெறாது. இந்த check reachability மட்டும்; actual upload/delete/CORS/retention தனியாகச் சோதிக்க வேண்டும்.

Safe upload test: தனி disposable local MongoDB மற்றும் தனி test B2 buckets/keys பயன்படுத்தவும். Synthetic portrait/landscape/square/tall images மட்டும் upload செய்யவும். Download hash/dimensions ஒப்பிடவும்; QR download, Admin proof viewer, Staff denial, PDF logo மற்றும் ஐந்து நிமிடத்துக்குப் பிறகு மீண்டும் திறப்பதைச் சோதிக்கவும். Real emails/payments அனுப்ப வேண்டாம். Production records-ல் deletion test செய்ய வேண்டாம்.

## Migration — இப்போது production-ல் ஓடவிடப்படவில்லை

```powershell
npm.cmd run storage:inventory
node --env-file=.env scripts/b2-maintenance.mjs copy
```

இவை inventory/dry-run மட்டும். Copy-ஐ உண்மையாக இயக்குவதற்கு:

```powershell
node --env-file=.env scripts/b2-maintenance.mjs copy --apply --confirm-database=YOUR_DATABASE
node --env-file=.env scripts/b2-maintenance.mjs verify
```

Private backup எடுத்த பிறகே இயக்கவும். Completed copies மீண்டும் duplicate ஆகாது; checksum verify ஆகும். Source Mongo binary இன்னும் இருக்கும். Private rollback journal `.local-backups/b2-migration/journal.jsonl`-ல் இருக்கும்; Git-ல் சேராது. Windows-ல் அந்த folder-க்கு தேவையான filesystem access restriction வைத்துக்கொள்ளவும்.

Source bytes இருக்கும் வரையிலான rollback:

```powershell
node --env-file=.env scripts/b2-maintenance.mjs rollback --apply --confirm-database=YOUR_DATABASE
```

B2 copy தனியாக இருக்கும். Verified source binary-ஐ அகற்றுவது தனி செயல்:

```powershell
node --env-file=.env scripts/b2-maintenance.mjs cleanup-source
node --env-file=.env scripts/b2-maintenance.mjs cleanup-source --apply --confirm-database=YOUR_DATABASE
```

Cleanup பிறகு Mongo source வழி rollback கிடையாது. Copy செய்தவுடனே Mongo space குறையாது; binary cleanup மற்றும் Mongo storage policy-ஐப் பொறுத்தது. பழைய temporary GridFS reports தனியாக inventory-ல் காட்டப்படும்; அவை பழைய expiry/download workflow-ல் இருக்கும். புதிய reports B2-க்கு செல்கின்றன.

Expired/unclaimed upload cleanup-க்கும் தனி dry-run/explicit apply உண்டு:

```powershell
node --env-file=.env scripts/b2-maintenance.mjs cleanup-abandoned
node --env-file=.env scripts/b2-maintenance.mjs cleanup-abandoned --apply --confirm-database=YOUR_DATABASE
```

Surviving references உள்ள files அகற்றப்படாது. Startup-ல் automatic migration/deletion இல்லை.

## Owner deletion பயன்படுத்துவது

1. `/admin` → Settings → Advanced → Data Management.
2. ஒரு registration, closed tournament registrations, எல்லா request kinds, அல்லது closed tournament + history தேர்வு செய்யவும்.
3. Preview exact deletion scope அழுத்தவும். Registration/student/paid/file count மற்றும் kinds படிக்கவும்.
4. தேவைப்பட்டால் current password கொடுத்து தனி private JSON text backup download செய்யலாம். அது uploads/Aadhaar/auth/tracking secrets இல்லாத retained copy; complete database restore backup அல்ல.
5. Current Owner password மற்றும் காட்டப்படும் `DELETE N REGISTRATIONS` phrase கொடுக்கவும். Token ஐந்து நிமிடத்தில் expire ஆகும்.
6. Confirm செய்தபின் records Mongo transaction-ல் நீங்கும்; file cleanup job pending ஆகும். Resume cleanup → Refresh deletion jobs மூலம் status பார்க்கவும்.
7. Partial என்றால் காரணம் திருத்தி retry செய்யலாம். Complete வராத வரை எல்லா bytes-மும் அழிந்ததாகக் கருத வேண்டாம். பழைய signed bearer link அதன் expiry வரை இயங்கலாம்.

ஒரு action-க்கு 10,000 records / 12 MB registration text வரை பாதுகாப்பு வரம்பு. பெரிய scope-ஐ சிறிய tournament/registration scopes ஆகப் பிரிக்க வேண்டும். Active export worker முடியும் வரை cleanup காத்திருக்கலாம். இந்த concurrency lock safety-க்காக உள்ளது; 5,000 concurrent registrations capacity claim இல்லை.

## Render — பிறகு

Local மற்றும் dedicated B2 checks முடிந்ததும் மட்டுமே அடுத்த கட்டம். Render Environment-ல் இதே எட்டு server-only values சேர்க்கவும்; Mongo/email/payment/session values-ஐ preserve செய்யவும். Buckets PRIVATE ஆகவே இருக்க வேண்டும். Actual domain-க்கு CORS அமைக்கவும். Repository scripts: `npm ci`, `npm run build`, `npm run start`. Index setup மற்றும் `check:production` தனியாக இயக்கவும். Code deployment Mongo content/files-ஐ தானாக migrate செய்யாது. இந்த வேலையில் push/deploy செய்யப்படவில்லை.

## Test results / files

இறுதி command results மற்றும் முழு changed-file பட்டியல் [test report-ல்](B2-TEST-RESULTS.md) பதிவு செய்யப்படும். Real B2 credentials இங்கு இல்லாததால் live bucket access, real CORS, real retention மற்றும் remote expiry checks சோதிக்கப்படவில்லை. Browser mock tests signed redirect-ஐ synthetic bytes-க்கு test bridge வழியாக resolve செய்கின்றன; அவை live CORS test அல்ல.
