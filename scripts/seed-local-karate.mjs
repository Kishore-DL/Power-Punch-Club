import {karateContentCopy} from '../lib/karate-content-copy.mjs';
import {readFile} from 'node:fs/promises';
import {parseEnv} from 'node:util';
import {createHash} from 'node:crypto';
import {MongoClient,Binary} from 'mongodb';
import QRCode from 'qrcode';
import {localContentTarget,appendSelected} from '../lib/content-import.mjs';
import {localMockEnabled,mockTournamentId,mockFormId,mockQrId,mockQrText} from '../lib/local-mock-content.mjs';
const envFile=process.argv.find(arg=>arg.startsWith('--env='))?.slice(6)||'.env.content-preview';
const settings=parseEnv(await readFile(envFile,'utf8')),database=localContentTarget(settings);
if(!localMockEnabled(settings))throw Error('Set PPC_LOCAL_MOCK_CONTENT=true only in an isolated preview environment.');
if(settings.BREVO_API_KEY||settings.RAZORPAY_KEY_ID||settings.RAZORPAY_KEY_SECRET)throw Error('Mock setup requires live provider credentials to be empty in its separate environment.');
const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const plus=days=>new Date(Date.parse(today+'T00:00:00Z')+days*86400000).toISOString().slice(0,10);
const common={localOnlyPreview:true};
const forms=[{id:mockFormId,title:'Karate championship participant details',...common,fields:[
  {id:'dob',label:'Date of birth',type:'date',required:true,showOnReceipt:true},
  {id:'age',label:'Age on tournament day',type:'number',required:true,showOnReceipt:true},
  {id:'category',label:'Category',type:'select',required:true,options:'Under 10,Under 14,Under 18',showOnReceipt:true},
  {id:'event',label:'Event',type:'select',required:true,options:'Kata,Kumite,Kata and Kumite',showOnReceipt:true},
  {id:'belt',label:'Belt',type:'select',required:true,options:'White,Yellow,Orange,Green,Blue,Purple,Brown,Black',showOnReceipt:true}
]}];
const tournaments=[{id:mockTournamentId,...common,title:'Power Punch Karate Championship',description:'Fictional local-preview karate championship with Kata and Kumite. No real payment or event booking.',venue:'Vellore Indoor Sports Hall — preview venue.',date:plus(45),deadline:plus(38),fee:500,capacity:500,status:'open',registrationMode:'manual',manualPaymentEnabled:true,manualQrImage:'/api/media/'+encodeURIComponent(mockQrId),manualPayee:'',manualUpiId:'',manualInstructions:'Preview QR — do not pay. Use a fictional transaction reference or a test screenshot. No money is collected.',formId:mockFormId,image:'/gallery/karate-worldwide/04-tournament-sparring.webp',document:'',categories:'Under 10\nUnder 14\nUnder 18\nEvents: Kata and Kumite',eligibility:'Fictional preview eligibility: participants under 18 on the event date. Select the matching age category and disclose your belt. Parent or guardian consent is required for minors.',rules:'Reporting time: 8:00 AM IST.\n- Wear a clean karate uniform and your current belt.\n- Kata and Kumite follow the category selected in the form.\n- Use protective equipment for Kumite and follow the referee.\n- Respect opponents and officials.\n- This is a fictional preview. Do not travel to the venue or make a payment.',receiptHeading:'Payment Receipt',confirmationHeading:'Registration Acknowledgement',receiptNote:'Fictional local preview only. No real payment was collected.',registrationPrefix:'PPC',setupDate:today}];
const training=[
 ['kids','Kids Beginner Karate','Ages 6–10','Monday, Wednesday, Friday · 5:00–6:00 PM',1000,'Basics, discipline and coordination.','White to orange belt','06-flexibility.webp'],
 ['junior','Junior Karate','Ages 11–15','Tuesday, Thursday, Saturday · 5:00–6:15 PM',1200,'Kata, fitness and foundational sparring.','All belt levels','07-conditioning.webp'],
 ['advanced','Advanced Karate','Ages 16+','Monday, Wednesday, Friday · 6:15–7:30 PM',1500,'Advanced techniques and competition preparation.','Brown and black belt','08-fighting-stance.webp'],
 ['weekend','Weekend Karate','Ages 8+','Saturday and Sunday · 7:00–8:30 AM',1000,'Karate fundamentals and fitness.','All belt levels','04-tournament-sparring.webp']
].map(([id,title,ages,schedule,fee,description,belt,image])=>({id:'local-karate-'+id+'-v1',...common,title,ages,schedule,fee,feePeriod:'Illustrative monthly fee',description:description+' Fictional local-preview class.',belt,image:'/gallery/karate-worldwide/'+image,venue:'Preview Training Studio, Vellore — fictional location',instructor:'Coach Arjun Preview — fictional instructor'}));
if(!process.argv.includes('--apply')){console.log(JSON.stringify({mode:'plan-only',database,tournaments,training,forms},null,2));process.exit(0)}
const client=new MongoClient(settings.MONGODB_URI,{serverSelectionTimeoutMS:5000}),result={};
try{
  const db=client.db(database),hello=await db.command({hello:1});if(!hello.setName||!hello.hosts?.every(host=>/^(localhost|127\.0\.0\.1):/.test(host)))throw Error('Expected a loopback-only replica set.');
  const qr=await QRCode.toBuffer(mockQrText,{type:'png',width:720,margin:4,errorCorrectionLevel:'H'}),hash=bytes=>createHash('sha256').update(bytes).digest('hex');
  await client.withSession(session=>session.withTransaction(async()=>{
    const file=await db.collection('files').findOne({_id:mockQrId},{session});
    if(file&&hash(file.data.value())!==hash(qr))throw Error('Existing QR asset differs; refusing to overwrite it.');
    if(!file)await db.collection('files').insertOne({_id:mockQrId,type:'image/png',data:new Binary(qr),created:new Date(),localOnlyPreview:true},{session});
    for(const [key,incoming] of Object.entries({tournaments:tournaments.map(karateContentCopy),training:training.map(karateContentCopy),forms})){
      const existing=await db.collection('content').findOne({_id:key},{session}),merged=appendSelected(existing?.value??[],incoming);
      if(merged.added)await db.collection('content').updateOne({_id:key},{$set:{value:merged.value,updated:new Date().toISOString()}},{session,upsert:true});
      result[key]={added:merged.added,skipped:merged.skipped};
    }
  }));
  console.log(JSON.stringify(result));
}finally{await client.close()}
