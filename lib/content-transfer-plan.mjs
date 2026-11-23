import {createHash} from 'node:crypto';
import {mockTournamentId} from './local-mock-content.mjs';
export function contentFingerprint(value){
  const ordered=value=>Array.isArray(value)?value.map(ordered):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,ordered(value[key])])):value;
  return createHash('sha256').update(JSON.stringify(ordered(value))).digest('hex');
}
export function planSelectedRecords(selected,target){
  return Object.entries(selected).flatMap(([section,records])=>records.map(record=>{
    const existing=(target[section]||[]).find(item=>item.id===record.id),same=existing&&contentFingerprint(existing)===contentFingerprint(record);
    const localOnly=record.localOnlyPreview===true||record.id===mockTournamentId;
    return {section,id:record.id,title:record.title,action:existing?(same?'skip-identical':'conflict-preserve-existing'):localOnly?'hold-local-only':'propose-add',reason:existing&&!same?'Same ID has different saved content. No update or replacement is authorized.':localOnly?'Fictional local-only record. Must remain excluded from production until real details and separate approval are supplied.':'',record,existingSummary:existing?{title:existing.title,status:existing.status,registrationMode:existing.registrationMode,hasQr:!!existing.manualQrImage}:null,existingFingerprint:existing?contentFingerprint(existing):null,proposedFingerprint:contentFingerprint(record),rollback:existing?'Do not change or remove this pre-existing record.':'If a future authorized import adds this ID, remove only that ID while its saved fingerprint still equals the import journal fingerprint; otherwise stop for review.'};
  }));
}
