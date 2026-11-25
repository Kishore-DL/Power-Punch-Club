import assert from 'node:assert/strict';
import {MongoClient} from 'mongodb';
import {randomUUID} from 'node:crypto';
import {queueAdminNotification,registrationNotification} from '../lib/admin-notifications.mjs';
if(!/^mongodb:\/\/(127\.0\.0\.1|localhost):/.test(process.env.MONGODB_URI||'')||!process.env.MONGODB_DATABASE?.startsWith('ppc_test_'))throw Error('Disposable local database required.');
const client=new MongoClient(process.env.MONGODB_URI,{monitorCommands:true}),db=client.db(process.env.MONGODB_DATABASE+'_enqueue_'+randomUUID().slice(0,8));
try{
 await db.collection('outbox').insertMany(Array.from({length:2000},(_,i)=>({id:'pending-'+i,recipient:null,audience:'admin',notificationPolicy:'admin-only-v1',status:'pending',event:'registration-created',registrationId:'synthetic-'+i,registrationKind:'tournament'})));
 let sweeps=0,tombstoneReads=0;const listener=event=>{if(event.commandName==='find'&&event.command.find==='outbox')sweeps++;if(event.commandName==='find'&&event.command.find==='registration_tombstones')tombstoneReads++;};client.on('commandStarted',listener);
 const row={id:randomUUID(),kind:'tournament',name:'Synthetic backlog student',email:'fixture@example.invalid',phone:'9999999999',amount:50000,payment_status:'manual_pending',data:{registrationNumber:'SYNTHETIC-ONLY',receiptTitle:'Local test',paymentMethod:'manual'}};
 const queued=await queueAdminNotification(db,registrationNotification('registration-created',row),{env:{},deferDelivery:true});client.off('commandStarted',listener);
 assert.equal(queued.status,'pending');assert.equal(sweeps,0);assert.ok(tombstoneReads<=2);assert.equal(await db.collection('outbox').countDocuments({}),2001);
 console.log('Enqueue backlog regression PASS: 2,000 existing pending messages preserved; no unrelated outbox scan; bounded tombstone reads; no provider calls.');
}finally{await db.dropDatabase();await client.close();}
