import { defaultClubLogo } from '../lib/defaults';
import { useEffect, useRef } from 'react';
import { downloadRegistration } from './registration-actions';
import { useState } from 'react';

const money = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' });

export default function PaymentReceipt({ receipt, logo, onClose, confirmation = false }: { receipt: any; logo?: string; onClose: () => void; confirmation?: boolean }) {
  const panel = useRef<HTMLElement>(null);
  const [message,setMessage]=useState('');
  useEffect(() => {
    panel.current?.closest('.modal')?.scrollTo({ top: 0 });
    panel.current?.closest('.registration-modal-body')?.scrollTo({ top: 0 });
    panel.current?.focus({ preventScroll: true });
  }, []);
  const title = receipt.heading || (confirmation ? "Registration confirmation" : "Payment receipt");
  return (
    <section className="payment-receipt" aria-label={title} ref={panel} tabIndex={-1}>
      <header className="receipt-brand">
        <img src={logo || defaultClubLogo} alt="" width={52} height={52} />
        <div><strong>{receipt.club}</strong><h2>{title}</h2></div>
      </header>
      <dl>
        <dt>{confirmation ? "Registration serial number" : "Receipt number"}</dt><dd>{receipt.number}</dd>
        {!confirmation && <><dt>Payment method</dt><dd>{receipt.paymentMethod}</dd><dt>Payment reference</dt><dd>{receipt.paymentId}</dd><dt>Registration number</dt><dd>{receipt.registrationNumber || receipt.reference}</dd></>}
        {receipt.confirmedAt && <>
          <dt>Payment confirmed</dt>
          <dd>{new Intl.DateTimeFormat('en-IN', {
            dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata',
          }).format(new Date(receipt.confirmedAt))} IST</dd>
        </>}
        <dt>{confirmation ? "Tournament" : "Payment for"}</dt><dd>{receipt.title}</dd>
        <dt>{confirmation ? "Registered by" : "Paid by"}</dt><dd>{receipt.name}</dd>
        {confirmation ? <><dt>Payment</dt><dd>No payment required</dd></> : <><dt>Amount paid</dt><dd><strong>{money.format(receipt.amount / 100)}</strong></dd></>}
        {receipt.fields.map((field: any, index: number) => (
          <div className="receipt-field" key={index}><dt>{field.label}</dt><dd>{field.value}</dd></div>
        ))}
      </dl>
      {receipt.team.length > 0 && <>
        <h3>Team participants</h3>
        <ol>{receipt.team.map((member: any, index: number) => (
          <li key={index}>{member.name} · Age {member.age} · {member.belt}</li>
        ))}</ol>
      </>}
      {receipt.note && <p style={{ whiteSpace: "pre-wrap" }}>{receipt.note}</p>}
      <div className="receipt-actions">
        <button type="button" className="btn red" onClick={async()=>{try{await downloadRegistration(receipt.documentAuth,!confirmation);setMessage('PDF downloaded.');}catch(e:any){setMessage(e.message);}}}>Download PDF</button>
        <button type="button" className="btn red" onClick={() => window.print()}>Print / Save as PDF</button>
        <button type="button" className="btn pale" onClick={onClose}>Close</button>
      </div>
      <p role="status">{message}</p>
    </section>
  );
}
