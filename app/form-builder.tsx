'use client';
import {Grip,Plus,Trash2} from 'lucide-react';
import type {FormField} from '../lib/club-types';
import './form-builder.css';

const contactTypes={name:'text',phone:'tel',email:'email'};
const types=[['text','Text'],['number','Number'],['email','Email'],['tel','Contact phone'],['date','Date'],['select','Dropdown'],['photo','Student photo upload'],['file','Document upload'],['masked_aadhaar','Masked Aadhaar upload']];
export default function FormBuilder({fields,change}:{fields:FormField[];change:(fields:FormField[])=>void}){
 const update=(id:string,patch:Partial<FormField>)=>change(fields.map(field=>field.id===id?{...field,...patch}:field));
 return <div className="form-builder"><h3>Registration questions</h3>
  <p className="fine">Add every question you want to collect. Name, phone and email are not added automatically. Contact mapping connects your chosen answer to Admin review, notifications and payment checkout. Required is your choice. Consent, payment controls and team participants remain separate.</p>
  {fields.map((field,index)=><div className="builder-row" key={field.id}>
   <Grip size={16}/>
   <label>Question label<input value={field.label} onChange={event=>update(field.id,{label:event.target.value})}/></label>
   <label>Field type<select aria-label="Field type" value={field.type} onChange={event=>update(field.id,{type:event.target.value,contactRole:field.contactRole&&contactTypes[field.contactRole]===event.target.value?field.contactRole:undefined})}>{types.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
   {Object.values(contactTypes).includes(field.type)&&<label>Contact mapping<select aria-label="Contact mapping" value={field.contactRole||''} onChange={event=>update(field.id,{contactRole:(event.target.value||undefined) as FormField['contactRole']})}>
    <option value="">Additional answer</option>
    {Object.entries(contactTypes).filter(([,type])=>type===field.type).map(([role])=><option key={role} value={role} disabled={fields.some(other=>other.id!==field.id&&other.contactRole===role)}>{role==='name'?'Participant / contact name':role==='phone'?'Contact phone':'Contact email'}</option>)}
   </select></label>}
   {field.type==='select'&&<label>Options (comma separated)<input value={field.options||''} onChange={event=>update(field.id,{options:event.target.value})}/></label>}
   <label className="check-label"><input type="checkbox" checked={!!field.required} onChange={event=>update(field.id,{required:event.target.checked})}/>Required</label>
   {!['file','photo','masked_aadhaar'].includes(field.type)&&<label className="check-label"><input type="checkbox" checked={field.showOnReceipt!==false} onChange={event=>update(field.id,{showOnReceipt:event.target.checked})}/>Show on receipt</label>}
   {field.type==='file'&&<label className="check-label"><input type="checkbox" checked={field.staffDownload===true} onChange={event=>update(field.id,{staffDownload:event.target.checked})}/>Allow staff to download this document</label>}
   <button type="button" className="icon-button" disabled={!index} aria-label="Move field up" onClick={()=>{const next=[...fields];[next[index-1],next[index]]=[next[index],next[index-1]];change(next);}}>↑</button>
   <button type="button" className="icon-button danger" aria-label="Delete field" onClick={()=>change(fields.filter(other=>other.id!==field.id))}><Trash2 size={16}/></button>
  </div>)}
  <div className="form-contact-actions">
   {([['name','Student name','text','Add name field'],['phone','Phone number','tel','Add phone field'],['email','Email address','email','Add email field']] as const).map(([role,label,type,button])=><button key={role} type="button" className="btn pale" disabled={fields.some(field=>field.contactRole===role)} onClick={()=>change([...fields,{id:crypto.randomUUID(),label,type,contactRole:role,required:role!=='email',showOnReceipt:true}])}>{button}</button>)}
   <button type="button" className="btn pale" onClick={()=>change([...fields,{id:crypto.randomUUID(),label:'New question',type:'text',required:false,options:''}])}><Plus size={17}/>ADD QUESTION</button>
  </div>
 </div>;
}
