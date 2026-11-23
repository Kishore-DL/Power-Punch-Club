'use client';
import type {Receipt} from '../lib/club-types';
import './request-review.css';
import {useEffect,useRef,useState} from 'react';
import {Check,Copy,Download,Loader2,Maximize2,X} from 'lucide-react';
import {useDialogFocus} from './dialog-focus';
import PaymentProofThumbnail from './payment-proof-thumbnail';
import PaymentProofViewer from './payment-proof-viewer';
import PaymentReceipt from './payment-receipt';
import {isReviewAttachment,paymentStatusLabels,registrationStatusLabels,requestTypeLabels,reviewAnswerRows,reviewData,reviewLabel,reviewTournament,reviewValue} from '../lib/admin-review.mjs';

type Definition={id:string;label:string;type?:string};
type ReviewData={registrationNumber?:string;receiptTitle?:string;receiptFields?:Record<string,Definition>;receiptFieldOrder?:string[];answers?:Record<string,unknown>;team?:{name?:string;age?:number|string;belt?:string}[];message?:string;paymentMethod?:string;manualProof?:{screenshot?:string;transactionId?:string};manualProofRevision?:string;manualReviewNote?:string;participantRejectionReason?:string;manualHistory?:{proof?:{transactionId?:string;screenshot?:string};reviewNote?:string;reviewedAt?:string}[]};
export type ReviewRecord={id:string;name:string;email:string;phone:string;kind:string;target?:string;amount:number;status:string;payment_status:string;notes?:string;data:string|ReviewData;payment_id?:string;order_id?:string;created?:string;participantRejectionReason?:string};
type Content={branding?:{logo?:string;trialFormId?:string;enquiryFormId?:string};forms?:{id:string;fields:Definition[]}[];tournaments?:{id:string;title?:string;formId?:string}[];training?:{id:string;title?:string}[]};
const money=(amount:number)=>new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR'}).format(amount/100);
const timestamp=(value?:string)=>value&&!Number.isNaN(Date.parse(value))?new Intl.DateTimeFormat('en-IN',{timeZone:'Asia/Kolkata',dateStyle:'medium',timeStyle:'short'}).format(new Date(value))+' IST':'Not available';
async function request<T>(path:string,body:object,method='POST'):Promise<T>{
  const response=await fetch('/api/'+path,{method,headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}),data=await response.json() as T&{error?:string};
  if(!response.ok)throw Error(data.error||'Unable to save. Please try again.');return data;
}
function CopyDetail({label,value}:{label:string;value:string}){
  const text=useRef<HTMLSpanElement>(null),[message,setMessage]=useState('');
  return <div className="review-copy"><span className="review-label">{label}</span><div><span ref={text} tabIndex={0} className="review-copy-value">{value}</span><button type="button" className="review-copy-button" aria-label={'Copy '+label.toLowerCase()} onClick={async()=>{
    try{if(!navigator.clipboard?.writeText)throw Error();await navigator.clipboard.writeText(value);setMessage('Copied '+label.toLowerCase()+'.');}
    catch{if(text.current){text.current.focus();const selection=window.getSelection(),range=document.createRange();range.selectNodeContents(text.current);selection?.removeAllRanges();selection?.addRange(range);try{if(!document.execCommand('copy'))throw Error();setMessage('Copied '+label.toLowerCase()+'.');}catch{setMessage('Value selected. Press Ctrl+C or use Copy from your device menu.');}}}
  }}><Copy size={15} aria-hidden="true"/>Copy</button></div><span role="status" className="review-copy-feedback">{message}</span></div>;
}
function Detail({label,value}:{label:string;value:unknown}){return <div className="review-detail"><dt>{label}</dt><dd>{reviewValue(value)}</dd></div>}

export default function RequestReview({record,content,onClose,onSaved}:{record:ReviewRecord;content:Content;onClose:()=>void;onSaved:(value:ReviewRecord)=>void}){
  const data=reviewData(record.data) as ReviewData;
  const [status,setStatus]=useState(record.status),[note,setNote]=useState(record.notes||''),[participantReason,setParticipantReason]=useState(record.participantRejectionReason??data.participantRejectionReason??'');
  const [rejecting,setRejecting]=useState(false),[paymentReason,setPaymentReason]=useState(''),[proof,setProof]=useState(false),[receipt,setReceipt]=useState<Receipt|null>(null),[busy,setBusy]=useState(''),[error,setError]=useState(''),[success,setSuccess]=useState('');
  const operation=useRef(false),feedback=useRef<HTMLDivElement>(null);useDialogFocus(true,onClose);
  useEffect(()=>{if(error||success)feedback.current?.scrollIntoView({block:'nearest'});},[error,success]);
  const number=data.registrationNumber,manual=data.paymentMethod==='manual',free=record.payment_status==='not_required'||(record.amount===0&&data.paymentMethod!=='manual'),reference=manual?data.manualProof?.transactionId:record.payment_id;
  const paymentLabel=free?'No payment required':reviewLabel(paymentStatusLabels,record.payment_status),registrationLabel=reviewLabel(registrationStatusLabels,record.status);
  const canReview=manual&&record.payment_status==='manual_pending'&&record.status!=='rejected'&&!!data.manualProofRevision;
  const unavailable=record.payment_status==='paid'?'This payment has already been verified.':record.status==='rejected'?'Restore and save the registration status before reviewing payment.':!data.manualProofRevision?'This legacy submission has no review revision; payment review is unavailable.':record.payment_status==='manual_rejected'?'Waiting for the participant to resubmit a corrected proof.':'No payment proof is awaiting review.';
  const answers=reviewAnswerRows(record,data,content) as {id:string;label:string;value:unknown}[];
  const members=(data.team||[]).filter(member=>record.kind==='team'||member.name||member.age||member.belt);
  async function work(name:string,action:()=>Promise<void>){
    if(operation.current)return;operation.current=true;setBusy(name);setError('');setSuccess('');
    try{await action()}catch(error){setError(error instanceof Error?error.message:'Unable to complete this action. Please try again.')}finally{operation.current=false;setBusy('')}
  }
  async function reviewPayment(action:'verify'|'reject'){
    if(!canReview||operation.current)return;
    if(action==='reject'&&!paymentReason.trim()){setError('Enter a correction reason so the participant can resubmit.');return;}
    await work(action,async()=>{
      if(!window.confirm(action==='verify'?'Confirm that the full payment is present in the club bank / UPI statement?':'Reject this payment proof and request a correction?'))return;
      const result=await request<{record:ReviewRecord}>('manual-payment-review',{id:record.id,action,expectedRevision:data.manualProofRevision,note:action==='reject'?paymentReason:''});
      onSaved(result.record);setRejecting(false);setPaymentReason('');setSuccess(action==='verify'?'Payment verified. Receipt is available.':'Correction requested. The participant can resubmit payment proof.');
    });
  }
  const showHistory=!!(data.manualHistory?.length||record.order_id||data.manualReviewNote&&record.payment_status!=='manual_rejected'||data.participantRejectionReason&&status!=='rejected');
  return <div className="modal-backdrop request-review-backdrop"><section className="modal request-review-dialog" role="dialog" aria-modal="true" aria-label="Registration review" data-focus-dialog>
    <header className="request-review-header"><div><h2>Registration Review</h2><p className="review-participant-name">{record.name}</p><div className="review-statuses"><span><span className="review-label">Registration status</span><strong className={'review-status review-status-'+record.status}>{registrationLabel}</strong></span><span><span className="review-label">Payment status</span><strong className={'review-status review-status-'+record.payment_status}>{paymentLabel}</strong></span></div></div><button type="button" className="review-close" aria-label="Close request review" onClick={onClose}><X size={22}/></button></header>
    <div className="request-review-body">
      {error&&<div ref={feedback} className="review-feedback review-failure" role="alert">{error}</div>}{success&&<div ref={feedback} className="review-feedback review-success" role="status"><Check size={18} aria-hidden="true"/>{success}</div>}
      <div className={'review-columns'+(free?' review-columns-free':'')}>
        <section className="review-card" aria-labelledby="review-registration-title"><h3 id="review-registration-title">Registration details</h3>
          {number?<CopyDetail label="Registration number" value={number}/>:<dl><Detail label="Registration number" value="Not assigned"/></dl>}
          <dl className="review-facts"><Detail label={record.kind==='trial'?'Program':'Tournament'} value={reviewTournament(record,data,content)}/><Detail label="Registration type" value={reviewLabel(requestTypeLabels,record.kind)}/><Detail label="Phone" value={record.phone}/><Detail label="Email" value={record.email}/><Detail label="Submitted" value={timestamp(record.created)}/></dl>
          {!!answers.length&&<section className="review-subsection"><h4>Submitted details</h4><dl className="review-facts">{answers.map(answer=><div className="review-detail" key={answer.id}><dt>{answer.label}</dt><dd>{isReviewAttachment(answer.value)?<a href={String(answer.value)} target="_blank" rel="noreferrer">Download document <Download size={14} aria-hidden="true"/></a>:reviewValue(answer.value)}</dd></div>)}</dl></section>}
          {!!members.length&&<section className="review-subsection"><h4>Team participants <span>({members.length})</span></h4><table className="review-team"><thead><tr><th scope="col">No.</th><th scope="col">Participant</th><th scope="col">Age</th><th scope="col">Belt</th></tr></thead><tbody>{members.map((member,index)=><tr key={index}><td>{index+1}</td><td>{member.name||'Not provided'}</td><td>{member.age??'Not provided'}</td><td>{member.belt||'Not provided'}</td></tr>)}</tbody></table></section>}
          {data.message&&<section className="review-subsection"><h4>Participant message</h4><p className="review-note-text">{data.message}</p></section>}
        </section>
        {!free&&<section className="review-card review-payment-card" aria-labelledby="review-payment-title"><div className="review-payment-heading"><h3 id="review-payment-title">Payment details &amp; proof</h3><strong className="review-amount">{money(record.amount)}</strong></div><dl className="review-facts"><Detail label="Payment method" value={manual?'Manual UPI':'Razorpay'}/><Detail label="Payment status" value={paymentLabel}/></dl>
          {reference?<CopyDetail label={manual?'Transaction ID':'Payment reference'} value={reference}/>:<p className="review-secondary">{manual?'No transaction ID was supplied.':'A captured payment reference is not available yet.'}</p>}
          {manual&&data.manualProof?.screenshot?<section className="review-proof" aria-label="Submitted payment proof"><div className="review-proof-heading"><h4>{data.manualHistory?.length?'Resubmitted payment proof':'Submitted payment proof'}</h4><button type="button" className="review-button review-button-primary" disabled={!!busy} onClick={()=>setProof(true)}><Maximize2 size={16} aria-hidden="true"/>Enlarge proof</button></div><PaymentProofThumbnail key={record.id+(data.manualProofRevision||'')} id={record.id} revision={data.manualProofRevision}/><a className="review-download" href={'/api/admin/payment-proof?'+new URLSearchParams({id:record.id,revision:data.manualProofRevision||'',download:'1'})}><Download size={16} aria-hidden="true"/>Download payment proof</a></section>:manual?<p className="review-secondary">No screenshot was submitted. Review the supplied transaction ID.</p>:null}
          {record.payment_status==='manual_rejected'&&data.manualReviewNote&&<section className="review-correction"><h4>Payment correction reason</h4><p className="review-note-text">{data.manualReviewNote}</p></section>}
        </section>}
      </div>
      <div className="review-documents">{(['tournament','team'].includes(record.kind)&&free||record.payment_status==='paid')&&<button type="button" className="review-button" disabled={!!busy||!free&&!record.payment_id} onClick={()=>work('document',async()=>{setReceipt(await request<Receipt>(free?'registration-confirmation':'receipt',{id:record.id}));})}>{busy==='document'?<Loader2 className="spin" size={16}/>:<Download size={16}/>} {free?'View registration confirmation':'View payment receipt'}</button>}{record.payment_status==='paid'&&!record.payment_id&&<p className="review-secondary">Receipt unavailable until a confirmed payment reference is recorded.</p>}</div>
      {receipt&&<PaymentReceipt receipt={receipt} logo={content.branding?.logo} confirmation={free} onClose={()=>setReceipt(null)}/>}
      <details className="review-history"><summary>Reference &amp; review history</summary><dl className="review-facts"><Detail label="Internal request reference" value={record.id}/>{record.target&&<Detail label="Internal target reference" value={record.target}/>}{record.order_id&&<Detail label="Payment order reference" value={record.order_id}/>}</dl>{data.manualReviewNote&&record.payment_status!=='manual_rejected'&&<div><h4>Saved payment review note</h4><p className="review-note-text">{data.manualReviewNote}</p></div>}{data.participantRejectionReason&&status!=='rejected'&&<div><h4>Previous registration reason</h4><p className="review-note-text">{data.participantRejectionReason}</p></div>}{data.manualHistory?.map((entry,index)=><div className="review-history-entry" key={index}><h4>Previous payment review {index+1}</h4><dl className="review-facts"><Detail label="Reviewed" value={timestamp(entry.reviewedAt)}/>{entry.proof?.transactionId&&<Detail label="Transaction ID" value={entry.proof.transactionId}/>}</dl>{entry.reviewNote&&<p className="review-note-text">{entry.reviewNote}</p>}{entry.proof?.screenshot&&isReviewAttachment(entry.proof.screenshot)&&<a href={entry.proof.screenshot} target="_blank" rel="noreferrer">Download previous proof</a>}</div>)}{!showHistory&&<p className="review-secondary">No previous review notes.</p>}</details>
      <section className={'review-actions'+(free?' review-actions-free':'')} aria-label="Review actions">
        <form className="review-card" onSubmit={e=>{e.preventDefault();void work('registration',async()=>{await request('requests',{id:record.id,status,notes:note,participantRejectionReason:participantReason},'PUT');onSaved({...record,status,notes:note,participantRejectionReason:participantReason.trim(),data:JSON.stringify({...data,participantRejectionReason:participantReason.trim()})});setSuccess('Registration review saved.');});}}>
          <h3>Registration decision</h3><label>Registration status<select aria-label="Registration status" value={status} disabled={!!busy} onChange={e=>setStatus(e.target.value)}>{Object.entries(registrationStatusLabels).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
          {status==='rejected'&&<label><span>Participant-facing registration reason <span className="review-optional">(optional)</span></span><textarea rows={3} maxLength={1000} value={participantReason} disabled={!!busy} onChange={e=>setParticipantReason(e.target.value)}/></label>}
          <label><span>Internal Admin note <span className="review-optional">(private)</span></span><textarea rows={3} maxLength={5000} value={note} disabled={!!busy} onChange={e=>setNote(e.target.value)}/></label>
          {!free&&<p className="review-secondary">Registration approval does not verify payment.</p>}<button type="submit" className="review-button review-button-primary" disabled={!!busy}>{busy==='registration'?<Loader2 size={17} className="spin"/>:<Check size={17}/>} {busy==='registration'?'Saving review…':'Save registration review'}</button>
        </form>
        {!free&&<section className="review-card" aria-labelledby="review-payment-action-title"><h3 id="review-payment-action-title">Payment decision</h3>{manual?(canReview?<><p className="review-secondary">Verify the full amount in the club bank or UPI statement.</p><div className="review-payment-actions"><button type="button" className="review-button review-button-primary" disabled={!!busy} onClick={()=>void reviewPayment('verify')}>{busy==='verify'?<Loader2 size={17} className="spin"/>:<Check size={17}/>} {busy==='verify'?'Verifying…':'Verify payment'}</button><button type="button" className="review-button review-button-danger" disabled={!!busy||rejecting} onClick={()=>{setRejecting(true);setError('');setSuccess('')}}>Reject proof</button></div>{rejecting&&<form className="review-reject-form" onSubmit={e=>{e.preventDefault();void reviewPayment('reject')}}><label>Payment correction reason<textarea required maxLength={1000} rows={3} value={paymentReason} disabled={!!busy} onChange={e=>setPaymentReason(e.target.value)}/></label><div className="review-payment-actions"><button type="submit" className="review-button review-button-danger" disabled={!!busy}>{busy==='reject'?'Requesting correction…':'Confirm rejection'}</button><button type="button" className="review-button" disabled={!!busy} onClick={()=>setRejecting(false)}>Cancel rejection</button></div></form>}</>:<p className="review-unavailable" role="status">{unavailable}</p>):<p className="review-unavailable">Razorpay payments are confirmed by the payment provider. Manual verification is unavailable.</p>}</section>}
      </section>
    </div>
    {proof&&<PaymentProofViewer record={record} onClose={()=>setProof(false)}/>}
  </section></div>;
}
