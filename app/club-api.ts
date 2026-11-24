import type {ClubContent,Receipt,SavedRegistration,ServiceStatus,SessionStatus} from '../lib/club-types';
import type {ReviewRecord} from './request-review';
export type AuditEntry={id:string;actor:string;action:string;created:string};
export type OutboxEntry={id:string;subject:string;created:string;recipientLabel?:string;providerMessageId?:string;skipReason?:string;lastError?:string;nextAttemptAt?:number;status:string};
type Responses={content:ClubContent;session:SessionStatus;status:ServiceStatus;requests:ReviewRecord[];'requests-summary':{rows:ReviewRecord[];total:number;awaiting:number;paidAmount:number};audit:AuditEntry[];outbox:OutboxEntry[];upload:{url:string};register:SavedRegistration;'registration-status':SavedRegistration;'manual-proof':SavedRegistration;receipt:Receipt;'registration-confirmation':Receipt;order:{key:string;amount:number;orderId:string;name:string;email:string;phone:string};verify:{paid?:boolean;message:string}};
export async function clubApi(path:'outbox',method:'POST',body:object):Promise<{accepted:number;skipped:number}>;
export async function clubApi<P extends keyof Responses>(path:P,method?:string,body?:unknown):Promise<Responses[P]>;
export async function clubApi(path:string,method='GET',body?:unknown):Promise<unknown>{
  const response=await fetch('/api/'+path,{method,headers:body instanceof FormData?{}:body?{'Content-Type':'application/json'}:{},body:body instanceof FormData?body:body?JSON.stringify(body):undefined});
  const data:unknown=await response.json();
  if(!response.ok)throw Error(data&&typeof data==='object'&&'error'in data&&typeof data.error==='string'?data.error:'Request failed');
  return data;
}
