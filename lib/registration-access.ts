import type { Db } from 'mongodb';
import { participantFilter, registrations } from './mongodb';
import { fileStorage } from './file-storage';

export async function portalRegistrations(db: Db) {
  const results=await registrations(db).find(participantFilter,{projection:{token:0,tracking:0,notes:0,_id:0,order_id:0,payment_id:0}})
    .sort({created:-1}).limit(5000).toArray();
  return results.map(({ data, email, phone, ...row }) => {
    const details = data;
    const uploads = Object.entries(details.answers || {}).flatMap(([field, value]) => {
      const definition = details.receiptFields?.[field];
      return staffUploadKey(value, definition?.type, definition?.staffDownload) ? [{ field, label: definition.label }] : [];
    });
    const answers = Object.entries(details.answers || {}).flatMap(([field, value]) => {
      const definition = details.receiptFields?.[field];
      if (!definition || ['file','photo','masked_aadhaar'].includes(definition.type) ||
          !['string','number','boolean'].includes(typeof value) || (typeof value === 'string' && value.startsWith('/api/'))) return [];
      return [{ label: definition.label, value: String(value) }];
    });
    return { ...row, email, phone, registrationNumber: details.registrationNumber || row.id,
      tournament: details.receiptTitle || row.target, uploads, answers, team: Array.isArray(details.team) ? details.team.map(({name,age,belt}: {name:string;age:number;belt:string})=>({name,age,belt})) : [] };
  });
}

export function staffUploadKey(value: unknown, type: unknown, shared: unknown) {
  // The dedicated identity-document field always requires admin access.
  if ((type !== 'photo' && !(type === 'file' && shared === true)) || typeof value !== 'string') return null;
  const match = /^\/api\/media\/private%2F([a-f0-9-]{36})$/i.exec(value);
  return match ? 'private/' + match[1] : null;
}

export async function staffDownload(db: Db, registrationId: string, field: string) {
  const row=await registrations(db).findOne({_id:registrationId,...participantFilter},{projection:{data:1}});
  if(!row)return null;
  const details=row.data;
  const definition = details.receiptFields?.[field];
  const key = staffUploadKey(details.answers?.[field], definition?.type, definition?.staffDownload);
  if (!key) return null;
  const object = await fileStorage.get(key);
  const type = object?.httpMetadata?.contentType;
  if (!object || !type || !['image/png','image/jpeg','image/webp','application/pdf'].includes(type)) return null;
  const extension = type === 'image/jpeg' ? 'jpg' : type.split('/')[1];
  return new Response(object.body, { headers: {
    'Content-Type': type,
    'Content-Disposition': `attachment; filename="registration-upload.${extension}"`,
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
  } });
}
