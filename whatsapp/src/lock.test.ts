import type { Pool, PoolClient } from 'pg';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SessionLock } from './lock.js';

afterEach(() => vi.useRealTimers());

describe('WhatsApp session lock', () => {
  it('keeps the direct PostgreSQL connection active while held', async () => {
    vi.useFakeTimers();
    const query = vi.fn(async (sql: string) => ({
      rows: sql.includes('pg_try_advisory_lock') ? [{ acquired: true }] : [],
    }));
    const client = { query, on: vi.fn(), release: vi.fn() } as unknown as PoolClient;
    const pool = { connect: vi.fn(async () => client) } as unknown as Pool;
    const lock = new SessionLock(pool);

    await lock.acquire();
    expect(lock.held).toBe(true);
    await vi.advanceTimersByTimeAsync(120_000);
    expect(query).toHaveBeenCalledWith('SELECT 1');

    await lock.release();
    const callsAfterRelease = query.mock.calls.length;
    await vi.advanceTimersByTimeAsync(240_000);
    expect(query).toHaveBeenCalledTimes(callsAfterRelease);
  });

  it('marks the lock unavailable and exits when its heartbeat fails', async () => {
    vi.useFakeTimers();
    const fatal = vi.fn();
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const query = vi.fn(async (sql: string) => {
      if (sql === 'SELECT 1') throw new Error('connection dropped');
      return { rows: [{ acquired: true }] };
    });
    const client = { query, on: vi.fn(), release: vi.fn() } as unknown as PoolClient;
    const pool = { connect: vi.fn(async () => client) } as unknown as Pool;
    const lock = new SessionLock(pool, fatal);

    try {
      await lock.acquire();
      await vi.advanceTimersByTimeAsync(120_000);
      expect(lock.held).toBe(false);
      expect(fatal).toHaveBeenCalledExactlyOnceWith(1);
      expect(stderr).toHaveBeenCalledWith('WhatsApp session lock heartbeat failed.\n');
    } finally {
      stderr.mockRestore();
      await lock.release();
    }
  });
});
