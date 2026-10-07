import { existsSync } from 'node:fs';
import makeWASocket, { type AuthenticationState } from '@whiskeysockets/baileys';
import pg from 'pg';
import pino from 'pino';
import qrcode from 'qrcode-terminal';
import { readConfig } from './config.js';
import { SecretBox } from './crypto.js';
import { SessionLock } from './lock.js';
import { PostgresAuthStore } from './store.js';

if (existsSync('.env')) process.loadEnvFile('.env');
const config = readConfig();
const pool = new pg.Pool({ connectionString: config.databaseUrl, max: 3 });
const lock = new SessionLock(pool);
const store = new PostgresAuthStore(pool, new SecretBox(config.encryptionKey));

async function pair(): Promise<void> {
  await lock.acquire();
  const { state, saveCreds } = await store.load();
  if (state.creds.registered) {
    process.stdout.write('La sesión ya está vinculada. Detén este proceso antes de iniciar Render.\n');
    return;
  }
  await new Promise<void>((resolve, reject) => {
    const socket = makeWASocket({
      auth: state as AuthenticationState,
      logger: pino({ level: 'silent' }),
      markOnlineOnConnect: false,
    });
    let queue = Promise.resolve();
    socket.ev.on('creds.update', () => {
      queue = queue.then(saveCreds);
      void queue.catch(reject);
    });
    socket.ev.on('connection.update', ({ qr, connection, lastDisconnect }) => {
      if (qr) {
        process.stdout.write('Escanea este QR con tu cuenta emisora de WhatsApp:\n');
        qrcode.generate(qr, { small: true });
      }
      if (connection === 'open') {
        queue = queue.then(saveCreds);
        void queue.then(() => {
          socket.end(new Error('Pairing complete'));
          resolve();
        }, reject);
      } else if (connection === 'close') {
        reject(lastDisconnect?.error ?? new Error('Pairing connection closed'));
      }
    });
  });
  process.stdout.write('Sesión guardada en Neon. Detén este proceso antes de iniciar Render.\n');
}

try {
  await pair();
} catch {
  process.stderr.write('No se pudo completar la vinculación.\n');
  process.exitCode = 1;
} finally {
  await lock.release();
  await pool.end();
}
