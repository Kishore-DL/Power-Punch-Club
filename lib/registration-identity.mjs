import { createHmac, randomInt, randomBytes, createCipheriv, createDecipheriv, timingSafeEqual } from 'node:crypto';

const duplicate = error => error?.code === 11000;
export const normaliseNumber = value => typeof value === 'string' ? value.trim().toUpperCase() : '';
export const normaliseCode = normaliseNumber;
function digestKey() {
  const key = process.env.PPC_TRACKING_DIGEST_KEY;
  if (!/^[a-f0-9]{64}$/i.test(key || '')) throw Error('Configure PPC_TRACKING_DIGEST_KEY (32-byte hex).');
  return Buffer.from(key, 'hex');
}
function encryptionKey(id) {
  const keys = JSON.parse(process.env.PPC_TRACKING_KEYS || '{}');
  if (!/^[a-f0-9]{64}$/i.test(keys[id] || '')) throw Error('Configure the tracking encryption key ring.');
  return Buffer.from(keys[id], 'hex');
}
export function validateTrackingKeys() { digestKey(); encryptionKey(process.env.PPC_TRACKING_ACTIVE_KEY); }
export function trackingDigest(code) { return createHmac('sha256', digestKey()).update(normaliseCode(code)).digest('hex'); }
export function generateTrackingCode() {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  for (;;) {
    const code = Array.from({ length: 6 }, () => alphabet[randomInt(alphabet.length)]).join('');
    if (/[A-Z]/.test(code) && /[0-9]/.test(code)) return code;
  }
}
export function sealTrackingCode(id, code) {
  const keyId = process.env.PPC_TRACKING_ACTIVE_KEY;
  const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', encryptionKey(keyId), iv);
  cipher.setAAD(Buffer.from(id));
  const encrypted = Buffer.concat([cipher.update(code, 'utf8'), cipher.final()]);
  return { digest: trackingDigest(code), keyId, iv: iv.toString('hex'), ciphertext: encrypted.toString('hex'), tag: cipher.getAuthTag().toString('hex') };
}
export function openTrackingCode(row) {
  const material = row.tracking;
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(material.keyId), Buffer.from(material.iv, 'hex'));
  decipher.setAAD(Buffer.from(row.id)); decipher.setAuthTag(Buffer.from(material.tag, 'hex'));
  return Buffer.concat([decipher.update(Buffer.from(material.ciphertext, 'hex')), decipher.final()]).toString('utf8');
}

export async function historicalSequence(db) {
  let highest = 0;
  for await (const row of db.collection('requests').find({ 'data.registrationNumber': { $type: 'string' } }, { projection: { 'data.registrationNumber': 1 } })) {
    const matches = row.data.registrationNumber.matchAll(/(?:^|\D)(\d{6,})(?=\D|$)/g);
    for (const match of matches) { const n = Number(match[1]); if (Number.isSafeInteger(n)) highest = Math.max(highest, n); }
  }
  return highest;
}
export async function initialiseCounter(db) {
  const counters = db.collection('registration_counters');
  if (await counters.findOne({ _id: 'registrations' })) return;
  const seq = await historicalSequence(db);
  try { await counters.insertOne({ _id: 'registrations', seq }); } catch (error) { if (!duplicate(error)) throw error; }
}
export function sequenceNumber(sequence, prefix = 'PPC', suffix = '') {
  const head = String(prefix).trim().toUpperCase();
  return head + (head && !/[-_\s]$/.test(head) ? '-' : '') + String(sequence).padStart(6, '0') + String(suffix);
}
export async function allocateIdentity(db, id, prefix, suffix, generate = generateTrackingCode) {
  validateTrackingKeys();
  await requireIdentityIndexes(db);
  await initialiseCounter(db);
  const counter = await db.collection('registration_counters').findOneAndUpdate(
    { _id: 'registrations', seq: { $lt: Number.MAX_SAFE_INTEGER } }, { $inc: { seq: 1 } }, { returnDocument: 'after' });
  if (!counter) throw Error('Registration sequence exhausted.');
  return { number: sequenceNumber(counter.seq, prefix, suffix), tracking: sealTrackingCode(id, generate()) };
}
export async function ensureTracking(db, row, generate = generateTrackingCode) {
  if (row.tracking) return row;
  await requireIdentityIndexes(db);
  for (let attempt = 0; attempt < 12; attempt++) {
    const tracking = sealTrackingCode(row.id, generate());
    try {
      await db.collection('requests').updateOne({ _id: row.id, tracking: { $exists: false } }, { $set: { tracking,
        ...(!row.data?.registrationNumber ? { 'data.registrationNumber': 'PPC-REG-' + row.id } : {}),
      } });
      return await db.collection('requests').findOne({ _id: row.id });
    } catch (error) { if (!duplicate(error)) throw error; }
  }
  throw Error('Tracking credential allocation busy. Please retry.');
}
async function requireIdentityIndexes(db) {
  if (!await db.collection('requests').indexExists(['unique_registration_number','unique_tracking_digest'])) {
    throw Error('Run npm run db:setup before accepting registrations.');
  }
}
export function identityCollision(error) {
  return duplicate(error) && (error.keyPattern?.['tracking.digest'] || error.keyPattern?.['data.registrationNumber']);
}
export async function persistRegistration(db, row, prefix, suffix, persist, generate = generateTrackingCode) {
  for (let attempt = 0; attempt < 12; attempt++) {
    const identity = await allocateIdentity(db, row.id, prefix, suffix, generate);
    row = { ...row, tracking: identity.tracking, data: { ...row.data, registrationNumber: identity.number } };
    try { return { inserted: await persist(row), row }; }
    catch (error) { if (!identityCollision(error) || attempt === 11) throw error; }
  }
  throw Error('Registration allocation busy. Please retry.');
}

export async function setupIdentityIndexes(db) {
  const requests = db.collection('requests');
  for (const field of ['data.registrationNumber', 'tracking.digest']) {
    const conflicts = await requests.aggregate([
      { $match: { [field]: { $type: 'string' } } },
      { $group: { _id: field === 'data.registrationNumber' ? { $toUpper: { $trim: { input: '$' + field } } } : '$' + field, ids: { $push: '$_id' }, count: { $sum: 1 } } },
      { $match: { count: { $gt: 1 } } }, { $limit: 20 },
    ], { collation: { locale: 'en', strength: 2 } }).toArray();
    if (conflicts.length) {
      // Report record IDs only: never disclose credential verification material.
      console.error('Conflicting ' + field + ' records:', conflicts.map(row => row.ids));
      throw Error('Historical registration conflicts require manual review; no references were changed.');
    }
  }
  await requests.createIndexes([
    { key: { 'data.registrationNumber': 1 }, name: 'unique_registration_number', unique: true, collation: { locale: 'en', strength: 2 }, partialFilterExpression: { 'data.registrationNumber': { $type: 'string' } } },
    { key: { 'tracking.digest': 1 }, name: 'unique_tracking_digest', unique: true, partialFilterExpression: { 'tracking.digest': { $type: 'string' } } },
  ]);
  await db.collection('tracking_limits').createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
  await initialiseCounter(db);
}

const cookieName = 'ppc_tracking';
const sign = payload => createHmac('sha256', process.env.PPC_SESSION_SECRET || '').update(payload).digest('hex');
function sessionSecret() { if ((process.env.PPC_SESSION_SECRET || '').length < 32) throw Error('Configure the session secret.'); }
export function trackingSession(id) {
  sessionSecret();
  const payload = Buffer.from(JSON.stringify({ id, exp: Date.now() + 30 * 60_000 })).toString('base64url');
  return `${cookieName}=${payload}.${sign(payload)}; Path=/; Max-Age=1800; HttpOnly; Secure; SameSite=Lax`;
}
export function trackingSessionId(req) {
  sessionSecret();
  const raw = req.headers.get('cookie')?.split(';').map(s => s.trim()).find(s => s.startsWith(cookieName + '='))?.slice(cookieName.length + 1);
  if (!raw || raw.length > 1000) return null;
  const [payload, signature] = raw.split('.');
  const expected = sign(payload);
  if (!signature || signature.length !== expected.length || !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
  try { const session = JSON.parse(Buffer.from(payload, 'base64url').toString()); return typeof session.id === 'string' && session.exp > Date.now() ? session.id : null; } catch { return null; }
}
export async function authorisedRegistration(db, req, body, admin = false) {
  if (typeof body.id !== 'string') return null;
  if (admin || trackingSessionId(req) === body.id) return db.collection('requests').findOne({ _id: body.id });
  if (typeof body.token !== 'string' || body.token.length < 30 || body.token.length > 80) return null;
  return db.collection('requests').findOne({ _id: body.id, token: body.token });
}
export class TrackingLimitError extends Error { constructor() { super('Please wait a few minutes before trying again.'); } }
async function consumeBucket(db, key, limit, now) {
  const window = Math.floor(now / 600_000);
  const buckets = db.collection('tracking_limits');
  const update = { $inc: { count: 1 }, $setOnInsert: { expiresAt: new Date((window + 1) * 600_000) } };
  let row;
  try { row = await buckets.findOneAndUpdate({ _id: key + ':' + window }, update, { upsert: true, returnDocument: 'after' }); }
  catch (error) { if (!duplicate(error)) throw error; row = await buckets.findOneAndUpdate({ _id: key + ':' + window }, update, { returnDocument: 'after' }); }
  return row.count <= limit;
}
export async function trackingLimits(db, req, number, now = Date.now()) {
  const header = process.env.PPC_TRUSTED_IP_HEADER;
  const ip = header ? req.headers.get(header)?.split(',').at(-1)?.trim() || 'shared' : 'shared';
  const hash = input => createHmac('sha256', digestKey()).update(input).digest('hex');
  const allowed = await Promise.all([
    consumeBucket(db, 'global', 1000, now), consumeBucket(db, 'ip:' + hash(ip), 30, now),
    consumeBucket(db, 'number:' + hash(number.slice(0, 200)), 10, now),
  ]);
  if (allowed.some(value => !value)) throw new TrackingLimitError();
}
