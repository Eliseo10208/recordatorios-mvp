import { existsSync } from 'node:fs';
import pg from 'pg';
import { readConfig } from './config.js';
import { SecretBox } from './crypto.js';
import { SessionLock } from './lock.js';
import { RequestStore } from './request-store.js';
import { buildServer } from './server.js';
import { WhatsAppSession } from './session.js';
import { PostgresAuthStore } from './store.js';

if (existsSync('.env')) process.loadEnvFile('.env');

const config = readConfig();
const pool = new pg.Pool({ connectionString: config.databaseUrl, max: 5 });
const lock = new SessionLock(pool);
const authStore = new PostgresAuthStore(pool, new SecretBox(config.encryptionKey));
const sender = new WhatsAppSession(authStore);
const requests = new RequestStore(pool);
const server = buildServer({
  sender,
  requests,
  serviceToken: config.serviceToken,
  isLeader: () => lock.held,
  databaseReady: async () => {
    await authStore.health();
    return true;
  },
});

let stopping = false;
async function shutdown(): Promise<void> {
  if (stopping) return;
  stopping = true;
  await sender.stop().catch(() => undefined);
  await lock.release().catch(() => undefined);
  await server.close().catch(() => undefined);
  await pool.end();
}

process.once('SIGINT', () => { void shutdown(); });
process.once('SIGTERM', () => { void shutdown(); });

try {
  await server.listen({ host: '0.0.0.0', port: config.port });
  await lock.acquire();
  await sender.start();
} catch {
  process.stderr.write('WhatsApp startup failed.\n');
  process.exitCode = 1;
  await shutdown();
}
