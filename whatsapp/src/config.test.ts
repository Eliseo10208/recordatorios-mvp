import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { readConfig } from './config.js';

const base = {
  DATABASE_URL: 'postgresql://test:test@localhost:5432/reminders',
  BAILEYS_ENCRYPTION_KEY: randomBytes(32).toString('base64'),
  WHATSAPP_SERVICE_TOKEN: 'x'.repeat(40),
};

describe('configuration', () => {
  it('accepts a direct PostgreSQL URL', () => {
    expect(readConfig(base).port).toBe(3000);
  });

  it('rejects a pooled Neon URL because the session lock needs a dedicated connection', () => {
    expect(() => readConfig({ ...base, DATABASE_URL: 'postgresql://user:pass@ep-example-pooler.us-west-2.aws.neon.tech/neondb' })).toThrow('direct connection');
  });

  it('rejects short service tokens and malformed URLs', () => {
    expect(() => readConfig({ ...base, WHATSAPP_SERVICE_TOKEN: 'short' })).toThrow('32 characters');
    expect(() => readConfig({ ...base, DATABASE_URL: 'not a URL' })).toThrow('valid PostgreSQL URL');
  });
});
