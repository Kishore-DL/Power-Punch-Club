import { redirect } from 'next/navigation';
import Club from '../club';
import { getContent } from '../../lib/server';
export const dynamic='force-dynamic';
export async function generateMetadata(){try{const c=await getContent();return {title:c.branding.seoTitle,description:c.branding.seoDescription,...(c.branding.logo?{icons:{icon:c.branding.logo}}:{})}}catch{return {title:'Power Punch Club'}}}
export default async function Page({params}:{params:Promise<{slug?:string[]}>}){const {slug}=await params;if(slug?.length===1&&slug[0]==='student')redirect('/tournaments');let content;try{content=await getContent()}catch(error){console.error('Public content load failed',error instanceof Error?error.name:'UnknownError',error instanceof Error?error.stack?.split('\n').slice(1,3).join(' '):'');return <main style={{maxWidth:560,margin:'15vh auto',padding:24}}><h1>Power Punch Club</h1><p>The website is temporarily unavailable. Please try again shortly.</p><a href="">Try again</a></main>}return <Club initial={content} initialRoute={'/'+(slug||[]).join('/')}/>}
