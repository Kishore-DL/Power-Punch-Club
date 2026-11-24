import assert from 'node:assert/strict';
import {manualContactFields} from './fixtures/manual-contact-fields.mjs';
import {createHash,randomUUID} from 'node:crypto';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {MongoClient} from 'mongodb';
import {chromium,expect} from '@playwright/test';
import {createCanvas,loadImage} from '@napi-rs/canvas';

const origin=process.env.PPC_TEST_URL;
if(!origin||new URL(origin).hostname!=='localhost'||!/^mongodb:\/\/(127\.0\.0\.1|localhost):/.test(process.env.MONGODB_URI||'')||!process.env.MONGODB_DATABASE?.startsWith('ppc_test_')||process.env.BREVO_API_KEY||process.env.RAZORPAY_KEY_SECRET)throw Error('Use isolated test runner with real providers disabled.');
const mongo=new MongoClient(process.env.MONGODB_URI),db=mongo.db(process.env.MONGODB_DATABASE),browser=await chromium.launch({headless:true});
const out='outputs/proof-image-tests';await mkdir(out,{recursive:true});
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
async function api(path,body,cookie,method=body?'POST':'GET'){
  const response=await fetch(origin+'/api/'+path,{method,headers:{...(body instanceof FormData?{}:{'Content-Type':'application/json'}),...(cookie?{Cookie:cookie}:{})},...(body!==undefined?{body:body instanceof FormData?body:JSON.stringify(body)}:{})});
  return {status:response.status,data:await response.json(),cookie:response.headers.getSetCookie().find(v=>v.includes('_session_v2='))?.split(';')[0]};
}
const cases=[{name:'portrait-9-16',width:900,height:1600,mime:'image/png',ext:'png'},{name:'landscape-16-9',width:1600,height:900,mime:'image/jpeg',ext:'jpg'},{name:'square-1-1',width:900,height:900,mime:'image/webp',ext:'webp'},{name:'very-tall',width:600,height:6000,mime:'image/png',ext:'png'}];
const report=[];let owner,original;
async function geometryAndEdges(image,fixture,path){
  await expect(image).toBeVisible();
  await expect.poll(()=>image.evaluate(img=>Math.abs(img.getBoundingClientRect().width/img.getBoundingClientRect().height-img.naturalWidth/img.naturalHeight)<.002)).toBe(true);
  await expect.poll(()=>image.evaluate(img=>{const r=img.getBoundingClientRect(),f=img.closest('.payment-proof-frame').getBoundingClientRect();return r.left>=f.left-1&&r.top>=f.top-1&&r.right<=f.right+1&&r.bottom<=f.bottom+1})).toBe(true);
  const geometry=await image.evaluate(img=>{const r=img.getBoundingClientRect(),frame=img.closest('.payment-proof-frame'),f=frame.getBoundingClientRect();return {natural:[img.naturalWidth,img.naturalHeight],width:r.width,height:r.height,inside:r.left>=f.left-1&&r.top>=f.top-1&&r.right<=f.right+1&&r.bottom<=f.bottom+1,fit:getComputedStyle(img).objectFit,aspect:getComputedStyle(img).aspectRatio};});
  assert.deepEqual(geometry.natural,[fixture.width,fixture.height]);assert.equal(geometry.inside,true,'All edges fit inside preview');assert.equal(geometry.fit,'contain');assert.equal(geometry.aspect,'auto');
  const screenshot=await image.screenshot({path,animations:'disabled'}),decoded=await loadImage(screenshot),canvas=createCanvas(decoded.width,decoded.height),ctx=canvas.getContext('2d');ctx.drawImage(decoded,0,0);
  const color=(x,y)=>ctx.getImageData(Math.min(decoded.width-1,Math.max(0,x)),Math.min(decoded.height-1,Math.max(0,y)),1,1).data;
  const red=c=>c[0]>c[1]+20&&c[0]>c[2]+20,blue=c=>c[2]>c[0]+20&&c[2]>c[1]+20,green=c=>c[1]>c[0]+20&&c[1]>c[2]+20,yellow=c=>c[0]>c[2]+20&&c[1]>c[2]+20;
  const depth=Math.min(4,Math.max(1,Math.floor(Math.min(decoded.width,decoded.height)/4))),midX=Math.floor(decoded.width/2),midY=Math.floor(decoded.height/2);
  assert.ok(Array.from({length:depth},(_,i)=>color(midX,i)).some(red),'Red TOP edge remains visible');assert.ok(Array.from({length:depth},(_,i)=>color(midX,decoded.height-1-i)).some(blue),'Blue BOTTOM edge remains visible');
  assert.ok(Array.from({length:depth},(_,i)=>color(i,midY)).some(green),'Green LEFT edge remains visible');assert.ok(Array.from({length:depth},(_,i)=>color(decoded.width-1-i,midY)).some(yellow),'Yellow RIGHT edge remains visible');
  return geometry;
}
try{
  owner=await api('auth/login',{role:'admin',username:process.env.PPC_BOOTSTRAP_ADMIN_ID,password:process.env.PPC_BOOTSTRAP_ADMIN_PASSWORD});assert.equal(owner.status,200);original=(await api('content')).data;
  const staffDetails={role:'staff',username:'proof-ratio-staff',password:'fictional proof ratio staff password'};await api('auth/accounts',staffDetails,owner.cookie,'DELETE');assert.equal((await api('auth/accounts',staffDetails,owner.cookie)).status,200);const staff=await api('auth/login',staffDetails);
  const qrForm=new FormData();qrForm.set('file',new Blob([await readFile('public/power-punch-logo.webp')],{type:'image/webp'}),'fixture.webp');qrForm.set('scope','public');const qr=await api('upload',qrForm,owner.cookie);assert.equal(qr.status,200);
  const form={id:'proof-name-form-'+randomUUID(),title:'Proof registration fields',fields:[...manualContactFields(),{id:'proof-name',label:'Proof fixture name',type:'text',required:false}]};assert.equal((await api('content',{key:'forms',value:[...original.forms,form]},owner.cookie,'PUT')).status,200);
  const event={formId:form.id,id:'proof-image-shapes-'+randomUUID().slice(0,8),title:'Original proof image tests',fee:500,capacity:100,status:'open',deadline:'2099-12-31',registrationMode:'manual',manualQrImage:qr.data.url};assert.equal((await api('content',{key:'tournaments',value:[...original.tournaments,event]},owner.cookie,'PUT')).status,200);
  const participant=await browser.newContext({viewport:{width:360,height:900}}),page=await participant.newPage(),admin=await browser.newContext({viewport:{width:360,height:900},acceptDownloads:true}),adminPage=await admin.newPage();
  await admin.addCookies([{name:owner.cookie.split('=')[0],value:owner.cookie.slice(owner.cookie.indexOf('=')+1),url:origin,secure:true,httpOnly:true,sameSite:'Lax'}]);
  const errors=[];page.on('pageerror',error=>errors.push(error.message));adminPage.on('pageerror',error=>errors.push(error.message));
  for(const fixture of cases){
    const pixels=await page.evaluate(async ({width,height,mime})=>{
      const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;const ctx=canvas.getContext('2d');ctx.fillStyle='#f8fafc';ctx.fillRect(0,0,width,height);
      ctx.font='24px Arial';ctx.fillStyle='#111';for(let y=120;y<height-80;y+=160)ctx.fillText('Transaction details — row '+y,70,y);
      ctx.fillStyle='#e11d48';ctx.fillRect(0,0,width,40);ctx.fillStyle='#2563eb';ctx.fillRect(0,height-40,width,40);ctx.fillStyle='#16a34a';ctx.fillRect(0,40,40,height-80);ctx.fillStyle='#facc15';ctx.fillRect(width-40,40,40,height-80);
      ctx.fillStyle='#111';ctx.fillText('TOP — TRANSACTION ABC123',60,85);ctx.fillText('BOTTOM — REFERENCE END456',60,height-65);
      const blob=await new Promise(resolve=>canvas.toBlob(resolve,mime,.98));return [...new Uint8Array(await blob.arrayBuffer())];
    },fixture);
    const source=Buffer.from(pixels),sourcePath=out+'/'+fixture.name+'.'+fixture.ext;await writeFile(sourcePath,source);
    const sourceImage=await loadImage(source);assert.deepEqual([sourceImage.width,sourceImage.height],[fixture.width,fixture.height]);
    if(page.url().startsWith(origin))await page.evaluate(()=>{localStorage.clear();sessionStorage.clear()});
    await page.goto(origin+'/tournaments/'+event.id);await page.getByRole('button',{name:'Individual & pay',exact:true}).click();
    await page.locator('.manual-payment-fields input[type=file]').waitFor({state:'attached'});
    const uploadResponse=page.waitForResponse(r=>r.url()===origin+'/api/upload'&&r.request().method()==='POST');
    await page.locator('.manual-payment-fields input[type=file]').setInputFiles(sourcePath);const uploaded=await (await uploadResponse).json();await page.getByText('Screenshot attached.',{exact:true}).waitFor();
    const fileKey=decodeURIComponent(uploaded.url.slice('/api/media/'.length)),stored=await db.collection('files').findOne({_id:fileKey}),storedBytes=Buffer.from(stored.data.value());assert.equal(hash(storedBytes),hash(source),'Selection/upload/storage must preserve exact original bytes');assert.equal(stored.type,fixture.mime);
    const storedImage=await loadImage(storedBytes);assert.deepEqual([storedImage.width,storedImage.height],[fixture.width,fixture.height]);
    for(const width of [360,390,1440]){await page.setViewportSize({width,height:900});await geometryAndEdges(page.locator('.payment-proof-local-preview img'),fixture,out+'/'+fixture.name+'-local-'+width+'.png');}
    const name='Original proof '+fixture.name+' '+randomUUID().slice(0,6);await page.getByLabel('Full name',{exact:true}).fill(name);await page.getByLabel('Proof fixture name',{exact:true}).fill(name);await page.getByLabel('Email address',{exact:true}).fill('proof-shape@example.invalid');await page.getByRole('textbox',{name:'Phone number',exact:true}).fill('9999999999');await page.getByLabel('UPI transaction ID / UTR',{exact:true}).fill('UTR-'+randomUUID());await page.getByRole('checkbox').check();
    const registrationResponse=page.waitForResponse(r=>r.url()===origin+'/api/register'&&r.request().method()==='POST');await page.getByRole('button',{name:'Submit registration & payment proof',exact:true}).click();const registration=await (await registrationResponse).json();assert.ok(registration.id,JSON.stringify(registration));
    let row=await db.collection('requests').findOne({_id:registration.id}),base='/api/admin/payment-proof?'+new URLSearchParams({id:row.id,revision:row.data.manualProofRevision});
    for(const suffix of ['', '&download=1']){
      assert.equal((await fetch(origin+base+suffix)).status,403);assert.equal((await fetch(origin+base+suffix,{headers:{Cookie:staff.cookie}})).status,403);
      const response=await fetch(origin+base+suffix,{headers:{Cookie:owner.cookie}});assert.equal(response.status,200);assert.equal(response.headers.get('content-type'),fixture.mime);assert.equal(response.headers.get('cache-control'),'private, no-store');assert.equal(response.headers.get('x-content-type-options'),'nosniff');assert.match(response.headers.get('content-disposition'),new RegExp('^'+(suffix?'attachment':'inline')+';'));assert.ok(response.headers.get('content-disposition').endsWith('.'+fixture.ext+'"'));
      const downloaded=Buffer.from(await response.arrayBuffer());assert.equal(hash(downloaded),hash(source));const decoded=await loadImage(downloaded);assert.deepEqual([decoded.width,decoded.height],[fixture.width,fixture.height]);
    }
    assert.equal((await fetch(origin+uploaded.url,{headers:{Cookie:staff.cookie}})).status,403);
    for(const width of [360,390,1440]){
      await adminPage.setViewportSize({width,height:900});await adminPage.goto(origin+'/admin');await adminPage.locator('.admin-shell').waitFor();if(await adminPage.getByRole('button',{name:'Menu',exact:true}).isVisible())await adminPage.getByRole('button',{name:'Menu',exact:true}).click();await adminPage.getByRole('button',{name:/Registrations & enquiries/}).click();await adminPage.getByLabel('Tournament',{exact:true}).selectOption(event.id);await expect(adminPage.getByRole('button',{name:'Apply',exact:true})).toBeEnabled();await adminPage.getByPlaceholder('Search current form answers').fill(name);await adminPage.getByRole('button',{name:'REVIEW',exact:true}).click();
      if(fixture.name==='portrait-9-16'&&width===390)await adminPage.addStyleTag({content:'.request-review-dialog img{width:240px!important;height:240px!important;aspect-ratio:1!important;object-fit:cover!important}'});
      await geometryAndEdges(adminPage.locator('.payment-proof-thumbnail img'),fixture,out+'/'+fixture.name+'-thumbnail-'+width+'.png');await adminPage.getByRole('button',{name:'Enlarge proof',exact:true}).click();const viewer=adminPage.getByRole('dialog',{name:'Payment proof',exact:true});
      await geometryAndEdges(viewer.locator('img'),fixture,out+'/'+fixture.name+'-fit-'+width+'.png');await expect(viewer.getByText(fixture.width+' x '+fixture.height+' px',{exact:true})).toBeVisible();
      const stage=viewer.locator('.payment-proof-frame');await viewer.getByRole('button',{name:'Original size',exact:true}).click();await expect.poll(()=>viewer.locator('img').evaluate(img=>Math.abs(img.getBoundingClientRect().width-img.naturalWidth)<.5&&Math.abs(img.getBoundingClientRect().height-img.naturalHeight)<.5)).toBe(true);
      await stage.evaluate(el=>{el.scrollTop=0;el.scrollLeft=0});const top=await viewer.locator('img').evaluate(img=>{const i=img.getBoundingClientRect(),f=img.closest('.payment-proof-frame').getBoundingClientRect();return i.top>=f.top&&i.left>=f.left});assert.equal(top,true);
      const dragBox=await stage.boundingBox();await adminPage.mouse.move(dragBox.x+dragBox.width/2,dragBox.y+Math.min(100,dragBox.height/2));await adminPage.mouse.down();await adminPage.mouse.move(dragBox.x+dragBox.width/2-50,dragBox.y+Math.min(100,dragBox.height/2)-50,{steps:5});await adminPage.mouse.up();assert.ok(await stage.evaluate(el=>el.scrollTop>0),'Mouse panning works');
      await stage.focus();await stage.press('End');await expect.poll(()=>stage.evaluate(el=>el.scrollTop)).toBeGreaterThan(0);
      await stage.evaluate(el=>{el.scrollTop=el.scrollHeight;el.scrollLeft=el.scrollWidth});const bottom=await viewer.locator('img').evaluate(img=>{const i=img.getBoundingClientRect(),f=img.closest('.payment-proof-frame').getBoundingClientRect();return i.bottom<=f.bottom+1&&i.bottom>=f.top&&i.right<=f.right+1&&i.right>=f.left});assert.equal(bottom,true,'Bottom/right reference markers remain reachable at original size');
      await viewer.screenshot({path:out+'/'+fixture.name+'-original-bottom-'+width+'.png'});const controls=await viewer.locator('.proof-zoom').boundingBox();assert.ok(controls.y>=0&&controls.y+controls.height<=900,'Controls stay visible while image scrolls');
      const prior=Number((await viewer.locator('output').innerText()).replace('%',''));await viewer.getByRole('button',{name:'Zoom in',exact:true}).click();await expect.poll(async()=>Number((await viewer.locator('output').innerText()).replace('%',''))).toBeGreaterThan(prior);await viewer.getByRole('button',{name:'Fit image',exact:true}).click();await geometryAndEdges(viewer.locator('img'),fixture,out+'/'+fixture.name+'-refit-'+width+'.png');
      const downloadEvent=adminPage.waitForEvent('download');await viewer.getByRole('link',{name:'Download original',exact:true}).click();const download=await downloadEvent,path=out+'/'+fixture.name+'-download-'+width+'.'+fixture.ext;await download.saveAs(path);assert.equal(hash(await readFile(path)),hash(source));assert.equal(download.suggestedFilename(),'power-punch-club-payment-proof.'+fixture.ext);
      await viewer.getByRole('button',{name:'Close payment proof',exact:true}).focus();await adminPage.keyboard.press('Shift+Tab');assert.equal(await viewer.evaluate(el=>el.contains(document.activeElement)),true);await adminPage.keyboard.press('Escape');await expect(viewer).toHaveCount(0);await expect(adminPage.getByRole('button',{name:'Enlarge proof',exact:true})).toBeFocused();
      console.log('Verified marked proof:',fixture.name,'at',width,'px: original bytes, all edges and natural-size navigation.');
      report.push({image:fixture.name,viewport:width,dimensions:[fixture.width,fixture.height],sha256:hash(source),allEdges:true,downloadMatches:true,originalSizeAndScrolling:true});
    }
    if(fixture.name==='portrait-9-16'){
      assert.equal((await api('manual-payment-review',{id:row.id,action:'reject',expectedRevision:row.data.manualProofRevision,note:'Disposable resubmission image check'},owner.cookie)).status,200);
      const tracker=await browser.newContext({viewport:{width:390,height:900}}),trackingPage=await tracker.newPage();
      await trackingPage.goto(origin+'/track-registration');await trackingPage.getByLabel('Registration number',{exact:true}).fill(registration.registrationNumber);await trackingPage.getByLabel('Private tracking code',{exact:true}).fill(registration.trackingCode);await trackingPage.getByRole('button',{name:'Track registration',exact:true}).click();
      await trackingPage.getByRole('heading',{name:'Correct your payment proof',exact:true}).waitFor();
      const upload=trackingPage.waitForResponse(r=>r.url()===origin+'/api/upload'&&r.request().method()==='POST');await trackingPage.locator('.manual-payment-fields input[type=file]').setInputFiles(sourcePath);const resubmittedUpload=await (await upload).json();await trackingPage.getByText('Screenshot attached.',{exact:true}).waitFor();
      await geometryAndEdges(trackingPage.locator('.payment-proof-local-preview img'),fixture,out+'/tracking-resubmission-local.png');
      const storedResubmission=await db.collection('files').findOne({_id:decodeURIComponent(resubmittedUpload.url.slice('/api/media/'.length))});assert.equal(hash(Buffer.from(storedResubmission.data.value())),hash(source));
      const resubmit=trackingPage.waitForResponse(r=>r.url()===origin+'/api/manual-proof'&&r.request().method()==='POST');await trackingPage.getByRole('button',{name:'Resubmit payment proof',exact:true}).click();assert.equal((await resubmit).status(),200);const latest=await db.collection('requests').findOne({_id:row.id});assert.notEqual(latest.data.manualProofRevision,row.data.manualProofRevision);assert.equal(latest.data.manualProof.screenshot,resubmittedUpload.url);row=latest;await tracker.close();
      console.log('Tracking-cookie proof resubmission preserved original bytes and local preview aspect ratio.');
    }
    // Existing stored originals, including pre-revision records, need no rewrite.
    await db.collection('requests').updateOne({_id:row.id},{$unset:{'data.manualProofRevision':''}});const legacy='/api/admin/payment-proof?'+new URLSearchParams({id:row.id,download:'1'});const legacyResponse=await fetch(origin+legacy,{headers:{Cookie:owner.cookie}});assert.equal(legacyResponse.status,200);assert.equal(hash(Buffer.from(await legacyResponse.arrayBuffer())),hash(source));await db.collection('requests').updateOne({_id:row.id},{$set:{'data.manualProofRevision':row.data.manualProofRevision}});
  }
  const oversized=new FormData();oversized.set('registrationToken',randomUUID());oversized.set('file',new Blob([new Uint8Array(8*1024*1024+1)]),'oversized.png');assert.equal((await api('upload',oversized)).status,400);
  const transform=new FormData();transform.set('registrationToken',randomUUID());transform.set('file',new Blob([await readFile(out+'/portrait-9-16.png')],{type:'image/png'}),'original.png');transform.set('remove','true');assert.equal((await api('upload',transform,owner.cookie)).status,400,'Private originals cannot enter public-image transformations');
  assert.deepEqual(errors,[]);await writeFile(out+'/verification.json',JSON.stringify(report,null,2));await participant.close();await admin.close();
  console.log('Proof image regression PASSED: 4 marked aspect ratios × 3 viewports; selection/local preview, exact original storage/download hashes and dimensions, all thumbnail/viewer edges, original-resolution zoom/keyboard scrolling, fixed controls, private Admin-only access, legacy originals, limits and transformation guard. No real providers contacted.');
}finally{if(owner&&original){await api('content',{key:'tournaments',value:original.tournaments},owner.cookie,'PUT');await api('content',{key:'forms',value:original.forms},owner.cookie,'PUT');}await browser.close();await mongo.close();}
