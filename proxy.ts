import {NextRequest,NextResponse} from 'next/server';
import {database} from './lib/mongodb';
import {clearSession,clearLegacySession,revokeSession} from './lib/password-auth';

// A full portal entry (including refresh/deep links) always requires Staff credentials.
// Filtering, pagination and other in-portal state changes do not make document requests.
export async function proxy(request:NextRequest){
  try{
    if(request.cookies.has('ppc_staff_session_v2'))await revokeSession(request,database(),process.env.PPC_SESSION_SECRET,'staff');
    const headers=new Headers(request.headers);
    headers.set('cookie',(headers.get('cookie')||'').split(';').filter(value=>!/^\s*(ppc_staff_session_v2|ppc_session)=/.test(value)).join(';'));
    const response=NextResponse.next({request:{headers}});
    response.headers.append('Set-Cookie',clearSession('staff'));
    response.headers.append('Set-Cookie',clearLegacySession());
    response.headers.set('Cache-Control','private, no-store');
    return response;
  }catch{return new NextResponse('Staff sign-in is temporarily unavailable. Please try again.',{status:503,headers:{'Cache-Control':'no-store'}});}
}
export const config={matcher:'/staff/:path*'};
