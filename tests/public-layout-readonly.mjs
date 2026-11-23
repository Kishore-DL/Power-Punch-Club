import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from '@playwright/test';

// Opt-in, GET/HEAD-only verification: safe against a local or live content DB.
const origin=process.env.PPC_READONLY_SITE_URL;
if(!origin||!/^https?:$/.test(new URL(origin).protocol))throw Error('Set PPC_READONLY_SITE_URL to the intended website.');
const label=process.env.PPC_LAYOUT_LABEL||'layout';
if(!/^[a-z0-9-]+$/.test(label))throw Error('Use a simple artifact label.');
const directory=`outputs/public-layout/${label}`;
await mkdir(directory,{recursive:true});
const browser=await chromium.launch();
const results=[],errors=[],failedAssets=[],writes=[];
try{
  for(const width of [1366,1440,1920,360,390]){
    const context=await browser.newContext({viewport:{width,height:1000},deviceScaleFactor:1});
    await context.route('**/*',route=>{
      const request=route.request();
      if(!['GET','HEAD'].includes(request.method())){writes.push(request.method()+' '+new URL(request.url()).pathname);return route.abort();}
      if(/api\.brevo\.com|api\.razorpay\.com|checkout\.razorpay\.com/.test(request.url()))return route.abort();
      return route.continue();
    });
    const page=await context.newPage();
    page.on('pageerror',e=>errors.push(e.message));
    page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
    page.on('response',r=>{if(r.status()>=400&&['stylesheet','script','image','font'].includes(r.request().resourceType()))failedAssets.push(r.status()+' '+new URL(r.url()).pathname);});
    for(const path of ['/','/tournaments','/training']){
      await page.goto(new URL(path,origin).href,{waitUntil:'networkidle'});
      for(const load of ['cold','refresh']){
        if(load==='refresh')await page.reload({waitUntil:'networkidle'});
        const images=page.locator('.campaign-art,.campaign-logo,.tournament-card-photo,.program-photo');
        for(const image of await images.all()){
          await image.scrollIntoViewIfNeeded();
          await image.evaluate(el=>el.decode());
        }
        await page.evaluate(()=>document.fonts.ready);
        await page.waitForTimeout(650); // Let the existing hero entrance animation finish.
        const state=await page.evaluate(()=>{
          const box=e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom};};
          const read=e=>({box:box(e),display:getComputedStyle(e).display,height:getComputedStyle(e).height,aspect:getComputedStyle(e).aspectRatio,fit:getComputedStyle(e).objectFit,natural:[e.naturalWidth,e.naturalHeight]});
          const hero=document.querySelector('.campaign-hero');
          return {viewport:innerWidth,dpr:devicePixelRatio,zoom:getComputedStyle(document.body).zoom,overflow:document.documentElement.scrollWidth>innerWidth,
            hero:hero?{box:box(hero),copy:read(hero.querySelector('.campaign-copy')),art:read(hero.querySelector('.campaign-art')),sourceDisplay:hero.querySelector('source')?getComputedStyle(hero.querySelector('source')).display:null}:null,
            tournaments:[...document.querySelectorAll('.tournament-card')].map(e=>({box:box(e),photo:e.querySelector('.tournament-card-photo')?read(e.querySelector('.tournament-card-photo')):null})),
            classes:[...document.querySelectorAll('.training-grid .program')].map(e=>({box:box(e),photo:read(e.querySelector('.program-photo')),button:box(e.querySelector('.program-actions .btn')),overflow:e.scrollWidth>e.clientWidth}))};
        });
        const location=`${width} ${path} ${load}`;
        assert.equal(state.dpr,1,location);assert.equal(state.zoom,'1',location);assert.equal(state.overflow,false,location);
        if(state.hero){
          const {copy,art,box,sourceDisplay}=state.hero;
          assert.equal(sourceDisplay,'none',location+' picture source must not be a grid item');
          assert.ok(art.box.x>=copy.box.right-1,location+' photo stays beside text');
          assert.ok(art.box.y<copy.box.bottom&&copy.box.y<art.box.bottom,location+' hero shares one row');
          assert.ok(art.box.bottom<=box.bottom+1,location+' full image box stays inside hero');
          assert.equal(art.fit,'contain',location);assert.ok(art.natural[0]>0,location);
          assert.ok(box.height<=(width>800?650:400),location+' no extra hero row');
        }
        for(const {photo} of state.tournaments){if(photo){
          assert.equal(photo.fit,'contain',location);
          assert.ok(Math.abs(photo.box.width/photo.box.height-photo.natural[0]/photo.natural[1])<0.02,location+' tournament uses natural proportions');
        }}
        for(const card of state.classes){
          assert.equal(card.overflow,false,location+' class content fits');
          assert.ok(card.button.right<=card.box.right+1&&card.button.bottom<=card.box.bottom+1,location+' action fits');
          assert.ok(card.photo.box.right<=card.box.right+1,location+' class image fits');
        }
        if(width>800){
          for(const card of state.classes){for(const other of state.classes.filter(c=>Math.abs(c.box.y-card.box.y)<1)){
            assert.ok(Math.abs(card.box.height-other.box.height)<1,location+' row heights align');
            assert.ok(Math.abs(card.button.bottom-other.button.bottom)<1,location+' row actions align');
          }}
        }
        results.push({width,path,load,...state});
        if(path==='/'&&load==='refresh'){
          await page.locator('.campaign-hero').screenshot({path:`${directory}/hero-${width}.png`});
          await page.locator('.tournament-card').screenshot({path:`${directory}/tournament-${width}.png`});
          await page.locator('.training-grid').screenshot({path:`${directory}/classes-${width}.png`});
        }
      }
    }
    await context.close();
  }
  assert.deepEqual(errors,[]);assert.deepEqual(failedAssets,[]);assert.deepEqual(writes,[]);
  await writeFile(`${directory}/results.json`,JSON.stringify({origin,results,errors,failedAssets,writes},null,2));
  console.log(JSON.stringify({origin,viewports:[1366,1440,1920,360,390],pages:['/','/tournaments','/training'],coldAndRefreshChecks:results.length,heroPlacement:true,naturalTournamentRatio:true,classAlignment:true,assetFailures:0,browserErrors:0,mutations:0}));
}finally{await browser.close();}
