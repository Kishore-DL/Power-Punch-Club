'use client';
import {useEffect,useLayoutEffect,useRef,useState} from 'react';
import type {ClubContent} from '../lib/club-types';
import type {ExportStatus,ReportCatalog,ReportField,ReportFilter,ReportPage,ReportPreset,ReportQuery} from '../lib/report-types';
import RequestReview,{type ReviewRecord} from './request-review';
import './registration-reports.css';

const initial:ReportQuery={target:'',search:'',view:'participants',filters:[],columns:[],sort:{field:'system:status',direction:'asc'},page:1,pageSize:25};
function forTournament(target:string,catalog:ReportCatalog):ReportQuery{
 const columns=catalog.fields.filter(field=>field.exportable).slice(0,5).map(field=>field.id);
 if(!columns.includes('system:status'))columns.push('system:status');
 return {...initial,target,columns,sort:{field:columns[0]||'system:status',direction:'asc'}};
}
function mobileScroll(target:HTMLElement){
 if(!window.matchMedia('(max-width: 767px)').matches)return;
 target.scrollIntoView({block:'start',behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});
 if(target.hasAttribute('tabindex'))target.focus({preventScroll:true});
}
async function request<T>(path:string,method='GET',body?:unknown,signal?:AbortSignal):Promise<T>{
 const response=await fetch('/api/admin/reports/'+path,{method,headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined,signal,cache:'no-store'});
 if(!response.headers.get('content-type')?.includes('application/json'))throw Error('Unable to load the report. Sign in again and retry.');
 const value=await response.json() as {error?:string};if(!response.ok)throw Error(response.status===401||response.status===403?'Session expired or Admin access required. Please sign in again.':value.error||'Unable to complete the report request.');return value as T;
}
function Values({field,filter,target,onChange}:{field:ReportField;filter:ReportFilter;target:string;onChange:(filter:ReportFilter)=>void}){
 const [search,setSearch]=useState(''),[options,setOptions]=useState<{value:string;label:string}[]>([]),[error,setError]=useState(''),[more,setMore]=useState(false);
 const [labels,setLabels]=useState<Record<string,string>>({});
 useEffect(()=>{
  const controller=new AbortController(),timer=setTimeout(()=>{
   request<{values:{value:string;label:string}[];hasMore:boolean}>('options','POST',{query:{...initial,target,columns:['system:status']},field:field.id,search},controller.signal).then(result=>{setOptions(result.values);setMore(result.hasMore);setError('');setLabels(previous=>({...previous,...Object.fromEntries(result.values.map(o=>[o.value,o.label]))}));}).catch(e=>{if(!controller.signal.aborted)setError(e.message);});
  },200);return()=>{clearTimeout(timer);controller.abort();};
 },[field.id,search,target]);
 const selected=filter.values||[];
 return <div className="report-values"><label>Search values<input type="search" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Type to find values"/></label>
  <div className="report-value-options" role="group" aria-label={field.displayLabel+' values'}>{options.map(option=><label key={option.value}><input type="checkbox" checked={selected.includes(option.value)} onChange={e=>onChange({...filter,values:e.target.checked?[...selected,option.value]:selected.filter(v=>v!==option.value)})}/>{option.label}</label>)}</div>
  {more&&<small>More values are available. Refine your search.</small>}{error&&<small role="alert">{error}</small>}
  <div className="report-chips">{selected.map(value=><button key={value} type="button" aria-label={'Remove '+(labels[value]||value)+' from '+field.label} onClick={()=>onChange({...filter,values:selected.filter(v=>v!==value)})}>{labels[value]||value}<span aria-hidden="true"> ×</span></button>)}</div>
 </div>;
}
function FilterEditor({field,filter,target,onChange}:{field:ReportField;filter:ReportFilter;target:string;onChange:(filter:ReportFilter)=>void}){
 const text=field.kind==='text',number=field.kind==='number';
 return <>
  {(text||number)&&<label>Match<select aria-label="Match" value={filter.op} onChange={e=>onChange({field:field.id,op:e.target.value as ReportFilter['op'],values:[]})}>{text?<><option value="in">Any selected value (OR)</option><option value="equals">Equals</option><option value="contains">Contains</option></>:<><option value="range">Number range</option><option value="equals">Exact number</option></>}</select></label>}
  {filter.op==='in'?<Values key={field.id} field={field} filter={filter} target={target} onChange={onChange}/>:filter.op==='range'&&field.kind==='date'?<div className="report-range"><label>From (inclusive, IST)<input type="date" value={filter.from||''} onChange={e=>onChange({...filter,from:e.target.value||undefined})}/></label><label>To (inclusive, IST)<input type="date" value={filter.to||''} onChange={e=>onChange({...filter,to:e.target.value||undefined})}/></label></div>:filter.op==='range'?<div className="report-range"><label>Minimum<input type="number" value={filter.min??''} onChange={e=>onChange({...filter,min:e.target.value===''?undefined:Number(e.target.value)})}/></label><label>Maximum<input type="number" value={filter.max??''} onChange={e=>onChange({...filter,max:e.target.value===''?undefined:Number(e.target.value)})}/></label></div>:<label>{number?'Value':'Text'}<input type={number?'number':'text'} maxLength={500} value={filter.value||''} onChange={e=>onChange({...filter,value:e.target.value})}/></label>}
 </>;
}
const defaultFilter=(field:ReportField):ReportFilter=>({field:field.id,op:field.kind==='date'||field.kind==='number'?'range':'in',values:[]});

export default function RegistrationReports({content,onChanged}:{content:ClubContent;onChanged?:()=>void}){
 const [catalog,setCatalog]=useState<ReportCatalog>({fields:[],events:[]}),[draft,setDraft]=useState(initial),[applied,setApplied]=useState(initial),[page,setPage]=useState<ReportPage|null>(null);
 const [error,setError]=useState(''),[message,setMessage]=useState(''),[resultKey,setResultKey]=useState(''),[catalogTarget,setCatalogTarget]=useState<string|null>(null),[columnsOpen,setColumnsOpen]=useState(false),[reload,setReload]=useState(0),[review,setReview]=useState<ReviewRecord|null>(null);
 const [presets,setPresets]=useState<ReportPreset[]>([]),[presetId,setPresetId]=useState(''),[job,setJob]=useState<ExportStatus|null>(null),[busy,setBusy]=useState('');
 const root=useRef<HTMLElement>(null),navigationId=useRef(0),navigated=useRef(0),exportNavigation=useRef('');
 const [destination,setDestination]=useState<{id:number;selector:string;results:boolean}|null>(null);
 function navigate(selector:string,results=false){if(window.matchMedia('(max-width: 767px)').matches)setDestination({id:++navigationId.current,selector,results});}
 const exportLock=useRef(false),latestCatalog=useRef(0),practiceInitialized=useRef(false),schemaSeen=useRef('');
 const practice=catalog.practice===true;
 const pending=JSON.stringify({...draft,page:1})!==JSON.stringify({...applied,page:1});
 const queryKey=JSON.stringify({applied,reload}),loading=resultKey!==queryKey||(draft.search||'')!==(applied.search||''),catalogLoading=catalogTarget!==draft.target;
 useEffect(()=>{const timer=setTimeout(()=>setApplied(current=>current.search===(draft.search||'')?current:{...current,search:draft.search||'',page:1}),250);return()=>clearTimeout(timer);},[draft.search,applied.target]);
 useEffect(()=>{
  const controller=new AbortController();
  async function refreshCatalog(){const version=++latestCatalog.current;
   try{const c=await request<ReportCatalog>('catalog?target='+encodeURIComponent(draft.target),'GET',undefined,controller.signal);
    if(controller.signal.aborted||version!==latestCatalog.current)return;
    setCatalog(c);setCatalogTarget(draft.target);
    if(c.practice&&!practiceInitialized.current&&!draft.target&&c.events.length){practiceInitialized.current=true;setDraft({...initial,target:c.events[0].id});return;}
    const signature=JSON.stringify([draft.target,c.fields]);
    if(signature!==schemaSeen.current){schemaSeen.current=signature;
     if(draft.target){
      const update=(query:ReportQuery):ReportQuery=>{
       if(query.target!==draft.target||!query.columns.length)return {...forTournament(draft.target,c),view:query.view,search:query.target===draft.target?query.search:''};
       const valid=new Set(c.fields.map(field=>field.id)),columns=query.columns.filter(id=>c.fields.some(field=>field.id===id&&field.exportable));
       return {...query,filters:query.filters.filter(filter=>valid.has(filter.field)),columns:columns.length?columns:forTournament(draft.target,c).columns,sort:valid.has(query.sort.field)?query.sort:forTournament(draft.target,c).sort,page:1};
      };
      setDraft(update);setApplied(update);
     }
    }
   }catch(e){if(!controller.signal.aborted){setError(e instanceof Error?e.message:'Unable to load form fields.');setCatalogTarget(draft.target);}}
  }
  void refreshCatalog();const timer=setInterval(()=>void refreshCatalog(),4000);window.addEventListener('focus',refreshCatalog);
  return()=>{controller.abort();clearInterval(timer);window.removeEventListener('focus',refreshCatalog);};
 },[draft.target,content.forms,content.tournaments]);
 useEffect(()=>{if(!applied.target||!applied.columns.length)return;const controller=new AbortController();
  request<ReportPage>('list','POST',{query:applied},controller.signal).then(result=>{if(!controller.signal.aborted){setPage(result);setResultKey(queryKey);setError('');}}).catch(e=>{if(!controller.signal.aborted){setError(e.message);setPage(null);setResultKey(queryKey);}});return()=>controller.abort();
 },[applied,queryKey]);
 useEffect(()=>{request<{presets:ReportPreset[]}>('presets').then(r=>setPresets(r.presets)).catch(e=>setError(e.message));request<{jobs:ExportStatus[]}>('exports').then(r=>setJob(r.jobs.find(j=>j.status==='queued'||j.status==='running')||r.jobs[0]||null)).catch(()=>{});},[]);
 useEffect(()=>{
  if(!job||!['queued','running'].includes(job.status))return;
  const controller=new AbortController(),timer=setTimeout(()=>{request<ExportStatus>('export?id='+job.id,'GET',undefined,controller.signal).then(setJob).catch(e=>{if(!controller.signal.aborted){setError(e.message);setJob(current=>current?e.message.includes('Session expired')?{...current,status:'failed',error:e.message}:{...current}:null);}});},900);
  return()=>{clearTimeout(timer);controller.abort();};
 },[job]);
 useLayoutEffect(()=>{
  if(!destination||destination.id===navigated.current||destination.results&&loading)return;
  const target=root.current?.querySelector<HTMLElement>(destination.selector);if(!target)return;
  const frame=requestAnimationFrame(()=>{navigated.current=destination.id;mobileScroll(target);});
  return()=>cancelAnimationFrame(frame);
 },[destination,loading,columnsOpen,draft.filters.length,job?.status,resultKey]);
 useLayoutEffect(()=>{if(error){const target=root.current?.querySelector<HTMLElement>('[role="alert"]');if(target)mobileScroll(target);}},[error]);
 useLayoutEffect(()=>{if(job&&job.id===exportNavigation.current&&['complete','failed'].includes(job.status)){exportNavigation.current='';const target=root.current?.querySelector<HTMLElement>('.report-job');if(target)mobileScroll(target);}},[job]);
 const field=(id:string)=>catalog.fields.find(f=>f.id===id);
 const invalid=draft.filters.some(f=>f.field&&!field(f.field))||draft.columns.some(id=>!field(id)?.exportable);
 function apply(){setError('');if(invalid){setError('Some saved fields are unavailable or private. Remove them before applying.');return;}setApplied({...draft,filters:draft.filters.filter(f=>f.field),page:1});setMessage('Filters and columns applied.');navigate('.report-table-scroll',true);}
 async function work(name:string,fn:()=>Promise<void>){if(busy)return;setBusy(name);setError('');try{await fn();}catch(e){setError(e instanceof Error?e.message:'Unable to complete the action.');}finally{setBusy('');}}
 async function startExport(format:'pdf'|'xlsx'){
  if(exportLock.current)return;exportLock.current=true;
  await work('export',async()=>{try{const result=await request<ExportStatus>('exports','POST',{query:applied,format,requestId:crypto.randomUUID()});setJob(result);exportNavigation.current=result.id;navigate('.report-job');}catch(e){const recent=await request<{jobs:ExportStatus[]}>('exports');setJob(recent.jobs.find(j=>j.status==='queued'||j.status==='running')||null);throw e;}});exportLock.current=false;
 }
 async function download(){if(!job)return;await work('download',async()=>{
  const response=await fetch('/api/admin/reports/file?id='+job.id,{cache:'no-store'}),expected=job.format==='pdf'?'application/pdf':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  if(!response.ok||response.headers.get('content-type')?.split(';')[0]!==expected)throw Error(response.status===403?'Session expired. Sign in again to download.':'The report is not available. Check its status or create it again.');
  const blob=await response.blob(),signature=new Uint8Array(await blob.slice(0,5).arrayBuffer());
  if(job.format==='pdf'?String.fromCharCode(...signature)!=='%PDF-':signature[0]!==0x50||signature[1]!==0x4b||signature[2]!==3||signature[3]!==4)throw Error('The downloaded response is not a valid report. No file was saved.');
  const match=response.headers.get('content-disposition')?.match(/filename="([a-z0-9._-]+)"/i),url=URL.createObjectURL(blob),anchor=document.createElement('a');anchor.href=url;anchor.download=match?.[1]||'registrations.'+job.format;document.body.appendChild(anchor);anchor.click();anchor.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);setMessage('Report downloaded.');
 });}
 const activeJob=!!job&&['queued','running'].includes(job.status);
 function move(index:number,delta:number){const columns=[...draft.columns];[columns[index],columns[index+delta]]=[columns[index+delta],columns[index]];setDraft({...draft,columns});}
 return <><section ref={root} className="registration-reports" aria-label="Registration filters and exports">
  {practice&&<details className="report-practice-guide admin-panel"><summary>Practice guide: tournaments and masters</summary><ol>
   <li>Select a Tournament. Its current form fields and Registration status are the only choices.</li>
   <li>Vellore: City, Master name, Dojo, Belt, Category. Chennai: City, Master name, Dojo, Age. Salem: Master name, Belt, Category.</li>
   <li>Add Filter, choose Master name, select Kumar or Ravi, then Apply.</li>
   <li>Add Registration status to select Awaiting review (New), Approved, Rejected or Contacted.</li>
   <li>Use REVIEW to approve/reject a registration. Approval does not verify payment.</li>
  </ol></details>}
  <div className="report-controls admin-panel">
   <div className="report-top"><label>Search form answers<input type="search" placeholder="Search current form answers" maxLength={200} value={draft.search||''} onChange={e=>setDraft({...draft,search:e.target.value,page:1})}/></label><label>Tournament<select aria-label="Tournament" value={draft.target} onChange={e=>{setDraft({...initial,target:e.target.value,view:draft.view});setColumnsOpen(false);setMessage('Loading the selected tournament form.');}}><option value="" disabled>Select a tournament</option>{catalog.events.map(e=><option key={e.id} value={e.id}>{e.title}</option>)}</select></label>
    <label>Rows<select aria-label="Rows" value={draft.view} onChange={e=>{const view=e.target.value as ReportQuery['view'];setDraft({...draft,view});}}><option value="registrations">One row per registration</option><option value="participants">One row per student</option></select></label>
    <button type="button" className="btn pale" disabled={!draft.target||catalogLoading||draft.filters.length>=16} onClick={()=>{setDraft({...draft,filters:[...draft.filters,{field:'',op:'in',values:[]}]});navigate('.report-filter:last-child');}}>Add Filter</button>
    <button type="button" className="btn pale" disabled={!draft.target||catalogLoading} aria-expanded={columnsOpen} onClick={()=>{setColumnsOpen(!columnsOpen);navigate(columnsOpen?'.report-top':'.report-columns');}}>Choose Columns</button>
   </div>
   <p className="fine">Values within a field match ANY selected value (OR). Different fields must ALL match (AND). Empty filters add no restriction. Dates include both boundaries in IST.</p>
   {draft.view==='participants'&&<p className="fine">Team students use their own stored details. Registration-level answers/payment are shared. Uncollected individual student fields remain blank.</p>}
   <div className="report-filter-list">{draft.filters.map((f,index)=><fieldset key={index} className="report-filter" tabIndex={-1}><legend>Filter {index+1}</legend><label>Field<select aria-label="Field" value={f.field} onChange={e=>{const selected=field(e.target.value);setDraft({...draft,filters:draft.filters.map((v,i)=>i===index&&selected?defaultFilter(selected):v)});}}><option value="">Select field</option>{f.field&&!field(f.field)&&<option value={f.field}>Unavailable field — remove this filter</option>}{catalog.fields.filter(item=>item.id===f.field||!draft.filters.some(other=>other.field===item.id)).map(item=><option key={item.id} value={item.id}>{item.displayLabel}</option>)}</select></label>
    {field(f.field)&&<FilterEditor field={field(f.field)!} filter={f} target={draft.target} onChange={next=>setDraft({...draft,filters:draft.filters.map((v,i)=>i===index?next:v)})}/>}<button type="button" className="text-link" onClick={()=>setDraft({...draft,filters:draft.filters.filter((_,i)=>i!==index)})}>Remove filter</button></fieldset>)}</div>
   {columnsOpen&&<section className="report-columns" tabIndex={-1} aria-label="Choose and reorder columns"><p>Choose up to 24 permitted columns. Order is shared by the table, Excel and PDF.</p><div className="report-column-choices">{catalog.fields.filter(f=>f.exportable).map(f=><label key={f.id} title={f.aliases.join(' / ')}><input type="checkbox" checked={draft.columns.includes(f.id)} disabled={!draft.columns.includes(f.id)&&draft.columns.length>=24} onChange={e=>setDraft({...draft,columns:e.target.checked?[...draft.columns,f.id]:draft.columns.filter(id=>id!==f.id)})}/>{f.displayLabel}</label>)}</div><ol>{draft.columns.map((id,i)=><li key={id}><span>{field(id)?.displayLabel||'Unavailable column — remove'}</span><button type="button" aria-label={'Move '+(field(id)?.label||'column')+' up'} disabled={i===0} onClick={()=>move(i,-1)}>↑</button><button type="button" aria-label={'Move '+(field(id)?.label||'column')+' down'} disabled={i===draft.columns.length-1} onClick={()=>move(i,1)}>↓</button><button type="button" aria-label={'Remove column '+(field(id)?.label||id)} onClick={()=>setDraft({...draft,columns:draft.columns.filter(c=>c!==id)})}>×</button></li>)}</ol></section>}
   <details className="report-advanced"><summary onClick={()=>navigate('.report-advanced')}>Advanced options</summary><div className="report-top"><label>Sort by<select aria-label="Sort by" value={draft.sort.field} onChange={e=>setDraft({...draft,sort:{...draft.sort,field:e.target.value}})}>{catalog.fields.map(f=><option key={f.id} value={f.id}>{f.displayLabel}</option>)}</select></label><label>Order<select aria-label="Order" value={draft.sort.direction} onChange={e=>setDraft({...draft,sort:{...draft.sort,direction:e.target.value as 'asc'|'desc'}})}><option value="desc">Descending</option><option value="asc">Ascending</option></select></label></div>
   <div className="report-presets"><label>Saved presets<select aria-label="Saved presets" value={presetId} onChange={e=>setPresetId(e.target.value)}><option value="">Select a preset</option>{presets.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label><button type="button" className="btn pale" disabled={!presetId||!!busy} onClick={()=>{const p=presets.find(p=>p.id===presetId);if(p){setDraft({...p.query,page:1});setColumnsOpen(true);setMessage('Preset loaded for review. Remove any unavailable fields, then Apply.');navigate('.report-columns');}}}>Load</button>
    <button type="button" className="btn pale" disabled={!!busy} onClick={()=>work('preset',async()=>{const name=window.prompt('Preset name');if(!name)return;const p=await request<ReportPreset>('presets','POST',{name,query:{...draft,filters:draft.filters.filter(f=>f.field)}});setPresets([...presets,p]);setPresetId(p.id);setMessage('Preset saved.');})}>Save preset</button>
    <button type="button" className="btn pale" disabled={!presetId||!!busy} onClick={()=>work('preset',async()=>{const name=window.prompt('New preset name',presets.find(p=>p.id===presetId)?.name);if(!name)return;await request('presets','PUT',{id:presetId,name});setPresets(presets.map(p=>p.id===presetId?{...p,name}:p));})}>Rename</button>
    <button type="button" className="btn pale" disabled={!presetId||!!busy} onClick={()=>work('preset',async()=>{await request('presets','DELETE',{id:presetId});setPresets(presets.filter(p=>p.id!==presetId));setPresetId('');})}>Delete preset</button>
   </div></details>
   <div className="report-results-toolbar report-apply-bar"><button className="btn red" type="button" disabled={catalogLoading||loading||!draft.columns.length} onClick={apply}>Apply</button><button type="button" className="btn pale" onClick={()=>{setDraft({...draft,search:'',filters:[],page:1});setApplied({...applied,search:'',filters:[],page:1});setMessage('All filters cleared.');navigate('.report-table-scroll',true);}}>Clear All</button></div>
  </div>
  {pending&&<p className="report-notice">Changes are not applied yet. The table and exports still use the last applied filters and columns.</p>}
  {error&&<div className="error" role="alert">{error}</div>}{message&&<p role="status">{message}</p>}
  <div className="report-results-toolbar"><p aria-live="polite">{!applied.target?'Select a tournament to view registrations.':loading?'Loading matching records...':page?`${page.registrations} registrations | ${page.participants} students | ${page.total} matching rows`:'Results unavailable'}</p><button type="button" className="btn pale" onClick={()=>{setReload(r=>r+1);navigate('.report-table-scroll',true);}}>Refresh</button><button type="button" className="btn pale" disabled={loading||pending||activeJob||!!busy||!page?.total} onClick={()=>startExport('xlsx')}>Download Excel</button><button type="button" className="btn pale" disabled={loading||pending||activeJob||!!busy||!page?.total} onClick={()=>startExport('pdf')}>Download PDF</button></div>
  <p className="fine">Exports include all matching rows, across every page. Excel: up to 100,000 rows. PDF: up to 10,000 rows / 2 million text characters / 1,500 pages. Files are private and expire after 24 hours.</p>
  {job&&<div className="report-job" tabIndex={-1} role="status">{job.status==='failed'?`Last export failed: ${job.error}`:job.status==='complete'?`${job.format.toUpperCase()} ready: ${job.total} rows.`:`Preparing ${job.format.toUpperCase()}: ${job.processed} / ${job.total??'…'} rows.`}{job.status==='complete'&&<button type="button" className="btn red" disabled={!!busy} onClick={download}>Download ready report</button>}{activeJob&&<button type="button" className="text-link" onClick={()=>request<ExportStatus>('export?id='+job.id).then(setJob).catch(e=>setError(e.message))}>Refresh export status</button>}</div>}
  <div className="admin-panel report-table-scroll" tabIndex={-1} aria-label="Matching registrations"><table><thead><tr>{applied.columns.map(id=><th key={id} scope="col">{page?.labels[id]||field(id)?.displayLabel||'Column'}</th>)}<th scope="col">Review</th></tr></thead><tbody>{!loading&&applied.target&&page?.rows.map(row=><tr key={row.id+':'+row.memberIndex}>{applied.columns.map(id=><td key={id} data-label={page?.labels[id]||field(id)?.displayLabel||'Column'}>{row.values[id]||'—'}</td>)}<td><button type="button" className="text-link" disabled={!!busy} onClick={()=>work('review',async()=>{setReview(await request<ReviewRecord>('record?id='+encodeURIComponent(row.id)));})}>REVIEW</button></td></tr>)}</tbody></table>{!loading&&applied.target&&page?.total===0&&<div className="admin-empty"><p>{practice?'No registrations match. Use Clear All to reset the filters.':'No registrations match these filters. Remove a value or use Clear All.'}</p></div>}</div>
  <div className="report-pagination"><button type="button" className="btn pale" disabled={loading||applied.page<=1} onClick={()=>{setApplied({...applied,page:applied.page-1});navigate('.report-table-scroll',true);}}>Previous page</button><span>Page {applied.page} of {Math.max(1,Math.ceil((page?.total||0)/applied.pageSize))}</span><button type="button" className="btn pale" disabled={loading||applied.page*applied.pageSize>=(page?.total||0)} onClick={()=>{setApplied({...applied,page:applied.page+1});navigate('.report-table-scroll',true);}}>Next page</button><label>Rows per page<select aria-label="Rows per page" value={applied.pageSize} onChange={e=>{const pageSize=Number(e.target.value);setApplied({...applied,pageSize,page:1});setDraft({...draft,pageSize});navigate('.report-table-scroll',true);}}>{[25,50,100].map(n=><option key={n}>{n}</option>)}</select></label></div>
 </section>{review&&<RequestReview key={review.id} record={review} content={content} onClose={()=>{setReview(null);navigate('.report-table-scroll');}} onSaved={record=>{setReview(record);setReload(n=>n+1);onChanged?.();}}/>}</>;
}
