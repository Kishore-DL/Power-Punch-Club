'use client';

import { PortalLogin, PasswordSignOut, authRequest } from './portal-login';
import { useEffect, useState, useRef } from 'react';

type Session = { admin: boolean; staff: boolean; passwordMode?: boolean };
type Registration = {
  id: string; target: string; tournament: string; name: string; email?: string; phone?: string;
  registrationNumber: string; status: string; payment_status: string;
  answers: { label: string; value: string }[];
  uploads: { label: string; field: string }[];
  team: { name: string; age: number; belt: string }[];
};

export default function RegistrationPortal({ logo }: { logo?: string }) {
  const path = '/staff';
  const title = 'Staff Login';
  const [session, setSession] = useState<Session>();
  const [rows, setRows] = useState<Registration[]>([]);
  const [event, setEvent] = useState('');
  const [pageSize, setPageSize] = useState(25);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const allowed = Boolean(session?.staff);
  const entry=useRef<Promise<unknown>|null>(null);
  useEffect(() => {
    let active=true;
    const enter=()=>{
      setSession(undefined);setRows([]);setError('');
      return authRequest('staff-entry','POST',{}).then(()=>{if(active)setSession({admin:false,staff:false,passwordMode:true})}).catch(()=>{if(active)setError('Unable to start Staff sign-in. Please refresh.');});
    };
    if(!entry.current)entry.current=enter();
    else entry.current.then(()=>{if(active)setSession({admin:false,staff:false,passwordMode:true})});
    const show=(event:PageTransitionEvent)=>{if(event.persisted)entry.current=enter();};
    window.addEventListener('pageshow',show);
    return ()=>{active=false;window.removeEventListener('pageshow',show)};
  }, []);
  useEffect(() => {
    if (!allowed) return;
    let active=true;
    setLoading(true);
    const check=async()=>{
      try{
        const response=await fetch('/api/staff/registrations',{cache:'no-store'});
        if(response.status===403){if(active){setRows([]);setSession({admin:false,staff:false,passwordMode:true});}return;}
        if(!response.ok)throw Error('Unable to load registrations.');
        const rows=await response.json() as Registration[];if(active)setRows(rows);
      }catch(error){if(active)setError(error instanceof Error?error.message:'Unable to load registrations.');}
      finally{if(active)setLoading(false);}
    };
    void check();
    const timer=window.setInterval(check,60000);
    window.addEventListener('focus',check);
    return ()=>{active=false;window.clearInterval(timer);window.removeEventListener('focus',check)};
  }, [allowed]);

  const filtered = rows.filter(row=>!event||row.target===event);

  if(session&&!allowed)return <PortalLogin role="staff" passwordMode={Boolean(session.passwordMode)} logo={logo} onSignedIn={()=>{setError('');setSession({admin:false,staff:true,passwordMode:true})}}/>;

  return <main className="portal-page">
    <nav aria-label="Portal navigation"><a href="/">Back to website</a></nav>
    <h1>{allowed ? 'Tournament registrations' : title}</h1>
    {error && <p role="alert">{error}</p>}
    {!session && !error && <p role="status">Checking sign-in…</p>}
    {allowed && <>
      <div className="portal-actions">
        {session?.passwordMode?<PasswordSignOut to={path}/>:<a className="btn pale" href={'/signout-with-chatgpt?return_to='+path} target="_top">Sign out</a>}
      </div>
      {rows.length > 0 && <label>Tournament
        <select value={event} onChange={e=>{setEvent(e.target.value);setPageSize(25)}}><option value="">All tournaments</option>
          {[...new Map(rows.map(row=>[row.target,row.tournament]))].map(([id,label])=><option key={id} value={id}>{label}</option>)}
        </select>
      </label>}
      {loading && <p role="status">Loading registrations…</p>}
      {!loading && !error && rows.length===0 && <p>No tournament registrations available.</p>}
      {filtered.slice(0,pageSize).map(row=><article key={row.id} className="portal-record">
        <h2>{row.name}</h2><p>{row.tournament} · {row.registrationNumber}</p>
        <p>{row.status} · {row.payment_status==='not_required' ? 'No payment required' : row.payment_status}</p>
        {<p>{row.email} · {row.phone}</p>}
        <dl>{row.answers.map((answer,i)=><div key={i}><dt>{answer.label}</dt><dd>{answer.value}</dd></div>)}</dl>
        {row.team.length>0&&<ul>{row.team.map((member,i)=><li key={i}>{member.name} · {member.age} · {member.belt}</li>)}</ul>}
        {row.uploads.map(upload=><p key={upload.field}><a href={'/api/staff/download?'+new URLSearchParams({id:row.id,field:upload.field})}>Download {upload.label}</a></p>)}
      </article>)}
      {filtered.length>pageSize&&<button className="btn pale" type="button" onClick={()=>setPageSize(value=>value+25)}>Show more registrations</button>}
    </>}
  </main>;
}
