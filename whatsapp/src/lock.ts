import type { Pool, PoolClient } from 'pg';

const LOCK_NAMESPACE = 20261007;
const LOCK_ID = 1;
const HEARTBEAT_MS = 120_000;

export class SessionLock {
  private client: PoolClient | null = null;
  private healthy = false;
  private heartbeatTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly pool: Pool,
    private readonly fatal: (code: number) => void = (code) => process.exit(code),
  ) {}

  get held(): boolean {
    return this.healthy && this.client !== null;
  }

  private fail(phase: 'connection' | 'heartbeat'): void {
    this.healthy = false;
    if (this.heartbeatTimer) clearTimeout(this.heartbeatTimer);
    this.heartbeatTimer = null;
    process.stderr.write(`WhatsApp session lock ${phase} failed.\n`);
    this.fatal(1);
  }

  private scheduleHeartbeat(client: PoolClient): void {
    this.heartbeatTimer = setTimeout(() => {
      if (this.client !== client || !this.healthy) return;
      void (async () => {
        try {
          await client.query('SELECT 1');
          if (this.client === client && this.healthy) this.scheduleHeartbeat(client);
        } catch {
          if (this.client === client) this.fail('heartbeat');
        }
      })();
    }, HEARTBEAT_MS);
    this.heartbeatTimer.unref();
  }

  async acquire(): Promise<void> {
    if (this.client) throw new Error('Session lock already acquired');
    const client = await this.pool.connect();
    client.on('error', () => {
      if (this.client === client) this.fail('connection');
    });
    try {
      for (;;) {
        const result = await client.query<{ acquired: boolean }>(
          'SELECT pg_try_advisory_lock($1, $2) AS acquired',
          [LOCK_NAMESPACE, LOCK_ID],
        );
        if (result.rows[0]?.acquired) break;
        await new Promise((resolve) => setTimeout(resolve, 3000));
      }
      this.client = client;
      this.healthy = true;
      this.scheduleHeartbeat(client);
    } catch (error) {
      client.release();
      throw error;
    }
  }

  async release(): Promise<void> {
    const client = this.client;
    this.client = null;
    this.healthy = false;
    if (this.heartbeatTimer) clearTimeout(this.heartbeatTimer);
    this.heartbeatTimer = null;
    if (!client) return;
    try {
      await client.query('SELECT pg_advisory_unlock($1, $2)', [LOCK_NAMESPACE, LOCK_ID]);
    } finally {
      client.release();
    }
  }
}
