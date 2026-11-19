import { createRequire } from 'node:module';

// Use the same native CommonJS DNS module as the external MongoDB driver.
// A bundled Server Component's named DNS exports can retain stale bindings.
const dns=createRequire(import.meta.url)('node:dns');

// Optional override for networks whose DNS cannot resolve Atlas SRV records.
export function configureMongoDns() {
  const servers = process.env.MONGODB_DNS_SERVERS?.split(',').map(value => value.trim()).filter(Boolean);
  // Read the current server settings at client access too, not only at import.
  // Do not reset an unchanged resolver while other DNS queries are in flight.
  if (servers?.length && servers.join(',') !== dns.getServers().join(',')) dns.setServers(servers);
  if (servers?.length && servers.join(',') !== dns.promises.getServers().join(',')) dns.promises.setServers(servers);
}
configureMongoDns();
