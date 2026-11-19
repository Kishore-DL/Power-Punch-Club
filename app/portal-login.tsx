'use client';
import PasswordInput from './password-input';

import { useState, type ReactNode } from 'react';
import { ShieldCheck, ArrowRight, ArrowLeft } from 'lucide-react';
import { defaultClubLogo } from '../lib/defaults';

export async function authRequest(path:string,method='GET',body?:unknown) {
  const response=await fetch('/api/auth/'+path,{method,...(body!==undefined?{
    headers:{'Content-Type':'application/json'},body:JSON.stringify(body),
  }:{})});
  const data=await response.json() as any;
  if(!response.ok)throw new Error(data.error||'Unable to complete sign-in');
  return data;
}

export function PortalLogin({role,passwordMode,logo,children,onSignedIn}:{
  role:'staff'|'admin'; passwordMode:boolean; logo?:string;children?:ReactNode;onSignedIn?:()=>void;
}) {
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const title={staff:'Staff Login',admin:'Admin Login'}[role];
  return <main className={'portal-login portal-login-'+role}>
    <section className="portal-login-card" aria-labelledby="portal-login-title">
      <a className="portal-back" href="/"><ArrowLeft size={18}/> Back to website</a>
      <div className="portal-identity"><img src={logo||defaultClubLogo} alt="" width={58} height={58}/><strong>Power Punch Club</strong></div>
      <div className="portal-login-icon"><ShieldCheck size={22} aria-hidden="true"/></div>
      <h1 id="portal-login-title">{title}</h1>
      <p>{role==='staff'?'View tournament registrations and approved documents.':'Manage your club website and registrations.'}</p>
      {passwordMode?<form onSubmit={async e=>{
        e.preventDefault();
        const data=new FormData(e.currentTarget);
        setError('');setBusy(true);
        try{await authRequest('login','POST',{role,username:data.get('username'),password:data.get('password')});onSignedIn?onSignedIn():location.reload()}
        catch(e){setError(e instanceof Error?e.message:'Unable to sign in');setBusy(false)}
      }}>
        <label>Login ID<input name="username" required maxLength={125} autoComplete="username"/></label>
        <label>Password<PasswordInput name="password" required maxLength={128} autoComplete="current-password"/></label>
        <button className="btn red" type="submit" disabled={busy}>{busy?'Signing in…':'Sign in'} <ArrowRight size={17}/></button>
      </form>:<a className="btn red" href={'/signin-with-chatgpt?return_to=%2F'+role} target="_top">Sign in with ChatGPT <ArrowRight size={17}/></a>}
      {error&&<p className="error" role="alert">{error}</p>}
      {children}
    </section>
  </main>;
}

export function PasswordSignOut({to}:{to:string}) {
  const [error,setError]=useState('');
  const [busy,setBusy]=useState(false);
  return <><button className="btn pale" type="button" disabled={busy} onClick={async()=>{
    setBusy(true);setError('');
    try{await authRequest('logout','POST',{role:to.startsWith('/staff')?'staff':'admin'});location.assign(to)}
    catch{setError('Unable to sign out. Try again.');setBusy(false)}
  }}>Sign out</button>{error&&<p role="alert">{error}</p>}</>;
}
