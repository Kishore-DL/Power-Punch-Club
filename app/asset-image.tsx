'use client';
import Image from 'next/image';
import type {ImgHTMLAttributes} from 'react';

// Uploaded public assets already have their own processing/storage policy.
// Keep their exact URLs and existing CSS; Next supplies accessible image markup.
export default function AssetImage({src,width,height,srcSet,sizes,alt='',...props}:ImgHTMLAttributes<HTMLImageElement>){
  if(typeof src!=='string'||!src)return null;
  const image=<Image {...props} loading={props.loading??'eager'} src={src} alt={alt} width={Number(width)||1400} height={Number(height)||1000} sizes={sizes} unoptimized/>;
  return srcSet?<picture style={{display:'contents'}}><source srcSet={srcSet} sizes={sizes}/>{image}</picture>:image;
}
