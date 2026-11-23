'use client';
import {useEffect,useRef,useState} from 'react';
import {X,ZoomIn,ZoomOut} from 'lucide-react';
import PaymentProofImage,{type ProofGeometry} from './payment-proof-image';

export default function PaymentProofViewer({record,onClose}:{record:{id:string;name:string;payment_status:string;data:string|{registrationNumber?:string;manualProofRevision?:string;manualProof?:{transactionId?:string}}};onClose:()=>void}){
  const dialog=useRef<HTMLDialogElement>(null),[src,setSrc]=useState(''),[error,setError]=useState(''),[loading,setLoading]=useState(true),[scale,setScale]=useState<number|undefined>(),[geometry,setGeometry]=useState<ProofGeometry>({width:0,height:0,scale:1,fitScale:1});
  const data=typeof record.data==='string'?JSON.parse(record.data):record.data;
  useEffect(()=>{
    const el=dialog.current,previous=document.activeElement as HTMLElement|null,overflow=document.body.style.overflow;
    el?.showModal();document.body.style.overflow='hidden';
    return()=>{el?.close();document.body.style.overflow=overflow;if(previous?.isConnected)previous.focus()};
  },[]);
  useEffect(()=>{
    const controller=new AbortController();let url='';
    fetch('/api/admin/payment-proof?'+new URLSearchParams({id:record.id,revision:data.manualProofRevision||''}),{cache:'no-store',signal:controller.signal}).then(async response=>{
      if(!response.ok){const body=await response.json() as {error?:string};throw Error(body.error||'Unable to load payment proof.');}
      if(!['image/png','image/jpeg','image/webp'].includes(response.headers.get('content-type')||''))throw Error('The payment proof is not a supported image.');
      const blob=await response.blob();if(controller.signal.aborted)return;url=URL.createObjectURL(blob);setSrc(url);
    }).catch(error=>{if(!controller.signal.aborted){setError(error instanceof Error?error.message:'Unable to load payment proof.');setLoading(false)}});
    return()=>{controller.abort();if(url)URL.revokeObjectURL(url)};
  },[record.id,data.manualProofRevision]);
  return <dialog ref={dialog} className="payment-proof-dialog" aria-labelledby="payment-proof-title" onCancel={e=>{e.preventDefault();onClose()}} onKeyDown={e=>{
    e.stopPropagation();
    if(e.key==='Escape'){e.preventDefault();onClose();return;}
    if(e.key!=='Tab')return;
    const controls=[...e.currentTarget.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], [tabindex="0"]')].filter(el=>el.offsetParent!==null);
    const first=controls[0],last=controls.at(-1);
    if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}
    else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}
  }}>
    <header><h2 id="payment-proof-title">Payment proof</h2><button type="button" autoFocus aria-label="Close payment proof" onClick={onClose}><X/></button></header>
    <dl className="proof-details" tabIndex={0}><div><dt>Registration number</dt><dd>{data.registrationNumber||record.id}</dd></div><div><dt>Participant</dt><dd>{record.name}</dd></div><div><dt>Transaction ID</dt><dd>{data.manualProof?.transactionId||'Not supplied'}</dd></div><div><dt>Payment status</dt><dd>{record.payment_status==='manual_pending'?'Awaiting Admin Verification':record.payment_status}</dd></div></dl>
    {loading&&<p role="status">Loading payment proof…</p>}{error&&<p role="alert" className="error">{error}</p>}
    {src&&!error&&<>
      <div className="proof-zoom" aria-label="Payment proof zoom controls">
        <button type="button" aria-label="Zoom out" disabled={loading} onClick={()=>setScale(Math.max(.005,geometry.scale/1.5))}><ZoomOut/> Zoom out</button>
        <output aria-live="polite">{Math.round(geometry.scale*100)}%</output>
        <button type="button" aria-label="Zoom in" disabled={loading} onClick={()=>setScale(Math.min(8,geometry.scale*1.5))}><ZoomIn/> Zoom in</button>
        <button type="button" disabled={loading} onClick={()=>setScale(undefined)}>Fit image</button>
        <button type="button" disabled={loading} onClick={()=>setScale(1)}>Original size</button>
        <a className="proof-download" href={'/api/admin/payment-proof?'+new URLSearchParams({id:record.id,revision:data.manualProofRevision||'',download:'1'})}>Download original</a>
        {geometry.width>0&&<span className="proof-original-dimensions">{geometry.width} x {geometry.height} px</span>}
      </div>
      <PaymentProofImage key={src} className="payment-proof-expanded" src={src} alt={'UPI payment proof for '+(data.registrationNumber||record.name)} scale={scale} onGeometry={setGeometry} onLoad={()=>setLoading(false)} onError={()=>{setLoading(false);setError('The payment proof image could not be displayed. Close this viewer and try again.')}}/>
    </>}
  </dialog>;
}
