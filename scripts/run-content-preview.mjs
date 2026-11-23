import {readFile} from 'node:fs/promises';
import {parseEnv} from 'node:util';
import {spawn} from 'node:child_process';
import {MongoClient} from 'mongodb';
import {localContentTarget} from '../lib/content-import.mjs';
const settings=parseEnv(await readFile('.env.content-preview','utf8')),database=localContentTarget(settings);
for(const key of ['BREVO_API_KEY','EMAIL_FROM_ADDRESS','EMAIL_FROM_NAME','RAZORPAY_KEY_ID','RAZORPAY_KEY_SECRET','RAZORPAY_WEBHOOK_SECRET','RESEND_API_KEY','EMAIL_FROM'])settings[key]='';
const mongo=new MongoClient(settings.MONGODB_URI,{serverSelectionTimeoutMS:3000});
try{await mongo.db(database).command({ping:1})}finally{await mongo.close()}
const command=process.argv.includes('--build')?['build']:[process.argv.includes('--production')?'start':'dev','-p','3020'];
const entry=process.argv.includes('--setup')?['scripts/setup-mongodb.mjs']:['node_modules/next/dist/bin/next',...command];
const child=spawn(process.execPath,entry,{env:{...process.env,...settings},stdio:'inherit'});
child.on('exit',code=>{process.exitCode=code??1});
process.on('SIGINT',()=>child.kill('SIGINT'));
