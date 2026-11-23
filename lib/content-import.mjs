import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import path from 'node:path';

export function localContentTarget(settings){
  const uri=new URL(settings.MONGODB_URI||'');
  if(uri.protocol!=='mongodb:'||!['localhost','127.0.0.1','[::1]'].includes(uri.hostname)||!/^ppc_(preview|test)_/.test(settings.MONGODB_DATABASE||''))throw Error('Content writes require an explicit loopback ppc_preview_ or ppc_test_ database. Remote/current .env is not eligible.');
  return settings.MONGODB_DATABASE;
}
export function appendSelected(existing,incoming){
  if(!Array.isArray(existing))throw Error('Existing content is not an array; refusing to replace it.');
  const ids=new Set(existing.map(item=>item.id)),add=[];
  for(const item of incoming){if(!item.id)throw Error('Content ID is required.');if(!ids.has(item.id)){add.push(item);ids.add(item.id)}}
  return {value:[...existing,...add],added:add.length,skipped:incoming.length-add.length};
}
export async function validateContentPackage(manifest,assetRoot){
  if(manifest.version!==1||!Array.isArray(manifest.gallery)||!Array.isArray(manifest.tournaments)||!Array.isArray(manifest.assets))throw Error('Unsupported content package.');
  for(const key of ['gallery','tournaments'])if(new Set(manifest[key].map(row=>row.id)).size!==manifest[key].length)throw Error('Duplicate package IDs.');
  const assets=new Map(manifest.assets.map(asset=>[asset.url,asset]));
  for(const asset of manifest.assets){
    if(!/^\/gallery\/[a-z0-9/_-]+\.(webp|png|jpg)$/.test(asset.url))throw Error('Only selected public gallery assets may be transferred.');
    const bytes=await readFile(path.join(assetRoot,asset.url));
    if(createHash('sha256').update(bytes).digest('hex')!==asset.sha256)throw Error('Asset hash mismatch: '+asset.url);
  }
  for(const photo of manifest.gallery){if(photo.type!=='photo'||!assets.has(photo.url)||!photo.alt||!photo.credit||!photo.sourceUrl?.startsWith('https://commons.wikimedia.org/wiki/')||!photo.licenseUrl?.startsWith('https://creativecommons.org/'))throw Error('Gallery requires local assets, meaningful alt text and documented credit/license.');}
  for(const event of manifest.tournaments){
    if(event.status!=='draft'||event.registrationMode!=='disabled'||event.manualPaymentEnabled!==false)throw Error('Curated incomplete tournaments must remain disabled drafts.');
    if(event.image||event.manualQrImage||event.document)throw Error('No approved tournament or payment assets were supplied for this package.');
  }
}
export async function appendContent(db,manifest){
  const result={};
  await db.client.withSession(session=>session.withTransaction(async()=>{
    for(const key of ['gallery','tournaments']){
      const collection=db.collection('content'),row=await collection.findOne({_id:key},{session}),merged=appendSelected(row?.value??[],manifest[key]);
      if(merged.added)await collection.updateOne({_id:key},{$set:{value:merged.value,updated:new Date().toISOString()}},{session,upsert:true});
      result[key]={added:merged.added,skipped:merged.skipped};
    }
  }));
  return result;
}
