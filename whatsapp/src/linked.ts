import type { AuthenticationCreds } from '@whiskeysockets/baileys';

export function isLinked(creds: AuthenticationCreds): boolean {
  return Boolean(creds.me?.id && creds.account);
}
