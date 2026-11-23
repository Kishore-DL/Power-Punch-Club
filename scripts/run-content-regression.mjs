import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {parseEnv} from 'node:util';
import {randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';
import {MongoClient} from 'mongodb';
import {localContentTarget} from '../lib/content-import.mjs';
const settings=parseEnv(await readFile(process.argv[2]||'.env.registration-test','utf8'));
localContentTarget(settings);
if(!settings.MONGODB_DATABASE?.startsWith('ppc_test_')||settings.PPC_BUILD_DIR!=='.next-registration-tests')throw Error('Use the existing local disposable registration-test configuration and build.');
const id=randomUUID().replaceAll('-','');
settings.MONGODB_DATABASE='ppc_test_content_'+id;
settings.PPC_PUBLIC_ORIGIN='http://localhost:3022';settings.PPC_TEST_URL=settings.PPC_PUBLIC_ORIGIN;
settings.PPC_LOCAL_MOCK_CONTENT='true';settings.PPC_CLIENT_PREVIEW='false';settings.ADMIN_NOTIFICATION_EMAIL='';
for(const key of ['BREVO_API_KEY','EMAIL_FROM_ADDRESS','EMAIL_FROM_NAME','RAZORPAY_KEY_ID','RAZORPAY_KEY_SECRET','RAZORPAY_WEBHOOK_SECRET','RESEND_API_KEY','EMAIL_FROM'])settings[key]='';
await mkdir('outputs/content-regression',{recursive:true});const envFile='outputs/content-regression/'+id+'.env';
await writeFile(envFile,Object.entries(settings).map(([key,value])=>key+"='"+value+"'").join('\n')+'\n',{flag:'wx'});
const env={...process.env,...settings,PPC_CONTENT_PREVIEW_ENV:envFile,PPC_BOUNDARY_TEST_URL:'http://localhost:3023'};
const run=args=>new Promise((resolve,reject)=>{const child=spawn(process.execPath,args,{env,stdio:'inherit'});child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(Error('Content regression command failed: '+args[0]+' ('+code+')')))});
const mongo=new MongoClient(settings.MONGODB_URI);let server;
try{
  await run(['scripts/setup-mongodb.mjs']);
  await run(['scripts/import-preview-content.mjs','--env='+envFile,'--apply']);
  await run(['scripts/import-preview-content.mjs','--env='+envFile,'--apply']);
  await run(['scripts/seed-local-karate.mjs','--env='+envFile,'--apply']);
  await run(['scripts/seed-local-karate.mjs','--env='+envFile,'--apply']);
  await run(['scripts/clean-local-karate-copy.mjs','--env='+envFile,'--apply']);
  server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','-p','3022'],{env,stdio:'inherit'});
  let ready=false;for(let i=0;i<60;i++){try{if((await fetch(settings.PPC_PUBLIC_ORIGIN+'/api/status')).ok){ready=true;break}}catch{}if(server.exitCode!==null)throw Error('Content regression server stopped.');await new Promise(resolve=>setTimeout(resolve,300))}if(!ready)throw Error('Content test server did not start.');
  for(const file of ['tests/content-import.mjs','tests/content-transfer-plan.mjs','tests/karate-content-copy.mjs','tests/local-mock-content.mjs','tests/content-preview.mjs','tests/local-karate-flow.mjs','tests/local-mock-boundary.mjs'])await run([file]);
  console.log('Content release regression PASSED using a newly created disposable database, no live providers, gallery/classes/tournament editing and full manual-proof workflow.');
}finally{
  if(server&&server.exitCode===null){server.kill();await new Promise(resolve=>server.once('exit',resolve))}
  // This randomly named database is created exclusively by this invocation.
  try{await mongo.db(settings.MONGODB_DATABASE).dropDatabase()}finally{await mongo.close()}
}
