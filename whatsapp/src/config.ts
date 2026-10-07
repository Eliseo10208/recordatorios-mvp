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
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT is invalid');
  if (serviceToken.length < 32) throw new Error('WHATSAPP_SERVICE_TOKEN must have at least 32 characters');
  return { port, databaseUrl, encryptionKey, serviceToken };
}
