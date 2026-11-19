import assert from 'node:assert/strict';
import { MongoClient } from 'mongodb';
import { randomUUID, createHmac } from 'node:crypto';
import { PDFDocument } from 'pdf-lib';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { mkdir, writeFile } from 'node:fs/promises';

const origin=process.env.PPC_TEST_URL||'http://localhost:3010';
if(!['localhost','127.0.0.1'].includes(new URL(origin).hostname)||!process.env.MONGODB_DATABASE?.startsWith('ppc_test_'))throw Error('Disposable loopback test database required.');
const client=new MongoClient(process.env.MONGODB_URI),db=client.db(process.env.MONGODB_DATABASE);
async function call(path,body,cookie,method='POST',ip='203.0.113.50'){
  const r=await fetch(origin+'/api/'+path,{method,headers:{'Content-Type':'application/json','x-ppc-test-ip':ip,...(cookie?{Cookie:cookie}:{})},...(body!==undefined?{body:JSON.stringify(body)}:{})});
  return {status:r.status,data:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]};
}
const entry=(extra={})=>({id:randomUUID(),token:randomUUID(),kind:'tournament',target:'tracking-free',registrationChoice:'free',name:'Tracking fixture',email:'fictional@example.invalid',phone:'9999999999',consent:true,...extra});
const document=async(auth,receipt=false,cookie)=>fetch(origin+'/api/registration-document',{method:'POST',headers:{'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},body:JSON.stringify({...auth,document:receipt?'receipt':'acknowledgement'})});
async function pdfText(bytes){const pdf=await getDocument({data:new Uint8Array(bytes),useSystemFonts:true}).promise;let result='';for(let i=1;i<=pdf.numPages;i++)result+=(await (await pdf.getPage(i)).getTextContent()).items.map(item=>item.str).join(' ')+'\n';return result;}
try{
  const owner=await call('auth/login',{role:'admin',username:process.env.PPC_BOOTSTRAP_ADMIN_ID,password:process.env.PPC_BOOTSTRAP_ADMIN_PASSWORD});assert.equal(owner.status,200);
  const event={id:'tracking-free',title:'Tracking and acknowledgement tournament',status:'open',deadline:'2099-12-31',fee:0,registrationMode:'free',capacity:5000,formId:'tracking-form',registrationPrefix:'PPC',registrationSuffix:''};
  const form={id:'tracking-form',title:'Details',fields:[{id:'visible',label:'Training experience',type:'text',showOnReceipt:true},{id:'hidden',label:'Hidden answer',type:'text',showOnReceipt:false},{id:'identity',label:'Aadhaar number',type:'text'}]};
  assert.equal((await call('content',{key:'forms',value:[form]},owner.cookie,'PUT')).status,200);
  assert.equal((await call('content',{key:'tournaments',value:[event]},owner.cookie,'PUT')).status,200);
  const same=entry({answers:{visible:'Three years',hidden:'Must stay hidden',identity:'never show this'}});
  const race=await Promise.all(Array.from({length:10},()=>call('register',same)));
  race.forEach(result=>assert.equal(result.status,200,JSON.stringify(result.data)));
  assert.equal(new Set(race.map(r=>r.data.registrationNumber)).size,1);assert.equal(new Set(race.map(r=>r.data.trackingCode)).size,1);
  assert.equal(await db.collection('requests').countDocuments({_id:same.id}),1);
  const first=race[0].data;assert.match(first.registrationNumber,/^PPC-\d{6,}$/);assert.match(first.trackingCode,/^(?=.*[A-Z])(?=.*\d)[A-Z0-9]{6}$/);
  const trial=entry({kind:'trial',target:''});const trialResult=await call('register',trial);assert.equal(trialResult.status,200);assert.ok(trialResult.data.registrationNumber);assert.ok(trialResult.data.trackingCode);assert.equal(trialResult.data.serial,undefined);assert.equal((await document(trial)).status,200);
  const parallel=Array.from({length:25},()=>entry());const results=await Promise.all(parallel.map(record=>call('register',record)));
  results.forEach(result=>assert.equal(result.status,200,JSON.stringify(result.data)));assert.equal(new Set(results.map(r=>r.data.registrationNumber)).size,25);assert.equal(new Set(results.map(r=>r.data.trackingCode)).size,25);
  const changed={...event,registrationPrefix:'PPC26',registrationSuffix:'-B'};assert.equal((await call('content',{key:'tournaments',value:[changed]},owner.cookie,'PUT')).status,200);
  const after=await call('register',entry());assert.match(after.data.registrationNumber,/^PPC26-\d{6,}-B$/);
  const originalRetry=await call('register',same);assert.equal(originalRetry.data.registrationNumber,first.registrationNumber);assert.equal(originalRetry.data.trackingCode,first.trackingCode);
  const tracked=await call('track-registration',{registrationNumber:' '+first.registrationNumber.toLowerCase()+' ',trackingCode:' '+first.trackingCode.toLowerCase()+' '});assert.equal(tracked.status,200);
  assert.ok(tracked.cookie);assert.equal(tracked.data.id,same.id);assert.equal(tracked.data.token,undefined);
  const state=await call('registration-status',{id:same.id},tracked.cookie);assert.equal(state.status,200);assert.equal(state.data.name,same.name);assert.deepEqual(state.data.fields,[{label:'Training experience',value:'Three years'}]);assert.equal(state.data.notes,undefined);
  assert.equal((await call('registration-status',{id:parallel[0].id},tracked.cookie)).status,404);
  assert.equal((await document({id:parallel[0].id},false,tracked.cookie)).status,404);
  assert.equal((await document({id:same.id})).status,404);
  assert.equal((await document({id:same.id},true,tracked.cookie)).status,409);
  const ack=await document({id:same.id},false,tracked.cookie);assert.equal(ack.status,200);assert.equal(ack.headers.get('content-type'),'application/pdf');assert.match(ack.headers.get('content-disposition'),/attachment/);
  const bytes=new Uint8Array(await ack.arrayBuffer());assert.equal(Buffer.from(bytes).subarray(0,5).toString(),'%PDF-');assert.ok((await PDFDocument.load(bytes)).getPageCount()>=1);
  const ackText=await pdfText(bytes);assert.match(ackText,/Three years/);assert.ok(!ackText.includes('Must stay hidden'));assert.ok(!ackText.includes('never show this'));assert.ok(!ackText.includes('Aadhaar'));assert.ok(ackText.includes(first.trackingCode));
  await mkdir('outputs/registration-tests',{recursive:true});await writeFile('outputs/registration-tests/acknowledgement.pdf',bytes);
  // Stored verification material must never appear in portal/public responses.
  const listing=await call('requests',undefined,owner.cookie,'GET');assert.equal(listing.status,200);
  const stored=await db.collection('requests').findOne({_id:same.id});assert.ok(stored.tracking.digest);assert.ok(stored.tracking.ciphertext);assert.equal(stored.tracking.code,undefined);
  assert.ok(!JSON.stringify(listing.data).includes(stored.tracking.digest));assert.ok(!JSON.stringify(listing.data).includes(stored.tracking.ciphertext));assert.ok(!JSON.stringify(listing.data).includes(first.trackingCode));
  const staffDetails={role:'staff',username:'tracking-staff',password:'fictional tracking staff password'};
  assert.equal((await call('auth/accounts',staffDetails,owner.cookie)).status,200);const staff=await call('auth/login',staffDetails);assert.equal(staff.status,200);
  const staffListing=await call('staff/registrations',undefined,staff.cookie,'GET');assert.equal(staffListing.status,200);assert.ok(!JSON.stringify(staffListing.data).includes(stored.tracking.digest));assert.ok(!JSON.stringify(staffListing.data).includes(first.trackingCode));
  assert.equal((await document({id:same.id},false,staff.cookie)).status,404);
  // Legacy token recovery creates exactly one reusable code and preserves references.
  const legacy=entry({target:event.id});await db.collection('requests').insertOne({_id:legacy.id,...legacy,data:{registrationNumber:'OLD-KEEP-42',paymentMethod:'free',receiptTitle:event.title},status:'new',notes:'PRIVATE NOTE',amount:0,payment_status:'not_required',created:new Date().toISOString()});
  const recovery=await Promise.all(Array.from({length:8},()=>call('registration-status',legacy)));recovery.forEach(r=>assert.equal(r.status,200));assert.equal(new Set(recovery.map(r=>r.data.trackingCode)).size,1);assert.equal(recovery[0].data.registrationNumber,'OLD-KEEP-42');
  const oldTrack=await call('track-registration',{registrationNumber:'OLD-KEEP-42',trackingCode:recovery[0].data.trackingCode});assert.equal(oldTrack.status,200);
  // Fifty long team names paginate into an actual PDF without altering visibility settings.
  const team=entry({kind:'team',team:Array.from({length:50},(_,i)=>({name:'Participant '+i+' '+'Very long name '.repeat(6),age:12,belt:'Green'}))});
  const teamResult=await call('register',team);assert.equal(teamResult.status,200,JSON.stringify(teamResult.data));const teamPdf=await document(team);assert.equal(teamPdf.status,200);const teamBytes=new Uint8Array(await teamPdf.arrayBuffer());assert.ok((await PDFDocument.load(teamBytes)).getPageCount()>=3);await writeFile('outputs/registration-tests/team-acknowledgement.pdf',teamBytes);
  assert.match(await pdfText(teamBytes),/Participant 49/);
  // Payment receipt gating remains tied to capture / administrator verification.
  await db.collection('requests').updateOne({_id:same.id},{$set:{amount:50000,payment_status:'paid',payment_id:'pay_tracking_fixture','data.paymentMethod':'razorpay','data.paymentConfirmedAt':new Date().toISOString()}});
  const receipt=await document({id:same.id},true,tracked.cookie);assert.equal(receipt.status,200);assert.ok((await PDFDocument.load(await receipt.arrayBuffer())).getPageCount()>=1);
  // Expired scoped cookies cannot read a registration.
  const payload=Buffer.from(JSON.stringify({id:same.id,exp:Date.now()-1000})).toString('base64url');const signature=createHmac('sha256',process.env.PPC_SESSION_SECRET).update(payload).digest('hex');assert.equal((await call('registration-status',{id:same.id},'ppc_tracking='+payload+'.'+signature)).status,404);
  // Wrong code and nonexistent number have the same response. Attempts share the number bucket across IPs.
  await db.collection('tracking_limits').deleteMany({});
  const wrong=await call('track-registration',{registrationNumber:first.registrationNumber,trackingCode:'X1X1X1'},undefined,'POST','198.51.100.1');const unknown=await call('track-registration',{registrationNumber:'NO-SUCH-REG',trackingCode:'X1X1X1'},undefined,'POST','198.51.100.2');assert.deepEqual(wrong.data,unknown.data);assert.equal(wrong.status,404);
  for(let i=0;i<9;i++)assert.equal((await call('track-registration',{registrationNumber:first.registrationNumber,trackingCode:'X1X1X1'},undefined,'POST','192.0.2.'+(i+1))).status,404);
  assert.equal((await call('track-registration',{registrationNumber:first.registrationNumber,trackingCode:first.trackingCode},undefined,'POST','192.0.2.99')).status,429);
  await db.collection('tracking_limits').deleteMany({});
  // Separate event left available for browser tests, with no extra required form fields.
  await call('content',{key:'tournaments',value:[{...event,id:'browser-registration',formId:'',title:'Browser registration test',registrationPrefix:'PPC'}]},owner.cookie,'PUT');
  console.log('Tracking HTTP integration passed: concurrent/idempotent registration, prefix changes, scoped recovery, rate limits, secret redaction, legacy assignment, free/team/verified PDF download and cross-record document isolation.');
}finally{await client.close();}
