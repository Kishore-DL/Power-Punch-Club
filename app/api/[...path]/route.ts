import {localMockTarget} from '../../../lib/local-mock-content.mjs';
import {upiQrDownload,adminPaymentProof} from '../../../lib/payment-images';
import { normaliseRegistrationEmail, validRegistrationEmail, registrationContactError, normaliseIndianMobile, indianMobileInternational } from '../../../lib/registration-contact.mjs';
import { persistRegistration, ensureTracking, openTrackingCode, normaliseNumber, normaliseCode, trackingDigest, trackingLimits, TrackingLimitError, trackingSession, authorisedRegistration, trackingSessionId } from '../../../lib/registration-identity.mjs';
import { registrationDocument } from '../../../lib/registration-document';
import { validateManualProof, publicPaymentState, reviewManualPayment } from '../../../lib/manual-payment';
import { currentAccount } from '../../../lib/password-auth';
import { passwordEndpoint } from '../../../lib/password-endpoints';
import { contentRecords, registrations, visibleRegistration, reserveRegistration, editRegistration } from '../../../lib/mongodb';
import { fileStorage } from '../../../lib/file-storage';
import { portalRegistrations, staffDownload } from '../../../lib/registration-access';
import { registrationChoices, registrationModes, registrationSerial } from '../../../lib/tournament-registration';
import { receiptDetails } from '../../../lib/payment-receipt';
import { emailConfiguration, adminOutboxHistory, retryAdminNotifications } from '../../../lib/admin-notifications.mjs';
import { clientPreview, getContent, database, runtime, log, hmac, safeEqual, notifyRegistration, notifyNewRequest, rateLimit } from '../../../lib/server';
import { contentKeys } from '../../../lib/defaults';
export const dynamic='force-dynamic';
const json=(v:any,status=200)=>Response.json(v,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
const fail=(m:string,s=400)=>json({error:m},s);
async function recordCapturedPayment(db: ReturnType<typeof database>, id: string, paymentId: string) {
  const updated=await registrations(db).findOneAndUpdate({_id:id,payment_status:{$ne:'paid'}},
    {$set:{payment_status:'paid',payment_id:paymentId,'data.paymentConfirmedAt':new Date().toISOString()}},{returnDocument:'after'});
  const row=updated||await registrations(db).findOne({_id:id,payment_status:'paid',payment_id:paymentId});
  if(row)await notifyRegistration('payment-confirmed',row);
}

async function requestObject(req:Request):Promise<any>{
 const value=await req.json();
 if(!value||typeof value!=='object'||Array.isArray(value))throw new SyntaxError('Expected a JSON object');
 return value;
}
async function handle(req:Request){
 const url=new URL(req.url),p=url.pathname.slice(5),e=runtime();
 if(['POST','PUT','DELETE'].includes(req.method)&&p!=='webhook'){const origin=req.headers.get('origin');if(origin&&origin!==(e.PPC_PUBLIC_ORIGIN||url.origin))return fail('Invalid request origin',403)}
 if(req.method==='GET'&&p==='content')return json(await getContent());
 const db=database();
 const session=await currentAccount(req,db,e.PPC_SESSION_SECRET);
 if(p.startsWith('auth/'))return passwordEndpoint(p,req,db,e,session);
 const admin=session?.account.role==='admin';
 if(p==='upi-qr'&&req.method==='GET')return upiQrDownload(db,url.searchParams.get('id')||'',url.searchParams.get('open')==='1');
 if(p==='admin/payment-proof'&&req.method==='GET'){if(!admin)return fail('Admin access required',403);return adminPaymentProof(db,url.searchParams.get('id')||'',url.searchParams.get('revision')||'',url.searchParams.get('download')==='1');}
 const staffSession=await currentAccount(req,db,e.PPC_SESSION_SECRET,'staff');
 const staff=!!staffSession;
 if(req.method==='GET'&&p==='session')return json({admin,staff,passwordMode:true,owner:session?.account.owner===true});
 if(p==='staff/registrations'||p==='staff/download'){
   if(req.method!=='GET')return fail('Read-only endpoint',405);
   if(!staff)return fail('Staff access required',403);
   if(p==='staff/registrations')return json(await portalRegistrations(db));
   const id=url.searchParams.get('id'),field=url.searchParams.get('field');
   if(!id||!field)return fail('File not found',404);
   return await staffDownload(db,id,field)||fail('File not found',404);
 }
 if(req.method==='GET'&&p==='status'){const email=emailConfiguration(e);return json({payments:!clientPreview()&&!!(e.RAZORPAY_KEY_ID&&e.RAZORPAY_KEY_SECRET),email:email.ready,...(admin?{emailConfiguration:email}:{}),backgroundRemoval:!!e.REMOVEBG_API_KEY});}
 if(p.startsWith('media/')&&req.method==='GET'){const key=decodeURIComponent(p.slice(6));if(!key.startsWith('public/')&&!admin)return fail('Not authorised',403);const obj=await fileStorage.get(key);if(!obj)return fail('File not found',404);return new Response(obj.body,{headers:{'Content-Type':obj.httpMetadata?.contentType||'application/octet-stream','Cache-Control':key.startsWith('public/')?'public, max-age=31536000, immutable':'private, no-store','X-Content-Type-Options':'nosniff','Content-Disposition':key.startsWith('public/')?'inline':'attachment'}})}
 if(p==='upload'&&req.method==='POST'){
  await rateLimit(req,'upload');const form=await req.formData(),f=form.get('file') as File,scope=form.get('scope')==='public'?'public':'private';if(scope==='public'&&!admin)return fail('Admin access required',403);if(scope==='private'&&clientPreview())return fail('Uploads are disabled for this presentation',409);if(!f||!f.size||f.size>8*1024*1024)return fail('Choose a file under 8 MB');const bytes=await f.arrayBuffer(),a=new Uint8Array(bytes);let type='';if(a[0]===137&&a[1]===80&&a[2]===78&&a[3]===71)type='image/png';if(a[0]===255&&a[1]===216&&a[2]===255)type='image/jpeg';if(String.fromCharCode(...a.slice(0,4))==='RIFF'&&String.fromCharCode(...a.slice(8,12))==='WEBP')type='image/webp';if(scope==='private'&&String.fromCharCode(...a.slice(0,5))==='%PDF-')type='application/pdf';if(!type)return fail('Use PNG, JPEG or WebP. Participant documents may also be PDF.');let output: ArrayBuffer|Blob=bytes;if(scope==='private'&&form.get('remove')==='true')return fail('Private uploads must preserve the original file. Background removal is available only for public images.');if(form.get('remove')==='true'){if(!admin)return fail('Admin access required',403);if(!e.REMOVEBG_API_KEY)return fail('Automatic background removal needs a remove.bg API key. Upload a transparent PNG instead.',503);const body=new FormData();body.append('image_file',new Blob([bytes],{type}));body.append('size','auto');const result=await fetch('https://api.remove.bg/v1.0/removebg',{method:'POST',headers:{'X-Api-Key':e.REMOVEBG_API_KEY},body,signal:AbortSignal.timeout(30000)});if(!result.ok)return fail('Background removal could not complete. Try a transparent PNG.',502);output=await result.blob();type='image/png'}
  let uploadToken=String(form.get('registrationToken')||'');
  const tracked=trackingSessionId(req);
  if(scope==='private'&&tracked&&!uploadToken){const row=await registrations(db).findOne({_id:tracked});if(row)uploadToken=row.token;}
  if(scope==='private'&&!/^[a-zA-Z0-9-]{30,80}$/.test(uploadToken))return fail('Start a registration before uploading files');
  const key=scope+'/'+crypto.randomUUID();await fileStorage.put(key,output,{httpMetadata:{contentType:type},...(scope==='private'?{customMetadata:{registrationToken:uploadToken}}:{})});return json({url:'/api/media/'+encodeURIComponent(key)})
 }
 if(p==='track-registration'&&req.method==='POST'){
  const body=await requestObject(req);
  const number=normaliseNumber(body.registrationNumber),code=normaliseCode(body.trackingCode);
  await trackingLimits(db,req,number);
  const denied=()=>json({error:'Registration details could not be verified. Check both values or try again later.'},404);
  if(!number||number.length>200||! /^(?=.*[A-Z])(?=.*[0-9])[A-Z0-9]{6}$/.test(code))return denied();
  const row=await registrations(db).findOne({'tracking.digest':trackingDigest(code)});
  if(!row||normaliseNumber(row.data.registrationNumber)!==number)return denied();
  return Response.json({id:row.id},{headers:{'Set-Cookie':trackingSession(row.id),'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
 }
 if(p==='registration-document'&&req.method==='POST'){
  const body=await requestObject(req);
  const row=await authorisedRegistration(db,req,body,admin);
  if(!row)return fail('Document not found',404);
  const receipt=body.document==='receipt';
  if(receipt&&(row.payment_status!=='paid'||!row.payment_id))return fail('Receipt is available after payment confirmation',409);
  const secured=admin?row:await ensureTracking(db,row);
  const bytes=await registrationDocument(secured,await getContent(),receipt,admin?undefined:openTrackingCode(secured));
  const filename=(row.data.registrationNumber||row.id).replace(/[^a-z0-9_-]/gi,'_');
  return new Response(Buffer.from(bytes),{headers:{'Content-Type':'application/pdf','Content-Disposition':'attachment; filename="'+filename+(receipt?'-receipt':'-registration')+'.pdf"','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
 }
 if(p==='register'&&req.method==='POST'){
  await rateLimit(req,'register');const b:any=await requestObject(req);if(typeof b.name!=='string'||(typeof b.email!=='string'&&!(b.email===undefined&&localMockTarget(b.target)))||typeof b.phone!=='string'||(b.target!==undefined&&typeof b.target!=='string'))return fail('Enter valid registration details');if(b.answers!==undefined&&(!b.answers||typeof b.answers!=='object'||Array.isArray(b.answers)))return fail('Invalid form answers');if(b.website)return fail('Unable to submit');b.email=normaliseRegistrationEmail(b.email);b.name=b.name.trim();b.phone=b.phone.trim();const previewContent=localMockTarget(b.target)?await getContent():undefined;const previewEvent=previewContent?.tournaments.find((item:{id:string;previewEmailOptional?:boolean})=>item.id===b.target);const contactError=registrationContactError(b,{emailOptional:localMockTarget(b.target)&&previewEvent?.previewEmailOptional===true});if(contactError)return fail(contactError);b.phone=normaliseIndianMobile(b.phone);if(b.consent!==true)return fail('Please accept the privacy policy');if(!['trial','enquiry','tournament','team'].includes(b.kind))return fail('Invalid registration type');const c=previewContent||await getContent();
  if(clientPreview())return json({previewOnly:true,amount:0});
  const isTournament=['tournament','team'].includes(b.kind);
  let amount=0,target=b.target||'',capacity=1000000;
  let paymentMethod='free';
  let manualProof:Awaited<ReturnType<typeof validateManualProof>>|undefined;
  if(typeof b.id!=='string'||! /^[a-zA-Z0-9-]{20,80}$/.test(b.id))return fail('Invalid submission identifier');
  const token=String(b.token||'');
  if(!/^[a-zA-Z0-9-]{30,80}$/.test(token))return fail('Invalid registration token');
  const reply=async(input:any, duplicate=false)=>{
    const row=await ensureTracking(db,input);
    const number=row.data.registrationNumber||registrationSerial(b.id);
    return json({
    id:b.id,token,amount:row.amount,duplicate,trackingCode:openTrackingCode(row),
    registrationNumber:number,serial:row.amount===0&&['tournament','team'].includes(row.kind)?number:undefined,
    ...publicPaymentState(row as any),
    });
  };
  const existing=await registrations(db).findOne({_id:b.id});
  if(existing){if(existing.token!==token)return fail('Submission already exists',409);return reply(existing,true);}
  if(isTournament){const event=c.tournaments.find((x:any)=>x.id===target);if(!event||event.status!=='open')return fail('This tournament is not open for registration');if(event.deadline&&new Date(event.deadline+'T23:59:59+05:30').getTime()<Date.now())return fail('Registration has closed');const choices=registrationChoices(event);
    const choice=b.registrationChoice??(choices.length===1?choices[0]:undefined);
    if(!choices.includes(choice))return fail('Choose an available registration option.');
    capacity=Number(event.capacity)||1000000;let count=1;if(b.kind==='team'){if(!Array.isArray(b.team)||b.team.length<1||b.team.length>50)return fail('Add between 1 and 50 team participants');for(const member of b.team)if(!member||typeof member.name!=='string'||!member.name.trim()||member.name.length>120||!Number.isInteger(Number(member.age))||Number(member.age)<1||Number(member.age)>120||typeof member.belt!=='string'||!member.belt.trim()||member.belt.length>100)return fail('Complete every participant name, age and belt');count=b.team.length}paymentMethod=choice==='manual'?'manual':choice==='paid'?'razorpay':'free';amount=choice!=='free'?Math.round(Number(event.fee||0)*100)*count:0;if(choice!=='free'&&amount<=0)return fail('Invalid fee configuration');if(choice==='manual'){
      if(!event.manualQrImage)return fail('The club has not configured the UPI QR code. Please contact the club.');
      try{manualProof=await validateManualProof(b.manualProof,token)}catch(error){return fail((error as Error).message)}
      if(manualProof.transactionId&&await registrations(db).findOne({'data.manualTransactionKey':manualProof.transactionId.toUpperCase()}))return fail('This transaction ID has already been submitted. Contact the club if you need help.',409);
    }const fields=c.forms.find((x:any)=>x.id===event.formId)?.fields||[];for(const field of fields)if(field.required&&!String(b.answers?.[field.id]??'').trim())return fail('Complete '+field.label)}
  if(['trial','enquiry'].includes(b.kind)){const formId=b.kind==='trial'?c.branding.trialFormId:c.branding.enquiryFormId;for(const field of c.forms.find((x:any)=>x.id===formId)?.fields||[])if(field.required&&!String(b.answers?.[field.id]??'').trim())return fail('Complete '+field.label)}
  if(b.expectedAmount!==undefined&&b.expectedAmount!==amount)return fail('The entry fee changed. Refresh the page and check the amount before submitting.',409);
  if(amount<0||amount>100000000||!Number.isSafeInteger(amount))return fail('Invalid fee configuration');
  const receiptEvent=['tournament','team'].includes(b.kind)?c.tournaments.find((item:any)=>item.id===target):undefined;
  const formId=receiptEvent?.formId||(b.kind==='trial'?c.branding.trialFormId:b.kind==='enquiry'?c.branding.enquiryFormId:undefined);
  const formFields=c.forms.find((form:any)=>form.id===formId)?.fields||[];
  const answers=Object.fromEntries(formFields.flatMap((f:any)=>Object.hasOwn(b.answers||{},f.id)?[[f.id,b.answers[f.id]]]:[]));
  for(const f of formFields){
    const val=answers[f.id];
    if(val===undefined||val==='')continue;
    if(typeof val!=='string'&&typeof val!=='number')return fail('Enter a valid answer for '+f.label);
    if(String(val).length>500)return fail('Answer is too long for '+f.label);
    if(f.type==='select'&&!String(f.options||'').split(',').map((option:string)=>option.trim()).includes(String(val)))return fail('Choose a valid option for '+f.label);
    if(f.type==='number'&&!Number.isFinite(Number(val)))return fail('Enter a valid number for '+f.label);
    if(f.type==='tel'){const phone=normaliseIndianMobile(val);if(!phone)return fail('Enter exactly 10 digits for '+f.label);answers[f.id]=phone;}
    if(f.type==='email'){if(!validRegistrationEmail(val))return fail('Enter a valid email for '+f.label);answers[f.id]=normaliseRegistrationEmail(val);}
    if(f.type==='date'&&!/^\d{4}-\d{2}-\d{2}$/.test(String(val)))return fail('Enter a valid date for '+f.label);
    if(!['file','photo','masked_aadhaar'].includes(f.type))continue;
    const match=typeof val==='string'&&val.match(/^\/api\/media\/private%2F([a-f0-9-]{36})$/i);
    const object=match&&await fileStorage.head('private/'+match[1]);
    if(!object||object.customMetadata?.registrationToken!==token||
       (f.type==='photo'&&!object.httpMetadata?.contentType?.startsWith('image/')))
      return fail('Please upload a valid file for '+f.label);
  }
  const receiptFields=Object.fromEntries(formFields.map((field:any)=>[field.id,{label:field.label,type:field.type,showOnReceipt:field.showOnReceipt,staffDownload:field.staffDownload}]));
  const detail={answers,team:b.team||[],message:String(b.message||'').slice(0,5000),consent:true,
    paymentMethod,
    ...(receiptEvent?{manualQrImage:receiptEvent.manualQrImage,manualPayee:receiptEvent.manualPayee,manualUpiId:receiptEvent.manualUpiId,manualInstructions:receiptEvent.manualInstructions}:{}),
    ...(manualProof?{manualProof,manualProofRevision:crypto.randomUUID(),...(manualProof.transactionId?{manualTransactionKey:manualProof.transactionId.toUpperCase()}:{}),manualSubmittedAt:new Date().toISOString()}:{}),
    receiptTitle:receiptEvent?.title,receiptClub:c.branding.name,receiptLogo:c.branding.logo,receiptFields,receiptFieldOrder:formFields.map((field:{id:string})=>field.id),
    receiptHeading:receiptEvent?.receiptHeading,receiptNote:receiptEvent?.receiptNote,confirmationHeading:receiptEvent?.confirmationHeading};
  if(JSON.stringify(detail).length>50000)return fail('Registration too large');
  let inserted=false;let row:any;
  try{
    const result=await persistRegistration(db,{
      _id:b.id,id:b.id,token,kind:b.kind,target,name:b.name.trim(),email:b.email.toLowerCase(),phone:b.phone,
      data:detail,status:'new',notes:'',amount,payment_status:paymentMethod==='manual'?'manual_pending':amount?'unpaid':'not_required',created:new Date().toISOString(),
    },receiptEvent?.registrationPrefix??c.branding.registrationPrefix,receiptEvent?.registrationSuffix??c.branding.registrationSuffix,
    (candidate:any)=>reserveRegistration(db,candidate,isTournament?(b.kind==='team'?b.team.length:1):0,capacity));
    inserted=result.inserted;row=result.row;
  }catch(error){
    if((error as any).code===11000&&(error as any).keyPattern?.['data.manualTransactionKey'])return fail('This transaction ID has already been submitted.',409);
    throw error;
  }
  if(!inserted){
    const existing=await registrations(db).findOne({_id:b.id});
    if(existing){if(existing.token!==token)return fail('Submission already exists',409);return reply(existing,true);}
    if(manualProof?.transactionId&&await registrations(db).findOne({'data.manualTransactionKey':manualProof.transactionId.toUpperCase()}))return fail('This transaction ID has already been submitted.',409);
    return fail('This event has reached capacity',409);
  }await notifyNewRequest(row);return reply(row)
 }
 if(p==='registration-status'&&req.method==='POST'){
  await rateLimit(req,'status');
  const b=await requestObject(req);
  const row=await authorisedRegistration(db,req,b);
  if(!row)return fail('Registration not found',404);
  const secured=await ensureTracking(db,row);
  const details=receiptDetails(row,await getContent());
  return json({...publicPaymentState(row),id:row.id,registrationNumber:row.data.registrationNumber||registrationSerial(row.id),
    trackingCode:openTrackingCode(secured),name:row.name,email:row.email,phone:row.phone,created:row.created,status:row.status,
    tournament:details.title,fields:details.fields,team:details.team,amount:row.amount,
    transactionReference:row.data.paymentMethod==='manual'?row.data.manualProof?.transactionId||'':row.payment_id||'',
    rejectionReason:row.status==='rejected'?row.data.participantRejectionReason||'Please contact the club.':'',
    event:row.data.paymentMethod==='manual'?(()=>{const event=(row as any).data;return {id:row.target,manualQrImage:event.manualQrImage,manualPayee:event.manualPayee,manualUpiId:event.manualUpiId,manualInstructions:event.manualInstructions,...(localMockTarget(row.target)?{previewQrNonPayable:true}:{} )};})():undefined});
 }
 if(p==='manual-proof'&&req.method==='POST'){
  await rateLimit(req,'register');
  const b=await requestObject(req);
  const row=await authorisedRegistration(db,req,b);
  if(!row||row.data.paymentMethod!=='manual')return fail('Registration not found',404);
  if(row.status==='rejected'||row.payment_status!=='manual_rejected')return fail('This payment is not open for resubmission.',409);
  let proof;
  try{proof=await validateManualProof(b.manualProof,row.token)}catch(error){return fail((error as Error).message)}
  try{
    const updated=await registrations(db).updateOne({_id:row.id,payment_status:'manual_rejected','data.manualProofRevision':row.data.manualProofRevision},
      {$set:{payment_status:'manual_pending','data.manualProof':proof,'data.manualProofRevision':crypto.randomUUID(),
        'data.manualSubmittedAt':new Date().toISOString(),...(proof.transactionId?{'data.manualTransactionKey':proof.transactionId.toUpperCase()}:{})},
       $unset:{'data.manualReviewNote':'',...(!proof.transactionId?{'data.manualTransactionKey':''}:{})},
       $push:{'data.manualHistory':{$each:[{proof:row.data.manualProof,reviewNote:row.data.manualReviewNote,reviewedAt:row.data.manualReviewedAt}],$slice:-20}}});
    if(!updated.matchedCount)return fail('The payment changed. Refresh its status.',409);
  }catch(error){if((error as {code?:number}).code===11000)return fail('This transaction ID has already been submitted.',409);throw error}
  const submitted=await registrations(db).findOne({_id:row.id});if(submitted)await notifyRegistration('manual-proof-submitted',submitted);
  return json({paymentStatus:'manual_pending'});
 }
 if(p==='order'&&req.method==='POST'){
  if(clientPreview())return fail('Payments are disabled for this presentation',409);
  await rateLimit(req);

  const {id,token}=await requestObject(req) as {id?:string;token?:string};
  const registration=await authorisedRegistration(db,req,{id,token});
  if(!registration)return fail('Request not found',404);
  if(!['tournament','team'].includes(registration.kind))return fail('Only tournament registrations can start a payment',410);
  if(registration.data.paymentMethod==='manual')return fail('UPI QR payments are reviewed by the club administrator.',409);
  if(registration.status==='rejected')return fail('This registration has been rejected. Contact the club.',409);
  if(registration.payment_status==='paid')return fail('This request has already been paid');
  if(registration.amount<=0)return fail('No fee is due');

  if(!e.RAZORPAY_KEY_ID||!e.RAZORPAY_KEY_SECRET)return fail('Online payments are not connected yet. Your request is saved; please contact the club.',503);
  const checkout=(orderId:string)=>json({
    orderId,amount:registration.amount,key:e.RAZORPAY_KEY_ID,
    name:registration.name,email:registration.email,phone:indianMobileInternational(registration.phone),
  });
  if(registration.order_id)return checkout(registration.order_id);

  const lease=crypto.randomUUID();
  const now=Date.now();
  const lock=await registrations(db).updateOne({_id:id,order_id:null,$or:[
    {payment_status:'unpaid'},
    {payment_status:'creating',$or:[{'data.orderLeaseUntil':{$lte:now}},{'data.orderLeaseUntil':{$exists:false}}]},
  ]},{$set:{payment_status:'creating','data.orderLease':lease,'data.orderLeaseUntil':now+45_000}});
  if(!lock.matchedCount)return fail('A payment session is being prepared. Please try again shortly.',409);

  try{
    let order: {id?: string};
    try{
      const response=await fetch('https://api.razorpay.com/v1/orders',{
        method:'POST',
        headers:{Authorization:'Basic '+btoa(e.RAZORPAY_KEY_ID+':'+e.RAZORPAY_KEY_SECRET),'Content-Type':'application/json'},
        body:JSON.stringify({amount:registration.amount,currency:'INR',receipt:id,notes:{registration_id:id}}),
        signal:AbortSignal.timeout(15_000),
      });
      if(!response.ok)return fail('Payment provider is unavailable. Please try again later.',502);
      order=await response.json();
    }catch{
      return fail('Unable to prepare payment. Please try again.',502);
    }
    if(!order||typeof order.id!=='string'||!order.id.startsWith('order_'))return fail('Payment provider returned an invalid order. Please try again.',502);

    // A provider order is exposed to checkout only after its ID is stored by the lease holder.
    const saved=await registrations(db).updateOne({_id:id,payment_status:'creating','data.orderLease':lease},
      {$set:{order_id:order.id,payment_status:'unpaid'},$unset:{'data.orderLease':'','data.orderLeaseUntil':''}});
    if(!saved.matchedCount)return fail('A payment session is being prepared. Please try again shortly.',409);
    return checkout(order.id);
  }finally{
    await registrations(db).updateOne({_id:id,payment_status:'creating','data.orderLease':lease},
      {$set:{payment_status:'unpaid'},$unset:{'data.orderLease':'','data.orderLeaseUntil':''}});
  }
 }
 if((p==='receipt'||p==='registration-confirmation')&&req.method==='POST'){
  const { id, token } = await requestObject(req) as { id?: string; token?: string };
  const row=await authorisedRegistration(db,req,{id,token},admin);
  if(!row)return fail('Receipt not found',404);
  if(p==='registration-confirmation'){
    if(!['tournament','team'].includes(row.kind)||row.amount!==0||row.payment_status!=='not_required')
      return fail('A no-payment confirmation is unavailable for this registration',409);
    const confirmation=receiptDetails(row,await getContent());
    return json({...confirmation,number:confirmation.registrationNumber,heading:confirmation.confirmationHeading,registeredAt:row.created,documentAuth:{id,token}});
  }
  if(row.payment_status!=='paid'||!row.payment_id)return fail('Receipt is available after payment confirmation',409);
  return json({...receiptDetails(row,await getContent()),documentAuth:{id,token}});
 }
 if(p==='verify'&&req.method==='POST'){
  if(!e.RAZORPAY_KEY_SECRET)return fail('Payments are not configured',503);const b:any=await requestObject(req),r:any=await authorisedRegistration(db,req,b);if(!r||!r.order_id||r.order_id!==b.razorpay_order_id)return fail('Order does not match');const signature=await hmac(e.RAZORPAY_KEY_SECRET,r.order_id+'|'+b.razorpay_payment_id);if(!safeEqual(signature,String(b.razorpay_signature||'')))return fail('Payment verification failed',403);const result=await fetch('https://api.razorpay.com/v1/payments/'+encodeURIComponent(b.razorpay_payment_id),{headers:{Authorization:'Basic '+btoa(e.RAZORPAY_KEY_ID+':'+e.RAZORPAY_KEY_SECRET)},signal:AbortSignal.timeout(10000)});if(!result.ok)return fail('Unable to confirm payment. Please contact the club.',502);const payment:any=await result.json();if(payment.order_id!==r.order_id||payment.amount!==r.amount||payment.currency!=='INR')return fail('Payment details do not match',403);if(payment.status!=='captured')return json({pending:true,message:'Payment authorised. Awaiting capture confirmation.'});await recordCapturedPayment(db,r.id,payment.id);return json({paid:true})
 }
 if(p==='webhook'&&req.method==='POST'){
  if(!e.RAZORPAY_WEBHOOK_SECRET)return fail('Webhook not configured',503);const raw=await req.text();if(!safeEqual(await hmac(e.RAZORPAY_WEBHOOK_SECRET,raw),req.headers.get('x-razorpay-signature')||''))return fail('Invalid signature',403);const event=JSON.parse(raw),pay=event.payload?.payment?.entity;if(event.event==='payment.captured'&&pay){const r:any=await registrations(db).findOne({order_id:String(pay.order_id||'')});if(r&&r.amount===pay.amount&&pay.currency==='INR')await recordCapturedPayment(db,r.id,pay.id)}return json({received:true})
 }
 if(!admin)return fail('Admin access required',403);
 if(p==='manual-payment-review'&&req.method==='POST'){
  const b=await requestObject(req);
  if(typeof b.id!=='string'||!['verify','reject'].includes(b.action)||typeof b.expectedRevision!=='string')return fail('Invalid payment review');
  const row=await registrations(db).findOne({_id:b.id,'data.paymentMethod':'manual'});
  if(!row)return fail('Payment not found',404);
  if(row.payment_status==='paid'&&b.action==='verify'){return json({saved:true,record:visibleRegistration(row)});}
  if(row.data.manualProofRevision!==b.expectedRevision)return fail('Payment proof changed. Refresh and review the latest proof.',409);
  if(row.status==='rejected')return fail('Restore the registration before verifying payment.',409);
  const note=typeof b.note==='string'?b.note.trim().slice(0,1000):'';
  if(b.action==='reject'&&!note)return fail('Enter a reason so the participant can correct the payment proof.');
  const updated=await reviewManualPayment(db,row,b.action,session!.account.username,note);
  if(!updated)return fail('This payment has already been reviewed. Refresh the request.',409);
  await log(session!.account.username,`Manual payment ${b.action}: ${row.id}`);
  return json({saved:true,record:visibleRegistration(updated)});
 }
 if(p==='content'&&req.method==='PUT'){const b:any=await requestObject(req);if(!contentKeys.includes(b.key))return fail('Unknown content section');if(JSON.stringify(b.value).length>200000)return fail('Content too large');if(['branding','pages'].includes(b.key)){if(!b.value||Array.isArray(b.value)||typeof b.value!=='object')return fail('Invalid content');for(const [k,v] of Object.entries(b.value)){if(typeof v!=='string')return fail('Content must be text');if(['logo','hero','heroBackdrop','image','instagram','facebook','map'].includes(k)&&v&&!/^https:\/\//.test(v as string)&&!/^\/(?!\/)/.test(v as string))return fail('Use an HTTPS URL or uploaded image');}if(b.key==='branding'&&['registrationPrefix','registrationSuffix'].some(key=>b.value[key]!==undefined&&(b.value[key].length>20||/[\r\n]/.test(b.value[key]))))return fail('Registration prefix and suffix must be at most 20 characters');if(b.key==='branding'&&b.value.heroBackdropMode!==undefined&&!['photo','colour'].includes(b.value.heroBackdropMode))return fail('Choose a photo or solid banner colour');if(b.key==='branding'&&!/^#[a-fA-F0-9]{6}$/.test(b.value.accent||''))return fail('Use a valid hex brand colour')}else{if(!Array.isArray(b.value)||b.value.length>500)return fail('Invalid content list');const ids=new Set();for(const item of b.value){if(!item||typeof item!=='object'||typeof item.id!=='string'||!item.id||ids.has(item.id))return fail('Every record needs a unique ID');ids.add(item.id);if(b.key==='tournaments'){
  for(const [key,limit] of [['registrationPrefix',20],['registrationSuffix',20],['receiptHeading',100],['confirmationHeading',100],['receiptNote',1000]] as const)
    if(item[key]!==undefined&&(typeof item[key]!=='string'||item[key].length>limit))return fail('Invalid '+key);
  if(item.manualPaymentEnabled!==undefined&&typeof item.manualPaymentEnabled!=='boolean')return fail('Invalid UPI QR setting');
  if(registrationChoices(item).includes('manual')){
    const match=typeof item.manualQrImage==='string'&&item.manualQrImage.match(/^\/api\/media\/public%2F([a-f0-9-]{36})$/i);
    const qr=match&&await fileStorage.head('public/'+match[1]);
    if(!qr?.httpMetadata.contentType.startsWith('image/'))return fail('Upload a UPI QR image to enable manual payment.');
  }
  for(const key of ['manualPayee','manualUpiId','manualInstructions'])if(item[key]!==undefined&&(typeof item[key]!=='string'||item[key].length>1000))return fail('Invalid UPI payment details');
  if(item.registrationMode!==undefined&&!registrationModes.includes(item.registrationMode))return fail('Choose a valid tournament registration mode');
  if((['paid','both','manual'].includes(item.registrationMode)||item.manualPaymentEnabled===true)&&!(Math.round(Number(item.fee||0)*100)>0))return fail('Set a fee above zero to enable paid registration');
}for(const k of ['fee','amount','capacity'])if(item[k]!==undefined&&(!Number.isFinite(Number(item[k]))||Number(item[k])<0))return fail('Fees and capacity must be non-negative numbers');for(const k of ['image','url','document'])if(item[k]&&!/^https:\/\//.test(item[k])&&!/^\/(?!\/)/.test(item[k]))return fail('Use HTTPS links or uploaded media');if(item.type==='video'&&item.url&&!/^https:\/\/(www\.)?(youtube\.com|youtu\.be|vimeo\.com)\//.test(item.url))return fail('Use a YouTube or Vimeo video link')}}await contentRecords(db).updateOne({_id:b.key},{$set:{value:b.value,updated:new Date().toISOString()}},{upsert:true});await log(session!.account.username,'Updated '+b.key);return json({saved:true})}
 if(p==='requests'&&req.method==='GET'){const rows=await registrations(db).find({}).sort({created:-1}).limit(5000).toArray();return json(rows.map(visibleRegistration))}
 if(p==='requests'&&req.method==='PUT'){
  const b=await requestObject(req) as {id?:unknown;status?:unknown;notes?:unknown;participantRejectionReason?:unknown};
  if(typeof b.id!=='string'||typeof b.status!=='string'||!['new','approved','rejected','contacted'].includes(b.status))return fail('Invalid status');
  const eventData=await getContent();
  const old=await editRegistration(db,b.id,b.status,String(b.notes||'').slice(0,5000),eventData.tournaments);
  if(old===false)return fail('The registration changed or the event has reached capacity',409);
  if(!old)return fail('Not found',404);
  if(b.participantRejectionReason!==undefined)await registrations(db).updateOne({_id:b.id},{$set:{'data.participantRejectionReason':String(b.participantRejectionReason).trim().slice(0,1000)}});
  await log(session!.account.username,'Updated registration '+b.id);
  return json({saved:true});
 }
 if(p==='audit'&&req.method==='GET')return json(await db.collection('audit').find({},{projection:{_id:0}}).sort({created:-1}).limit(100).toArray());
 if(p==='outbox'&&req.method==='GET')return json(await adminOutboxHistory(db));
 if(p==='outbox'&&req.method==='POST')return json(await retryAdminNotifications(db));
 return fail('Not found',404)
}
async function run(req:Request){
 try{
  if(['POST','PUT','DELETE'].includes(req.method)&&req.body){
    const limit=req.headers.get('content-type')?.includes('multipart/form-data')?9*1024*1024:256*1024;
    if(Number(req.headers.get('content-length')||0)>limit)return fail('Request too large',413);
    const reader=req.body.getReader();
    const chunks:Uint8Array[]=[];
    let length=0;
    for(;;){
      const result=await reader.read();
      if(result.done)break;
      length+=result.value.byteLength;
      if(length>limit){await reader.cancel();return fail('Request too large',413)}
      chunks.push(result.value);
    }
    const body=new Uint8Array(length);
    let offset=0;
    for(const chunk of chunks){body.set(chunk,offset);offset+=chunk.length}
    req=new Request(req,{body});
  }
  return await handle(req);
 }catch(err){
  console.error('API error',err instanceof Error?err.name:'unknown');
  if(err instanceof TrackingLimitError)return Response.json({error:err.message},{status:429,headers:{'Cache-Control':'no-store','Retry-After':'600','X-Content-Type-Options':'nosniff'}});
  const invalid=err instanceof SyntaxError;
  const limited=err instanceof Error&&err.message.startsWith('Too many requests');
  return fail(invalid?'Invalid request data':limited?err.message:'Unable to complete the request. Please try again.',invalid?400:limited?429:500);
 }
}
export const GET=run,POST=run,PUT=run,DELETE=run;
