'use client';
import PasswordInput from './password-input';

import { useEffect,useState } from 'react';
import { authRequest } from './portal-login';
type Entry={role:'admin'|'staff';username:string};
type List={username:string;accounts:Entry[]};

export default function LoginAccounts() {
  const [list,setList]=useState<List>();
  const [edit,setEdit]=useState<Entry>();
  const [error,setError]=useState('');
  const [status,setStatus]=useState('');
  const [busy,setBusy]=useState(false);
  useEffect(()=>{authRequest('accounts').then(setList).catch(e=>setError(e.message))},[]);
  async function save(action:()=>Promise<void>) {
    setError('');setStatus('');setBusy(true);
    try{await action()}catch(e){setError(e instanceof Error?e.message:'Unable to save login')}
    finally{setBusy(false)}
  }
  return <section className="admin-panel" aria-label="Login accounts">
    {error&&<p className="error" role="alert">{error}</p>}
    <p role="status">{status}</p>
    {list&&<>
      <h2>Change owner login</h2>
      <form className="editor-grid" onSubmit={e=>{
        e.preventDefault();
        const form=e.currentTarget;
        const data=Object.fromEntries(new FormData(form));
        void save(async()=>{const result=await authRequest('owner','PUT',data);setList({...list,username:result.username});form.reset();setStatus('Owner login updated.')});
      }}>
        <label>New login ID<input required name="username" defaultValue={list.username} maxLength={125}/></label>
        <label>Current password<PasswordInput required name="currentPassword" maxLength={128} autoComplete="current-password"/></label>
        <label>New password<PasswordInput required name="password" minLength={12} maxLength={128} autoComplete="new-password"/></label>
        <button className="btn red" disabled={busy}>Save owner login</button>
      </form>
      <h2>{edit?'Reset account password':'Add Admin or Staff login'}</h2>
      <form key={edit?.role+':'+edit?.username} className="editor-grid" onSubmit={e=>{
        e.preventDefault();
        const form=e.currentTarget;
        const data=Object.fromEntries(new FormData(form));
        void save(async()=>{setList(await authRequest('accounts',edit?'PUT':'POST',edit?{...data,...edit}:data));form.reset();setEdit(undefined);setStatus(edit?'Password reset.':'Account added.')});
      }}>
        <label>Role<select name="role" defaultValue={edit?.role||'staff'} disabled={Boolean(edit)}><option value="staff">Staff</option><option value="admin">Admin</option></select></label>
        <label>Login ID<input required name="username" readOnly={Boolean(edit)} maxLength={125} defaultValue={edit?.username||''} /></label>
        <label>Password<PasswordInput required name="password" minLength={12} maxLength={128} autoComplete="new-password"/></label>
        <button className="btn red" disabled={busy}>{edit?'Reset password':'Add login'}</button>
        {edit&&<button type="button" className="btn pale" onClick={()=>setEdit(undefined)}>Cancel reset</button>}
      </form>
      <ul>{list.accounts.map(account=><li key={account.role+':'+account.username}>
        <strong>{account.username}</strong> ({account.role})
        <div className="portal-actions">
          <button type="button" className="btn pale" disabled={busy} onClick={()=>setEdit(account)}>Reset password</button>
          <button type="button" className="btn pale" disabled={busy} onClick={()=>{
            void save(async()=>{setList(await authRequest('accounts','DELETE',account));if(edit?.username===account.username&&edit.role===account.role)setEdit(undefined);setStatus('Account removed.')});
          }}>Remove login</button>
        </div>
      </li>)}</ul>
    </>}
  </section>;
}
