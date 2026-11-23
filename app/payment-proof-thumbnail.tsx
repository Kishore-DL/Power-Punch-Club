'use client';
import {useEffect,useState} from 'react';
import PaymentProofImage from './payment-proof-image';

export default function PaymentProofThumbnail({id,revision}:{id:string;revision?:string}){
  const [src,setSrc]=useState(''),[loading,setLoading]=useState(true),[error,setError]=useState('');
  useEffect(()=>{
    const controller=new AbortController();let url='';
    fetch('/api/admin/payment-proof?'+new URLSearchParams({id,revision:revision||''}),{cache:'no-store',signal:controller.signal}).then(async response=>{
      if(!response.ok)throw Error('Payment proof preview is unavailable. Refresh the registration or try again.');
      if(!['image/png','image/jpeg','image/webp'].includes(response.headers.get('content-type')||''))throw Error('Unsupported payment proof image.');
      const blob=await response.blob();if(controller.signal.aborted)return;url=URL.createObjectURL(blob);setSrc(url);
    }).catch(error=>{if(!controller.signal.aborted){setError(error instanceof Error?error.message:'Unable to preview proof.');setLoading(false)}});
    return()=>{controller.abort();if(url)URL.revokeObjectURL(url)};
  },[id,revision]);
  return <section className="payment-proof-thumbnail" aria-label="Payment proof thumbnail">
    {loading&&<p role="status">Loading proof preview…</p>}{error&&<p role="alert">{error}</p>}
    {src&&!error&&<PaymentProofImage key={src} src={src} alt="Complete payment proof thumbnail" onLoad={()=>setLoading(false)} onError={()=>{setError('The proof image could not be displayed.');setLoading(false)}}/>}
  </section>;
}
