import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const dns=createRequire(import.meta.url)('node:dns');
const original=dns.getServers(),originalPromises=dns.promises.getServers(),env=process.env.MONGODB_DNS_SERVERS;
try{
  delete process.env.MONGODB_DNS_SERVERS;
  const {configureMongoDns}=await import('../lib/mongodb-dns.mjs');
  assert.deepEqual(dns.getServers(),original,'Import without an override preserves system configuration');
  process.env.MONGODB_DNS_SERVERS=' 192.0.2.53, 198.51.100.53 ';
  configureMongoDns();
  assert.deepEqual(dns.getServers(),['192.0.2.53','198.51.100.53'],'Settings loaded after import are applied');
  assert.deepEqual(dns.promises.getServers(),dns.getServers(),'The driver promise resolver uses the same configuration');
  configureMongoDns();assert.deepEqual(dns.getServers(),['192.0.2.53','198.51.100.53']);
  process.env.MONGODB_DNS_SERVERS='203.0.113.53';configureMongoDns();
  assert.deepEqual(dns.promises.getServers(),['203.0.113.53'],'Changed runtime settings are applied');
  console.log('MongoDB DNS configuration checks passed (no network queries): native/promise resolver consistency, late environment settings, repeated access and changed settings.');
}finally{
  dns.setServers(original);dns.promises.setServers(originalPromises);
  if(env===undefined)delete process.env.MONGODB_DNS_SERVERS;else process.env.MONGODB_DNS_SERVERS=env;
}
