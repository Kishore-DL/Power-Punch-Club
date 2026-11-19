# Power Punch Club — MongoDB deployment

Use Node.js 22.13 or later. Extract the ZIP and open the project folder in VS Code.

## Local setup

1. Create a MongoDB Atlas cluster, database user and network access rule for your machine. Transactions require Atlas or a MongoDB replica set.
2. Copy `mongodb.env.example` to `.env`. Fill in your MongoDB URI, database name, random session secret and initial Admin credentials. Never commit `.env` or paste real secrets into chat.
3. Run these commands in the VS Code terminal.

```powershell
npm ci
npm run db:setup
npm run dev
```

Open the localhost URL printed by Next.js. Visit `/admin`, sign in with the bootstrap Admin ID/password, and create any Staff accounts under **Login accounts**. Staff sign in separately at `/staff`. Tournament participants register directly without a student login.

Mock content is included for client presentations. `PPC_CLIENT_PREVIEW=true` shows sample content and disables real registrations and payments. For real registrations, set `PPC_CLIENT_PREVIEW=false`, restart the server, and add your real tournaments in Admin. Sample images and content remain in the ZIP.

## UPI QR setup

Follow `UPI-PAYMENTS.md`. Each tournament can enable UPI QR, Razorpay and without-payment registration. Manual QR payments need no payment provider API credentials. Admin must verify funds in the club bank statement.

## Production hosting

Deploy as a Node.js Next.js service on hosting that supports it.

- Install/build command `npm ci && npm run build`.
- Start command `npm start`. The hosting provider may supply `PORT`.
- Set the MongoDB Atlas network access rules for the hosting service.
- Configure HTTPS and set `PPC_PUBLIC_ORIGIN` to the exact public origin, for example `https://your-owned-domain.in`, with no trailing slash.
- Set `PPC_TRUSTED_IP_HEADER` to the client-IP header your reverse proxy securely overwrites or appends. The application uses the final address in that header. Check your hosting provider's proxy behavior. Without this setting, visitors share a single rate bucket and busy registrations may be throttled together.
- `PPC_WRITE_RATE_LIMIT` sets registration submissions per client-IP per ten minutes (default 120). Uploads allow at least 200 per ten minutes. Auth allows 30 attempts. Adjust for shared school networks based on staging measurements.
- Set `PPC_CLIENT_PREVIEW=false`. Use a random session secret and strong unique Admin password.
- Run `npm run db:setup` against the deployment database. Sign in to `/admin` once to create the owner, verify access, and remove `PPC_BOOTSTRAP_ADMIN_PASSWORD` from the hosting environment.
- Run `npm run check:production` with the deployment environment. Fix every reported error. A passing configuration check does not test a real bank transfer or provider delivery.
- Create real club content and test the registration flow from your phone using the final domain.

For Razorpay, add `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`. Configure your provider's webhook URL as `/api/webhook`. Run staging payment/capture/webhook/receipt tests before enabling Razorpay for the public. For Brevo transactional email, configure server-only `BREVO_API_KEY`, `EMAIL_FROM_ADDRESS`, `EMAIL_FROM_NAME` and `ADMIN_NOTIFICATION_EMAIL`. All notifications go only to that administrator. Participant updates remain available through website tracking and PDF downloads. Verify the Brevo account/sender and test outbox retries with a controlled recipient. See `BREVO-EMAIL.md`.

Enable database backups, test restore, set hosting error monitoring and confirm your hosting/Atlas capacity before launching high-traffic registration. This ZIP updates the MongoDB code. It does not copy existing Sites/D1 data or create an Atlas account, hosting service or domain.

## Regression and load tests

Use a separate, disposable database with a name beginning `ppc_test_`. Tests create fictional records and replace tournament/gallery content, so never point them at real club data. Start a local app against the same test database with `PPC_CLIENT_PREVIEW=false`, test bootstrap credentials, and `RAZORPAY_WEBHOOK_SECRET` set to a fictional test-only value. Leave Razorpay API keys and `BREVO_API_KEY` unset; the full regression runner also forces email sending off except for explicitly mocked provider tests.

```powershell
npm run db:setup
npm run build
npm start
```

In another terminal with the same test environment, run the smoke test first, then the manual-payment test. Set `PPC_TEST_URL` to the local app origin if it uses a port other than 3000.

```powershell
npm run test:mongodb
npm run test:manual
```

For load tests, also set `PPC_TRUSTED_IP_HEADER=x-ppc-test-ip` in both local terminals. This header is a localhost test fixture. Replace it with the actual trusted ingress header for deployment.

```powershell
npm run test:load
```

The load test uses 1,000 content reads with concurrency 100 and 1,000 registration writes with concurrency 25. It reports statuses and p95 response time. Local results must be repeated against the intended hosting infrastructure with representative traffic.
