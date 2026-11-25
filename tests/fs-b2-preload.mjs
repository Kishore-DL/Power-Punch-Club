// Fallback after the local Docker S3 service became unavailable. Never loaded in production.
import {createRequire} from 'node:module';
import {createHash,randomUUID,randomBytes,createHmac,timingSafeEqual} from 'node:crypto';
import {mkdir,writeFile,readFile,readdir} from 'node:fs/promises';
import {createReadStream,writeFileSync} from 'node:fs';
import {Readable} from 'node:stream';
import {resolve} from 'node:path';
import http from 'node:http';
if(process.env.PPC_LOCAL_B2_FS!=='true'||!/^mongodb:\/\/(127\.0\.0\.1|localhost):/.test(process.env.MONGODB_URI||'')||!/^ppc_(test|preview)_/.test(process.env.MONGODB_DATABASE||''))throw Error('Only isolated local filesystem test storage is permitted.');
const require=createRequire(import.meta.url),sdk=require('@aws-sdk/client-s3'),presigner=require('@aws-sdk/s3-request-presigner'),Original=sdk.S3Client,originalSign=presigner.getSignedUrl,root=resolve('.local-backups/b2-load/fs-objects'),key=randomBytes(32),port=process.env.MONGODB_DATABASE.startsWith('ppc_preview_')?3058:3059;
await mkdir(root,{recursive:true});const digest=(bucket,object)=>createHash('sha256').update(bucket+'\0'+object).digest('hex'),path=(id,version)=>resolve(root,id,version),signature=text=>createHmac('sha256',key).update(text).digest('hex');
const service=http.createServer(async(req,res)=>{try{const url=new URL(req.url,'http://localhost'),id=url.pathname.slice(1),version=url.searchParams.get('v'),expires=Number(url.searchParams.get('e')),sig=url.searchParams.get('s')||'',text=id+':'+version+':'+expires;if(!/^[a-f0-9]{64}$/.test(id)||!version||!/^[a-f0-9-]{36}$/.test(version)||expires<Date.now()||sig.length!==64||!timingSafeEqual(Buffer.from(sig),Buffer.from(signature(text)))){res.writeHead(403).end();return;}const meta=JSON.parse(await readFile(path(id,version)+'.json','utf8'));res.writeHead(200,{'Content-Type':meta.type,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'});createReadStream(path(id,version)+'.bin').pipe(res);}catch{res.writeHead(404).end();}});await new Promise(resolve=>service.listen(port,'127.0.0.1',resolve));service.unref();
sdk.S3Client=class FilesystemTestClient extends Original{
 async send(command){const name=command.constructor.name,input=command.input,remote=process.env.PPC_FS_REMOTE_ORIGINALS==='true'&&String(input.Key||input.Prefix||'').startsWith('migration/');
  if(remote){if(!['GetObjectCommand','HeadObjectCommand'].includes(name))throw Error('Original B2 objects are read-only in local preview.');return super.send(command);}
  if(name==='HeadBucketCommand')return {};
  const id=digest(input.Bucket,input.Key),folder=resolve(root,id);
  if(name==='PutObjectCommand'){await mkdir(folder,{recursive:true});const version=randomUUID(),parts=[];if(input.Body instanceof Uint8Array)parts.push(input.Body);else for await(const part of input.Body)parts.push(Buffer.from(part));const bytes=Buffer.concat(parts),meta={bucket:input.Bucket,key:input.Key,version,type:input.ContentType,size:bytes.length,metadata:input.Metadata||{}};await writeFile(path(id,version)+'.bin',bytes);await writeFile(path(id,version)+'.json',JSON.stringify(meta));return {VersionId:version,ETag:'"filesystem-mock"'};}
  if(name==='GetObjectCommand'||name==='HeadObjectCommand'){const meta=JSON.parse(await readFile(path(id,input.VersionId)+'.json','utf8'));return {ContentLength:meta.size,ContentType:meta.type,Metadata:meta.metadata,...(name==='GetObjectCommand'?{Body:{transformToByteArray:()=>readFile(path(id,input.VersionId)+'.bin'),transformToWebStream:()=>Readable.toWeb(createReadStream(path(id,input.VersionId)+'.bin'))}}:{})};}
  if(name==='ListObjectVersionsCommand'){let files=[];try{files=await readdir(folder);}catch{}return {Versions:files.filter(file=>file.endsWith('.json')).map(file=>({Key:input.Key||input.Prefix,VersionId:file.slice(0,-5)})),IsTruncated:false};}
  throw Error('Unimplemented filesystem test command blocked: '+name);
 }
};
presigner.getSignedUrl=async(client,command,options)=>{if(process.env.PPC_FS_REMOTE_ORIGINALS==='true'&&String(command.input.Key).startsWith('migration/'))return originalSign(client,command,options);const id=digest(command.input.Bucket,command.input.Key),version=command.input.VersionId,expires=Date.now()+options.expiresIn*1000,text=id+':'+version+':'+expires;return 'http://127.0.0.1:'+port+'/'+id+'?v='+version+'&e='+expires+'&s='+signature(text);};
if(process.env.PPC_LOAD_TELEMETRY){let previous=process.cpuUsage(),at=Date.now();setInterval(()=>{const now=Date.now(),cpu=process.cpuUsage(),memory=process.memoryUsage();writeFileSync(process.env.PPC_LOAD_TELEMETRY,JSON.stringify({pid:process.pid,at:now,rss:memory.rss,heapUsed:memory.heapUsed,cpuPercent:(cpu.user+cpu.system-previous.user-previous.system)/(now-at)/10,uptime:process.uptime()}));previous=cpu;at=now;},2000).unref();}
