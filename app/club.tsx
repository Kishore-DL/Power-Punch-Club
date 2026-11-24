'use client';
import AssetImage from './asset-image';
import {selectedHeroPhoto} from '../lib/hero-photo.mjs';
import RegistrationReports from './registration-reports';
import Gallery from './club-gallery';
import { normaliseRegistrationEmail } from '../lib/registration-contact.mjs';
import IndianMobileInput from './indian-mobile-input';
import ReadableCopy from './readable-copy';
import { themeDefaults, themeFields, themeStyles } from '../lib/theme';
import React,{useState,useEffect,useContext,createContext} from 'react';
import NextLink from 'next/link';
import type {ClubContent,ClubEntry,FormField,EditableItem,TeamMember,RegistrationConfig,SavedRegistration,Receipt,ServiceStatus,LinkProps,ContentStyle,ContentSection,CollectionSection} from '../lib/club-types';
import type {ReviewRecord} from './request-review';
import {clubApi as api,type AuditEntry,type OutboxEntry} from './club-api';
import type {LucideIcon} from 'lucide-react';
import {ArrowUpRight,ArrowRight,ChevronRight,Menu,X,Shield,Target,CalendarDays,MapPin,Clock,Trophy,Plus,Trash2,Upload,LayoutDashboard,Settings,Users,Image as ImageIcon,FileText,CreditCard,Check,ExternalLink,Mail,Phone,Loader2,LogOut,Grip,Activity} from 'lucide-react';
import { defaultClubLogo, defaults } from '../lib/defaults';
import ClubHome from './club-home';
import TournamentDetail from './tournament-detail';
import TournamentCard from './tournament-card';
import TrainingCard from './training-card';
import LoginAccounts from './login-accounts';
import { PasswordSignOut, PortalLogin } from './portal-login';
import RegistrationPortal from './registration-portal';
import { useDialogFocus } from './dialog-focus';
import ManualPaymentFields from './manual-payment-fields';
import PaymentReceipt from './payment-receipt';
import TrackRegistration from './track-registration';
import EmailConfiguration from './email-configuration';
import { CopyValue, DownloadRegistration, rememberRegistration } from './registration-actions';
const nav=[['Home','/'],['About','/about'],['Masters','/masters'],['Training','/training'],['Tournaments','/tournaments'],['Achievements','/achievements'],['Gallery','/gallery'],['Contact','/contact'],['Track Registration','/track-registration']];
const fmt=(v:number)=>new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',minimumFractionDigits:0,maximumFractionDigits:2}).format(v||0);
const date=(s?:string)=>s?new Date(s).toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'}):'To be announced';
const fieldLabels:Record<string,string>={manualQrImage:'UPI QR image',manualPaymentEnabled:'Also enable UPI QR payments',manualPayee:'UPI payee name',manualUpiId:'UPI ID',manualInstructions:'UPI payment instructions',registrationPrefix:'Registration number prefix (PPC, PPP or PPC26; sequence never resets)',registrationSuffix:'Registration number suffix (optional, legacy compatible)',receiptHeading:'Payment receipt heading',confirmationHeading:'Without-payment confirmation heading',receiptNote:'Receipt / confirmation note',title:'Title',subtitle:'Eyebrow label',description:'Description',image:'Image',name:'Name',rank:'Belt rank',qualification:'Qualifications',experience:'Experience',achievements:'Achievements',ages:'Age groups',belt:'Belt levels',schedule:'Class timings',venue:'Venue',fee:'Fee (INR)',feePeriod:'Fee label (e.g. Monthly fee)',date:'Event date',deadline:'Registration deadline',capacity:'Participant capacity',status:'Registration status',categories:'Categories',eligibility:'Eligibility',rules:'Rules',document:'Rules document URL',formId:'Registration form',student:'Student / team',medal:'Medal / result',event:'Event',album:'Album',type:'Media type',url:'Media URL',featured:'Featured on homepage',amount:'Amount (INR)',text:'Announcement',endDate:'End date'};
const templates:Record<CollectionSection,Omit<EditableItem,'id'>>={masters:{name:'',rank:'',qualification:'',experience:'',description:'',achievements:'',image:''},training:{title:'',subtitle:'',description:'',ages:'',belt:'',schedule:'',venue:'',fee:0,feePeriod:'Monthly fee',image:''},tournaments:{title:'',description:'',date:'',deadline:'',venue:'',categories:'',eligibility:'',rules:'',fee:0,capacity:2000,status:'draft',formId:'default',image:'',document:''},achievements:{title:'',student:'',medal:'',event:'',date:'',description:'',image:''},gallery:{title:'',album:'',type:'photo',url:'',featured:false},announcements:{title:'',text:'',date:'',endDate:''},forms:{title:'',fields:[]}};
function ClubMark({logo}:{logo?:string}){
 return <span className="brand-mark"><AssetImage src={logo || defaultClubLogo} alt="" width={48} height={48}/></span>;
}
const NavigationContext=createContext<(to:string)=>void>(()=>{});
function ClubLink({to,children,className=''}:LinkProps){const go=useContext(NavigationContext);return <NextLink href={to} className={className} onClick={event=>{if(!event.metaKey&&!event.ctrlKey){event.preventDefault();go(to)}}}>{children}</NextLink>}
export default function Club({initial,initialRoute='/'}:{initial?:ClubContent;initialRoute?:string}){
 const [c,setC]=useState<ClubContent>(initial||defaults),[path,setPath]=useState(initialRoute),[menu,setMenu]=useState(false),[admin,setAdmin]=useState(false),[status,setStatus]=useState<ServiceStatus>({}),[passwordMode,setPasswordMode]=useState(true),[owner,setOwner]=useState(false),[modal,setModal]=useState<RegistrationConfig|null>(null),[toast,setToast]=useState('');
 useDialogFocus(!!modal,()=>setModal(null));
 const mobileModalTitle=modal?.kind==='team'?'Team registration':modal?.kind==='tournament'?'Individual registration':'';
 useEffect(()=>{if(!initial)api('content').then(setC).catch(()=>{});api('session').then(x=>{setAdmin(x.admin);setPasswordMode(x.passwordMode===true);setOwner(x.owner===true)}).catch(()=>{});api('status').then(setStatus).catch(()=>{});const pop=()=>{setPath(location.pathname);setMenu(false);window.scrollTo(0,0)};window.addEventListener('popstate',pop);return()=>window.removeEventListener('popstate',pop)},[initial]);
 useEffect(()=>{if(!toast)return;const t=setTimeout(()=>setToast(''),6500);return()=>clearTimeout(t)},[toast]);
 const go=(to:string)=>{history.pushState({},'',to);setPath(to);setMenu(false);window.scrollTo({top:0,behavior:'smooth'})};
 const Link=ClubLink;
 const b=c.branding;
 const mark=<ClubMark logo={b.logo}/>;
 const brand=<Link to="/" className="brand">{mark}<span>{b.name.toUpperCase()}<small>KARATE CLUB</small></span></Link>;
 const header=<header className="site-header"><div className="wrap header-inner"><Link to="/" className="brand">{b.name.toUpperCase()}</Link><nav className={menu?'open':''} aria-label="Main navigation">{nav.filter(([,to])=>['/','/training','/tournaments','/gallery','/contact','/track-registration'].includes(to)).map(([name,to])=><Link key={to} to={to} className={path===to||(to!=='/'&&path.startsWith(to+'/'))?'active':''}>{name}</Link>)}</nav><button className="menu-button" aria-label="Toggle navigation" aria-expanded={menu} onClick={()=>setMenu(!menu)}>{menu?<X/>:<Menu/>}</button></div></header>;
 const empty=(title:string,text:string)=><div className="empty"><Target size={32}/><h3>{title}</h3><p>{text}</p>{admin&&<Link to="/admin" className="text-link">Manage in admin <ArrowUpRight size={15}/></Link>}</div>;
 const heading=(label:string,title:string,desc?:string)=><section className="page-heading wrap"><h1>{title}</h1>{desc&&<p>{desc}</p>}</section>;
 const program=(p:ClubEntry,i:number)=>(
   <TrainingCard key={p.id} program={p} index={i} formatFee={fmt}
     onTrial={()=>setModal({kind:'trial',target:p.id,title:p.title})} />
 );
 const achievements=(items:ClubEntry[])=>items.map((a)=><article className="result-card" key={a.id}>{a.image?<AssetImage src={a.image} alt={a.title} loading="lazy"/>:<div className="medal-art"><Trophy size={56}/></div>}<div><span className="eyebrow">{a.medal||'ACHIEVEMENT'}</span><h3>{a.title}</h3><p>{a.student}</p><small>{a.event} {a.date&&'· '+date(a.date)}</small><ReadableCopy text={a.description} /></div></article>);
 const listedTournaments = c.tournaments.filter((t) => t.status !== 'draft');
 let page:React.ReactNode;
 if(path==='/')page=<ClubHome header={header} content={c} Link={Link} program={program} formatFee={fmt} formatDate={date}/>;
 else if(path==='/about')page=<>{heading('THE CLUB',c.pages.aboutTitle,c.pages.aboutText)}<section className="wrap section about-grid"><div className="about-photo"><AssetImage src={b.hero||'/hero.webp'} alt="Karate training"/></div><div><h2>About the Club</h2><ReadableCopy text={b.about} /><h3>Our mission</h3><ReadableCopy text={c.pages.mission} /><h3>Our values</h3><ReadableCopy text={c.pages.values} /><button className="btn red" onClick={()=>setModal({kind:'trial',title:'Book a trial class'})}>Book a trial class <ArrowUpRight size={17}/></button></div></section></>;
 else if(path==='/training')page=<>{heading('','Training','Check class timings, age groups, belt levels and fees.')}<section className="wrap section"><div className="grid three training-grid">{c.training.map(program)}</div></section></>;
 else if(path==='/masters')page=<>{heading('','Masters & Coaches','View coach profiles, belt ranks and experience.')}<section className="section wrap">{c.masters.length?<div className="grid three coach-grid">{c.masters.map((m)=><article className="coach" key={m.id}>{m.image?<AssetImage src={m.image} alt={m.name}/>:<div className="coach-empty"><Users size={70}/></div>}<div><span className="eyebrow">{m.rank}</span><h3>{m.name}</h3><p>{m.description}</p><dl><dt>Qualifications</dt><dd>{m.qualification}</dd><dt>Experience</dt><dd>{m.experience}</dd></dl><p>{m.achievements}</p></div></article>)}</div>:empty('No coach profiles listed','Coach profiles will be published by the club.')}</section></>;
 else if(path==='/tournaments')page=(
   <>
     {heading('','Tournaments','Check dates, location, rules and fees. Choose a tournament to register.')}
     <section className="section wrap tournament-list">
       {listedTournaments.length ? listedTournaments.map((t)=>(
         <TournamentCard key={t.id} tournament={t} Link={Link} formatDate={date} formatFee={fmt} />
       )) : empty('No tournaments listed','Tournament dates and registration details will be announced here.')}
     </section>
   </>
 );
 else if(path.startsWith('/tournaments/')){
   const tournament=listedTournaments.find((item)=>item.id===path.split('/')[2]);
   page=tournament ? (
     <TournamentDetail tournament={tournament} Link={Link} formatDate={date} formatFee={fmt}
       onRegister={(kind, registrationChoice)=>setModal({kind,registrationChoice,target:tournament.id,title:tournament.title,formId:tournament.formId})} />
   ) : heading('TOURNAMENT','EVENT NOT FOUND.','This tournament is unavailable.');
 }
 else if(path==='/achievements')page=<>{heading('','Achievements','View student achievements and tournament results.')}<section className="section wrap"><AchievementList items={c.achievements} empty={empty} render={achievements}/></section></>;
 else if(path==='/gallery')page=<>{heading('','Gallery','Browse photos and videos. Choose an album below.')}<section className="section wrap"><Gallery items={c.gallery} empty={empty}/></section></>;
 else if(path==='/calendar')page=<>{heading('','Event Calendar','Check class updates, grading dates, camps and tournaments.')}<section className="section wrap"><Calendar items={[...c.announcements,...c.tournaments.filter((t)=>t.status!=='draft').map((t)=>({...t,text:t.description}))]} empty={empty}/></section></>;
 else if(path==='/contact')page=<>{heading('','Contact',c.pages.contactText)}<section className="section wrap contact-grid"><div><h3>Club Contact Details</h3><div className="contact-row"><MapPin/><div><small>ADDRESS</small><p>{b.address||'Location details will be announced soon.'}</p></div></div>{b.phone&&<a className="contact-row" href={'tel:'+b.phone}><Phone/><div><small>CALL US</small><p>{b.phone}</p></div></a>}{b.email&&<a className="contact-row" href={'mailto:'+b.email}><Mail/><div><small>EMAIL US</small><p>{b.email}</p></div></a>}{b.whatsapp&&<a href={'https://wa.me/'+b.whatsapp.replace(/\D/g,'')} className="btn pale" target="_blank" rel="noreferrer">CHAT ON WHATSAPP <ArrowUpRight size={17}/></a>}{b.map&&<a href={b.map} className="text-link" target="_blank" rel="noreferrer">OPEN LOCATION MAP <MapPin size={17}/></a>}</div><div className="contact-form-card"><h3>Send us an enquiry</h3><Registration embedded config={{kind:'enquiry',title:'Enquiry'}} c={c} status={status} done={()=>setToast('Your enquiry has been received.')} /></div></section></>;
 else if(['/privacy','/terms','/refund'].includes(path))page=<>{heading('CLUB POLICIES',path==='/privacy'?'PRIVACY POLICY.':path==='/terms'?'TERMS & CONDITIONS.':'CANCELLATION & REFUNDS.')}<section className="wrap section policy"><ReadableCopy text={c.pages[path.slice(1)]} />{b.email&&<a href={'mailto:'+b.email}>{b.email}</a>}</section></>;
 else if(path==='/track-registration')page=<TrackRegistration/>;
 else if(path==='/staff'||path.startsWith('/staff/'))return <RegistrationPortal logo={b.logo}/>;
 else if(path==='/admin')return <><Admin c={c} setC={setC} admin={admin} passwordMode={passwordMode} owner={owner} status={status} go={go} toast={setToast}/>{toast&&<div role="status" className="toast"><Check size={17}/>{toast}<button onClick={()=>setToast('')}><X size={16}/></button></div>}</>;
 else page=<>{heading('','Page not found','Please check the link or return to Home.')}<div className="wrap section"><Link to="/" className="btn red">RETURN HOME <ArrowRight size={17}/></Link></div></>;
 return <NavigationContext.Provider value={go}><div className={'club-public rose-glass'+(b.useHeroPattern==='true'?' hero-pattern-theme':'')} style={themeStyles(b) as ContentStyle}>{path!=='/'&&header}<main>{page}</main><footer><div className="wrap footer-main"><div>{brand}<div className="socials">{b.instagram&&<a href={b.instagram} target="_blank" rel="noreferrer">INSTAGRAM ↗</a>}{b.facebook&&<a href={b.facebook} target="_blank" rel="noreferrer">FACEBOOK ↗</a>}</div></div><div><h4>THE CLUB</h4>{nav.slice(1,5).map(([name,to])=><Link key={to} to={to}>{name}</Link>)}</div><div><h4>Links</h4><Link to="/achievements">Achievements</Link><Link to="/gallery">Gallery</Link><Link to="/calendar">Event calendar</Link></div><div><h4>Contact</h4><p>{b.address||'Address not added yet.'}</p>{b.phone&&<a href={'tel:'+b.phone}>{b.phone}</a>}{b.email&&<a href={'mailto:'+b.email}>{b.email}</a>}<button className="text-link" onClick={()=>setModal({kind:'trial',title:'Book a trial class'})}>BOOK A TRIAL <ArrowUpRight size={16}/></button></div></div><div className="wrap footer-bottom"><span>© {new Date().getFullYear()} {b.name}. All rights reserved.</span><div><Link to="/privacy">Privacy</Link><Link to="/terms">Terms</Link><Link to="/refund">Refunds</Link></div></div></footer>{modal&&<div className="modal-backdrop" onClick={e=>{if(e.target===e.currentTarget)setModal(null)}}><section role="dialog" aria-modal="true" aria-labelledby="modal-title" data-focus-dialog className="modal">
   <div className="registration-modal-head">
     <h2 id="modal-title">{mobileModalTitle ? <><span className="desktop-label">{modal.title}</span><span className="mobile-label">{mobileModalTitle}</span></> : modal.title}</h2>
     <button type="button" className="close-modal" aria-label="Close registration" onClick={()=>setModal(null)}><X aria-hidden="true"/></button>
   </div>
   <div className="registration-modal-body">
     <Registration config={modal} c={c} status={status} done={()=>{}}/>
   </div>
 </section></div>}{toast&&<div role="status" className="toast"><Check size={17}/>{toast}<button onClick={()=>setToast('')}><X size={16}/></button></div>}</div></NavigationContext.Provider>
}
function AchievementList({items,empty,render}:{items:ClubEntry[];empty:(title:string,text:string)=>React.ReactNode;render:(items:ClubEntry[])=>React.ReactNode}){const [filter,setFilter]=useState('All');const options=['All',...new Set(items.map((x)=>x.medal).filter(Boolean))] as string[];return <><div className="filters">{options.map(x=><button key={x} className={filter===x?'selected':''} onClick={()=>setFilter(x)}>{x}</button>)}</div>{items.length?<div className="grid three results-grid">{render(items.filter((x)=>filter==='All'||x.medal===filter))}</div>:empty('No achievements listed','Student achievements and tournament results will be added here.')}</>}

function Calendar({items,empty}:{items:ClubEntry[];empty:(title:string,text:string)=>React.ReactNode}){const [month,setMonth]=useState('');const sorted=items.filter((x)=>!month||x.date?.startsWith(month)).sort((a,b)=>(a.date||'').localeCompare(b.date||''));return <><label className="calendar-filter">Filter by month <input type="month" value={month} onChange={e=>setMonth(e.target.value)}/><button className="text-link" onClick={()=>setMonth('')}>SHOW ALL</button></label>{sorted.length?sorted.map((x)=><article className="calendar-event" key={x.id}><CalendarDays/><div><small>{date(x.date)}{x.endDate&&' – '+date(x.endDate)}</small><h3>{x.title}</h3><ReadableCopy text={x.text} /></div></article>):empty('No events to show','Club events and announcements will appear here.')}</>}
function Registration({config,c,status,done}:{config:RegistrationConfig;c:ClubContent;status:ServiceStatus;done:()=>void;embedded?:boolean}){const [values,setValues]=useState<{name?:string;email?:string;phone?:string;target?:string;message?:string;website?:string;consent?:boolean}>({}),[submissionId,setSubmissionId]=useState(()=>crypto.randomUUID()),[submissionToken,setSubmissionToken]=useState(()=>crypto.randomUUID()),[answers,setAnswers]=useState<Record<string,string>>({}),[team,setTeam]=useState<TeamMember[]>([{name:'',age:'',belt:''}]),[busy,setBusy]=useState(false),[error,setError]=useState(''),[saved,setSaved]=useState<SavedRegistration|null>(null),[paid,setPaid]=useState(false),[receipt,setReceipt]=useState<Receipt|null>(null),[uploading,setUploading]=useState(false);const formId=['tournament','team'].includes(config.kind)?config.formId:config.kind==='trial'?c.branding.trialFormId:config.kind==='enquiry'?c.branding.enquiryFormId:undefined;const fields=c.forms.find((x)=>x.id===formId)?.fields||[];
 const tournament = ['tournament','team'].includes(config.kind)
   ? c.tournaments.find((item)=>item.id===config.target)
   : undefined;
 const [manualProof,setManualProof]=useState({transactionId:'',screenshot:''});
 const isManual=config.registrationChoice==='manual';
 const storageKey='ppc-registration:'+config.target+':'+config.kind+':'+config.registrationChoice;
 useEffect(()=>{let active=true;Promise.resolve().then(()=>{try{const previous=JSON.parse(localStorage.getItem(storageKey)||'null') as SavedRegistration|null;if(active&&previous?.id&&previous?.token&&!previous.previewOnly)setSaved(previous)}catch{}});return()=>{active=false}},[storageKey]);
 useEffect(()=>{if(saved&&!saved.previewOnly)try{localStorage.setItem(storageKey,JSON.stringify(saved));rememberRegistration(saved)}catch{}},[saved,storageKey]);
 useEffect(()=>{if(saved?.id&&!saved.previewOnly&&!saved.trackingCode)api('registration-status','POST',{id:saved.id,token:saved.token}).then(result=>setSaved((current)=>current?.id===saved.id?{...current,...result}:current)).catch(()=>{});},[saved?.id,saved?.token,saved?.previewOnly,saved?.trackingCode]);
 const unitFee = config.registrationChoice==='free' ? 0 : Number(tournament?.fee ?? 0);
 const participantCount = config.kind==='team' ? team.length : 1;
 const displayTotal = Math.round(unitFee * 100) * participantCount;
 const pay=async(r:SavedRegistration)=>{setBusy(true);setError('');try{const o=await api('order','POST',r);if(!window.Razorpay)await new Promise<void>((resolve,reject)=>{const s=document.createElement('script');s.src='https://checkout.razorpay.com/v1/checkout.js';s.onload=()=>resolve();s.onerror=()=>reject(new Error('Checkout could not load. Check your connection.'));document.body.appendChild(s)});if(!window.Razorpay)throw Error('Checkout could not load.');const checkout=new window.Razorpay({key:o.key,amount:o.amount,currency:'INR',order_id:o.orderId,name:c.branding.name,description:config.title,prefill:{name:o.name,email:o.email,contact:o.phone},theme:{color:c.branding.accent},handler:async(result)=>{try{const verified=await api('verify','POST',{...r,...result});if(verified.paid)setPaid(true);else setError(verified.message)}catch(e){setError(e instanceof Error?e.message:'Unable to complete the request.')}},modal:{ondismiss:()=>setBusy(false)}});checkout.on('payment.failed',()=>setError('Payment was not completed. You can try again.'));checkout.open()}catch(e){setError(e instanceof Error?e.message:'Unable to complete the request.')}finally{setBusy(false)}};
 async function submit(e:React.FormEvent){e.preventDefault();setBusy(true);setError('');try{if(isManual&&!manualProof.transactionId.trim()&&!manualProof.screenshot)throw new Error('Enter a transaction ID or upload a payment screenshot.');const payload={...values,email:values.email||'',answers,team,manualProof,expectedAmount:displayTotal,...config,target:values.target||config.target||'',id:saved?.id||submissionId,token:saved?.token||submissionToken};const result=await api('register','POST',payload);const record={...result,id:payload.id,token:payload.token};setSaved(record);done();if(!result.previewOnly&&result.paymentMethod!=='manual'&&result.amount>0&&status.payments&&result.amount===displayTotal)await pay(record)}catch(e){setError(e instanceof Error?e.message:'Unable to complete the request.')}finally{setBusy(false)}}
 const upload=async(field:string,file:File)=>{if(c.branding.previewOnly==='true'){setAnswers((a)=>({...a,[field]:'file-selected'}));return;}setUploading(true);setError('');try{const f=new FormData();f.append('file',file);f.append('registrationToken',saved?.token||submissionToken);const r=await api('upload','POST',f);if(field==='manual-payment')setManualProof(current=>({...current,screenshot:r.url}));else setAnswers((a)=>({...a,[field]:r.url}))}catch(e){setError(e instanceof Error?e.message:'Unable to complete the request.')}finally{setUploading(false)}};
 async function openReceipt(){
   if(!saved)return;
   setBusy(true);
   setError('');
   try{
     setReceipt(await api(saved.serial?'registration-confirmation':'receipt','POST',{id:saved.id,token:saved.token}));
     if(!saved.serial)setPaid(true);
   }catch(e){setError(e instanceof Error?e.message:'Unable to complete the request.');}
   finally{setBusy(false);}
 }
 if(receipt)return <PaymentReceipt confirmation={!!saved?.serial} logo={c.branding.logo} receipt={receipt} onClose={()=>setReceipt(null)}/>;
 if(saved?.previewOnly)return <div className="success-panel" role="status"><h3>Form completed</h3><p>No registration was saved or payment collected.</p></div>;
 if(saved)return <div className="success-panel">
   <span className="success-icon"><Check/></span>
   <h3>{paid||saved.paymentStatus==='paid'?'Payment confirmed':saved.paymentMethod==='manual'?'Registration submitted':'Your request is received'}</h3>
   <p>{saved.paymentMethod==='manual'&&saved.paymentStatus!=='paid'?'Your payment proof is awaiting verification by the club. Keep this reference.':'The club will review your registration details.'}</p>
   <small>{saved.registrationNumber?'REGISTRATION NUMBER':'REFERENCE'}</small><code>{saved.registrationNumber||saved.id}</code>
   {saved.trackingCode&&<><CopyValue label="Registration number" value={saved.registrationNumber||saved.id}/><CopyValue label="Tracking code" value={saved.trackingCode}/><p>Keep both values safe. Your private code grants access to this registration from another device.</p></>}
   <DownloadRegistration auth={{id:saved.id,token:saved.token}}/>
   <a className="btn pale" href={'/track-registration?number='+encodeURIComponent(saved.registrationNumber||'')}>Track this registration</a>
   {saved.serial&&<button type="button" className="btn pale" disabled={busy} onClick={openReceipt}>View registration confirmation</button>}
   {saved.amount>0&&saved.paymentMethod!=='manual'&&<button type="button" className="btn pale" disabled={busy} onClick={openReceipt}>{paid?'View payment receipt':'Check payment / Get receipt'}</button>}
   {saved.amount>0&&saved.paymentMethod!=='manual'&&!paid&&<>
     <p>Amount due <b>{fmt(saved.amount/100)}</b></p>
     {status.payments?<button className="btn red" disabled={busy} onClick={()=>pay(saved)}>{busy?'Preparing…':'Pay securely'} <CreditCard size={17}/></button>:<p className="fine">Online payments are not connected yet. Please contact the club to complete payment.</p>}
   </>}
   {saved.paymentMethod==='manual'&&<>
     <p role="status">{saved.paymentStatus==='paid'?'Payment verified':saved.paymentStatus==='manual_rejected'?'Payment proof needs correction':'Awaiting payment verification'}</p>
     {saved.reviewNote&&<p>{saved.reviewNote}</p>}
     <button type="button" className="btn pale" disabled={busy} onClick={async()=>{
       setBusy(true);setError('');try{const result=await api('registration-status','POST',saved);setSaved({...saved,...result});setPaid(Boolean(result.receiptAvailable))}catch(e){setError(e instanceof Error?e.message:'Unable to complete the request.')}finally{setBusy(false)}
     }}>Refresh payment status</button>
     {saved.paymentStatus==='paid'&&<button type="button" className="btn red" disabled={busy} onClick={openReceipt}>View payment receipt</button>}
     {saved.paymentStatus==='manual_rejected'&&<>
       <ManualPaymentFields event={tournament||{}} proof={manualProof} onChange={setManualProof} onUpload={file=>upload('manual-payment',file)} uploading={uploading}/>
       <button type="button" className="btn red" disabled={busy||uploading} onClick={async()=>{
         setBusy(true);setError('');try{const result=await api('manual-proof','POST',{id:saved.id,token:saved.token,manualProof});setSaved({...saved,...result,reviewNote:''});}catch(e){setError(e instanceof Error?e.message:'Unable to complete the request.')}finally{setBusy(false)}
       }}>Resubmit payment proof</button>
     </>}
   </>}
   <button type="button" className="text-link" disabled={busy||uploading} onClick={()=>{
     if(!window.confirm('Save your registration number and private tracking code, or download the PDF, before starting another registration. Continue?'))return;
     try{rememberRegistration(saved);localStorage.removeItem(storageKey)}catch{}
     setSaved(null);setPaid(false);setReceipt(null);setError('');setValues({});setAnswers({});
     setTeam([{name:'',age:'',belt:''}]);setManualProof({transactionId:'',screenshot:''});
     setSubmissionId(crypto.randomUUID());setSubmissionToken(crypto.randomUUID());
   }}>Start another registration</button>
   {error&&<p className="error" role="alert">{error}</p>}
 </div>;
 const isTeam=config.kind==='team';
 const paymentWillOpen=!isManual&&status.payments&&displayTotal>0;
 const submitAction=isManual?'Submit registration & payment proof':paymentWillOpen?'Continue to payment':tournament?'Submit registration':config.kind==='enquiry'?'Send enquiry':'Submit request';
 const submitLabel=busy?'Submitting…':uploading?'Uploading…':submitAction;
 return (
   <form className="registration-form" onSubmit={submit}>
     {tournament&&(
       <div className="checkout-summary" aria-live="polite">
         <div>
           <strong>Tournament entry fee</strong>
           <small>{isTeam?`${config.title} · ${fmt(unitFee)} × ${participantCount}`:config.title}</small>
         </div>
         <strong>{displayTotal?fmt(displayTotal/100):'Free'}</strong>
       </div>
     )}
     <div className="form-grid">
       <label>{isTeam?'Team contact name':'Full name'}<input required maxLength={120} autoComplete="name" value={values.name||''} onChange={e=>setValues({...values,name:e.target.value})} placeholder="Your full name"/></label>
       <label>{tournament?.previewEmailOptional?'Email address (optional)':'Email address'}<input required={!tournament?.previewEmailOptional} type="email" inputMode="email" autoCapitalize="none" autoCorrect="off" spellCheck={false} maxLength={254} autoComplete="email" value={values.email||''} onChange={e=>setValues({...values,email:normaliseRegistrationEmail(e.target.value)})} placeholder="you@example.com"/></label>
       <label>Phone number<IndianMobileInput required value={values.phone||''} onChange={phone=>setValues({...values,phone})}/></label>
       {config.kind==='trial'&&(
         <label>Preferred program
           <select value={values.target||config.target||''} onChange={e=>setValues({...values,target:e.target.value})}>
             <option value="">Help me choose</option>
             {c.training.map((p)=><option value={p.id} key={p.id}>{p.title}</option>)}
           </select>
         </label>
       )}
       {fields.map((f)=>(
         <label key={f.id}>{f.label}{f.required?' *':''}
           {f.type==='select'?(
             <select required={f.required} value={answers[f.id]||''} onChange={e=>setAnswers({...answers,[f.id]:e.target.value})}>
               <option value="">Select an option</option>
               {String(f.options||'').split(',').map((o:string)=><option key={o}>{o.trim()}</option>)}
             </select>
           ):['file','photo','masked_aadhaar'].includes(f.type)?(
             <>
               <input type="file" accept={f.type==='photo'?'image/png,image/jpeg,image/webp':'image/png,image/jpeg,image/webp,application/pdf'} required={f.required&&!answers[f.id]} onChange={e=>e.target.files?.[0]&&upload(f.id,e.target.files[0])}/>
               <small>{answers[f.id]?'File uploaded.':f.type==='photo'?'PNG, JPG or WebP · max 8 MB':'PNG, JPG, WebP or PDF · max 8 MB'}</small>
               {f.type==='masked_aadhaar'&&<small>Upload only Masked Aadhaar. The first eight digits must be hidden before uploading.</small>}
             </>
           ):f.type==='tel'?<IndianMobileInput label={f.label} required={f.required} value={answers[f.id]||''} onChange={phone=>setAnswers({...answers,[f.id]:phone})}/>:<input required={f.required} type={f.type||'text'} maxLength={500} value={answers[f.id]||''} onChange={e=>setAnswers({...answers,[f.id]:f.type==='email'?normaliseRegistrationEmail(e.target.value):e.target.value})}/>}
         </label>
       ))}
     </div>
     {isTeam&&(
       <div className="team-fields">
         <h4>Team participants</h4>
         {team.map((member,i)=>(
           <div className="team-row" key={i}>
             <span><span className="mobile-label">Participant </span>{i+1}</span>
             {Object.entries({name:'Participant name',age:'Age',belt:'Belt'}).map(([key,label])=>(
               <label key={key}>
                 <span className="mobile-label">{label}</span>
                 <input required aria-label={`Participant ${i+1} ${key}`} placeholder={label} type={key==='age'?'number':'text'} min={1}
                   value={member[key as keyof TeamMember]} onChange={e=>setTeam(team.map((entry,index)=>index===i?{...entry,[key]:e.target.value}:entry))}/>
               </label>
             ))}
             <button type="button" aria-label={`Remove participant ${i+1}`} disabled={team.length===1}
               onClick={()=>setTeam(team.filter((_,index)=>index!==i))}><X size={16} aria-hidden="true"/></button>
           </div>
         ))}
         <button type="button" disabled={team.length>=50} className="text-link" onClick={()=>setTeam([...team,{name:'',age:'',belt:''}])}>
           <Plus size={15} aria-hidden="true"/> Add participant
         </button>
       </div>
     )}
     {isManual&&<ManualPaymentFields event={tournament||{}} proof={manualProof} onChange={setManualProof} onUpload={file=>upload('manual-payment',file)} uploading={uploading}/>}
     <label>Message / additional details<textarea rows={3} maxLength={5000} placeholder="Tell us how we can help…" value={values.message||''} onChange={e=>setValues({...values,message:e.target.value})}/></label>
     <div className="honeypot" aria-hidden="true"><label>Website<input tabIndex={-1} autoComplete="off" value={values.website||''} onChange={e=>setValues({...values,website:e.target.value})}/></label></div>
     <label className="check-label"><input required type="checkbox" checked={!!values.consent} onChange={e=>setValues({...values,consent:e.target.checked})}/><span>I agree to the <a href="/privacy" target="_blank">privacy policy</a> and <a href="/terms" target="_blank">club terms</a>.</span></label>
     {error&&<div className="error" role="alert">{error}</div>}
     <button disabled={busy||uploading} className="btn red form-submit" type="submit">
       {(busy||uploading)&&<Loader2 className="spin" size={17} aria-hidden="true"/>}
       {submitLabel}<ArrowUpRight size={16} aria-hidden="true"/>
     </button>
     <p className="fine">Your details are shared only with the club. {tournament&&'Any applicable fee is shown before checkout.'}</p>
   </form>
 );
}
function Admin({c,setC,admin,passwordMode,owner,status:initialStatus,go,toast}:{c:ClubContent;setC:React.Dispatch<React.SetStateAction<ClubContent>>;admin:boolean;passwordMode:boolean;owner:boolean;status:ServiceStatus;go:(to:string)=>void;toast:(text:string)=>void}){const [status,setServiceStatus]=useState(initialStatus);const [mobileMenu,setMobileMenu]=useState(false);const [section,setSection]=useState<ContentSection|'overview'|'requests'|'login-accounts'|'integrations'|'audit'>(()=>typeof window!=='undefined'&&new URLSearchParams(window.location.search).get('practice')==='filters'?'requests':'overview'),[draft,setDraft]=useState<Record<string,string>|EditableItem[]|null>(null),[records,setRecords]=useState<ReviewRecord[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState(''),[editing,setEditing]=useState<ReviewRecord|string|null>(null),[logs,setLogs]=useState<AuditEntry[]>([]),[outbox,setOutbox]=useState<OutboxEntry[]>([]),[remove,setRemove]=useState(false),[unsaved,setUnsaved]=useState(false);
 const [summary,setSummary]=useState({total:0,awaiting:0,paidAmount:0});
 const sections=[['overview','Overview',LayoutDashboard],['requests','Registrations & enquiries',Users],...(owner?[['login-accounts','Login accounts',Shield]]:[]),['branding','Brand & homepage',Settings],['pages','Page content',FileText],['masters','Masters & coaches',Users],['training','Training programs',Target],['tournaments','Tournaments',Trophy],['forms','Form builder',FileText],['achievements','Achievements & results',Trophy],['gallery','Photo & video gallery',ImageIcon],['announcements','Announcements & calendar',CalendarDays],['integrations','Integrations & system',Activity]] as [typeof section,string,LucideIcon][];
 useEffect(()=>{if(admin){api('status').then(setServiceStatus).catch(()=>{});api('requests-summary').then(result=>{setRecords(result.rows);setSummary(result);}).catch(e=>setError(e instanceof Error?e.message:'Unable to complete the request.'));api('audit').then(setLogs).catch(()=>{});api('outbox').then(setOutbox).catch(()=>{})}},[admin]);
 useEffect(()=>{const fn=(e:BeforeUnloadEvent)=>{if(unsaved){e.preventDefault();e.returnValue=''}};window.addEventListener('beforeunload',fn);return()=>window.removeEventListener('beforeunload',fn)},[unsaved]);
 const change=(key:typeof section)=>{if(unsaved&&!window.confirm('Discard unsaved changes?'))return;setMobileMenu(false);setSection(key);setDraft(key in c?structuredClone(c[key as ContentSection]) as Record<string,string>|EditableItem[]:null);setEditing(null);setError('');setUnsaved(false)};
 const update=(val:Record<string,string>|EditableItem[])=>{setDraft(val);setUnsaved(true)};
 const save=async()=>{setBusy(true);setError('');try{await api('content','PUT',{key:section,value:draft});setC({...c,[section]:structuredClone(draft)} as ClubContent);setUnsaved(false);toast('Changes published to the website.')}catch(e){setError(e instanceof Error?e.message:'Unable to complete the request.')}finally{setBusy(false)}};
 const upload=async(file:File,callback:(url:string)=>void,removeBackground=remove)=>{setBusy(true);setError('');try{const f=new FormData();if(file.size>8*1024*1024)throw new Error('Choose an image under 8 MB');const bitmap=await createImageBitmap(file);const canvas=document.createElement('canvas');const ratio=Math.min(1,2200/Math.max(bitmap.width,bitmap.height));canvas.width=Math.round(bitmap.width*ratio);canvas.height=Math.round(bitmap.height*ratio);canvas.getContext('2d')!.drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();const optimized=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('Image optimisation failed')),'image/webp',removeBackground===false?1:.88));f.append('file',optimized,'image.webp');f.append('scope','public');f.append('remove',String(removeBackground));const result=await api('upload','POST',f);callback(result.url);toast('Image uploaded. Save changes to publish it.')}catch(e){setError(e instanceof Error?e.message:'Unable to complete the request.')}finally{setBusy(false)}};
 const editorField=(key:string,value:unknown,onChange:(v:unknown)=>void)=><label key={key}>{fieldLabels[key]||(key==='hero'?'Hero foreground photo':key.replace(/([A-Z])/g,' $1')).replace(/^./,s=>s.toUpperCase())}{key==='registrationMode'?<select value={typeof value==='string'||typeof value==='number'?value:''} onChange={e=>onChange(e.target.value)}>
  <option value="auto">Automatic (based on fee)</option>
  <option value="paid">Paid registration only</option>
  <option value="free">Without payment only</option>
  <option value="both">Paid and without payment</option>
  <option value="manual">UPI QR payment only</option>
  <option value="disabled">Disable registrations</option>
</select>:key==='status'?<select value={typeof value==='string'||typeof value==='number'?value:''} onChange={e=>onChange(e.target.value)}>{['draft','open','closed'].map(x=><option key={x}>{x}</option>)}</select>:(key==='formId'||key.endsWith('FormId'))?<select value={typeof value==='string'||typeof value==='number'?value:''} onChange={e=>onChange(e.target.value)}><option value="">Basic contact fields only</option>{c.forms.map((f)=><option value={f.id} key={f.id}>{f.title}</option>)}</select>:key==='type'?<select value={typeof value==='string'||typeof value==='number'?value:''} onChange={e=>onChange(e.target.value)}><option value="photo">Photo</option><option value="video">Video link</option></select>:typeof value==='boolean'?<input type="checkbox" checked={value} onChange={e=>onChange(e.target.checked)}/>:['description','about','aboutText','heroText','mission','values','rules','eligibility','categories','privacy','terms','refund','contactText','heroTitle','aboutTitle','text','receiptNote'].includes(key)?<><textarea rows={4} value={typeof value==='string'||typeof value==='number'?value:''} onChange={e=>onChange(e.target.value)}/>{['announcement','text','rules','eligibility','categories','description','about','mission','values','privacy','terms','refund'].includes(key)&&<small>New line for each point. Start with - for a bullet. Use **text** to highlight key words.</small>}</>:<input type={['fee','amount','capacity'].includes(key)?'number':['date','deadline','endDate'].includes(key)?'date':key==='accent'?'color':'text'} min={0} value={typeof value==='string'||typeof value==='number'?value:''} onChange={e=>onChange(['fee','amount','capacity'].includes(key)?Number(e.target.value):e.target.value)}/ >}{['logo','hero','image','manualQrImage'].includes(key)&&<><div className="upload-field">{typeof value==='string'&&value&&(key!=='hero'||selectedHeroPhoto(value))&&<AssetImage src={value} alt="Current upload"/>}<label className="upload-button"><Upload size={16}/> UPLOAD IMAGE<input type="file" accept="image/png,image/jpeg,image/webp" onChange={e=>e.target.files?.[0]&&upload(e.target.files[0],onChange,key==='manualQrImage'?false:remove)}/></label></div><small>PNG, JPG, WebP · max 8 MB. Transparent PNGs blend best.</small></>}{key==='hero'&&<button type="button" className="btn pale" disabled={!value} onClick={()=>onChange('')}>Remove foreground photo</button>}{key==='url'&&section==='gallery'&&<label className="upload-button"><Upload size={16}/> UPLOAD PHOTO<input type="file" accept="image/png,image/jpeg,image/webp" onChange={e=>e.target.files?.[0]&&upload(e.target.files[0],onChange)}/></label>}</label>;
 if(!admin)return <PortalLogin role="admin" passwordMode={Boolean(passwordMode)} logo={c.branding.logo}/>;
 return <div className="admin-shell"><aside className="admin-sidebar" data-menu-open={mobileMenu}><NextLink href="/" className="admin-brand" onClick={e=>{e.preventDefault();go('/')}}><ClubMark logo={c.branding.logo}/><span>{c.branding.name}<small>ADMIN PANEL</small></span></NextLink><button className="admin-menu-toggle" type="button" aria-expanded={mobileMenu} aria-controls="admin-section-nav" onClick={()=>setMobileMenu(value=>!value)}>{mobileMenu?<X size={19}/>:<Menu size={19}/>} Menu</button><span className="sidebar-label">WORKSPACE</span><nav id="admin-section-nav" aria-label="Admin sections">{sections.map(([key,label,Icon])=><button key={key} onClick={()=>change(key as typeof section)} className={section===key?'active':''} aria-current={section===key?'page':undefined}><Icon size={17}/>{label}{key==='requests'&&summary.awaiting>0&&<b>{summary.awaiting}</b>}</button>)}</nav><div className="sidebar-bottom"><button onClick={()=>go('/')}><ExternalLink size={16}/>View website</button>{passwordMode?<PasswordSignOut to="/admin"/>:<NextLink href="/signout-with-chatgpt?return_to=%2F" target="_top"><LogOut size={16}/>Sign out</NextLink>}<div className="owner-badge"><span>A</span><div>Club administrator<small>OWNER ACCESS</small></div><Shield size={15}/></div></div></aside><main className="admin-main"><header className="admin-top"><span><small>POWER PUNCH CLUB</small> / {sections.find(x=>x[0]===section)?.[1]}</span><div><span className="live-dot"/> WEBSITE CONNECTED</div></header><div className="admin-content"><div className="admin-title"><div><span className="eyebrow">ADMIN PANEL</span><h1>{sections.find(x=>x[0]===section)?.[1]}</h1><p>{section==='overview'?'View registrations, enquiries and payments.':section==='requests'?'Review requests, manage approvals and follow up.':'Edit the details below, then select Save Changes.'}</p></div>{draft&&<button className="btn red" disabled={busy||!unsaved} onClick={save}>{busy?<Loader2 className="spin" size={17}/>:<Check size={17}/>}SAVE CHANGES</button>}</div>{error&&<div className="error" role="alert">{error}</div>}
 {section==='login-accounts'&&owner&&<LoginAccounts/>}
 {section==='overview'&&<>{!status.email&&<EmailConfiguration status={status}/>}<div className="stat-grid">{([[summary.total,'TOTAL REQUESTS',Users],[summary.awaiting,'AWAITING REVIEW',Clock],[summary.paidAmount/100,'PAYMENTS RECEIVED',CreditCard],[c.tournaments.filter((t)=>t.status==='open').length,'OPEN TOURNAMENTS',Trophy]] as [number,string,LucideIcon][]).map(([v,label,Icon],i)=><article className="stat-card" key={label}><div><span>{label}</span><Icon size={19}/></div><strong>{i===2?fmt(v):v}</strong><small>{i===2?'Verified payments':'Live club data'}</small></article>)}</div><div className="admin-two-col"><section className="admin-panel"><div className="panel-heading"><h3>Recent requests</h3><button className="text-link" onClick={()=>change('requests')}>VIEW ALL <ArrowUpRight size={14}/></button></div>{records.slice(0,5).map(r=><div className="recent-row" key={r.id}><span className="avatar">{r.name[0]}</span><div><b>{r.name}</b><small>{r.kind} · {date(r.created)}</small></div><span className={'badge '+(r.status==='approved'?'green':'')}>{r.status}</span></div>)}{!records.length&&<div className="admin-empty"><Users/><h3>No requests received</h3><p>Registrations and enquiries will appear as they arrive.</p><button className="text-link" onClick={()=>go('/contact')}>VIEW ENQUIRY FORM <ArrowUpRight size={14}/></button></div>}</section><section className="admin-panel"><h3>Website Settings</h3><p className="fine">Start with the essentials, then share your story.</p>{[['branding','Upload your logo & hero photo','Update the logo and homepage image.'],['masters','Introduce your masters','Add coach profiles and qualifications.'],['tournaments','Publish a tournament','Add event details and registration fees.']].map(([key,title,desc])=><button className="quick-action" key={key} onClick={()=>change(key as typeof section)}><span><b>{title}</b><small>{desc}</small></span><ArrowUpRight size={18}/></button>)}</section></div><section className="admin-panel system-strip"><div><Shield/><b>Single administrator access</b><small>Protected server-side permissions</small></div><div><CreditCard/><b>{status.payments?'Razorpay connected':'Razorpay setup pending'}</b><small>{status.payments?'Ready for payment testing':'Add credentials before accepting payments'}</small></div><div><Mail/><b>{status.email?'Brevo email configured':'Brevo email setup required'}</b><small>{outbox.filter(x=>x.status==='pending').length} notifications waiting</small></div></section></>}
 {section==='requests'&&<RegistrationReports content={c} onChanged={()=>api('requests-summary').then(result=>{setRecords(result.rows);setSummary(result);}).catch(()=>{})}/>}
 {['branding','pages'].includes(section)&&draft&&!Array.isArray(draft)&&<section className="admin-panel"><div className="editor-note"><ImageIcon size={20}/><div><b>{section==='branding'?'Your visual identity':'Page Content'}</b><p>{section==='branding'?'Hero photos use an edge fade, tonal overlay and adjustable focal point. Transparent images blend directly into the composition.':'Update the text displayed on public pages, including club policies.'}</p></div></div>{section==='branding'&&<label className="check-label"><input type="checkbox" checked={remove} onChange={e=>setRemove(e.target.checked)}/><span>Remove background on image upload {status.backgroundRemoval?'':'(service key required)'}</span></label>}<div className="editor-grid">{Object.entries(draft).filter(([key])=>!(key in themeDefaults)&&!['heroBackdropMode','heroBackdrop','useHeroPattern','previewOnly'].includes(key)).map(([key,value])=>editorField(key,value,v=>update({...draft,[key]:String(v)})))}</div>{section==='branding'&&<fieldset className="theme-editor"><legend>Website theme</legend><div className="editor-grid">{themeFields.filter(([key])=>key!=='themeHero').map(([key,label,,fallback])=><label key={key}>{label}<input type="color" value={draft[key]||fallback} onChange={e=>update({...draft,[key]:e.target.value})}/></label>)}</div><button type="button" className="btn pale" onClick={()=>update({...draft,...themeDefaults})}>Reset theme colours</button></fieldset>}{section==='branding'&&<fieldset className="theme-editor">
  <legend>Hero banner background</legend>
  <label className="check-label">
    <input type="checkbox" checked={draft.useHeroPattern==='true'} onChange={e=>update({...draft,useHeroPattern:String(e.target.checked)})}/>
    Use purple hero pattern on cards and footer
  </label>
  <div className="editor-grid">
    <label>Background type
      <select value={draft.heroBackdropMode} onChange={e=>update({...draft,heroBackdropMode:e.target.value})}>
        <option value="photo">Background photo</option>
        <option value="colour">Solid colour</option>
      </select>
    </label>
    {draft.heroBackdropMode==='colour'&&<label>Banner background colour
      <input type="color" value={draft.themeHero||themeDefaults.themeHero} onChange={e=>update({...draft,themeHero:e.target.value})}/>
    </label>}
    {draft.heroBackdropMode==='photo'&&<label>Upload background photo
      <input type="file" accept="image/png,image/jpeg,image/webp" disabled={busy} onChange={e=>{
        const file=e.target.files?.[0];
        e.target.value='';
        if(!file)return;
        void upload(file,url=>{
          setDraft((current)=>({...current,heroBackdrop:url,heroBackdropMode:'photo'}));
          setUnsaved(true);
        },false);
      }}/>
      <small>PNG, JPG or WebP. Use a landscape image.</small>
    </label>}
  </div>

</fieldset>}</section>}
 {Array.isArray(draft)&&<><div className="collection-toolbar"><p>{draft.length} {section==='forms'?'forms':'items'} · {unsaved?'Unsaved changes':'All changes saved'}</p><button className="btn black" onClick={()=>{const item={id:crypto.randomUUID(),...structuredClone(templates[section as CollectionSection])};update([...draft,item]);setEditing(item.id)}}><Plus size={17}/>ADD {section==='forms'?'FORM':'ITEM'}</button></div>{!draft.length&&<div className="admin-panel admin-empty"><Plus/><h3>No items added</h3><p>Add your first item using the button above.</p></div>}{draft.map((item,i:number)=><section className="admin-panel item-editor" key={item.id}><div className="item-summary"><button className="item-toggle" onClick={()=>setEditing(editing===item.id?null:item.id)}><span className="item-number">{String(i+1).padStart(2,'0')}</span><span><b>{item.title||item.name||'Untitled '+section.replace(/s$/,'')}</b><small>{String(item.subtitle||item.rank||item.status||'Click to edit')}</small></span><ChevronRight size={18} className={editing===item.id?'rotate':''}/></button><button className="icon-button" aria-label="Move item up" disabled={i===0} onClick={()=>{const next=[...draft];[next[i-1],next[i]]=[next[i],next[i-1]];update(next)}}>↑</button><button className="icon-button danger" aria-label="Delete item" onClick={()=>{if(window.confirm('Delete this item? Save changes to publish the deletion.'))update(draft.filter((x)=>x.id!==item.id))}}><Trash2 size={17}/></button></div>{editing===item.id&&<div className="item-body"><div className="editor-grid">{Object.entries(section==='tournaments'?{registrationMode:'auto',manualPaymentEnabled:false,manualQrImage:'',manualPayee:'',manualUpiId:'',manualInstructions:'',registrationPrefix:c.branding.registrationPrefix||'PPC',registrationSuffix:c.branding.registrationSuffix||'',receiptHeading:'',confirmationHeading:'',receiptNote:'',...item}:item).filter(([k])=>!['id','fields'].includes(k)).map(([key,value])=>editorField(key,value,v=>update(draft.map((x)=>x.id===item.id?{...x,[key]:v}:x))))}</div>{section==='forms'&&<FormBuilder fields={item.fields||[]} change={(fields:FormField[])=>update(draft.map((x)=>x.id===item.id?{...x,fields}:x))}/>}<small className="record-id">RECORD ID: {item.id}</small></div>}</section>)}</>}
 {section==='integrations'&&<><EmailConfiguration status={status}/><div className="admin-panel"><h3>Connected services</h3><p className="fine">Credentials are configured securely in server environment settings. Secret keys never enter the browser.</p>{[['Razorpay',status.payments,'RAZORPAY_KEY_ID · RAZORPAY_KEY_SECRET · RAZORPAY_WEBHOOK_SECRET'],['Brevo transactional email (Admin only)',status.email,'BREVO_API_KEY / EMAIL_FROM_ADDRESS / EMAIL_FROM_NAME / ADMIN_NOTIFICATION_EMAIL'],['Automatic background removal',status.backgroundRemoval,'REMOVEBG_API_KEY']].map(([title,connected,keys])=><div className="integration-row" key={String(title)}><div><b>{title}</b><small>{keys}</small></div><span className={'badge '+(connected?'green':'')}>{connected?(String(title).startsWith('Brevo')?'CONFIGURED':'CONNECTED'):'SETUP REQUIRED'}</span></div>)}<div className="sample-note">Public launch requires final club details, payment testing, domain setup and a load test against the intended infrastructure. Registrations and uploaded files use MongoDB.</div></div><div className="admin-panel"><div className="panel-heading"><h3>Email delivery queue</h3><button className="btn pale" disabled={busy||!status.email} onClick={async()=>{setBusy(true);try{const result=await api('outbox','POST',{});setOutbox(await api('outbox'));setServiceStatus(await api('status'));toast(`${result.accepted} accepted by Brevo; ${result.skipped} blocked historical messages skipped.`)}catch(e){setError(e instanceof Error?e.message:'Unable to complete the request.')}finally{setBusy(false)}}}>RETRY PENDING <ArrowRight size={15}/></button></div>{outbox.map(r=><div className="recent-row" key={r.id}><Mail size={18}/><div><b>{r.subject}</b><small>{r.recipientLabel||'Club administrator'} / {date(r.created)}{r.providerMessageId&&<> / Brevo ID: {r.providerMessageId}</>}{(r.skipReason||r.lastError)&&<span style={{display:'block',whiteSpace:'normal'}}>{r.skipReason||r.lastError}</span>}{r.nextAttemptAt&&<span style={{display:'block'}}>Retry after {new Date(r.nextAttemptAt).toLocaleString('en-IN')}</span>}</small></div><span className={'badge '+(r.status==='accepted'?'green':'')}>{r.status==='accepted'?'Accepted by Brevo (delivery unconfirmed)':r.status==='sent'?'Historical provider submission':r.status}</span></div>)}{!outbox.length&&<p className="fine">No notifications yet.</p>}</div><div className="admin-panel"><h3>Activity log</h3>{logs.map(r=><div className="recent-row" key={r.id}><Activity size={17}/><div><b>{r.action}</b><small>{r.actor} · {new Date(r.created).toLocaleString('en-IN')}</small></div></div>)}{!logs.length&&<p className="fine">Content and request updates appear here.</p>}</div></>}
 </div><div className="admin-foot">POWER PUNCH CLUB <span>WEBSITE ADMIN</span></div></main></div>
}
function FormBuilder({fields,change}:{fields:FormField[];change:(fields:FormField[])=>void}){return <div className="form-builder"><h3>Custom registration questions</h3><p className="fine">Name, email, phone and consent are included automatically. Additional fields apply to the registration contact; team participant name, age and belt are collected separately.</p>{fields.map((f,i:number)=><div className="builder-row" key={f.id}><Grip size={16}/><label>Question label<input value={f.label} onChange={e=>change(fields.map((x)=>x.id===f.id?{...x,label:e.target.value}:x))}/></label><label>Field type<select value={f.type} onChange={e=>change(fields.map((x)=>x.id===f.id?{...x,type:e.target.value}:x))}>{[['text','Text'],['number','Number'],['email','Email'],['tel','Contact phone'],['date','Date'],['select','Dropdown'],['photo','Student photo upload'],['file','Document upload'],['masked_aadhaar','Masked Aadhaar upload']].map(([value,label])=><option key={value} value={typeof value==='string'||typeof value==='number'?value:''}>{label}</option>)}</select></label>{f.type==='select'&&<label>Options (comma separated)<input value={f.options||''} onChange={e=>change(fields.map((x)=>x.id===f.id?{...x,options:e.target.value}:x))}/></label>}<label className="check-label"><input type="checkbox" checked={f.required} onChange={e=>change(fields.map((x)=>x.id===f.id?{...x,required:e.target.checked}:x))}/>Required</label>{!['file','photo','masked_aadhaar'].includes(f.type)&&<label className="check-label"><input type="checkbox" checked={f.showOnReceipt!==false} onChange={e=>change(fields.map((x)=>x.id===f.id?{...x,showOnReceipt:e.target.checked}:x))}/>Show on receipt</label>}{f.type==='file'&&<label className="check-label"><input type="checkbox" checked={f.staffDownload===true} onChange={e=>change(fields.map((x)=>x.id===f.id?{...x,staffDownload:e.target.checked}:x))}/>Allow staff to download this document</label>}<button className="icon-button" disabled={!i} aria-label="Move field up" onClick={()=>{const n=[...fields];[n[i-1],n[i]]=[n[i],n[i-1]];change(n)}}>↑</button><button className="icon-button danger" aria-label="Delete field" onClick={()=>change(fields.filter((x)=>x.id!==f.id))}><Trash2 size={16}/></button></div>)}<button className="btn pale" onClick={()=>change([...fields,{id:crypto.randomUUID(),label:'New question',type:'text',required:false,options:''}])}><Plus size={17}/>ADD QUESTION</button></div>}
