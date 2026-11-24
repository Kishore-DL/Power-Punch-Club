export function manualContactFields({emailOptional=false}={}){
 return [
  {id:'fixture-contact-name',label:'Full name',type:'text',contactRole:'name',required:true,showOnReceipt:true},
  {id:'fixture-contact-email',label:emailOptional?'Email address (optional)':'Email address',type:'email',contactRole:'email',required:!emailOptional,showOnReceipt:true},
  {id:'fixture-contact-phone',label:'Phone number',type:'tel',contactRole:'phone',required:true,showOnReceipt:true},
 ];
}

// Explicit disposable fixture configuration, not application auto-seeding.
export async function configureManualContacts(db,{eventId,kind,formId='manual-contact-fixture',emailOptional=false}={}){
 if(!db.databaseName.startsWith('ppc_test_'))throw Error('Disposable test database required.');
 const keys=['forms',...(eventId?['tournaments']:[]),...(kind?['branding']:[])];
 const originals=await Promise.all(keys.map(_id=>db.collection('content').findOne({_id})));
 const forms=structuredClone(originals.find(row=>row?._id==='forms')?.value||[]);
 const existing=forms.find(form=>form.id===formId);
 if(existing)existing.fields=[...manualContactFields({emailOptional}),...existing.fields.filter(field=>!field.id.startsWith('fixture-contact-'))];
 else forms.push({id:formId,title:'Manually configured contact fixture',fields:manualContactFields({emailOptional})});
 await db.collection('content').updateOne({_id:'forms'},{$set:{value:forms}},{upsert:true});
 if(eventId){const record=originals.find(row=>row?._id==='tournaments');await db.collection('content').updateOne({_id:'tournaments'},{$set:{value:record.value.map(event=>event.id===eventId?{...event,formId}:event)}});}
 if(kind){const record=originals.find(row=>row?._id==='branding');await db.collection('content').updateOne({_id:'branding'},{$set:{value:{...record?.value,[kind+'FormId']:formId}}},{upsert:true});}
 return async()=>{for(let index=0;index<keys.length;index++){const original=originals[index];if(original)await db.collection('content').replaceOne({_id:keys[index]},original);else await db.collection('content').deleteOne({_id:keys[index]});}};
}
