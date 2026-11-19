import { PDFDocument, rgb, type PDFFont, type PDFPage, type RGB } from 'pdf-lib';
import { embedDocumentFonts } from './pdf-fonts.mjs';

export type DocumentRow = { label:string; value:string; emphasis?:boolean };
export type RegistrationPdfModel = {
  club:{name:string;contacts:string[];footer:string[]};
  title:'Registration Confirmation'|'Registration Acknowledgement'|'Payment Receipt';
  subtitle?:string;reference:string;generatedAt:string;
  registration:DocumentRow[];fields:DocumentRow[];payment:DocumentRow[];
  team:{name:string;age:string|number;belt:string}[];
  tracking?:{number:string;code:string;url:string};note?:string;
};
type Fonts={latin:PDFFont;tamil:PDFFont;latinBold:PDFFont;tamilBold:PDFFont};
type Cell={text:string;bold?:boolean};
const A4:[number,number]=[595.28,841.89],MARGIN=42,WIDTH=A4[0]-2*MARGIN;
const SIZE=10,LEADING=14,PADDING=7;
const INK=rgb(.12,.17,.23),MUTED=rgb(.34,.39,.45),BORDER=rgb(.78,.81,.85);
const TINT=rgb(.96,.97,.985),ACCENT=rgb(.13,.23,.35),WHITE=rgb(1,1,1);
const graphemes=new Intl.Segmenter('ta',{granularity:'grapheme'});

class Layout {
  private doc:PDFDocument;
  private fonts:Fonts;
  private model:RegistrationPdfModel;
  private page!:PDFPage;
  private y=0;
  private bottom=70;
  private footerLines:string[]=[];
  private continuationHeight=0;
  constructor(doc:PDFDocument,fonts:Fonts,model:RegistrationPdfModel){this.doc=doc;this.fonts=fonts;this.model=model;}
  private font(text:string,bold=false){return /[\u0b80-\u0bff]/u.test(text)?(bold?this.fonts.tamilBold:this.fonts.tamil):(bold?this.fonts.latinBold:this.fonts.latin);}
  private runs(text:string){return text.match(/[\u0b80-\u0bff]+|[^\u0b80-\u0bff]+/gu)||[];}
  private measure(text:string,size:number,bold=false){return this.runs(text).reduce((sum,run)=>sum+this.font(run,bold).widthOfTextAtSize(run,size),0);}
  private wrap(value:string,width:number,size=SIZE,bold=false){
    const result:string[]=[];
    const clean=value.replace(/\r\n?/g,'\n').replace(/\t/g,'    ').replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g,'');
    for(const paragraph of clean.split('\n')){
      let line='';
      for(const token of paragraph.match(/\S+|\s+/gu)||[]){
        if(this.measure(line+token,size,bold)<=width){line+=token;continue;}
        if(line.trim()){result.push(line.trimEnd());line='';}
        if(!token.trim())continue;
        // Break only overlong tokens, keeping Tamil combining clusters intact.
        for(const {segment} of graphemes.segment(token)){
          if(line&&this.measure(line+segment,size,bold)>width){result.push(line);line='';}
          line+=segment;
        }
      }
      result.push(line.trimEnd());
    }
    return result;
  }
  private drawLine(text:string,x:number,top:number,size=SIZE,bold=false,color:RGB=INK){
    for(const run of this.runs(text)){
      const font=this.font(run,bold);
      this.page.drawText(run,{x,y:top-size,font,size,color});
      x+=font.widthOfTextAtSize(run,size);
    }
  }
  private lines(lines:string[],x:number,top:number,size=SIZE,bold=false,color:RGB=INK,leading=LEADING,right?:number){
    lines.forEach((line,index)=>this.drawLine(line,right===undefined?x:right-this.measure(line,size,bold),top-index*leading,size,bold,color));
  }
  private header(continuation:boolean,draw:boolean){
    const top=A4[1]-MARGIN;
    if(continuation){
      const left=this.wrap(this.model.club.name,WIDTH*.48,10,true);
      const right=this.wrap(this.model.title+' | '+this.model.reference,WIDTH*.48,9,true);
      const height=Math.max(left.length*14,right.length*14)+13;
      if(draw){this.lines(left,MARGIN,top,10,true,INK,14);this.lines(right,0,top,9,true,MUTED,14,A4[0]-MARGIN);}
      if(draw)this.page.drawLine({start:{x:MARGIN,y:top-height+3},end:{x:A4[0]-MARGIN,y:top-height+3},thickness:.8,color:BORDER});
      return height;
    }
    const textX=MARGIN+68,leftWidth=215,rightWidth=210,right=A4[0]-MARGIN;
    const club=this.wrap(this.model.club.name,leftWidth,14,true);
    const contacts=this.model.club.contacts.flatMap(value=>this.wrap(value,leftWidth,8.5));
    const title=this.wrap(this.model.title,rightWidth,14,true);
    const reference=this.wrap('Reference: '+this.model.reference,rightWidth,9);
    const generated=this.wrap('Generated: '+this.model.generatedAt,rightWidth,8.5);
    const subtitle=this.model.subtitle?this.wrap(this.model.subtitle,rightWidth,9):[];
    const leftHeight=club.length*19+(contacts.length?6+contacts.length*12:0);
    const rightHeight=title.length*19+8+reference.length*13+5+generated.length*12+(subtitle.length?6+subtitle.length*13:0);
    const height=Math.max(60,leftHeight,rightHeight)+18;
    if(draw){
      this.lines(club,textX,top,14,true,INK,19);
      this.lines(contacts,textX,top-club.length*19-6,8.5,false,MUTED,12);
      let cursor=top;this.lines(title,0,cursor,14,true,ACCENT,19,right);cursor-=title.length*19+8;
      this.lines(reference,0,cursor,9,false,INK,13,right);cursor-=reference.length*13+5;
      this.lines(generated,0,cursor,8.5,false,MUTED,12,right);cursor-=generated.length*12+6;
      this.lines(subtitle,0,cursor,9,false,MUTED,13,right);
      this.page.drawLine({start:{x:MARGIN,y:top-height+3},end:{x:right,y:top-height+3},thickness:1.1,color:ACCENT});
    }
    return height;
  }
  private newPage(){
    const continuation=this.doc.getPageCount()>0;
    this.page=this.doc.addPage(A4);
    this.y=A4[1]-MARGIN-this.header(continuation,true);
  }
  private freshRoom(){return A4[1]-MARGIN-this.continuationHeight-this.bottom;}
  private section(title:string,continued:boolean){
    this.y-=12;
    const heading=title+(continued?' (continued)':'');
    const lines=this.wrap(heading,WIDTH,11,true);
    this.lines(lines,MARGIN,this.y,11,true,ACCENT,16);
    this.y-=lines.length*16+4;
  }
  private tableHeading(headers:string[],widths:number[]){
    const lines=headers.map((value,index)=>this.wrap(value,widths[index]-PADDING*2,9,true));
    const height=Math.max(...lines.map(value=>value.length))*14+PADDING*2;
    let x=MARGIN;
    lines.forEach((value,index)=>{
      this.page.drawRectangle({x,y:this.y-height,width:widths[index],height,color:ACCENT,borderColor:BORDER,borderWidth:.6});
      this.lines(value,x+PADDING,this.y-PADDING,9,true,WHITE,14);x+=widths[index];
    });
    this.y-=height;
    return height;
  }
  private table(title:string,widths:number[],rows:Cell[][],headers?:string[],repeatLabels=false,keepTogether=false){
    if(!rows.length)return;
    const headingHeight=12+16+4;
    const columnHeight=headers?Math.max(...headers.map((value,index)=>this.wrap(value,widths[index]-PADDING*2,9,true).length))*14+PADDING*2:0;
    const prepared=rows.map(cells=>cells.map((cell,index)=>this.wrap(cell.text,widths[index]-PADDING*2,SIZE,cell.bold)));
    const rowHeight=(index:number)=>Math.max(...prepared[index].map(lines=>lines.length))*LEADING+PADDING*2;
    const capacity=this.freshRoom()-headingHeight-columnHeight;
    const firstHeight=rowHeight(0);
    const allHeight=rows.reduce((sum,_row,index)=>sum+rowHeight(index),0);
    const required=headingHeight+columnHeight+(keepTogether&&allHeight<=capacity?allHeight:firstHeight<=capacity?firstHeight:PADDING*2+LEADING*2);
    if(this.y-this.bottom<required)this.newPage();
    this.section(title,false);if(headers)this.tableHeading(headers,widths);
    const continueTable=()=>{this.newPage();this.section(title,true);if(headers)this.tableHeading(headers,widths);};
    prepared.forEach((cells,index)=>{
      const count=Math.max(...cells.map(lines=>lines.length));
      const height=rowHeight(index);
      // Ordinary rows move intact. Only a row larger than an entire fresh
      // page is split, using measured lines and repeated section headings.
      if(height>this.y-this.bottom&&height<=capacity)continueTable();
      let offset=0;
      while(offset<count){
        let available=Math.floor((this.y-this.bottom-PADDING*2)/LEADING);
        if(available<Math.min(2,count-offset)){continueTable();available=Math.floor((this.y-this.bottom-PADDING*2)/LEADING);}
        if(available<1)throw Error('PDF header/footer leave no room for table rows.');
        let take=Math.min(available,count-offset);
        if(count-offset-take===1&&take>2)take--;
        const fragmentHeight=take*LEADING+PADDING*2;
        let x=MARGIN;
        cells.forEach((lines,column)=>{
          this.page.drawRectangle({x,y:this.y-fragmentHeight,width:widths[column],height:fragmentHeight,color:index%2?TINT:WHITE,borderColor:BORDER,borderWidth:.6});
          let fragment=lines.slice(offset,offset+take);
          if(repeatLabels&&column===0&&offset>=lines.length){
            const repeated=this.wrap(rows[index][column].text+' (continued)',widths[column]-PADDING*2,SIZE,true);
            if(repeated.length<=take)fragment=repeated;
          }
          this.lines(fragment,x+PADDING,this.y-PADDING,SIZE,rows[index][column].bold);
          x+=widths[column];
        });
        this.y-=fragmentHeight;offset+=take;
        if(offset<count)continueTable();
      }
    });
  }
  private details(title:string,rows:DocumentRow[],keepTogether=false){
    this.table(title,[160,WIDTH-160],rows.map(row=>[{text:row.label,bold:true},{text:row.value,bold:row.emphasis}]),undefined,true,keepTogether);
  }
  async build(logo?:Uint8Array){
    const footer=this.model.club.footer.filter(Boolean).join(' | ')||this.model.club.name;
    this.footerLines=this.wrap(footer,WIDTH-115,8);
    this.bottom=MARGIN+Math.max(1,this.footerLines.length)*11+22;
    this.continuationHeight=this.header(true,false);
    this.newPage();
    if(logo){
      const image=await this.doc.embedPng(logo),dimensions=image.scaleToFit(55,60);
      this.page.drawImage(image,{x:MARGIN,y:A4[1]-MARGIN-dimensions.height,width:dimensions.width,height:dimensions.height});
    }
    this.details('Registration details',this.model.registration);
    this.details('Submitted form details',this.model.fields);
    if(this.model.team.length)this.table('Team participants',[36,WIDTH-36-48-92,48,92],this.model.team.map((member,index)=>[
      {text:String(index+1)},{text:member.name},{text:String(member.age)},{text:member.belt},
    ]),['S. no.','Participant name','Age','Belt']);
    this.details('Payment details',this.model.payment,true);
    if(this.model.tracking)this.details('Private tracking details',[
      {label:'Registration number',value:this.model.tracking.number},
      {label:'Private tracking code',value:this.model.tracking.code,emphasis:true},
      {label:'How to track',value:'Open '+this.model.tracking.url+' and enter BOTH the registration number and the six-character private tracking code.\nKeep the code private: it grants access to this registration.'},
    ],true);
    if(this.model.note?.trim())this.table('Notes',[WIDTH],[[{text:this.model.note}]]);
    const pages=this.doc.getPages();
    pages.forEach((page,index)=>{
      this.page=page;
      page.drawLine({start:{x:MARGIN,y:this.bottom-12},end:{x:A4[0]-MARGIN,y:this.bottom-12},thickness:.6,color:BORDER});
      this.lines(this.footerLines,MARGIN,this.bottom-23,8,false,MUTED,11);
      this.lines([`Page ${index+1} of ${pages.length}`],0,this.bottom-23,8,false,MUTED,11,A4[0]-MARGIN);
    });
    return this.doc.save();
  }
}

export async function renderRegistrationPdf(model:RegistrationPdfModel,logo?:Uint8Array){
  const doc=await PDFDocument.create();
  doc.setTitle(model.title+' - '+model.reference);doc.setAuthor(model.club.name);
  const fonts=await embedDocumentFonts(doc);
  return new Layout(doc,fonts,model).build(logo);
}
