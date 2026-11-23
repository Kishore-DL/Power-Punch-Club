import {readFile} from 'node:fs/promises';
import {parseEnv} from 'node:util';
import {MongoClient} from 'mongodb';
import {localContentTarget} from '../lib/content-import.mjs';
import {localMockEnabled,mockTournamentId} from '../lib/local-mock-content.mjs';
import {karateContentCopy} from '../lib/karate-content-copy.mjs';
const envFile=process.argv.find(arg=>arg.startsWith('--env='))?.slice(6)||'.env.content-preview';
const settings=parseEnv(await readFile(envFile,'utf8')),database=localContentTarget(settings);
if(!localMockEnabled(settings))throw Error('Only the isolated local content environment is eligible.');
const client=new MongoClient(settings.MONGODB_URI,{serverSelectionTimeoutMS:5000});
try{
  const db=client.db(database),changes={};
  await client.withSession(session=>session.withTransaction(async()=>{
    for(const key of ['tournaments','training']){
      const collection=db.collection('content'),row=await collection.findOne({_id:key},{session});if(!row||!Array.isArray(row.value))throw Error('Expected populated content.');
      let count=0;
      const value=row.value.map(record=>{
        if(!(key==='tournaments'?record.id===mockTournamentId:/^local-karate-(kids|junior|advanced|weekend)-v1$/.test(record.id)))return record;
        const next=karateContentCopy(record);if(JSON.stringify(next)!==JSON.stringify(record))count++;return next;
      });
      if(count&&process.argv.includes('--apply'))await collection.updateOne({_id:key},{$set:{value,updated:new Date().toISOString()}},{session});
      changes[key]=count;
    }
  }));
  console.log(JSON.stringify({mode:process.argv.includes('--apply')?'applied':'plan-only',changedRecords:changes}));
}finally{await client.close()}
