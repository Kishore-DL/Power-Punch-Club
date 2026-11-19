'use client';
import {useRef,useState,type InputHTMLAttributes} from 'react';
import {Eye,EyeOff} from 'lucide-react';

export default function PasswordInput(props:Omit<InputHTMLAttributes<HTMLInputElement>,'type'>){
  const [visible,setVisible]=useState(false);
  const input=useRef<HTMLInputElement>(null);
  return <span className="password-field"><input {...props} ref={input} type={visible?'text':'password'}/><button type="button" aria-label={visible?'Hide password':'Show password'} aria-pressed={visible} onMouseDown={e=>e.preventDefault()} onClick={()=>{const el=input.current,start=el?.selectionStart,end=el?.selectionEnd,focused=document.activeElement===el;setVisible(value=>!value);requestAnimationFrame(()=>{if(focused)el?.focus();if(start!=null&&end!=null)el?.setSelectionRange(start,end)})}}>{visible?<EyeOff size={20} aria-hidden="true"/>:<Eye size={20} aria-hidden="true"/>}</button></span>;
}
