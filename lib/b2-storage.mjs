import {S3Client,PutObjectCommand,GetObjectCommand,HeadBucketCommand,HeadObjectCommand,ListObjectVersionsCommand,DeleteObjectCommand} from '@aws-sdk/client-s3';
import {getSignedUrl} from '@aws-sdk/s3-request-presigner';
import {Upload} from '@aws-sdk/lib-storage';
import {createHash} from 'node:crypto';
export const b2Variables=['B2_ENDPOINT','B2_REGION',...['MEDIA','DOCUMENTS'].flatMap(scope=>['BUCKET','KEY_ID','APPLICATION_KEY'].map(key=>'B2_'+scope+'_'+key))];
export function b2Configuration(env=process.env){
 const enabled=b2Variables.some(key=>!!env[key]),issues=[];
 if(enabled){for(const key of b2Variables)if(!env[key])issues.push('Set '+key);try{const url=new URL(env.B2_ENDPOINT);if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||!/^s3\.[a-z0-9-]+\.backblazeb2\.com$/.test(url.hostname)||url.pathname!=='/'||url.hostname!=='s3.'+env.B2_REGION+'.backblazeb2.com')issues.push('Use the matching regional Backblaze S3 HTTPS endpoint.');}catch{issues.push('Set a valid B2_ENDPOINT.');}if(env.B2_MEDIA_BUCKET===env.B2_DOCUMENTS_BUCKET)issues.push('Use separate media and documents buckets.');}
 return {enabled,ready:enabled&&!issues.length,issues};
}
export const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');
export function detectedFileType(bytes){
 if(bytes.length>=8&&[137,80,78,71,13,10,26,10].every((value,index)=>bytes[index]===value))return 'image/png';
 if(bytes.length>=3&&bytes[0]===255&&bytes[1]===216&&bytes[2]===255)return 'image/jpeg';
 if(bytes.length>=12&&Buffer.from(bytes.subarray(0,4)).toString()==='RIFF'&&Buffer.from(bytes.subarray(8,12)).toString()==='WEBP')return 'image/webp';
 if(bytes.length>=5&&Buffer.from(bytes.subarray(0,5)).toString()==='%PDF-')return 'application/pdf';return '';
}
export class B2Store{
 constructor(env=process.env,factory=config=>new S3Client(config),sign=getSignedUrl){
  if(!b2Configuration(env).ready)throw Error('B2 storage is not configured completely.');this.sign=sign;this.clients={};this.buckets={};
  for(const scope of ['media','documents']){const prefix='B2_'+scope.toUpperCase()+'_';this.buckets[scope]=env[prefix+'BUCKET'];this.clients[scope]=factory({endpoint:env.B2_ENDPOINT,region:env.B2_REGION,forcePathStyle:true,credentials:{accessKeyId:env[prefix+'KEY_ID'],secretAccessKey:env[prefix+'APPLICATION_KEY']},requestChecksumCalculation:'WHEN_REQUIRED',responseChecksumValidation:'WHEN_REQUIRED',maxAttempts:3,requestHandler:{connectionTimeout:5000,requestTimeout:30000}});}
 }
 async put(scope,key,bytes,type,checksum){const result=await this.clients[scope].send(new PutObjectCommand({Bucket:this.buckets[scope],Key:key,Body:bytes,ContentLength:bytes.byteLength,ContentType:type,Metadata:{sha256:checksum}}));if(!result.VersionId)throw Error('B2 did not return a durable version reference.');const stored=await this.clients[scope].send(new HeadObjectCommand({Bucket:this.buckets[scope],Key:key,VersionId:result.VersionId}));if(stored.ContentLength!==bytes.byteLength||stored.ContentType!==type||stored.Metadata?.sha256!==checksum)throw Error('B2 stored object verification failed.');return result.VersionId;}
 async stream(scope,key,body,type){const uploader=new Upload({client:this.clients[scope],params:{Bucket:this.buckets[scope],Key:key,Body:body,ContentType:type},queueSize:1,partSize:5*1024*1024,leavePartsOnError:false});const result=await uploader.done();if(!result.VersionId)throw Error('B2 did not return a durable version reference.');return result.VersionId;}
 async verifySize(record,size,type){const result=await this.clients[record.bucketClass].send(new HeadObjectCommand({Bucket:this.buckets[record.bucketClass],Key:record.objectKey,VersionId:record.versionId}));if(result.ContentLength!==size||result.ContentType!==type)throw Error('Stored export size/type verification failed.');}
 async open(record){const result=await this.clients[record.bucketClass].send(new GetObjectCommand({Bucket:this.buckets[record.bucketClass],Key:record.objectKey,VersionId:record.versionId}));return result.Body.transformToWebStream();}
 async get(record){const result=await this.clients[record.bucketClass].send(new GetObjectCommand({Bucket:this.buckets[record.bucketClass],Key:record.objectKey,VersionId:record.versionId}));const bytes=await result.Body.transformToByteArray();if(record.sha256&&sha256(bytes)!==record.sha256)throw Error('Stored file integrity check failed.');return bytes;}
 async signedGet(record,{filename='',inline=true,seconds=300}={}){if(!Number.isInteger(seconds)||seconds<30||seconds>900)throw Error('Invalid signed link lifetime.');const disposition=(inline?'inline':'attachment')+(filename?'; filename="'+filename.replace(/[^a-z0-9._-]/gi,'_')+'"':'');return this.sign(this.clients[record.bucketClass],new GetObjectCommand({Bucket:this.buckets[record.bucketClass],Key:record.objectKey,VersionId:record.versionId,ResponseContentType:record.type,ResponseContentDisposition:disposition,ResponseCacheControl:'private, no-store'}),{expiresIn:seconds});}
 async versions(scope,key){const found=[];let KeyMarker,VersionIdMarker;do{const page=await this.clients[scope].send(new ListObjectVersionsCommand({Bucket:this.buckets[scope],Prefix:key,KeyMarker,VersionIdMarker}));for(const version of [...page.Versions||[],...page.DeleteMarkers||[]])if(version.Key===key&&version.VersionId)found.push(version.VersionId);if(!page.IsTruncated)break;KeyMarker=page.NextKeyMarker;VersionIdMarker=page.NextVersionIdMarker;}while(KeyMarker);return found;}
 async erase(scope,key){for(const version of await this.versions(scope,key))await this.clients[scope].send(new DeleteObjectCommand({Bucket:this.buckets[scope],Key:key,VersionId:version}));if((await this.versions(scope,key)).length)throw Error('B2 versions remain. Retention or permissions may block erasure.');}
 async health(){for(const scope of ['media','documents'])await this.clients[scope].send(new HeadBucketCommand({Bucket:this.buckets[scope]}));return {ready:true};}
}
