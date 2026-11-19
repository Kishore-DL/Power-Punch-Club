import assert from 'node:assert/strict';
import {randomUUID,createHmac} from 'node:crypto';
import {MongoClient} from 'mongodb';
import {chromium,expect} from '@playwright/test';
import {mkdir} from 'node:fs/promises';

const origin=process.env.PPC_TEST_URL;
if(!origin||new URL(origin).hostname!=='localhost'||!process.env.MONGODB_DATABASE?.startsWith('ppc_test_')||process.env.BREVO_API_KEY)throw Error('Use isolated local tests with real email disabled.');
const mongo=new MongoClient(process.env.MONGODB_URI),db=mongo.db(process.env.MONGODB_DATABASE);
const browser=await chromium.launch({headless:true});
async function api(path,body,cookie,method=body?'POST':'GET'){
  const r=await fetch(origin+'/api/'+path,{method,headers:{'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},...(body?{body:JSON.stringify(body)}:{})});
  return {status:r.status,data:await r.json(),cookie:r.headers.getSetCookie().find(v=>v.includes('_session_v2='))?.split(';')[0],headers:r.headers};
}
const staff={role:'staff',username:'portal-regression',password:'fictional staff password 2026'};
const ownerBody={role:'admin',username:process.env.PPC_BOOTSTRAP_ADMIN_ID,password:process.env.PPC_BOOTSTRAP_ADMIN_PASSWORD};
const entry=extra=>({id:randomUUID(),token:randomUUID(),kind:'enquiry',name:'Phone fixture',email:'phone@example.invalid',phone:'9999999999',consent:true,...extra});
try{
  const owner=await api('auth/login',ownerBody);assert.equal(owner.status,200);
  assert.match(owner.headers.get('set-cookie'),/HttpOnly; Secure; SameSite=Lax/);
  await api('auth/accounts',staff,owner.cookie,'DELETE');
  assert.equal((await api('auth/accounts',staff,owner.cookie)).status,200);
  let login=await api('auth/login',staff);assert.equal(login.status,200);
  const both=owner.cookie+'; '+login.cookie;
  assert.deepEqual((await api('session',undefined,both)).data,{admin:true,staff:true,passwordMode:true,owner:true});
  assert.equal((await api('staff/registrations',undefined,owner.cookie)).status,403);
  assert.equal((await api('requests',undefined,login.cookie)).status,403);
  assert.equal((await api('auth/accounts',undefined,login.cookie)).status,403);
  assert.equal((await api('staff/registrations',{},login.cookie)).status,405);
  assert.equal((await api('staff/download?id=missing&field=photo',undefined,owner.cookie)).status,403);
  const swapped=login.cookie.replace('ppc_staff_session_v2','ppc_admin_session_v2');
  assert.equal((await api('requests',undefined,swapped)).status,403);
  const payload=encodeURIComponent(JSON.stringify(['private-auth-owner','legacy-version',Math.floor(Date.now()/1000)+1000]));
  const legacy='ppc_session='+payload+'.'+createHmac('sha256',process.env.PPC_SESSION_SECRET).update(payload).digest('hex');
  assert.equal((await api('staff/registrations',undefined,legacy)).status,403);
  assert.equal((await api('requests',undefined,legacy)).status,403);
  await api('auth/logout',{role:'staff'},both);
  assert.equal((await api('staff/registrations',undefined,login.cookie)).status,403,'logout must revoke replay');
  assert.equal((await api('requests',undefined,owner.cookie)).status,200,'staff logout must preserve Admin');
  const otherAdmin=await api('auth/login',ownerBody),otherStaff=await api('auth/login',staff);
  await api('auth/logout',{role:'admin'},otherAdmin.cookie+'; '+otherStaff.cookie);
  assert.equal((await api('requests',undefined,otherAdmin.cookie)).status,403);
  assert.equal((await api('staff/registrations',undefined,otherStaff.cookie)).status,200,'Admin logout must preserve Staff');
  assert.equal((await api('auth/login',{...ownerBody,role:'staff'})).status,401);
  login=await api('auth/login',staff);
  const sessionId=JSON.parse(decodeURIComponent(login.cookie.split('=')[1].split('.')[0]))[4];
  await db.collection('auth_sessions').updateOne({_id:sessionId},{$set:{expiresAt:new Date(0)}});
  assert.equal((await api('staff/registrations',undefined,login.cookie)).status,403,'expired server lease');
  login=await api('auth/login',staff);
  await fetch(origin+'/staff/deep-link',{headers:{Cookie:owner.cookie+'; '+login.cookie}});
  assert.equal((await api('staff/registrations',undefined,login.cookie)).status,403,'document entry revokes Staff before rendering');
  assert.equal((await api('requests',undefined,owner.cookie)).status,200);

  for(const phone of ['','0','9'.repeat(9),'9'.repeat(11),'abcdefghij','99999-99999','919999999999','+449999999999','９９９９９９９９９９']){
    const result=await api('register',entry({phone}));assert.equal(result.status,400,phone);assert.match(result.data.error,/10 digits/);
  }
  for(const phone of ['0000000000','9999999999','+919999999999','+91 99999 99999']){
    const body=entry({phone});assert.equal((await api('register',body)).status,200);
    assert.match((await db.collection('requests').findOne({_id:body.id})).phone,/^[0-9]{10}$/);
  }
  const content=(await api('content')).data;
  const form={id:'mobile-validation-'+randomUUID(),title:'Mobile validation',fields:[{id:'other-phone',label:'Parent mobile',type:'tel',required:true}]};
  const event={id:form.id,title:'Mobile validation',status:'open',registrationMode:'free',formId:form.id,fee:0,capacity:100,deadline:'2099-12-31'};
  assert.equal((await api('content',{key:'forms',value:[...content.forms,form]},owner.cookie,'PUT')).status,200);
  assert.equal((await api('content',{key:'tournaments',value:[...content.tournaments,event]},owner.cookie,'PUT')).status,200);
  for(const kind of ['tournament','team']){
    const body=entry({kind,target:event.id,registrationChoice:'free',team:[{name:'Team fixture',age:12,belt:'White'}],answers:{'other-phone':'12345678901'}});
    assert.equal((await api('register',body)).status,400);
    body.answers['other-phone']='+919999999999';assert.equal((await api('register',body)).status,200);
    assert.equal((await db.collection('requests').findOne({_id:body.id})).data.answers['other-phone'],'9999999999');
  }
  assert.equal((await api('content',{key:'branding',value:{...content.branding,trialFormId:form.id,enquiryFormId:form.id}},owner.cookie,'PUT')).status,200);
  for(const kind of ['trial','enquiry']){
    const body=entry({kind,answers:{'other-phone':'123456789'}});
    assert.equal((await api('register',body)).status,400);
    body.answers['other-phone']='+919999999999';assert.equal((await api('register',body)).status,200);
  }
  assert.equal((await api('content',{key:'branding',value:content.branding},owner.cookie,'PUT')).status,200);
  await mkdir('outputs/registration-tests',{recursive:true});
  const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage();
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto(origin+'/staff');await page.getByRole('heading',{name:'Staff Login',exact:true}).waitFor();
  assert.equal(await page.locator('.portal-record').count(),0);
  await page.getByLabel('Login ID',{exact:true}).fill(staff.username);
  const password=page.locator('input[name=password]');await password.fill(staff.password);assert.equal(await password.getAttribute('type'),'password');
  await page.getByRole('button',{name:'Show password',exact:true}).focus();await page.keyboard.press('Space');
  await expect(password).toHaveAttribute('type','text');assert.equal(await password.inputValue(),staff.password);await expect(page.getByRole('button',{name:'Hide password',exact:true})).toBeFocused();
  await page.getByRole('button',{name:'Hide password',exact:true}).click();await expect(password).toHaveAttribute('type','password');
  await page.getByRole('button',{name:'Sign in',exact:true}).click();await page.getByRole('heading',{name:'Tournament registrations'}).waitFor();
  await page.locator('.portal-page select').selectOption('');
  assert.equal((await context.request.get(origin+'/api/staff/registrations')).status(),200);
  const oldCookie=(await context.cookies()).find(c=>c.name==='ppc_staff_session_v2');assert.equal(oldCookie.httpOnly,true);assert.equal(oldCookie.secure,true);
  await page.reload();await page.getByRole('heading',{name:'Staff Login',exact:true}).waitFor();
  await page.getByLabel('Login ID',{exact:true}).fill(staff.username);await page.locator('input[name=password]').fill(staff.password);await page.getByRole('button',{name:'Sign in',exact:true}).click();await page.getByRole('heading',{name:'Tournament registrations'}).waitFor();
  const expiring=(await context.cookies()).find(c=>c.name==='ppc_staff_session_v2');
  const expiringId=JSON.parse(decodeURIComponent(expiring.value.split('.')[0]))[4];
  await db.collection('auth_sessions').updateOne({_id:expiringId},{$set:{expiresAt:new Date(0)}});
  await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await page.getByRole('heading',{name:'Staff Login',exact:true}).waitFor();
  assert.equal((await api('staff/registrations',undefined,oldCookie.name+'='+oldCookie.value)).status,403);
  await page.goto(origin+'/staff/registrations');await page.getByRole('heading',{name:'Staff Login',exact:true}).waitFor();
  await page.goto(origin+'/admin');await page.getByLabel('Login ID',{exact:true}).fill(ownerBody.username);await page.locator('input[name=password]').fill(ownerBody.password);
  await page.getByRole('button',{name:'Show password',exact:true}).focus();await page.keyboard.press('Enter');await expect(page.locator('input[name=password]')).toHaveAttribute('type','text');
  await page.getByRole('button',{name:'Hide password',exact:true}).click();await page.getByRole('button',{name:'Sign in',exact:true}).click();
  await page.getByRole('button',{name:'Login accounts',exact:true}).click();await page.getByRole('heading',{name:'Change owner login'}).waitFor();
  const fields=page.locator('.password-field input');assert.equal(await fields.count(),3);
  for(let i=0;i<3;i++){
    const input=fields.nth(i);await expect(input).toHaveAttribute('type','password');await input.fill('visibility fixture password');
    await input.locator('..').getByRole('button',{name:'Show password',exact:true}).click();await expect(input).toHaveAttribute('type','text');assert.equal(await input.inputValue(),'visibility fixture password');
    for(let j=0;j<3;j++)if(j!==i)await expect(fields.nth(j)).toHaveAttribute('type','password');
    await input.locator('..').getByRole('button',{name:'Hide password',exact:true}).click();
  }
  await page.getByRole('button',{name:'Reset password',exact:true}).first().click();await expect(page.locator('.password-field input').last()).toHaveAttribute('type','password');
  await page.screenshot({path:'outputs/registration-tests/password-desktop.png',fullPage:true});
  await page.setViewportSize({width:320,height:850});
  for(const input of await page.locator('.password-field input').all()){
    const box=await input.boundingBox(),toggle=await input.locator('..').locator('button').boundingBox();assert(box&&toggle&&toggle.x>=box.x&&toggle.x+toggle.width<=box.x+box.width+1);
  }
  await mkdir('outputs/registration-tests',{recursive:true});await page.screenshot({path:'outputs/registration-tests/password-mobile.png',fullPage:true});
  await page.goto(origin+'/staff');await page.getByRole('heading',{name:'Staff Login',exact:true}).waitFor();
  assert.equal((await context.request.get(origin+'/api/requests')).status(),200,'Admin remains signed in independently');
  await page.getByLabel('Login ID',{exact:true}).fill(staff.username);await page.locator('input[name=password]').fill(staff.password);await page.getByRole('button',{name:'Sign in',exact:true}).click();await page.getByRole('heading',{name:'Tournament registrations'}).waitFor();
  await page.getByRole('button',{name:'Sign out',exact:true}).click();await page.getByRole('heading',{name:'Staff Login',exact:true}).waitFor();
  assert.equal((await context.request.get(origin+'/api/staff/registrations')).status(),403);
  assert.equal((await context.request.get(origin+'/api/requests')).status(),200);
  await page.goto(origin+'/contact');const phone=page.getByRole('textbox',{name:'Phone number',exact:true});
  await expect(phone).toHaveAttribute('maxlength','10');await expect(phone).toHaveAttribute('inputmode','numeric');
  for(const raw of ['','0','999999999','9999999999']){await phone.fill(raw);assert.equal(await phone.evaluate(el=>el.checkValidity()),raw.length===10);}
  await phone.fill('');await phone.pressSequentially('abc!@99999999999');assert.equal(await phone.inputValue(),'9999999999');
  const paste=async text=>{await phone.evaluate((el,text)=>{const dt=new DataTransfer();dt.setData('text/plain',text);el.dispatchEvent(new ClipboardEvent('paste',{bubbles:true,cancelable:true,clipboardData:dt}));},text);};
  await phone.fill('');await paste('+91 99999 99999');assert.equal(await phone.inputValue(),'9999999999');
  await phone.fill('');await paste('99999999999');assert.equal(await phone.inputValue(),'');assert.equal(await phone.evaluate(el=>el.checkValidity()),false);
  await phone.fill('');await paste('abc9999999999');assert.equal(await phone.inputValue(),'');
  await phone.evaluate(el=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,'+919999999999');el.dispatchEvent(new Event('input',{bubbles:true}));});assert.equal(await phone.inputValue(),'9999999999');
  await phone.evaluate(el=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,'99999999999');el.dispatchEvent(new Event('input',{bubbles:true}));});assert.equal(await phone.inputValue(),'9999999999');assert.equal(await phone.evaluate(el=>el.checkValidity()),false);
  await phone.fill('0000000000');await expect(phone).toHaveValue('0000000000');assert.equal(await phone.evaluate(el=>el.checkValidity()),true);
  await page.screenshot({path:'outputs/registration-tests/phone-mobile.png',fullPage:true});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true);
  const prefix=page.locator('.indian-mobile-field>span').first();await expect(prefix).toHaveText('+91');
  assert.equal(await prefix.evaluate(el=>getComputedStyle(el).color),'rgb(36, 31, 42)');
  await page.goto(origin+'/tournaments/'+event.id);await page.getByRole('button',{name:'Register individual',exact:true}).click();
  await expect(page.getByRole('textbox',{name:'Parent mobile',exact:true})).toHaveAttribute('maxlength','10');
  await page.getByRole('textbox',{name:'Parent mobile',exact:true}).fill('999999999');
  assert.equal(await page.getByRole('textbox',{name:'Parent mobile',exact:true}).evaluate(el=>el.checkValidity()),false);
  assert.deepEqual(errors,[]);await context.close();
  console.log('Portal/contact regression passed: role isolation, revoked/expired/legacy/replayed sessions, fresh entry/refresh/deep links, read-only API, independent accessible password toggles, 320px alignment, ASCII mobile typing/paste/autofill/API and dynamic individual/team phones. No real email sent.');
}finally{await browser.close();await mongo.close();}
