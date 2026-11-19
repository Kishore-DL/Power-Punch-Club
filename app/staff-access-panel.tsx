'use client';

import { useEffect, useState, type FormEvent } from 'react';

async function staffRequest(method = 'GET', email?: string): Promise<string[]> {
  const response = await fetch('/api/admin/staff', {
    method,
    ...(email ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) } : {}),
  });
  const result = await response.json() as { emails: string[]; error?: string };
  if (!response.ok) throw new Error(result.error || 'Unable to update staff access');
  return result.emails;
}

export default function StaffAccessPanel() {
  const [emails, setEmails] = useState<string[]>([]);
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    staffRequest().then(setEmails).catch(e => setError(e.message)).finally(() => setBusy(false));
  }, []);

  async function change(method: 'POST' | 'DELETE', address: string) {
    setBusy(true); setError(''); setNotice('');
    try {
      setEmails(await staffRequest(method, address));
      setNotice(method === 'POST' ? 'Staff access assigned.' : 'Staff access removed.');
      if (method === 'POST') setEmail('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to update staff access');
    } finally {
      setBusy(false);
    }
  }

  function assign(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (email.trim() && !busy) void change('POST', email.trim());
  }

  return <section className="admin-panel staff-access-panel" aria-labelledby="staff-access-heading">
    <h2 id="staff-access-heading">Staff access</h2>
    <p>Use the email on the staff member’s ChatGPT account. Staff can view tournament registrations and download permitted files.</p>
    <form onSubmit={assign}>
      <label>Staff email <input type="email" required maxLength={254} autoComplete="off" value={email} onChange={e=>setEmail(e.target.value)} /></label>
      <button className="btn red" disabled={busy} type="submit">Assign staff</button>
    </form>
    {error && <p role="alert" className="error">{error}</p>}
    <p role="status">{notice || (busy ? 'Checking staff access…' : '')}</p>
    {!busy && emails.length === 0 && <p>No staff assigned.</p>}
    <ul>{emails.map(address => <li key={address}>
      <span>{address}</span>
      <button type="button" className="btn pale" disabled={busy}
        aria-label={'Remove staff access for ' + address} onClick={()=>void change('DELETE',address)}>Remove access</button>
    </li>)}</ul>
    <a href="/staff" className="text-link">Open Staff Portal</a>
  </section>;
}
