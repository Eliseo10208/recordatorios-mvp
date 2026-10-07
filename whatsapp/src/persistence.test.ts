import { randomBytes, randomUUID } from 'node:crypto';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SecretBox } from './crypto.js';
import { RequestStore } from './request-store.js';
import { PostgresAuthStore } from './store.js';

const testUrl = process.env.TEST_DATABASE_URL;
const dbTests = testUrl && new URL(testUrl).pathname.includes('_test') ? describe : describe.skip;
const pool = testUrl ? new pg.Pool({ connectionString: testUrl }) : null;

dbTests('PostgreSQL persistence', () => {
  beforeAll(async () => {
    await pool!.query('TRUNCATE baileys_signal_keys, baileys_auth, whatsapp_send_requests CASCADE');
  });
  afterAll(async () => { await pool?.end(); });

  it('restores encrypted credentials and Signal keys after a new load', async () => {
    const box = new SecretBox(randomBytes(32).toString('base64'));
    const store = new PostgresAuthStore(pool!, box);
    const first = await store.load();
    first.state.creds.me = { id: '12345@s.whatsapp.net', name: 'test' };
    await first.saveCreds();
    const keyValue = { keyData: Buffer.from('signal secret') };
    await first.state.keys.set({ 'app-state-sync-key': { example: keyValue } });

    const raw = await pool!.query<{ creds_ciphertext: string }>('SELECT creds_ciphertext FROM baileys_auth');
    expect(raw.rows[0]?.creds_ciphertext).not.toContain('12345@s.whatsapp.net');
    const rawKey = await pool!.query<{ value_ciphertext: string }>('SELECT value_ciphertext FROM baileys_signal_keys');
    expect(rawKey.rows[0]?.value_ciphertext).not.toContain('signal secret');

    const restored = await store.load();
    expect(restored.state.creds.me?.id).toBe('12345@s.whatsapp.net');
    const keys = await restored.state.keys.get('app-state-sync-key', ['example']);
    expect(Buffer.from(keys.example?.keyData ?? []).toString()).toBe('signal secret');
  });

  it('reserves an idempotency key once across independent store instances', async () => {
    const first = new RequestStore(pool!);
    const second = new RequestStore(pool!);
    const key = randomUUID();
    const created = await first.reserve(key, 'hash-a');
    expect(created.created).toBe(true);
    const duplicate = await second.reserve(key, 'hash-a');
    expect(duplicate).toMatchObject({ created: false, record: { status: 'sending', payload_hash: 'hash-a' } });
    await first.accept(key, 'provider-1');
    const accepted = await second.reserve(key, 'hash-a');
    expect(accepted).toMatchObject({ created: false, record: { status: 'accepted', provider_message_id: 'provider-1' } });
  });

  it('only resets credentials that were never linked', async () => {
    const store = new PostgresAuthStore(pool!, new SecretBox(randomBytes(32).toString('base64')));
    // This test uses a fresh local database after the preceding test, so use
    // a separate key only after clearing the prior auth row.
    await pool!.query('TRUNCATE baileys_signal_keys, baileys_auth CASCADE');
    const unregistered = await store.load();
    unregistered.state.creds.me = { id: 'temporary@s.whatsapp.net' };
    await unregistered.saveCreds();
    await unregistered.state.keys.set({ 'app-state-sync-key': { temporary: { keyData: Buffer.from('temporary') } } });
    await store.resetUnregistered();
    const fresh = await store.load();
    expect(fresh.state.creds.me).toBeUndefined();
    expect((await fresh.state.keys.get('app-state-sync-key', ['temporary'])).temporary).toBeUndefined();
    fresh.state.creds.me = { id: 'linked:1@s.whatsapp.net' };
    fresh.state.creds.account = {} as NonNullable<typeof fresh.state.creds.account>;
    expect(fresh.state.creds.registered).toBe(false);
    await fresh.saveCreds();
    await expect(store.resetUnregistered()).rejects.toThrow('cannot be reset');
  });
});
