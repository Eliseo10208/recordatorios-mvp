import { randomUUID } from 'node:crypto';
import {
  BufferJSON,
  initAuthCreds,
  proto,
  type AuthenticationCreds,
  type AuthenticationState,
  type SignalDataSet,
  type SignalDataTypeMap,
} from '@whiskeysockets/baileys';
import type { Pool } from 'pg';
import { SecretBox } from './crypto.js';

const SESSION_ID = 'central-sender';

export class PostgresAuthStore {
  constructor(
    private readonly pool: Pool,
    private readonly box: SecretBox,
  ) {}

  async health(): Promise<void> {
    const result = await this.pool.query<{ creds_ciphertext: string }>(
      'SELECT creds_ciphertext FROM baileys_auth WHERE session_id = $1',
      [SESSION_ID],
    );
    if (!result.rows[0]) throw new Error('WhatsApp credentials are missing');
    this.box.open(result.rows[0].creds_ciphertext);
    await this.pool.query('SELECT 1 FROM baileys_signal_keys WHERE session_id = $1 LIMIT 1', [SESSION_ID]);
  }

  async resetUnregistered(): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await client.query<{ creds_ciphertext: string }>(
        'SELECT creds_ciphertext FROM baileys_auth WHERE session_id = $1 FOR UPDATE',
        [SESSION_ID],
      );
      const row = result.rows[0];
      if (!row) throw new Error('WhatsApp credentials are missing');
      const current = JSON.parse(this.box.open(row.creds_ciphertext), BufferJSON.reviver) as AuthenticationCreds;
      if (current.registered) throw new Error('A registered WhatsApp session cannot be reset automatically');
      await client.query('DELETE FROM baileys_signal_keys WHERE session_id = $1', [SESSION_ID]);
      await client.query(
        'UPDATE baileys_auth SET creds_ciphertext = $2, updated_at = now() WHERE session_id = $1',
        [SESSION_ID, this.box.seal(JSON.stringify(initAuthCreds(), BufferJSON.replacer))],
      );
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async load(): Promise<{ state: AuthenticationState; saveCreds: () => Promise<void> }> {
    const result = await this.pool.query<{ creds_ciphertext: string }>(
      'SELECT creds_ciphertext FROM baileys_auth WHERE session_id = $1',
      [SESSION_ID],
    );
    const row = result.rows[0];
    const creds: AuthenticationCreds = row
      ? JSON.parse(this.box.open(row.creds_ciphertext), BufferJSON.reviver) as AuthenticationCreds
      : initAuthCreds();
    if (!row) await this.save(creds);

    const state: AuthenticationState = {
      creds,
      keys: {
        get: async <T extends keyof SignalDataTypeMap>(type: T, ids: string[]) => {
          const data: { [id: string]: SignalDataTypeMap[T] } = {};
          if (ids.length === 0) return data;
          const rows = await this.pool.query<{ key_id: string; value_ciphertext: string }>(
            `SELECT key_id, value_ciphertext FROM baileys_signal_keys
             WHERE session_id = $1 AND key_type = $2 AND key_id = ANY($3::text[])`,
            [SESSION_ID, type, ids],
          );
          for (const key of rows.rows) {
            let value = JSON.parse(this.box.open(key.value_ciphertext), BufferJSON.reviver) as SignalDataTypeMap[T];
            if (type === 'app-state-sync-key') {
              value = proto.Message.AppStateSyncKeyData.fromObject(value) as unknown as SignalDataTypeMap[T];
            }
            data[key.key_id] = value;
          }
          return data;
        },
        set: async (changes: SignalDataSet) => {
          const client = await this.pool.connect();
          try {
            await client.query('BEGIN');
            for (const [type, group] of Object.entries(changes)) {
              if (!group) continue;
              for (const [id, value] of Object.entries(group)) {
                if (value === null) {
                  await client.query(
                    'DELETE FROM baileys_signal_keys WHERE session_id = $1 AND key_type = $2 AND key_id = $3',
                    [SESSION_ID, type, id],
                  );
                } else {
                  const encrypted = this.box.seal(JSON.stringify(value, BufferJSON.replacer));
                  await client.query(
                    `INSERT INTO baileys_signal_keys
                       (id, session_id, key_type, key_id, value_ciphertext)
                     VALUES ($1, $2, $3, $4, $5)
                     ON CONFLICT (session_id, key_type, key_id)
                     DO UPDATE SET value_ciphertext = EXCLUDED.value_ciphertext, updated_at = now()`,
                    [randomUUID(), SESSION_ID, type, id, encrypted],
                  );
                }
              }
            }
            await client.query('COMMIT');
          } catch (error) {
            await client.query('ROLLBACK');
            throw error;
          } finally {
            client.release();
          }
        },
      },
    };
    return { state, saveCreds: () => this.save(creds) };
  }

  private async save(creds: AuthenticationCreds): Promise<void> {
    const encrypted = this.box.seal(JSON.stringify(creds, BufferJSON.replacer));
    await this.pool.query(
      `INSERT INTO baileys_auth (session_id, creds_ciphertext)
       VALUES ($1, $2)
       ON CONFLICT (session_id)
       DO UPDATE SET creds_ciphertext = EXCLUDED.creds_ciphertext, updated_at = now()`,
      [SESSION_ID, encrypted],
    );
  }
}
