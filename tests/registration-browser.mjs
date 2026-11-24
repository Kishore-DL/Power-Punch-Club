import assert from 'node:assert/strict';
import {MongoClient} from 'mongodb';
import {configureManualContacts} from './fixtures/manual-contact-fields.mjs';
import { chromium, expect } from '@playwright/test';
import { readFile, mkdir } from 'node:fs/promises';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { renderPdfPage } from './pdf-rendering.mjs';

const origin=process.env.PPC_TEST_URL||'http://localhost:3010';
if(!['localhost','127.0.0.1'].includes(new URL(origin).hostname)||!process.env.MONGODB_DATABASE?.startsWith('ppc_test_'))throw Error('Disposable local test configuration required.');
await mkdir('outputs/registration-tests',{recursive:true});
const mongo=new MongoClient(process.env.MONGODB_URI),restore=await configureManualContacts(mongo.db(process.env.MONGODB_DATABASE),{eventId:'browser-registration'});
const browser=await chromium.launch({headless:true});
try{
  const context=await browser.newContext({viewport:{width:1440,height:1000},acceptDownloads:true});
  const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto(origin+'/tournaments/browser-registration');
  await page.getByRole('button',{name:'Register individual',exact:true}).click();
  async function submit(name){await page.getByLabel('Full name',{exact:true}).fill(name);await page.getByLabel('Email address',{exact:true}).fill('browser@example.invalid');await page.getByLabel('Phone number',{exact:true}).fill('9999999999');await page.getByRole('checkbox').check();await page.getByRole('button',{name:'Submit registration',exact:true}).click();await page.getByRole('button',{name:'Download registration PDF',exact:true}).waitFor();}
  await submit('Desktop browser participant');
  const firstNumber=await page.getByLabel('Registration number',{exact:true}).inputValue();
  const firstCode=await page.getByLabel('Tracking code',{exact:true}).inputValue();
  assert.match(firstNumber,/^PPC-\d{6,}$/);assert.match(firstCode,/^(?=.*[A-Z])(?=.*\d)[A-Z0-9]{6}$/);
  // Exercise the Clipboard API and the accessible selected-text fallback.
  await page.evaluate(()=>Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async()=>{}}}));
  await page.getByRole('button',{name:'Copy registration number',exact:true}).click();await page.getByText('Copied registration number.',{exact:true}).waitFor();
  await page.evaluate(()=>{Object.defineProperty(navigator,'clipboard',{configurable:true,value:undefined});document.execCommand=()=>false;});
  await page.getByRole('button',{name:'Copy tracking code',exact:true}).click();await page.getByText('Text selected. Use Copy from your device menu, or press Ctrl+C.',{exact:true}).waitFor();
  assert.equal(await page.getByLabel('Tracking code',{exact:true}).evaluate(el=>el.selectionEnd-el.selectionStart),6);
  const downloadEvent=page.waitForEvent('download');await page.getByRole('button',{name:'Download registration PDF',exact:true}).click();const download=await downloadEvent;
  const file='outputs/registration-tests/browser-acknowledgement.pdf';await download.saveAs(file);assert.match(download.suggestedFilename(),/registration\.pdf$/);
  await renderPdfPage(await readFile(file),'outputs/registration-tests/browser-acknowledgement-rendered.png');
  await page.getByText('PDF downloaded. Keep your tracking code safe.',{exact:true}).waitFor();
  await page.screenshot({path:'outputs/registration-tests/desktop-success.png',fullPage:true});
  const pdf=await getDocument({data:new Uint8Array(await readFile(file)),useSystemFonts:true}).promise;
  let text='';for(let i=1;i<=pdf.numPages;i++){text+=(await (await pdf.getPage(i)).getTextContent()).items.map(item=>item.str).join(' ')+'\n';}
  const number=text.match(/Registration number:?\s*([A-Z0-9-]+)/)?.[1],code=text.match(/Private tracking code:?\s*([A-Z0-9]{6})/)?.[1];
  assert.equal(number,firstNumber);assert.equal(code,firstCode);assert.match(text,/No payment required/);assert.match(text,/IST/);assert.doesNotMatch(text,/How to track|enter BOTH|Keep the code private|grants access/);
  // Starting again must leave completed records recoverable and use fresh credentials.
  page.once('dialog',dialog=>dialog.accept());await page.getByRole('button',{name:'Start another registration',exact:true}).click();await submit('Second browser participant');
  const second=await page.getByLabel('Registration number',{exact:true}).inputValue();assert.notEqual(second,firstNumber);
  const archive=await page.evaluate(()=>JSON.parse(localStorage.getItem('ppc-completed-registrations')));assert.ok(archive.some(item=>item.registrationNumber===firstNumber));assert.ok(archive.some(item=>item.registrationNumber===second));assert.notEqual(archive[0].id,archive[1].id);assert.notEqual(archive[0].token,archive[1].token);
  for(const width of [390,320]){await page.setViewportSize({width,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1));assert.ok(await page.locator('.success-panel').evaluate(el=>el.scrollWidth<=el.clientWidth+1));await page.screenshot({path:`outputs/registration-tests/mobile-${width}-success.png`,fullPage:true});}
  await page.getByRole('link',{name:'Track this registration',exact:true}).click();await page.getByRole('heading',{name:'Second browser participant',exact:true}).waitFor();
  // New browser context: no cookies/storage; recover using ONLY values extracted from the PDF.
  const fresh=await browser.newContext({viewport:{width:390,height:844},acceptDownloads:true}),mobile=await fresh.newPage();
  await mobile.goto(origin+'/track-registration');await mobile.getByLabel('Registration number',{exact:true}).fill(number.toLowerCase());await mobile.getByLabel('Private tracking code',{exact:true}).fill(code.toLowerCase());await mobile.getByRole('button',{name:'Track registration',exact:true}).click();
  await mobile.getByRole('heading',{name:'Desktop browser participant',exact:true}).waitFor();
  assert.ok(await mobile.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  const recoveredDownload=mobile.waitForEvent('download');await mobile.getByRole('button',{name:'Download registration PDF',exact:true}).click();await (await recoveredDownload).saveAs('outputs/registration-tests/recovered-acknowledgement.pdf');
  await mobile.screenshot({path:'outputs/registration-tests/mobile-recovered.png',fullPage:true});
  await mobile.getByRole('button',{name:'Track another registration',exact:true}).click();await mobile.getByLabel('Registration number',{exact:true}).fill(number);await mobile.getByLabel('Private tracking code',{exact:true}).fill('X1X1X1');await mobile.getByRole('button',{name:'Track registration',exact:true}).click();await expect(mobile.locator('.track-registration [role=alert]')).toContainText('could not be verified');
  assert.deepEqual(errors,[]);
  console.log('Browser regression passed: real PDF download/text recovery in a fresh browser, desktop and 320/390px mobile layouts, copy API/fallback, feedback, two registrations with distinct submission credentials, saved-device recovery and wrong-code failure.');
}finally{await browser.close();await restore();await mongo.close();}
