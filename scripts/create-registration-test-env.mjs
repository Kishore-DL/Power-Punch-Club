import { randomBytes } from 'node:crypto';
import { writeFileSync, existsSync } from 'node:fs';
const target='.env.registration-test';
if(existsSync(target))throw Error(target+' already exists; preserve or rename it before creating a new test configuration.');
const secret=()=>randomBytes(32).toString('hex');
const values={MONGODB_URI:'mongodb://127.0.0.1:27028/?directConnection=true&replicaSet=ppcTest',MONGODB_DATABASE:'ppc_test_registration',PPC_CLIENT_PREVIEW:'false',ADMIN_NOTIFICATION_EMAIL:'test-club-admin@example.invalid',BREVO_API_KEY:'',EMAIL_FROM_ADDRESS:'',EMAIL_FROM_NAME:'',PPC_SESSION_SECRET:secret(),PPC_TRACKING_DIGEST_KEY:secret(),PPC_TRACKING_ACTIVE_KEY:'v1',PPC_TRACKING_KEYS:JSON.stringify({v1:secret()}),PPC_BOOTSTRAP_ADMIN_ID:'test-owner',PPC_BOOTSTRAP_ADMIN_PASSWORD:secret(),PPC_TRUSTED_IP_HEADER:'x-ppc-test-ip',PPC_WRITE_RATE_LIMIT:'10000',PPC_PUBLIC_ORIGIN:'http://localhost:3010',PPC_TEST_URL:'http://localhost:3010',PPC_BUILD_DIR:'.next-registration-tests',RAZORPAY_WEBHOOK_SECRET:'test-only-fixture-webhook-secret'};
writeFileSync(target,Object.entries(values).map(([key,value])=>key+"='"+value+"'").join('\n')+'\n');console.log('Created '+target+' with test-only keys.');
