import { skipIneligibleOutbox } from '../lib/admin-notifications.mjs';
import '../lib/mongodb-dns.mjs';
import { MongoClient } from 'mongodb';
import { setupIdentityIndexes, validateTrackingKeys } from '../lib/registration-identity.mjs';

if(!process.env.MONGODB_URI)throw new Error('Set MONGODB_URI in your server environment or .env');
const client=new MongoClient(process.env.MONGODB_URI,{serverSelectionTimeoutMS:8000});
try {
  const db=client.db(process.env.MONGODB_DATABASE||'power_punch_club');
  const hello=await db.command({hello:1});
  if(!hello.setName&&hello.msg!=='isdbgrid')throw new Error('Tournament reservations require a MongoDB replica set or Atlas deployment');
  await db.command({ping:1});
  validateTrackingKeys();
  await setupIdentityIndexes(db);
  await Promise.all([
    db.collection('requests').createIndexes([
      {key:{created:-1},name:'recent_registrations'},
      {key:{target:1,created:-1,_id:1},name:'report_event_date'},
      {key:{created:-1,_id:1},name:'report_date_tiebreaker'},
      {key:{target:1,status:1,kind:1},name:'event_capacity'},
      {key:{order_id:1},name:'payment_order'},
      {key:{'data.manualTransactionKey':1},name:'unique_manual_transaction',unique:true,partialFilterExpression:{'data.manualTransactionKey':{$type:'string'}}},
    ]),
    db.collection('auth_sessions').createIndex({expiresAt:1},{expireAfterSeconds:0}),
    db.collection('maintenance_waiters').createIndex({order:1}),
    db.collection('maintenance_waiters').createIndex({expiresAt:1},{expireAfterSeconds:0}),
    db.collection('limits').createIndex({expiresAt:1},{expireAfterSeconds:0}),
    db.collection('audit').createIndex({created:-1}),
    db.collection('admin_export_jobs').createIndex({owner:1,requestId:1},{unique:true,name:'report_request_idempotency'}),
    db.collection('admin_export_jobs').createIndex({owner:1,active:1},{unique:true,partialFilterExpression:{active:true},name:'one_active_export_per_admin'}),
    db.collection('admin_export_jobs').createIndex({expiresAt:1},{name:'report_expiry_cleanup'}),
    db.collection('data_delete_confirmations').createIndex({expiresAt:1},{expireAfterSeconds:0}),
    db.collection('data_deletion_jobs').createIndex({status:1,created:-1}),
    db.collection('files').createIndex({provider:1,claimed:1,expiresAt:1},{name:'unclaimed_file_cleanup'}),
    db.collection('outbox').createIndex({status:1,created:1}),
  ]);
  const skipped=await skipIneligibleOutbox(db);
  console.log('MongoDB connected. Indexes are ready. Historical notification messages skipped:',skipped);
} catch(error){
  console.error('MongoDB setup did not complete. Check your URI, database permissions and replica-set configuration.');
  console.error(error?.codeName||error?.name||'Unknown setup error');
  if(error?.message?.startsWith('Historical registration conflicts')||error?.message?.startsWith('Configure '))console.error(error.message);
  process.exitCode=1;
} finally {
  await client.close();
}
