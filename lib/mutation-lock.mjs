import {randomUUID} from 'node:crypto';
import {AsyncLocalStorage} from 'node:async_hooks';
const context=new AsyncLocalStorage();
export async function fenceMutation(db,session){
 const lease=context.getStore();if(!lease||lease.database!==db.databaseName)throw Error('A durable mutation lease is required.');
 const result=await db.collection('maintenance_locks').updateOne({_id:'registration-content-writes',lease:lease.id,until:{$gt:new Date()}},{$inc:{fence:1}},{session});
 if(!result.matchedCount)throw Error('Maintenance lease expired. Retry safely.');
}
// Shared by ordinary writes and destructive jobs; no process-local mutex.
export async function withMutationLock(db,work){
 const locks=db.collection('maintenance_locks'),id='registration-content-writes',lease=randomUUID();
 try{await locks.updateOne({_id:id},{$setOnInsert:{until:new Date(0),revision:0}},{upsert:true});}catch(error){if(error.code!==11000)throw error;}
 const queue=db.collection('maintenance_waiters'),counter='registration-write-queue';let sequence;
 try{sequence=await locks.findOneAndUpdate({_id:counter},{$inc:{next:1}},{upsert:true,returnDocument:'after'});}catch(error){if(error.code!==11000)throw error;sequence=await locks.findOneAndUpdate({_id:counter},{$inc:{next:1}},{returnDocument:'after'});}
 const deadline=Date.now()+10000;await queue.insertOne({_id:lease,order:sequence.next,expiresAt:new Date(deadline)});
 try{
  for(;;){
   if(Date.now()>deadline)throw Error('Maintenance is busy. Retry shortly.');
   const first=await queue.findOne({expiresAt:{$gt:new Date()}},{sort:{order:1}});
   if(first?._id===lease){const claimed=await locks.findOneAndUpdate({_id:id,until:{$lte:new Date()}},{$set:{lease,until:new Date(Date.now()+120000)}},{returnDocument:'after'});if(claimed)break;}
   await new Promise(resolve=>setTimeout(resolve,first?._id===lease?10:25));
  }
 }finally{await queue.deleteOne({_id:lease});}
 let lost=false;const heartbeat=setInterval(()=>{locks.updateOne({_id:id,lease},{$set:{until:new Date(Date.now()+120000)}}).then(result=>{if(!result.matchedCount)lost=true;}).catch(()=>{lost=true;});},15000);
 try{return await context.run({database:db.databaseName,id:lease},()=>work(()=>{if(lost)throw Error('Maintenance lease expired. Retry safely.');}));}
 finally{clearInterval(heartbeat);await locks.updateOne({_id:id,lease},{$set:{until:new Date(0)},$inc:{revision:1},$unset:{lease:''}});}
}
