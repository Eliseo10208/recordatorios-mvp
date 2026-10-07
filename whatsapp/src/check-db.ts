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
  const { state } = await new PostgresAuthStore(pool, new SecretBox(config.encryptionKey)).load();
  const keys = await pool.query<{ count: string }>('SELECT count(*) AS count FROM baileys_signal_keys');
  const lock = await pool.connect();
  let pairActive = false;
  try {
    const lockResult = await lock.query<{ acquired: boolean }>(
      'SELECT pg_try_advisory_lock(20261007, 1) AS acquired',
    );
    pairActive = !lockResult.rows[0]?.acquired;
    if (!pairActive) await lock.query('SELECT pg_advisory_unlock(20261007, 1)');
  } finally {
    lock.release();
  }
  process.stdout.write(`Almacén OK para ${who.rows[0]?.current_user}; vinculado=${state.creds.registered}; claves=${keys.rows[0]?.count}; emisor_activo=${pairActive}.\n`);
} catch (error) {
  const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : 'unknown';
  process.stderr.write(`Error de conexión o almacén: ${code}.\n`);
  process.exitCode = 1;
} finally {
  await pool.end();
}
