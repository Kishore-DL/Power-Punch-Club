import {registrationEmail} from './notification-layout.mjs';
import { createHash, randomUUID } from 'node:crypto';

const POLICY='admin-only-v1',IDEMPOTENCY_MS=30*60_000;
const mailbox=value=>typeof value==='string'&&value.trim().length<=254&&/^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/.test(value.trim())?value.trim().toLowerCase():'';
export const adminRecipient=(env=process.env)=>mailbox(env.ADMIN_NOTIFICATION_EMAIL);
export function emailConfiguration(env=process.env){
  const issues=[];
  if(!adminRecipient(env))issues.push('Set ADMIN_NOTIFICATION_EMAIL to one valid club administrator email address.');
  if(!env.BREVO_API_KEY?.trim())issues.push('Set BREVO_API_KEY for Brevo transactional email.');
  if(!mailbox(env.EMAIL_FROM_ADDRESS))issues.push('Set EMAIL_FROM_ADDRESS to your verified Brevo sender email address.');
  if(!env.EMAIL_FROM_NAME?.trim()||/[\r\n]/.test(env.EMAIL_FROM_NAME)||env.EMAIL_FROM_NAME.length>200)issues.push('Set EMAIL_FROM_NAME to the club sender name (at most 200 characters).');
  return {provider:'Brevo',ready:issues.length===0,issues};
}

const allowedEvents=['registration-created','manual-proof-submitted','payment-confirmed'];
async function eventPolicyReason(db,row){
  if(!allowedEvents.includes(row.event))return 'Event is no longer allowed: only new registrations and participant payment submissions notify Admin.';
  const registration=row.registrationKind?null:await db.collection('requests').findOne({_id:row.registrationId});
  const kind=row.registrationKind||registration?.kind;
  if(!['tournament','team'].includes(kind))return 'Enquiry/trial or unverified registration event excluded by the new-submissions policy.';
  const method=row.paymentMethod||registration?.data?.paymentMethod;
  if(row.event==='payment-confirmed'&&method!=='razorpay')return 'Admin manual-payment verification does not generate a notification.';
  if(row.event==='manual-proof-submitted'){
    const revision=row.proofRevision||registration?.data?.manualProofRevision;
    if(!row.proofRevision&&registration){const currentId='ppc-admin-'+createHash('sha256').update(['manual-proof-submitted',registration.id,revision||''].join(':')).digest('hex');if(row.id!==currentId)return 'Historical payment proof is not the current submitted revision; notification skipped.';}
    const initial=row.initialManualProof??!registration?.data?.manualHistory?.length;
    if(method!=='manual'||!revision||initial)return 'Initial UPI proof is covered by the combined registration notification; only new proof revisions notify separately.';
  }
  return '';
}

export async function skipIneligibleOutbox(db,env=process.env){
  const queue=db.collection('outbox'),active={status:{$in:['pending','sending']}},now=new Date().toISOString();
  const legacy=await queue.updateMany({...active,$or:[{audience:{$ne:'admin'}},{notificationPolicy:{$ne:POLICY}}]},
    {$set:{status:'skipped',skippedAt:now,skipReason:'Legacy or participant-directed email blocked by the Admin-only notification policy.'},$unset:{lease:'',leaseUntil:''}});
  const recipient=adminRecipient(env);
  let policySkipped=0;
  const candidates=await queue.find({...active,audience:'admin',notificationPolicy:POLICY}).toArray();
  for(const row of candidates){const reason=await eventPolicyReason(db,row);if(reason){const result=await queue.updateOne({_id:row._id,...active},{$set:{status:'skipped',skippedAt:now,skipReason:reason},$unset:{lease:'',leaseUntil:''}});policySkipped+=result.modifiedCount;}}
  if(!recipient)return legacy.modifiedCount+policySkipped; // Keep Admin notifications pending while configuration is missing.
  const mismatch=await queue.updateMany({...active,audience:'admin',notificationPolicy:POLICY,recipient:{$nin:[recipient,null]}},
    {$set:{status:'skipped',skippedAt:now,skipReason:'Recipient no longer matches ADMIN_NOTIFICATION_EMAIL; historical recipient retained.'},$unset:{lease:'',leaseUntil:''}});
  return legacy.modifiedCount+mismatch.modifiedCount+policySkipped;
}
function blockedRecipient(row,env){
  if(row.audience!=='admin'||row.notificationPolicy!==POLICY)return 'Legacy or participant-directed email blocked by the Admin-only notification policy.';
  const admin=adminRecipient(env);
  if(admin&&row.recipient&&row.recipient!==admin)return 'Recipient no longer matches ADMIN_NOTIFICATION_EMAIL; historical recipient retained.';
  return '';
}
function retryDelay(kind,attempts,response,now){
  const raw=response?.headers.get('retry-after');
  if(raw){const value=/^\d+$/.test(raw)?Number(raw)*1000:Date.parse(raw)-now;if(Number.isFinite(value)&&value>0)return Math.min(value,86400_000);}
  if(kind==='quota')return 3600_000;
  if(['credentials','sender','request'].includes(kind))return 300_000;
  if(kind==='rate_limit')return 60_000;
  return Math.min(30_000*2**Math.min(Math.max(attempts-1,0),7),3600_000);
}
function failure(response,data){
  // Inspect provider text only to classify it. Never retain/log raw responses,
  // which can echo credentials, sender addresses or participant content.
  const code=typeof data?.code==='string'?data.code.toLowerCase():'';
  const text=typeof data?.message==='string'?data.message.toLowerCase():'';
  if(code==='duplicate_parameter')return {kind:'duplicate',message:'Brevo reports this request was already processed. Review transactional logs for its message ID before retrying.',uncertain:true,blocked:true};
  if(response.status===401||response.status===403)return {kind:'credentials',message:'Brevo rejected API access. Check BREVO_API_KEY and transactional account activation.'};
  if(/credit|quota|daily/.test(code+' '+text))return {kind:'quota',message:'Brevo email credits or daily quota are exhausted. Check the account before retrying.'};
  if(response.status===429)return {kind:'rate_limit',message:'Brevo rate limit reached; delivery is scheduled for retry.'};
  if(/sender|from.*email|email.*from/.test(code+' '+text))return {kind:'sender',message:'Brevo rejected the sender. Verify EMAIL_FROM_ADDRESS and sender/domain verification.'};
  if(response.status>=500||response.status===408)return {kind:'provider',message:'Brevo could not confirm acceptance. A safe retry is pending.',uncertain:true};
  return {kind:'request',message:'Brevo rejected the email request. Check sender/account configuration; the notification remains pending.'};
}
export async function deliverAdminNotification(db,id,options={}){
  const env=options.env||process.env,transport=options.fetch||globalThis.fetch,now=options.now?.()??Date.now();
  const queue=db.collection('outbox');let existing=await queue.findOne({id});
  if(!existing||!['pending','sending'].includes(existing.status))return {status:existing?.status||'not_found'};
  const reason=blockedRecipient(existing,env)||await eventPolicyReason(db,existing);
  if(reason){await queue.updateOne({_id:existing._id,status:{$in:['pending','sending']}},{$set:{status:'skipped',skipReason:reason,skippedAt:new Date(now).toISOString()},$unset:{lease:'',leaseUntil:''}});return {status:'skipped'};}
  if(!emailConfiguration(env).ready)return {status:'pending'};
  if(!existing.recipient){
    await queue.updateOne({_id:existing._id,recipient:null,audience:'admin',notificationPolicy:POLICY},{$set:{recipient:adminRecipient(env)}});
    existing=await queue.findOne({_id:existing._id});
    if(existing.recipient!==adminRecipient(env))return {status:'pending'};
  }
  if(existing.retryBlocked||existing.nextAttemptAt>now)return {status:'pending'};
  const request={sender:{email:mailbox(env.EMAIL_FROM_ADDRESS),name:env.EMAIL_FROM_NAME.trim()},to:[{email:adminRecipient(env)}],subject:existing.subject,textContent:existing.body,...(existing.html?{htmlContent:existing.html}:{})};
  const fingerprint=createHash('sha256').update(JSON.stringify(request)).digest('hex');
  const uncertain=existing.deliveryUncertain||(existing.status==='sending'&&existing.leaseUntil<=now);
  if(uncertain&&(!existing.attemptWindowStartedAt||now-existing.attemptWindowStartedAt>=IDEMPOTENCY_MS||(existing.requestFingerprint&&existing.requestFingerprint!==fingerprint))){
    await queue.updateOne({_id:existing._id,status:existing.status},{$set:{status:'pending',retryBlocked:true,lastError:'Email acceptance is uncertain and a safe identical retry is no longer available. Review Brevo transactional logs before resending.'},$unset:{lease:'',leaseUntil:''}});
    return {status:'pending'};
  }
  const lease=randomUUID();
  const rotate=existing.requestFingerprint&&existing.requestFingerprint!==fingerprint;
  const key=rotate?randomUUID():existing.idempotencyKey||randomUUID();
  const start=rotate||!existing.attemptWindowStartedAt||(!uncertain&&now-existing.attemptWindowStartedAt>=IDEMPOTENCY_MS)?now:existing.attemptWindowStartedAt;
  const row=await queue.findOneAndUpdate({_id:existing._id,recipient:adminRecipient(env),audience:'admin',notificationPolicy:POLICY,retryBlocked:{$ne:true},
    $and:[{$or:[{status:'pending'},{status:'sending',leaseUntil:{$lte:now}}]},{$or:[{nextAttemptAt:{$exists:false}},{nextAttemptAt:{$lte:now}}]}]},
    {$set:{status:'sending',lease,leaseUntil:now+60_000,lastAttemptAt:new Date(now).toISOString(),idempotencyKey:key,attemptWindowStartedAt:start,requestFingerprint:fingerprint,provider:'Brevo'},$inc:{attempts:1}},{returnDocument:'after'});
  if(!row)return {status:'busy'};
  const finalReason=blockedRecipient(row,env)||await eventPolicyReason(db,row);
  if(finalReason){await queue.updateOne({_id:row._id,lease},{$set:{status:'skipped',skipReason:finalReason,skippedAt:new Date(now).toISOString()},$unset:{lease:'',leaseUntil:''}});return {status:'skipped'};}
  async function preserve(problem,response){
    await queue.updateOne({_id:row._id,lease},{$set:{status:'pending',lastError:problem.message,errorKind:problem.kind,
      deliveryUncertain:!!problem.uncertain,retryBlocked:!!problem.blocked,nextAttemptAt:now+retryDelay(problem.kind,row.attempts,response,now)},$unset:{lease:'',leaseUntil:''}});
    return {status:'pending'};
  }
  try{
    // Brevo documents idempotencyKey as a UUID inside the JSON headers object.
    // Local leases and review flags remain essential beyond its limited TTL.
    const response=await transport('https://api.brevo.com/v3/smtp/email',{
      method:'POST',headers:{'api-key':env.BREVO_API_KEY.trim(),'Content-Type':'application/json',Accept:'application/json'},
      body:JSON.stringify({...request,headers:{idempotencyKey:row.idempotencyKey}}),signal:AbortSignal.timeout(options.timeoutMs||8000),
    });
    let data;try{data=await response.json();}catch{data=null;}
    if(!response.ok)return preserve(failure(response,data),response);
    if(typeof data?.messageId!=='string'||!data.messageId||data.messageId.length>1000)return preserve({kind:'response',message:'Brevo returned no usable message ID. Acceptance is uncertain; a safe retry is pending.',uncertain:true});
    await queue.updateOne({_id:row._id,lease},{$set:{status:'accepted',provider:'Brevo',providerMessageId:data.messageId,acceptedAt:new Date(now).toISOString(),deliveryStatus:'not_confirmed',deliveryUncertain:false},
      $unset:{lease:'',leaseUntil:'',lastError:'',errorKind:'',nextAttemptAt:'',retryBlocked:''}});
    return {status:'accepted'};
  }catch{return preserve({kind:'network',message:'Brevo delivery timed out or could not be confirmed. A safe retry is pending.',uncertain:true});}
}
export async function queueAdminNotification(db,notification,options={}){
  const env=options.env||process.env;
  await skipIneligibleOutbox(db,env);
  const recipient=adminRecipient(env),id='ppc-admin-'+createHash('sha256').update(notification.eventKey).digest('hex');
  const blocked=await eventPolicyReason(db,notification);
  const entry={id,recipient:recipient||null,audience:'admin',notificationPolicy:POLICY,event:notification.event,registrationId:notification.registrationId,
    registrationKind:notification.registrationKind,paymentMethod:notification.paymentMethod,proofRevision:notification.proofRevision,initialManualProof:notification.initialManualProof,
    subject:notification.subject.replace(/[\r\n]/g,' '),body:notification.body,html:notification.html,created:new Date().toISOString(),status:blocked?'skipped':'pending',...(blocked?{skipReason:blocked,skippedAt:new Date().toISOString()}:{}),idempotencyKey:randomUUID()};
  try{await db.collection('outbox').updateOne({_id:id},{$setOnInsert:entry},{upsert:true});}
  catch(error){if(error?.code!==11000)throw error;}
  if(blocked)return {status:'skipped',id};
  if(options.deferDelivery)return {status:'pending',id};
  return {...await deliverAdminNotification(db,id,options),id};
}
export async function retryAdminNotifications(db,options={}){
  const env=options.env||process.env,skipped=await skipIneligibleOutbox(db,env),recipient=adminRecipient(env),now=options.now?.()??Date.now();
  if(!emailConfiguration(env).ready)return {retried:0,accepted:0,skipped};
  const rows=await db.collection('outbox').find({recipient:{$in:[recipient,null]},audience:'admin',notificationPolicy:POLICY,retryBlocked:{$ne:true},
    $and:[{$or:[{status:'pending'},{status:'sending',leaseUntil:{$lte:now}}]},{$or:[{nextAttemptAt:{$exists:false}},{nextAttemptAt:{$lte:now}}]}]}).sort({created:1}).limit(25).toArray();
  let accepted=0;
  for(const row of rows)if((await deliverAdminNotification(db,row.id,options)).status==='accepted')accepted++;
  return {retried:rows.length,accepted,skipped};
}
export async function adminOutboxHistory(db,env=process.env){
  await skipIneligibleOutbox(db,env);
  const rows=await db.collection('outbox').find({},{projection:{_id:0,body:0,html:0,recipient:0,lease:0,leaseUntil:0,requestFingerprint:0,idempotencyKey:0}}).sort({created:-1}).limit(100).toArray();
  return rows.map(row=>({...row,recipientLabel:row.audience==='admin'&&row.notificationPolicy===POLICY?'Club administrator':'Historical recipient'}));
}
export function registrationNotification(event,row,tournament,branding={}){
  const version=event==='payment-confirmed'?row.payment_id:event.startsWith('manual-proof-')?row.data.manualProofRevision:'';
  return {event,eventKey:[event,row.id,version||''].join(':'),registrationId:row.id,
    registrationKind:row.kind,paymentMethod:row.data.paymentMethod||(row.amount?'razorpay':'free'),
    proofRevision:row.data.manualProofRevision,initialManualProof:row.data.paymentMethod==='manual'&&!row.data.manualHistory?.length,
    ...registrationEmail(event,row,tournament,branding)};
}
