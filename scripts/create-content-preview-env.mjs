import {randomBytes} from 'node:crypto';
import {writeFile} from 'node:fs/promises';
const secret=()=>randomBytes(32).toString('hex');
const values={MONGODB_URI:'mongodb://127.0.0.1:37029/?directConnection=true&replicaSet=ppcPreview',MONGODB_DATABASE:'ppc_preview_gallery_v1',PPC_CLIENT_PREVIEW:'false',PPC_LOCAL_MOCK_CONTENT:'true',PPC_SESSION_SECRET:secret(),PPC_TRACKING_DIGEST_KEY:secret(),PPC_TRACKING_ACTIVE_KEY:'v1',PPC_TRACKING_KEYS:JSON.stringify({v1:secret()}),PPC_BOOTSTRAP_ADMIN_ID:'preview-admin',PPC_BOOTSTRAP_ADMIN_PASSWORD:secret(),PPC_PUBLIC_ORIGIN:'http://localhost:3020',PPC_BUILD_DIR:'.next-content-preview',ADMIN_NOTIFICATION_EMAIL:'',BREVO_API_KEY:'',EMAIL_FROM_ADDRESS:'',EMAIL_FROM_NAME:'',RAZORPAY_KEY_ID:'',RAZORPAY_KEY_SECRET:'',RAZORPAY_WEBHOOK_SECRET:'',RESEND_API_KEY:'',EMAIL_FROM:''};
await writeFile('.env.content-preview',Object.entries(values).map(([key,value])=>key+"='"+value+"'").join('\n')+'\n',{flag:'wx'});
console.log('Created .env.content-preview with new local-only credentials. Existing .env was not read or changed.');
