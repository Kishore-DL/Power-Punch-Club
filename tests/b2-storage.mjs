import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {MongoClient,Binary} from 'mongodb';
import sharp from 'sharp';
import {B2Store,b2Configuration,b2Variables,sha256,detectedFileType} from '../lib/b2-storage.mjs';
import {migrateFile,cleanupAbandoned,storageInventory} from '../lib/storage-maintenance.mjs';
import {mediaReferences,fileIsReferenced} from '../lib/file-references.mjs';
import {withMutationLock} from '../lib/mutation-lock.mjs';

if(!/^mongodb:\/\/(127\.0\.0\.1|localhost):/.test(process.env.MONGODB_URI||'')||!process.env.MONGODB_DATABASE?.startsWith('ppc_test_'))throw Error('Disposable loopback MongoDB required.');
const env={B2_ENDPOINT:'https://s3.us-west-004.backblazeb2.com',B2_REGION:'us-west-004',B2_MEDIA_BUCKET:'mock-private-media',B2_DOCUMENTS_BUCKET:'mock-private-documents',B2_MEDIA_KEY_ID:'mock-media-key',B2_MEDIA_APPLICATION_KEY:'mock-media-secret',B2_DOCUMENTS_KEY_ID:'mock-documents-key',B2_DOCUMENTS_APPLICATION_KEY:'mock-document-secret'};
assert.equal(b2Configuration({}).enabled,false);assert.equal(b2Configuration(env).ready,true);
for(const key of b2Variables){const partial={...env};delete partial[key];assert.equal(b2Configuration(partial).ready,false);}
for(const endpoint of ['http://s3.us-west-004.backblazeb2.com','https://attacker.invalid','https://s3.us-west-004.backblazeb2.com/path'])assert.equal(b2Configuration({...env,B2_ENDPOINT:endpoint}).ready,false);
assert.equal(b2Configuration({...env,B2_DOCUMENTS_BUCKET:env.B2_MEDIA_BUCKET}).ready,false);
const objects=new Map(),calls=[],signed=[],configs=[];let failDelete=false,corrupt=false,missingVersion=false;
const factory=config=>{configs.push(config);return {send:async command=>{
 const input=command.input,name=command.constructor.name;calls.push({name,input});assert.ok(!('ACL'in input));const key=input.Bucket+':'+input.Key;
 if(name==='HeadBucketCommand')return {};
 if(name==='PutObjectCommand'){const version=randomUUID(),body=Buffer.from(input.Body);const list=objects.get(key)||[];list.push({version,body,type:input.ContentType,metadata:input.Metadata});objects.set(key,list);return missingVersion?{}:{VersionId:version};}
 if(name==='HeadObjectCommand'){const row=objects.get(key)?.find(row=>row.version===input.VersionId);assert.ok(row);return {ContentLength:row.body.length,ContentType:row.type,Metadata:row.metadata};}
 if(name==='GetObjectCommand'){const row=objects.get(key)?.find(row=>row.version===input.VersionId);assert.ok(row);return {Body:{transformToByteArray:async()=>corrupt?Buffer.from('corrupt'):row.body}};}
 if(name==='ListObjectVersionsCommand'){const all=[...objects.entries()].filter(([key])=>key.startsWith(input.Bucket+':'+input.Prefix));return {Versions:all.flatMap(([key,rows])=>rows.filter(row=>!row.marker).map(row=>({Key:key.slice(input.Bucket.length+1),VersionId:row.version}))),DeleteMarkers:all.flatMap(([key,rows])=>rows.filter(row=>row.marker).map(row=>({Key:key.slice(input.Bucket.length+1),VersionId:row.version}))),IsTruncated:false};}
 if(name==='DeleteObjectCommand'){if(failDelete)throw Error('Retention blocked');objects.set(key,(objects.get(key)||[]).filter(row=>row.version!==input.VersionId));return {};}
 throw Error('Unexpected command '+name);
 }};};
const store=new B2Store(env,factory,async(client,command,options)=>{signed.push({input:command.input,options});return 'https://mock-storage.invalid/'+randomUUID()+'?expires='+options.expiresIn;});
assert.notEqual(configs[0].credentials.accessKeyId,configs[1].credentials.accessKeyId);await store.health();
const mongo=new MongoClient(process.env.MONGODB_URI),db=mongo.db(process.env.MONGODB_DATABASE+'_b2_'+randomUUID().slice(0,8));
try{
 for(const [width,height,format] of [[90,160,'png'],[160,90,'jpeg'],[90,90,'webp'],[60,1200,'png']]){
  const bytes=await sharp({create:{width,height,channels:3,background:'#a41920'}})[format]().toBuffer(),type='image/'+format,key='objects/test-'+randomUUID(),checksum=sha256(bytes),versionId=await store.put('documents',key,bytes,type,checksum),record={bucketClass:'documents',objectKey:key,versionId,sha256:checksum,type};
  const downloaded=await store.get(record);assert.equal(sha256(downloaded),checksum);const metadata=await sharp(downloaded).metadata();assert.deepEqual([metadata.width,metadata.height],[width,height]);
  assert.equal(detectedFileType(bytes),type);const first=await store.signedGet(record,{filename:'proof.'+format,inline:false}),second=await store.signedGet(record);assert.notEqual(first,second);assert.equal(signed.at(-1).options.expiresIn,300);assert.equal(signed.at(-1).input.VersionId,versionId);assert.equal(signed.at(-1).input.ResponseCacheControl,'private, no-store');await assert.rejects(()=>store.signedGet(record,{seconds:1}));
  corrupt=true;await assert.rejects(()=>store.get(record),/integrity/);corrupt=false;
  // Multiple versions, hide marker and prefix-neighbour must be handled exactly.
  await store.put('documents',key,bytes,type,checksum);objects.get(env.B2_DOCUMENTS_BUCKET+':'+key).push({version:'hide-marker',marker:true});objects.set(env.B2_DOCUMENTS_BUCKET+':'+key+'-neighbour',[{version:'keep-me',body:bytes}]);
  failDelete=true;await assert.rejects(()=>store.erase('documents',key));failDelete=false;await store.erase('documents',key);assert.equal((await store.versions('documents',key)).length,0);assert.equal(objects.get(env.B2_DOCUMENTS_BUCKET+':'+key+'-neighbour').length,1);
 }
 missingVersion=true;await assert.rejects(()=>store.put('media','test/no-version',Buffer.from('bytes'),'image/png','checksum'),/version/);missingVersion=false;
 const bytes=await sharp({create:{width:12,height:18,channels:3,background:'#ffffff'}}).png().toBuffer(),key='public/'+randomUUID(),source={_id:key,type:'image/png',data:new Binary(bytes)};
 await db.collection('files').insertOne(source);await db.collection('content').insertOne({_id:'branding',value:{logo:'/api/media/'+encodeURIComponent(key)}});
 const before=await storageInventory(db);assert.equal(before.legacy,1);assert.equal((await db.collection('files').findOne({_id:key})).provider,undefined);
 await migrateFile(db,store,key,{copyOnly:true});const staged=await db.collection('files').findOne({_id:key});assert.equal(staged.provider,undefined);assert.ok(staged.data);assert.equal(staged.migrationCopy.sha256,sha256(bytes));const stagedPuts=calls.filter(call=>call.name==='PutObjectCommand').length;await migrateFile(db,store,key,{copyOnly:true});assert.equal(calls.filter(call=>call.name==='PutObjectCommand').length,stagedPuts);
 const journal=[];assert.equal((await migrateFile(db,store,key,{journal:async row=>journal.push(row)})).status,'copied-verified-source-retained');let migrated=await db.collection('files').findOne({_id:key});assert.ok(migrated.data);assert.equal(migrated.approvedPublic,true);assert.equal(migrated._id,key);assert.equal(journal.length,1);
 const putCount=calls.filter(call=>call.name==='PutObjectCommand').length;await migrateFile(db,store,key);assert.equal(calls.filter(call=>call.name==='PutObjectCommand').length,putCount);
 await migrateFile(db,store,key,{rollback:true});assert.equal((await db.collection('files').findOne({_id:key})).provider,undefined);await migrateFile(db,store,key);await migrateFile(db,store,key,{cleanup:true});assert.equal((await db.collection('files').findOne({_id:key})).data,undefined);await assert.rejects(()=>migrateFile(db,store,key,{rollback:true}),/unavailable/);
 assert.equal(await fileIsReferenced(db,key),true);assert.deepEqual(mediaReferences({nested:['/api/media/'+encodeURIComponent(key)]}),[key]);
 const abandoned='private/'+randomUUID(),protectedKey='private/'+randomUUID();for(const id of [abandoned,protectedKey]){const objectKey='test/abandoned-'+randomUUID(),versionId=await store.put('documents',objectKey,bytes,'image/png',sha256(bytes));await db.collection('files').insertOne({_id:id,provider:'b2',bucketClass:'documents',objectKey,versionId,state:'ready',claimed:false,expiresAt:new Date(0)});}
 await db.collection('requests').insertOne({_id:randomUUID(),data:{answers:{photo:'/api/media/'+encodeURIComponent(protectedKey)}}});
 failDelete=true;assert.equal((await cleanupAbandoned(db,store)).blocked,1);failDelete=false;const cleaned=await cleanupAbandoned(db,store);assert.equal(cleaned.removed,1);assert.equal(cleaned.retained,1);assert.ok(await db.collection('files').findOne({_id:protectedKey}));
 let active=0,max=0;await Promise.all(Array.from({length:6},()=>withMutationLock(db,async()=>{max=Math.max(max,++active);await new Promise(resolve=>setTimeout(resolve,10));active--;})));assert.equal(max,1);
 assert.ok(calls.every(call=>!['PutBucketAclCommand','PutBucketPolicyCommand'].includes(call.name)));
 console.log('B2 MOCK PASS: separate private bucket credentials, incomplete config fail-closed, metadata/checksum verification, portrait/landscape/square/tall byte+dimension preservation, temporary signed GET refresh/expiry bounds, exact version+marker erasure, retention failure/retry, migration dry inventory/copy/resume/rollback/source cleanup, shared-file retention, abandoned-only cleanup and distributed write serialization. No B2 network calls.');
}finally{await db.dropDatabase();await mongo.close();}
