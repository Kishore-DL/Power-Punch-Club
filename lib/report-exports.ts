import {GridFSBucket,ObjectId,type Db} from 'mongodb';
import {Readable,Transform} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import {once} from 'node:events';
import {randomUUID} from 'node:crypto';
import sharp from 'sharp';
import ExcelJS from 'exceljs';
import {mongoClient,contentRecords,duplicateKey} from './mongodb';
import {logoBytes} from './registration-document';
import {reportPdf} from './report-pdf';
import {reportCounts,reportLimits,rowPipeline,safeReportRow} from './registration-report';
import type {ClubContent} from './club-types';
import type {Account} from './password-auth';
import type {ExportStatus,ReportCatalog,ReportQuery,ReportRow} from './report-types';

type Job={_id:string;owner:string;accountKey:string;version:string;requestId:string;active:boolean;status:ExportStatus['status'];format:'xlsx'|'pdf';query:ReportQuery;catalog:ReportCatalog;brand:ClubContent['branding'];title:string;created:Date;expiresAt:Date;leaseUntil?:Date;processed:number;total?:number;error?:string;filename:string;fileId?:ObjectId};
export class ReportBusyError extends Error {}
const jobs=(db:Db)=>db.collection<Job>('admin_export_jobs');
const bucket=(db:Db)=>new GridFSBucket(db,{bucketName:'admin_reports'});
const mime={xlsx:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',pdf:'application/pdf'};
export const exportStatus=(job:Job):ExportStatus=>({id:job._id,status:job.status,format:job.format,processed:job.processed,total:job.total,error:job.error,filename:job.filename});
export async function cleanReports(db:Db){
 const expired=await jobs(db).find({expiresAt:{$lt:new Date()}}).limit(10).toArray();
 for(const job of expired){if(job.fileId){await db.collection('admin_reports.files').deleteOne({_id:job.fileId});await db.collection('admin_reports.chunks').deleteMany({files_id:job.fileId});}await jobs(db).deleteOne({_id:job._id,expiresAt:{$lt:new Date()}});}
}
export async function createReportJob(db:Db,account:Account,key:string,query:ReportQuery,catalog:ReportCatalog,content:ClubContent,format:'pdf'|'xlsx',requestId:string){
 await cleanReports(db);
 const previous=await jobs(db).findOne({owner:account.id,requestId});if(previous)return previous;
 const active=await jobs(db).findOne({owner:account.id,active:true});
 if(active&&active.leaseUntil&&active.leaseUntil<new Date())await jobs(db).updateOne({_id:active._id},{$set:{status:'failed',active:false,error:'Export was interrupted. Please start it again.'}});
 else if(active)throw new ReportBusyError('An export is already in progress. Wait for it to finish.');
 const id=randomUUID(),now=new Date();
 const job:Job={_id:id,owner:account.id,accountKey:key,version:account.version,requestId,active:true,status:'queued',format,query:{...query,page:1},catalog,brand:content.branding,title:catalog.events.find(e=>e.id===query.target)?.title||'All tournaments / requests',created:now,expiresAt:new Date(now.getTime()+24*3600000),leaseUntil:new Date(now.getTime()+10*60000),processed:0,filename:'power-punch-'+query.view+'-'+now.toISOString().slice(0,10)+'.'+format};
 try{await jobs(db).insertOne(job);}catch(error){if(!duplicateKey(error))throw error;const existing=await jobs(db).findOne({owner:account.id,requestId});if(existing)return existing;throw new ReportBusyError('Another export is in progress. Please retry shortly.');}
 return job;
}
const filtersText=(job:Job)=>[job.query.search?'Search: '+job.query.search:'',...job.query.filters.map(f=>{
 const name=job.catalog.fields.find(field=>field.id===f.field)?.displayLabel||'Field';
 const values=f.op==='in'?(f.values||[]).join(' OR '):f.op==='range'?[f.from?`from ${f.from} IST`:undefined,f.to?`through ${f.to} IST (inclusive)`:undefined,f.min!==undefined?'min '+f.min:undefined,f.max!==undefined?'max '+f.max:undefined].filter(Boolean).join(', '):f.value||'';
 return values?name+' '+f.op+': '+values:'';
})].filter(Boolean).join(' AND ');
export async function workReportJob(db:Db,id:string){
 const job=await jobs(db).findOneAndUpdate({_id:id,status:'queued',expiresAt:{$gt:new Date()}},{$set:{status:'running',leaseUntil:new Date(Date.now()+10*60000)}},{returnDocument:'after'});
 if(!job)return;
 const upload=bucket(db).openUploadStream(job.filename,{metadata:{owner:job.owner,reportJob:job._id,contentType:mime[job.format]}});
 let written=0;
 const meter=new Transform({transform(chunk,encoding,callback){written+=chunk.length;if(written>50*1024*1024)return callback(Error('Export exceeds 50 MB. Narrow the filters.'));callback(null,chunk);}});
 const transfer=pipeline(meter,upload);transfer.catch(()=>{});
 // Always consume stream errors; abort also cleans partially uploaded chunks.
 let uploadError:Error|undefined;upload.on('error',error=>{uploadError=error;});
 await jobs(db).updateOne({_id:id},{$set:{fileId:upload.id}});
 const session=mongoClient().startSession({snapshot:true});
 let completed=false;
 try{
  const account=await contentRecords(db).findOne({_id:job.accountKey});if((account?.value as Account)?.version!==job.version)throw Error('Sign in again before exporting.');
  const counts=await reportCounts(db,job.query,job.catalog,session),total=counts[job.query.view],limit=job.format==='pdf'?reportLimits.pdfRows:reportLimits.xlsxRows;
  if(total>limit)throw Error(`This ${job.format.toUpperCase()} export has ${total} rows; the safe limit is ${limit}. Narrow the filters or select the other format.`);
  if(total===0)throw Error('No matching rows. Change the filters before exporting.');
  await jobs(db).updateOne({_id:id},{$set:{total}});
  const columns=job.query.columns.map(id=>job.catalog.fields.find(f=>f.id===id)!);
  const filterSummary=filtersText(job),time=new Intl.DateTimeFormat('en-IN',{timeZone:'Asia/Kolkata',dateStyle:'medium',timeStyle:'medium'}).format(job.created)+' IST';
  if(filterSummary.length>12000||job.title.length>1000||job.brand.name.length>300)throw Error('Report headings are too large. Use shorter filter selections.');
  const cursor=db.collection('requests').aggregate(rowPipeline(job.query,job.catalog),{allowDiskUse:true,maxTimeMS:120000,batchSize:250,session});
  const rows:ReportRow[]=[];let processed=0,characters=0;
  const workbook=job.format==='xlsx'?new ExcelJS.stream.xlsx.WorkbookWriter({stream:meter,useStyles:true,useSharedStrings:false}):undefined;
  const sheet=workbook?.addWorksheet('Registrations',{views:[{state:'frozen',ySplit:1}]});
  if(sheet){
   sheet.columns=columns.map(field=>({header:field.displayLabel,key:field.id,width:Math.min(45,Math.max(18,field.label.length+4)),style:{numFmt:'@',alignment:{vertical:'top',wrapText:true}}}));
   sheet.autoFilter={from:{row:1,column:1},to:{row:total+1,column:columns.length}};
   sheet.getRow(1).font={bold:true,color:{argb:'FFFFFFFF'}};sheet.getRow(1).fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF27364A'}};sheet.getRow(1).height=30;sheet.getRow(1).commit();
  }
  try{
   for await(const record of cursor){
    const row=safeReportRow(record,job.query.columns,job.catalog),values=columns.map(f=>row.values[f.id]);
    if(values.some(v=>v.length>32767))throw Error('A cell exceeds the Excel text limit. Narrow the report or remove that column.');
    processed++;characters+=values.reduce((sum,s)=>sum+s.length,0);
    if(job.format==='pdf'&&characters>reportLimits.pdfCharacters)throw Error('PDF text exceeds 2,000,000 characters. Use Excel or narrow the filters.');
    if(sheet){const line=sheet.addRow(values);line.eachCell(cell=>{cell.value=String(cell.value??'');cell.numFmt='@';});line.height=Math.min(409,Math.max(20,...values.map((v,i)=>v.split('\n').reduce((sum,line)=>sum+Math.max(1,Math.ceil(line.length/Math.min(45,Math.max(18,columns[i].label.length+4)))),0)*15)));line.commit();if(meter.writableNeedDrain)await once(meter,'drain');}
    else rows.push(row);
    if(written>50*1024*1024)throw Error('Export exceeds 50 MB. Narrow the filters.');
    if(processed%250===0){if(Date.now()-job.created.getTime()>8*60000)throw Error('Export exceeded the eight-minute limit. Narrow the filters.');await jobs(db).updateOne({_id:id,status:'running'},{$set:{processed,leaseUntil:new Date(Date.now()+10*60000)}});}
   }
  }finally{await cursor.close();}
  if(processed!==total)throw Error('Report snapshot changed. Please start the export again.');
  const latest=await contentRecords(db).findOne({_id:job.accountKey});if((latest?.value as Account)?.version!==job.version)throw Error('Account changed. Sign in and export again.');
  if(workbook){sheet!.commit();await workbook.commit();await transfer;}
  else{
   let logo:Uint8Array|undefined;try{const source=await logoBytes(job.brand.logo);if(source)logo=await sharp(source).resize({width:120,height:120,fit:'inside',withoutEnlargement:true}).png().toBuffer();}catch{/* Name identifies the club. */}
   const bytes=await reportPdf({club:job.brand.name,tournament:job.title,title:job.query.view==='participants'?'Participant report':'Registration report',generatedAt:time,filters:filterSummary,count:processed,...counts,fields:columns,rows,deadline:job.created.getTime()+8*60000},logo);
   if(bytes.length>50*1024*1024)throw Error('PDF exceeds 50 MB. Narrow the filters.');
   meter.end(Buffer.from(bytes));await transfer;
  }
  if(uploadError)throw uploadError;
  if(written>50*1024*1024)throw Error('Export exceeds 50 MB. Narrow the filters.');
  completed=true;
  await jobs(db).updateOne({_id:id,status:'running'},{$set:{status:'complete',active:false,processed,total:processed}});
 }catch(error){
  const message=error instanceof Error&&/^(This |No matching|Report |PDF |Export |A cell |Account changed|Sign in|Report headings)/.test(error.message)?error.message:'Export generation failed. Please retry; contact the administrator if it continues.';
  await jobs(db).updateOne({_id:id},{$set:{status:'failed',active:false,error:message}});
 }finally{
  await session.endSession();
  if(!completed){meter.destroy();try{await upload.abort();}catch{/* Completed upload is removed below. */}await transfer.catch(()=>{});await db.collection('admin_reports.files').deleteOne({_id:upload.id});await db.collection('admin_reports.chunks').deleteMany({files_id:upload.id});}
 }
}
export async function findReportJob(db:Db,id:string,account:Account){
 if(!/^[a-f0-9-]{36}$/i.test(id))return null;
 const job=await jobs(db).findOne({_id:id,owner:account.id,version:account.version,expiresAt:{$gt:new Date()}});
 if(job?.status==='running'&&job.leaseUntil&&job.leaseUntil<new Date()){
  await jobs(db).updateOne({_id:id,status:'running'},{$set:{status:'failed',active:false,error:'Export was interrupted. Please start it again.'}});return {...job,status:'failed' as const,error:'Export was interrupted. Please start it again.'};
 }return job;
}
export function reportDownload(db:Db,job:Job){
 if(job.status!=='complete'||!job.fileId)return Response.json({error:'Export is not ready.'},{status:409,headers:{'Cache-Control':'private, no-store'}});
 const stream=bucket(db).openDownloadStream(job.fileId);
 return new Response(Readable.toWeb(stream) as ReadableStream,{headers:{'Content-Type':mime[job.format],'Content-Disposition':`attachment; filename="${job.filename}"`,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
}
