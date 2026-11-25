import {spawn} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {parseEnv} from 'node:util';
const file=process.argv[2];if(!file)throw Error('Pass the private isolated preview environment file.');process.loadEnvFile(file);
if(!/^mongodb:\/\/(127\.0\.0\.1|localhost):/.test(process.env.MONGODB_URI||'')||!process.env.MONGODB_DATABASE?.startsWith('ppc_preview_b2_')||process.env.PPC_LOCAL_S3_TEST!=='true')throw Error('Only isolated local B2 review destinations are allowed.');
for(const key of ['BREVO_API_KEY','ADMIN_NOTIFICATION_EMAIL','EMAIL_FROM_ADDRESS','EMAIL_FROM_NAME','RAZORPAY_KEY_ID','RAZORPAY_KEY_SECRET','RAZORPAY_WEBHOOK_SECRET','REMOVEBG_API_KEY','REMOVE_BG_API_KEY','RESEND_API_KEY'])process.env[key]='';
process.env.PPC_BUILD_DIR='.next-registration-tests';process.env.PPC_PUBLIC_ORIGIN='http://localhost:3055';process.env.PPC_CLIENT_PREVIEW='false';process.env.PPC_WRITE_RATE_LIMIT='120';
// Reuse existing server secrets in memory only; never persist them in preview files.
if(process.env.PPC_FS_REMOTE_ORIGINALS==='true'){const source=parseEnv(readFileSync('.env','utf8'));for(const key of ['B2_ENDPOINT','B2_REGION','B2_MEDIA_BUCKET','B2_DOCUMENTS_BUCKET','B2_MEDIA_KEY_ID','B2_MEDIA_APPLICATION_KEY','B2_DOCUMENTS_KEY_ID','B2_DOCUMENTS_APPLICATION_KEY'])process.env[key]=source[key]||'';}
const child=spawn(process.execPath,['--import','./tests/fs-b2-preload.mjs','node_modules/next/dist/bin/next','start','-p','3055'],{env:process.env,stdio:'inherit',windowsHide:true});process.on('SIGINT',()=>child.kill());process.on('SIGTERM',()=>child.kill());child.once('exit',code=>{process.exitCode=code||0;});
