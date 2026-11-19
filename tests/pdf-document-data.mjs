import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { MongoClient } from 'mongodb';
import { mkdir,readFile,writeFile } from 'node:fs/promises';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { renderPdfPage } from './pdf-rendering.mjs';

const origin=process.env.PPC_TEST_URL||'http://localhost:3010';
if(!['127.0.0.1','localhost'].includes(new URL(origin).hostname)||!process.env.MONGODB_DATABASE?.startsWith('ppc_test_'))throw Error('Disposable local test database required.');
const client=new MongoClient(process.env.MONGODB_URI),db=client.db(process.env.MONGODB_DATABASE);
async function api(path,body,cookie,method='POST'){
  const r=await fetch(origin+'/api/'+path,{method,headers:{...(body instanceof FormData?{}:{'Content-Type':'application/json'}),...(cookie?{Cookie:cookie}:{})},...(body!==undefined?{body:body instanceof FormData?body:JSON.stringify(body)}:{})});
  const data=await r.json();assert.equal(r.status,200,JSON.stringify(data));return {data,cookie:r.headers.get('set-cookie')?.split(';')[0]};
}
let owner,original;
await mkdir('outputs/pdf-layout',{recursive:true});
try{
  owner=await api('auth/login',{role:'admin',username:process.env.PPC_BOOTSTRAP_ADMIN_ID,password:process.env.PPC_BOOTSTRAP_ADMIN_PASSWORD});
  original=(await api('content',undefined,undefined,'GET')).data;
  const form={id:'pdf-layout-fields',title:'Configured registration form',fields:[
    {id:'2',label:'Stored first field',type:'text'},
    {id:'1',label:'Zero value',type:'number'},
    {id:'boolean',label:'Boolean answer',type:'text'},
    {id:'multiline',label:'Multiline answer',type:'text'},
    {id:'empty',label:'Empty optional field',type:'text'},
    {id:'file',label:'Permitted document',type:'file',showOnReceipt:true},
    {id:'hidden',label:'Hidden private answer',type:'text',showOnReceipt:false},
    {id:'aadhaar',label:'Aadhaar details',type:'text'},
    {id:'token',label:'Internal credential',type:'text'},
  ]};
  const event={id:'pdf-layout-event',title:'Original tournament snapshot',status:'open',registrationMode:'free',fee:0,formId:form.id,capacity:100,receiptNote:'Configured note line one.\nConfigured note line two.'};
  await api('content',{key:'forms',value:[...original.forms,form]},owner.cookie,'PUT');
  await api('content',{key:'tournaments',value:[...original.tournaments,event]},owner.cookie,'PUT');
  const entry={id:randomUUID(),token:randomUUID(),kind:'tournament',target:event.id,registrationChoice:'free',name:'தமிழ் மாணவர் / PDF layout fixture',email:'pdf@example.invalid',phone:'9999999999',consent:true};
  const upload=new FormData();upload.set('file',new Blob([await readFile('public/power-punch-logo.webp')]),'document.webp');upload.set('registrationToken',entry.token);
  const uploaded=(await api('upload',upload)).data;
  const registered=(await api('register',{...entry,answers:{token:'NEVER-IN-PDF-TOKEN',aadhaar:'NEVER-IN-PDF-AADHAAR',hidden:'NEVER-IN-PDF-HIDDEN',file:uploaded.url,empty:'  ',multiline:'First submitted line\nSecond submitted line\nதமிழில் பதில்','1':0,'2':'Original submitted value'}})).data;
  // Legacy records may store real boolean answers. Keep them meaningful in PDF.
  await db.collection('requests').updateOne({_id:entry.id},{$set:{'data.answers.boolean':false,notes:'NEVER-IN-PDF-ADMIN-NOTES'}});
  const stored=await db.collection('requests').findOne({_id:entry.id});assert.deepEqual(stored.data.receiptFieldOrder,form.fields.map(field=>field.id));
  // Later administrator edits must not relabel or reorder submitted answers.
  await api('content',{key:'forms',value:[...original.forms,{...form,fields:[...form.fields].reverse().map(field=>({...field,label:'MODIFIED-LABEL-'+field.id,showOnReceipt:false}))}]},owner.cookie,'PUT');
  await api('content',{key:'tournaments',value:[...original.tournaments,{...event,title:'MODIFIED-TOURNAMENT-TITLE'}]},owner.cookie,'PUT');
  const scenarios=[
    {name:'actual-confirmation',payment_status:'not_required',payment_id:null,amount:0,data:{paymentMethod:'free'},title:'Registration Confirmation',status:'No payment required'},
    {name:'actual-upi-pending',payment_status:'manual_pending',payment_id:null,amount:75000,data:{paymentMethod:'manual',manualProof:{transactionId:'UTR-LAYOUT-123456',screenshot:uploaded.url}},title:'Registration Acknowledgement',status:'Awaiting payment verification'},
    {name:'actual-upi-rejected',payment_status:'manual_rejected',payment_id:null,amount:75000,data:{paymentMethod:'manual',manualReviewNote:'Please correct the transaction reference.'},title:'Registration Acknowledgement',status:'Payment proof needs correction'},
    {name:'actual-upi-receipt',payment_status:'paid',payment_id:'manual_'+entry.id,amount:75000,data:{paymentMethod:'manual',paymentConfirmedAt:'2026-11-19T04:45:00.000Z'},receipt:true,title:'Payment Receipt',status:'Payment verified'},
    {name:'actual-razorpay-receipt',payment_status:'paid',payment_id:'pay_layout_capture_fixture',amount:75000,data:{paymentMethod:'razorpay',paymentConfirmedAt:'2026-11-19T04:45:00.000Z'},receipt:true,title:'Payment Receipt',status:'Payment verified'},
    {name:'actual-unverified-paid-flag',payment_status:'paid',payment_id:null,amount:75000,data:{paymentMethod:'manual'},title:'Registration Acknowledgement',status:'Awaiting payment verification'},
  ];
  for(const scenario of scenarios){
    const changes={payment_status:scenario.payment_status,payment_id:scenario.payment_id,amount:scenario.amount,...Object.fromEntries(Object.entries(scenario.data).map(([key,value])=>['data.'+key,value]))};
    await db.collection('requests').updateOne({_id:entry.id},{$set:changes});
    const response=await fetch(origin+'/api/registration-document',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...entry,document:scenario.receipt?'receipt':'acknowledgement'})});assert.equal(response.status,200);
    const bytes=new Uint8Array(await response.arrayBuffer());await writeFile(`outputs/pdf-layout/${scenario.name}.pdf`,bytes);
    const task=getDocument({data:new Uint8Array(bytes),useSystemFonts:false}),pdf=await task.promise;let text='';
    let pages=0;
    try{pages=pdf.numPages;for(let i=1;i<=pdf.numPages;i++){
      const pageText=(await (await pdf.getPage(i)).getTextContent()).items.map(item=>item.str).join(' ');text+=pageText+'\n';
      if(pageText.includes('Private tracking details'))assert.ok(pageText.includes(registered.trackingCode)&&pageText.includes('How to track'),'Short private tracking section stays together');
      if(pageText.includes('Payment details'))assert.ok(pageText.includes(scenario.status),'Short payment section stays together');
    }}finally{await task.destroy();}
    assert.ok(text.includes(scenario.title)&&text.includes(scenario.status),scenario.name);
    assert.ok(text.includes('Original tournament snapshot'));assert.ok(!text.includes('MODIFIED-'));
    assert.ok(text.includes('Stored first field')&&text.includes('Zero value')&&text.includes('Boolean answer'));
    assert.ok(text.indexOf('Stored first field')<text.indexOf('Zero value')&&text.indexOf('Zero value')<text.indexOf('Boolean answer'),'Snapshot form ordering, including numeric IDs');
    assert.ok(/Zero value\s+0/.test(text)&&/Boolean answer\s+false/.test(text),'Zero and false preserved');
    assert.ok(text.includes('First submitted line')&&text.includes('Second submitted line')&&text.includes('Document submitted'));
    assert.ok(!text.includes('Empty optional field')&&!text.includes('/api/media/')&&!text.includes('NEVER-IN-PDF')&&!text.includes('Aadhaar'));
    assert.ok(text.includes(registered.trackingCode)&&text.includes('Configured note line one.'));
    if(scenario.payment_status==='manual_rejected')assert.ok(text.includes('Please correct the transaction reference.'));
    if(scenario.receipt)assert.ok(text.includes('Payment receipt number')&&text.includes('Confirmed at'));
    else assert.ok(!text.includes('Payment receipt number')&&!text.includes('Payment verified'));
    for(let i=1;i<=pages;i++)await renderPdfPage(bytes,`outputs/pdf-layout/${scenario.name}-page-${i}.png`,i);
  }
  const denied=await fetch(origin+'/api/registration-document',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...entry,document:'receipt'})});assert.equal(denied.status,409,'Paid flag without verified payment reference cannot yield a receipt');
  await db.collection('requests').updateOne({_id:entry.id},{$unset:{'data.receiptFields':'','data.receiptFieldOrder':''}});
  const fallback=await api('registration-status',entry);assert.deepEqual(fallback.data.fields,[],'Legacy current-form fallback respects all live visibility settings');
  console.log('Actual PDF download data checks passed: saved form labels/order, snapshot edits, zero/false, multiline/empty/upload fields, secrets excluded, free/pending/rejected/UPI/Razorpay states and receipt gating.');
}finally{
  if(owner&&original){await api('content',{key:'forms',value:original.forms},owner.cookie,'PUT');await api('content',{key:'tournaments',value:original.tournaments},owner.cookie,'PUT');}
  await client.close();
}
