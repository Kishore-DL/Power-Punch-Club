import {localMockTarget,mockTournamentId,publishedPresentation} from './local-mock-content.mjs';
import type {Db} from 'mongodb';
import {contentRecords,registrations} from './mongodb';
import {fileStorage} from './file-storage';

export function validatedImageType(bytes:Uint8Array){
  if(bytes.length>=8&&[137,80,78,71,13,10,26,10].every((n,i)=>bytes[i]===n))return 'image/png';
  if(bytes.length>=3&&bytes[0]===255&&bytes[1]===216&&bytes[2]===255)return 'image/jpeg';
  if(bytes.length>=12&&String.fromCharCode(...bytes.slice(0,4))==='RIFF'&&String.fromCharCode(...bytes.slice(8,12))==='WEBP')return 'image/webp';
  return '';
}
const missing=()=>Response.json({error:'The configured image is unavailable.'},{status:404,headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
function imageResponse(body:Uint8Array,type:string,name:string,inline:boolean){
  const extension=type==='image/jpeg'?'jpg':type.split('/')[1];
  return new Response(Buffer.from(body),{headers:{'Content-Type':type,'Content-Disposition':`${inline?'inline':'attachment'}; filename="${name}.${extension}"`,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
}
export async function upiQrDownload(db:Db,eventId:string,inline=false){
  const events=(await contentRecords(db).findOne({_id:'tournaments'}))?.value;
  const event=Array.isArray(events)?events.find(item=>item.id===eventId):undefined;
  if(eventId===mockTournamentId&&!localMockTarget(eventId)&&!publishedPresentation(event))return missing();
  const match=typeof event?.manualQrImage==='string'&&/^\/api\/media\/public%2F([a-f0-9-]{36})$/i.exec(event.manualQrImage);
  if(!match)return missing();
  const head=await fileStorage.head('public/'+match[1]);if(!head?.approvedPublic)return missing();
  if(head.provider==='b2'){const type=head.httpMetadata.contentType;if(!type.startsWith('image/'))return missing();return await fileStorage.delivery('public/'+match[1],'power-punch-club-upi-qr.'+(type==='image/jpeg'?'jpg':type.split('/')[1]),inline,true)||missing();}
  const file=await fileStorage.get('public/'+match[1]);
  const type=file&&validatedImageType(file.body);
  if(!file||!type||file.httpMetadata.contentType!==type)return missing();
  return imageResponse(file.body,type,'power-punch-club-upi-qr',inline);
}
// Caller must authenticate Admin before entering this function. No file URL is accepted.
export async function adminPaymentProof(db:Db,id:string,revision:string,download=false){
  const row=await registrations(db).findOne({_id:id});
  if(!row||row.data.paymentMethod!=='manual')return missing();
  if(String(row.data.manualProofRevision||'')!==revision)return Response.json({error:'Payment proof changed. Refresh this registration to view the latest submission.'},{status:409,headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
  const screenshot=row.data.manualProof?.screenshot;
  const match=typeof screenshot==='string'&&/^\/api\/media\/private%2F([a-f0-9-]{36})$/i.exec(screenshot);
  if(!match)return missing();
  const key='private/'+match[1],head=await fileStorage.head(key);
  if(head?.customMetadata.registrationToken!==row.token)return missing();
  if(head.provider==='b2'){const type=head.httpMetadata.contentType;if(!type.startsWith('image/'))return missing();return await fileStorage.delivery(key,'power-punch-club-payment-proof.'+(type==='image/jpeg'?'jpg':type.split('/')[1]),!download,true)||missing();}
  const file=await fileStorage.get(key),type=file&&validatedImageType(file.body);
  if(!file||!type||type!==file.httpMetadata.contentType)return missing();
  if(!await registrations(db).findOne({_id:id,'data.manualProof.screenshot':screenshot,...(revision?{'data.manualProofRevision':revision}:{$or:[{'data.manualProofRevision':{$exists:false}},{'data.manualProofRevision':null},{'data.manualProofRevision':''}]})}))return Response.json({error:'Payment proof changed. Refresh this registration.'},{status:409,headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
  return imageResponse(file.body,type,'power-punch-club-payment-proof',!download);
}
