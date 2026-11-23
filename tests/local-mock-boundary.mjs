import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import {parseEnv} from 'node:util';
import {randomUUID} from 'node:crypto';
import {localMockEnabled,mockTournamentId} from '../lib/local-mock-content.mjs';
const env=parseEnv(await readFile(process.env.PPC_CONTENT_PREVIEW_ENV||'.env.content-preview','utf8'));assert.ok(localMockEnabled(env));assert.equal(env.BREVO_API_KEY,'');assert.equal(env.RAZORPAY_KEY_SECRET,'');
const origin=process.env.PPC_BOUNDARY_TEST_URL||'http://localhost:3021',server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','-p',new URL(origin).port],{env:{...process.env,...env,PPC_LOCAL_MOCK_CONTENT:'false',PPC_PUBLIC_ORIGIN:origin},stdio:'ignore'});
try{
  let ready=false;for(let i=0;i<60;i++){try{if((await fetch(origin+'/api/status')).ok){ready=true;break}}catch{}await new Promise(resolve=>setTimeout(resolve,200))}assert.ok(ready);
  const c=await (await fetch(origin+'/api/content')).json();assert.ok(!c.tournaments.some(t=>t.id===mockTournamentId));assert.ok(!c.training.some(t=>t.localOnlyPreview));assert.ok(!c.forms.some(t=>t.localOnlyPreview));assert.equal(c.gallery.length,8);assert.equal((await fetch(origin+'/api/upi-qr?id='+mockTournamentId)).status,404);
  for(const email of ['', 'fictional@example.invalid']){const r=await fetch(origin+'/api/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:randomUUID(),token:randomUUID(),kind:'tournament',target:mockTournamentId,name:'Boundary fixture',email,phone:'9999999999',consent:true,registrationChoice:'manual',previewEmailOptional:true,previewQrNonPayable:true,manualProof:{transactionId:'NOTREAL123'}})});assert.equal(r.status,400);}
  console.log('Production-mode boundary passed on the same isolated database: mock records hidden, mock QR download denied, optional-email/client flags cannot enable a registration when local mock mode is off.');
}finally{server.kill();if(server.exitCode===null)await new Promise(resolve=>server.once('exit',resolve))}
