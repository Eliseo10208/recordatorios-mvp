import pg from 'pg';
import { readConfig } from './config.js';
import { SecretBox } from './crypto.js';
import { PostgresAuthStore } from './store.js';

process.loadEnvFile('.env');
const config = readConfig();
const pool = new pg.Pool({ connectionString: config.databaseUrl });
try {
  const who = await pool.query<{ current_user: string }>('SELECT current_user');
  const access = await pool.query<{ sender_access: boolean; migration_access: boolean }>(
    `SELECT has_table_privilege(current_user, 'public.baileys_auth', 'SELECT') AS sender_access,
            has_table_privilege(current_user, 'public.alembic_version', 'SELECT') AS migration_access`,
  );
  if (!access.rows[0]?.sender_access || access.rows[0].migration_access) {
    throw new Error('The WhatsApp runtime role has unexpected privileges');
  }
  await new PostgresAuthStore(pool, new SecretBox(config.encryptionKey)).load();
  process.stdout.write(`Conexión y almacén OK para ${who.rows[0]?.current_user}.\n`);
} catch (error) {
  const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : 'unknown';
  process.stderr.write(`Error de conexión o almacén: ${code}.\n`);
  process.exitCode = 1;
} finally {
  await pool.end();
}
