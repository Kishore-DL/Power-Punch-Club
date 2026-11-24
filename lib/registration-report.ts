import type {ClientSession,Db,Document} from 'mongodb';
import type {ClubContent} from './club-types';
import type {ReportCatalog,ReportField,ReportFilter,ReportKind,ReportPage,ReportQuery,ReportRow} from './report-types';
import {paymentStatusLabels,registrationStatusLabels,requestTypeLabels} from './admin-review.mjs';

export class ReportInputError extends Error {}
const bad=(message:string):never=>{throw new ReportInputError(message);};
export const reportLimits={fields:2000,filters:16,values:50,columns:24,pageSize:100,xlsxRows:100000,pdfRows:10000,pdfCharacters:2000000,pdfPages:1500};
const blocked=(id:string,label:string,type:string)=>type==='masked_aadhaar'||/aadhaar|aadhar|tracking|token|password|secret|credential|admin.?notes/i.test(id+' '+label);
const kinds=(type:string):ReportKind=>['select','radio'].includes(type)?'select':['number','date'].includes(type)?type as ReportKind:['boolean','checkbox'].includes(type)?'boolean':['file','photo'].includes(type)?'upload':'text';
const system:ReportField[]=[
 ['registrationNumber','Registration number','text'],['name','Participant / contact name','text'],['email','Email','text'],['phone','Phone','text'],['tournament','Tournament','select'],['kind','Request type','select'],['status','Registration status','select'],['payment_status','Payment status','select'],['paymentMethod','Payment method','select'],['created','Registration date','date'],['amount','Amount (INR)','number'],['transaction','Transaction reference','text'],
].map(([key,label,kind])=>({id:'system:'+key,label,displayLabel:label,key,kind:kind as ReportKind,source:'system',options:[],aliases:[],exportable:true}));
const string=(v:unknown,max=500):string=>typeof v==='string'&&v.length<=max?v:bad('Invalid text value.');
export const normalise=(v:string)=>v.trim().replace(/\s+/g,' ').toLowerCase();
const date=(v:unknown)=>{const text=string(v,10),parsed=new Date(text+'T00:00:00Z');if(!/^\d{4}-\d{2}-\d{2}$/.test(text)||!Number.isFinite(parsed.getTime())||parsed.toISOString().slice(0,10)!==text)bad('Enter a valid date.');return text;};
export function validateReportQuery(input:unknown,catalog:ReportCatalog):ReportQuery{
 if(!input||typeof input!=='object'||Array.isArray(input))return bad('Invalid report query.');
 const value=input as Record<string,unknown>;
 if(Object.keys(value).some(k=>!['target','search','view','filters','columns','sort','page','pageSize'].includes(k)))bad('Unknown query property.');
 const target=string(value.target??'',128);if(!target)bad('Select a tournament first.');if(target&&!catalog.events.some(e=>e.id===target))bad('Choose an available tournament.');
 const view=value.view??'registrations';if(view!=='registrations'&&view!=='participants')return bad('Choose a report view.');
 const rawFilters=value.filters??[];if(!Array.isArray(rawFilters)||rawFilters.length>reportLimits.filters)bad('Use at most 16 field filters.');
 const fields=new Map(catalog.fields.map(f=>[f.id,f])),seen=new Set<string>();
 const filters=(rawFilters as unknown[]).map(raw=>{
  if(!raw||typeof raw!=='object'||Array.isArray(raw))return bad('Invalid field filter.');
  const f=raw as Record<string,unknown>;if(Object.keys(f).some(k=>!['field','op','values','value','min','max','from','to'].includes(k)))bad('Unknown filter property.');
  const field=fields.get(string(f.field,600));if(!field||seen.has(field.id))return bad('Choose each available field only once.');seen.add(field.id);
  const op=f.op;if(!['in','equals','contains','range'].includes(String(op)))return bad('Unsupported filter operator.');
  const filter:ReportFilter={field:field.id,op:op as ReportFilter['op']};
  if(op==='in'){
   if(!Array.isArray(f.values)||f.values.length>reportLimits.values)bad('Choose at most 50 values per field.');
   if(field.kind==='date'||field.kind==='number')bad('Use a range or an exact number for this field.');
   filter.values=[...new Set((f.values as unknown[]).map(v=>string(v)))];
   if(field.kind==='boolean'&&filter.values.some(v=>!['Yes','No'].includes(v)))bad('Choose Yes or No.');
   if(field.kind==='upload'&&filter.values.some(v=>!['Uploaded','Not uploaded'].includes(v)))bad('Choose Uploaded or Not uploaded.');
  }else if(op==='range'&&field.kind==='date'){
   if(f.from)filter.from=date(f.from);if(f.to)filter.to=date(f.to);if(filter.from&&filter.to&&filter.from>filter.to)bad('From date must not follow To date.');
  }else if(op==='range'&&field.kind==='number'){
   for(const k of ['min','max'] as const)if(f[k]!==undefined){if(typeof f[k]!=='number'||!Number.isFinite(f[k]))bad('Enter a finite number.');filter[k]=f[k] as number;}
   if(filter.min!==undefined&&filter.max!==undefined&&filter.min>filter.max)bad('Minimum must not exceed maximum.');
  }else if((op==='equals'||op==='contains')&&(field.kind==='text'||field.kind==='number'&&op==='equals')){
   filter.value=string(f.value??'');if(field.kind==='number'&&filter.value.trim()&&!Number.isFinite(Number(filter.value)))bad('Enter a finite number.');
  }else return bad('Operator does not match this field type.');
  if([filter.value,...filter.values||[]].some(v=>typeof v==='string'&&/\/api\/media\//i.test(v)))bad('Private file addresses cannot be used as filter values.');
  return filter;
 });
 const rawColumns=value.columns??catalog.fields.filter(f=>f.exportable).slice(0,6).map(f=>f.id);
 if(!Array.isArray(rawColumns)||!rawColumns.length||rawColumns.length>reportLimits.columns)bad('Choose between 1 and 24 columns.');
 const columns=(rawColumns as unknown[]).map(v=>string(v,600));if(new Set(columns).size!==columns.length||columns.some(id=>!fields.get(id)?.exportable))bad('Choose permitted, unique export columns.');
 const rawSort=value.sort as Record<string,unknown>|undefined;
 if(rawSort&&Object.keys(rawSort).some(k=>!['field','direction'].includes(k)))bad('Invalid sort.');
 const sort={field:string(rawSort?.field??catalog.fields[0]?.id??'system:status',600),direction:(rawSort?.direction??'desc') as 'asc'|'desc'};
 if(!fields.has(sort.field)||!['asc','desc'].includes(sort.direction))bad('Choose a valid sort field and direction.');
 const page=value.page??1,pageSize=value.pageSize??25;
 if(!Number.isSafeInteger(page)||Number(page)<1||Number(page)>1000000||!Number.isSafeInteger(pageSize)||Number(pageSize)<1||Number(pageSize)>100)bad('Invalid pagination.');
 const search=string(value.search??'',200);if(/\/api\/media\//i.test(search))bad('Private file addresses cannot be used as search text.');
 return {target,search,view,filters,columns,sort,page:Number(page),pageSize:Number(pageSize)};
}

export async function reportCatalog(db:Db,content:ClubContent,target=''):Promise<ReportCatalog>{
 void db;
 if(typeof target!=='string'||target.length>128)bad('Invalid tournament.');
 const events=content.tournaments.map(event=>({id:event.id,title:event.title}));
 if(!target)return {fields:[],events};
 const event=content.tournaments.find(item=>item.id===target);if(!event)bad('Tournament not found.');
 const current=content.forms.find(form=>form.id===event!.formId)?.fields||[];
 const fields:ReportField[]=current.filter(field=>!blocked(field.id,field.label,field.type)).map(field=>({
  id:'answer:'+field.id,key:field.id,label:field.label,displayLabel:field.label,kind:kinds(field.type),source:'answer',aliases:[],
  options:String(field.options||'').split(',').map(option=>option.trim()).filter(Boolean),exportable:field.showOnReceipt!==false,
 }));
 fields.push({...system.find(field=>field.key==='status')!});
 for(const field of fields)if(fields.filter(other=>other.label===field.label).length>1)field.displayLabel=field.label+' ('+field.id+')';
 if(fields.length>reportLimits.fields)bad('Too many fields for this report.');
 return {fields,events};
}

const literal=(v:unknown)=>({$literal:v});
const text=(v:unknown):Document=>({$convert:{input:v,to:'string',onError:'',onNull:''}});
export function normalisedExpression(value:unknown):Document{
 let source:unknown=text(value);for(const char of ['\t','\r','\n'])source={$replaceAll:{input:source,find:char,replacement:' '}};
 return {$toLower:{$reduce:{input:{$filter:{input:{$split:[{$trim:{input:source}},' ']},as:'word',cond:{$ne:['$$word','']}}},initialValue:'',in:{$concat:['$$value',{$cond:[{$eq:['$$value','']},'',' ']},'$$this']}}}};
}
const get=(name:string,input:string)=>({$getField:{field:literal(name),input:{$cond:[{$eq:[{$type:input},'object']},input,{}]}}});
export function fieldExpression(field:ReportField):unknown{
 if(field.source==='answer')return get(field.key,'$data.answers');
 if(field.source==='member')return field.key==='name'?{$cond:[{$eq:['$kind','tournament']},'$name',get('name','$__member')]}:get(field.key,'$__member');
 switch(field.key){
  case 'registrationNumber':return {$ifNull:['$data.registrationNumber','$id']};
  case 'paymentMethod':return {$ifNull:['$data.paymentMethod',{$cond:[{$gt:['$amount',0]},'razorpay','free']}]};
  case 'payment_status':return {$cond:[{$and:[{$eq:['$payment_status','paid']},{$eq:[text('$payment_id'),'']}]},'paid_unverified','$payment_status']};
  case 'tournament':return {$ifNull:['$data.receiptTitle','$target']};
  case 'transaction':return {$cond:[{$eq:['$data.paymentMethod','manual']},'$data.manualProof.transactionId','$payment_id']};
  case 'amount':return {$divide:[{$ifNull:['$amount',0]},100]};
  default:return '$'+field.key;
 }
}
function converted(field:ReportField):unknown{
 const value=fieldExpression(field),norm=normalisedExpression(value);
 if(field.kind==='boolean')return {$switch:{branches:[{case:{$in:[norm,['yes','true','1']]},then:'yes'},{case:{$in:[norm,['no','false','0']]},then:'no'}],default:''}};
 if(field.kind==='upload')return {$cond:[{$and:[{$eq:[{$type:value},'string']},{$regexMatch:{input:text(value),regex:'^(?:/api/media/|https://)'}}]},'uploaded','not uploaded']};
 return norm;
}
function active(f:ReportFilter){return f.op==='in'?!!f.values?.length:f.op==='range'?f.min!==undefined||f.max!==undefined||!!f.from||!!f.to:!!f.value?.trim();}
function condition(f:ReportFilter,field:ReportField):Document{
 const expression=converted(field),raw=fieldExpression(field);
 if(f.op==='in')return {$in:[expression,literal(f.values!.map(normalise))]};
 if(f.op==='equals'&&field.kind==='number')return {$eq:[{$convert:{input:raw,to:'double',onError:null,onNull:null}},Number(f.value)]};
 if(f.op==='equals')return {$eq:[expression,literal(normalise(f.value!))]};
 if(f.op==='contains')return {$gte:[{$indexOfCP:[expression,literal(normalise(f.value!))]},0]};
 const value=field.kind==='date'?{$dateToString:{date:{$convert:{input:raw,to:'date',onError:null,onNull:null}},format:'%Y-%m-%d',timezone:'Asia/Kolkata',onNull:''}}:{$convert:{input:raw,to:'double',onError:null,onNull:null}};
 const parts:Document[]=[field.kind==='date'?{$ne:[value,'']}:{$ne:[value,null]}];
 if(f.min!==undefined)parts.push({$gte:[value,f.min]});if(f.max!==undefined)parts.push({$lte:[value,f.max]});
 if(f.from)parts.push({$gte:[value,literal(f.from)]});if(f.to)parts.push({$lte:[value,literal(f.to)]});
 return {$and:parts};
}
export function reportPipeline(query:ReportQuery,catalog:ReportCatalog):Document[]{
 const map=new Map(catalog.fields.map(f=>[f.id,f])),filters=query.filters.filter(active);
 const base:Document=query.target?{target:query.target,kind:{$in:['tournament','team']}}:query.view==='participants'?{kind:{$in:['tournament','team']}}:{};
 const pipeline:Document[]=[{$match:base}];
 if(query.search?.trim()){
  const choices=catalog.fields.filter(field=>field.source==='answer'&&field.kind!=='upload').map(field=>({$gte:[{$indexOfCP:[normalisedExpression(fieldExpression(field)),literal(normalise(query.search!))]},0]}));
  pipeline.push({$match:{$expr:choices.length?{$or:choices}:{$literal:false}}});
 }

 const ordinary=filters.filter(f=>map.get(f.field)!.source!=='member');
 if(ordinary.length)pipeline.push({$match:{$expr:{$and:ordinary.map(f=>condition(f,map.get(f.field)!))}}});
 pipeline.push({$set:{__members:{$cond:[{$eq:['$kind','team']},{$cond:[{$isArray:'$data.team'},'$data.team',[]]},[null]]}}},{$unwind:{path:'$__members',includeArrayIndex:'__index',preserveNullAndEmptyArrays:true}},{$set:{__member:'$__members',__participant:{$or:[{$eq:['$kind','tournament']},{$and:[{$eq:['$kind','team']},{$eq:[{$type:'$__members'},'object']}]}]}}});
 const members=filters.filter(f=>map.get(f.field)!.source==='member');
 if(members.length)pipeline.push({$match:{$expr:{$and:members.map(f=>condition(f,map.get(f.field)!))}}});
 return pipeline;
}
const group:Document={$group:{_id:'$_id',row:{$first:'$$ROOT'},members:{$push:'$__member'}}};
export function rowPipeline(query:ReportQuery,catalog:ReportCatalog):Document[]{
 const field=catalog.fields.find(f=>f.id===query.sort.field)!;
 return [...reportPipeline(query,catalog),...(query.view==='registrations'?[group,{$replaceWith:{$mergeObjects:['$row',{__matchedMembers:'$members'}]}}]:[{$match:{__participant:true}}]),
  {$set:{__sort:field.kind==='number'||field.kind==='date'?{$convert:{input:fieldExpression(field),to:field.kind==='date'?'date':'double',onError:null,onNull:null}}:normalisedExpression(fieldExpression(field))}},
  {$sort:{__sort:query.sort.direction==='asc'?1:-1,_id:1,__index:1}},
 ];
}
export async function reportCounts(db:Db,query:ReportQuery,catalog:ReportCatalog,session?:ClientSession){
 const [result]=await db.collection('requests').aggregate([...reportPipeline(query,catalog),{$facet:{registrations:[{$group:{_id:'$_id'}},{$count:'count'}],participants:[{$match:{__participant:true}},{$count:'count'}]}}],{allowDiskUse:true,maxTimeMS:60000,session}).toArray();
 return {registrations:Number(result?.registrations[0]?.count||0),participants:Number(result?.participants[0]?.count||0)};
}
const displayText=(v:unknown)=>v===null||v===undefined||typeof v==='object'?'':typeof v==='boolean'?v?'Yes':'No':String(v);
export function reportValue(row:Document,field:ReportField){
 let value:unknown;
 if(field.source==='answer')value=row.data?.answers&&Object.hasOwn(row.data.answers,field.key)?row.data.answers[field.key]:undefined;
 else if(field.source==='member')value=field.key==='name'&&row.kind==='tournament'?row.name:Array.isArray(row.__matchedMembers)?row.__matchedMembers.map(m=>m?.[field.key]).filter(v=>v!==undefined&&v!==null&&v!=='').map(displayText).join('\n'):row.__member?.[field.key];
 else switch(field.key){
  case 'registrationNumber':value=row.data?.registrationNumber||row.id;break;
  case 'tournament':value=row.data?.receiptTitle||row.target;break;
  case 'amount':value=(row.amount||0)/100;break;
  case 'paymentMethod':value=({manual:'Manual UPI',razorpay:'Razorpay',free:'No payment'} as Record<string,string>)[row.data?.paymentMethod]||row.data?.paymentMethod||((row.amount||0)>0?'Razorpay':'No payment');break;
  case 'transaction':value=row.data?.paymentMethod==='manual'?row.data?.manualProof?.transactionId:row.payment_id;break;
  case 'status':value=(registrationStatusLabels as Record<string,string>)[row.status]||row.status;break;
  case 'kind':value=(requestTypeLabels as Record<string,string>)[row.kind]||row.kind;break;
  case 'payment_status':value=row.payment_status==='paid'&&!row.payment_id?'Paid status — verification unavailable':(paymentStatusLabels as Record<string,string>)[row.payment_status]||row.payment_status;break;
  case 'created':value=Number.isFinite(Date.parse(row.created))?new Intl.DateTimeFormat('en-IN',{timeZone:'Asia/Kolkata',dateStyle:'medium',timeStyle:'short'}).format(new Date(row.created))+' IST':'';break;
  default:value=row[field.key];
 }
 if(field.kind==='upload')return typeof value==='string'&&/^(?:\/api\/media\/|https:\/\/)/.test(value)?'Document submitted':'Not uploaded';
 // No file links or internal identifiers can escape through a misconfigured text field.
 if(typeof value==='string'&&(/\/api\/media\//i.test(value)||/^https?:\/\//i.test(value)))return 'Link submitted';
 return displayText(value);
}
export function safeReportRow(row:Document,columns:string[],catalog:ReportCatalog):ReportRow{
 return {id:String(row.id||row._id),memberIndex:Number(row.__index??0),values:Object.fromEntries(columns.map(id=>[id,reportValue(row,catalog.fields.find(f=>f.id===id)!)]))};
}
export async function reportPage(db:Db,query:ReportQuery,catalog:ReportCatalog):Promise<ReportPage>{
 const session=db.client.startSession({snapshot:true});
 try{
  const counts=await reportCounts(db,query,catalog,session),total=counts[query.view];
  const rows=await db.collection('requests').aggregate([...rowPipeline(query,catalog),{$skip:(query.page-1)*query.pageSize},{$limit:query.pageSize}],{allowDiskUse:true,maxTimeMS:60000,session}).toArray();
  return {rows:rows.map(r=>safeReportRow(r,query.columns,catalog)),labels:Object.fromEntries(query.columns.map(id=>[id,catalog.fields.find(f=>f.id===id)!.displayLabel])),...counts,total,page:query.page,pageSize:query.pageSize};
 }finally{await session.endSession();}
}
export async function reportOptions(db:Db,query:ReportQuery,catalog:ReportCatalog,id:string,search:string){
 const field=catalog.fields.find(f=>f.id===id);if(!field)bad('Unknown field.');if(search.length>100)bad('Search is too long.');
 const unfiltered={...query,search:'',filters:[],view:'registrations' as const};
 const expression=converted(field!),normSearch=normalise(search);
 const actual=await db.collection('requests').aggregate<{_id:string;label:string}>([...reportPipeline(unfiltered,catalog),{$project:{value:expression,label:field!.kind==='upload'||field!.kind==='boolean'?expression:text(fieldExpression(field!))}},{$match:{$expr:{$and:[{$ne:['$value','']},{$not:[{$regexMatch:{input:'$value',regex:'(?:/api/media/|^https?://)'}}]},{$gte:[{$indexOfCP:['$value',literal(normSearch)]},0]}]}}},{$group:{_id:'$value',label:{$min:'$label'}}},{$sort:{_id:1}},{$limit:51}],{allowDiskUse:true,maxTimeMS:30000}).toArray();
 const labels=field!.key==='status'?registrationStatusLabels:field!.key==='payment_status'?{...paymentStatusLabels,paid_unverified:'Paid status — verification unavailable'}:field!.key==='paymentMethod'?{manual:'Manual UPI',razorpay:'Razorpay',free:'No payment'}:field!.key==='kind'?requestTypeLabels:{};
 const configured=[...field!.options,...Object.keys(labels),...(field!.kind==='boolean'?['Yes','No']:field!.kind==='upload'?['Uploaded','Not uploaded']:[])].filter(v=>normalise(v).includes(normSearch)||normalise((labels as Record<string,string>)[v]||'').includes(normSearch));
 const values=new Map<string,{value:string;label:string}>();
 for(const v of configured)values.set(normalise(v),{value:v,label:(labels as Record<string,string>)[v]||v});
 for(const v of actual)if(!values.has(v._id))values.set(v._id,{value:field!.kind==='boolean'?v._id==='yes'?'Yes':'No':field!.kind==='upload'?v._id==='uploaded'?'Uploaded':'Not uploaded':v._id,label:(labels as Record<string,string>)[v._id]||v.label});
 return {values:[...values.values()].sort((a,b)=>a.label.localeCompare(b.label)).slice(0,50),hasMore:actual.length>50||values.size>50};
}
