export const mockTournamentId='8b407d36-73f6-4fd8-9f2c-4084bc4b5601';
export const mockFormId='local-karate-championship-form-v1';
export const mockQrId='public/1e85942a-2bfa-4c8a-856b-5cac5eb06526';
export const mockQrText='POWER PUNCH CLUB LOCAL PREVIEW - DO NOT PAY - NO PAYMENT ADDRESS';
export function localMockEnabled(env=process.env){
  try{const uri=new URL(env.MONGODB_URI||'');return env.PPC_LOCAL_MOCK_CONTENT==='true'&&uri.protocol==='mongodb:'&&['localhost','127.0.0.1','[::1]'].includes(uri.hostname)&&/^ppc_(preview|test)_/.test(env.MONGODB_DATABASE||'')}catch{return false}
}
export const localMockTarget=(id,env=process.env)=>id===mockTournamentId&&localMockEnabled(env);
export const publishedPresentation=record=>record?.presentationOnly===true&&record?.localOnlyPreview===false;
export function scopeLocalMockContent(content,env=process.env){
  const enabled=localMockEnabled(env);
  for(const key of ['tournaments','training','forms']){
    content[key]=(content[key]||[]).filter(item=>enabled||publishedPresentation(item)||!(item.localOnlyPreview===true||item.id===mockTournamentId||String(item.id).startsWith('local-karate-')));
  }
  for(const event of content.tournaments){
    delete event.previewQrNonPayable;delete event.previewEmailOptional;
    if((localMockTarget(event.id,env)&&event.localOnlyPreview===true)||publishedPresentation(event)){event.previewQrNonPayable=true;event.previewEmailOptional=true;}
  }
  return content;
}
