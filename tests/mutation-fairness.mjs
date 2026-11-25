import assert from 'node:assert/strict';
import {MongoClient} from 'mongodb';
import {randomUUID} from 'node:crypto';
import {withMutationLock} from '../lib/mutation-lock.mjs';
if(!/^mongodb:\/\/(127\.0\.0\.1|localhost):/.test(process.env.MONGODB_URI||'')||!process.env.MONGODB_DATABASE?.startsWith('ppc_test_'))throw Error('Disposable local replica set required.');
const mongo=new MongoClient(process.env.MONGODB_URI),db=mongo.db(process.env.MONGODB_DATABASE+'_fair_'+randomUUID().slice(0,8)),finished=[];let release,active=0,max=0;
try{
 const held=withMutationLock(db,()=>new Promise(resolve=>{release=resolve;}));while(!release)await new Promise(resolve=>setTimeout(resolve,5));
 const waiting=Array.from({length:12},(_,i)=>withMutationLock(db,async()=>{max=Math.max(max,++active);finished.push('waiting-'+i);await new Promise(resolve=>setTimeout(resolve,5));active--;}));
 while(await db.collection('maintenance_waiters').countDocuments({})<12)await new Promise(resolve=>setTimeout(resolve,5));
 const newcomer=withMutationLock(db,async()=>{max=Math.max(max,++active);finished.push('newcomer');active--;});release();await held;await Promise.all([...waiting,newcomer]);assert.equal(max,1);assert.equal(finished.at(-1),'newcomer');assert.equal(await db.collection('maintenance_waiters').countDocuments({}),0);
 await db.collection('maintenance_waiters').insertOne({_id:'expired',order:-1,expiresAt:new Date(0)});await withMutationLock(db,async()=>{});
 console.log('Mutation fairness PASS: 12 queued requests cannot be overtaken by newcomer; one active writer; queue cleanup and expired-waiter recovery.');
}finally{await db.dropDatabase();await mongo.close();}
