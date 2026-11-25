import '../lib/mongodb-dns.mjs';
import {MongoClient} from 'mongodb';
import {mkdir,appendFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {B2Store,b2Configuration} from '../lib/b2-storage.mjs';
import {storageInventory,migrateFile,cleanupAbandoned} from '../lib/storage-maintenance.mjs';

const args=process.argv.slice(2),command=args[0]||'inventory';
if(!['check','inventory','copy','verify','cleanup-source','rollback','cleanup-abandoned'].includes(command))throw Error('Use check, inventory, copy, verify, cleanup-source, rollback or cleanup-abandoned.');
if(command==='check'){const config=b2Configuration();if(!config.ready){console.log(JSON.stringify({...config,issues:config.enabled?config.issues:['Configure all eight server-only B2 variables before checking the connection.']}));process.exitCode=1;}else{try{await new B2Store().health();console.log('Both private buckets are reachable. No visibility changes or uploads performed.');}catch{console.error('B2 connection failed. Check regional endpoint, restricted keys and bucket permissions.');process.exitCode=1;}}}
else{
 const apply=args.includes('--apply'),database=process.env.MONGODB_DATABASE;
 const writes=['copy','cleanup-source','rollback','cleanup-abandoned'].includes(command);
 if(!process.env.MONGODB_URI||!database)throw Error('Set MONGODB_URI and MONGODB_DATABASE in a server-only environment file.');
 if(writes&&apply&&!args.includes('--confirm-database='+database))throw Error('Explicit --confirm-database=<exact database name> is required.');
 const client=new MongoClient(process.env.MONGODB_URI,{serverSelectionTimeoutMS:8000});
 try{
  const db=client.db(database),inventory=await storageInventory(db);console.log(JSON.stringify({operation:command,apply:!!(writes&&apply),inventory}));
  if(command==='inventory'||writes&&!apply)console.log('Dry run only. No file bytes, references or content were changed.');
  else{
   const store=new B2Store();
   if(command==='cleanup-abandoned')console.log(JSON.stringify(await cleanupAbandoned(db,store)));
   else{
    const directory=resolve('.local-backups/b2-migration');await mkdir(directory,{recursive:true});const journal=entry=>appendFile(resolve(directory,'journal.jsonl'),JSON.stringify({...entry,at:new Date()})+'\n',{mode:0o600});
    let processed=0;const filter=command==='copy'?{data:{$exists:true}}:command==='rollback'?{provider:'b2',migratedAt:{$exists:true}}:command==='cleanup-source'?{provider:'b2',data:{$exists:true}}:args.includes('--copy-only')?{'migrationCopy.versionId':{$exists:true}}:{provider:'b2'};
    for await(const row of db.collection('files').find(filter,{projection:{_id:1}})){
     if(command==='verify'){const record=await db.collection('files').findOne({_id:row._id}),reference=args.includes('--copy-only')?record.migrationCopy:record;const bytes=await store.get(reference);if(bytes.length!==reference.size)throw Error('Stored size mismatch.');}
     else await migrateFile(db,store,row._id,{cleanup:command==='cleanup-source',rollback:command==='rollback',copyOnly:args.includes('--copy-only'),journal});processed++;
    }
    console.log(JSON.stringify({verifiedOrProcessed:processed,sourceBytesRemoved:command==='cleanup-source'}));
   }
  }
 }catch{console.error('Storage maintenance stopped safely. Inspect server configuration, source integrity, permissions and retention; rerun the same command to resume. No credentials are printed.');process.exitCode=1;}
 finally{await client.close();}
}
