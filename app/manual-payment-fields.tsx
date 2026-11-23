'use client';
/* eslint-disable @next/next/no-img-element -- Preserve original payment image bytes and support private Blob previews. */
import {useEffect,useRef,useState} from 'react';
import {Download,Loader2} from 'lucide-react';
import PaymentProofImage from './payment-proof-image';
type Props = {
  event: {id?:string;manualQrImage?:string;manualPayee?:string;manualUpiId?:string;manualInstructions?:string;previewQrNonPayable?:boolean};
  proof: { transactionId: string; screenshot: string };
  onChange: (value: { transactionId: string; screenshot: string }) => void;
  onUpload: (file: File) => void;
  uploading: boolean;
};

export default function ManualPaymentFields({ event, proof, onChange, onUpload, uploading }: Props) {
  const [downloading,setDownloading]=useState(false),[qrError,setQrError]=useState(''),[qrBroken,setQrBroken]=useState(false),[saved,setSaved]=useState(false);
  const [selectedFile,setSelectedFile]=useState<File|null>(null),[localPreview,setLocalPreview]=useState(''),[previewError,setPreviewError]=useState('');
  const fileInput=useRef<HTMLInputElement>(null);
  useEffect(()=>()=>{if(localPreview)URL.revokeObjectURL(localPreview)},[localPreview]);
  const lock=useRef(false),objectUrl=useRef(''),downloadAbort=useRef<AbortController|null>(null);
  useEffect(()=>()=>{downloadAbort.current?.abort();if(objectUrl.current)URL.revokeObjectURL(objectUrl.current)},[]);
  const download=async()=>{
    if(lock.current)return;const controller=new AbortController();downloadAbort.current=controller;lock.current=true;setDownloading(true);setQrError('');setSaved(false);
    try{
      const response=await fetch('/api/upi-qr?'+new URLSearchParams({id:event.id||''}),{cache:'no-store',signal:controller.signal});
      if(!response.ok)throw Error('The QR image could not be downloaded. Try again or open the image and save it.');
      const type=response.headers.get('content-type'),extension=({'image/png':'png','image/jpeg':'jpg','image/webp':'webp'} as Record<string,string>)[type||''];
      if(!extension)throw Error('This QR image format could not be downloaded. Open the image to save it.');
      const blob=await response.blob();if(controller.signal.aborted)return;if(!blob.size)throw Error('The QR image is empty. Please contact the club.');
      if(objectUrl.current)URL.revokeObjectURL(objectUrl.current);
      if(typeof URL.createObjectURL!=='function')throw Error('This browser cannot save the QR directly. Open the image, then use Save Image.');
      const url=URL.createObjectURL(blob);objectUrl.current=url;
      const link=document.createElement('a');link.href=url;link.download='power-punch-club-upi-qr.'+extension;
      if(!('download' in link))throw Error('Open the QR image, then use Save Image or long-press it to save.');
      document.body.appendChild(link);link.click();link.remove();setSaved(true);
      window.setTimeout(()=>{URL.revokeObjectURL(url);if(objectUrl.current===url)objectUrl.current=''},1000);
    }catch(error){if(controller.signal.aborted)return;if(objectUrl.current){URL.revokeObjectURL(objectUrl.current);objectUrl.current='';}setQrError(error instanceof Error?error.message:'Unable to download QR image. Open the image to save it.');}
    finally{lock.current=false;setDownloading(false);}
  };
  return (
    <fieldset className="manual-payment-fields">
      <legend>{event.previewQrNonPayable?'QR code':'Pay by UPI QR'}</legend>
      {event.manualQrImage&&!event.previewQrNonPayable&&<p>Scan this QR using your UPI app. On the same phone, save the QR image and select it from your UPI app gallery.</p>}
      {event.manualQrImage?<>
        {!qrBroken?<img className="manual-payment-qr" src={event.manualQrImage} alt={event.previewQrNonPayable?'QR code':'Club UPI payment QR code'} onError={()=>setQrBroken(true)}/>:<p role="alert">The QR image is unavailable. Please contact the club before paying.</p>}
        <div className="qr-download-actions"><button type="button" className="btn pale" disabled={downloading||qrBroken} onClick={download}>{downloading?<Loader2 className="spin" size={16}/>:<Download size={16}/>} {downloading?'Downloading QR...':'Download QR'}</button>
        <a className="text-link" href={event.manualQrImage} target="_blank" rel="noreferrer">Open QR image</a></div>
        <small>Cannot save directly? Open the image, then long-press or use Save Image in your browser.</small>
        {qrError&&<p role="alert" className="error">{qrError}</p>}{saved&&<p role="status">QR image download started. If it did not save, use Open QR image.</p>}
      </>:<p role="status">No UPI QR image is configured. Please contact the club for payment instructions.</p>}
      {event.manualPayee && <p><strong>Payee</strong> {event.manualPayee}</p>}
      {event.manualUpiId && <p className="manual-upi-id"><strong>UPI ID</strong> {event.manualUpiId}</p>}
      {event.manualInstructions && event.manualInstructions.trim()!=='Enter a transaction reference or upload a payment screenshot for review.' && <p style={{ whiteSpace: 'pre-wrap' }}>{event.manualInstructions}</p>}
      <p>{event.previewQrNonPayable?'Enter a transaction reference or upload a screenshot. The club will review your submission.':'Check the payee and amount in your UPI app. After payment, enter the transaction ID or upload a screenshot. The club will verify your payment.'}</p>
      <label>UPI transaction ID / UTR
        <input autoComplete="off" maxLength={100} value={proof.transactionId}
          placeholder="Transaction reference from your UPI app"
          onChange={e => onChange({ ...proof, transactionId: e.target.value })} />
      </label>
      <label>Payment screenshot
        <input ref={fileInput} type="file" accept="image/png,image/jpeg,image/webp" disabled={uploading}
          onChange={e => {const file=e.target.files?.[0];if(!file)return;setPreviewError('');if(file.size>8*1024*1024){setPreviewError('Choose a PNG, JPG or WebP image under 8 MB.');e.target.value='';return;}setSelectedFile(file);setLocalPreview(URL.createObjectURL(file));onChange({...proof,screenshot:''});onUpload(file);}} />
        <small>{uploading ? 'Uploading screenshot…' : proof.screenshot ? 'Screenshot attached.' : 'PNG, JPG or WebP · max 8 MB'}</small>
      </label>
      {previewError&&<p className="error" role="alert">{previewError}</p>}
      {localPreview&&<section className="payment-proof-local-preview" aria-label="Selected payment proof preview"><p>Selected image - complete original image</p><PaymentProofImage key={localPreview} src={localPreview} alt="Complete selected payment screenshot" onError={()=>setPreviewError('The selected image could not be displayed.')}/></section>}
      {(proof.screenshot||selectedFile) && <button className="text-link" type="button" disabled={uploading} onClick={() => {setSelectedFile(null);setLocalPreview('');setPreviewError('');if(fileInput.current)fileInput.current.value='';onChange({ ...proof, screenshot: '' });}}>Remove screenshot</button>}
      <small>Provide at least one — transaction ID or screenshot. You may provide both.</small>
    </fieldset>
  );
}
