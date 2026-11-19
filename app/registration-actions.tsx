'use client';
import { useRef, useState } from 'react';
import { participantError, type RegistrationCredentials, type SavedRegistration } from '../lib/participant-types';

export async function downloadRegistration(body:RegistrationCredentials, receipt=false) {
  const response=await fetch('/api/registration-document',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...body,document:receipt?'receipt':'acknowledgement'})});
  if(!response.ok){const data=await response.json() as {error?:string};throw Error(data.error||'Download failed. Please retry.');}
  const blob=await response.blob(),url=URL.createObjectURL(blob),link=document.createElement('a');
  link.href=url;link.download=response.headers.get('content-disposition')?.match(/filename="([^"]+)"/)?.[1]||'registration.pdf';
  document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
}
export function rememberRegistration(record:SavedRegistration) {
  try{
    const previous=JSON.parse(localStorage.getItem('ppc-completed-registrations')||'[]') as SavedRegistration[];
    localStorage.setItem('ppc-completed-registrations',JSON.stringify([record,...previous.filter(item=>item.id!==record.id)].slice(0,100)));
  }catch{/* The downloaded acknowledgement supports recovery when browser storage is unavailable. */}
}
export function CopyValue({value,label}:{value:string;label:string}) {
  const [message,setMessage]=useState(''),input=useRef<HTMLInputElement>(null);
  async function copy(){
    try{if(!navigator.clipboard?.writeText)throw Error();await navigator.clipboard.writeText(value);setMessage('Copied '+label.toLowerCase()+'.');}
    catch{
      const field=input.current;if(!field)return;field.focus();field.select();
      try{if(!document.execCommand('copy'))throw Error();setMessage('Copied '+label.toLowerCase()+'.');}
      catch{setMessage('Text selected. Use Copy from your device menu, or press Ctrl+C.');}
    }
  }
  return <div className="copy-value"><label>{label}<input ref={input} readOnly value={value} onFocus={e=>e.target.select()}/></label><button className="btn pale" type="button" onClick={copy}>Copy {label.toLowerCase()}</button><span role="status" aria-live="polite">{message}</span></div>;
}
export function DownloadRegistration({auth,receipt=false}:{auth:RegistrationCredentials;receipt?:boolean}) {
  const [busy,setBusy]=useState(false),[message,setMessage]=useState('');
  return <div><button type="button" className="btn red" disabled={busy} onClick={async()=>{setBusy(true);setMessage('Preparing PDF…');try{await downloadRegistration(auth,receipt);setMessage('PDF downloaded. Keep your tracking code safe.');}catch(e){setMessage(participantError(e));}finally{setBusy(false);}}}>{receipt?'Download payment receipt':'Download registration PDF'}</button><p role="status" aria-live="polite">{message}</p></div>;
}
