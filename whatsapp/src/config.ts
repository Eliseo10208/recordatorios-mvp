export type Config = {
  port: number;
  databaseUrl: string;
  encryptionKey: string;
  serviceToken: string;
};

export function readConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const databaseUrl = env.DATABASE_URL;
  const encryptionKey = env.BAILEYS_ENCRYPTION_KEY;
  const serviceToken = env.WHATSAPP_SERVICE_TOKEN;
  const port = Number(env.PORT ?? 3000);
  if (!databaseUrl || !encryptionKey || !serviceToken) {
    throw new Error('DATABASE_URL, BAILEYS_ENCRYPTION_KEY and WHATSAPP_SERVICE_TOKEN are required');
  }
  let databaseHost: string;
  try {
    const parsed = new URL(databaseUrl);
    if (parsed.protocol !== 'postgresql:' && parsed.protocol !== 'postgres:') throw new Error('Invalid protocol');
    databaseHost = parsed.hostname;
  } catch {
    throw new Error('DATABASE_URL must be a valid PostgreSQL URL');
  }
  if (databaseHost.includes('-pooler')) {
    throw new Error('DATABASE_URL must be a direct connection for the session lock');
  }
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT is invalid');
  if (serviceToken.length < 32) throw new Error('WHATSAPP_SERVICE_TOKEN must have at least 32 characters');
  return { port, databaseUrl, encryptionKey, serviceToken };
}
