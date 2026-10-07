import { fetchLatestWaWebVersion } from '@whiskeysockets/baileys';

export async function currentWaVersion(): Promise<[number, number, number] | undefined> {
  const result = await fetchLatestWaWebVersion({ timeout: 5000 });
  return result.isLatest ? result.version : undefined;
}
