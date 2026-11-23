import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {chromium,expect} from '@playwright/test';
const origin=process.env.PPC_TEST_URL;
if(!origin||new URL(origin).hostname!=='localhost'||!/^mongodb:\/\/(127\.0\.0\.1|localhost):/.test(process.env.MONGODB_URI||'')||!process.env.MONGODB_DATABASE?.startsWith('ppc_test_')||process.env.BREVO_API_KEY||process.env.RAZORPAY_KEY_SECRET)throw Error('Use isolated local test settings with live providers disabled.');
const browser=await chromium.launch({headless:true});let original,cookie;
const instruction='Enter a transaction reference or upload a payment screenshot for review.';
async function save(tournaments){const r=await fetch(origin+'/api/content',{method:'PUT',headers:{'Content-Type':'application/json',Cookie:cookie},body:JSON.stringify({key:'tournaments',value:tournaments})});assert.equal(r.status,200);}
try{
  const login=await fetch(origin+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({role:'admin',username:process.env.PPC_BOOTSTRAP_ADMIN_ID,password:process.env.PPC_BOOTSTRAP_ADMIN_PASSWORD})});assert.equal(login.status,200);cookie=login.headers.getSetCookie().find(value=>value.includes('_session_v2=')).split(';')[0];
  original=(await (await fetch(origin+'/api/content')).json()).tournaments;
  const upload=new FormData();upload.set('scope','public');upload.set('file',new Blob([await readFile('public/power-punch-logo.webp')],{type:'image/webp'}),'fixture.webp');
  const uploaded=await fetch(origin+'/api/upload',{method:'POST',headers:{Cookie:cookie},body:upload});assert.equal(uploaded.status,200);const image=await uploaded.json();
  const id=randomUUID(),event={id,title:'Instruction regression',status:'open',registrationMode:'manual',fee:500,deadline:'2099-12-31',manualQrImage:image.url,manualInstructions:instruction};
  await save([...original,event]);const page=await browser.newPage();
  for(const width of [390,1440]){
    await page.setViewportSize({width,height:1000});await page.goto(origin+'/tournaments/'+id);await page.getByRole('button',{name:'Individual & pay',exact:true}).click();const fields=page.locator('.manual-payment-fields');
    await expect(fields.getByText(instruction,{exact:true})).toHaveCount(0);
    const guidance=fields.getByText('Check the payee and amount in your UPI app. After payment, enter the transaction ID or upload a screenshot. The club will verify your payment.',{exact:true});await expect(guidance).toHaveCount(1);
    assert.equal(await guidance.evaluate(element=>element.nextElementSibling?.textContent?.includes('UPI transaction ID / UTR')),true);
    await expect(fields.getByLabel('UPI transaction ID / UTR',{exact:true})).toBeVisible();await expect(fields.locator('input[type=file]')).toHaveCount(1);
  }
  // Preserve operational/custom instructions that do not match the duplicate.
  await save([...original,{...event,manualInstructions:'Include the bank reference when submitting.'}]);await page.goto(origin+'/tournaments/'+id);await page.getByRole('button',{name:'Individual & pay',exact:true}).click();await expect(page.getByText('Include the bank reference when submitting.',{exact:true})).toBeVisible();
  console.log('Payment wording regression passed at 390/1440px: matching top instruction removed, one proof-adjacent guidance paragraph and both controls retained, unrelated instructions unchanged.');
}finally{if(cookie&&original)await save(original);await browser.close()}
