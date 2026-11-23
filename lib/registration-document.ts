import sharp from 'sharp';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { receiptDetails } from './payment-receipt';
import { renderRegistrationPdf, type DocumentRow, type RegistrationPdfModel } from './pdf-layout';
import { fileStorage } from './file-storage';
import type { Registration } from './mongodb';

type DocumentContent=Pick<import('./club-types').ClubContent,'branding'|'tournaments'|'forms'|'training'>;

// Read current uploaded/local branding without fetching participant-controlled URLs.
async function logoBytes(url:string) {
  if (url?.startsWith('/api/media/public%2F')) {
    const key=decodeURIComponent(url.slice('/api/media/'.length));
    if(!/^public\/[a-f0-9-]{36}$/i.test(key))return null;
    const file=await fileStorage.get(key);
    return file?Buffer.from(await new Response(file.body).arrayBuffer()):null;
  }
  if(/^\/[a-z0-9_-]+\.(webp|png|jpe?g)$/i.test(url||''))return readFile(path.join(process.cwd(),'public',url));
  return readFile(path.join(process.cwd(),'public','power-punch-logo.webp'));
}
const present=(value:unknown)=>value!==null&&value!==undefined&&String(value).trim()!=='';
function ist(value:string|undefined){
  if(!value||!Number.isFinite(new Date(value).getTime()))return '';
  return new Intl.DateTimeFormat('en-IN',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Kolkata'}).format(new Date(value))+' IST';
}
export async function registrationDocument(row:Registration,content:DocumentContent,receipt:boolean,trackingCode?:string){
  const details=receiptDetails(row,content);
  const verified=row.payment_status==='paid'&&!!row.payment_id;
  if(receipt&&!verified)throw Error('Payment receipt requires verified payment.');
  const free=row.payment_status==='not_required'&&row.amount===0;
  const paymentStatus=verified?'Payment verified':free?'No payment required':row.payment_status==='manual_rejected'?'Payment proof needs correction':row.data.paymentMethod==='manual'||row.payment_status==='paid'?'Awaiting payment verification':'Awaiting payment';
  const add=(rows:DocumentRow[],label:string,value:unknown,emphasis=false)=>{if(present(value))rows.push({label,value:String(value),emphasis});};
  const registration:DocumentRow[]=[];
  add(registration,'Registration number',details.registrationNumber);
  add(registration,'Participant / contact',row.name);
  add(registration,'Tournament',details.title);
  add(registration,'Registered at',ist(row.created));
  add(registration,'Email',row.email);add(registration,'Phone',row.phone);
  if(row.status==='rejected')add(registration,'Participant correction reason',row.data.participantRejectionReason||'Please contact the club.');
  const payment:DocumentRow[]=[];
  add(payment,'Payment method',row.data.paymentMethod==='manual'?'Manual UPI QR':row.amount?'Razorpay':'Without payment');
  add(payment,verified?'Amount paid':'Registration amount','INR '+(row.amount/100).toFixed(2));
  add(payment,'Payment status',paymentStatus,true);
  if(verified)add(payment,'Payment receipt number',details.number);
  add(payment,'Transaction reference',row.data.paymentMethod==='manual'?row.data.manualProof?.transactionId:row.payment_id);
  if(verified)add(payment,'Confirmed at',ist(details.confirmedAt||undefined));
  if(row.payment_status==='manual_rejected')add(payment,'Correction reason',row.data.manualReviewNote||'Please contact the club.');
  const brand=content.branding,contacts:string[]=[],footer:string[]=[];
  if(brand.phone){contacts.push('Phone: '+brand.phone);footer.push(brand.phone);}
  else if(brand.whatsapp){contacts.push('WhatsApp: '+brand.whatsapp);footer.push(brand.whatsapp);}
  if(brand.email){contacts.push(brand.email);footer.push(brand.email);}
  if(brand.address)contacts.push(brand.address);
  if(!footer.length&&brand.address)footer.push(brand.address);
  const title=receipt?'Payment Receipt':free?'Registration Confirmation':'Registration Acknowledgement';
  const configuredHeading=receipt?details.heading:free?details.confirmationHeading:undefined;
  const model:RegistrationPdfModel={
    club:{name:details.club,contacts,footer},title,
    subtitle:configuredHeading&&configuredHeading.toLowerCase()!==title.toLowerCase()?configuredHeading:undefined,
    reference:receipt?details.number!:details.registrationNumber,generatedAt:ist(new Date().toISOString()),
    registration,fields:details.fields,payment,team:details.team,note:details.note,
    ...(trackingCode?{tracking:{number:details.registrationNumber,code:trackingCode,url:(process.env.PPC_PUBLIC_ORIGIN||'http://localhost:3000')+'/track-registration'}}:{}),
  };
  let logo:Uint8Array|undefined;
  try{const source=await logoBytes(brand.logo);if(source)logo=await sharp(source).rotate().resize({width:240,height:240,fit:'inside',withoutEnlargement:true}).png().toBuffer();}catch{/* The dynamic club name still identifies a document when its image is unavailable. */}
  return renderRegistrationPdf(model,logo);
}
