import assert from 'node:assert/strict';
import { MongoClient } from 'mongodb';
import { randomUUID } from 'node:crypto';
import { emailConfiguration,queueAdminNotification,deliverAdminNotification,retryAdminNotifications,adminOutboxHistory,registrationNotification } from '../lib/admin-notifications.mjs';

if(!process.env.MONGODB_DATABASE?.startsWith('ppc_test_')||!/^mongodb:\/\/(127\.0\.0\.1|localhost):/.test(process.env.MONGODB_URI||''))throw Error('Disposable local MongoDB required.');
const client=new MongoClient(process.env.MONGODB_URI),db=client.db(process.env.MONGODB_DATABASE+'_email_'+randomUUID().slice(0,8)),queue=db.collection('outbox');
const env={ADMIN_NOTIFICATION_EMAIL:'club-admin@example.invalid',BREVO_API_KEY:'mock-brevo-secret-not-a-real-key',EMAIL_FROM_ADDRESS:'sender@example.invalid',EMAIL_FROM_NAME:'Power Punch Club'};
const fixture={id:randomUUID(),name:'Notification participant',email:'participant@example.invalid',phone:'9999999999',kind:'tournament',status:'new',amount:75000,payment_status:'manual_pending',
  data:{registrationNumber:'PPC-000123',receiptTitle:'Test tournament',paymentMethod:'manual',manualProofRevision:'first-proof',manualProof:{transactionId:'UTR123456'},trackingCode:'NEVER-IN-NOTIFICATION',answers:{aadhaar:'NEVER-IN-NOTIFICATION'}},token:'NEVER-IN-NOTIFICATION',notes:'NEVER-IN-NOTIFICATION'};
const notification=(key=randomUUID())=>({...registrationNotification('registration-created',fixture),eventKey:key});
const success=()=>Response.json({messageId:'<mock-message@brevo.invalid>'},{status:201});
let clock=Date.now(),calls=[];
const transport=async(url,request)=>{calls.push({url,request,payload:JSON.parse(request.body)});return success();};
const options={env,fetch:transport,now:()=>clock};
async function idFor(key){return (await queue.findOne({subject:key})).id;}
async function pending(key){const item=notification(key);item.subject=key;await queueAdminNotification(db,item,{...options,env:{...env,BREVO_API_KEY:''}});return idFor(key);}
try{
  assert.equal(emailConfiguration(env).ready,true);
  assert.equal(emailConfiguration({...env,ADMIN_NOTIFICATION_EMAIL:'person@example.invalid,other@example.invalid'}).ready,false);
  assert.equal(emailConfiguration({...env,EMAIL_FROM_ADDRESS:'Sender <sender@example.invalid>'}).ready,false);
  assert.ok(!JSON.stringify(emailConfiguration(env)).includes(env.ADMIN_NOTIFICATION_EMAIL));assert.ok(!JSON.stringify(emailConfiguration(env)).includes(env.BREVO_API_KEY));
  const entry=notification('initial');await queueAdminNotification(db,entry,options);
  assert.equal(calls.length,1);assert.equal(calls[0].url,'https://api.brevo.com/v3/smtp/email');assert.equal(calls[0].request.method,'POST');assert.equal(calls[0].request.headers['api-key'],env.BREVO_API_KEY);
  assert.deepEqual(calls[0].payload.sender,{email:env.EMAIL_FROM_ADDRESS,name:env.EMAIL_FROM_NAME});assert.deepEqual(calls[0].payload.to,[{email:env.ADMIN_NOTIFICATION_EMAIL}]);
  assert.equal(calls[0].payload.cc,undefined);assert.equal(calls[0].payload.bcc,undefined);assert.equal(calls[0].payload.replyTo,undefined);assert.equal(calls[0].payload.textContent,entry.body);assert.equal(calls[0].payload.htmlContent,entry.html);assert.match(entry.html,/<table/);assert.match(calls[0].payload.headers.idempotencyKey,/^[a-f0-9-]{36}$/);
  let stored=await queue.findOne({registrationId:fixture.id});assert.equal(stored.status,'accepted');assert.equal(stored.providerMessageId,'<mock-message@brevo.invalid>');assert.equal(stored.deliveryStatus,'not_confirmed');assert.equal(stored.deliveredAt,undefined);
  for(const value of ['PPC-000123',fixture.name,'Test tournament','INR 750.00','Awaiting Admin Verification'])assert.ok(stored.body.includes(value));
  assert.ok(!stored.body.includes('NEVER-IN-NOTIFICATION'));
  await Promise.all(Array.from({length:10},()=>queueAdminNotification(db,entry,options)));assert.equal(calls.length,1,'Same event is not sent twice');
  const concurrent=await pending('concurrent');const before=calls.length;await Promise.all(Array.from({length:12},()=>deliverAdminNotification(db,concurrent,options)));assert.equal(calls.length,before+1,'MongoDB lease prevents concurrent sending');
  // Both automatic enqueue and manual retry exclude historical participant mail.
  await queue.insertMany([{id:'old-participant',recipient:fixture.email,subject:'Old acknowledgement',body:'Retained historical content',status:'pending'},
    {id:'old-same-as-admin',recipient:env.ADMIN_NOTIFICATION_EMAIL,subject:'Legacy participant acknowledgement',body:'Old participant content',status:'pending'},
    {id:'old-sent',recipient:fixture.email,subject:'Past email',body:'Past delivery',status:'sent'}]);
  const oldBefore=calls.length;assert.equal((await deliverAdminNotification(db,'old-participant',options)).status,'skipped');await retryAdminNotifications(db,options);
  assert.equal(calls.length,oldBefore);assert.equal((await queue.findOne({id:'old-same-as-admin'})).status,'skipped');assert.equal((await queue.findOne({id:'old-sent'})).status,'sent');
  const historical=await queue.findOne({id:'old-participant'});assert.equal(historical.recipient,fixture.email);assert.equal(historical.body,'Retained historical content');assert.match(historical.skipReason,/Admin-only/);
  // Missing configuration retains pending notifications and binds only to the
  // server Admin recipient once configured, never to participant contact data.
  const missing=notification('missing-admin');missing.subject='missing-admin';const noAdmin={...env,ADMIN_NOTIFICATION_EMAIL:''};const missingCalls=calls.length;
  await queueAdminNotification(db,missing,{...options,env:noAdmin});const missingId=await idFor('missing-admin');stored=await queue.findOne({id:missingId});assert.equal(stored.status,'pending');assert.equal(stored.recipient,null);assert.equal(calls.length,missingCalls);
  await deliverAdminNotification(db,missingId,options);assert.equal(calls.length,missingCalls+1);assert.equal(calls.at(-1).payload.to[0].email,env.ADMIN_NOTIFICATION_EMAIL);
  const missingKey=await pending('missing-key');assert.equal((await queue.findOne({id:missingKey})).status,'pending');
  // Error responses are classified without persisting raw provider messages.
  const errors=[
    {status:401,body:{code:'unauthorized',message:env.BREVO_API_KEY},kind:'credentials'},
    {status:400,body:{code:'invalid_parameter',message:'sender is not verified: '+env.EMAIL_FROM_ADDRESS},kind:'sender'},
    {status:400,body:{code:'not_enough_credits',message:'Daily quota exhausted'},kind:'quota'},
    {status:429,body:{code:'rate_limit',message:'Too many requests'},kind:'rate_limit',headers:{'Retry-After':'120'}},
    {status:503,body:{message:'Service unavailable'},kind:'provider'},
  ];
  for(const issue of errors){const id=await pending('error-'+issue.kind);const prior=calls.length;
    await deliverAdminNotification(db,id,{...options,fetch:async()=>{calls.push({mock:true});return Response.json(issue.body,{status:issue.status,headers:issue.headers});}});
    stored=await queue.findOne({id});assert.equal(stored.status,'pending');assert.equal(stored.errorKind,issue.kind);assert.ok(stored.nextAttemptAt>clock);assert.ok(!JSON.stringify(stored).includes(env.BREVO_API_KEY));assert.ok(!stored.lastError.includes(env.EMAIL_FROM_ADDRESS));
    if(issue.kind==='rate_limit')assert.equal(stored.nextAttemptAt,clock+120_000);
    await deliverAdminNotification(db,id,options);assert.equal(calls.length,prior+1,'Backoff prevents immediate resend');
    await queue.updateOne({id},{$set:{retryBlocked:true}}); // isolate further test retries
  }
  const timeoutId=await pending('timeout');
  await deliverAdminNotification(db,timeoutId,{...options,timeoutMs:20,fetch:async(_url,{signal})=>new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(Error('timeout')),{once:true}))});
  stored=await queue.findOne({id:timeoutId});assert.equal(stored.status,'pending');assert.equal(stored.deliveryUncertain,true);const key=stored.idempotencyKey;clock=stored.nextAttemptAt+1;
  await deliverAdminNotification(db,timeoutId,options);assert.equal(calls.at(-1).payload.headers.idempotencyKey,key,'Safe retry uses the same provider UUID');
  const lateId=await pending('late-uncertain');await deliverAdminNotification(db,lateId,{...options,fetch:async()=>{throw Error('Connection reset');}});stored=await queue.findOne({id:lateId});clock=stored.attemptWindowStartedAt+31*60_000;
  const lateBefore=calls.length;await deliverAdminNotification(db,lateId,options);assert.equal(calls.length,lateBefore);assert.equal((await queue.findOne({id:lateId})).retryBlocked,true);
  const duplicate=await pending('duplicate-key');await deliverAdminNotification(db,duplicate,{...options,fetch:async()=>Response.json({code:'duplicate_parameter',message:'idempotency key already processed'},{status:400})});stored=await queue.findOne({id:duplicate});assert.equal(stored.retryBlocked,true);assert.equal(stored.status,'pending');assert.equal(stored.providerMessageId,undefined);
  const noId=await pending('no-message-id');await deliverAdminNotification(db,noId,{...options,fetch:async()=>Response.json({},{status:201})});assert.equal((await queue.findOne({id:noId})).deliveryUncertain,true);
  const changed=await pending('changed-recipient');const changedBefore=calls.length;await deliverAdminNotification(db,changed,{...options,env:{...env,ADMIN_NOTIFICATION_EMAIL:'new-admin@example.invalid'}});assert.equal((await queue.findOne({id:changed})).status,'skipped');assert.equal(calls.length,changedBefore);
  const history=await adminOutboxHistory(db,env);assert.ok(history.every(row=>row.recipient===undefined&&row.body===undefined&&row.html===undefined));assert.ok(!JSON.stringify(history).includes(env.ADMIN_NOTIFICATION_EMAIL));assert.ok(!JSON.stringify(history).includes(env.BREVO_API_KEY));
  await queue.updateMany({status:'pending'},{$set:{retryBlocked:true}});
  const beforeBlocked=calls.length;
  for(const event of ['manual-proof-rejected','registration-updated','enquiry-created','trial-created']){
    const blocked=await queueAdminNotification(db,{...registrationNotification(event,fixture),eventKey:'blocked:'+event},options);
    assert.equal(blocked.status,'skipped');assert.ok((await queue.findOne({id:blocked.id})).skipReason);
  }
  const manualVerified={...fixture,payment_status:'paid',payment_id:'manual_fixture'};
  assert.equal((await queueAdminNotification(db,registrationNotification('payment-confirmed',manualVerified),options)).status,'skipped');
  assert.equal(calls.length,beforeBlocked);
  const changedEvent=await pending('policy-changed');await queue.updateOne({id:changedEvent},{$set:{event:'registration-updated'}});
  assert.equal((await deliverAdminNotification(db,changedEvent,options)).status,'skipped');
  await retryAdminNotifications(db,options);assert.equal(calls.length,beforeBlocked);
  console.log('Mocked Brevo tests passed: payload/auth, Admin-only target, secret redaction, legacy skipping/history, pending config, concurrency/event dedupe, provider IDs vs delivery, 401/sender/quota/429/503/timeouts, backoff, idempotency and expired-ambiguity review. No real email sent.');
}finally{await client.close();}
