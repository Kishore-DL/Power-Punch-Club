import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {MongoClient} from 'mongodb';
import {chromium,expect} from '@playwright/test';
import {registrationEmail} from '../lib/notification-layout.mjs';
import {selectedHeroPhoto} from '../lib/hero-photo.mjs';

const origin=process.env.PPC_TEST_URL;
if(!origin||new URL(origin).hostname!=='localhost'||!process.env.MONGODB_DATABASE?.startsWith('ppc_test_')||process.env.BREVO_API_KEY||process.env.RAZORPAY_KEY_SECRET)throw Error('Use the isolated local test runner with live email/payments disabled.');
const mongo=new MongoClient(process.env.MONGODB_URI),db=mongo.db(process.env.MONGODB_DATABASE),browser=await chromium.launch({headless:true});
const output='outputs/submission-tests';await mkdir(output,{recursive:true});
async function api(path,body,cookie,method=body?'POST':'GET'){
  const r=await fetch(origin+'/api/'+path,{method,headers:{...(body instanceof FormData?{}:{'Content-Type':'application/json'}),...(cookie?{Cookie:cookie}:{})},...(body!==undefined?{body:body instanceof FormData?body:JSON.stringify(body)}:{})});
  return {status:r.status,data:await r.json(),cookie:r.headers.getSetCookie().find(value=>value.includes('_session_v2='))?.split(';')[0]};
}
const bytes=await readFile('public/power-punch-logo.webp');
async function upload(cookie,token){const form=new FormData();form.set('file',new Blob([bytes],{type:'image/webp'}),'fixture.webp');form.set('scope',token?'private':'public');if(token){form.set('registrationToken',token);form.set('purpose','payment-proof');}const result=await api('upload',form,cookie);assert.equal(result.status,200);return result.data.url;}
const entry=extra=>({id:randomUUID(),token:randomUUID(),kind:'tournament',target:'submission-ui',registrationChoice:'manual',name:'Proof preview fixture',email:'preview@example.invalid',phone:'9999999999',consent:true,...extra});
let owner,original;
try{
  owner=await api('auth/login',{role:'admin',username:process.env.PPC_BOOTSTRAP_ADMIN_ID,password:process.env.PPC_BOOTSTRAP_ADMIN_PASSWORD});assert.equal(owner.status,200);
  original=(await api('content')).data;
  const staffDetails={role:'staff',username:'submission-staff',password:'fictional submission staff password'};
  await api('auth/accounts',staffDetails,owner.cookie,'DELETE');assert.equal((await api('auth/accounts',staffDetails,owner.cookie)).status,200);
  const staff=await api('auth/login',staffDetails),qr=await upload(owner.cookie);
  const event={id:'submission-ui',title:'Submission UI tournament',fee:750,capacity:100,status:'open',deadline:'2099-12-31',registrationMode:'manual',manualQrImage:qr,manualPayee:'Club fixture',manualUpiId:'fixture@example'};
  assert.equal((await api('content',{key:'tournaments',value:[...original.tournaments,event]},owner.cookie,'PUT')).status,200);
  const body=entry(),proof=await upload(undefined,body.token);body.manualProof={transactionId:'UTR-'+randomUUID(),screenshot:proof};
  const saved=await api('register',body);assert.equal(saved.status,200,JSON.stringify(saved.data));
  let row=await db.collection('requests').findOne({_id:body.id});
  const proofPath=()=>'/api/admin/payment-proof?'+new URLSearchParams({id:body.id,revision:row.data.manualProofRevision});
  assert.equal((await fetch(origin+proofPath())).status,403);
  assert.equal((await fetch(origin+proofPath(),{headers:{Cookie:staff.cookie}})).status,403);
  const image=await fetch(origin+proofPath(),{headers:{Cookie:owner.cookie}});assert.equal(image.status,200);assert.equal(image.headers.get('content-type'),'image/webp');assert.match(image.headers.get('content-disposition'),/^inline;/);assert.equal(image.headers.get('cache-control'),'private, no-store');assert.equal(image.headers.get('x-content-type-options'),'nosniff');assert.deepEqual(Buffer.from(await image.arrayBuffer()),bytes);
  const attachment=await fetch(origin+proof,{headers:{Cookie:owner.cookie}});assert.match(attachment.headers.get('content-disposition'),/^attachment/);
  const revision=row.data.manualProofRevision;
  assert.equal((await fetch(origin+'/api/admin/payment-proof?'+new URLSearchParams({id:body.id,revision:'outdated'}),{headers:{Cookie:owner.cookie}})).status,409);
  const unrelated=await upload(undefined,randomUUID());await db.collection('requests').updateOne({_id:body.id},{$set:{'data.manualProof.screenshot':unrelated}});
  assert.equal((await fetch(origin+proofPath(),{headers:{Cookie:owner.cookie}})).status,404,'Registration/file association checked');
  await db.collection('requests').updateOne({_id:body.id},{$set:{'data.manualProof.screenshot':proof}});
  const qrResponse=await fetch(origin+'/api/upi-qr?id='+event.id);assert.equal(qrResponse.status,200);assert.equal(qrResponse.headers.get('content-type'),'image/webp');assert.match(qrResponse.headers.get('content-disposition'),/power-punch-club-upi-qr.webp/);assert.deepEqual(Buffer.from(await qrResponse.arrayBuffer()),bytes);
  assert.equal((await fetch(origin+'/api/upi-qr?id=https://example.invalid/image')).status,404);
  for(const photo of ['',undefined,'/power-punch-banner.webp','/dojo-rose.webp','/karate-cutout.webp?v=2'])assert.equal(selectedHeroPhoto(photo),'');
  assert.equal(selectedHeroPhoto(qr),qr);assert.equal(selectedHeroPhoto('/custom-person.webp'),'/custom-person.webp');
  await api('content',{key:'branding',value:{...original.branding,hero:'/power-punch-banner.webp'}},owner.cookie,'PUT');
  assert.equal((await api('content')).data.branding.hero,'/power-punch-banner.webp');assert.equal((await db.collection('content').findOne({_id:'branding'})).value.hero,'/power-punch-banner.webp','Default is not deleted from stored content');
  const context=await browser.newContext({viewport:{width:1440,height:1000},acceptDownloads:true}),page=await context.newPage(),errors=[];
  page.on('pageerror',error=>errors.push(error.message));await context.addCookies([{name:owner.cookie.split('=')[0],value:owner.cookie.slice(owner.cookie.indexOf('=')+1),url:origin,secure:true,httpOnly:true,sameSite:'Lax'}]);
  // Download MIME/extension and exact bytes for every supported stored image format.
  for(const type of ['image/png','image/jpeg']){
    const pixels=await page.evaluate(async type=>{
      const canvas=document.createElement('canvas');canvas.width=64;canvas.height=64;
      const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,64,64);ctx.fillStyle='#000';ctx.fillRect(12,12,40,40);
      const blob=await new Promise(resolve=>canvas.toBlob(resolve,type));return [...new Uint8Array(await blob.arrayBuffer())];
    },type);
    const form=new FormData();form.set('scope','public');form.set('file',new Blob([new Uint8Array(pixels)],{type}),'qr-fixture.'+(type==='image/png'?'png':'jpg'));
    const uploaded=await api('upload',form,owner.cookie);assert.equal(uploaded.status,200);
    await db.collection('content').updateOne({_id:'tournaments'},{$set:{value:[...original.tournaments,{...event,manualQrImage:uploaded.data.url}]}});
    const image=await fetch(origin+'/api/upi-qr?id='+event.id);assert.equal(image.headers.get('content-type'),type);assert.ok(image.headers.get('content-disposition').endsWith(type==='image/png'?'.png"':'.jpg"'));assert.deepEqual(Buffer.from(await image.arrayBuffer()),Buffer.from(pixels));
  }
  await db.collection('content').updateOne({_id:'tournaments'},{$set:{value:[...original.tournaments,event]}});
  await page.addInitScript(()=>{const original=URL.revokeObjectURL;window.qrRevocations=0;URL.revokeObjectURL=url=>{window.qrRevocations++;original(url)}});
  for(const width of [360,390,768,1440]){
    await page.setViewportSize({width,height:1000});await page.goto(origin+'/');await expect(page.locator('.campaign-art-cutout')).toHaveCount(1);await expect(page.locator('.campaign-art')).toHaveAttribute('src','/karate-cutout.webp?v=2');await expect(page.locator('.campaign-logo')).toBeVisible();await expect(page.locator('.campaign-backdrop')).toBeVisible();await expect(page.locator('.campaign-actions')).toBeVisible();
    await page.locator('.campaign-copy').evaluate(el=>Promise.all(el.getAnimations().map(animation=>animation.finished.catch(()=>{}))));await expect(page.locator('.campaign-copy')).toHaveCSS('opacity','1');
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await page.screenshot({path:output+'/hero-restored-'+width+'.png',fullPage:true,animations:'disabled'});
    await page.goto(origin+'/tournaments/'+event.id);await page.getByRole('button',{name:'Individual & pay',exact:true}).click();
    await expect(page.getByAltText('Club UPI payment QR code')).toBeVisible();await expect.poll(()=>page.getByAltText('Club UPI payment QR code').evaluate(img=>img.complete&&img.naturalWidth>0&&getComputedStyle(img).objectFit==='contain')).toBe(true);
    await page.screenshot({path:output+'/qr-'+width+'.png',fullPage:true});
    const downloadEvent=page.waitForEvent('download');await page.getByRole('button',{name:'Download QR',exact:true}).click();const download=await downloadEvent;assert.equal(download.suggestedFilename(),'power-punch-club-upi-qr.webp');const path=output+'/download-'+width+'.webp';await download.saveAs(path);assert.deepEqual(await readFile(path),bytes);
    await page.getByRole('status').filter({hasText:'QR image download started'}).waitFor();await expect.poll(()=>page.evaluate(()=>window.qrRevocations)).toBeGreaterThan(0);
  }
  await page.route('**/api/upi-qr?*',async route=>{await new Promise(resolve=>setTimeout(resolve,300));await route.fulfill({status:503,contentType:'application/json',body:'{}'})});
  await page.getByRole('button',{name:'Download QR',exact:true}).click();await expect(page.getByRole('button',{name:'Downloading QR...'})).toBeDisabled();await expect(page.getByRole('alert').filter({hasText:'QR image could not be downloaded'})).toBeVisible();await expect(page.getByRole('link',{name:'Open QR image',exact:true})).toBeVisible();await page.unroute('**/api/upi-qr?*');
  const localEvents=(await db.collection('content').findOne({_id:'tournaments'})).value;
  await db.collection('content').updateOne({_id:'tournaments'},{$set:{value:localEvents.map(item=>item.id===event.id?{...item,manualQrImage:''}:item)}});
  await page.goto(origin+'/tournaments/'+event.id);await page.getByRole('button',{name:'Individual & pay',exact:true}).click();await expect(page.getByRole('status').filter({hasText:'No UPI QR image is configured'})).toBeVisible();await expect(page.getByRole('button',{name:'Download QR',exact:true})).toHaveCount(0);
  await db.collection('content').updateOne({_id:'tournaments'},{$set:{value:localEvents}});
  async function review(){await page.goto(origin+'/admin');await page.locator('.admin-shell').waitFor();if(await page.getByRole('button',{name:'Menu',exact:true}).isVisible())await page.getByRole('button',{name:'Menu',exact:true}).click();await page.getByRole('button',{name:/Registrations & enquiries/}).click();await page.getByLabel('Tournament',{exact:true}).selectOption(event.id);await expect(page.getByRole('button',{name:'REVIEW',exact:true})).toHaveCount(1);await page.getByRole('button',{name:'REVIEW',exact:true}).click();await expect(page.locator('.review-participant-name')).toHaveText(body.name);}
  for(const width of [360,390,768,1440]){
    await page.setViewportSize({width,height:1000});await review();await page.getByRole('button',{name:'Enlarge proof',exact:true}).click();
    const viewer=page.getByRole('dialog',{name:'Payment proof',exact:true});await expect(viewer.getByRole('img')).toBeVisible();await expect(viewer.getByRole('status').filter({hasText:'Loading payment proof'})).toHaveCount(0);await expect(viewer.getByText(saved.data.registrationNumber,{exact:true})).toBeVisible();assert.equal(await viewer.locator('.payment-proof-frame').evaluate(el=>el.scrollHeight<=el.clientHeight+1),true,'Full proof fits before zoom');
    await viewer.getByRole('button',{name:'Close payment proof',exact:true}).focus();await page.keyboard.press('Shift+Tab');assert.equal(await viewer.evaluate(el=>el.contains(document.activeElement)),true);
    const previousScale=Number((await viewer.locator('output').innerText()).replace('%',''));await viewer.getByRole('button',{name:'Zoom in',exact:true}).click();await expect.poll(async()=>Number((await viewer.locator('output').innerText()).replace('%',''))).toBeGreaterThan(previousScale);await viewer.getByRole('button',{name:'Fit image',exact:true}).click();
    await page.screenshot({path:output+'/proof-'+width+'.png',fullPage:true});await page.keyboard.press('Escape');await expect(viewer).toHaveCount(0);await expect(page.getByRole('dialog',{name:'Registration review',exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Enlarge proof',exact:true})).toBeFocused();
  }
  await page.route('**/api/admin/payment-proof?*',async route=>{await new Promise(resolve=>setTimeout(resolve,300));await route.fulfill({status:404,contentType:'application/json',body:JSON.stringify({error:'The configured image is unavailable.'})})});
  await page.getByRole('button',{name:'Enlarge proof',exact:true}).click();await expect(page.getByRole('status').filter({hasText:'Loading payment proof'})).toBeVisible();await expect(page.getByRole('alert').filter({hasText:'configured image is unavailable'})).toBeVisible();await page.getByRole('button',{name:'Close payment proof',exact:true}).click();await page.unroute('**/api/admin/payment-proof?*');
  // An old review cannot preview a replaced proof, even when its original URL exists.
  await db.collection('requests').updateOne({_id:body.id},{$set:{'data.manualProofRevision':randomUUID()}});
  assert.equal((await fetch(origin+'/api/admin/payment-proof?'+new URLSearchParams({id:body.id,revision}),{headers:{Cookie:owner.cookie}})).status,409);
  await db.collection('requests').updateOne({_id:body.id},{$set:{'data.manualProofRevision':revision}});
  await page.getByRole('button',{name:'Close request review',exact:true}).click();
  if(await page.getByRole('button',{name:'Menu',exact:true}).isVisible())await page.getByRole('button',{name:'Menu',exact:true}).click();await page.getByRole('button',{name:'Brand & homepage',exact:true}).click();
  await expect(page.locator('.hero-backdrop-preview')).toHaveCount(0);
  const heroLabel=page.locator('.editor-grid>label').filter({hasText:'Hero foreground photo'}).first();await heroLabel.locator('input[type=file]').setInputFiles('public/power-punch-logo.webp');await expect(page.getByRole('button',{name:'SAVE CHANGES',exact:false})).toBeEnabled();await page.getByRole('button',{name:'SAVE CHANGES',exact:false}).click();await page.getByText('Changes published to the website.',{exact:true}).waitFor();
  const custom=(await api('content')).data.branding;assert.match(custom.hero,/^\/api\/media\/public/);assert.equal(custom.logo,original.branding.logo);assert.equal(custom.heroBackdrop,original.branding.heroBackdrop);
  await page.goto(origin+'/');await expect(page.locator('.campaign-art')).toHaveAttribute('src',custom.hero);await page.reload();await expect(page.locator('.campaign-art')).toHaveAttribute('src',custom.hero);
  await page.goto(origin+'/admin');await page.locator('.admin-shell').waitFor();if(await page.getByRole('button',{name:'Menu',exact:true}).isVisible())await page.getByRole('button',{name:'Menu',exact:true}).click();await page.getByRole('button',{name:'Brand & homepage',exact:true}).click();await page.getByRole('button',{name:'Remove foreground photo',exact:true}).click();await page.getByRole('button',{name:'SAVE CHANGES',exact:false}).click();await page.getByText('Changes published to the website.',{exact:true}).waitFor();
  await page.goto(origin+'/');await page.reload();await expect(page.locator('.campaign-art-cutout')).toHaveCount(1);await expect(page.locator('.campaign-art')).toHaveAttribute('src','/karate-cutout.webp?v=2');assert.equal((await api('content')).data.branding.hero,'');
  const email=registrationEmail('registration-created',{...row,name:'<script>alert("unsafe")</script> & Tamil தமிழ்',created:'2026-11-23T00:00:00Z',notes:'PRIVATE-NOTES',data:{...row.data,answers:{aadhaar:'PRIVATE-AADHAAR'},trackingCode:'PRIVATE-CODE'}},undefined,{origin:'https://club.example.invalid',logo:'/api/media/public%2F'+randomUUID()});
  assert.ok(email.html.includes('&lt;script&gt;'));assert.ok(!email.html.includes('<script>'));assert.match(email.body,/IST/);assert.match(email.body,/Awaiting Admin Verification/);for(const secret of ['PRIVATE-NOTES','PRIVATE-AADHAAR','PRIVATE-CODE',body.token,proof])assert.ok(!email.html.includes(secret)&&!email.body.includes(secret));
  assert.ok(!registrationEmail('registration-created',row,undefined,{origin:'javascript:alert(1)',logo:'http://insecure.invalid/logo.png'}).html.includes('<img'));
  await writeFile(output+'/admin-notification.html',email.html);await writeFile(output+'/admin-notification.txt',email.body);await page.route('**/*',route=>route.abort());
  for(const width of [360,390,768,1440]){await page.setViewportSize({width,height:1000});await page.setContent(email.html);assert.equal(await page.locator('script').count(),0);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await page.screenshot({path:output+'/email-'+width+'.png',fullPage:true});}
  assert.deepEqual(errors,[]);await context.close();
  console.log('Submission UI regression passed: original QR bytes/download/absence/failure, Admin-only associated/current inline proof and modal controls, persistent custom/default hero handling, escaped HTML/text email, and 360/390/768/1440px screenshots. No live email/payment requests.');
}finally{
  if(owner&&original){await api('content',{key:'branding',value:original.branding},owner.cookie,'PUT');await api('content',{key:'tournaments',value:original.tournaments},owner.cookie,'PUT');}
  await browser.close();await mongo.close();
}
