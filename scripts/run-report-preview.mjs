import {spawn} from 'node:child_process';
import {MongoClient} from 'mongodb';
const file=process.argv[2];if(!file||file.startsWith('--'))throw Error('Usage: node scripts/run-report-preview.mjs ENV_FILE [--dev|--build] [--port=3042]');
process.loadEnvFile(file);
const uri=new URL(process.env.MONGODB_URI||'invalid:'),database=process.env.MONGODB_DATABASE||'';
if(uri.protocol!=='mongodb:'||!['127.0.0.1','localhost'].includes(uri.hostname)||!/^ppc_(test|preview)_/.test(database))throw Error('Use a loopback MongoDB replica set and an isolated ppc_test_ or ppc_preview_ database. Production/shared destinations are rejected.');
for(const key of ['BREVO_API_KEY','RAZORPAY_KEY_ID','RAZORPAY_KEY_SECRET','RESEND_API_KEY','EMAIL_FROM_ADDRESS','EMAIL_FROM_NAME','EMAIL_FROM','REMOVE_BG_API_KEY'])process.env[key]='';
const args=process.argv.slice(3),dev=args.includes('--dev'),port=Number(args.find(a=>a.startsWith('--port='))?.slice(7)||3042);
if(!Number.isInteger(port)||port<1024||port>65535||args.some(a=>!['--dev','--build'].includes(a)&&!a.startsWith('--port=')))throw Error('Use a valid preview port.');
process.env.PPC_BUILD_DIR=dev?'.next-content-preview':'.next-registration-tests';process.env.PPC_PUBLIC_ORIGIN='http://localhost:'+port;process.env.PPC_TEST_URL=process.env.PPC_PUBLIC_ORIGIN;process.env.PPC_CLIENT_PREVIEW='false';process.env.PPC_LOCAL_MOCK_CONTENT='false';
process.env.PPC_TRUSTED_IP_HEADER='x-ppc-test-ip';process.env.PPC_WRITE_RATE_LIMIT='10000';
const mongo=new MongoClient(process.env.MONGODB_URI,{serverSelectionTimeoutMS:5000});try{const hello=await mongo.db(database).command({hello:1});if(!hello.setName)throw Error('A disposable replica set is required for snapshot-consistent reports.');}finally{await mongo.close();}
async function command(args){await new Promise((resolve,reject)=>{const child=spawn(process.execPath,args,{stdio:'inherit',env:process.env,windowsHide:true});child.once('exit',code=>code===0?resolve():reject(Error('Command failed: '+args[0])));});}
if(args.includes('--build'))await command(['node_modules/next/dist/bin/next','build']);
console.log('Isolated report preview:',process.env.PPC_PUBLIC_ORIGIN,'Database:',database,'Real providers: disabled. No automatic seeding.');
const server=spawn(process.execPath,['node_modules/next/dist/bin/next',dev?'dev':'start','-p',String(port)],{stdio:'inherit',env:process.env,windowsHide:true});process.on('SIGINT',()=>server.kill());process.on('SIGTERM',()=>server.kill());server.on('exit',code=>{process.exitCode=code||0;});
