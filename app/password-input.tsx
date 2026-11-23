'use client';
import {useLayoutEffect,useRef,useState,type InputHTMLAttributes} from 'react';
import {Eye,EyeOff} from 'lucide-react';

export default function PasswordInput(props:Omit<InputHTMLAttributes<HTMLInputElement>,'type'>){
  const [visible,setVisible]=useState(false);
  const input=useRef<HTMLInputElement>(null);
  const pending=useRef<{value:string;start:number|null;end:number|null;focused:boolean}|null>(null);
  useLayoutEffect(()=>{
    const current=input.current,snapshot=pending.current;if(!current||!snapshot)return;
    // Some browser/React combinations clear an uncontrolled password while its
    // type changes. Retain the DOM value without making form.reset controlled.
    if(props.value===undefined)current.value=snapshot.value;
    if(snapshot.focused)current.focus();
    if(snapshot.start!==null&&snapshot.end!==null)current.setSelectionRange(snapshot.start,snapshot.end);
    pending.current=null;
  },[visible,props.value]);
  return <span className="password-field"><input {...props} ref={input} type={visible?'text':'password'}/><button type="button" aria-label={visible?'Hide password':'Show password'} aria-pressed={visible} onMouseDown={e=>e.preventDefault()} onClick={()=>{const el=input.current;if(el)pending.current={value:el.value,start:el.selectionStart,end:el.selectionEnd,focused:document.activeElement===el};setVisible(value=>!value)}}>{visible?<EyeOff size={20} aria-hidden="true"/>:<Eye size={20} aria-hidden="true"/>}</button></span>;
}
