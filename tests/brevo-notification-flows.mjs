import assert from 'node:assert/strict';
import { randomUUID,createHmac } from 'node:crypto';
import { MongoClient } from 'mongodb';
import { spawn } from 'node:child_process';
import { readFile,readdir,mkdir,writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium,expect } from '@playwright/test';

const origin=process.env.PPC_TEST_URL||'http://localhost:3010';
if(!['localhost','127.0.0.1'].includes(new URL(origin).hostname)||!process.env.MONGODB_DATABASE?.startsWith('ppc_test_')||process.env.BREVO_API_KEY)throw Error('Use disposable local tests with Brevo delivery disabled.');
const mongo=new MongoClient(process.env.MONGODB_URI),db=mongo.db(process.env.MONGODB_DATABASE),queue=db.collection('outbox');
async function call(path,body,cookie,method='POST',url=origin){
  const r=await fetch(url+'/api/'+path,{method,headers:{...(body instanceof FormData?{}:{'Content-Type':'application/json'}),...(cookie?{Cookie:cookie}:{})},...(body!==undefined?{body:body instanceof FormData?body:JSON.stringify(body)}:{})});
  return {status:r.status,data:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]};
}
async function notice(registrationId,predicate){for(let i=0;i<100;i++){const row=await queue.findOne({registrationId});if(row&&predicate(row))return row;await new Promise(resolve=>setTimeout(resolve,50));}throw Error('Timed out waiting for post-response mock delivery.');}
const entry=extra=>({id:randomUUID(),token:randomUUID(),kind:'tournament',target:'notification-event',registrationChoice:'manual',name:'Admin email flow fixture',email:'participant-mail-fixture@example.invalid',phone:'9999999999',consent:true,...extra});
let owner,original,missingServer,mockServer,browser;
try{
  owner=await call('auth/login',{role:'admin',username:process.env.PPC_BOOTSTRAP_ADMIN_ID,password:process.env.PPC_BOOTSTRAP_ADMIN_PASSWORD});assert.equal(owner.status,200);
  original=(await call('content',undefined,undefined,'GET')).data;
  const publicStatus=await call('status',undefined,undefined,'GET');assert.equal(publicStatus.data.email,false);assert.equal(publicStatus.data.emailConfiguration,undefined);
  const adminStatus=await call('status',undefined,owner.cookie,'GET');assert.equal(adminStatus.data.emailConfiguration.provider,'Brevo');assert.ok(adminStatus.data.emailConfiguration.issues.some(issue=>issue.includes('BREVO_API_KEY')));
  assert.ok(!JSON.stringify(adminStatus.data).includes(process.env.ADMIN_NOTIFICATION_EMAIL));
  assert.equal((await call('outbox',undefined,undefined,'GET')).status,403);
  await call('content',{key:'branding',value:{...original.branding,email:'branding-recipient-must-not-receive@example.invalid'}},owner.cookie,'PUT');
  const upload=new FormData();upload.set('file',new Blob([await readFile('public/power-punch-logo.webp')]),'qr.webp');upload.set('scope','public');const qr=await call('upload',upload,owner.cookie);assert.equal(qr.status,200);
  const event={id:'notification-event',title:'Notification test tournament',status:'open',registrationMode:'both',manualPaymentEnabled:true,manualQrImage:qr.data.url,fee:750,capacity:100};
  await call('content',{key:'tournaments',value:[...original.tournaments,event]},owner.cookie,'PUT');
  const manual=entry({manualProof:{transactionId:'UTR-'+randomUUID()}}),registered=await call('register',manual);assert.equal(registered.status,200,JSON.stringify(registered.data));
  await Promise.all(Array.from({length:6},()=>call('register',manual)));
  assert.equal(await queue.countDocuments({registrationId:manual.id,event:'registration-created'}),1);
  assert.equal(await queue.countDocuments({registrationId:manual.id,event:'manual-proof-submitted'}),1);
  const pending=await queue.findOne({registrationId:manual.id,event:'manual-proof-submitted'});
  assert.equal(pending.recipient,process.env.ADMIN_NOTIFICATION_EMAIL);assert.equal(pending.status,'pending');
  for(const value of [registered.data.registrationNumber,manual.name,event.title,'INR 750.00','manual_pending'])assert.ok(pending.body.includes(value));
  assert.ok(!pending.body.includes(manual.token)&&!pending.body.includes(registered.data.trackingCode));
  let row=await db.collection('requests').findOne({_id:manual.id});
  assert.equal((await call('manual-payment-review',{id:manual.id,action:'reject',expectedRevision:row.data.manualProofRevision,note:'Please correct the UPI reference.'},owner.cookie)).status,200);
  const rejected=await queue.findOne({registrationId:manual.id,event:'manual-proof-rejected'});assert.ok(rejected.body.includes('manual_rejected'));
  assert.equal((await call('manual-proof',{...manual,manualProof:{transactionId:'RESUB-'+randomUUID()}})).status,200);
  assert.equal(await queue.countDocuments({registrationId:manual.id,event:'manual-proof-submitted'}),2);
  row=await db.collection('requests').findOne({_id:manual.id});
  const review={id:manual.id,action:'verify',expectedRevision:row.data.manualProofRevision};
  assert.equal((await call('manual-payment-review',review,owner.cookie)).status,200);assert.equal((await call('manual-payment-review',review,owner.cookie)).status,200);
  assert.equal(await queue.countDocuments({registrationId:manual.id,event:'payment-confirmed'}),1);
  const paidNotice=await queue.findOne({registrationId:manual.id,event:'payment-confirmed'});assert.ok(paidNotice.body.includes('Payment verified (paid)'));
  assert.equal((await call('receipt',manual)).status,200);
  const tracking=await call('track-registration',{registrationNumber:registered.data.registrationNumber,trackingCode:registered.data.trackingCode});assert.equal(tracking.status,200);
  const state=await call('registration-status',{id:manual.id},tracking.cookie);assert.equal(state.data.paymentStatus,'paid');
  const pdf=await fetch(origin+'/api/registration-document',{method:'POST',headers:{'Content-Type':'application/json',Cookie:tracking.cookie},body:JSON.stringify({id:manual.id,document:'receipt'})});assert.equal(pdf.status,200);assert.equal(pdf.headers.get('content-type'),'application/pdf');await pdf.arrayBuffer();
  const enquiry=entry({kind:'enquiry',target:'',message:'Please contact the club about class timings.'}),free=entry({registrationChoice:'free'});
  assert.equal((await call('register',enquiry)).status,200);assert.equal((await call('register',free)).status,200);
  assert.equal((await db.collection('requests').findOne({_id:enquiry.id})).email,enquiry.email,'Participant contact collection is preserved');
  assert.ok((await queue.findOne({registrationId:enquiry.id,event:'enquiry-created'})).body.includes('Amount: INR 0.00'));
  const online=entry({registrationChoice:'paid'});assert.equal((await call('register',online)).status,200);
  const order='order_notification_'+randomUUID();await db.collection('requests').updateOne({_id:online.id},{$set:{order_id:order}});
  const webhook=JSON.stringify({event:'payment.captured',payload:{payment:{entity:{id:'pay_notification_capture',order_id:order,amount:75000,currency:'INR'}}}}),signature=createHmac('sha256',process.env.RAZORPAY_WEBHOOK_SECRET).update(webhook).digest('hex');
  for(let i=0;i<2;i++){const r=await fetch(origin+'/api/webhook',{method:'POST',headers:{'Content-Type':'application/json','x-razorpay-signature':signature},body:webhook});assert.equal(r.status,200);}
  assert.equal(await queue.countDocuments({registrationId:online.id,event:'payment-confirmed'}),1);
  await queue.insertOne({id:'legacy-participant-'+randomUUID(),recipient:manual.email,subject:'Historical participant acknowledgement',body:'Retain history',status:'pending'});
  const retry=await call('outbox',{},owner.cookie);assert.equal(retry.status,200);assert.ok(retry.data.skipped>=1);assert.equal(retry.data.accepted,0);
  const old=await queue.findOne({subject:'Historical participant acknowledgement'});assert.equal(old.status,'skipped');assert.equal(old.recipient,manual.email);assert.equal(old.body,'Retain history');assert.ok(old.skipReason);
  const all=await queue.find({audience:'admin'}).toArray();assert.ok(all.every(item=>item.recipient===process.env.ADMIN_NOTIFICATION_EMAIL));assert.ok(all.every(item=>item.status==='pending'));
  const history=await call('outbox',undefined,owner.cookie,'GET');assert.ok(history.data.every(item=>item.recipient===undefined&&item.body===undefined));assert.ok(!JSON.stringify(history.data).includes(process.env.ADMIN_NOTIFICATION_EMAIL));
  // A separate app instance has NO Admin recipient and NO provider credentials.
  // It must still save a registration, support tracking/PDF and show the issue.
  const missingOrigin='http://localhost:3012';
  missingServer=spawn(process.execPath,['node_modules/next/dist/bin/next','start','-p','3012'],{env:{...process.env,PPC_PUBLIC_ORIGIN:missingOrigin,ADMIN_NOTIFICATION_EMAIL:'',BREVO_API_KEY:'',EMAIL_FROM_ADDRESS:'',EMAIL_FROM_NAME:''},stdio:'ignore'});
  let ready=false;for(let i=0;i<50;i++){try{const r=await fetch(missingOrigin+'/api/status');if(r.ok){ready=true;break;}}catch{}await new Promise(resolve=>setTimeout(resolve,200));}assert.ok(ready);
  const without=entry({kind:'enquiry',target:''}),saved=await call('register',without,undefined,'POST',missingOrigin);assert.equal(saved.status,200,JSON.stringify(saved.data));
  const held=await queue.findOne({registrationId:without.id,event:'enquiry-created'});assert.equal(held.status,'pending');assert.equal(held.recipient,null);assert.equal(held.attempts,undefined);
  const missingStatus=await call('status',undefined,owner.cookie,'GET',missingOrigin);assert.ok(missingStatus.data.emailConfiguration.issues.some(issue=>issue.includes('ADMIN_NOTIFICATION_EMAIL')));
  const recovered=await call('track-registration',{registrationNumber:saved.data.registrationNumber,trackingCode:saved.data.trackingCode},undefined,'POST',missingOrigin);assert.equal(recovered.status,200);
  const missingPdf=await fetch(missingOrigin+'/api/registration-document',{method:'POST',headers:{'Content-Type':'application/json',Cookie:recovered.cookie},body:JSON.stringify({id:without.id})});assert.equal(missingPdf.status,200);await missingPdf.arrayBuffer();
  // Exercise the real HTTP notification path with a mocked Brevo provider.
  // Even the successful provider scenario sends no mail outside this process.
  await mkdir('outputs/email-tests',{recursive:true});
  const responseFile=path.resolve('outputs/email-tests/mock-response.json'),logFile=path.resolve('outputs/email-tests/mock-provider.ndjson'),releaseFile=path.resolve('outputs/email-tests/release-'+randomUUID());
  await writeFile(responseFile,JSON.stringify({status:201,gated:true}));await writeFile(logFile,'');
  const mockOrigin='http://localhost:3013';
  mockServer=spawn(process.execPath,['--import','./tests/fixtures/mock-brevo-provider.mjs','node_modules/next/dist/bin/next','start','-p','3013'],{env:{...process.env,PPC_PUBLIC_ORIGIN:mockOrigin,BREVO_API_KEY:'fake_brevo_test_only',EMAIL_FROM_ADDRESS:'test-sender@example.invalid',EMAIL_FROM_NAME:'Power Punch Club test',PPC_MOCK_BREVO_LOG:logFile,PPC_MOCK_BREVO_RESPONSE_FILE:responseFile,PPC_MOCK_BREVO_RELEASE_FILE:releaseFile},stdio:'ignore'});
  ready=false;for(let i=0;i<50;i++){try{const r=await fetch(mockOrigin+'/api/status');if(r.ok){ready=true;break;}}catch{}await new Promise(resolve=>setTimeout(resolve,200));}assert.ok(ready);
  const acceptedEntry=entry({kind:'enquiry',target:''});assert.equal((await call('register',acceptedEntry,undefined,'POST',mockOrigin)).status,200);
  assert.notEqual((await queue.findOne({registrationId:acceptedEntry.id})).status,'accepted','Registration response completed before the gated provider accepted');
  await writeFile(releaseFile,'release');
  const acceptedNotice=await notice(acceptedEntry.id,row=>row.status==='accepted');
  await call('register',acceptedEntry,undefined,'POST',mockOrigin);
  assert.equal(acceptedNotice.status,'accepted');assert.match(acceptedNotice.providerMessageId,/^<mock-/);assert.equal(acceptedNotice.deliveryStatus,'not_confirmed');
  assert.equal((await readFile(logFile,'utf8')).trim().split('\n').length,1,'HTTP submission retry does not send again');
  await writeFile(responseFile,JSON.stringify({status:401,body:{code:'unauthorized',message:'Authentication failed'}}));
  const rejectedEntry=entry({kind:'enquiry',target:''});assert.equal((await call('register',rejectedEntry,undefined,'POST',mockOrigin)).status,200);
  const heldAfterFailure=await notice(rejectedEntry.id,row=>row.errorKind==='credentials');assert.equal(heldAfterFailure.status,'pending');assert.equal(heldAfterFailure.errorKind,'credentials');
  const providerHistory=await call('outbox',undefined,owner.cookie,'GET',mockOrigin);assert.ok(providerHistory.data.some(item=>item.status==='accepted'&&item.providerMessageId));assert.ok(!JSON.stringify(providerHistory.data).includes('fake_brevo_test_only'));
  browser=await chromium.launch({headless:true});const page=await browser.newPage();
  const cookie=owner.cookie.split('=');await page.context().addCookies([{name:cookie[0],value:cookie.slice(1).join('='),url:missingOrigin,httpOnly:true,secure:true,sameSite:'Lax'}]);
  await page.goto(missingOrigin+'/admin');await expect(page.getByText('Set ADMIN_NOTIFICATION_EMAIL to one valid club administrator email address.',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Integrations & system',exact:true}).click();await expect(page.getByText('Brevo transactional email (Admin only)',{exact:true})).toBeVisible();
  await expect(page.getByText('Accepted by Brevo',{exact:false}).first()).toBeVisible();await mkdir('outputs/email-tests',{recursive:true});await page.screenshot({path:'outputs/email-tests/admin-missing-config.png',fullPage:true});
  const chunks='.next-registration-tests/static/chunks';for(const file of await readdir(chunks))if(file.endsWith('.js'))assert.ok(!(await readFile(chunks+'/'+file,'utf8')).includes(process.env.ADMIN_NOTIFICATION_EMAIL),'Admin recipient value is absent from browser bundles');
  console.log('Notification HTTP/browser tests passed: Admin-only event routing, participant email collection, UPI submit/reject/resubmit/verify, capture replay dedupe, legacy skip/history, safe retries, status/secret isolation, missing-recipient registration/tracking/PDF and visible Admin Brevo configuration. No real email sent.');
}finally{
  if(browser)await browser.close();for(const server of [missingServer,mockServer])if(server){server.kill();await new Promise(resolve=>{if(server.exitCode!==null)resolve();else server.once('exit',resolve);});}
  if(owner&&original){await call('content',{key:'tournaments',value:original.tournaments},owner.cookie,'PUT');await call('content',{key:'branding',value:original.branding},owner.cookie,'PUT');}
  await mongo.close();
}
