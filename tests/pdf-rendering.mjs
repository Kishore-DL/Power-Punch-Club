import assert from 'node:assert/strict';
import { PDFDocument } from 'pdf-lib';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { createCanvas } from '@napi-rs/canvas';
import { mkdir, writeFile } from 'node:fs/promises';
import { embedDocumentFonts } from '../lib/pdf-fonts.mjs';

export async function renderPdfPage(bytes, output, pageNumber=1) {
  const task = getDocument({ data: new Uint8Array(bytes), useSystemFonts: false });
  const pdf = await task.promise;
  try {
    const page = await pdf.getPage(pageNumber), viewport = page.getViewport({ scale: 1.5 });
    const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
    await page.render({ canvas, canvasContext: canvas.getContext('2d'), viewport }).promise;
    if (output) await writeFile(output,canvas.toBuffer('image/png'));
    return canvas;
  } finally { await task.destroy(); }
}

export async function checkFontRendering() {
  await mkdir('outputs/pdf-font-fix',{recursive:true});
  const doc=await PDFDocument.create(),{latin,tamil}=await embedDocumentFonts(doc),page=doc.addPage([600,800]);
  const characters=[...'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789@.-_:/'];
  const cells=characters.map((char,index)=>({char,x:30+(index%12)*45,y:740-Math.floor(index/12)*55}));
  for(const {char,x,y} of cells)page.drawText(char,{x,y,size:24,font:latin});
  page.drawText('தமிழ் பதிவு வணக்கம்',{x:30,y:300,size:22,font:tamil});
  const bytes=await doc.save();await writeFile('outputs/pdf-font-fix/font-regression.pdf',bytes);
  const canvas=await renderPdfPage(bytes,'outputs/pdf-font-fix/font-regression.png'),context=canvas.getContext('2d');
  // Text extraction alone passed for the broken PDF. Check the rasterized
  // outlines of every individual glyph instead, using a viewer with no system
  // font fallback, so a missing embedded letter actually fails this test.
  for(const {char,x,y} of cells){
    const pixels=context.getImageData(Math.floor((x-3)*1.5),Math.floor((800-y-34)*1.5),60,65).data;
    let ink=0;
    for(let i=0;i<pixels.length;i+=4)if(pixels[i]<180&&pixels[i+1]<180&&pixels[i+2]<180&&pixels[i+3]>128)ink++;
    assert.ok(ink>3,`Embedded PDF glyph ${JSON.stringify(char)} is invisible (${ink} ink pixels).`);
  }
  console.log(`PDF raster regression passed: all ${characters.length} embedded letters, digits and reference punctuation are visible.`);
}

if(process.argv[1]&&new URL(import.meta.url).pathname.toLowerCase().endsWith(process.argv[1].replaceAll('\\','/').toLowerCase()))await checkFontRendering();
