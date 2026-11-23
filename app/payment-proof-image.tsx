'use client';
/* eslint-disable @next/next/no-img-element -- Proofs must display the original private/local image without image optimization. */
import {useEffect,useRef,useState,type CSSProperties} from 'react';

export type ProofGeometry={width:number;height:number;scale:number;fitScale:number};
export default function PaymentProofImage({src,alt,scale,onGeometry,onLoad,onError,className=''}:{src:string;alt:string;scale?:number;onGeometry?:(value:ProofGeometry)=>void;onLoad?:()=>void;onError?:()=>void;className?:string}){
  const frame=useRef<HTMLDivElement>(null),callbacks=useRef({onGeometry,onLoad,onError});
  const [viewport,setViewport]=useState({width:0,height:0}),[natural,setNatural]=useState({width:0,height:0});
  const drag=useRef<{x:number;y:number;left:number;top:number}|null>(null);
  useEffect(()=>{callbacks.current={onGeometry,onLoad,onError}},[onGeometry,onLoad,onError]);
  useEffect(()=>{
    const element=frame.current;if(!element)return;
    const measure=()=>setViewport(previous=>{const next={width:element.clientWidth,height:element.clientHeight};return previous.width===next.width&&previous.height===next.height?previous:next});
    measure();const observer=new ResizeObserver(measure);observer.observe(element);return()=>observer.disconnect();
  },[]);
  const fitScale=natural.width&&natural.height?Math.max(.0001,Math.min(1,(viewport.width-18)/natural.width,(viewport.height-18)/natural.height)):1;
  const actual=scale??fitScale,width=natural.width*actual,height=natural.height*actual;
  useEffect(()=>{if(natural.width&&natural.height)callbacks.current.onGeometry?.({...natural,scale:actual,fitScale})},[natural,actual,fitScale]);
  return <div ref={frame} className={'payment-proof-frame '+className} tabIndex={0} aria-label="Payment proof image; use arrow keys or drag to scroll" onPointerDown={e=>{
    if(e.pointerType!=='mouse'||e.button!==0)return;const el=e.currentTarget;if(el.scrollWidth<=el.clientWidth&&el.scrollHeight<=el.clientHeight)return;
    drag.current={x:e.clientX,y:e.clientY,left:el.scrollLeft,top:el.scrollTop};el.setPointerCapture(e.pointerId);el.focus();e.preventDefault();
  }} onPointerMove={e=>{if(!drag.current)return;e.currentTarget.scrollLeft=drag.current.left+drag.current.x-e.clientX;e.currentTarget.scrollTop=drag.current.top+drag.current.y-e.clientY;}} onPointerUp={()=>{drag.current=null}} onPointerCancel={()=>{drag.current=null}}>
    <div className="payment-proof-surface" style={{width:Math.max(viewport.width-2,width+16),height:Math.max(viewport.height-2,height+16)}}>
      <img src={src} alt={alt} draggable={false} className="payment-proof-raster" style={{'--proof-width':width+'px','--proof-height':height+'px',visibility:natural.width?'visible':'hidden'} as CSSProperties} onLoad={e=>{setNatural({width:e.currentTarget.naturalWidth,height:e.currentTarget.naturalHeight});callbacks.current.onLoad?.()}} onError={()=>callbacks.current.onError?.()}/>
    </div>
  </div>;
}
