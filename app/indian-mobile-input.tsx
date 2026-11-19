'use client';
import {useId,useState,useRef} from 'react';
import {normaliseIndianMobile} from '../lib/registration-contact.mjs';

export default function IndianMobileInput({value,onChange,required=false,label='Phone number'}:{value:string;onChange:(value:string)=>void;required?:boolean;label?:string}){
  const id=useId(),[error,setError]=useState(''),inputRef=useRef<HTMLInputElement>(null);
  const accept=(raw:string)=>{
    const normalised=normaliseIndianMobile(raw);
    if(/^[0-9]{0,10}$/.test(raw)||normalised){onChange(normalised||raw);inputRef.current?.setCustomValidity('');setError('');return true;}
    inputRef.current?.setCustomValidity('Enter exactly 10 digits.');setError('Enter exactly 10 digits. You may paste a valid +91 Indian number.');return false;
  };
  return <><span className="indian-mobile-field"><span aria-hidden="true">+91</span><input ref={inputRef} aria-label={label} aria-describedby={id} aria-invalid={!!error} required={required} type="tel" inputMode="numeric" maxLength={10} pattern="[0-9]{10}" autoComplete="tel-national" placeholder="10-digit mobile number" value={normaliseIndianMobile(value)||value} onBeforeInput={e=>{const data=(e.nativeEvent as InputEvent).data;if(data&&/[^0-9]/.test(data))e.preventDefault()}} onPaste={e=>{e.preventDefault();const input=e.currentTarget,text=e.clipboardData.getData('text');if(text.trim().startsWith('+91'))accept(text);else accept(value.slice(0,input.selectionStart??0)+text+value.slice(input.selectionEnd??value.length))}} onChange={e=>{if(!accept(e.target.value))e.target.value=value}} onBlur={()=>{if((required||value)&&!normaliseIndianMobile(value))setError('Enter exactly 10 digits.')}} onInvalid={e=>{e.currentTarget.setCustomValidity('Enter exactly 10 digits for the Indian mobile number.');setError('Enter exactly 10 digits.')}} onInput={e=>e.currentTarget.setCustomValidity('')}/></span><small id={id} className={error?'error':'fine'} role={error?'alert':undefined}>{error||'Indian mobile number: 10 digits after +91.'}</small></>;
}
