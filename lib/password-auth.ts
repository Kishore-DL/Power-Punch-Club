import type { Db } from 'mongodb';
import { contentRecords, duplicateKey } from './mongodb';
import { scrypt, timingSafeEqual } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { hmac, safeEqual } from './server';

export type Role = 'admin' | 'staff';
export type Account = {
  role: Role; username: string; id: string; version: string;
  salt: string; hash: string; owner?: true;
};
export const ownerKey = 'private-auth-owner';
const prefix = 'private-auth-account:';
const cookieName = (role:Role) => 'ppc_'+role+'_session_v2';
const sessions=(db:Db)=>db.collection<{_id:string;role:Role;expiresAt:Date}>('auth_sessions');
const ttl = 8 * 60 * 60;
export const accountKey = (role: Role, username: string) => prefix + role + ':' + username;
export const loginId = (value: unknown) => typeof value === 'string' && /^[a-z0-9._@-]{3,125}$/i.test(value.trim()) ? value.trim().toLowerCase() : '';
export const validPassword = (value: unknown): value is string => typeof value === 'string' && value.length >= 12 && value.length <= 128;

function derive(password: string, salt: string): Promise<Buffer> {
  return new Promise((resolve,reject) => {
    scrypt(password,Buffer.from(salt,'hex'),32,{N:32768,r:8,p:3,maxmem:64*1024*1024},(error,key)=>error?reject(error):resolve(key));
  });
}
export async function passwordMatches(password:string, account:Account) {
  const candidate=await derive(password,account.salt);
  return timingSafeEqual(candidate,Buffer.from(account.hash,'hex'));
}
export async function newAccount(role:Role,username:string,password:string,previous?:Account) {
  const salt=Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString('hex');
  return {...previous, role, username, id:previous?.id||crypto.randomUUID(), version:crypto.randomUUID(), salt,
    hash:(await derive(password,salt)).toString('hex')};
}
export async function getAccount(db:Db,key:string):Promise<Account|null> {
  const row=await contentRecords(db).findOne({_id:key});
  return (row?.value as Account|undefined)||null;
}
export async function addAccount(db:Db,key:string,account:Account) {
  try{await contentRecords(db).insertOne({_id:key,value:account,updated:new Date().toISOString()});return true}
  catch(error){if(duplicateKey(error))return false;throw error}
}
export async function replaceAccount(db:Db,key:string,account:Account,oldVersion:string) {
  const result=await contentRecords(db).updateOne({_id:key,'value.version':oldVersion},{$set:{value:account,updated:new Date().toISOString()}});
  return result.matchedCount===1;
}
export async function accountList(db:Db) {
  const results=await contentRecords(db).find({_id:/^private-auth-account:(admin|staff):/}).sort({_id:1}).toArray();
  return results.map(({value})=>{const {role,username}=value as Account;return {role,username}});
}
const cookie=(role:Role,value:string,age:number)=>`${cookieName(role)}=${value}; Path=/; Max-Age=${age}; HttpOnly; Secure; SameSite=Lax`;
export const clearSession=(role:Role)=>cookie(role,'',0);
export const clearLegacySession=()=>`ppc_session=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`;
export async function issueSession(secret:string,key:string,account:Account,db:Db) {
  const expiry=Math.floor(Date.now()/1000)+ttl,id=crypto.randomUUID();
  await sessions(db).insertOne({_id:id,role:account.role,expiresAt:new Date(expiry*1000)});
  const payload=encodeURIComponent(JSON.stringify([key,account.version,expiry,account.role,id]));
  return cookie(account.role,payload+'.'+await hmac(secret,payload),ttl);
}
export async function currentAccount(req:Request,db:Db,secret:unknown,role:Role='admin') {
  if(typeof secret!=='string'||secret.length<32)return null;
  const name=cookieName(role);
  const raw=req.headers.get('cookie')?.split(';').map(item=>item.trim()).find(item=>item.startsWith(name+'='))?.slice(name.length+1);
  if(!raw||raw.length>1000)return null;
  const dot=raw.lastIndexOf('.');
  const payload=raw.slice(0,dot),signature=raw.slice(dot+1);
  if(dot<1||!safeEqual(await hmac(secret,payload),signature))return null;
  try {
    const [key,version,expiry,boundRole,id]=JSON.parse(decodeURIComponent(payload));
    if(boundRole!==role||typeof id!=='string'||typeof key!=='string'||!(key===ownerKey||key.startsWith(prefix))||typeof expiry!=='number'||expiry<=Date.now()/1000)return null;
    if(!await sessions(db).findOne({_id:id,role,expiresAt:{$gt:new Date()}}))return null;
    const account=await getAccount(db,key);
    return account&&account.role===role&&account.version===version?{key,account,id}:null;
  }catch{return null}
}
export async function revokeSession(req:Request,db:Db,secret:unknown,role:Role){
  const session=await currentAccount(req,db,secret,role);
  if(session)await sessions(db).deleteOne({_id:session.id,role});
}
