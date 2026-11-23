export const registrationStatusLabels={new:'Awaiting review',approved:'Approved',rejected:'Rejected',contacted:'Contacted'};
export const paymentStatusLabels={manual_pending:'Awaiting payment verification',manual_rejected:'Correction requested',paid:'Payment verified',not_required:'No payment required',unpaid:'Awaiting payment',creating:'Payment being prepared'};
export const requestTypeLabels={tournament:'Individual',team:'Team',trial:'Trial request',enquiry:'Enquiry'};
export const reviewLabel=(labels,value)=>labels[value]||String(value||'Not available').replace(/[_-]/g,' ').replace(/^./,letter=>letter.toUpperCase());
export function reviewData(value){try{const data=typeof value==='string'?JSON.parse(value):value;return data&&typeof data==='object'&&!Array.isArray(data)?data:{}}catch{return {}}}
export function reviewTournament(record,data,content){
  if(data.receiptTitle)return data.receiptTitle;
  const event=(content.tournaments||[]).find(item=>item.id===record.target)||(content.training||[]).find(item=>item.id===record.target);
  return event?.title||(record.kind==='enquiry'?'General club enquiry':record.kind==='trial'?'General trial request':'Tournament details unavailable');
}
export function reviewAnswerRows(record,data,content){
  const event=(content.tournaments||[]).find(item=>item.id===record.target);
  const formId=event?.formId||(record.kind==='trial'?content.branding?.trialFormId:record.kind==='enquiry'?content.branding?.enquiryFormId:undefined);
  const current=(content.forms||[]).find(form=>form.id===formId)?.fields||[];
  const definitions=data.receiptFields||{},answers=data.answers||{};
  const order=[...new Set([...(data.receiptFieldOrder||Object.keys(definitions)),...current.map(field=>field.id),...Object.keys(answers)])];
  return order.filter(id=>Object.hasOwn(answers,id)).map(id=>({id,label:definitions[id]?.label||current.find(field=>field.id===id)?.label||'Additional response',value:answers[id],type:definitions[id]?.type}));
}
export function reviewValue(value){
  if(value===false)return 'No';if(value===true)return 'Yes';
  if(value===null||value===undefined||value==='')return 'Not provided';
  return typeof value==='object'?JSON.stringify(value,null,2):String(value);
}
export const isReviewAttachment=value=>typeof value==='string'&&/^\/api\/media\/(?:private|public)%2F[a-f0-9-]{36}$/i.test(value);
