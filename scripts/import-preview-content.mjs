import {readFile,mkdir,copyFile,writeFile} from 'node:fs/promises';
import {parseEnv} from 'node:util';
import path from 'node:path';
import {MongoClient} from 'mongodb';
import {localContentTarget,validateContentPackage,appendContent} from '../lib/content-import.mjs';

const args=process.argv.slice(2),option=name=>args.find(arg=>arg.startsWith('--'+name+'='))?.slice(name.length+3);
const manifestFile=path.resolve(option('manifest')||'content/local-gallery-tournaments.json'),root=path.resolve(option('assets')||'public');
let manifest=JSON.parse(await readFile(manifestFile,'utf8'));await validateContentPackage(manifest,root);
if(option('export')){
  if(!option('env'))throw Error('Export requires an explicit isolated environment file.');
  const settings=parseEnv(await readFile(option('env'),'utf8')),database=localContentTarget(settings),mongo=new MongoClient(settings.MONGODB_URI,{serverSelectionTimeoutMS:5000});
  try{
    const selected={...manifest};
    for(const key of ['gallery','tournaments']){
      const ids=new Set(manifest[key].map(row=>row.id)),row=await mongo.db(database).collection('content').findOne({_id:key});
      selected[key]=(row?.value||[]).filter(item=>ids.has(item.id));
    }
    selected.assets=manifest.assets.filter(asset=>selected.gallery.some(photo=>photo.url===asset.url));
    await validateContentPackage(selected,root);manifest=selected;
  }finally{await mongo.close()}
}
if(option('bundle')||option('export')){
  const destination=path.resolve(option('export')||option('bundle'));await mkdir(destination,{recursive:false});
  for(const asset of manifest.assets){const target=path.join(destination,'public',asset.url);await mkdir(path.dirname(target),{recursive:true});await copyFile(path.join(root,asset.url),target);}
  await writeFile(path.join(destination,'content.json'),JSON.stringify(manifest,null,2)+'\n');
  console.log('Selected content and hash-verified public assets bundled. No database writes.');
}else if(!args.includes('--apply')){
  console.log(JSON.stringify({mode:'plan-only',gallery:manifest.gallery.map(p=>p.title),tournaments:manifest.tournaments.map(t=>({id:t.id,title:t.title,status:t.status})),message:'No database connection or writes. Supply --env=<isolated-file> --apply only after reviewing the package.'},null,2));
}else{
  if(!option('env'))throw Error('Explicit --env file required; .env is never loaded automatically.');
  const settings=parseEnv(await readFile(option('env'),'utf8'));let database;
  if(args.includes('--publish')){
    database=settings.MONGODB_DATABASE;
    if(!database||option('confirm-database')!==database)throw Error('Publishing requires --confirm-database=<exact-target-name>.');
  }else database=localContentTarget(settings);
  const mongo=new MongoClient(settings.MONGODB_URI,{serverSelectionTimeoutMS:5000});
  try{
    const db=mongo.db(database),hello=await db.command({hello:1});if(!hello.setName&&hello.msg!=='isdbgrid')throw Error('Atomic append requires a replica set.');
    console.log(JSON.stringify(await appendContent(db,manifest)));
  }finally{await mongo.close()}
}
