// Read-only MongoDB operations only. This script intentionally has no apply mode.
import {readFile,writeFile} from 'node:fs/promises';
import {parseEnv} from 'node:util';
import {MongoClient} from 'mongodb';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {localContentTarget,validateContentPackage} from '../lib/content-import.mjs';
import {mockTournamentId,mockQrId,mockQrText} from '../lib/local-mock-content.mjs';
import {planSelectedRecords} from '../lib/content-transfer-plan.mjs';
import {configureMongoDns} from '../lib/mongodb-dns.mjs';
const args=process.argv.slice(2),option=name=>args.find(arg=>arg.startsWith('--'+name+'='))?.slice(name.length+3);
if(args.some(arg=>arg==='--apply'||arg==='--publish'||arg==='--rollback'))throw Error('Read-only planner: database writes are not implemented.');
if(!option('source')||!option('target'))throw Error('Supply explicit --source and --target environment files. Connection strings are never printed.');
const source=parseEnv(await readFile(option('source'),'utf8')),target=parseEnv(await readFile(option('target'),'utf8'));
localContentTarget(source);
if(target.MONGODB_DNS_SERVERS)process.env.MONGODB_DNS_SERVERS=target.MONGODB_DNS_SERVERS;
configureMongoDns();
const manifest=JSON.parse(await readFile('content/local-gallery-tournaments.json','utf8'));await validateContentPackage(manifest,'public');
const clients=[new MongoClient(source.MONGODB_URI,{serverSelectionTimeoutMS:8000}),new MongoClient(target.MONGODB_URI,{serverSelectionTimeoutMS:8000})];
try{
  const from=clients[0].db(source.MONGODB_DATABASE),to=clients[1].db(target.MONGODB_DATABASE||'power_punch_club');
  const selection={gallery:new Set(manifest.gallery.map(item=>item.id)),training:new Set(['kids','junior','advanced','weekend'].map(id=>'local-karate-'+id+'-v1')),tournaments:new Set([...manifest.tournaments.map(item=>item.id),mockTournamentId])};
  const selected={},existing={};
  for(const [key,ids] of Object.entries(selection)){
    selected[key]=((await from.collection('content').findOne({_id:key}))?.value||[]).filter(item=>ids.has(item.id));
    existing[key]=(await to.collection('content').findOne({_id:key}))?.value||[];
  }
  const records=planSelectedRecords(selected,existing),referenced=new Set(records.flatMap(item=>[item.record.url,item.record.image].filter(Boolean))),assets=[];
  for(const asset of manifest.assets.filter(asset=>referenced.has(asset.url))){
    const bytes=await readFile(path.join('public',asset.url));assets.push({url:asset.url,sha256:createHash('sha256').update(bytes).digest('hex'),bytes:bytes.length,license:asset.license,credit:asset.credit,source:asset.source,action:'Include public asset in Git/code deployment; do not replace production uploads.'});
  }
  const qr=await from.collection('files').findOne({_id:mockQrId}),targetQr=await to.collection('files').findOne({_id:mockQrId},{projection:{_id:1}});
  const forms=(await from.collection('content').findOne({_id:'forms'}))?.value||[];
  const formDependencies=[...new Set(selected.tournaments.map(event=>event.formId).filter(Boolean))].map(id=>({id,existsInSource:forms.some(form=>form.id===id),action:'Held dependency of local-only tournament; no production form import proposed.'}));
  const plan={mode:'dry-run-only',generatedAt:new Date().toISOString(),targetIdentity:'Environment supplied by --target; Render database association is not verified.',summary:{selectedRecords:records.length,proposedAdds:records.filter(r=>r.action==='propose-add').length,heldLocalOnly:records.filter(r=>r.action==='hold-local-only').length,conflicts:records.filter(r=>r.action==='conflict-preserve-existing').length},records,assets,formDependencies,qr:{id:mockQrId,sourceExists:!!qr,targetExists:!!targetQr,mime:qr?.type,sha256:qr?createHash('sha256').update(qr.data.value()).digest('hex'):null,payload:mockQrText,payable:false,action:'HOLD. Preserve non-payable bytes in local storage; no production QR/file insertion is proposed.'},rollback:{journal:'A future authorized import must record only inserted IDs, exact post-import fingerprints and newly inserted file IDs/hashes. No pre-existing records may be overwritten.',records:'Remove only IDs inserted by that import, and only if current fingerprint matches the journal. Preserve edited records and all skipped/conflicting IDs. Stop if registrations now reference an imported event.',files:'Remove only newly inserted files with matching hashes and no remaining references. Do not delete shared bundled gallery assets or existing uploads.',excluded:['registrations','accounts','sessions','payments','outbox','private uploads','branding','hero','entire database']},productionWritesExecuted:false};
  if(option('output'))await writeFile(option('output'),JSON.stringify(plan,null,2)+'\n',{flag:'wx'});
  console.log(JSON.stringify({mode:plan.mode,...plan.summary,records:records.map(({section,id,title,action})=>({section,id,title,action})),publicAssets:assets.length,qrAction:plan.qr.action,productionWritesExecuted:false},null,2));
}finally{await Promise.all(clients.map(client=>client.close()))}
