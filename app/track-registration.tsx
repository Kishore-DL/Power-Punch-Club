'use client';
import { useEffect, useState } from 'react';
import { participantError, type RegistrationCredentials, type SavedRegistration, type ParticipantRegistration } from '../lib/participant-types';
import ManualPaymentFields from './manual-payment-fields';
import { CopyValue, downloadRegistration } from './registration-actions';

async function call<T=unknown>(path:string,body:object|FormData){const r=await fetch('/api/'+path,{method:'POST',headers:body instanceof FormData?{}:{'Content-Type':'application/json'},body:body instanceof FormData?body:JSON.stringify(body)});const data=await r.json() as T & {error?:string};if(!r.ok)throw Error(data.error||'Unable to complete request.');return data;}
export default function TrackRegistration(){
  const [number,setNumber]=useState(''),[code,setCode]=useState(''),[auth,setAuth]=useState<RegistrationCredentials|null>(null),[record,setRecord]=useState<ParticipantRegistration|null>(null);
  const [busy,setBusy]=useState(false),[message,setMessage]=useState(''),[error,setError]=useState(''),[previous,setPrevious]=useState<SavedRegistration[]>([]);
  const [proof,setProof]=useState({transactionId:'',screenshot:''}),[uploading,setUploading]=useState(false);
  useEffect(()=>{let cancelled=false;Promise.resolve().then(()=>{if(cancelled)return;const number=new URLSearchParams(location.search).get('number')||'';setNumber(number);try{const saved=JSON.parse(localStorage.getItem('ppc-completed-registrations')||'[]') as SavedRegistration[];setPrevious(saved);const match=saved.find(item=>number&&item.registrationNumber===number);if(match)work(()=>load({id:match.id,token:match.token}));}catch{}});return()=>{cancelled=true;};},[]);
  async function load(credentials:RegistrationCredentials){const data=await call<ParticipantRegistration>('registration-status',credentials);setRecord(data);setAuth(credentials);}
  async function work(action:()=>Promise<void>){setBusy(true);setError('');setMessage('');try{await action();}catch(e){setError(participantError(e));}finally{setBusy(false);}}
  async function download(receipt=false){await work(async()=>{await downloadRegistration(auth!,receipt);setMessage('PDF downloaded. Keep the private tracking code safe.');});}
  return <section className="wrap section track-registration">
    <h1>Track Registration</h1><p>No student account needed. Enter both values from your registration acknowledgement.</p>
    {!record?<>
      <form className="registration-form tracking-form" onSubmit={e=>{e.preventDefault();work(async()=>{const result=await call<{id:string}>('track-registration',{registrationNumber:number,trackingCode:code});await load({id:result.id});setCode('');});}}>
        <label>Registration number<input autoComplete="off" required maxLength={200} value={number} onChange={e=>setNumber(e.target.value)} placeholder="PPC-000001"/></label>
        <label>Private tracking code<input autoComplete="off" autoCapitalize="characters" required minLength={6} maxLength={64} value={code} onChange={e=>setCode(e.target.value.trim().toUpperCase())} placeholder="K7M2Q9" aria-describedby="tracking-privacy"/></label>
        <p id="tracking-privacy">This private code grants access to your registration. Keep it safe.</p>
        <button className="btn red" disabled={busy} type="submit">{busy?'Checking…':'Track registration'}</button>
      </form>
      {previous.length>0&&<div className="same-browser"><h2>Registrations saved on this device</h2>{previous.map(item=><button className="btn pale" type="button" disabled={busy} key={item.id} onClick={()=>work(()=>load({id:item.id,token:item.token}))}>{item.registrationNumber||item.id}</button>)}</div>}
    </>:<article className="tracking-result">
      <h2>{record.name||'Registration details'}</h2><CopyValue label="Registration number" value={record.registrationNumber}/><CopyValue label="Tracking code" value={record.trackingCode}/>
      <p>Keep both values private for recovery on another device.</p>
      <dl><dt>Tournament</dt><dd>{record.tournament}</dd><dt>Registered</dt><dd>{new Intl.DateTimeFormat('en-IN',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Kolkata'}).format(new Date(record.created))} IST</dd>
        <dt>Registration status</dt><dd>{record.status}</dd><dt>Payment status</dt><dd>{record.paymentStatus==='manual_pending'?'Awaiting payment verification':record.paymentStatus==='manual_rejected'?'Payment proof needs correction':record.paymentStatus==='not_required'?'No payment required':record.paymentStatus}</dd>
        <dt>Payment method</dt><dd>{record.paymentMethod==='manual'?'Manual UPI QR':record.paymentMethod}</dd><dt>Amount</dt><dd>INR {(record.amount/100).toFixed(2)}</dd>
        <dt>Email</dt><dd>{record.email}</dd><dt>Phone</dt><dd>{record.phone}</dd>
        {record.transactionReference&&<><dt>Transaction reference</dt><dd>{record.transactionReference}</dd></>}
        {record.fields?.map((field,index)=><div key={index}><dt>{field.label}</dt><dd>{field.value}</dd></div>)}
      </dl>
      {record.team?.length>0&&<><h3>Team participants</h3><ol>{record.team.map((member,index)=><li key={index}>{member.name} · Age {member.age} · {member.belt}</li>)}</ol></>}
      {record.rejectionReason&&<p role="status">{record.rejectionReason}</p>}{record.reviewNote&&<p role="status">Correction needed: {record.reviewNote}</p>}
      <div className="tracking-actions"><button className="btn red" disabled={busy} onClick={()=>download()}>Download registration PDF</button>
        {record.receiptAvailable&&<button className="btn red" disabled={busy} onClick={()=>download(true)}>Download payment receipt</button>}
        <button className="btn pale" disabled={busy} onClick={()=>work(()=>load(auth!))}>Refresh status</button>
        <button className="btn pale" disabled={busy} onClick={()=>{setRecord(null);setAuth(null);setError('');}}>Track another registration</button></div>
      {record.paymentStatus==='manual_rejected'&&record.status!=='rejected'&&<section><h3>Correct your payment proof</h3>
        <ManualPaymentFields event={record.event||{}} proof={proof} onChange={setProof} uploading={uploading} onUpload={async file=>{setUploading(true);setError('');try{const form=new FormData();form.set('file',file);if(auth?.token)form.set('registrationToken',auth.token);const result=await call<{url:string}>('upload',form);setProof(current=>({...current,screenshot:result.url}));}catch(e){setError(participantError(e));}finally{setUploading(false);}}}/>
        <button className="btn red" disabled={busy||uploading} onClick={()=>work(async()=>{await call('manual-proof',{...auth,manualProof:proof});await load(auth!);setProof({transactionId:'',screenshot:''});setMessage('Payment proof submitted for verification.');})}>Resubmit payment proof</button>
      </section>}
    </article>}
    {error&&<p className="error" role="alert">{error}</p>}<p role="status" aria-live="polite">{message}</p>
  </section>;
}
