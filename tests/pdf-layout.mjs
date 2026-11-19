import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import sharp from 'sharp';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { renderRegistrationPdf } from '../lib/pdf-layout.ts';
import { renderPdfPage } from './pdf-rendering.mjs';

const out='outputs/pdf-layout';await mkdir(out,{recursive:true});
const logo=await sharp(await readFile('public/power-punch-logo.webp')).png().toBuffer();
const base={
  club:{name:'Power Punch Club',contacts:['Phone: +91 98765 43210','office@example.invalid','Vellore, Tamil Nadu'],footer:['+91 98765 43210','office@example.invalid']},
  title:'Registration Confirmation',reference:'PPC-000027',generatedAt:'19 Nov 2026, 10:30 am IST',
  registration:[{label:'Registration number',value:'PPC-000027'},{label:'Participant / contact',value:'தமிழ் மாணவர் / Arun Kumar'},{label:'Tournament',value:'District Karate Championship'},{label:'Registered at',value:'19 Nov 2026, 10:00 am IST'},{label:'Email',value:'arun@example.invalid'},{label:'Phone',value:'+91 98765 43210'}],
  fields:[],team:[],payment:[{label:'Payment method',value:'Without payment'},{label:'Registration amount',value:'INR 0.00'},{label:'Payment status',value:'No payment required',emphasis:true}],
  tracking:{number:'PPC-000027',code:'K7M2Q9',url:'https://club.example.invalid/track-registration'},note:'Please retain this document for your records.',
};
const cases={
  confirmation:base,
  acknowledgement:{...base,title:'Registration Acknowledgement',note:undefined,payment:[{label:'Payment method',value:'Manual UPI QR'},{label:'Registration amount',value:'INR 750.00'},{label:'Payment status',value:'Awaiting payment verification',emphasis:true},{label:'Transaction reference',value:'UTR-123456789012'}],fields:[{label:'Age',value:'0'},{label:'Previous participation',value:'false'},{label:'Supporting document',value:'Document submitted'},{label:'Address',value:'First line\nSecond line\nதமிழ்நாடு'}]},
  receipt:{...base,title:'Payment Receipt',reference:'PPC-manual_receipt_fixture',payment:[{label:'Payment method',value:'Manual UPI QR'},{label:'Amount paid',value:'INR 750.00'},{label:'Payment status',value:'Payment verified',emphasis:true},{label:'Payment receipt number',value:'PPC-manual_receipt_fixture'},{label:'Transaction reference',value:'UTR-123456789012'},{label:'Confirmed at',value:'19 Nov 2026, 10:15 am IST'}]},
  team:{...base,team:Array.from({length:50},(_,i)=>({name:`Participant ${i+1} — ${i%2?'தமிழ் மாணவர்':'A very long participant name that wraps comfortably across table lines'}`,age:8+i%12,belt:'Green belt / பச்சை பட்டை'})),note:'Team contact must verify all participant details.\nPlease arrive before the scheduled reporting time.'},
  manyFields:{...base,fields:Array.from({length:60},(_,i)=>({label:`Configured field ${i+1}`,value:i===0?'0':i===1?'false':`Submitted value ${i+1}: `+'A longer answer with meaningful details and natural word wrapping. '.repeat(3)}))},
  oversized:{...base,fields:[{label:'Long multiline answer',value:Array.from({length:100},(_,i)=>`Answer line ${String(i+1).padStart(3,'0')}: தமிழில் பதிவு விவரங்கள் and English details.`).join('\n')},{label:'Unbroken reference',value:'LONGREFERENCE'.repeat(100)}],note:'Last note line.\nEnd of document.'},
  missingOptional:{...base,club:{name:'Power Punch Club',contacts:[],footer:[]},registration:base.registration.slice(0,4),tracking:undefined,note:undefined},
  longContacts:{...base,club:{name:'Power Punch Club Karate and Martial Arts Training Centre — Vellore',contacts:['+91 98765 43210','registrations.'+'a'.repeat(90)+'@example.invalid','An extended training centre address, near the community sports complex,\nVellore district, Tamil Nadu, India'],footer:['+91 98765 43210','registrations.'+'a'.repeat(90)+'@example.invalid']}},
  wideLogo:{...base},
};
let totalPages=0;
for(const [name,model] of Object.entries(cases)){
  const selectedLogo=name==='wideLogo'?await sharp({create:{width:240,height:80,channels:3,background:'#009655'}}).png().toBuffer():logo;
  const bytes=await renderRegistrationPdf(model,selectedLogo);assert.ok(bytes.length<1_500_000,`${name} embeds fonts only once (${bytes.length} bytes)`);
  await writeFile(`${out}/${name}.pdf`,bytes);
  const task=getDocument({data:new Uint8Array(bytes),useSystemFonts:false}),pdf=await task.promise;
  const texts=[];
  try{
    for(let i=1;i<=pdf.numPages;i++){
      const page=await pdf.getPage(i),content=await page.getTextContent();
      assert.ok(Math.abs(page.view[2]-595.28)<.1&&Math.abs(page.view[3]-841.89)<.1,'A4 dimensions');
      const items=content.items.filter(item=>'str' in item&&item.str.trim());
      const text=items.map(item=>item.str).join(' ');texts.push(text);
      assert.ok(text.includes(`Page ${i} of ${pdf.numPages}`),`${name} page numbering`);
      assert.ok(text.includes('Power Punch Club'),`${name} repeated document identity`);
      assert.ok(items.some(item=>item.transform[5]>85&&item.transform[5]<730),`${name} has no blank trailing page`);
      for(const item of items){
        const [,,,,x,y]=item.transform;
        assert.ok(x>=41&&x+item.width<=555.5,`${name} page ${i}: horizontal clipping of ${JSON.stringify(item.str)}`);
        assert.ok(y>=32&&y+item.height<=801,`${name} page ${i}: vertical clipping of ${JSON.stringify(item.str)}`);
      }
      if(name==='team'&&/Participant \d/.test(text)){
        assert.ok(text.includes('Participant name')&&text.includes('Belt'),`${name} table headings repeat on every team page`);
      }
      const rendered=await renderPdfPage(bytes,`${out}/${name}-page-${i}.png`,i);
      if(name==='wideLogo'&&i===1){
        const pixels=rendered.getContext('2d').getImageData(60,60,90,95).data;
        const xs=[],ys=[];for(let k=0;k<pixels.length;k+=4)if(pixels[k+1]>100&&pixels[k+1]>pixels[k]*1.5&&pixels[k+1]>pixels[k+2]*1.5){xs.push((k/4)%90);ys.push(Math.floor((k/4)/90));}
        assert.ok(xs.length>0);const ratio=(Math.max(...xs)-Math.min(...xs)+1)/(Math.max(...ys)-Math.min(...ys)+1);assert.ok(Math.abs(ratio-3)<.15,'Wide club logo preserves its original 3:1 aspect ratio');
      }
    }
    const text=texts.join(' ');
    if(name==='confirmation')assert.equal(pdf.numPages,1,'Simple confirmation fits one A4 page');
    if(name==='acknowledgement')assert.ok(text.includes('Document submitted')&&text.includes('false')&&text.includes('0'));
    if(name==='team'){assert.ok(pdf.numPages>2);assert.ok(text.includes('Participant 50'));}
    if(name==='manyFields')assert.ok(text.includes('Configured field 60'));
    if(name==='oversized'){assert.ok(text.includes('Answer line 100'));assert.ok(text.includes('End of document.'));}
    totalPages+=pdf.numPages;
    console.log(`${name}: ${pdf.numPages} A4 page(s), ${Math.round(bytes.length/1024)} KB; rendered all pages.`);
  }finally{await task.destroy();}
}
console.log(`PDF layout regression passed: ${Object.keys(cases).length} representative documents, ${totalPages} rasterized pages, A4 margins, pagination, table continuation and selectable text bounds.`);
