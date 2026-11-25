import {randomUUID} from 'node:crypto';
import {sha256,detectedFileType} from './b2-storage.mjs';
import {mediaReferences,fileIsReferenced} from './file-references.mjs';
import {withMutationLock} from './mutation-lock.mjs';

export async function storageInventory(db){
 const [reports]=await db.collection('admin_reports.files').aggregate([{$group:{_id:null,count:{$sum:1},bytes:{$sum:'$length'}}}]).toArray();
 const result={legacy:0,b2:0,stagedCopies:0,pending:0,bytes:0,media:0,documents:0,legacyReportFiles:reports?.count||0,legacyReportBytes:reports?.bytes||0};
 for await(const row of db.collection('files').find({})){result[row.provider==='b2'?'b2':'legacy']++;if(row.copyVerifiedAt&&row.provider!=='b2')result.stagedCopies++;if(row.state==='pending')result.pending++;result.bytes+=row.data?.length?.()||row.size||0;result[row._id.startsWith('public/')?'media':'documents']++;}
 return result;
}
async function approvedWebsiteFile(db,key){for await(const row of db.collection('content').find({_id:{$not:/^private-/}},{projection:{value:1}}))if(mediaReferences(row.value).includes(key))return true;return false;}
// Copies and verifies before CAS reference switch. Source bytes remain until explicit cleanup.
export async function migrateFile(db,store,key,{cleanup=false,rollback=false,copyOnly=false,journal=async()=>{}}={}){
 return withMutationLock(db,async()=>{
  const files=db.collection('files'),row=await files.findOne({_id:key});if(!row)return {status:'missing'};
  if(rollback){
   if(row.provider!=='b2')return {status:'already-legacy'};
   if(!row.data||sha256(row.data.value())!==row.sha256)throw Error('Original MongoDB binary is unavailable or changed; rollback refused.');
   await journal({id:key,operation:'rollback',copy:{bucketClass:row.bucketClass,objectKey:row.objectKey,versionId:row.versionId}});
   await files.updateOne({_id:key,provider:'b2',versionId:row.versionId},{$set:{migrationCopy:{bucketClass:row.bucketClass,objectKey:row.objectKey,versionId:row.versionId}},$unset:{provider:'',bucketClass:'',objectKey:'',versionId:''}});return {status:'rolled-back-copy-retained'};
  }
  if(row.provider==='b2'){
   const bytes=await store.get(row);if(bytes.byteLength!==row.size||sha256(bytes)!==row.sha256)throw Error('Migrated object failed verification.');
   if(cleanup&&row.data){if(sha256(row.data.value())!==row.sha256)throw Error('Source binary changed; cleanup refused.');await journal({id:key,operation:'source-binary-cleanup',sha256:row.sha256});await files.updateOne({_id:key,provider:'b2',versionId:row.versionId,sha256:row.sha256},{$unset:{data:''},$set:{sourceCleanedAt:new Date()}});}
   return {status:cleanup?'verified-source-cleaned':'already-migrated-verified'};
  }
  if(cleanup)throw Error('Copy and verify before source cleanup.');
  if(!row.data)return {status:'no-source'};
  const bytes=new Uint8Array(row.data.value()),checksum=sha256(bytes),type=detectedFileType(bytes);
  if(!type||type!==row.type)throw Error('Source signature/type mismatch; manual review required.');
  const bucketClass=key.startsWith('public/')?'media':'documents';
  const copy=row.migrationCopy||{bucketClass,objectKey:'migration/'+randomUUID()};
  await files.updateOne({_id:key,provider:{$ne:'b2'}},{$set:{migrationCopy:copy}});
  if(!copy.versionId){copy.versionId=await store.put(bucketClass,copy.objectKey,bytes,type,checksum);await files.updateOne({_id:key,provider:{$ne:'b2'}},{$set:{migrationCopy:copy}});}
  const verified=await store.get({...copy,sha256:checksum});if(verified.byteLength!==bytes.byteLength||sha256(verified)!==checksum)throw Error('Copy checksum verification failed. Reference not switched.');
  const approvedPublic=bucketClass==='media'&&(row.approvedPublic===true||await approvedWebsiteFile(db,key));
  if(copyOnly){
   await journal({id:key,operation:'verified-copy-only',sha256:checksum,copy,sourceRetained:true});
   const result=await files.updateOne({_id:key,provider:{$ne:'b2'},data:row.data,'migrationCopy.versionId':copy.versionId},{$set:{migrationCopy:{...copy,sha256:checksum,size:bytes.byteLength,type,approvedPublic},copyVerifiedAt:new Date()}});
   if(!result.matchedCount)throw Error('Source changed; verified reference switch deferred.');
   return {status:'copied-verified-switch-deferred'};
  }
  await journal({id:key,operation:'switch',sha256:checksum,copy,sourceRetained:true});
  const result=await files.updateOne({_id:key,provider:{$ne:'b2'},'migrationCopy.versionId':copy.versionId},{$set:{provider:'b2',...copy,sha256:checksum,size:bytes.byteLength,type,approvedPublic,state:'ready',migratedAt:new Date()}});
  return {status:result.matchedCount?'copied-verified-source-retained':'changed-retry'};
 });
}
export async function cleanupAbandoned(db,store,{now=new Date(),limit=100}={}){
 return withMutationLock(db,async()=>{
  let removed=0,blocked=0,retained=0;
  const rows=await db.collection('files').find({provider:'b2',claimed:false,expiresAt:{$lt:now},state:{$in:['pending','ready','deleting']}}).limit(limit).toArray();
  for(const row of rows){if(await fileIsReferenced(db,row._id)){retained++;continue;}try{await db.collection('files').updateOne({_id:row._id,claimed:false},{$set:{state:'deleting',approvedPublic:false}});await store.erase(row.bucketClass,row.objectKey);await db.collection('files').deleteOne({_id:row._id,claimed:false,state:'deleting'});removed++;}catch{blocked++;}}
  return {removed,blocked,retained};
 });
}
