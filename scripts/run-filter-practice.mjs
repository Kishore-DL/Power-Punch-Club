import {spawn} from 'node:child_process';
import {mkdir,writeFile,access} from 'node:fs/promises';
import path from 'node:path';
import {randomBytes,randomUUID} from 'node:crypto';
import {MongoClient} from 'mongodb';
import {createServer} from 'node:net';
import {setupIdentityIndexes} from '../lib/registration-identity.mjs';

// Explicit disposable setup. Never loads the application's real .env.
const root=process.cwd(),port=3043,mongoPort=37029,origin=`http://localhost:${port}`;
const database='ppc_preview_filter_practice',uri=`mongodb://127.0.0.1:${mongoPort}/?replicaSet=ppcPractice`;
const state=path.join(root,'.local-backups','filter-practice'),envFile=path.join(state,'practice.env');
await new Promise((resolve,reject)=>{const probe=createServer();probe.once('error',()=>reject(Error('Port 3043 is occupied. Stop the previous practice server before restarting.')));probe.listen(port,'127.0.0.1',()=>probe.close(resolve));});
await mkdir(state,{recursive:true});
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function connect(){const client=new MongoClient(uri,{serverSelectionTimeoutMS:1500});try{await client.connect();return client;}catch{await client.close();return null;}}
let client=await connect();
if(!client){
 const executable=path.join(root,'.local-backups','mongodb-native-tests','mongod.exe');await access(executable);
 const data=path.join(state,'mongo');await mkdir(data,{recursive:true});
 const native=spawn(executable,['--dbpath',data,'--port',String(mongoPort),'--bind_ip','127.0.0.1','--replSet','ppcPractice','--wiredTigerCacheSizeGB','0.25','--logpath',path.join(state,'mongod.log'),'--logappend'],{detached:true,stdio:'ignore',windowsHide:true});native.unref();
 let direct;
 for(let i=0;i<30;i++){try{direct=new MongoClient(`mongodb://127.0.0.1:${mongoPort}/?directConnection=true`,{serverSelectionTimeoutMS:1000});await direct.connect();break;}catch{await direct?.close();direct=null;await sleep(500);}}
 if(!direct)throw Error('Local practice MongoDB could not start. Check the ignored practice mongod.log.');
 try{const hello=await direct.db('admin').command({hello:1});if(hello.setName&&hello.setName!=='ppcPractice')throw Error('Port belongs to another replica set; refusing to use it.');if(!hello.setName)await direct.db('admin').command({replSetInitiate:{_id:'ppcPractice',members:[{_id:0,host:`127.0.0.1:${mongoPort}`}]}});}finally{await direct.close();}
 for(let i=0;i<30&&!client;i++){await sleep(500);client=await connect();}
}
if(!client)throw Error('Local practice replica set is not ready.');
if((await client.db('admin').command({hello:1})).setName!=='ppcPractice')throw Error('Unexpected MongoDB destination.');
try{await access(envFile);}catch{
 const key=()=>randomBytes(32).toString('hex');
 await writeFile(envFile,[`MONGODB_URI=${uri}`,`MONGODB_DATABASE=${database}`,'PPC_BOOTSTRAP_ADMIN_ID=practice-admin','PPC_BOOTSTRAP_ADMIN_PASSWORD=PracticeOnly@2026',`PPC_SESSION_SECRET=${key()}`,`PPC_TRACKING_DIGEST_KEY=${key()}`,'PPC_TRACKING_ACTIVE_KEY=practice',`PPC_TRACKING_KEYS='${JSON.stringify({practice:key()})}'`,'PPC_FILTER_PRACTICE=true',''].join('\n'));
}
process.loadEnvFile(envFile);
if(process.env.MONGODB_URI!==uri||process.env.MONGODB_DATABASE!==database)throw Error('Practice environment destination changed; refusing writes.');
const env={...process.env,MONGODB_URI:uri,MONGODB_DATABASE:database,PPC_FILTER_PRACTICE:'true',PPC_BUILD_DIR:'.next-content-preview',PPC_PUBLIC_ORIGIN:origin,PPC_CLIENT_PREVIEW:'false',PPC_LOCAL_MOCK_CONTENT:'false',PPC_TRUSTED_IP_HEADER:'x-ppc-test-ip',PPC_WRITE_RATE_LIMIT:'10000',NODE_OPTIONS:'--max-old-space-size=512 --max-semi-space-size=4',RAYON_NUM_THREADS:'1'};
for(const key of ['BREVO_API_KEY','RESEND_API_KEY','EMAIL_FROM_ADDRESS','EMAIL_FROM_NAME','EMAIL_FROM','ADMIN_NOTIFICATION_EMAIL','RAZORPAY_KEY_ID','RAZORPAY_KEY_SECRET','RAZORPAY_WEBHOOK_SECRET','REMOVE_BG_API_KEY'])env[key]='';
const db=client.db(database),eventId='filter-practice-tournament',formId='filter-practice-form';
const names=['Arun','Bala','Charan','Divya','Ezhil','Farhan','Gokul','Hari','Iniya','Jaya','Kavin','Lavanya'];
const ids=names.map(name=>'filter-practice-'+name.toLowerCase()+'-2026');
if(await db.collection('requests').countDocuments({_id:{$nin:ids}}))throw Error('Unexpected records in practice database; refusing to hide/delete them.');
await setupIdentityIndexes(db);
const fields=[['student-name','Student name','text',''],['city','City','text','Vellore,Chennai,Salem,Kanchipuram'],['master','Master name','text','Kumar,Ravi,Suresh,Priya'],['dojo','Dojo','text','Power Punch Dojo,Victory Dojo'],['belt','Belt','select','Black,Brown'],['category','Category','select','Under 14,Under 10']].map(([id,label,type,options])=>({id:'practice-'+id,label,type,options,required:true,showOnReceipt:true}));
const forms=[{id:formId,title:'City and belt registration',fields},
 {id:'practice-junior-form',title:'Junior registration',fields:[...fields.filter(field=>!['practice-belt','practice-category'].includes(field.id)),{id:'practice-age',label:'Age',type:'number',required:true,showOnReceipt:true}]},
 {id:'practice-open-form',title:'Open registration',fields:fields.filter(field=>!['practice-city','practice-dojo'].includes(field.id))}];
const events=[{id:eventId,title:'Vellore Karate Championship',formId},
 {id:'practice-junior-tournament',title:'Chennai Junior Championship',formId:forms[1].id},
 {id:'practice-open-tournament',title:'Salem Open Karate Cup',formId:forms[2].id}].map(event=>({...event,status:'open',registrationMode:'free',fee:0,date:'2026-12-20',venue:'Local practice',capacity:30}));
for(const [id,value] of [['forms',forms],['tournaments',events],['branding',{name:'Power Punch Club',logo:'/power-punch-logo.webp',registrationPrefix:'PRACTICE',registrationSuffix:''}]])await db.collection('content').updateOne({_id:id},{$set:{value,updated:new Date().toISOString()}},{upsert:true});
await db.collection('admin_export_jobs').createIndex({owner:1,requestId:1},{unique:true});
await db.collection('admin_export_jobs').createIndex({owner:1,active:1},{unique:true,partialFilterExpression:{active:true}});
const server=spawn(process.execPath,['node_modules/next/dist/bin/next','dev','--hostname','127.0.0.1','-p',String(port)],{env,stdio:'inherit',windowsHide:true});
server.on('error',error=>{console.error(error.message);process.exitCode=1;});
process.on('SIGINT',()=>server.kill());process.on('SIGTERM',()=>server.kill());
async function api(body){const response=await fetch(origin+'/api/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});if(!response.ok)throw Error('Validated practice registration failed: '+response.status+' '+await response.text());return response.json();}
try{
 let ready=false;for(let i=0;i<90;i++){try{const response=await fetch(origin+'/api/session');if(response.ok){ready=true;break;}}catch{}await sleep(500);}
 if(!ready)throw Error('Practice server did not become ready.');
 for(let i=0;i<names.length;i++){
  const name=names[i],event=events[Math.floor(i/4)],index=i%4,id=ids[i];
  const city=['Vellore','Chennai','Salem','Kanchipuram'][index],master=['Kumar','Ravi','Suresh','Priya'][index];
  const values={'practice-student-name':name,'practice-city':city,'practice-master':master,'practice-dojo':['Power Punch Dojo','Victory Dojo','Tiger Dojo','Lotus Dojo'][index],'practice-belt':index%2?'Brown':'Black','practice-category':index%2?'Under 10':'Under 14','practice-age':10+index};
  const answers=Object.fromEntries(forms.find(form=>form.id===event.formId).fields.map(field=>[field.id,values[field.id]]));
  if(!await db.collection('requests').findOne({_id:id})){
   await api({id,token:randomUUID(),kind:'tournament',target:event.id,name,email:name.toLowerCase()+'@example.invalid',phone:'900000'+String(i+1).padStart(4,'0'),consent:true,registrationChoice:'free',answers});
   await db.collection('requests').updateOne({_id:id,target:event.id},{$set:{status:['new','approved','rejected','contacted'][index]}});
  }
  // Historical fixture dates are set only in this exact isolated database.
  const created=new Date(Date.UTC(2026,10,20+Math.floor(i/4),4+index,30)).toISOString();
  await db.collection('requests').updateOne({_id:id,target:event.id},{$set:{created}});
 }
 if(await db.collection('requests').countDocuments()!==12)throw Error('Practice must have exactly 12 registrations.');
 const page=await fetch(origin+'/admin?practice=filters');if(!page.ok)throw Error('Practice Admin page could not load.');
 console.log('\nPractice ready: '+origin+'/admin?practice=filters\nLocal login: practice-admin / PracticeOnly@2026\n3 tournaments, 3 forms, 4 masters, 12 individual registrations. Live email/payment providers disabled.');
}catch(error){server.kill();throw error;}finally{await client.close();}
server.on('exit',code=>{process.exitCode=code||0;});
