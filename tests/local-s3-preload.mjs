// Local test/preview only; production modules never import this adapter.
import {createRequire} from 'node:module';
import {writeFileSync} from 'node:fs';
if(process.env.PPC_LOCAL_S3_TEST!=='true'||!/^mongodb:\/\/(127\.0\.0\.1|localhost):/.test(process.env.MONGODB_URI||'')||!/^ppc_(test|preview)_/.test(process.env.MONGODB_DATABASE||'')||process.env.PPC_LOCAL_S3_ENDPOINT!=='http://127.0.0.1:39000')throw Error('Local S3 adapter requires isolated loopback destinations.');
const require=createRequire(import.meta.url),sdk=require('@aws-sdk/client-s3'),Original=sdk.S3Client;
sdk.S3Client=class LocalS3Client extends Original{constructor(options){super({...options,endpoint:process.env.PPC_LOCAL_S3_ENDPOINT,region:'us-east-1',forcePathStyle:true,credentials:{accessKeyId:'ppc-local-test',secretAccessKey:'local-synthetic-storage-only-2026'}});}};
if(process.env.PPC_LOAD_TELEMETRY){let previous=process.cpuUsage(),at=Date.now();setInterval(()=>{const now=Date.now(),cpu=process.cpuUsage(),memory=process.memoryUsage();writeFileSync(process.env.PPC_LOAD_TELEMETRY,JSON.stringify({pid:process.pid,at:now,rss:memory.rss,heapUsed:memory.heapUsed,cpuPercent:(cpu.user+cpu.system-previous.user-previous.system)/(now-at)/10,uptime:process.uptime()}));previous=cpu;at=now;},2000).unref();}
