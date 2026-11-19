// Explicit Node preload for disposable integration tests only. Production never
// imports this module. An exact URL interception prevents any real Brevo send.
import { readFile,appendFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
if(!process.env.MONGODB_DATABASE?.startsWith('ppc_test_')||!/^mongodb:\/\/(127\.0\.0\.1|localhost):/.test(process.env.MONGODB_URI||'')||process.env.BREVO_API_KEY!=='fake_brevo_test_only'||!process.env.ADMIN_NOTIFICATION_EMAIL?.endsWith('@example.invalid'))throw Error('Brevo mock requires disposable local test settings.');
const original=globalThis.fetch;
globalThis.fetch=async(url,request)=>{
  if(String(url)!=='https://api.brevo.com/v3/smtp/email')return original(url,request);
  const payload=JSON.parse(request.body);
  if(payload.to.length!==1||payload.to[0].email!==process.env.ADMIN_NOTIFICATION_EMAIL||payload.cc||payload.bcc)throw Error('Test intercepted a forbidden email recipient.');
  await appendFile(process.env.PPC_MOCK_BREVO_LOG,JSON.stringify({to:payload.to,subject:payload.subject,idempotencyKey:payload.headers?.idempotencyKey})+'\n');
  const settings=JSON.parse(await readFile(process.env.PPC_MOCK_BREVO_RESPONSE_FILE,'utf8'));
  if(settings.gated){
    let released=false;
    for(let i=0;i<140;i++){if(existsSync(process.env.PPC_MOCK_BREVO_RELEASE_FILE)){released=true;break;}await new Promise(resolve=>setTimeout(resolve,50));}
    if(!released)throw Error('Mock provider was not released before its timeout.');
  }
  return Response.json(settings.status===201?{messageId:'<mock-'+randomUUID()+'@brevo.invalid>'}:settings.body,{status:settings.status,headers:settings.headers});
};
