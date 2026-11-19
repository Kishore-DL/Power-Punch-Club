import assert from 'node:assert/strict';
import { MongoClient } from 'mongodb';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { allocateIdentity, ensureTracking, generateTrackingCode, openTrackingCode, persistRegistration, sealTrackingCode, setupIdentityIndexes, sequenceNumber, trackingLimits, TrackingLimitError, trackingSession, trackingSessionId, authorisedRegistration } from '../lib/registration-identity.mjs';

if (!process.env.MONGODB_DATABASE?.startsWith('ppc_test_')) throw Error('Disposable ppc_test_ database required.');
const client=new MongoClient(process.env.MONGODB_URI),other=new MongoClient(process.env.MONGODB_URI);
const db=client.db(process.env.MONGODB_DATABASE+'_identity_'+randomUUID().slice(0,8)),second=other.db(db.databaseName);
function row(number){const id=randomUUID();return {_id:id,id,token:randomUUID(),data:{registrationNumber:number},created:new Date().toISOString()};}
try{
  const legacy=row('PPC-000023');await db.collection('requests').insertOne(legacy);
  await Promise.all(Array.from({length:8},()=>setupIdentityIndexes(db)));
  const results=await Promise.all(Array.from({length:30},(_,i)=>allocateIdentity(i%2?db:second,randomUUID(),'PPC','')));
  assert.equal(new Set(results.map(r=>r.number)).size,30);
  assert.deepEqual(results.map(r=>Number(r.number.split('-').at(-1))).sort((a,b)=>a-b),Array.from({length:30},(_,i)=>i+24));
  assert.equal((await allocateIdentity(db,randomUUID(),'PPP','')).number,'PPP-000054');
  assert.equal((await allocateIdentity(second,randomUUID(),'PPC26','-S')).number,'PPC26-000055-S');
  assert.equal(sequenceNumber(1000000,'PPC'),'PPC-1000000');assert.equal(sequenceNumber(1,'PPC-REG-','/A'),'PPC-REG-000001/A');
  for(let i=0;i<1000;i++)assert.match(generateTrackingCode(),/^(?=.*[A-Z])(?=.*\d)[A-Z0-9]{6}$/);
  const secured=await ensureTracking(db,legacy,()=> 'A1B2C3');
  assert.equal(openTrackingCode(secured),'A1B2C3');assert.equal(secured.data.registrationNumber,legacy.data.registrationNumber);
  const unchanged=await ensureTracking(second,legacy,()=> 'D4E5F6');assert.equal(openTrackingCode(unchanged),'A1B2C3');
  let attempt=0;const candidate=row(undefined);
  const inserted=await persistRegistration(second,candidate,'PPC','',async record=>{await db.collection('requests').insertOne(record);return true;},()=>++attempt===1?'A1B2C3':'Z9Y8X7');
  assert.equal(attempt,2);assert.equal(openTrackingCode(inserted.row),'Z9Y8X7');
  const nextCounter=await db.collection('registration_counters').findOne({_id:'registrations'});
  await db.collection('requests').insertOne(row(sequenceNumber(nextCounter.seq+1,'PPC')));
  const numberCollision=row(undefined);
  const saved=await persistRegistration(db,numberCollision,'PPC','',async record=>{await db.collection('requests').insertOne(record);return true;});
  assert.equal(saved.row.data.registrationNumber,sequenceNumber(nextCounter.seq+2,'PPC'));
  await assert.rejects(db.collection('requests').insertOne({...row('another'),tracking:secured.tracking}),error=>error.code===11000);
  // A duplicate historical reference must fail migration without rewriting either row.
  const conflicts=client.db(db.databaseName+'_conflicts'),first=row('OLD-42'),last=row('old-42');
  await conflicts.collection('requests').insertMany([first,last]);
  await assert.rejects(setupIdentityIndexes(conflicts),/Historical registration conflicts/);
  assert.equal((await conflicts.collection('requests').findOne({_id:first.id})).data.registrationNumber,'OLD-42');
  assert.equal(await conflicts.collection('requests').countDocuments(),2);
  // Ciphertext is bound to a record and authenticated; swapping it cannot grant access.
  assert.throws(()=>openTrackingCode({...secured,id:randomUUID()}));
  assert.throws(()=>openTrackingCode({...secured,tracking:{...secured.tracking,tag:'00'.repeat(16)}}));
  const req=new Request('http://localhost',{headers:{'x-ppc-test-ip':'192.0.2.1'}}),now=600_000*100+100;
  await Promise.all(Array.from({length:10},(_,i)=>trackingLimits(i%2?db:second,req,'PPC-001',now)));
  await assert.rejects(trackingLimits(db,req,'PPC-001',now),TrackingLimitError);
  await trackingLimits(second,req,'PPC-001',now+600_000);
  const ipReq=new Request('http://localhost',{headers:{'x-ppc-test-ip':'192.0.2.9'}});
  for(let i=0;i<30;i++)await trackingLimits(db,ipReq,'NUM-'+i,now);
  await assert.rejects(trackingLimits(second,ipReq,'DIFFERENT',now),TrackingLimitError);
  const bucket='global:'+Math.floor(now/600_000);
  await db.collection('tracking_limits').updateOne({_id:bucket},{$set:{count:1000}});
  await assert.rejects(trackingLimits(second,new Request('http://localhost',{headers:{'x-ppc-test-ip':'198.51.100.1'}}),'NEW',now),TrackingLimitError);
  const cookie=trackingSession(secured.id).split(';')[0],scoped=new Request('http://localhost',{headers:{cookie}});
  assert.equal(trackingSessionId(scoped),secured.id);
  assert.equal((await authorisedRegistration(db,scoped,{id:secured.id})).id,secured.id);
  assert.equal(await authorisedRegistration(db,scoped,{id:candidate.id}),null);
  const bad=new Request('http://localhost',{headers:{cookie:cookie+'x'}});assert.equal(trackingSessionId(bad),null);
  const savedKey=process.env.PPC_TRACKING_ACTIVE_KEY,keys=process.env.PPC_TRACKING_KEYS;
  process.env.PPC_TRACKING_KEYS=JSON.stringify({...JSON.parse(keys),v2:'ab'.repeat(32)});process.env.PPC_TRACKING_ACTIVE_KEY='v2';
  assert.equal(openTrackingCode(secured),'A1B2C3');const rotated={...candidate,tracking:sealTrackingCode(candidate.id,'R2T3Y4')};assert.equal(openTrackingCode(rotated),'R2T3Y4');
  process.env.PPC_TRACKING_ACTIVE_KEY=savedKey;process.env.PPC_TRACKING_KEYS=keys;
  // A new Node process must continue the counter, using the same persisted database.
  await db.collection('registration_counters').updateOne({_id:'registrations'},{$set:{seq:999999}});
  assert.equal((await allocateIdentity(db,randomUUID(),'PPC','')).number,'PPC-1000000');
  const before=await db.collection('registration_counters').findOne({_id:'registrations'});
  const child=spawnSync(process.execPath,['--input-type=module','-e',`import {MongoClient} from 'mongodb';import {allocateIdentity} from './lib/registration-identity.mjs';const c=new MongoClient(process.env.MONGODB_URI);try{const r=await allocateIdentity(c.db(${JSON.stringify(db.databaseName)}),'restart-fixture','PPC','');console.log(r.number)}finally{await c.close()}`],{cwd:process.cwd(),env:process.env,encoding:'utf8'});
  assert.equal(child.status,0,child.stderr);assert.equal(child.stdout.trim(),sequenceNumber(before.seq+1,'PPC'));
  console.log('Identity integration passed: multi-client counter creation/allocation, prefix changes, restart, collisions, legacy CAS, encryption tamper/rotation, conflict reporting, shared IP/number/global cooldowns and session isolation.');
}finally{await Promise.all([client.close(),other.close()]);}
