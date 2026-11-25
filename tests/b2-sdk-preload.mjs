import {Readable} from 'node:stream';
// Test-process-only SDK replacement. Never imported by application code.
import {S3Client} from '@aws-sdk/client-s3';
import {MongoClient,Binary} from 'mongodb';
import {randomUUID} from 'node:crypto';
if(process.env.PPC_TEST_B2_SDK!=='isolated-mock'||!process.env.MONGODB_DATABASE?.includes('_storage_')||!/^mongodb:\/\/(127\.0\.0\.1|localhost):/.test(process.env.MONGODB_URI||'')||process.env.B2_MEDIA_BUCKET!=='ppc-test-private-media'||process.env.B2_DOCUMENTS_BUCKET!=='ppc-test-private-documents')throw Error('SDK mock requires isolated storage test runner.');
const client=new MongoClient(process.env.MONGODB_URI),db=client.db(process.env.MONGODB_DATABASE),objects=db.collection('_mock_b2_objects');
S3Client.prototype.send=async function(command){
 const name=command.constructor.name,input=command.input,bucket=input.Bucket;if(!['ppc-test-private-media','ppc-test-private-documents'].includes(bucket))throw Error('Unexpected test bucket; real network is forbidden.');
 await db.collection('_mock_b2_calls').insertOne({name,bucket,key:input.Key});
 if(input.ACL)throw Error('Mock forbids visibility changes.');
 if(name==='HeadBucketCommand')return {};
 if(name==='PutObjectCommand'){
  const control=await db.collection('_mock_b2_controls').findOneAndDelete({_id:'fail-next-put'});if(control)throw Error('Mock storage unavailable');
  const parts=[];if(input.Body instanceof Uint8Array)parts.push(input.Body);else for await(const chunk of input.Body)parts.push(Buffer.from(chunk));const bytes=Buffer.concat(parts),versionId=randomUUID();
  await objects.insertOne({_id:versionId,bucket,key:input.Key,type:input.ContentType,metadata:input.Metadata||{},bytes:new Binary(bytes)});return {VersionId:versionId,ETag:'"mock-etag"'};
 }
 if(name==='GetObjectCommand'||name==='HeadObjectCommand'){
  const row=await objects.findOne({_id:input.VersionId,bucket,key:input.Key});if(!row)throw Error('Mock object not found');const bytes=Buffer.from(row.bytes.value());return {ContentLength:bytes.length,ContentType:row.type,Metadata:row.metadata,...(name==='GetObjectCommand'?{Body:{transformToByteArray:async()=>new Uint8Array(bytes),transformToWebStream:()=>Readable.toWeb(Readable.from(bytes))}}:{})};
 }
 if(name==='ListObjectVersionsCommand'){const rows=await objects.find({bucket,key:{$regex:'^'+String(input.Prefix).replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}}).toArray();return {Versions:rows.filter(row=>!row.marker).map(row=>({Key:row.key,VersionId:row._id})),DeleteMarkers:rows.filter(row=>row.marker).map(row=>({Key:row.key,VersionId:row._id})),IsTruncated:false};}
 if(name==='DeleteObjectCommand'){if(await db.collection('_mock_b2_controls').findOne({_id:'block-delete'}))throw Error('Mock Object Lock');await objects.deleteOne({_id:input.VersionId,bucket,key:input.Key});return {};}
 throw Error('Unmocked S3 command blocked: '+name);
};
