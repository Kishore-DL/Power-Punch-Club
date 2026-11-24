import assert from 'node:assert/strict';
import {mkdir,readFile} from 'node:fs/promises';
import {chromium,expect} from '@playwright/test';
import {MongoClient} from 'mongodb';
import ExcelJS from 'exceljs';
import {getDocument} from 'pdfjs-dist/legacy/build/pdf.mjs';
const origin='http://localhost:3043',out='outputs/current-form-practice';await mkdir(out,{recursive:true});
const client=new MongoClient('mongodb://127.0.0.1:37029/?replicaSet=ppcPractice'),db=client.db('ppc_preview_filter_practice');
assert.equal((await db.command({hello:1})).setName,'ppcPractice');assert.equal(await db.collection('requests').countDocuments(),12);
const login=await fetch(origin+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({role:'admin',username:'practice-admin',password:'PracticeOnly@2026'})});assert.equal(login.status,200);const cookie=login.headers.getSetCookie().find(c=>c.startsWith('ppc_admin_session_v2=')).split(';')[0];
async function api(path,body,status=200){const response=await fetch(origin+'/api/admin/reports/'+path,{method:body?'POST':'GET',headers:{Cookie:cookie,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});assert.equal(response.status,status,await response.clone().text());return response.json();}
const events=['filter-practice-tournament','practice-junior-tournament','practice-open-tournament'];
const q=target=>({target,view:'registrations',filters:[],columns:['answer:practice-student-name','system:status'],sort:{field:'answer:practice-student-name',direction:'asc'},page:1,pageSize:25});
const names=r=>r.rows.map(row=>row.values['answer:practice-student-name']);
for(const target of events){const c=await api('catalog?target='+target);assert.equal(c.events.length,3);assert.ok(c.fields.every(f=>f.source==='answer'||f.id==='system:status'));assert.ok(!c.fields.some(f=>/payment|member:|system:created/.test(f.id)));assert.equal((await api('list',{query:q(target)})).total,4);}
assert.deepEqual(names(await api('list',{query:{...q(events[0]),filters:[{field:'answer:practice-master',op:'in',values:['Kumar','Ravi']}]}})),['Arun','Bala']);
assert.deepEqual(names(await api('list',{query:{...q(events[1]),filters:[{field:'system:status',op:'in',values:['new','rejected']}]}})),['Ezhil','Gokul']);
await api('list',{query:{...q(events[0]),filters:[{field:'system:payment_status',op:'in',values:['paid']}]}},400);
await api('list',{query:{...q(events[1]),columns:['answer:practice-belt']}},400);
await api('list',{query:{...q(events[0]),target:''}},400);
const browser=await chromium.launch(),context=await browser.newContext({viewport:{width:1440,height:1050},acceptDownloads:true}),page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
const forms=await db.collection('content').findOne({_id:'forms'}),tournaments=await db.collection('content').findOne({_id:'tournaments'}),row=await db.collection('requests').findOne({_id:'filter-practice-ezhil-2026'});
async function count(n){await expect(page.locator('.report-table-scroll tbody tr')).toHaveCount(n);}
async function apply(){await page.getByRole('button',{name:'Apply',exact:true}).click();await expect(page.getByRole('button',{name:'Apply',exact:true})).toBeEnabled();}
async function add(label,values){await page.getByRole('button',{name:'Add Filter',exact:true}).click();const field=page.locator('.report-filter').last();await field.getByLabel('Field',{exact:true}).selectOption({label});for(const value of values)await field.getByRole('checkbox',{name:value,exact:true}).check();return field;}
async function choices(){await page.getByRole('button',{name:'Choose Columns',exact:true}).click();const labels=await page.locator('.report-column-choices label').allTextContents();await page.getByRole('button',{name:'Choose Columns',exact:true}).click();return labels;}
try{
 await page.goto(origin+'/admin?practice=filters');await page.getByLabel('Login ID',{exact:true}).fill('practice-admin');await page.getByLabel('Password',{exact:true}).fill('PracticeOnly@2026');await page.getByRole('button',{name:'Sign in',exact:true}).click();await count(4);
 assert.deepEqual(await choices(),['Student name','City','Master name','Dojo','Belt','Category','Registration status']);
 await page.screenshot({path:out+'/01-vellore.png',fullPage:true});await add('Master name',['Kumar','Ravi']);await apply();await count(2);
 await page.screenshot({path:out+'/02-master-filter.png',fullPage:true});
 await page.getByLabel('Tournament',{exact:true}).selectOption(events[1]);await count(4);assert.deepEqual(await choices(),['Student name','City','Master name','Dojo','Age','Registration status']);assert.equal(await page.locator('.report-filter').count(),0);
 await add('Registration status',['Awaiting review','Rejected']);await apply();await count(2);await expect(page.locator('.report-table-scroll tbody')).toContainText('Ezhil');await expect(page.locator('.report-table-scroll tbody')).toContainText('Gokul');
 await page.screenshot({path:out+'/03-status-filter.png',fullPage:true});
 const review=page.locator('.report-table-scroll tbody tr').filter({hasText:'Ezhil'});await review.getByRole('button',{name:'REVIEW',exact:true}).click();const dialog=page.getByRole('dialog',{name:'Registration review',exact:true});await dialog.getByLabel('Registration status',{exact:true}).selectOption('approved');await dialog.getByRole('button',{name:'Save registration review',exact:true}).click();await expect(dialog).toContainText('Registration review saved.');await page.getByRole('button',{name:'Close request review',exact:true}).click();await count(1);
 // Restore only the test registration's original decision after exercising real review.
 await db.collection('requests').updateOne({_id:row._id},{$set:{status:row.status,notes:row.notes||''}});
 await page.getByLabel('Tournament',{exact:true}).selectOption(events[2]);await count(4);assert.deepEqual(await choices(),['Student name','Master name','Belt','Category','Registration status']);
 await page.screenshot({path:out+'/04-salem-form.png',fullPage:true});
 // Verify live form edits and reassignment are reflected without a page reload.
 const edited=structuredClone(forms.value);edited[2].fields.push({id:'practice-school',label:'School',type:'text',showOnReceipt:true});await db.collection('content').updateOne({_id:'forms'},{$set:{value:edited}});
 await expect.poll(async()=>await choices(),{timeout:15000}).toContain('School');
 const assigned=structuredClone(tournaments.value);assigned[2].formId='practice-junior-form';await db.collection('content').updateOne({_id:'tournaments'},{$set:{value:assigned}});
 await expect.poll(async()=>await choices(),{timeout:15000}).toContain('Age');assert.ok(!(await choices()).includes('Belt'));
 await db.collection('content').updateOne({_id:'forms'},{$set:{value:forms.value}});await db.collection('content').updateOne({_id:'tournaments'},{$set:{value:tournaments.value}});
 await page.getByLabel('Tournament',{exact:true}).selectOption(events[0]);await count(4);await add('City',['Vellore']);await apply();await count(1);
 for(const format of ['xlsx','pdf']){
  await page.getByRole('button',{name:format==='pdf'?'Download PDF':'Download Excel',exact:true}).click();await expect(page.locator('.report-job')).toContainText(format.toUpperCase()+' ready:',{timeout:60000});const download=page.waitForEvent('download');await page.getByRole('button',{name:'Download ready report',exact:true}).click();const file=await download;const destination=out+'/arun.'+format;await file.saveAs(destination);const bytes=await readFile(destination);
  if(format==='xlsx'){const book=new ExcelJS.Workbook();await book.xlsx.load(bytes);assert.equal(book.worksheets[0].rowCount,2);assert.equal(book.worksheets[0].getCell('A2').value,'Arun');}
  else{assert.equal(bytes.subarray(0,5).toString(),'%PDF-');const task=getDocument({data:new Uint8Array(bytes),useSystemFonts:true});const doc=await task.promise;let text='';for(let n=1;n<=doc.numPages;n++)text+=(await(await doc.getPage(n)).getTextContent()).items.map(i=>i.str||'').join(' ');assert.ok(text.includes('Arun'));assert.ok(!text.includes('Bala'));await task.destroy();}
 }
 await page.getByRole('button',{name:'Clear All',exact:true}).click();await count(4);await page.setViewportSize({width:390,height:1000});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.deepEqual(errors,[]);
 console.log('PASS: 3 tournaments / 12 registrations; current-form-only fields and columns; Master OR; four decision options; server rejection of extra fields; approval via REVIEW; automatic form edit/reassignment; real XLSX/PDF; 390px; screenshots.');
}finally{await db.collection('content').updateOne({_id:'forms'},{$set:{value:forms.value}});await db.collection('content').updateOne({_id:'tournaments'},{$set:{value:tournaments.value}});await db.collection('requests').updateOne({_id:row._id},{$set:{status:row.status,notes:row.notes||''}});await browser.close();await client.close();}
