import {PDFDocument,rgb,type PDFPage,type PDFImage} from 'pdf-lib';
import {embedDocumentFonts} from './pdf-fonts.mjs';
import type {ReportField,ReportRow} from './report-types';

export type ReportPdfInput={club:string;tournament:string;title:string;generatedAt:string;filters:string;count:number;registrations:number;participants:number;fields:ReportField[];rows:ReportRow[];deadline?:number};
export async function reportPdf(model:ReportPdfInput,logo?:Uint8Array){
 const doc=await PDFDocument.create(),fonts=await embedDocumentFonts(doc,{subsetTamil:true});
 const pageSize:[number,number]=[841.89,595.28],margin=36,width=pageSize[0]-2*margin,bottom=42,leading=13;
 const bands:ReportField[][]=[];let consumed=0;
 while(consumed<model.fields.length){const repeated=consumed>0&&model.fields[0].id==='system:registrationNumber';const next=model.fields.slice(consumed,consumed+(repeated?3:4));bands.push(repeated?[model.fields[0],...next]:next);consumed+=next.length;}
 const ink=rgb(.12,.16,.23),border=rgb(.75,.79,.84),tint=rgb(.95,.97,.99);
 const checkTime=()=>{if(model.deadline&&Date.now()>model.deadline)throw Error('Export exceeded the eight-minute limit. Narrow the filters.');};
 const choose=(run:string,bold:boolean)=>/[\u0b80-\u0bff]/u.test(run)?bold?fonts.tamilBold:fonts.tamil:bold?fonts.latinBold:fonts.latin;
 const runs=(s:string)=>s.match(/[\u0b80-\u0bff]+|[^\u0b80-\u0bff]+/gu)||[];
 const measure=(s:string,size=9,bold=false)=>runs(s).reduce((sum,r)=>sum+choose(r,bold).widthOfTextAtSize(r,size),0);
 const wrap=(s:string,space:number,size=9,bold=false)=>{
  const lines:string[]=[];
  for(const paragraph of s.replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g,'').replace(/\r/g,'').replace(/\t/g,'    ').split('\n')){
   checkTime();
   let line='';for(const token of paragraph.match(/\S+|\s+/gu)||[]){
    if(measure(line+token,size,bold)<=space){line+=token;continue;}
    if(line.trim()){lines.push(line.trimEnd());line='';}
    if(!token.trim())continue;
    if(measure(token,size,bold)<=space){line=token;continue;}
    for(const {segment} of new Intl.Segmenter('ta',{granularity:'grapheme'}).segment(token)){if(line&&measure(line+segment,size,bold)>space){lines.push(line);line='';}line+=segment;}
   }lines.push(line.trimEnd());
  }return lines;
 };
 let page:PDFPage,y=0,band=0;
 let image:PDFImage|undefined;try{if(logo)image=await doc.embedPng(logo);}catch{/* Club name remains visible. */}
 const text=(s:string,x:number,top:number,size=9,bold=false)=>{for(const r of runs(s)){const font=choose(r,bold);page.drawText(r,{x,y:top-size,size,font,color:ink});x+=font.widthOfTextAtSize(r,size);}};
 const newPage=()=>{
  checkTime();
  if(doc.getPageCount()>=1500)throw Error('PDF exceeds 1,500 pages. Choose fewer columns or narrower filters.');
  page=doc.addPage(pageSize);y=pageSize[1]-margin;
  if(image){const dimensions=image.scaleToFit(38,38);page.drawImage(image,{x:margin,y:y-38,width:dimensions.width,height:dimensions.height});}
  const clubLines=wrap(model.club,width-54,13,true);for(const line of clubLines){text(line,margin+48,y,13,true);y-=17;}
  y=Math.min(y,pageSize[1]-margin-42);text(model.title+' — column group '+(band+1)+' / '+bands.length,margin,y,10,true);y-=17;
  for(const line of wrap('Tournament: '+model.tournament+' | '+model.generatedAt,width)){text(line,margin,y);y-=leading;}
  for(const line of wrap(`${model.count} matching rows | ${model.registrations} registrations | ${model.participants} participants`,width)){text(line,margin,y);y-=leading;}
  y-=7;
 };
 const paragraph=(s:string)=>{for(const line of wrap(s,width)){if(y<bottom+leading)newPage();text(line,margin,y);y-=leading;}y-=10;};
 for(band=0;band<bands.length;band++){
  const fields=bands[band],cellWidth=width/fields.length;
  newPage();paragraph('Applied filters: '+(model.filters||'None'));
  const headerLines=fields.map(f=>wrap(f.displayLabel,cellWidth-12,9,true)),headerHeight=Math.max(...headerLines.map(l=>l.length))*leading+12;
  const headings=()=>{
   if(y-headerHeight<bottom+30)newPage();
   if(y-headerHeight<bottom+30)throw Error('PDF column headings are too long. Use Excel or choose fewer columns.');
   fields.forEach((f,i)=>{page.drawRectangle({x:margin+i*cellWidth,y:y-headerHeight,width:cellWidth,height:headerHeight,color:rgb(.86,.9,.95),borderColor:border,borderWidth:.5});headerLines[i].forEach((line,j)=>text(line,margin+i*cellWidth+6,y-6-j*leading,9,true));});y-=headerHeight;
  };
  headings();
  for(let index=0;index<model.rows.length;index++){
   if(index%50===0)await new Promise<void>(resolve=>setImmediate(resolve));
   const cells=fields.map(f=>wrap(model.rows[index].values[f.id]||'—',cellWidth-12)),lineCount=Math.max(...cells.map(c=>c.length));let offset=0;
   while(offset<lineCount){
    if(y<bottom+leading+12){newPage();headings();}
    const available=Math.floor((y-bottom-12)/leading),take=Math.min(lineCount-offset,available);
    if(take<1){newPage();headings();continue;}
    const height=take*leading+12;
    fields.forEach((f,i)=>{
     page.drawRectangle({x:margin+i*cellWidth,y:y-height,width:cellWidth,height,color:index%2?tint:rgb(1,1,1),borderColor:border,borderWidth:.5});
     const visible=offset>=cells[i].length&&f.id==='system:registrationNumber'?wrap((model.rows[index].values[f.id]||'')+' (continued)',cellWidth-12).slice(0,take):cells[i].slice(offset,offset+take);
     visible.forEach((line,j)=>text(line,margin+i*cellWidth+6,y-6-j*leading));
    });y-=height;offset+=take;
   }
  }
  if(!model.rows.length)paragraph('No matching records.');
 }
 for(const [index,p] of doc.getPages().entries()){
  p.drawText(`Page ${index+1} / ${doc.getPageCount()}`,{x:margin,y:20,font:fonts.latin,size:8,color:ink});
 }
 checkTime();return doc.save();
}
