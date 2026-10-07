import { createHash, timingSafeEqual } from 'node:crypto';
import Fastify, { type FastifyInstance } from 'fastify';
import type { RequestStore } from './request-store.js';

type Sender = { ready: boolean; sendText(phone: string, message: string): Promise<string> };
type Options = {
  sender: Sender;
  requests: Pick<RequestStore, 'reserve' | 'accept' | 'unknown'>;
  serviceToken: string;
  isLeader: () => boolean;
  databaseReady: () => Promise<boolean>;
};

const e164 = /^\+[1-9]\d{7,14}$/;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function problem(status: number, code: string, title: string) {
  return { type: 'about:blank', status, code, title };
}

function validToken(value: string | undefined, expected: string): boolean {
  if (!value?.startsWith('Bearer ')) return false;
  const actual = Buffer.from(value.slice(7));
  const target = Buffer.from(expected);
  return actual.length === target.length && timingSafeEqual(actual, target);
}

export function buildServer(options: Options): FastifyInstance {
  const app = Fastify({ logger: false, bodyLimit: 2048, trustProxy: false });
  let windowStarted = Date.now();
  let sentInWindow = 0;

  app.setErrorHandler((error, _request, reply) => {
    const code = typeof error === 'object' && error !== null && 'statusCode' in error
      ? error.statusCode : undefined;
    const status = typeof code === 'number' && code >= 400 && code < 500 ? 400 : 500;
    reply.code(status).type('application/problem+json').send(problem(
      status,
      status === 400 ? 'invalid_request' : 'internal_error',
      status === 400 ? 'Invalid request' : 'Internal error',
    ));
  });

  app.get('/healthz', async () => ({ status: 'ok' }));
  app.get('/readyz', async (_request, reply) => {
    try {
      if (options.isLeader() && options.sender.ready && await options.databaseReady()) {
        return { status: 'ready' };
      }
    } catch {
      // Readiness must fail closed.
    }
    return reply.code(503).type('application/problem+json').send(problem(503, 'unavailable', 'Service unavailable'));
  });

  app.post('/v1/messages', async (request, reply) => {
    if (!validToken(request.headers.authorization, options.serviceToken)) {
      return reply.code(401).type('application/problem+json').send(problem(401, 'unauthorized', 'Unauthorized'));
    }
    const key = request.headers['idempotency-key'];
    const body = request.body;
    const payload = body && typeof body === 'object' && !Array.isArray(body)
      ? body as Record<string, unknown>
      : null;
    const phone = payload?.phone;
    const message = payload?.message;
    if (
      typeof key !== 'string' || !uuid.test(key) ||
      typeof phone !== 'string' || !e164.test(phone) ||
      typeof message !== 'string' || message.trim().length === 0 ||
      [...message].length > 500 ||
      !payload || Object.keys(payload).some((name) => name !== 'phone' && name !== 'message')
    ) {
      return reply.code(400).type('application/problem+json').send(problem(400, 'invalid_request', 'Invalid request'));
    }

    if (!options.isLeader() || !options.sender.ready) {
      return reply.code(503).type('application/problem+json').send(problem(503, 'unavailable', 'Service unavailable'));
    }
    const now = Date.now();
    if (now - windowStarted >= 60_000) {
      windowStarted = now;
      sentInWindow = 0;
    }
    if (sentInWindow >= 30) {
      reply.header('Retry-After', String(Math.ceil((60_000 - (now - windowStarted)) / 1000)));
      return reply.code(429).type('application/problem+json').send(problem(429, 'rate_limited', 'Rate limit exceeded'));
    }

    const hash = createHash('sha256').update(phone).update('\0').update(message).digest('hex');
    let reservation;
    try {
      reservation = await options.requests.reserve(key, hash);
    } catch {
      return reply.code(503).type('application/problem+json').send(problem(503, 'unavailable', 'Service unavailable'));
    }
    if (!reservation.created) {
      if (reservation.record.payload_hash !== hash) {
        return reply.code(409).type('application/problem+json').send(problem(409, 'idempotency_conflict', 'Idempotency conflict'));
      }
      if (reservation.record.status === 'accepted') {
        return { status: 'accepted', messageId: reservation.record.provider_message_id };
      }
      return reply.code(409).type('application/problem+json').send(problem(409, 'outcome_unknown', 'Outcome unknown'));
    }

    sentInWindow += 1;
    try {
      const providerId = await options.sender.sendText(phone, message);
      await options.requests.accept(key, providerId);
      return { status: 'accepted', messageId: providerId };
    } catch {
      try {
        await options.requests.unknown(key);
      } catch {
        // The durable reservation remains in sending and blocks a duplicate.
      }
      return reply.code(502).type('application/problem+json').send(problem(502, 'outcome_unknown', 'Outcome unknown'));
    }
  });

  return app;
}
