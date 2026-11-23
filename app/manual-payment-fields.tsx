type Props = {
  event: any;
  proof: { transactionId: string; screenshot: string };
  onChange: (value: { transactionId: string; screenshot: string }) => void;
  onUpload: (file: File) => void;
  uploading: boolean;
};

export default function ManualPaymentFields({ event, proof, onChange, onUpload, uploading }: Props) {
  return (
    <fieldset className="manual-payment-fields">
      <legend>Pay by UPI QR</legend>
      <p>Scan this QR using your UPI app. On the same phone, save the QR image and select it from your UPI app gallery.</p>
      {event.manualQrImage && <>
        <img className="manual-payment-qr" src={event.manualQrImage} alt="Club UPI payment QR code" />
        <a className="text-link" href={event.manualQrImage} target="_blank" rel="noreferrer">Open QR image</a>
      </>}
      {event.manualPayee && <p><strong>Payee</strong> {event.manualPayee}</p>}
      {event.manualUpiId && <p className="manual-upi-id"><strong>UPI ID</strong> {event.manualUpiId}</p>}
      {event.manualInstructions && event.manualInstructions.trim()!=='Enter a transaction reference or upload a payment screenshot for review.' && <p style={{ whiteSpace: 'pre-wrap' }}>{event.manualInstructions}</p>}
      <p>Check the payee and amount in your UPI app. After payment, enter the transaction ID or upload a screenshot. The club will verify your payment.</p>
      <label>UPI transaction ID / UTR
        <input autoComplete="off" maxLength={100} value={proof.transactionId}
          placeholder="Transaction reference from your UPI app"
          onChange={e => onChange({ ...proof, transactionId: e.target.value })} />
      </label>
      <label>Payment screenshot
        <input type="file" accept="image/png,image/jpeg,image/webp" disabled={uploading}
          onChange={e => { const file = e.target.files?.[0]; if (file) onUpload(file); }} />
        <small>{uploading ? 'Uploading screenshot…' : proof.screenshot ? 'Screenshot attached.' : 'PNG, JPG or WebP · max 8 MB'}</small>
      </label>
      {proof.screenshot && <button className="text-link" type="button" onClick={() => onChange({ ...proof, screenshot: '' })}>Remove screenshot</button>}
      <small>Provide at least one — transaction ID or screenshot. You may provide both.</small>
    </fieldset>
  );
}
