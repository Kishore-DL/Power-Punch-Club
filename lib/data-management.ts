import {createHash,randomUUID} from 'node:crypto';
import type {Db,Document} from 'mongodb';
import {mongoClient,registrations,contentRecords,type Registration} from './mongodb';
import {ownerKey,passwordMatches,getAccount,type Account} from './password-auth';
import {mediaReferences,fileIsReferenced} from './file-references.mjs';
import {withMutationLock,fenceMutation} from './mutation-lock.mjs';
import {B2Store} from './b2-storage.mjs';

type Scope={action:'registration'|'tournament-registrations'|'all-registrations'|'tournament-history';id?:string};
type Owner={key:string;account:Account};
const collection=(db:Db,name:string)=>db.collection<Document & {_id:string}>(name);
const hash=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const reply=(value:unknown,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'private, no-store'}});
class ManagementError extends Error{constructor(message:string,public status=400){super(message);}}
async function freshOwner(db:Db,owner:Owner){const current=await getAccount(db,ownerKey);if(!current||current.id!==owner.account.id||current.version!==owner.account.version||current.role!=='admin'||current.owner!==true)throw new ManagementError('Owner session changed. Sign in again.',403);return current;}
function scopeOf(value:unknown):Scope{
 const scope=value as Scope;if(!scope||!['registration','tournament-registrations','all-registrations','tournament-history'].includes(scope.action)||scope.action!=='all-registrations'&&(typeof scope.id!=='string'||!scope.id||scope.id.length>128))throw new ManagementError('Choose a valid scope.');
 return {action:scope.action,...(scope.action!=='all-registrations'?{id:scope.id}:{})};
}
async function snapshot(db:Db,scope:Scope){
 const events=await contentRecords(db).findOne({_id:'tournaments'}),list=Array.isArray(events?.value)?events.value:[],event=list.find(item=>item.id===scope.id);
 if(scope.action.startsWith('tournament')&&event&&event.status!=='closed')throw new ManagementError('Close/archive this tournament before permanent deletion.');
 const query=scope.action==='registration'?{$or:[{_id:scope.id},{'data.registrationNumber':scope.id}]}:scope.action==='all-registrations'?{}:{target:scope.id,kind:{$in:['tournament','team']}};
 const rows:Registration[]=[];let bytes=0;const cursor=registrations(db).find(query).sort({_id:1});
 try{for await(const row of cursor){bytes+=Buffer.byteLength(JSON.stringify(row));if(rows.length>=10000||bytes>12*1024*1024)throw new ManagementError('Scope exceeds the safe 10,000-record / 12 MB text limit. Use smaller closed-tournament or individual scopes.');rows.push(row);}}finally{await cursor.close();}
 if(scope.action==='all-registrations'&&rows.some(row=>['tournament','team'].includes(row.kind)&&list.some(event=>event.id===row.target&&event.status!=='closed')))throw new ManagementError('Close/archive every included tournament before deleting all registrations.');
 if(scope.action==='registration'&&rows.length>1)throw new ManagementError('Registration reference is ambiguous. Use its unique internal ID.');
 if(scope.action==='registration'&&!rows.length)throw new ManagementError('Registration not found.',404);
 if(rows.length>10000)throw new ManagementError('This scope exceeds the safe 10,000-record deletion limit. Delete closed tournaments in smaller scopes.');
 const associated=rows.length?await collection(db,'files').find({_id:/^private\//,$or:[{registrationIds:{$in:rows.map(row=>row.id)}},{registrationToken:{$in:rows.map(row=>row.token)}}]},{projection:{_id:1,provider:1,objectKey:1,versionId:1,sha256:1,size:1,state:1}}).sort({_id:1}).toArray():[];
 const keys=[...new Set([...rows.flatMap(row=>mediaReferences(row.data)).filter(key=>key.startsWith('private/')),...associated.map(file=>file._id),...(scope.action==='tournament-history'?mediaReferences(event):[])])];
 const counts={registrations:rows.length,students:rows.reduce((sum,row)=>sum+(row.kind==='team'?row.data.team?.length||0:row.kind==='tournament'?1:0),0),paid:rows.filter(row=>row.payment_status==='paid').length,files:keys.length,kinds:[...new Set(rows.map(row=>row.kind))].sort()};
 return {rows,keys,counts,event,fingerprint:hash({scope,rows,event,keys,associated})};
}
export async function resumeDeletion(db:Db,id:string,owner:Owner){
 return withMutationLock(db,async()=>{
  await freshOwner(db,owner);
  const jobs=collection(db,'data_deletion_jobs'),job=await jobs.findOne({_id:id});if(!job)return null;
  if(job.status==='complete')return job;
  await jobs.updateOne({_id:id},{$set:{status:'running'},$inc:{attempts:1}});
  const failures:string[]=[];
  // Export jobs are revoked in the same Mongo transaction as registration deletion.
  for(const report of await collection(db,'admin_export_jobs').find({revokedBy:id}).toArray()){
   try{if(report.leaseUntil&&report.leaseUntil>new Date()){failures.push('A revoked export worker may still be finishing. Retry cleanup after its lease expires.');continue;}if(report.b2){await new B2Store().erase('documents',report.b2.objectKey);}if(report.fileId){await db.collection('admin_reports.chunks').deleteMany({files_id:report.fileId});await db.collection('admin_reports.files').deleteOne({_id:report.fileId});}await collection(db,'admin_export_jobs').deleteOne({_id:report._id,revokedBy:id});}catch{failures.push('A revoked report could not be erased. Check B2 permissions/retention and retry.');}
  }
  for(const key of job.files as string[]){
   try{
    if(await fileIsReferenced(db,key))continue;
    const files=collection(db,'files'),file=await files.findOne({_id:key});if(!file)continue;
    await files.updateOne({_id:key},{$set:{state:'deleting',approvedPublic:false}});
    if(file.provider==='b2')await new B2Store().erase(file.bucketClass,file.objectKey);
    if(file.migrationCopy?.objectKey&&file.migrationCopy.objectKey!==file.objectKey)await new B2Store().erase(file.migrationCopy.bucketClass,file.migrationCopy.objectKey);
    await files.deleteOne({_id:key,state:'deleting'});
   }catch{failures.push('An unreferenced file could not be erased. Object Lock, retention or permissions may block deletion.');}
  }
  await jobs.updateOne({_id:id},{$set:{status:failures.length?'partial':'complete',issues:[...new Set(failures)],updated:new Date()},...(!failures.length?{$unset:{files:''}}:{})});
  return jobs.findOne({_id:id});
 });
}
export async function dataManagement(path:string,req:Request,db:Db,owner:Owner|null){
 if(owner?.key!==ownerKey||owner.account.owner!==true||owner.account.role!=='admin')return reply({error:'Owner access required.'},403);
 try{
  if(req.method==='GET'&&path==='jobs')return reply(await collection(db,'data_deletion_jobs').find({}).project({files:0}).sort({created:-1}).limit(30).toArray());
  if(req.method!=='POST')return reply({error:'Method not allowed.'},405);
  const body=await req.json() as Record<string,unknown>;
  if(path==='retry'){if(typeof body.id!=='string')throw new ManagementError('Choose a deletion job.');const job=await resumeDeletion(db,body.id,owner);if(!job)return reply({error:'Job not found.'},404);const {files:_,...safe}=job;void _;return reply(safe);}
  return await withMutationLock(db,async()=>{
   const currentOwner=await freshOwner(db,owner);
   const scope=scopeOf(body.scope),view=await snapshot(db,scope),confirmations=collection(db,'data_delete_confirmations');
   const phrase='DELETE '+view.counts.registrations+' REGISTRATIONS';
   if(path==='backup'){
    if(typeof body.password!=='string'||body.password.length>128||!await passwordMatches(body.password,currentOwner))throw new ManagementError('Current Owner password is required.',403);
    // Explicit separate retained copy; no secrets, session/tracking tokens or private URLs.
    const rows=view.rows.map(({id,kind,target,name,email,phone,data,status,amount,payment_status,created})=>({id,kind,target,name,email,phone,status,amount,payment_status,created,data:{registrationNumber:data.registrationNumber,receiptTitle:data.receiptTitle,answers:Object.fromEntries(Object.entries(data.answers||{}).filter(([key,value])=>!['file','photo','masked_aadhaar'].includes(data.receiptFields?.[key]?.type||'')&&!/aadhaar|aadhar|tracking|token|secret|password|admin.?notes/i.test(key+' '+(data.receiptFields?.[key]?.label||''))&&!String(value).includes('/api/media/'))),team:data.team}}));
    return new Response(JSON.stringify({exportedAt:new Date(),scope,registrations:rows},null,2),{headers:{'Content-Type':'application/json','Content-Disposition':'attachment; filename="private-registration-backup.json"','Cache-Control':'private, no-store'}});
   }
   if(path==='preview'){
    const token=randomUUID();await confirmations.insertOne({_id:hash(token),owner:owner.account.id,version:owner.account.version,scope,fingerprint:view.fingerprint,expiresAt:new Date(Date.now()+300000)});
    return reply({token,phrase,...view.counts,warning:'Permanent deletion does not refund payments. Backups are separate retained copies. Shared files are retained; orphan files and stored reports are erased by a resumable job.'});
   }
   if(path!=='execute')throw new ManagementError('Unknown action.',404);
   const confirmation=typeof body.token==='string'&&await confirmations.findOne({_id:hash(body.token),owner:owner.account.id,version:owner.account.version,expiresAt:{$gt:new Date()}});
   if(!confirmation||hash(confirmation.scope)!==hash(scope)||confirmation.fingerprint!==view.fingerprint)throw new ManagementError('Data changed or confirmation expired. Preview again.',409);
   if(body.phrase!==phrase||typeof body.password!=='string'||body.password.length>128||!await passwordMatches(body.password,currentOwner))throw new ManagementError('Enter the exact phrase and current Owner password.',403);
   const id=randomUUID(),ids=view.rows.map(row=>row.id),now=new Date();
   await mongoClient().withSession(session=>session.withTransaction(async()=>{
    await fenceMutation(db,session);
    await collection(db,'data_deletion_jobs').insertOne({_id:id,scope,owner:owner.account.id,counts:view.counts,files:view.keys,status:'pending',created:now,updated:now,attempts:0},{session});
    if(ids.length){
     await collection(db,'registration_tombstones').bulkWrite(ids.map(key=>({updateOne:{filter:{_id:key},update:{$setOnInsert:{deletedAt:now,job:id}},upsert:true}})),{session});
     await db.collection('outbox').updateMany({registrationId:{$in:ids}},{$set:{status:'skipped',skipReason:'Registration permanently deleted; notification cancelled.',skippedAt:now.toISOString()},$unset:{body:'',html:'',subject:'',recipient:'',lease:'',leaseUntil:''}},{session});
     await registrations(db).deleteMany({_id:{$in:ids}},{session});
    }
    if(scope.action==='tournament-history')await contentRecords(db).updateOne({_id:'tournaments'},{$pull:{value:{id:scope.id}}} as Document,{session});
    const revoke={$set:{status:'failed',active:false,revokedBy:id,error:'Revoked after permanent data deletion.'},$unset:{query:'',catalog:'',brand:''}};
    await collection(db,'admin_export_jobs').updateMany({revokedBy:{$exists:false},status:'running'},revoke,{session});
    await collection(db,'admin_export_jobs').updateMany({revokedBy:{$exists:false},status:{$ne:'running'}},{...revoke,$unset:{...revoke.$unset,leaseUntil:''}},{session});
    await confirmations.deleteOne({_id:confirmation._id},{session});
    // No selected rows, names, payment IDs or tokens retained in audit.
    await db.collection('audit').insertOne({action:'Owner permanent data deletion',owner:owner.account.id,job:id,counts:view.counts,created:now.toISOString()},{session});
   }));
   return reply({id,status:'pending',...view.counts,message:'Records removed. Run Resume cleanup to erase unreferenced files/revoked exports. Partial B2 erasure is reported separately.'},202);
  });
 }catch(error){return reply({error:error instanceof ManagementError?error.message:'Data management could not complete. Retry safely; no storage credentials are shown.'},error instanceof ManagementError?error.status:503);}
}
