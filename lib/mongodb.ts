import type {RegistrationData} from './club-types';
import { configureMongoDns } from './mongodb-dns.mjs';
import { MongoClient, MongoServerError, type Db } from 'mongodb';

const connection = globalThis as typeof globalThis & { ppcMongo?: {uri:string; client:MongoClient} };

export function mongoClient() {
  configureMongoDns();
  const uri=process.env.MONGODB_URI;
  if(!uri)throw new Error('Set MONGODB_URI in the server environment');
  if(connection.ppcMongo?.uri!==uri)connection.ppcMongo={
    uri, client:new MongoClient(uri,{serverSelectionTimeoutMS:8000,maxPoolSize:30}),
  };
  return connection.ppcMongo.client;
}
export function database() {
  return mongoClient().db(process.env.MONGODB_DATABASE||'power_punch_club');
}
export function duplicateKey(error:unknown) {
  return error instanceof MongoServerError&&error.code===11000;
}

export type Registration = {
  _id:string; id:string; token:string; kind:string; target:string; name:string; email:string; phone:string;
  data:RegistrationData; status:string; notes:string; amount:number; payment_status:string;
  created:string; order_id?:string|null; payment_id?:string;
  tracking?: {digest:string;keyId:string;iv:string;ciphertext:string;tag:string};
};
export const participantFilter={kind:{$in:['tournament','team']}};
export const registrations=(db:Db)=>db.collection<Registration>('requests');
export const visibleRegistration=(row:Registration)=>({...row,_id:undefined,token:undefined,tracking:undefined,data:JSON.stringify(row.data)});
export const contentRecords=(db:Db)=>db.collection<{_id:string;value:unknown;updated:string}>('content');

export async function reserveRegistration(db:Db,row:Registration,seats:number,capacity:number) {
  if(!seats){
    try{await registrations(db).insertOne(row);return true}catch(error){if(duplicateKey(error)&&(error as MongoServerError).keyPattern?._id)return false;throw error}
  }
  const locks=await eventLock(db,row.target);
  try {
    return await mongoClient().withSession(session=>session.withTransaction(async()=>{
      // Writing the same event lock serializes competing capacity decisions.
      await locks.updateOne({_id:row.target},{$inc:{revision:1}},{session});
      const requests=registrations(db);
      if(await usedSeats(db,row.target,session)+seats>capacity)return false;
      await requests.insertOne(row,{session});
      return true;
    },{readConcern:{level:'snapshot'},writeConcern:{w:'majority'}}));
  }catch(error){if(duplicateKey(error)&&(error as MongoServerError).keyPattern?._id)return false;throw error}
}

async function eventLock(db:Db,target:string) {
  const locks=db.collection<{_id:string;revision:number}>('registration_locks');
  try{await locks.updateOne({_id:target},{$setOnInsert:{revision:0}},{upsert:true})}
  catch(error){if(!duplicateKey(error))throw error}
  return locks;
}

async function usedSeats(db:Db,target:string,session:import('mongodb').ClientSession) {
  const totals=await registrations(db).aggregate<{used:number}>([
    {$match:{target,...participantFilter,status:{$ne:'rejected'}}},
    {$group:{_id:null,used:{$sum:{$cond:[{$eq:['$kind','team']},{$size:{$ifNull:['$data.team',[]]}},1]}}}},
  ],{session}).next();
  return totals?.used||0;
}

export async function editRegistration(db:Db,id:string,status:string,notes:string,events:{id:string;capacity?:number}[]) {
  const requests=registrations(db);
  const existing=await requests.findOne({_id:id});
  if(!existing)return null;
  if(!['team','tournament'].includes(existing.kind)||existing.status!=='rejected'||status==='rejected'){
    return await requests.findOneAndUpdate({_id:id,status:existing.status},{$set:{status,notes}})||false;
  }
  const event=events.find(item=>item.id===existing.target);
  if(!event)return false;
  const locks=await eventLock(db,existing.target);
  return mongoClient().withSession(session=>session.withTransaction(async()=>{
    await locks.updateOne({_id:existing.target},{$inc:{revision:1}},{session});
    const count=existing.kind==='team'?(existing.data.team?.length||0):1;
    if(await usedSeats(db,event.id,session)+count>(Number(event.capacity)||1000000))return false;
    return await requests.findOneAndUpdate({_id:id,status:'rejected'},{$set:{status,notes}},{session})||false;
  },{readConcern:{level:'snapshot'},writeConcern:{w:'majority'}}));
}
