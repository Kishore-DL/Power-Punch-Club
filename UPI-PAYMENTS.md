# UPI QR payments

1. Sign in at `/admin` and open **Tournaments**. Add or edit a tournament.
2. Set its fee in INR. For an academy team this amount is multiplied by participant count.
3. Choose **UPI QR payment only** to accept manual UPI payments. To offer other options too, choose **Paid and without payment**, **Paid registration only** or **Without payment only**, then enable **Also enable UPI QR payments**.
4. Upload the club QR using **UPI QR image**. Enter the payee name, UPI ID and any payment instructions. Save changes. Test the uploaded QR with a UPI app to confirm it points to the club account and allows the correct amount.
5. A participant selects **UPI QR payment**, completes the form, pays using their own UPI app, and enters a transaction ID / UTR or uploads a screenshot. Either one is required. Both are allowed.
6. The registration is saved as **manual_pending**. A registration reference is displayed. A payment receipt is available after verification.
7. In **Registrations & enquiries**, filter **manual_pending**, open **Review**, and check the transaction reference or download its private screenshot. Confirm the actual credit, amount and payee in the club bank/UPI statement. Select **Verify payment**. This issues a unique payment receipt number linked to the registration.
8. To request a correction, enter a reason and select **Reject proof**. The participant can reopen the same tournament and payment option on the same browser, select **Refresh payment status** and resubmit. This keeps the original registration number. Browser storage must be available for this recovery. If the participant clears browser storage or changes device, contact the club and use Admin to locate the registration.

QR uploads are public. Payment screenshots are private and require Admin authentication to download. Staff cannot review, edit or download payment proof. Student documents retain their separate field-level download permissions.

Manual verification records the reviewing administrator, timestamp, note and proof revision. Updated proof requires a fresh review. A supplied transaction ID is unique across manual registrations. Screenshot-only evidence still requires a bank statement check by the administrator.

**Without payment** produces a registration confirmation. **Razorpay** produces a receipt after a captured payment is verified. **UPI QR** produces a receipt after Admin verification. These options can be enabled individually or together per tournament. Manual QR payments work without Razorpay credentials.

Email delivery uses Brevo when configured and targets only `ADMIN_NOTIFICATION_EMAIL`. Participants use website tracking and document downloads for status updates. Pending Admin messages remain in the delivery queue when email is unconfigured or delivery fails; historical participant messages are skipped with a reason. Brevo acceptance does not confirm inbox delivery. See `BREVO-EMAIL.md`. The application does not automatically reconcile UPI transfers with a bank.
