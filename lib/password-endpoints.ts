import type { Db } from 'mongodb';
import { contentRecords } from './mongodb';
import { accountKey, accountList, addAccount, clearSession, getAccount, issueSession, loginId, newAccount,
  ownerKey, passwordMatches, replaceAccount, validPassword, type Role, currentAccount, revokeSession, clearLegacySession } from './password-auth';
import { rateLimit, safeEqual } from './server';

const json=(body:unknown,status=200,cookie?:string)=>{const response=Response.json(body,{status,headers:{'Cache-Control':'no-store'}});if(cookie)response.headers.append('Set-Cookie',cookie);return response;};
const withCookies=(body:unknown,status:number,cookies:string[])=>{const response=json(body,status);for(const value of cookies)response.headers.append('Set-Cookie',value);return response;};
const fail=(error:string,status=400)=>json({error},status);
const isRole=(v:unknown):v is Role=>v==='admin'||v==='staff';

export async function passwordEndpoint(path:string,req:Request,db:Db,env:NodeJS.ProcessEnv,session:Awaited<ReturnType<typeof currentAccount>>) {
  const secret=env.PPC_SESSION_SECRET;
  if(typeof secret!=='string'||secret.length<32)return fail('Password sign-in is not configured',503);
  if((path==='auth/logout'||path==='auth/staff-entry')&&req.method==='POST'){
    const body=await req.json() as {role?:unknown}|null;
    const role=path==='auth/staff-entry'?'staff':body?.role;
    if(!isRole(role))return fail('Choose the portal to sign out');
    await revokeSession(req,db,secret,role);
    return withCookies({ok:true},200,[clearSession(role),clearLegacySession()]);
  }
  if(path==='auth/login'&&req.method==='POST'){
    await rateLimit(req,'auth');
    const body=await req.json() as {role?:unknown;username?:unknown;password?:unknown}|null;
    const role=body?.role, username=loginId(body?.username), password=body?.password;
    if(!isRole(role)||!username||!validPassword(password))return fail('Incorrect login ID or password',401);
    let key=accountKey(role,username);
    if(role==='admin'){
      let owner=await getAccount(db,ownerKey);
      if(!owner&&username===loginId(env.PPC_BOOTSTRAP_ADMIN_ID)&&validPassword(env.PPC_BOOTSTRAP_ADMIN_PASSWORD)&&
        safeEqual(password,env.PPC_BOOTSTRAP_ADMIN_PASSWORD)){
        await addAccount(db,ownerKey,{...await newAccount(role,username,password),owner:true});
        owner=await getAccount(db,ownerKey);
      }
      if(owner?.username===username)key=ownerKey;
    }
    const account=await getAccount(db,key);
    if(!account||account.role!==role||!(await passwordMatches(password,account)))return fail('Incorrect login ID or password',401);
    await revokeSession(req,db,secret,role);
    return json({ok:true},200,await issueSession(secret,key,account,db));
  }
  if(path==='auth/accounts'){
    if(!session?.account.owner)return fail('Owner access required',403);
    if(req.method==='GET')return json({username:session.account.username,accounts:await accountList(db)});
    if(!['POST','PUT','DELETE'].includes(req.method))return fail('Method not allowed',405);
    const body=await req.json() as {role?:unknown;username?:unknown;password?:unknown}|null;
    const role=body?.role,username=loginId(body?.username),password=body?.password;
    if((role!=='admin'&&role!=='staff')||!username)return fail('Choose a role and enter a valid login ID');
    if(role==='admin'&&username===session.account.username)return fail('Use Change owner login for the owner account');
    const key=accountKey(role,username);
    if(req.method==='DELETE'){
      await contentRecords(db).deleteOne({_id:key});
    }else{
      if(!validPassword(password))return fail('Enter a password with 12–128 characters');
      const existing=await getAccount(db,key);
      if(req.method==='POST'&&existing)return fail('This login ID already exists',409);
      if(req.method==='PUT'&&!existing)return fail('Account not found',404);
      const account=await newAccount(role,username,password,existing||undefined);
      const saved=existing?await replaceAccount(db,key,account,existing.version):await addAccount(db,key,account);
      if(!saved)return fail('Another update was saved. Refresh and try again.',409);
    }
    return json({username:session.account.username,accounts:await accountList(db)});
  }
  if(path==='auth/owner'&&req.method==='PUT'){
    if(!session?.account.owner)return fail('Owner access required',403);
    await rateLimit(req,'auth');
    const {username:next,currentPassword,password}=await req.json() as {username?:unknown;currentPassword?:unknown;password?:unknown};
    const username=loginId(next);
    if(!username||!validPassword(currentPassword)||!validPassword(password))return fail('Enter a login ID and passwords with 12–128 characters');
    if(!await passwordMatches(currentPassword,session.account))return fail('Current password is incorrect',401);
    if(await getAccount(db,accountKey('admin',username)))return fail('This login ID is already in use',409);
    const account=await newAccount('admin',username,password,session.account);
    if(!await replaceAccount(db,ownerKey,account,session.account.version))return fail('Another update was saved. Sign in again.',409);
    return json({username},200,await issueSession(secret,ownerKey,account,db));
  }
  return fail('Not found',404);
}
