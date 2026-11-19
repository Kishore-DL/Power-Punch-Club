# Portal authentication and mobile inputs

The previous Staff page accepted either an Admin or Staff session. Both used the
`ppc_session` cookie. Existing sessions therefore explained the apparent Staff
login bypass; neither localStorage nor preview flags provided the API permission.

Admin and Staff now use independent, signed, role-bound, Secure HttpOnly cookies
(`ppc_admin_session_v2` and `ppc_staff_session_v2`). Each references a MongoDB
`auth_sessions` lease. The server checks the role, signature, account version,
lease and eight-hour expiry. Logout revokes the lease, including copied-cookie
replay. Password resets and account deletion invalidate previous account sessions.

Every full Staff document request, including a refresh or deep link, revokes and
clears the previous Staff session before rendering. A client-side portal entry
also revokes Staff access, covering entry through public-site navigation and
browser back/forward restoration. Login completes in place without a reload.
Filtering and pagination within the open portal retain authentication. Opening
another Staff tab also requires credentials and invalidates the browser's previous
Staff lease. Staff APIs require Staff credentials even when Admin is signed in.
Permitted registration reads and downloads remain read-only.

## Migration

- Run `npm.cmd run db:setup` during deployment to create the session TTL index.
- Existing shared `ppc_session` cookies are ignored and cleared on Staff entry or
  logout. Admin and Staff users must sign in again after this update.
- Account IDs/passwords, registration numbers and private tracking codes do not
  change. No new environment secrets are needed.
- Session expiry is checked synchronously; MongoDB TTL cleanup timing does not
  grant access to expired sessions.

## Inputs

All existing password inputs use the shared eye-icon control, including both
portal logins and owner/account password change, creation and reset fields. Each
starts masked, toggles independently and keeps its value, attributes, selection
and initiating focus. The button is accessible and never submits the form.

Registration, team contact, trial, enquiry and configured `tel` questions share
the +91 control. It requires ten ASCII digits, blocks invalid typing, handles
paste/autofill, normalizes valid +91 input and rejects excess input without
truncating it. The API validates the same rules and stores local ten-digit values.
Previously stored local or +91 numbers remain readable; payment checkout receives
the normalized +91 international format. No existing registration data is rewritten.

## Regression coverage

`npm.cmd run test:registration` builds the production application and uses a
guarded disposable local MongoDB replica set. The new `tests/portal-contact.mjs`
covers role isolation, legacy/expired/revoked sessions, logout replay, Staff
entry/refresh/deep links, password controls and desktop/320px layouts, mobile
typing/paste/autofill and invalid API submissions, including dynamic phone fields.
`tests/registration-contact.mjs` covers the shared normalizers and payment format.
Existing regression checks cover permitted Staff downloads, password-reset
invalidation, registration numbering, tracking, payments, PDFs and Admin-only email.

Screenshots are written under `outputs/registration-tests/`. Real email provider
credentials are disabled by the runner; no live payment or email is sent. Native
mobile password managers/autofill and real-device browsers still need device tests;
automated browser tests simulate autofill events in desktop Chromium.

Verified results: production build and TypeScript passed; focused ESLint passed;
the complete registration regression passed, including two production servers
and restart continuity. The final keyboard-focus refinement was rebuilt and the
focused portal/contact production-browser regression passed again. Desktop and
320px screenshots were inspected; +91 contrast and toggle alignment are correct.
The session TTL index was also created successfully in the configured database.

## Changed files

- `proxy.ts`: Staff document-entry revocation.
- `lib/password-auth.ts`, `lib/password-endpoints.ts`: independent role cookies,
  server leases, expiry, revocation and role-specific logout.
- `app/api/[...path]/route.ts`: Staff-only API checks, mobile validation and
  checkout contact normalization.
- `app/registration-portal.tsx`: explicit entry, in-place login and expiry handling.
- `app/portal-login.tsx`, `app/login-accounts.tsx`, `app/password-input.tsx`:
  reusable password controls and role-specific login/logout behavior.
- `lib/registration-contact.mjs`, `app/indian-mobile-input.tsx`, `app/club.tsx`:
  shared Indian mobile validation and registration/dynamic input controls.
- `app/form-controls.css`, `app/layout.tsx`: shared control styling and import.
  `app/globals.css` only has trailing whitespace normalization; new control
  styles live in `form-controls.css` after the theme styles.
- `scripts/setup-mongodb.mjs`, `scripts/check-production.mjs`: session TTL index
  creation and deployment verification.
- `tests/registration-contact.mjs`, `tests/portal-contact.mjs`,
  `scripts/run-registration-regression.mjs`: expanded tests and runner integration.
- `PORTAL-CONTACT-CHANGES.md`: implementation, migration and verification report.
