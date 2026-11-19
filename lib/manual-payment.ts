import { fileStorage } from './file-storage';
import { registrations, type Registration } from './mongodb';
import type { Db } from 'mongodb';

export type ManualProof = { transactionId: string; screenshot: string };

export async function validateManualProof(value: unknown, token: string): Promise<ManualProof> {
  const input = value as Partial<ManualProof> | null;
  const transactionId = typeof input?.transactionId === 'string' ? input.transactionId.trim() : '';
  const screenshot = typeof input?.screenshot === 'string' ? input.screenshot : '';
  if (!transactionId && !screenshot) throw new Error('Enter a UPI transaction ID or upload a payment screenshot.');
  if (transactionId && !/^[a-zA-Z0-9-]{6,100}$/.test(transactionId)) {
    throw new Error('Enter a valid transaction ID using 6–100 letters, numbers or hyphens.');
  }
  if (screenshot) {
    const match = /^\/api\/media\/private%2F([a-f0-9-]{36})$/i.exec(screenshot);
    const file = match && await fileStorage.head('private/' + match[1]);
    if (!file || file.customMetadata?.registrationToken !== token || !file.httpMetadata.contentType.startsWith('image/')) {
      throw new Error('Upload a valid payment screenshot for this registration.');
    }
  }
  return { transactionId, screenshot };
}

export function publicPaymentState(row: Registration) {
  return {
    paymentStatus: row.payment_status,
    paymentMethod: row.data.paymentMethod || (row.amount ? 'razorpay' : 'free'),
    reviewNote: row.payment_status==='manual_rejected' ? row.data.manualReviewNote || '' : '',
    receiptAvailable: row.payment_status === 'paid',
  };
}

export async function reviewManualPayment(db: Db, row: Registration, action: 'verify' | 'reject', actor: string, note: string) {
  const now = new Date().toISOString();
  return registrations(db).findOneAndUpdate(
    { _id: row.id, payment_status: 'manual_pending', 'data.paymentMethod': 'manual',
      'data.manualProofRevision': row.data.manualProofRevision },
    { $set: {
      payment_status: action === 'verify' ? 'paid' : 'manual_rejected',
      ...(action === 'verify' ? { payment_id: 'manual_' + row.id, 'data.paymentConfirmedAt': now } : {}),
      'data.manualReviewedAt': now, 'data.manualReviewedBy': actor, 'data.manualReviewNote': note,
    } },
    { returnDocument: 'after' },
  );
}
