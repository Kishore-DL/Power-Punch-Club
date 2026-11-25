import {spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {MongoClient} from 'mongodb';
import {b2Variables} from '../lib/b2-storage.mjs';
process.loadEnvFile(process.argv[2]||'.env.registration-test');
const uri=new URL(process.env.MONGODB_URI||'invalid:');if(uri.protocol!=='mongodb:'||!['127.0.0.1','localhost'].includes(uri.hostname)||!process.env.MONGODB_DATABASE?.startsWith('ppc_test_'))throw Error('Disposable loopback test configuration required.');
const database=process.env.MONGODB_DATABASE+'_storage_'+randomUUID().slice(0,8),origin='http://localhost:3050';
process.env.MONGODB_DATABASE=database;process.env.PPC_TEST_URL=origin;process.env.PPC_PUBLIC_ORIGIN=origin;process.env.PPC_BUILD_DIR='.next-registration-tests';process.env.PPC_CLIENT_PREVIEW='false';process.env.PPC_WRITE_RATE_LIMIT='10000';process.env.PPC_TRUSTED_IP_HEADER='x-ppc-test-ip';
for(const key of [...b2Variables,'BREVO_API_KEY','EMAIL_FROM_ADDRESS','EMAIL_FROM_NAME','ADMIN_NOTIFICATION_EMAIL','RAZORPAY_KEY_ID','RAZORPAY_KEY_SECRET','RAZORPAY_WEBHOOK_SECRET','REMOVEBG_API_KEY'])process.env[key]='';
const run=args=>new Promise((resolve,reject)=>{const child=spawn(process.execPath,args,{env:process.env,stdio:'inherit',windowsHide:true});child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(Error('Test command failed: '+args[0]+' ('+code+')')));});
let server;const mongo=new MongoClient(process.env.MONGODB_URI);
try{
 await run(['scripts/setup-mongodb.mjs']);await run(['tests/b2-storage.mjs']);
 if(process.argv.includes('--build'))await run(['node_modules/next/dist/bin/next','build']);
 server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','-p','3050'],{env:process.env,stdio:'inherit',windowsHide:true});
 let ready=false;for(let i=0;i<60;i++){if(server.exitCode!==null)throw Error('Test application exited.');try{if((await fetch(origin+'/api/status')).ok){ready=true;break;}}catch{}await new Promise(resolve=>setTimeout(resolve,500));}if(!ready)throw Error('Test application startup timed out.');
 await run(['tests/data-management.mjs']);
 server.kill();await new Promise(resolve=>server.once('exit',resolve));server=null;
 Object.assign(process.env,{PPC_TEST_B2_SDK:'isolated-mock',B2_ENDPOINT:'https://s3.us-west-004.backblazeb2.com',B2_REGION:'us-west-004',B2_MEDIA_BUCKET:'ppc-test-private-media',B2_MEDIA_KEY_ID:'mock-media-key',B2_MEDIA_APPLICATION_KEY:'mock-media-secret',B2_DOCUMENTS_BUCKET:'ppc-test-private-documents',B2_DOCUMENTS_KEY_ID:'mock-documents-key',B2_DOCUMENTS_APPLICATION_KEY:'mock-documents-secret'});
 server=spawn(process.execPath,['--import','./tests/b2-sdk-preload.mjs','node_modules/next/dist/bin/next','start','-p','3050'],{env:process.env,stdio:'inherit',windowsHide:true});
 ready=false;for(let i=0;i<60;i++){if(server.exitCode!==null)throw Error('Mock B2 application exited.');try{if((await fetch(origin+'/api/status')).ok){ready=true;break;}}catch{}await new Promise(resolve=>setTimeout(resolve,500));}if(!ready)throw Error('Mock B2 startup timeout.');
 await run(['tests/b2-workflows.mjs']);
 console.log('Storage/Owner regression PASSED. Only disposable loopback data and injected SDK mocks used. No live B2/email/payment calls.');
}finally{server?.kill();if(server&&server.exitCode===null)await Promise.race([new Promise(resolve=>server.once('exit',resolve)),new Promise(resolve=>setTimeout(resolve,3000))]);await mongo.db(database).dropDatabase();await mongo.close();}
