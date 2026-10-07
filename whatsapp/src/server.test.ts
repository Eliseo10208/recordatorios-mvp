import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildServer } from './server.js';
import type { RequestRecord } from './request-store.js';

const token = 'a'.repeat(40);
const validBody = { phone: '+525512345678', message: 'Recordatorio de prueba' };
const apps: ReturnType<typeof buildServer>[] = [];

function harness() {
  const records = new Map<string, RequestRecord>();
  const sendText = vi.fn(async () => 'provider-123');
  const sender = { ready: true, sendText };
  const requests = {
    reserve: vi.fn(async (key: string, hash: string) => {
      const existing = records.get(key);
      if (existing) return { created: false, record: existing };
      const record: RequestRecord = { payload_hash: hash, status: 'sending', provider_message_id: null };
      records.set(key, record);
      return { created: true, record };
    }),
    accept: vi.fn(async (key: string, id: string) => {
      const record = records.get(key);
      if (!record) throw new Error('missing reservation');
      record.status = 'accepted';
      record.provider_message_id = id;
    }),
    unknown: vi.fn(async (key: string) => {
      const record = records.get(key);
      if (record) record.status = 'unknown';
    }),
  };
  const app = buildServer({ sender, requests, serviceToken: token, isLeader: () => true, databaseReady: async () => true });
  apps.push(app);
  const post = (key = randomUUID(), body: unknown = validBody, bearer = token) => app.inject({
    method: 'POST', url: '/v1/messages',
    headers: { authorization: `Bearer ${bearer}`, 'idempotency-key': key }, payload: body,
  });
  return { app, post, sender, requests, records };
}

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

describe('WhatsApp HTTP contract', () => {
  it('reports liveness and readiness separately', async () => {
    const { app, sender } = harness();
    expect((await app.inject('/healthz')).statusCode).toBe(200);
    expect((await app.inject('/readyz')).statusCode).toBe(200);
    sender.ready = false;
    expect((await app.inject('/healthz')).statusCode).toBe(200);
    expect((await app.inject('/readyz')).statusCode).toBe(503);
  });

  it('does not send while disconnected or unable to reserve in PostgreSQL', async () => {
    const { post, sender, requests } = harness();
    sender.ready = false;
    expect((await post()).statusCode).toBe(503);
    sender.ready = true;
    requests.reserve.mockRejectedValueOnce(new Error('database unavailable'));
    expect((await post()).statusCode).toBe(503);
    expect(sender.sendText).not.toHaveBeenCalled();
  });

  it('requires the service token and validates the request', async () => {
    const { app, post, sender } = harness();
    expect((await app.inject({ method: 'POST', url: '/v1/messages', payload: validBody })).statusCode).toBe(401);
    expect((await post(randomUUID(), validBody, 'wrong')).statusCode).toBe(401);
    expect((await post('bad-key')).statusCode).toBe(400);
    expect((await post(randomUUID(), { ...validBody, phone: '5512345678' })).statusCode).toBe(400);
    expect((await post(randomUUID(), { ...validBody, message: '' })).statusCode).toBe(400);
    expect((await post(randomUUID(), { ...validBody, extra: true })).statusCode).toBe(400);
    expect(sender.sendText).not.toHaveBeenCalled();
  });

  it('accepts once and replays the saved response without a second send', async () => {
    const { post, sender } = harness();
    const key = randomUUID();
    expect((await post(key)).json()).toEqual({ status: 'accepted', messageId: 'provider-123' });
    expect((await post(key)).json()).toEqual({ status: 'accepted', messageId: 'provider-123' });
    expect(sender.sendText).toHaveBeenCalledTimes(1);
    expect((await post(key, { ...validBody, message: 'otro' })).statusCode).toBe(409);
  });

  it('records an ambiguous send and never sends it twice', async () => {
    const { post, sender, requests } = harness();
    sender.sendText.mockRejectedValueOnce(new Error('timeout'));
    const key = randomUUID();
    const first = await post(key);
    expect(first.statusCode).toBe(502);
    expect(first.json().code).toBe('outcome_unknown');
    expect((await post(key)).statusCode).toBe(409);
    expect(sender.sendText).toHaveBeenCalledTimes(1);
    expect(requests.unknown).toHaveBeenCalledWith(key);
  });

  it('keeps a durable reservation when the result cannot be stored', async () => {
    const { post, sender, requests } = harness();
    requests.accept.mockRejectedValueOnce(new Error('database lost'));
    const key = randomUUID();
    expect((await post(key)).statusCode).toBe(502);
    expect((await post(key)).statusCode).toBe(409);
    expect(sender.sendText).toHaveBeenCalledTimes(1);
  });

  it('returns an unknown result when the provider times out', async () => {
    const { post, sender } = harness();
    sender.sendText.mockRejectedValueOnce(new Error('Baileys send timed out'));
    const response = await post();
    expect(response.statusCode).toBe(502);
    expect(response.json().code).toBe('outcome_unknown');
  });
});
