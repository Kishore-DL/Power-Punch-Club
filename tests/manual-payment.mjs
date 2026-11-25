import assert from 'node:assert/strict';
import { randomUUID, createHmac } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { MongoClient } from 'mongodb';
import { PDFDocument } from 'pdf-lib';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

const origin=process.env.PPC_TEST_URL||'http://127.0.0.1:3000';
if(!['localhost','127.0.0.1'].includes(new URL(origin).hostname)||!process.env.MONGODB_DATABASE?.startsWith('ppc_test_'))throw new Error('Use a disposable local ppc_test_ database.');
const mongo=new MongoClient(process.env.MONGODB_URI);
const db=mongo.db(process.env.MONGODB_DATABASE);
let assertions=0;
function equal(actual,expected,message){assert.equal(actual,expected,message);assertions++}
async function call(path,method='GET',body,cookie,extra={}){
  const r=await fetch(origin+'/api/'+path,{method,headers:{...(body instanceof FormData?{}:{'Content-Type':'application/json'}),...(cookie?{Cookie:cookie}:{}),...extra},...(body!==undefined?{body:body instanceof FormData?body:JSON.stringify(body)}:{})});
  return {status:r.status,data:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]};
}
const entry=(extra={})=>({id:randomUUID(),token:randomUUID(),kind:'tournament',target:'manual-test',registrationChoice:'manual',name:'Test participant',email:'test@example.invalid',phone:'9999999999',consent:true,...extra});
try{
  const owner=await call('auth/login','POST',{role:'admin',username:process.env.PPC_BOOTSTRAP_ADMIN_ID,password:process.env.PPC_BOOTSTRAP_ADMIN_PASSWORD});
  equal(owner.status,200);
  const staff=await call('auth/login','POST',{role:'staff',username:'staff-test',password:'local staff test password'});
  equal(staff.status,200);
  const photo=await readFile(new URL('../public/power-punch-logo.webp',import.meta.url));
  async function upload(token,publicFile=false,recoveryCookie){
    const form=new FormData();form.set('file',new Blob([photo]),'fixture.webp');
    if(publicFile)form.set('scope','public');else{form.set('registrationToken',token);form.set('purpose','payment-proof');}
    return call('upload','POST',form,publicFile?owner.cookie:recoveryCookie);
  }
  const qr=await upload('',true);equal(qr.status,200);
  equal((await fetch(origin+qr.data.url)).status,200);
  const event={id:'manual-test',title:'UPI test tournament',fee:500,capacity:100,status:'open',deadline:'2099-12-31',registrationMode:'manual',manualQrImage:qr.data.url,manualPayee:'Fictional club'};
  equal((await call('content','PUT',{key:'tournaments',value:[{...event,manualQrImage:''}]},owner.cookie)).status,400);
  equal((await call('content','PUT',{key:'tournaments',value:[event,{...event,id:'all-modes',registrationMode:'both',manualPaymentEnabled:true}]},owner.cookie)).status,200);
  equal((await call('content','PUT',{key:'gallery',value:[{id:'test-gallery',title:'Test photo',type:'photo',url:qr.data.url,album:'Testing'}]},owner.cookie)).status,200);
  equal((await call('content')).data.gallery[0].url,qr.data.url);
  equal((await call('register','POST',entry())).status,400);
  equal((await call('register','POST',entry({manualProof:{transactionId:'FEE123456'},expectedAmount:40000}))).status,409);
  equal((await call('register','POST',entry({manualProof:{transactionId:'CONSENT123'},consent:'false'}))).status,400);
  equal((await call('staff/registrations','POST',{},staff.cookie)).status,405);
  const invalidFile=new FormData();invalidFile.set('file',new Blob([photo]),'photo.webp');
  equal((await call('upload','POST',invalidFile)).status,400);
  equal((await call('register','POST',null)).status,400);
  equal((await call('register','POST',entry({name:42}))).status,400);
  equal((await call('register','POST',entry({kind:'team',team:[null]}))).status,400);
  equal((await call('register','POST',entry({registrationChoice:'free'}))).status,400);
  equal((await call('register','POST',entry({manualProof:{transactionId:'abc'}}))).status,400);
  const first=entry({manualProof:{transactionId:'UTR123456789'}});
  const registered=await call('register','POST',first);equal(registered.status,200,JSON.stringify(registered));
  equal(registered.data.paymentStatus,'manual_pending');equal(registered.data.amount,50000);equal(registered.data.paymentMethod,'manual');
  equal((await call('register','POST',first)).data.duplicate,true);
  equal((await call('register','POST',entry({manualProof:{transactionId:'utr123456789'}}))).status,409);
  equal((await call('registration-status','POST',{...first,token:'wrong'})).status,404);
  async function pdf(auth,receipt=false,cookie,expected){const r=await fetch(origin+'/api/registration-document',{method:'POST',headers:{'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},body:JSON.stringify({...auth,document:receipt?'receipt':'acknowledgement'})});equal(r.status,200);equal(r.headers.get('content-type'),'application/pdf');const bytes=new Uint8Array(await r.arrayBuffer());assert((await PDFDocument.load(bytes)).getPageCount()>=1);assertions++;const parsed=await getDocument({data:bytes,useSystemFonts:true}).promise;let text='';for(let i=1;i<=parsed.numPages;i++)text+=(await (await parsed.getPage(i)).getTextContent()).items.map(item=>item.str).join(' ');if(expected){assert(text.includes(expected),text);assertions++;}assert(!text.includes('/api/media/private'));assertions++;}

  await pdf(first,false,undefined,'Awaiting payment verification');
  const tracked=await call('track-registration','POST',{registrationNumber:registered.data.registrationNumber,trackingCode:registered.data.trackingCode});equal(tracked.status,200);
  equal((await call('receipt','POST',first)).status,409);
  equal((await call('registration-confirmation','POST',first)).status,409);
  equal((await call('order','POST',first)).status,409);
  let row=await db.collection('requests').findOne({_id:first.id});
  const review={id:first.id,action:'verify',expectedRevision:row.data.manualProofRevision};
  equal((await call('manual-payment-review','POST',review)).status,403);
  equal((await call('manual-payment-review','POST',review,staff.cookie)).status,403);
  equal((await call('manual-payment-review','POST',{...review,expectedRevision:'stale'},owner.cookie)).status,409);
  equal((await call('manual-payment-review','POST',{...review,action:'reject'},owner.cookie)).status,400);
  equal((await call('manual-payment-review','POST',{...review,action:'reject',note:'Please send a clearer screenshot'},owner.cookie)).status,200);
  equal((await call('registration-status','POST',first)).data.paymentStatus,'manual_rejected');
  await pdf({id:first.id},false,tracked.cookie,'Please send a clearer screenshot');
  equal((await call('manual-proof','POST',{...first,token:'wrong'})).status,404);
  const screenshot=await upload('',false,tracked.cookie);equal(screenshot.status,200);
  equal((await fetch(origin+screenshot.data.url)).status,403);
  const stolen=entry({manualProof:{screenshot:screenshot.data.url}});
  equal((await call('register','POST',stolen)).status,400);
  equal((await call('manual-proof','POST',{id:first.id,manualProof:{screenshot:screenshot.data.url}},tracked.cookie)).status,200);
  equal((await call('manual-payment-review','POST',review,owner.cookie)).status,409);
  row=await db.collection('requests').findOne({_id:first.id});
  equal(row.data.manualHistory.length,1);
  const currentReview={...review,expectedRevision:row.data.manualProofRevision};
  const reviews=await Promise.all([call('manual-payment-review','POST',currentReview,owner.cookie),call('manual-payment-review','POST',currentReview,owner.cookie)]);
  assert(reviews.every(r=>[200,409].includes(r.status)));assertions++;
  equal((await call('registration-status','POST',first)).data.paymentStatus,'paid');
  await pdf({id:first.id},true,tracked.cookie,'Payment Receipt');
  const receipt=await call('receipt','POST',first);equal(receipt.status,200);equal(receipt.data.amount,50000);equal(receipt.data.paymentMethod,'UPI QR · verified by club');
  equal(receipt.data.number,'PPC-manual_'+first.id);
  equal((await call('receipt','POST',{...first,token:'wrong'})).status,404);
  equal((await call('manual-proof','POST',first)).status,409);
  equal((await fetch(origin+screenshot.data.url,{headers:{Cookie:owner.cookie}})).status,200);
  equal((await fetch(origin+screenshot.data.url,{headers:{Cookie:staff.cookie}})).status,403);
  equal((await fetch(origin+'/api/staff/download?'+new URLSearchParams({id:first.id,field:'manualProof'}),{headers:{Cookie:staff.cookie}})).status,404);
  const staffRows=await call('staff/registrations','GET',undefined,staff.cookie);
  assert(!JSON.stringify(staffRows.data).includes(screenshot.data.url));assertions++;
  const screenshotOnly=entry();const another=await upload(screenshotOnly.token);
  screenshotOnly.manualProof={screenshot:another.data.url};equal((await call('register','POST',screenshotOnly)).status,200);
  const team=entry({kind:'team',team:[{name:'A',age:12,belt:'Green'},{name:'B',age:13,belt:'Blue'}],manualProof:{transactionId:'TEAM123456'}});
  equal((await call('register','POST',team)).data.amount,100000);
  const allFree=entry({target:'all-modes',registrationChoice:'free'});equal((await call('register','POST',allFree)).data.amount,0);
  const allPaid=entry({target:'all-modes',registrationChoice:'paid'});equal((await call('register','POST',allPaid)).data.amount,50000);
  const allManual=entry({target:'all-modes',manualProof:{transactionId:'ALL123456'}});equal((await call('register','POST',allManual)).data.amount,50000);
  equal((await call('requests','PUT',{id:first.id,status:'approved',notes:'no access'},staff.cookie)).status,403);
  equal((await call('content','PUT',{key:'gallery',value:[]},owner.cookie,{Origin:'https://untrusted.example'})).status,403);
  equal((await call('content','PUT',{key:'tournaments',value:[{...event,id:'disabled-event',registrationMode:'disabled'}]},owner.cookie)).status,200);
  equal((await call('register','POST',entry({target:'disabled-event',manualProof:{transactionId:'DISABLED123'}}))).status,400);
  equal((await call('content','PUT',{key:'tournaments',value:[{...event,id:'expired-event',registrationMode:'free',deadline:'2000-01-01'}]},owner.cookie)).status,200);
  equal((await call('register','POST',entry({target:'expired-event',registrationChoice:'free'}))).status,400);
  equal((await call('content','PUT',{key:'forms',value:[{id:'select-form',fields:[{id:'belt',label:'Belt',type:'select',required:true,options:'Green,Blue'}]}]},owner.cookie)).status,200);
  equal((await call('content','PUT',{key:'tournaments',value:[{...event,id:'select-event',formId:'select-form',registrationMode:'free'}]},owner.cookie)).status,200);
  equal((await call('register','POST',entry({target:'select-event',registrationChoice:'free',answers:{belt:'unknown'}}))).status,400);
  equal((await call('register','POST',entry({target:'select-event',registrationChoice:'free',answers:{belt:'Blue'}}))).status,200);
  const oversized=await fetch(origin+'/api/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({message:'x'.repeat(300000)})});equal(oversized.status,413);
  const wrongType=new FormData();wrongType.set('registrationToken',randomUUID());wrongType.set('file',new Blob(['<script>alert(1)</script>'],{type:'image/png'}),'fake.png');equal((await call('upload','POST',wrongType)).status,400);
  const webhook=JSON.stringify({event:'payment.captured',payload:{payment:{entity:{id:'pay_fixture_webhook',order_id:'order_fixture_webhook',amount:50000,currency:'INR'}}}});
  await db.collection('requests').updateOne({_id:allPaid.id},{$set:{order_id:'order_fixture_webhook'}});
  async function sendWebhook(body,signature){const r=await fetch(origin+'/api/webhook',{method:'POST',headers:{'Content-Type':'application/json','x-razorpay-signature':signature},body});return r.status}
  equal(await sendWebhook(webhook,'bad'),403);
  const signature=createHmac('sha256',process.env.RAZORPAY_WEBHOOK_SECRET).update(webhook).digest('hex');
  equal(await sendWebhook(webhook,signature),200);equal(await sendWebhook(webhook,signature),200);
  equal((await call('receipt','POST',allPaid)).data.paymentId,'pay_fixture_webhook');
  for(const route of ['/','/tournaments','/gallery','/training','/achievements','/about','/masters','/contact','/admin','/staff','/privacy','/terms','/refund']){
    const page=await fetch(origin+route);equal(page.status,200,route);equal(page.headers.get('x-content-type-options'),'nosniff');
  }
  // Password reset invalidates previous staff sessions.
  equal((await call('auth/accounts','PUT',{role:'staff',username:'staff-test',password:'replacement staff password'},owner.cookie)).status,200);
  equal((await call('staff/registrations','GET',undefined,staff.cookie)).status,403);
  console.log(`UPI and security regression passed — ${assertions} assertions. No live bank transfer or Razorpay checkout was performed.`);
}finally{await mongo.close()}
