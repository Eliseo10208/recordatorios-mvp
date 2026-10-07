import type { Pool, PoolClient } from 'pg';

const LOCK_NAMESPACE = 20261007;
const LOCK_ID = 1;

export class SessionLock {
  private client: PoolClient | null = null;
  private healthy = false;

  constructor(private readonly pool: Pool) {}

  get held(): boolean {
    return this.healthy && this.client !== null;
  }

  async acquire(): Promise<void> {
    if (this.client) throw new Error('Session lock already acquired');
    const client = await this.pool.connect();
    client.on('error', () => {
      this.healthy = false;
      process.exit(1);
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
    } catch (error) {
      client.release();
      throw error;
    }
  }

  async release(): Promise<void> {
    const client = this.client;
    this.client = null;
    this.healthy = false;
    if (!client) return;
    try {
      await client.query('SELECT pg_advisory_unlock($1, $2)', [LOCK_NAMESPACE, LOCK_ID]);
    } finally {
      client.release();
    }
  }
}
