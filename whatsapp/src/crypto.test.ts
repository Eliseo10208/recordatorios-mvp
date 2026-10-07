import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { SecretBox } from './crypto.js';

describe('SecretBox', () => {
  it('round trips Unicode with a fresh nonce and hides plaintext', () => {
    const box = new SecretBox(randomBytes(32).toString('base64'));
    const first = box.seal('mensaje 🔒');
    const second = box.seal('mensaje 🔒');
    expect(first).not.toBe(second);
    expect(first).not.toContain('mensaje');
    expect(box.open(first)).toBe('mensaje 🔒');
  });

  it('rejects the wrong key and tampered ciphertext', () => {
    const first = new SecretBox(randomBytes(32).toString('base64'));
    const second = new SecretBox(randomBytes(32).toString('base64'));
    const encrypted = first.seal('private');
    expect(() => second.open(encrypted)).toThrow();
    const parts = encrypted.split(':');
    parts[3] = Buffer.from('tampered').toString('base64');
    expect(() => first.open(parts.join(':'))).toThrow();
  });

  it('rejects malformed keys', () => {
    expect(() => new SecretBox('short')).toThrow();
  });
});
