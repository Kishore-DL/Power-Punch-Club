'use client';
import {useEffect,useRef,useState} from 'react';
import {X} from 'lucide-react';

type Photo={id:string;title:string;album?:string;type:string;url:string;alt?:string;width?:number;height?:number;credit?:string;sourceUrl?:string;license?:string;licenseUrl?:string};
const external=(value?:string)=>value&&/^https:\/\//.test(value)?value:undefined;
function Credit({photo}:{photo:Photo}){return photo.credit?<p className="gallery-credit">Photo: {photo.credit}. {external(photo.sourceUrl)&&<a href={photo.sourceUrl} target="_blank" rel="noreferrer">Source</a>} {external(photo.licenseUrl)&&<a href={photo.licenseUrl} target="_blank" rel="noreferrer">{photo.license}</a>}</p>:null}
function EnlargedPhoto({photo,onClose}:{photo:Photo;onClose:()=>void}){
  const dialog=useRef<HTMLDialogElement>(null);
  useEffect(()=>{const element=dialog.current;element?.showModal();return ()=>element?.close()},[]);
  return <dialog ref={dialog} className="gallery-photo-dialog" aria-label={photo.title} onCancel={onClose} onClick={event=>{if(event.target===event.currentTarget)onClose()}}><button type="button" aria-label="Close image" onClick={onClose}><X/></button><img src={photo.url} alt={photo.alt||photo.title}/><p>{photo.title}</p><Credit photo={photo}/></dialog>;
}
export default function ClubGallery({items,empty}:{items:Photo[];empty:(title:string,description:string)=>React.ReactNode}){
  const [album,setAlbum]=useState('All'),[selected,setSelected]=useState<Photo|null>(null);
  return <><div className="filters">{['All',...new Set(items.map(item=>item.album).filter(Boolean))].map(name=><button key={name} type="button" className={album===name?'selected':''} onClick={()=>setAlbum(name||'All')}>{name}</button>)}</div>
    {items.some(item=>item.album==='Karate worldwide')&&<p className="gallery-source-note">Karate worldwide features photographs from other dojos and competitions. These are not Power Punch Club events.</p>}
    {items.length?<div className="gallery-grid">{items.filter(item=>album==='All'||item.album===album).map(photo=><article className="gallery-item" key={photo.id}><button type="button" className="gallery-photo-button" onClick={()=>photo.type==='video'?window.open(photo.url,'_blank','noopener,noreferrer'):setSelected(photo)}>{photo.type==='video'?<div className="video-tile">▶</div>:<img src={photo.url} alt={photo.alt||photo.title} width={photo.width} height={photo.height} loading="lazy" decoding="async"/>}<span>{photo.title}<small>{photo.album}</small></span></button><Credit photo={photo}/></article>)}</div>:empty('No photos or videos added','Photos and videos will be added here.')}
    {selected&&<EnlargedPhoto photo={selected} onClose={()=>setSelected(null)}/>}
  </>;
}
