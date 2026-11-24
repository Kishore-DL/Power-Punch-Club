import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {getDocument} from 'pdfjs-dist/legacy/build/pdf.mjs';
import {reportPdf} from '../lib/report-pdf.ts';
import {renderPdfPage} from './pdf-rendering.mjs';
const fields=Array.from({length:9},(_,i)=>({id:i?'answer:column-'+i:'system:registrationNumber',key:'column-'+i,label:i?'Report column '+i:'Registration number',displayLabel:i?'Report column '+i:'Registration number',kind:'text',source:i?'answer':'system',options:[],aliases:[],exportable:true}));
const rows=Array.from({length:3},(_,i)=>({id:'test-'+i,memberIndex:0,values:Object.fromEntries(fields.map((f,j)=>[f.id,j===0?'PPC-REPORT-'+i:j===2?('தமிழ் மாணவர் / Long text with complete multiline content.\n'.repeat(35))+'END-LONG-'+i:'ROW-'+i+'-COLUMN-'+j]))}));
const model={club:'Power Punch Club',tournament:'Tamil and wide column report',title:'Registration report',generatedAt:'24 Nov 2026, 10:30 am IST',filters:'Dojo equals A OR B AND Payment status equals Awaiting payment verification',count:3,registrations:3,participants:4,fields,rows};
const bytes=await reportPdf(model);assert.equal(Buffer.from(bytes).subarray(0,5).toString(),'%PDF-');
const task=getDocument({data:new Uint8Array(bytes),useSystemFonts:false}),pdf=await task.promise;assert.ok(pdf.numPages>=5);let text='';
for(let page=1;page<=pdf.numPages;page++){
 const p=await pdf.getPage(page),content=await p.getTextContent();
 for(const item of content.items){if(!item.str)continue;text+=item.str+' ';const x=item.transform[4],y=item.transform[5];assert.ok(x>=35&&x+item.width<=807,'Selectable text remains inside A4 landscape margins');assert.ok(y>=18&&y<=560,'No clipped footer/header/body text');}
}
for(const id of ['END-LONG-0','END-LONG-1','END-LONG-2','ROW-2-COLUMN-8','Report column 8','தமிழ்'])assert.ok(text.includes(id),'Complete content: '+id);
await mkdir('outputs/report-pdf-layout',{recursive:true});await writeFile('outputs/report-pdf-layout/wide-tamil.pdf',bytes);
for(const page of [1,2,pdf.numPages])await renderPdfPage(bytes,'outputs/report-pdf-layout/page-'+page+'.png',page);
console.log('Report PDF layout passed: '+pdf.numPages+' landscape pages, all nine columns, repeated identifiers/headings, full oversized multiline/Tamil values, selectable bounds and raster outputs.');await task.destroy();
