import { initAuthCreds, type AuthenticationState, type WASocket } from '@whiskeysockets/baileys';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WhatsAppSession } from './session.js';
import type { PostgresAuthStore } from './store.js';

const active: WhatsAppSession[] = [];

function harness(sendMessage = vi.fn(async () => ({ key: { id: 'message-1' } }))) {
  const listeners = new Map<string, (event: Record<string, unknown>) => void>();
  const end = vi.fn();
  const socket = {
    sendMessage,
    end,
    ev: { on: (name: string, listener: (event: Record<string, unknown>) => void) => {
      listeners.set(name, listener);
    } },
  } as unknown as WASocket;
  const state: AuthenticationState = {
    creds: initAuthCreds(),
    keys: { get: async () => ({}), set: async () => undefined },
  };
  const store = { load: async () => ({ state, saveCreds: async () => undefined }) } as PostgresAuthStore;
  const session = new WhatsAppSession(store, () => socket);
  active.push(session);
  return { session, listeners, sendMessage, end };
}

afterEach(async () => {
  vi.useRealTimers();
  await Promise.all(active.splice(0).map((session) => session.stop()));
});

describe('Baileys session', () => {
  it('sends only while connected and stops after a disconnect', async () => {
    const { session, listeners, sendMessage } = harness();
    await session.start();
    await expect(session.sendText('+525512345678', 'hola')).rejects.toThrow('not connected');
    listeners.get('connection.update')?.({ connection: 'open' });
    expect(session.ready).toBe(true);
    expect(await session.sendText('+525512345678', 'hola')).toBe('message-1');
    expect(sendMessage).toHaveBeenCalledWith('5215512345678@s.whatsapp.net', { text: 'hola' });
    listeners.get('connection.update')?.({ connection: 'close', lastDisconnect: { error: { output: { statusCode: 401 } } } });
    expect(session.ready).toBe(false);
  });

  it('does not add a second Mexican mobile prefix and leaves other countries intact', async () => {
    const { session, listeners, sendMessage } = harness();
    await session.start();
    listeners.get('connection.update')?.({ connection: 'open' });
    await session.sendText('+5215512345678', 'hola');
    await session.sendText('+14155552671', 'hola');
    expect(sendMessage).toHaveBeenNthCalledWith(1, '5215512345678@s.whatsapp.net', { text: 'hola' });
    expect(sendMessage).toHaveBeenNthCalledWith(2, '14155552671@s.whatsapp.net', { text: 'hola' });
  });

  it('treats a send timeout as ambiguous', async () => {
    vi.useFakeTimers();
    const never = vi.fn(() => new Promise<never>(() => undefined));
    const { session, listeners } = harness(never);
    await session.start();
    listeners.get('connection.update')?.({ connection: 'open' });
    const result = session.sendText('+525512345678', 'hola');
    const assertion = expect(result).rejects.toThrow('timed out');
    await vi.advanceTimersByTimeAsync(20_000);
    await assertion;
  });
});
