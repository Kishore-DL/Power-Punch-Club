import type {Db} from 'mongodb';
import {after} from 'next/server';
import {randomUUID} from 'node:crypto';
import type {ClubContent} from './club-types';
import type {Account} from './password-auth';
import {visibleRegistration} from './mongodb';
import {ReportInputError,reportCatalog,reportOptions,reportPage,validateReportQuery} from './registration-report';
import {createReportJob,exportStatus,findReportJob,reportDownload,workReportJob,ReportBusyError} from './report-exports';
import type {ReportPreset} from './report-types';

const json=(value:unknown,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
async function body(req:Request){
 if(Number(req.headers.get('Content-Length')||0)>50000)throw new ReportInputError('Report request is too large.');
 const text=await req.text();if(text.length>50000)throw new ReportInputError('Report request is too large.');
 let data;try{data=JSON.parse(text);}catch{throw new ReportInputError('Invalid JSON request.');}
 if(!data||typeof data!=='object'||Array.isArray(data))throw new ReportInputError('Invalid request.');
 return data as Record<string,unknown>;
}
async function endpointCatalog(db:Db,content:ClubContent,target:string){
 const catalog=await reportCatalog(db,content,target);
 const practice=process.env.PPC_FILTER_PRACTICE==='true'&&db.databaseName==='ppc_preview_filter_practice'&&/^mongodb:\/\/(?:127\.0\.0\.1|localhost):/.test(process.env.MONGODB_URI||'');
 if(practice){const student=catalog.fields.find(field=>field.id==='answer:practice-student-name');if(student)student.displayLabel=student.label;}
 return {...catalog,...(practice?{practice:true}:{})};
}
export async function reportEndpoint(path:string,req:Request,db:Db,content:ClubContent,session:{key:string;account:Account}){
 if(session.account.role!=='admin')return json({error:'Admin access required'},403);
 const url=new URL(req.url),owner=session.account.id;
 try{
  if(path==='catalog'&&req.method==='GET')return json(await endpointCatalog(db,content,url.searchParams.get('target')||''));
  if(path==='record'&&req.method==='GET'){
   const id=url.searchParams.get('id');if(!id||id.length>128)return json({error:'Invalid registration'},400);
   const row=await db.collection<import('./mongodb').Registration>('requests').findOne({_id:id});return row?json(visibleRegistration(row)):json({error:'Registration not found'},404);
  }
  if(path==='presets'){
   const prefs=db.collection<{_id:string;presets:ReportPreset[]}>('admin_report_preferences');
   if(req.method==='GET')return json({presets:(await prefs.findOne({_id:owner}))?.presets||[]});
   const data=await body(req),id=String(data.id||'');
   if(req.method==='DELETE'){
    if(!/^[a-f0-9-]{36}$/i.test(id))return json({error:'Invalid preset'},400);
    await prefs.updateOne({_id:owner},{$pull:{presets:{id}}});return json({ok:true});
   }
   if(typeof data.name!=='string'||!data.name.trim()||data.name.length>80)return json({error:'Enter a preset name (1–80 characters).'},400);
   if(req.method==='PUT'){
    const result=await prefs.updateOne({_id:owner,'presets.id':id},{$set:{'presets.$.name':data.name.trim()}});return result.matchedCount?json({ok:true}):json({error:'Preset not found'},404);
   }
   if(req.method==='POST'){
    const target=(data.query as Record<string,unknown>)?.target,catalog=await endpointCatalog(db,content,typeof target==='string'?target:'');
    const query=validateReportQuery(data.query,catalog),preset={id:randomUUID(),name:data.name.trim(),query};
    await prefs.updateOne({_id:owner},{$setOnInsert:{presets:[]}},{upsert:true});
    const result=await prefs.updateOne({_id:owner,'presets.19':{$exists:false}},{$push:{presets:preset}});
    return result.matchedCount?json(preset):json({error:'Keep at most 20 saved presets. Delete one before saving.'},400);
   }
  }
  if(path==='exports'&&req.method==='GET'){
   const rows=await db.collection('admin_export_jobs').find({owner,version:session.account.version,expiresAt:{$gt:new Date()}}).sort({created:-1}).limit(10).toArray();
   return json({jobs:rows.map(row=>({id:String(row._id),status:row.status,format:row.format,processed:row.processed,total:row.total,error:row.error,filename:row.filename}))});
  }
  if((path==='export'||path==='file')&&req.method==='GET'){
   const job=await findReportJob(db,url.searchParams.get('id')||'',session.account);
   if(!job)return json({error:'Export not found or expired. Create it again.'},404);
   if(path==='file')return reportDownload(db,job);
   if(job.status==='queued')after(()=>workReportJob(db,job._id));return json(exportStatus(job));
  }
  if(req.method==='POST'&&['list','options','exports'].includes(path)){
   const data=await body(req),target=(data.query as Record<string,unknown>)?.target;
   const catalog=await endpointCatalog(db,content,typeof target==='string'?target:''),query=validateReportQuery(data.query,catalog);
   if(path==='list')return json(await reportPage(db,query,catalog));
   if(path==='options'){
    if(typeof data.field!=='string'||typeof data.search!=='string')return json({error:'Choose a field and a text search.'},400);
    return json(await reportOptions(db,query,catalog,data.field,data.search));
   }
   if(data.format!=='pdf'&&data.format!=='xlsx')return json({error:'Choose PDF or Excel.'},400);
   if(typeof data.requestId!=='string'||!/^[a-f0-9-]{36}$/i.test(data.requestId))return json({error:'Invalid export request ID.'},400);
   let job;try{job=await createReportJob(db,session.account,session.key,query,catalog,content,data.format,data.requestId);}catch(error){if(error instanceof ReportBusyError)return json({error:'An export is already in progress. Refresh its status before starting another.'},409);throw error;}
   after(()=>workReportJob(db,job._id));return json(exportStatus(job),202);
  }
  return json({error:'Report endpoint not found or method not allowed'},404);
 }catch(error){
  if(error instanceof ReportInputError)return json({error:error.message},400);
  return json({error:'Unable to load the report. Refresh or narrow the filters and try again.'},503);
 }
}
