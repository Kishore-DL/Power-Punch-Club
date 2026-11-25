import {b2Configuration} from '../lib/b2-storage.mjs';
import { emailConfiguration } from '../lib/admin-notifications.mjs';
import { MongoClient } from 'mongodb';
import '../lib/mongodb-dns.mjs';
import { validateTrackingKeys } from '../lib/registration-identity.mjs';

const errors=[];
const env=process.env;
try{validateTrackingKeys();}catch(error){errors.push(error.message);}
if(!env.MONGODB_URI)errors.push('Set MONGODB_URI.');
if(!env.MONGODB_DATABASE)errors.push('Set a dedicated MONGODB_DATABASE.');
if(env.PPC_CLIENT_PREVIEW!=='false')errors.push('Set PPC_CLIENT_PREVIEW=false for real registrations.');
if(!env.PPC_SESSION_SECRET||env.PPC_SESSION_SECRET.length<32)errors.push('Set a random PPC_SESSION_SECRET of at least 32 characters.');
try{if(new URL(env.PPC_PUBLIC_ORIGIN).protocol!=='https:')throw new Error()}catch{errors.push('Set PPC_PUBLIC_ORIGIN to your exact HTTPS website origin.');}
if(!env.PPC_TRUSTED_IP_HEADER||!/^[a-z0-9-]+$/i.test(env.PPC_TRUSTED_IP_HEADER))errors.push('Set PPC_TRUSTED_IP_HEADER to a client-IP header securely supplied by your hosting ingress.');
if(env.PPC_WRITE_RATE_LIMIT&&(!Number.isInteger(Number(env.PPC_WRITE_RATE_LIMIT))||Number(env.PPC_WRITE_RATE_LIMIT)<1))errors.push('PPC_WRITE_RATE_LIMIT must be a positive integer.');
errors.push(...emailConfiguration(env).issues);
let client;
if(env.MONGODB_URI){
  client=new MongoClient(env.MONGODB_URI,{serverSelectionTimeoutMS:8000});
  try{
    const db=client.db(env.MONGODB_DATABASE||'power_punch_club');
    const hello=await db.command({hello:1});
    if(!hello.setName&&hello.msg!=='isdbgrid')errors.push('MongoDB must support transactions (Atlas or a replica set).');
    const indexes=await db.collection('requests').indexes();
    const sessionIndexes=await db.collection('auth_sessions').indexes().catch(()=>[]);
    if(!sessionIndexes.some(index=>index.key.expiresAt===1&&index.expireAfterSeconds===0))errors.push('Run npm run db:setup to create session expiry indexes.');
    if(!indexes.some(index=>index.name==='unique_manual_transaction'&&index.unique))errors.push('Run npm run db:setup to create payment indexes.');
    const owner=await db.collection('content').findOne({_id:'private-auth-owner'});
    if(!owner)errors.push('Create the owner account by signing in to /admin once.');
    else if(env.PPC_BOOTSTRAP_ADMIN_PASSWORD)errors.push('Remove PPC_BOOTSTRAP_ADMIN_PASSWORD after verifying the owner account.');
    const tournaments=(await db.collection('content').findOne({_id:'tournaments'}))?.value||[];
    for(const event of tournaments.filter(item=>item.status==='open')){
      if(['paid','both'].includes(event.registrationMode)||((!event.registrationMode||event.registrationMode==='auto')&&Number(event.fee)>0)){
        if(!env.RAZORPAY_KEY_ID||!env.RAZORPAY_KEY_SECRET||!env.RAZORPAY_WEBHOOK_SECRET)errors.push(`Configure Razorpay for tournament ${event.id} or disable its Razorpay payment option.`);
      }
      if(event.registrationMode==='manual'||event.manualPaymentEnabled===true){
        const encoded=event.manualQrImage?.split('/api/media/')[1];
        const qr=encoded&&await db.collection('files').findOne({_id:decodeURIComponent(encoded)},{projection:{type:1}});
        if(!qr?.type?.startsWith('image/'))errors.push(`Upload a UPI QR image for tournament ${event.id}.`);
      }
    }
    if(!tournaments.some(event=>event.status==='open'))console.log('Notice: no tournaments are open for registration.');
  }catch{errors.push('Database checks could not complete. Check network access, credentials and run db:setup.');}
  finally{await client.close();}
}
const storage=b2Configuration();if(storage.enabled&&!storage.ready)errors.push(...storage.issues);
for(const error of errors)console.error(error);
if(errors.length)process.exitCode=1;
else console.log('Configuration checks passed. Verify the live QR transfer, receipt, email delivery, backups and hosting load before launch.');
