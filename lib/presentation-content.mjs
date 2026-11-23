import {mockTournamentId,mockFormId} from './local-mock-content.mjs';
import {contentFingerprint} from './content-transfer-plan.mjs';
export function publicAssetKey(sha){
  if(!/^[a-f0-9]{64}$/.test(sha))throw Error('Invalid asset hash.');
  const hex=sha.slice(0,12)+'5'+sha.slice(13,16)+'8'+sha.slice(17,32);
  return 'public/'+[hex.slice(0,8),hex.slice(8,12),hex.slice(12,16),hex.slice(16,20),hex.slice(20)].join('-');
}
export function publicationRecords(source,imageUrls){
  const gallery=(source.gallery||[]).filter(row=>/^karate-worldwide-0[1-8]$/.test(row.id)).map(row=>({...row,url:imageUrls.get(row.url)||row.url}));
  const training=(source.training||[]).filter(row=>/^local-karate-(kids|junior|advanced|weekend)-v1$/.test(row.id)).map(row=>({...row,image:imageUrls.get(row.image)||row.image,localOnlyPreview:false,presentationOnly:true}));
  const event=source.tournaments?.find(row=>row.id===mockTournamentId),form=source.forms?.find(row=>row.id===mockFormId);
  if(gallery.length!==8||training.length!==4||!event||!form)throw Error('The exact selected gallery, four classes, championship and form must exist.');
  return {gallery,training,tournaments:[{...event,image:imageUrls.get(event.image)||event.image,localOnlyPreview:false,presentationOnly:true,registrationMode:'manual',manualPaymentEnabled:true,manualUpiId:'',manualPayee:''}],forms:[{...form,localOnlyPreview:false,presentationOnly:true}]};
}
export function publicationChanges(selected,existing){
  return Object.entries(selected).flatMap(([section,rows])=>rows.map(row=>{
    const old=(existing[section]||[]).find(item=>item.id===row.id);
    return {section,id:row.id,title:row.title,action:old?(contentFingerprint(old)===contentFingerprint(row)?'skip-identical':'conflict-preserve-existing'):'add',fingerprint:contentFingerprint(row)};
  }));
}
