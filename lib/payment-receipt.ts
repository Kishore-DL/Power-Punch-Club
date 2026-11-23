import type {Registration} from './mongodb';
import type {ClubContent,RegistrationData} from './club-types';
import { registrationSerial } from './tournament-registration';

export function receiptNumber(paymentId: string) {
  return 'PPC-' + paymentId.replace(/^pay_/, '');
}

export function receiptDetails(row: Omit<Registration,'data'>&{data:RegistrationData|string}, content: Pick<ClubContent,'branding'|'tournaments'|'forms'|'training'>&{fees?:{id:string;title:string}[]}) {
  const data:RegistrationData = typeof row.data==='string'?JSON.parse(row.data):row.data||{};
  const event = content.tournaments.find((item) => item.id === row.target);
  const form = content.forms.find((item) => item.id === event?.formId);
  const labels = data.receiptFields || Object.fromEntries(
    (form?.fields || []).map((field) => [field.id, { label: field.label, type: field.type, showOnReceipt: field.showOnReceipt }]),
  );
  const definitionKeys=Object.keys(labels);
  const storedOrder: string[]=Array.isArray(data.receiptFieldOrder)?data.receiptFieldOrder.filter((key:unknown):key is string=>typeof key==='string'&&Object.hasOwn(labels,key)):[];
  const keys=storedOrder.length?[...new Set([...storedOrder,...definitionKeys])]:definitionKeys.length||data.receiptFields?definitionKeys:Object.keys(data.answers||{});
  const fields = keys.flatMap(key => {
    const value=data.answers?.[key];
    if (/aadha?ar|aadhar/i.test(key+' '+(labels[key]?.label||''))) return [];
    if (/^(?:token|registration[_-]?token|tracking[_-]?code|admin[_-]?notes|private[_-]?notes|password|secret)$/i.test(key)) return [];
    if (data.receiptFields && !Object.hasOwn(labels, key)) return [];
    if (labels[key]?.showOnReceipt === false || labels[key]?.type === 'masked_aadhaar' || (labels[key]?.type === 'photo'&&labels[key]?.showOnReceipt!==true)) return [];
    if (value === '' || value == null || !['string', 'number', 'boolean'].includes(typeof value)) return [];
    if(typeof value==='string'&&!value.trim())return [];
    const isUpload = ['file','photo'].includes(labels[key]?.type) || (typeof value === 'string' && /(?:^\s*\/api\/|\/api\/(?:media|staff\/download))/i.test(value));
    return [{ label: labels[key]?.label || key, value: isUpload ? 'Document submitted' : String(value) }];
  });
  return {
    registrationNumber: data.registrationNumber || registrationSerial(row.id),
    heading: data.receiptHeading,
    confirmationHeading: data.confirmationHeading,
    note: data.receiptNote,
    number: row.payment_id ? receiptNumber(row.payment_id) : null,
    paymentId: data.paymentMethod === 'manual' ? data.manualProof?.transactionId || row.payment_id : row.payment_id,
    paymentMethod: data.paymentMethod === 'manual' ? 'UPI QR · verified by club' : 'Razorpay',
    reference: row.id,
    club: data.receiptClub || content.branding.name,
    title: data.receiptTitle || event?.title ||
      content.training.find((item) => item.id === row.target)?.title ||
      content.fees?.find(item=>item.id===row.target)?.title || 'Club payment',
    name: row.name,
    amount: row.amount,
    confirmedAt: data.paymentConfirmedAt || null,
    fields,
    team: Array.isArray(data.team) && row.kind === 'team'
      ? data.team.map(({ name, age, belt }) => ({ name, age, belt }))
      : [],
  };
}
