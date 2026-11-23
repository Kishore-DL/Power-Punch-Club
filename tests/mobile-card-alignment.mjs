import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from '@playwright/test';

const origin=process.env.PPC_READONLY_SITE_URL,label=process.env.PPC_LAYOUT_LABEL||'local';
if(!origin||!/^https?:$/.test(new URL(origin).protocol)||!/^[a-z0-9-]+$/.test(label))throw Error('Set PPC_READONLY_SITE_URL and a simple PPC_LAYOUT_LABEL.');
const content=await(await fetch(new URL('/api/content',origin))).json();
const event=content.tournaments.find(e=>e.presentationOnly&&e.status==='open')||content.tournaments.find(e=>e.status==='open');
assert.ok(event);
const widths=[320,360,390,430,768,1366,1440,1920],directory=`outputs/approved-mobile/${label}`;
await mkdir(directory,{recursive:true});
const browser=await chromium.launch(),results=[],errors=[],writes=[];
let expansions=0,actions=0;
async function measure(page,description){
 await page.locator('.program-photo,.tournament-card-photo,.campaign-art').evaluateAll(async images=>{
  images.forEach(i=>{i.loading='eager';});await Promise.all(images.map(i=>i.decode()));
 });
 const data=await page.evaluate(()=>{
  const box=e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom,cy:r.y+r.height/2};};
  return {width:innerWidth,overflow:document.documentElement.scrollWidth>innerWidth,cards:[...document.querySelectorAll('.program,.tournament-card,.coach,.result-card')].map(card=>{
   const media=card.querySelector('.program-art,.tournament-card-photo')||card.firstElementChild;
   const body=card.querySelector('.program-body,.tournament-card-body')||card.lastElementChild;
   return {type:card.className,box:box(card),media:box(media),body:box(body)};
  }),hero:document.querySelector('.campaign-art')?{source:document.querySelector('.campaign-art').currentSrc,box:box(document.querySelector('.campaign-art')),copy:box(document.querySelector('.campaign-copy')),width:document.querySelector('.campaign-art').getAttribute('width'),height:document.querySelector('.campaign-art').getAttribute('height')}:null};
 });
 assert.equal(data.overflow,false,description+' no page overflow');
 for(const card of data.cards){
  if(data.width<=800){
   assert.ok(card.media.right<=card.body.x+1,description+' photo stays on LEFT');
   assert.ok(Math.abs(card.media.cy-card.body.cy)<1,description+' photo vertically centred against complete right content');
  }
  assert.ok(card.body.right<=card.box.right+1&&card.body.bottom<=card.box.bottom+1,description+' details fit card');
 }
 if(data.hero){
  assert.ok(data.hero.box.x>=data.hero.copy.right-1,description+' hero remains beside text');
  assert.equal(data.hero.width,'861');assert.equal(data.hero.height,'1099');
 }
 return data;
}
try{
 for(const width of widths){
  const context=await browser.newContext({viewport:{width,height:1000},deviceScaleFactor:1});
  await context.route('**/*',route=>{
   const request=route.request();if(!['GET','HEAD'].includes(request.method())){writes.push(request.method());return route.abort();}
   if(/api\.brevo\.com|api\.razorpay\.com|checkout\.razorpay\.com/.test(request.url()))return route.abort();return route.continue();
  });
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  for(const path of ['/','/training','/tournaments']){
   await page.goto(new URL(path,origin).href,{waitUntil:'networkidle'});await page.evaluate(()=>document.fonts.ready);
   for(const load of ['cold','refresh']){
    if(load==='refresh')await page.reload({waitUntil:'networkidle'});
    results.push({path,load,...await measure(page,`${width} ${path} ${load}`)});
   }
   if(path==='/'){
    const heroRequests=await page.evaluate(()=>performance.getEntriesByType('resource').filter(r=>/karate-cutout/.test(r.name)).map(r=>({path:new URL(r.name).pathname,initiator:r.initiatorType,bytes:r.encodedBodySize})));
    assert.equal(heroRequests.length,1,'Only selected hero source is fetched');assert.equal(heroRequests[0].initiator,'link','Hero is discovered by preload');
    assert.equal(heroRequests[0].path,'/karate-cutout-mobile.webp','DPR1 uses existing appropriately sized asset');
    await page.locator('.campaign-hero').screenshot({path:`${directory}/hero-${width}.png`});
    await page.locator('.training-grid').screenshot({path:`${directory}/classes-${width}.png`});
   }
   if(path==='/training'){
    if(width<=800){
     const before=await page.locator('.program').evaluateAll(es=>es.map(e=>e.clientHeight));
     await page.locator('.program-details-toggle').first().click();await measure(page,`${width} expanded details`);expansions++;
     const after=await page.locator('.program').evaluateAll(es=>es.map(e=>e.clientHeight));
     for(let i=1;i<before.length;i++)assert.ok(Math.abs(before[i]-after[i])<1,'Only selected class expands');
     await page.locator('.training-grid').screenshot({path:`${directory}/expanded-${width}.png`});
     await page.locator('.program').first().evaluate(e=>{e.querySelector('h3').textContent='Long karate class title for mobile wrapping and alignment';e.querySelector('.program-facts dd').textContent='Long belt and class details that wrap naturally inside the existing card';});
     await measure(page,`${width} long class details`);
    }
    await page.locator('.program-actions .btn').first().click();assert.equal(await page.getByRole('dialog').isVisible(),true);await page.keyboard.press('Escape');actions++;
   }
   if(path==='/tournaments'){
    await page.locator('.tournament-card-action').first().click();assert.ok(new URL(page.url()).pathname.startsWith('/tournaments/'));actions++;
   }
  }
  await page.goto(new URL('/tournaments/'+event.id,origin).href,{waitUntil:'networkidle'});
  await page.getByRole('button',{name:'Individual & pay',exact:true}).click();assert.equal(await page.getByRole('dialog').isVisible(),true);await page.keyboard.press('Escape');actions++;
  await page.goto(new URL('/gallery',origin).href,{waitUntil:'networkidle'});await page.locator('.gallery-photo-button').first().click();assert.equal(await page.locator('.gallery-photo-dialog').isVisible(),true);await page.keyboard.press('Escape');actions++;
  await context.close();
 }
 assert.deepEqual(errors,[]);assert.deepEqual(writes,[]);
 await writeFile(`${directory}/results.json`,JSON.stringify({origin,widths,results,expansions,actions,errors,writes},null,2));
 console.log(JSON.stringify({origin,widths,coldAndRefreshChecks:results.length,expansions,actions,browserErrors:0,serverMutations:0}));
}finally{await browser.close();}
