import {readFile} from 'node:fs/promises';
import {parseEnv} from 'node:util';
import {MongoClient} from 'mongodb';
import {localContentTarget} from '../lib/content-import.mjs';
const settings=parseEnv(await readFile('.env.content-preview','utf8')),database=localContentTarget(settings),uri=new URL(settings.MONGODB_URI);
if(uri.port!=='37029'||uri.searchParams.get('replicaSet')!=='ppcPreview')throw Error('Expected dedicated local ppcPreview replica set on port 37029.');
const mongo=new MongoClient(settings.MONGODB_URI,{serverSelectionTimeoutMS:5000});
try{
  const admin=mongo.db('admin');
  try{await admin.command({replSetGetStatus:1})}catch(error){if(error.code!==94)throw error;await admin.command({replSetInitiate:{_id:'ppcPreview',members:[{_id:0,host:'127.0.0.1:37029'}]}})}
  let ready=false;for(let i=0;i<40;i++){const hello=await admin.command({hello:1});if(hello.isWritablePrimary&&hello.setName==='ppcPreview'){ready=true;break}await new Promise(resolve=>setTimeout(resolve,500))}
  if(!ready)throw Error('Preview replica set did not become writable.');
  console.log('Confirmed isolated database '+database+' on loopback port 37029. No content imported.');
}finally{await mongo.close()}
