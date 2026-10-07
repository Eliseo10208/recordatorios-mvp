import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

export class SecretBox {
  readonly #key: Buffer;

  constructor(encodedKey: string) {
    const key = Buffer.from(encodedKey, 'base64');
    if (key.length !== 32 || key.toString('base64') !== encodedKey) {
      throw new Error('BAILEYS_ENCRYPTION_KEY must be a base64-encoded 32-byte value');
    }
    this.#key = key;
  }

  seal(value: string): string {
    const nonce = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.#key, nonce);
    const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return ['v1', nonce.toString('base64'), tag.toString('base64'), ciphertext.toString('base64')].join(':');
  }

  open(value: string): string {
    const [version, nonceText, tagText, ciphertextText, extra] = value.split(':');
    if (version !== 'v1' || !nonceText || !tagText || ciphertextText === undefined || extra !== undefined) {
      throw new Error('Invalid encrypted value');
    }
    const nonce = Buffer.from(nonceText, 'base64');
    const tag = Buffer.from(tagText, 'base64');
    if (nonce.length !== 12 || tag.length !== 16) throw new Error('Invalid encrypted value');
    const decipher = createDecipheriv('aes-256-gcm', this.#key, nonce);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(Buffer.from(ciphertextText, 'base64')), decipher.final()]).toString('utf8');
  }
}
