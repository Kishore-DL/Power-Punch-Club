import '../lib/mongodb-dns.mjs';
import {MongoClient,BSON} from 'mongodb';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {resolve,relative} from 'node:path';
import {sha256} from '../lib/b2-storage.mjs';
import {mediaReferences} from '../lib/file-references.mjs';
const database=process.env.MONGODB_DATABASE||'power_punch_club';
if(!process.argv.includes('--confirm-database='+database))throw Error('Confirm the intended source database explicitly.');
const directory=resolve('.local-backups','b2-file-backup-'+new Date().toISOString().replace(/[:.]/g,'-'));await mkdir(directory,{recursive:true,mode:0o700});
const mongo=new MongoClient(process.env.MONGODB_URI,{serverSelectionTimeoutMS:8000}),session=mongo.startSession({snapshot:true});
try{
 const db=mongo.db(database),manifest={version:1,created:new Date().toISOString(),database,documents:[],files:[],associations:[],expiredReportsSkipped:0};let index=0;
 for(const collection of ['files','content','requests']){
  const filter=collection==='content'?{_id:{$not:/^private-/}}:{};
  for await(const row of db.collection(collection).find(filter,{session})){
   const filename=String(index++).padStart(6,'0')+'.bson',bytes=BSON.serialize(row);await writeFile(resolve(directory,filename),bytes,{mode:0o600});
   const restored=BSON.deserialize(await readFile(resolve(directory,filename)));if(sha256(BSON.serialize(restored))!==sha256(bytes))throw Error('Backup BSON readback mismatch.');
   manifest.documents.push({collection,id:row._id,filename,sha256:sha256(bytes)});
   if(collection==='files'&&row.data){const original=row.data.value(),copy=restored.data.value();if(sha256(original)!==sha256(copy))throw Error('Backup binary mismatch.');manifest.files.push({id:row._id,size:original.length,type:row.type,sha256:sha256(original),filename});}
   if(collection!=='files')for(const key of mediaReferences(row))manifest.associations.push({file:key,collection,id:row._id});
  }
 }
 manifest.expiredReportsSkipped=await db.collection('admin_export_jobs').countDocuments({expiresAt:{$lte:new Date()}},{session});
 await writeFile(resolve(directory,'manifest.json'),JSON.stringify(manifest,null,2),{mode:0o600});
 console.log(JSON.stringify({backup:relative(process.cwd(),directory),verifiedDocuments:manifest.documents.length,verifiedBinaryFiles:manifest.files.length,bytes:manifest.files.reduce((sum,file)=>sum+file.size,0),associations:manifest.associations.length,expiredReportsSkipped:manifest.expiredReportsSkipped}));
}catch{console.error('Backup incomplete. Source was not changed; inspect private backup before migration.');process.exitCode=1;}
finally{await session.endSession();await mongo.close();}
