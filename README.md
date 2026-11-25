# Power Punch Club — MongoDB edition

Next.js on Node.js 22.13 or later using the official MongoDB driver. MongoDB stores registration records, payment states, settings, accounts and file metadata. Optional private Backblaze B2 stores new original uploads (up to 8 MB) and generated reports; legacy MongoDB files remain readable. See [B2 and Owner Data Management](docs/B2-OWNER-GUIDE.md) before configuring storage or permanent deletion.

Tournament payment options include Razorpay, without payment, and manual UPI QR with transaction ID or private screenshot submission and Admin verification. Options are controlled per tournament. Participants register directly. Admin and Staff use separate password-protected portals.

Start with `VS-CODE-START.md`, then `UPI-PAYMENTS.md`. Read `TEST-REPORT.md` for actual retest coverage, local load results and deployment checks still pending. Mock content is included for presentations. This MongoDB edition runs as a Node service separately from the existing Sites deployment.

See [REGISTRATION-TRACKING.md](REGISTRATION-TRACKING.md) for sequential numbers, private recovery codes, PDF documents, migration, key management and the disposable regression suite.

See [BREVO-EMAIL.md](BREVO-EMAIL.md) for server-only Brevo settings, Admin-only notifications and safe outbox retry behavior.
