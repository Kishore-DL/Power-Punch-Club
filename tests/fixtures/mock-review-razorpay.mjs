import {readFile,appendFile} from 'node:fs/promises';
if(!process.env.MONGODB_DATABASE?.startsWith('ppc_test_')||!/^mongodb:\/\/(127\.0\.0\.1|localhost):/.test(process.env.MONGODB_URI||'')||process.env.RAZORPAY_KEY_ID!=='fake_review_key'||process.env.RAZORPAY_KEY_SECRET!=='fake_review_secret')throw Error('Razorpay mock requires isolated disposable test settings.');
const original=globalThis.fetch;
globalThis.fetch=async(url,options)=>{
  const target=String(url);
  if(!target.startsWith('https://api.razorpay.com/'))return original(url,options);
  const response=JSON.parse(await readFile(process.env.PPC_REVIEW_PAYMENT_RESPONSE,'utf8'));
  if(target!=='https://api.razorpay.com/v1/payments/'+response.id)throw Error('Unexpected mocked Razorpay request; no live request allowed.');
  await appendFile(process.env.PPC_REVIEW_PAYMENT_LOG,'mocked verification\n');return Response.json(response);
};
