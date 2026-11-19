type Status={email?:boolean;emailConfiguration?:{provider:string;ready:boolean;issues:string[]}};
export default function EmailConfiguration({status}:{status:Status}){
  const issues=status.emailConfiguration?.issues||[];
  return <div className={status.email?'sample-note':'error'} role={status.email?'status':'alert'}>
    <strong>{status.email?'Brevo Admin notifications configured':'Brevo Admin notification setup required'}</strong>
    {issues.length>0?<ul>{issues.map(issue=><li key={issue}>{issue}</li>)}</ul>:!status.email&&<p>Configure BREVO_API_KEY, EMAIL_FROM_ADDRESS, EMAIL_FROM_NAME and ADMIN_NOTIFICATION_EMAIL on the server.</p>}
    <p>All notification emails go only to the configured club administrator. Registrations, website tracking and PDF downloads continue when email is unavailable.</p>
    <p>“Accepted by Brevo” means the provider accepted the request; it does not confirm inbox delivery.</p>
  </div>;
}
