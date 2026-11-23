// Explicit, scoped publication. No startup hook and no private-data migration.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {parseEnv} from 'node:util';
import {createHash,randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {MongoClient,Binary,BSON} from 'mongodb';
import sharp from 'sharp';
import jsQR from 'jsqr';
import {configureMongoDns} from '../lib/mongodb-dns.mjs';
import {localContentTarget,validateContentPackage} from '../lib/content-import.mjs';
import {contentFingerprint} from '../lib/content-transfer-plan.mjs';
import {mockQrId,mockQrText} from '../lib/local-mock-content.mjs';
import {publicAssetKey,publicationRecords,publicationChanges} from '../lib/presentation-content.mjs';
const args=process.argv.slice(2),option=name=>args.find(arg=>arg.startsWith('--'+name+'='))?.slice(name.length+3),apply=args.includes('--apply');
if(!option('source')||!option('target'))throw Error('Explicit source and target environment files are required.');
const source=parseEnv(await readFile(option('source'),'utf8')),target=parseEnv(await readFile(option('target'),'utf8'));
localContentTarget(source);
const database=target.MONGODB_DATABASE;
if(!database||option('confirm-database')!==database)throw Error('Confirm the exact destination database before planning or writing.');
if(target.MONGODB_DNS_SERVERS)process.env.MONGODB_DNS_SERVERS=target.MONGODB_DNS_SERVERS;
configureMongoDns();
const manifest=JSON.parse(await readFile('content/local-gallery-tournaments.json','utf8'));await validateContentPackage(manifest,'public');
const clients=[new MongoClient(source.MONGODB_URI,{serverSelectionTimeoutMS:8000}),new MongoClient(target.MONGODB_URI,{serverSelectionTimeoutMS:8000})],hash=bytes=>createHash('sha256').update(bytes).digest('hex');
try{
  const from=clients[0].db(source.MONGODB_DATABASE),to=clients[1].db(database),keys=['gallery','training','tournaments','forms'];
  const hello=await to.command({hello:1});if(!hello.setName&&hello.msg!=='isdbgrid')throw Error('Destination must support transactions.');
  const sourceRows=await from.collection('content').find({_id:{$in:keys}}).toArray(),sourceContent=Object.fromEntries(sourceRows.map(row=>[row._id,row.value]));
  const files=[],urls=new Map();
  for(const asset of manifest.assets){
    const bytes=await readFile(path.join('public',asset.url));if(hash(bytes)!==asset.sha256)throw Error('Public asset hash mismatch.');
    const meta=await sharp(bytes).metadata();if(meta.format!=='webp')throw Error('Expected reviewed WebP image.');
    const id=publicAssetKey(asset.sha256);files.push({_id:id,type:'image/webp',data:new Binary(bytes),created:new Date()});urls.set(asset.url,'/api/media/'+encodeURIComponent(id));
  }
  const qr=await from.collection('files').findOne({_id:mockQrId});if(!qr||qr.type!=='image/png')throw Error('The approved non-payable QR is missing.');
  const pixels=await sharp(qr.data.value()).ensureAlpha().raw().toBuffer({resolveWithObject:true}),decoded=jsQR(new Uint8ClampedArray(pixels.data),pixels.info.width,pixels.info.height);
  if(decoded?.data!==mockQrText||/upi:\/\/|pa=|pay\?/i.test(decoded.data))throw Error('QR must contain the exact approved non-payable text.');
  files.push({_id:mockQrId,type:'image/png',data:new Binary(qr.data.value()),created:new Date()});
  const selected=publicationRecords(sourceContent,urls),before=await to.collection('content').find({_id:{$in:keys}}).toArray(),existing=Object.fromEntries(before.map(row=>[row._id,row.value]));
  const changes=publicationChanges(selected,existing),priorFiles=await to.collection('files').find({_id:{$in:files.map(file=>file._id)}}).toArray();
  for(const file of files){const old=priorFiles.find(row=>row._id===file._id);if(old&&(old.type!==file.type||hash(old.data.value())!==hash(file.data.value())))throw Error('Existing public file conflicts; no overwrite allowed.');}
  const additions=changes.filter(row=>row.action==='add'),newFiles=files.filter(file=>!priorFiles.some(old=>old._id===file._id));
  const destinationFingerprint=hash(new URL(target.MONGODB_URI).hostname+'|'+database);
  const plan={database,destinationFingerprint,mode:apply?'authorized-apply':'dry-run',changes,files:files.map(file=>({id:file._id,type:file.type,sha256:hash(file.data.value()),action:newFiles.includes(file)?'add':'skip-identical'})),preserveExistingTournament:'89e13617-2adb-4ebe-b9e4-9f4f8db630c3',nonPayableQr:true,excluded:['accounts','registrations','payments','outbox','private uploads','branding','hero']};
  console.log(JSON.stringify(plan,null,2));
  if(!apply)process.exitCode=0;
  else if(!additions.length&&!newFiles.length)console.log('Nothing to add. Existing selected records and assets remain unchanged.');
  else{
    const backup=path.resolve('.local-backups','published-content-'+new Date().toISOString().replace(/[:.]/g,'-')+'-'+randomUUID().slice(0,8));await mkdir(backup,{recursive:true,mode:0o700});
    if(process.platform==='win32')execFileSync('icacls',[backup,'/inheritance:r','/grant:r',process.env.USERDOMAIN+String.fromCharCode(92)+process.env.USERNAME+':(OI)(CI)F'],{stdio:'ignore'});
    await writeFile(path.join(backup,'before.ejson'),BSON.EJSON.stringify({content:before,files:priorFiles},null,2),{mode:0o600,flag:'wx'});
    const journal={...plan,status:'prepared',insertedRecords:additions,insertedFiles:newFiles.map(file=>({id:file._id,sha256:hash(file.data.value())})),rollback:'Remove only journal inserted IDs with matching current fingerprints; stop if edited or referenced by registrations. Remove only matching newly inserted public file hashes after verifying no content/receipt references. Never restore entire arrays or touch pre-existing records.'};
    await writeFile(path.join(backup,'journal.json'),JSON.stringify(journal,null,2),{mode:0o600,flag:'wx'});
    await clients[1].withSession(session=>session.withTransaction(async()=>{
      for(const key of keys){
        const row=await to.collection('content').findOne({_id:key},{session}),prior=before.find(item=>item._id===key);
        if(contentFingerprint(row?.value??[])!==contentFingerprint(prior?.value??[]))throw Error('Destination content changed after backup; refusing to overwrite concurrent edits.');
        const append=selected[key].filter(record=>additions.some(change=>change.section===key&&change.id===record.id));
        if(append.length)await to.collection('content').updateOne({_id:key},{$set:{value:[...(row?.value||[]),...append],updated:new Date().toISOString()}},{upsert:true,session});
      }
      for(const file of newFiles)await to.collection('files').insertOne(file,{session});
    }));
    journal.status='committed';journal.committedAt=new Date().toISOString();await writeFile(path.join(backup,'journal.json'),JSON.stringify(journal,null,2),{mode:0o600});
    const after=await to.collection('content').find({_id:{$in:keys}}).toArray();
    for(const old of before)for(const record of old.value||[])if(contentFingerprint(after.find(row=>row._id===old._id)?.value.find(item=>item.id===record.id))!==contentFingerprint(record))throw Error('Post-import preservation check failed; inspect scoped journal.');
    for(const file of files){const stored=await to.collection('files').findOne({_id:file._id});if(!stored||hash(stored.data.value())!==hash(file.data.value()))throw Error('Public asset verification failed.');}
    console.log(JSON.stringify({status:'committed',addedRecords:additions.length,addedFiles:newFiles.length,scopedBackup:backup,existingContentPreserved:true,nonPayableQr:true}));
  }
}finally{await Promise.all(clients.map(client=>client.close()))}
