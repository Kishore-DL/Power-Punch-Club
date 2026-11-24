import assert from 'node:assert/strict';
import {MongoClient} from 'mongodb';
import {reportCatalog,validateReportQuery,reportPage,reportOptions} from '../lib/registration-report.ts';

if(!/^mongodb:\/\/(127\.0\.0\.1|localhost):/.test(process.env.MONGODB_URI||'')||!process.env.MONGODB_DATABASE?.startsWith('ppc_test_')||process.env.BREVO_API_KEY||process.env.RAZORPAY_KEY_SECRET)throw Error('Use a disposable local ppc_test_ database with real providers disabled.');
const client=new MongoClient(process.env.MONGODB_URI),db=client.db(process.env.MONGODB_DATABASE),requests=db.collection('requests');
export const reportFields=[
 {id:'report-name',label:'Participant name',type:'text'},{id:'report-phone',label:'Phone',type:'tel'},{id:'report-reference',label:'Entry reference',type:'text'},
 {id:'report-dojo',label:'Club / Dojo',type:'text'}, {id:'report-belt',label:'Belt',type:'select',options:'Black, Brown'}, {id:'report-category',label:'Category',type:'select',options:'Under 10, Under 14'},
 {id:'report-number',label:'Age value',type:'number'},{id:'report-date',label:'Date of birth',type:'date'},{id:'report-bool',label:'Previous participation',type:'checkbox'},
 {id:'report-upload',label:'Document',type:'file'}, {id:'report-aadhaar',label:'Aadhaar',type:'masked_aadhaar'},{id:'report-hidden',label:'Hidden document field',type:'text',showOnReceipt:false},
 {id:'report-duplicate-a',label:'School',type:'text'}, {id:'report-duplicate-b',label:'School',type:'text'},{id:'report-new',label:'New configured field',type:'text'},
 {id:'report-text',label:'Additional information',type:'text'},
];
const event={id:'report-test-event',title:'Report test championship',formId:'report-test-form',status:'open',registrationMode:'free'},bulkEvent={...event,id:'report-test-bulk',title:'Bulk report test'};
const snapshot=Object.fromEntries([...reportFields.filter(f=>f.id!=='report-new'),{id:'report-removed',label:'Archived region',type:'text'}].map(({id,...f})=>[id,{...f,label:id==='report-dojo'?'Dojo at submission':f.label}]));
export async function reportFixtureContent(){return {branding:{name:'Power Punch Club'},pages:{},training:[],masters:[],gallery:[],achievements:[],announcements:[],forms:[{id:'report-test-form',title:'Report form',fields:reportFields}],tournaments:[event,bulkEvent]};}
export async function seedReportFixtures(){
 await requests.deleteMany({_id:/^report-test-/});
 const base=(id)=>({_id:'report-test-'+id,id:'report-test-'+id,token:'PRIVATE-TOKEN',kind:'tournament',target:event.id,name:'Participant '+id,email:'fixture@example.invalid',phone:'0123456789',status:'new',amount:50000,payment_status:'unpaid',created:'2026-11-24T10:00:00.000Z',data:{registrationNumber:'RP-'+id,paymentMethod:'manual',receiptTitle:event.title,receiptFields:snapshot,answers:{'report-name':'Participant '+id,'report-phone':'0123456789','report-reference':'RP-'+id,'report-dojo':'Power Punch Dojo','report-belt':'Black','report-category':'Under 10','report-number':0,'report-date':'2016-01-01','report-bool':false,'report-upload':'/api/media/private%2F11111111-1111-4111-8111-111111111111','report-aadhaar':'PRIVATE-AADHAAR','report-hidden':'PRIVATE-HIDDEN','report-duplicate-a':'School A','report-duplicate-b':'School B','report-removed':'Old option','report-text':'=SUM(1,2)'}}});
 const rows=['one','two','three','four','five'].map(base);
 rows[0].payment_status='paid';rows[0].payment_id='manual_receipt_001';
 rows[1].data.answers['report-dojo']='Dojo B';rows[1].data.answers['report-belt']='Brown';rows[1].data.answers['report-category']='Under 14';rows[1].payment_status='manual_pending';
 rows[1].data.answers['report-text']='தமிழ் மாணவர்\n'+('A long report answer with complete content and clear wrapping. '.repeat(15))+'END-LONG-REPORT';
 rows[2].data.answers['report-dojo']=' Dojo   C ';rows[2].data.answers['report-category']='Under 14';rows[2].payment_status='manual_rejected';
 rows[3].data.answers['report-dojo']=' power   punch dojo ';rows[3].created='2026-11-24T18:29:59.000Z';rows[3].data.answers['report-date']='2026-11-24T18:29:59.000Z';rows[3].data.answers['report-upload']='';rows[3].data.answers['report-bool']=true;
 rows[4].created='2026-11-24T18:30:00.000Z';rows[4].data.answers={};
 const team=base('team');team.kind='team';team.name='Team contact';team.data.team=[{name:'Student A',age:9,belt:'Black',category:'Under 10'},{name:'Student B',age:12,belt:'Brown',category:'Under 14'}];
 await requests.insertMany([...rows,team]);
 for(let start=0;start<6005;start+=500)await requests.insertMany(Array.from({length:Math.min(500,6005-start)},(_,i)=>{const row=base('bulk-'+String(start+i).padStart(6,'0'));row.target=bulkEvent.id;row.data.receiptTitle=bulkEvent.title;row.data.answers['report-dojo']='Bulk Dojo';return row;}));
 const content=await reportFixtureContent();for(const key of ['forms','tournaments']){
  const old=(await db.collection('content').findOne({_id:key}))?.value||[];
  const ids=new Set(content[key].map(r=>r.id));await db.collection('content').updateOne({_id:key},{$set:{value:[...old.filter(r=>!ids.has(r.id)),...content[key]]}},{upsert:true});
 }
 return content;
}
try{
 const content=await seedReportFixtures(),catalog=await reportCatalog(db,content,event.id);
 const make=(filters=[],extra={})=>validateReportQuery({target:event.id,filters,view:'registrations',columns:['answer:report-reference','answer:report-phone','answer:report-number','answer:report-bool'],...extra},catalog);
 const filter=(id,values)=>({field:id,op:'in',values});
 assert.ok(catalog.fields.some(f=>f.id==='answer:report-new'));assert.ok(!catalog.fields.some(f=>f.id==='answer:report-removed'));
 assert.deepEqual(catalog.fields.find(f=>f.id==='answer:report-dojo').aliases,[]);
 assert.ok(catalog.fields.every(f=>f.source==='answer'||f.id==='system:status'));
 assert.equal((await reportCatalog(db,content)).fields.length,0);
 assert.equal(catalog.fields.filter(f=>f.label==='School').length,2);assert.notEqual(...catalog.fields.filter(f=>f.label==='School').map(f=>f.displayLabel));
 assert.ok(!catalog.fields.some(f=>/aadhaar/.test(f.id)));assert.equal(catalog.fields.find(f=>f.id==='answer:report-hidden').exportable,false);
 assert.equal((await reportPage(db,make([filter('answer:report-dojo',['POWER PUNCH DOJO'])]),catalog)).total,3);
 assert.equal((await reportPage(db,make([filter('answer:report-dojo',['Power Punch Dojo','Dojo B'])]),catalog)).total,4);
 assert.equal((await reportPage(db,make([filter('answer:report-belt',['Black','Brown']),filter('answer:report-category',['Under 14'])]),catalog)).total,2);
 assert.equal((await reportPage(db,make([filter('system:status',['new'])]),catalog)).total,6);
 const students=await reportPage(db,make([],{view:'participants'}),catalog);assert.equal(students.total,7);assert.equal(students.registrations,6);
 const renamed=structuredClone(content);renamed.forms[0].fields.find(f=>f.id==='report-dojo').label='Renamed current dojo';assert.equal((await reportCatalog(db,renamed,event.id)).fields.find(f=>f.id==='answer:report-dojo').label,'Renamed current dojo');
 const removed=structuredClone(content);removed.forms[0].fields=removed.forms[0].fields.filter(f=>f.id!=='report-dojo');assert.ok(!(await reportCatalog(db,removed,event.id)).fields.some(f=>f.id==='answer:report-dojo'));
 const all=await reportPage(db,make(),catalog);assert.equal(all.registrations,6);assert.equal(all.participants,7);assert.ok(all.rows.some(r=>r.values['answer:report-number']==='0'&&r.values['answer:report-bool']==='No'));
 assert.ok(!JSON.stringify(all).includes('PRIVATE-'));assert.ok(!JSON.stringify(all).includes('/api/media/'));
 assert.equal((await reportPage(db,make([{field:'answer:report-number',op:'range',min:0,max:0}]),catalog)).total,5);
 assert.equal((await reportPage(db,make([{field:'answer:report-date',op:'range',from:'2026-11-24',to:'2026-11-24'}]),catalog)).total,1);
 assert.equal((await reportPage(db,make([filter('answer:report-bool',['No'])]),catalog)).total,4);
 assert.equal((await reportPage(db,make([filter('answer:report-upload',['Not uploaded'])]),catalog)).total,2);
 assert.equal((await reportPage(db,make([filter('answer:report-dojo',[])]),catalog)).total,6);
 assert.equal((await reportPage(db,make([],{search:'Dojo B'}),catalog)).total,1);
 for(const extra of [{target:''},{columns:['system:payment_status']},{filters:[filter('member:belt',['Black'])]}])assert.throws(()=>make([],extra));
 const options=await reportOptions(db,make([filter('answer:report-dojo',['Power Punch Dojo'])]),catalog,'answer:report-belt','');assert.ok(options.values.some(v=>v.value.toLowerCase()==='brown'));
 for(const malformed of [{filters:[{field:'data.token',op:'equals',value:'x'}]},{filters:[{field:'system:name',op:'$where',value:'x'}]},{filters:[{field:'answer:report-date',op:'range',from:'2026-02-30'}]},{filters:[{field:'answer:report-number',op:'range',min:9,max:2}]},{columns:['answer:report-hidden']},{query:{$where:'x'}},{pageSize:5001},{columns:['answer:report-name','answer:report-name']}])assert.throws(()=>make([],malformed));
 const bulkCatalog=await reportCatalog(db,content,bulkEvent.id),bulkQuery=validateReportQuery({target:bulkEvent.id,pageSize:100},bulkCatalog),bulk=await reportPage(db,bulkQuery,bulkCatalog);assert.equal(bulk.total,6005);
 const last=await reportPage(db,{...bulkQuery,page:61},bulkCatalog);assert.equal(last.rows.length,5);assert.notEqual(last.rows[0].id,bulk.rows[0].id);
 console.log('Report query checks passed: OR/AND, current/new/renamed/removed/duplicate fields, privacy, zero/false, IST inclusive dates, registration/student counts, empty filters, option independence, malicious input and 6,005-record pagination.');
}finally{await client.close();}
