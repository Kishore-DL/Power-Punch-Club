import { after } from 'next/server';
import { queueAdminNotification, registrationNotification, deliverAdminNotification } from './admin-notifications.mjs';
import type { Registration } from './mongodb';
import { defaults, contentKeys } from './defaults';
import { demoContent } from './demo-content';
import { plainStarterCopy } from './plain-copy';
import { contentRecords, database, duplicateKey } from './mongodb';
export { database } from './mongodb';

export const runtime=()=>process.env;
export const clientPreview=()=>runtime().PPC_CLIENT_PREVIEW!=='false';

export async function getContent() {
  const content=structuredClone(defaults);
  const preview=clientPreview();
  if(preview){
    for(const [key,value] of Object.entries(structuredClone(demoContent))){
      if(key==='branding')Object.assign(content.branding,value);
      else content[key]=value;
    }
  }
  const rows=preview&&!runtime().MONGODB_URI
    ? []
    : await contentRecords(database()).find({_id:{$in:contentKeys}}).toArray();
  for(const {_id:key,value} of rows){
    if(key==='branding'||key==='pages')Object.assign(content[key],value);
    else if(Array.isArray(value)){
      const live=value.filter(item=>item&&item.demo!==true&&
        !String(item.id).startsWith('demo-')&&
        ![item.image,item.url].some(asset=>typeof asset==='string'&&asset.startsWith('/demo/')));
      if(preview){if(value.length)content[key]=value;}
      else content[key]=live;
    }
  }
  if(preview)content.branding.previewOnly='true';
  else delete content.branding.previewOnly;
  return plainStarterCopy(content);
}
export async function log(actor:string,action:string){
  await database().collection('audit').insertOne({id:crypto.randomUUID(),actor,action,created:new Date().toISOString()});
}
export async function hmac(secret:string,value:string){const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);return [...new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(value)))].map(x=>x.toString(16).padStart(2,'0')).join('')}
export function safeEqual(a:string,b:string){if(a.length!==b.length)return false;let c=0;for(let i=0;i<a.length;i++)c|=a.charCodeAt(i)^b.charCodeAt(i);return c===0}
export type NotificationEvent='registration-created'|'enquiry-created'|'trial-created'|'manual-proof-submitted'|'manual-proof-rejected'|'payment-confirmed'|'registration-updated';
export async function notifyRegistration(event:NotificationEvent,row:Registration){
  try{
    let tournament:string|undefined;
    if(!row.data.receiptTitle&&row.target){try{const content=await getContent();tournament=[...content.tournaments,...content.training].find((item:{id:string;title?:string})=>item.id===row.target)?.title;}catch{}}
    const queued=await queueAdminNotification(database(),registrationNotification(event,row,tournament),{deferDelivery:true});
    if(queued.id)after(async()=>{try{await deliverAdminNotification(database(),queued.id);}catch{console.error('Admin email delivery deferred; the pending notification remains in the outbox.');}});
    return queued;
  }catch{console.error('Admin notification could not be queued; the website request remains saved.');}
}
export async function notifyNewRequest(row:Registration){
  await notifyRegistration(row.kind==='enquiry'?'enquiry-created':row.kind==='trial'?'trial-created':'registration-created',row);
  if(row.data.paymentMethod==='manual'&&row.data.manualProofRevision)await notifyRegistration('manual-proof-submitted',row);
}
export async function rateLimit(req:Request, scope='write'){
  const minutes=Math.floor(Date.now()/600000);
  const proxyHeader=runtime().PPC_TRUSTED_IP_HEADER;
  const ip=proxyHeader?req.headers.get(proxyHeader)?.split(',').at(-1)?.trim()||'local':'local';
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(ip));
  const key=scope+':'+Buffer.from(digest).toString('hex')+':'+minutes;
  const buckets=database().collection<{_id:string;count:number;expiresAt:Date}>('limits');
  const update={$inc:{count:1},$setOnInsert:{expiresAt:new Date((minutes+2)*600000)}};
  let bucket;
  try{bucket=await buckets.findOneAndUpdate({_id:key}, update,{upsert:true,returnDocument:'after'});}
  catch(error){if(!duplicateKey(error))throw error;bucket=await buckets.findOneAndUpdate({_id:key},update,{returnDocument:'after'});}
  const configured=Number(runtime().PPC_WRITE_RATE_LIMIT||120);
  const limit=scope==='auth'?30:scope==='upload'?Math.max(configured,200):scope==='status'?300:configured;
  if(!bucket||bucket.count>limit)throw new Error('Too many requests. Please try again in a few minutes.');
}
