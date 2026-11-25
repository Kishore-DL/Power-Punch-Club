import sharp from 'sharp';
import {Binary,type Document} from 'mongodb';
import {mediaReferences,legacyPublicApproved,fileIsReferenced} from './file-references.mjs';
import type {Registration} from './mongodb';
import {randomUUID} from 'node:crypto';
import {database} from './mongodb';
import {B2Store,b2Configuration,sha256,detectedFileType} from './b2-storage.mjs';
export const fileRecords=()=>database().collection<Document & {_id:string}>('files');
const valid=(key:string)=>/^(public|private)\/[a-f0-9-]{36}$/i.test(key);
export const fileStorage={
 async claimContent(value:unknown,claim=true){for(const key of mediaReferences(value)){if(!key.startsWith('public/'))continue;const file=await this.record(key);if(!file||!(await this.head(key))?.approvedPublic)throw Error('Use a validated website media upload.');if(claim)await fileRecords().updateOne({_id:key},{$set:{claimed:true},$unset:{expiresAt:''}});}},
 async claim(row:Registration){for(const key of mediaReferences(row.data)){if(!key.startsWith('private/'))continue;const result=await fileRecords().updateOne({_id:key,registrationToken:row.token,$or:[{state:'ready'},{state:{$exists:false}}]},{$set:{claimed:true},$addToSet:{registrationIds:row.id},$unset:{expiresAt:''}});if(!result.matchedCount)throw Error('A registration upload could not be linked safely.');}},
 async record(key:string){if(!valid(key))return null;const row=await fileRecords().findOne({_id:key,$or:[{state:'ready'},{state:{$exists:false}}]});if(row&&row.claimed===false&&row.expiresAt&&row.expiresAt<new Date()&&!await fileIsReferenced(database(),key))return null;return row;},
 async get(key:string){const record=await this.record(key);if(!record)return null;const body=record.provider==='b2'?await new B2Store().get(record):record.data?new Uint8Array(record.data.value()):null;return body?{body,httpMetadata:{contentType:String(record.type)}}:null;},
 async head(key:string){const record=await this.record(key);return record?{httpMetadata:{contentType:String(record.type)},customMetadata:{registrationToken:record.registrationToken as string|undefined,purpose:record.purpose as string|undefined},provider:record.provider,approvedPublic:record.approvedPublic===true||(!record.provider&&record.approvedPublic===undefined&&key.startsWith('public/')&&await legacyPublicApproved(database(),key))}:null;},
 async delivery(key:string,filename?:string,inline=true,proxy=false){const record=await this.record(key);if(!record)return null;if(record.provider==='b2'){if(proxy)return new Response(await new B2Store().open(record),{headers:{'Content-Type':String(record.type),'Content-Disposition':(inline?'inline':'attachment')+(filename?'; filename="'+filename.replace(/[^a-z0-9._-]/gi,'_')+'"':''),'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});const location=await new B2Store().signedGet(record,{filename,inline});return new Response(null,{status:307,headers:{Location:location,'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'}});}const file=await this.get(key);if(!file)return null;return new Response(file.body,{headers:{'Content-Type':file.httpMetadata.contentType,'Content-Disposition':(inline?'inline':'attachment')+(filename?'; filename="'+filename.replace(/[^a-z0-9._-]/gi,'_')+'"':''),'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});},
 async put(key:string,output:ArrayBuffer|Blob,options:{httpMetadata:{contentType:string};customMetadata?:{registrationToken:string;purpose?:string}}){
  if(!valid(key))throw Error('Invalid immutable file ID.');const bytes=new Uint8Array(output instanceof Blob?await output.arrayBuffer():output);if(!bytes.byteLength||bytes.byteLength>8*1024*1024)throw Error('Upload exceeds the 8 MB limit');
  const type=detectedFileType(bytes);if(!type||type!==options.httpMetadata.contentType||key.startsWith('public/')&&type==='application/pdf')throw Error('File signature does not match its declared type.');
  if(type.startsWith('image/')){try{const dimensions=await sharp(bytes,{limitInputPixels:40000000}).metadata();if(!dimensions.width||!dimensions.height)throw Error();}catch{throw Error('Choose a valid PNG, JPEG or WebP image.');}}
  const configuration=b2Configuration();if(configuration.enabled&&!configuration.ready)throw Error('B2 storage configuration is incomplete.');
  const base={_id:key,type,sha256:sha256(bytes),size:bytes.byteLength,registrationToken:options.customMetadata?.registrationToken,purpose:key.startsWith('public/')?'website-media':options.customMetadata?.purpose||'registration-document',created:new Date(),approvedPublic:false,registrationIds:[]};
  if(!configuration.enabled){await fileRecords().insertOne({...base,approvedPublic:key.startsWith('public/'),data:new Binary(bytes)});return;}
  const bucketClass=key.startsWith('public/')?'media':'documents',objectKey='objects/'+randomUUID();
  await fileRecords().insertOne({...base,provider:'b2',bucketClass,objectKey,state:'pending',expiresAt:new Date(Date.now()+86400000),claimed:false});
  try{const versionId=await new B2Store().put(bucketClass,objectKey,bytes,type,base.sha256);const saved=await fileRecords().updateOne({_id:key,state:'pending'},{$set:{versionId,state:'ready',approvedPublic:key.startsWith('public/')}});if(!saved.matchedCount)throw Error('Uploaded object could not be finalized.');}
  catch{throw Error('B2 upload could not complete. Please retry. No MongoDB binary fallback was used.');}
 },
};
