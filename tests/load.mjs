import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
const origin=process.env.PPC_TEST_URL||'http://127.0.0.1:3000';
if(!['localhost','127.0.0.1'].includes(new URL(origin).hostname)||!process.env.MONGODB_DATABASE?.startsWith('ppc_test_'))throw new Error('Use a disposable local ppc_test_ database.');
const login=await fetch(origin+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({role:'admin',username:process.env.PPC_BOOTSTRAP_ADMIN_ID,password:process.env.PPC_BOOTSTRAP_ADMIN_PASSWORD})});
assert.equal(login.status,200);const cookie=login.headers.get('set-cookie')?.split(';')[0];
const event={id:'load-event',title:'Local load test',fee:0,capacity:1000,status:'open',registrationMode:'free'};
assert.equal((await fetch(origin+'/api/content',{method:'PUT',headers:{'Content-Type':'application/json',Cookie:cookie},body:JSON.stringify({key:'tournaments',value:[event]})})).status,200);
async function run(label,total,concurrency,operation){
  let cursor=0;const times=[];const statuses={};const start=performance.now();
  await Promise.all(Array.from({length:concurrency},async()=>{
    for(;;){const index=cursor++;if(index>=total)return;const before=performance.now();const response=await operation(index);await response.arrayBuffer();times.push(performance.now()-before);statuses[response.status]=(statuses[response.status]||0)+1;}
  }));
  times.sort((a,b)=>a-b);
  const report={label,total,concurrency,seconds:Math.round((performance.now()-start)/100)/10,p95Ms:Math.round(times[Math.floor(times.length*.95)]),statuses};
  console.log(JSON.stringify(report));assert.equal(statuses[200],total,JSON.stringify(report));
}
await run('Content reads',1000,100,()=>fetch(origin+'/api/content'));
await run('Registration writes',1000,25,index=>fetch(origin+'/api/register',{method:'POST',headers:{'Content-Type':'application/json','x-ppc-test-ip':'load-'+index},body:JSON.stringify({id:randomUUID(),token:randomUUID(),kind:'tournament',target:event.id,registrationChoice:'free',name:'Load test',email:'load@example.invalid',phone:'9999999999',consent:true})}));
