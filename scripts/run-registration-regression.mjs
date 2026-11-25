import {b2Variables} from '../lib/b2-storage.mjs';
import { spawn } from 'node:child_process';
import { MongoClient } from 'mongodb';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import { openTrackingCode } from '../lib/registration-identity.mjs';

process.loadEnvFile(process.argv[2] || '.env.registration-test');
const uri=new URL(process.env.MONGODB_URI),origin=process.env.PPC_TEST_URL||'http://localhost:3010';
if(uri.protocol!=='mongodb:'||!['127.0.0.1','localhost'].includes(uri.hostname)||!process.env.MONGODB_DATABASE?.startsWith('ppc_test_')||new URL(origin).hostname!=='localhost')throw Error('Use a local disposable ppc_test_ replica set and localhost test URL.');
if(process.env.PPC_BUILD_DIR!=='.next-registration-tests')throw Error('Use PPC_BUILD_DIR=.next-registration-tests to keep normal builds separate.');
for(const key of b2Variables)process.env[key]='';
process.env.PPC_CLIENT_PREVIEW='false';
process.env.ADMIN_NOTIFICATION_EMAIL='test-club-admin@example.invalid';
for(const key of ['RAZORPAY_KEY_ID','RAZORPAY_KEY_SECRET','RESEND_API_KEY','EMAIL_FROM','BREVO_API_KEY','EMAIL_FROM_ADDRESS','EMAIL_FROM_NAME'])process.env[key]='';
process.env.RAZORPAY_WEBHOOK_SECRET||='fictional-test-only-webhook-secret';
process.env.PPC_PUBLIC_ORIGIN=origin;
process.env.PPC_TRUSTED_IP_HEADER='x-ppc-test-ip';
process.env.PPC_WRITE_RATE_LIMIT='10000';
const port=new URL(origin).port||'3010',secondOrigin='http://localhost:'+(Number(port)+1);
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function command(args){return new Promise((resolve,reject)=>{const child=spawn(process.execPath,args,{env:process.env,stdio:'inherit'});child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(Error(args[0]+' failed with '+code)));});}
function start(url){return spawn(process.execPath,['node_modules/next/dist/bin/next','start','-p',new URL(url).port],{env:{...process.env,PPC_PUBLIC_ORIGIN:url},stdio:'inherit'});}
async function ready(url,child){for(let i=0;i<60;i++){if(child.exitCode!==null)throw Error('Test server exited.');try{const r=await fetch(url+'/api/status');if(r.ok)return;}catch{}await delay(500);}throw Error('Test server startup timeout.');}
async function stop(child){if(!child||child.exitCode!==null)return;child.kill();await Promise.race([new Promise(resolve=>child.once('exit',resolve)),delay(5000)]);}
async function api(url,path,body){const r=await fetch(url+'/api/'+path,{method:'POST',headers:{'Content-Type':'application/json','x-ppc-test-ip':'203.0.113.250'},body:JSON.stringify(body)});const data=await r.json();assert.equal(r.status,200,JSON.stringify(data));return data;}
let server,second;const mongo=new MongoClient(process.env.MONGODB_URI),db=mongo.db(process.env.MONGODB_DATABASE);
try{
  // This runner explicitly resets ONLY the guarded disposable database.
  console.log('Resetting disposable test database:',db.databaseName);await db.dropDatabase();
  await command(['scripts/setup-mongodb.mjs']);
  await command(['node_modules/next/dist/bin/next','build']);
  server=start(origin);await ready(origin,server);
  for(const file of ['tests/form-contacts.mjs','tests/admin-review.mjs','tests/content-import.mjs','tests/content-transfer-plan.mjs','tests/karate-content-copy.mjs','tests/local-mock-content.mjs','tests/notification-layout.mjs','tests/registration-contact.mjs','tests/mongodb-dns.mjs','tests/brevo-notifications.mjs','tests/pdf-rendering.mjs','tests/pdf-layout.mjs','tests/registration-identity.mjs','tests/mongodb-smoke.mjs','tests/portal-contact.mjs','tests/manual-payment.mjs','tests/brevo-notification-flows.mjs','tests/submission-ui.mjs','tests/proof-images.mjs','tests/request-review.mjs','tests/payment-instruction.mjs','tests/registration-tracking.mjs','tests/pdf-document-data.mjs','tests/registration-browser.mjs'])await command([file]);
  second=start(secondOrigin);await ready(secondOrigin,second);
  const entry=()=>({id:randomUUID(),token:randomUUID(),kind:'tournament',target:'browser-registration',registrationChoice:'free',name:'Multi-server fixture',email:'fixture@example.invalid',phone:'9999999999',consent:true});
  const competing=await Promise.all(Array.from({length:20},(_,i)=>api(i%2?origin:secondOrigin,'register',entry())));assert.equal(new Set(competing.map(r=>r.registrationNumber)).size,20);assert.equal(new Set(competing.map(r=>r.trackingCode)).size,20);
  const retry=entry(),same=await Promise.all(Array.from({length:10},(_,i)=>api(i%2?origin:secondOrigin,'register',retry)));assert.equal(new Set(same.map(r=>r.registrationNumber)).size,1);assert.equal(new Set(same.map(r=>r.trackingCode)).size,1);
  await stop(second);second=null;await stop(server);server=null;
  server=start(origin);await ready(origin,server);
  const repeated=await api(origin,'register',retry);assert.equal(repeated.registrationNumber,same[0].registrationNumber);assert.equal(repeated.trackingCode,same[0].trackingCode);
  const stored=await db.collection('requests').findOne({_id:retry.id});assert.equal(openTrackingCode(stored),repeated.trackingCode);
  const after=await api(origin,'register',entry());assert.ok(Number(after.registrationNumber.match(/\d+$/)[0])>Number(repeated.registrationNumber.match(/\d+$/)[0]));
  console.log('Full registration regression PASSED, including two production server instances and restart continuity.');
}finally{await stop(second);await stop(server);await mongo.close();}
