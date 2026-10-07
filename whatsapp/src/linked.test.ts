import { initAuthCreds } from '@whiskeysockets/baileys';
import { describe, expect, it } from 'vitest';
import { isLinked } from './linked.js';

describe('isLinked', () => {
  it('recognizes a QR linked session even when registered remains false', () => {
    const creds = initAuthCreds();
    creds.me = { id: '123:1@s.whatsapp.net', name: 'Test' };
    creds.account = {} as NonNullable<typeof creds.account>;
    expect(creds.registered).toBe(false);
    expect(isLinked(creds)).toBe(true);
  });

  it('does not treat a phone number alone as a completed link', () => {
    const creds = initAuthCreds();
    creds.me = { id: '123@s.whatsapp.net', name: 'Test' };
    expect(isLinked(creds)).toBe(false);
  });
});
