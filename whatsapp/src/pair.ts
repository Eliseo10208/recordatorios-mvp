import { existsSync } from 'node:fs';
import makeWASocket, { DisconnectReason } from '@whiskeysockets/baileys';
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
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const { state, saveCreds } = await store.load();
    const result = await new Promise<'open' | 'retry'>((resolve, reject) => {
      const socket = makeWASocket({
        auth: state,
        logger: pino({ level: 'silent' }),
        markOnlineOnConnect: false,
      });
      let queue = Promise.resolve();
      let settled = false;
      let finished = false;
      socket.ev.on('creds.update', () => {
        if (finished) return;
        queue = queue.then(saveCreds);
        void queue.catch((error: unknown) => {
          if (finished) return;
          finished = true;
          socket.end(new Error('Credential persistence failed'));
          reject(error);
        });
      });
      socket.ev.on('connection.update', ({ qr, connection, lastDisconnect }) => {
        if (settled) return;
        if (qr) {
          process.stdout.write('Escanea este QR con tu cuenta emisora de WhatsApp:\n');
          qrcode.generate(qr, { small: true });
        }
        if (connection === 'open') {
          settled = true;
          setTimeout(() => {
            void queue.then(saveCreds).then(() => {
              if (finished) return;
              finished = true;
              socket.end(new Error('Pairing complete'));
              resolve('open');
            }, reject);
          }, 1000);
        } else if (connection === 'close') {
          settled = true;
          const code = (lastDisconnect?.error as { output?: { statusCode?: number } } | undefined)?.output?.statusCode;
          void queue.then(async () => {
            if (code === DisconnectReason.loggedOut) {
              if (state.creds.registered) {
                throw new Error('WhatsApp logged out; the linked session needs manual recovery');
              }
              await store.resetUnregistered();
            }
            resolve('retry');
          }).catch(reject);
        }
      });
    });
    if (result === 'open') {
      process.stdout.write('Sesión restaurada y guardada en Neon. Cierra este terminal antes de iniciar Render.\n');
      return;
    }
    process.stdout.write('Baileys se desconectó; reintentando la vinculación.\n');
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }
  throw new Error('Pairing failed after ten reconnect attempts');
}

try {
  await pair();
} catch (error) {
  const message = error instanceof Error ? error.message : 'Error desconocido';
  const safe = message.replace(/postgres(?:ql)?:\/\/\S+/gi, '[URL redactada]')
    .replace(/[A-Za-z0-9+/=]{60,}/g, '[valor redactado]').slice(0, 160);
  process.stderr.write(`No se pudo completar la vinculación: ${safe}.\n`);
  process.exitCode = 1;
} finally {
  await lock.release();
  await pool.end();
}
