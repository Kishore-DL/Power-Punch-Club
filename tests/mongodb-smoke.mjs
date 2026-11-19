import assert from 'node:assert/strict';
import { MongoClient } from 'mongodb';
import { randomUUID } from 'node:crypto';

const origin=process.env.PPC_TEST_URL||'http://127.0.0.1:3000';
if(!['localhost','127.0.0.1'].includes(new URL(origin).hostname)||
   !process.env.MONGODB_URI||!process.env.MONGODB_DATABASE?.startsWith('ppc_test_'))
  throw new Error('Run a loopback server with a disposable ppc_test_ database.');
const bootstrapId=process.env.PPC_BOOTSTRAP_ADMIN_ID;
const bootstrapPassword=process.env.PPC_BOOTSTRAP_ADMIN_PASSWORD;
const mongo=new MongoClient(process.env.MONGODB_URI);
const db=mongo.db(process.env.MONGODB_DATABASE);
async function call(path,method='GET',body,cookie,headers={}){
  const response=await fetch(origin+'/api/'+path,{method,headers:{
    ...(body instanceof FormData?{}:{'Content-Type':'application/json'}),
    ...(cookie?{Cookie:cookie}:{}),...headers,
  },...(body?{body:body instanceof FormData?body:JSON.stringify(body)}:{})});
  return {status:response.status,data:await response.json(),cookie:response.headers.get('set-cookie')?.split(';')[0]};
}
try{
  assert.equal((await call('requests')).status,403);
  assert.equal((await call('requests','GET',undefined,undefined,{'oai-authenticated-user-id':'fake','oai-authenticated-user-email':'fake@example.invalid'})).status,403);
  const owner=await call('auth/login','POST',{role:'admin',username:bootstrapId,password:bootstrapPassword});
  assert.equal(owner.status,200,JSON.stringify(owner.data));
  const staff={role:'staff',username:'staff-test',password:'local staff test password'};
  assert.equal((await call('auth/accounts','POST',staff,owner.cookie)).status,200);
  const staffLogin=await call('auth/login','POST',staff);
  assert.equal(staffLogin.status,200);
  assert.equal((await call('requests','GET',undefined,staffLogin.cookie)).status,403);
  const event={id:'testing-event',title:'MongoDB test tournament',fee:500,capacity:3,status:'open',deadline:'2099-12-31',registrationMode:'both'};
  const eventWithUpload={...event,id:'upload-test',formId:'test-form'};
  const form={id:'test-form',title:'Registration',fields:[{id:'photo',label:'Photo',type:'photo',required:true}]};
  assert.equal((await call('content','PUT',{key:'tournaments',value:[event,eventWithUpload]},owner.cookie)).status,200);
  assert.equal((await call('content','PUT',{key:'forms',value:[form]},owner.cookie)).status,200);
  const entry=(extra={})=>({id:randomUUID(),token:randomUUID(),kind:'tournament',target:event.id,registrationChoice:'free',
    name:'Fictional participant',email:'test@example.invalid',phone:'9999999999',consent:true,...extra});
  for(const [patch,message] of [[{email:'bad address'},/^Enter a valid email/],[{phone:'123'},/^Enter a valid phone/],[{name:'  '},/^Enter a participant/]]){
    const invalid=await call('register','POST',entry(patch));assert.equal(invalid.status,400);assert.match(invalid.data.error,message);
  }
  const normalised=entry({kind:'enquiry',target:'',email:'\u00a0CONTACT+TEST@example.invalid\u00a0'});
  assert.equal((await call('register','POST',normalised)).status,200);
  assert.equal((await db.collection('requests').findOne({_id:normalised.id})).email,'contact+test@example.invalid');
  const team=entry({kind:'team',team:[{name:'First',age:12,belt:'Green'},{name:'Second',age:12,belt:'Green'}]});
  const teamResult=await call('register','POST',team);
  assert.equal(teamResult.status,200,JSON.stringify(teamResult.data));
  assert.equal((await call('register','POST',team)).data.duplicate,true);
  const confirmation=await call('registration-confirmation','POST',team);
  assert.equal(confirmation.status,200);
  assert.equal(confirmation.data.number,teamResult.data.serial);
  assert.equal((await call('registration-confirmation','POST',{...team,token:'incorrect'})).status,404);
  const paid=Array.from({length:8},()=>entry({registrationChoice:'paid'}));
  const competing=await Promise.all(paid.map(record=>call('register','POST',record)));
  assert.equal(competing.filter(r=>r.status===200).length,1,JSON.stringify(competing));
  assert.equal(competing.filter(r=>r.status===409).length,7);
  const winner=paid[competing.findIndex(r=>r.status===200)];
  assert.equal((await call('receipt','POST',winner)).status,409);
  await db.collection('requests').updateOne({_id:winner.id},{$set:{payment_status:'paid',payment_id:'pay_fixture','data.paymentConfirmedAt':new Date().toISOString()}});
  const receipt=await call('receipt','POST',winner);
  assert.equal(receipt.status,200);
  assert.equal(receipt.data.amount,50000);
  assert.equal(receipt.data.paymentId,'pay_fixture');

  const withUpload=entry({target:eventWithUpload.id});
  const photo=await import('node:fs/promises').then(fs=>fs.readFile(new URL('../public/power-punch-logo.webp',import.meta.url)));
  const upload=new FormData();
  upload.set('file',new Blob([photo]),'photo.webp');
  upload.set('registrationToken',withUpload.token);
  const uploaded=await call('upload','POST',upload);
  assert.equal(uploaded.status,200,JSON.stringify(uploaded.data));
  assert.equal((await fetch(origin+uploaded.data.url)).status,403);
  assert.equal((await call('register','POST',{...withUpload,answers:{photo:uploaded.data.url}})).status,200);
  const staffRows=await call('staff/registrations','GET',undefined,staffLogin.cookie);
  assert.equal(staffRows.status,200);
  assert.deepEqual(staffRows.data.find(row=>row.id===withUpload.id).uploads,[{field:'photo',label:'Photo'}]);
  const download=await fetch(origin+'/api/staff/download?'+new URLSearchParams({id:withUpload.id,field:'photo'}),{headers:{Cookie:staffLogin.cookie}});
  assert.equal(download.status,200);
  assert.deepEqual(Buffer.from(await download.arrayBuffer()),photo);
  console.log('MongoDB integration passed: owner/staff auth, concurrent capacity, duplicate submission, receipt, private file upload and authorised download.');
}finally{await mongo.close()}
