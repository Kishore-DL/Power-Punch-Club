import assert from 'node:assert/strict';
import {mkdir,readFile} from 'node:fs/promises';
import {chromium,expect} from '@playwright/test';
import sharp from 'sharp';
import jsQR from 'jsqr';
import {mockTournamentId,mockQrText} from '../lib/local-mock-content.mjs';
const origin=process.env.PPC_READONLY_SITE_URL;
if(!origin||!['http:','https:'].includes(new URL(origin).protocol))throw Error('Supply the explicitly intended PPC_READONLY_SITE_URL.');
const response=await fetch(origin+'/api/content');assert.equal(response.status,200);const content=await response.json();
const gallery=content.gallery.filter(row=>/^karate-worldwide-0[1-8]$/.test(row.id)),classes=content.training.filter(row=>/^local-karate-(kids|junior|advanced|weekend)-v1$/.test(row.id)),event=content.tournaments.find(row=>row.id===mockTournamentId);
assert.equal(gallery.length,8);assert.equal(classes.length,4);assert.ok(event);assert.equal(event.presentationOnly,true);assert.equal(event.manualUpiId,'');
const images=[...new Set([...gallery.map(row=>row.url),...classes.map(row=>row.image),event.image,event.manualQrImage])];
for(const url of images){assert.ok(/^\/api\/media\/public%2F[a-f0-9-]{36}$/i.test(url));const r=await fetch(new URL(url,origin));assert.equal(r.status,200,url);assert.match(r.headers.get('content-type'),/^image\//);const decoded=await sharp(Buffer.from(await r.arrayBuffer())).metadata();assert.ok(decoded.width>0&&decoded.height>0)}
await mkdir('outputs/published-content-readonly',{recursive:true});const browser=await chromium.launch({headless:true}),page=await browser.newPage({acceptDownloads:true}),errors=[],blockedWrites=[];
page.on('pageerror',error=>errors.push(error.message));await page.route('**/*',route=>{const r=route.request();if(!['GET','HEAD'].includes(r.method())){blockedWrites.push({method:r.method(),url:r.url()});return route.abort()}if(/api\.brevo\.com|api\.razorpay\.com|checkout\.razorpay\.com/.test(r.url()))return route.abort();return route.continue()});
async function loaded(selector){for(const img of await page.locator(selector).all()){await img.scrollIntoViewIfNeeded();await expect.poll(()=>img.evaluate(el=>el.complete&&el.naturalWidth>0)).toBe(true)}}
try{
  for(const width of [360,390,768,1440]){
    await page.setViewportSize({width,height:1000});await page.goto(origin);await expect(page.locator('.home-photo')).toHaveCount(3);await loaded('.home-photo img,.program-photo,.campaign-art-cutout');assert.ok(await page.locator('.campaign-art-cutout').count());await expect(page.getByRole('heading',{name:'Power Punch Karate Championship',exact:true})).toBeVisible();await page.locator('.training-grid').screenshot({path:'outputs/published-content-readonly/classes-'+width+'.png'});
    await page.goto(origin+'/gallery');await expect(page.locator('.gallery-item')).toHaveCount(8);await loaded('.gallery-item img');await page.locator('.gallery-grid').screenshot({path:'outputs/published-content-readonly/gallery-'+width+'.png'});
    await page.goto(origin+'/training');await expect(page.locator('.program')).toHaveCount(4);await loaded('.program-photo');assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    await page.goto(origin+'/tournaments');await expect(page.getByRole('heading',{name:event.title,exact:true})).toBeVisible();await page.goto(origin+'/tournaments/'+event.id);await loaded('.tournament-detail-photo');await page.getByRole('button',{name:'Individual & pay',exact:true}).click();const fields=page.locator('.manual-payment-fields');await expect(fields.getByRole('button',{name:'Download QR',exact:true})).toBeVisible();await loaded('.manual-payment-qr');
    await page.getByRole('dialog').screenshot({path:'outputs/published-content-readonly/registration-'+width+'.png'});
    if(width===390){const download=page.waitForEvent('download');await fields.getByRole('button',{name:'Download QR',exact:true}).click();const file=await download;await file.saveAs('outputs/published-content-readonly/qr.png');const bytes=await sharp(await readFile('outputs/published-content-readonly/qr.png')).ensureAlpha().raw().toBuffer({resolveWithObject:true});assert.equal(jsQR(new Uint8ClampedArray(bytes.data),bytes.info.width,bytes.info.height)?.data,mockQrText)}
  }
  assert.deepEqual(errors,[]);assert.deepEqual(blockedWrites,[]);
  console.log(JSON.stringify({origin,publicApi:true,selectedGallery:8,selectedClasses:4,separateChampionship:true,validatedPublicImageUrls:images.length,heroRendered:true,viewports:[360,390,768,1440],qrDisplayedAndDownloaded:true,qrNonPayable:true,mutationRequests:0,browserErrors:0}));
}finally{await browser.close()}
