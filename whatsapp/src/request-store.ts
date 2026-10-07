import type { Pool } from 'pg';

export type RequestRecord = {
  payload_hash: string;
  status: 'sending' | 'accepted' | 'unknown';
  provider_message_id: string | null;
};

export class RequestStore {
  constructor(private readonly pool: Pool) {}

  async reserve(key: string, hash: string): Promise<{ created: boolean; record: RequestRecord }> {
    const result = await this.pool.query<RequestRecord>(
      `INSERT INTO whatsapp_send_requests (request_key, payload_hash, status)
       VALUES ($1, $2, 'sending')
       ON CONFLICT (request_key) DO NOTHING
       RETURNING payload_hash, status, provider_message_id`,
      [key, hash],
    );
    if (result.rows[0]) return { created: true, record: result.rows[0] };
    const existing = await this.pool.query<RequestRecord>(
      `SELECT payload_hash, status, provider_message_id
       FROM whatsapp_send_requests WHERE request_key = $1`,
      [key],
    );
    if (!existing.rows[0]) throw new Error('Request reservation was not visible');
    return { created: false, record: existing.rows[0] };
  }

  async accept(key: string, providerId: string): Promise<void> {
    const result = await this.pool.query(
      `UPDATE whatsapp_send_requests
       SET status = 'accepted', provider_message_id = $2, updated_at = now()
       WHERE request_key = $1 AND status = 'sending'`,
      [key, providerId],
    );
    if (result.rowCount !== 1) throw new Error('Send reservation is missing');
  }

  async unknown(key: string): Promise<void> {
    await this.pool.query(
      `UPDATE whatsapp_send_requests SET status = 'unknown', updated_at = now()
       WHERE request_key = $1 AND status = 'sending'`,
      [key],
    );
  }
}
