import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import {MongoClient} from 'mongodb';
import ExcelJS from 'exceljs';
import {getDocument} from 'pdfjs-dist/legacy/build/pdf.mjs';
import {renderPdfPage} from './pdf-rendering.mjs';
const origin=process.env.PPC_TEST_URL||'http://localhost:3042';
if(new URL(origin).hostname!=='localhost'||!/^mongodb:\/\/(127\.0\.0\.1|localhost):/.test(process.env.MONGODB_URI||'')||!process.env.MONGODB_DATABASE?.startsWith('ppc_test_')||process.env.BREVO_API_KEY||process.env.RAZORPAY_KEY_SECRET)throw Error('Isolated local test settings required');
const client=new MongoClient(process.env.MONGODB_URI),db=client.db(process.env.MONGODB_DATABASE),directory='outputs/report-exports';await mkdir(directory,{recursive:true});
async function api(path,body,cookie,method=body?'POST':'GET'){
 const options={method,headers:{'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},...(body?{body:JSON.stringify(body)}:{})};
 let response;try{response=await fetch(origin+'/api/'+path,options);}catch(error){if(method!=='GET')throw error;await new Promise(r=>setTimeout(r,500));response=await fetch(origin+'/api/'+path,options);}
 const data=response.headers.get('content-type')?.includes('application/json')?await response.json():null;
 return {status:response.status,data,cookie:response.headers.getSetCookie().find(c=>c.startsWith('ppc_admin_session_v2=')||c.startsWith('ppc_staff_session_v2='))?.split(';')[0]};
}
const base={target:'report-test-event',filters:[],columns:['answer:report-reference','answer:report-phone','answer:report-text','answer:report-number','answer:report-bool'],sort:{field:'answer:report-reference',direction:'asc'},page:1,pageSize:2,view:'registrations'};
async function job(query,format,cookie){
 const requestId=randomUUID(),first=await api('admin/reports/exports',{query,format,requestId},cookie);assert.equal(first.status,202,JSON.stringify(first.data));
 const second=await api('admin/reports/exports',{query,format,requestId},cookie);assert.equal(second.data.id,first.data.id);
 let result=first.data;
 for(let i=0;i<600&&['queued','running'].includes(result.status);i++){await new Promise(r=>setTimeout(r,200));const poll=await api('admin/reports/export?id='+result.id,undefined,cookie);assert.equal(poll.status,200);result=poll.data;}
 return result;
}
async function bytes(result,cookie){assert.equal(result.status,'complete',JSON.stringify(result));const response=await fetch(origin+'/api/admin/reports/file?id='+result.id,{headers:{Cookie:cookie}});assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'private, no-store');assert.match(response.headers.get('content-disposition'),/attachment; filename="[a-z0-9.-]+"/i);const buffer=Buffer.from(await response.arrayBuffer());await writeFile(directory+'/'+result.filename,buffer);return {buffer,type:response.headers.get('content-type')};}
try{
 const login=await api('auth/login',{role:'admin',username:process.env.PPC_BOOTSTRAP_ADMIN_ID,password:process.env.PPC_BOOTSTRAP_ADMIN_PASSWORD});assert.equal(login.status,200,JSON.stringify(login.data));const cookie=login.cookie;
 const staffAccount={role:'staff',username:'report-test-staff',password:'report staff fictional password'};await api('auth/accounts',staffAccount,cookie,'DELETE');assert.equal((await api('auth/accounts',staffAccount,cookie)).status,200);const staff=await api('auth/login',staffAccount);
 for(const path of ['catalog','presets','exports','export?id='+randomUUID(),'file?id='+randomUUID(),'record?id=report-test-one']){
  assert.equal((await api('admin/reports/'+path)).status,403);assert.equal((await api('admin/reports/'+path,undefined,staff.cookie)).status,403);
 }
 const list=await api('admin/reports/list',{query:base},cookie);assert.equal(list.status,200,JSON.stringify(list.data));assert.equal(list.data.total,6);assert.equal(list.data.rows.length,2);
 const second=await api('admin/reports/list',{query:{...base,page:2}},cookie);assert.ok(!list.data.rows.some(r=>second.data.rows.some(other=>other.id===r.id)));
 for(const query of [{...base,filters:[{field:'data.token',op:'equals',value:'x'}]},{...base,columns:['answer:report-aadhaar']},{...base,filters:[{field:'answer:report-name',op:'contains',value:{$regex:'.*'}}]},{...base,columns:['system:token']},{...base,filters:Array(17).fill({field:'answer:report-name',op:'equals',value:'x'})}])assert.equal((await api('admin/reports/list',{query},cookie)).status,400);
 const preset=await api('admin/reports/presets',{name:'Report test preset',query:base},cookie);assert.equal(preset.status,200);assert.ok((await api('admin/reports/presets',undefined,cookie)).data.presets.some(p=>p.id===preset.data.id));assert.equal((await api('admin/reports/presets',{id:preset.data.id,name:'Renamed report preset'},cookie,'PUT')).status,200);assert.equal((await api('admin/reports/presets',{id:preset.data.id},cookie,'DELETE')).status,200);
 const xlsx=await job(base,'xlsx',cookie),excel=await bytes(xlsx,cookie);assert.equal(xlsx.total,6);assert.equal(excel.type,'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');assert.equal(excel.buffer.subarray(0,4).toString('hex'),'504b0304');
 const workbook=new ExcelJS.Workbook();await workbook.xlsx.load(excel.buffer);const sheet=workbook.getWorksheet(1);assert.equal(sheet.rowCount,7);assert.deepEqual(sheet.getRow(1).values.slice(1),['Entry reference','Phone','Additional information','Age value','Previous participation']);
 const first=sheet.getColumn(1).values.findIndex(value=>value==='RP-one');assert.ok(first>1);
 assert.equal(sheet.getCell('B'+first).value,'0123456789');assert.equal(sheet.getCell('B'+first).type,ExcelJS.ValueType.String);assert.equal(sheet.getCell('C'+first).value,'=SUM(1,2)');assert.equal(sheet.getCell('C'+first).type,ExcelJS.ValueType.String);assert.equal(sheet.getCell('D'+first).value,'0');assert.ok(sheet.views.some(v=>v.state==='frozen'));assert.ok(sheet.autoFilter);
 assert.ok(!excel.buffer.includes(Buffer.from('PRIVATE-AADHAAR')));
 const pdf=await job({...base,columns:['answer:report-reference','answer:report-phone','answer:report-text','answer:report-bool','answer:report-date','answer:report-dojo']},'pdf',cookie),file=await bytes(pdf,cookie);assert.equal(file.type,'application/pdf');assert.equal(file.buffer.subarray(0,5).toString(),'%PDF-');
 const parsedTask=getDocument({data:new Uint8Array(file.buffer),useSystemFonts:false}),parsed=await parsedTask.promise;assert.ok(parsed.numPages>=2);let text='';for(let p=1;p<=parsed.numPages;p++)text+=(await(await parsed.getPage(p)).getTextContent()).items.map(i=>i.str||'').join(' ');assert.match(text,/Entry reference/);assert.match(text,/Club \/ Dojo/);assert.match(text,/Applied filters/);assert.match(text,/IST/);assert.ok(!text.includes('PRIVATE-'));await parsedTask.destroy();await renderPdfPage(file.buffer,directory+'/selected-columns.png');
 // Large exports must cross the old 5,000-record boundary, even with a one-page list.
 const bulk={...base,target:'report-test-bulk',columns:['answer:report-reference','answer:report-phone'],pageSize:25};
 const bulkXlsx=await job(bulk,'xlsx',cookie),large=await bytes(bulkXlsx,cookie);assert.equal(bulkXlsx.total,6005);const reader=new ExcelJS.Workbook();await reader.xlsx.load(large.buffer);assert.equal(reader.worksheets[0].rowCount,6006);
 const ids=reader.worksheets[0].getColumn(1).values.slice(2);assert.equal(new Set(ids).size,6005);assert.ok(ids.includes('RP-bulk-006004'));
 const bulkPdf=await job(bulk,'pdf',cookie),largePdf=await bytes(bulkPdf,cookie);assert.equal(bulkPdf.total,6005);
 const documentTask=getDocument({data:new Uint8Array(largePdf.buffer),useSystemFonts:false}),document=await documentTask.promise;let identifiers=[];
 for(let p=1;p<=document.numPages;p++){const content=await(await document.getPage(p)).getTextContent();identifiers.push(...content.items.flatMap(item=>(item.str||'').match(/RP-bulk-\d{6}/g)||[]));}
 assert.equal(new Set(identifiers).size,6005);assert.ok(identifiers.includes('RP-bulk-006004'));await renderPdfPage(largePdf.buffer,directory+'/bulk-last-page.png',document.numPages);await documentTask.destroy();
 const empty=await job({...base,filters:[{field:'answer:report-name',op:'equals',value:'No such participant'}]},'pdf',cookie);assert.equal(empty.status,'failed');assert.match(empty.error,/No matching rows/);assert.equal((await api('admin/reports/file?id='+empty.id,undefined,cookie)).status,409);
 const other={role:'admin',username:'report-test-other',password:'report other fictional password'};await api('auth/accounts',other,cookie,'DELETE');await api('auth/accounts',other,cookie);const otherLogin=await api('auth/login',other);assert.equal((await api('admin/reports/file?id='+xlsx.id,undefined,otherLogin.cookie)).status,404);
 await db.collection('admin_export_jobs').updateOne({_id:xlsx.id},{$set:{expiresAt:new Date(0)}});assert.equal((await api('admin/reports/file?id='+xlsx.id,undefined,cookie)).status,404);
 await api('auth/logout',{role:'admin'},cookie);assert.equal((await api('admin/reports/file?id='+xlsx.id,undefined,cookie)).status,403);
 console.log('Report HTTP/export checks passed: Admin-only list/options/presets/jobs/files, expired sessions, input validation, actual XLSX/PDF signatures and parsers, column order, text/formula/phone preservation, private files, wide PDFs, empty failures, idempotency and ALL 6,005 rows in both formats.');
}finally{await client.close();}
