import { createHmac, randomBytes } from 'node:crypto';
import websocket from '@fastify/websocket';
import { clientSignalSchema } from '@byteroulette/protocol';
import Fastify, { type FastifyInstance } from 'fastify';
import type { RawData, WebSocket } from 'ws';
import type { z } from 'zod';
import { parseSignalingEnv } from './env.js';
import type { signalingEnvSchema } from './env.js';
import { Matchmaker, type Client } from './matchmaker.js';
import { securityHeaders } from './security.js';
type Env = z.infer<typeof signalingEnvSchema>;
function publicIceServers(env: Env) {
  const servers: { urls: string[]; username?: string; credential?: string }[] = [
    { urls: env.STUN_URLS.split(',').map((url) => url.trim()) },
  ];
  if (env.TURN_URLS && env.TURN_SHARED_SECRET) {
    const username = `${String(Math.floor(Date.now() / 1000) + env.TURN_CREDENTIAL_TTL_SECONDS)}:${randomBytes(12).toString('base64url')}`;
    const credential = createHmac('sha1', env.TURN_SHARED_SECRET).update(username).digest('base64');
    servers.push({ urls: env.TURN_URLS.split(',').map((url) => url.trim()), username, credential });
  }
  return servers;
}
function decode(data: RawData): string {
  if (Array.isArray(data)) return Buffer.concat(data).toString();
  if (data instanceof ArrayBuffer) return Buffer.from(data).toString();
  return data.toString();
}
function dataSize(data: RawData): number {
  return Array.isArray(data)
    ? data.reduce((total, item) => total + item.byteLength, 0)
    : data.byteLength;
}
export async function buildServer(
  env: Env = parseSignalingEnv(process.env),
): Promise<FastifyInstance> {
  const app = Fastify({
    logger:
      env.NODE_ENV === 'test' ? false : { level: 'info', redact: ['req.headers.authorization'] },
    bodyLimit: env.SIGNAL_MAX_MESSAGE_BYTES,
  });
  await app.register(websocket, { options: { maxPayload: env.SIGNAL_MAX_MESSAGE_BYTES } });
  const matcher = new Matchmaker(env.SIGNAL_MAX_QUEUE_SIZE);
  let connections = 0;
  const peers = new Set<{ socket: WebSocket; lastSeen: number }>();
  const qt = setInterval(() => matcher.expireQueues(env.SIGNAL_QUEUE_TIMEOUT_MS), 1000).unref();
  const st = setInterval(() => matcher.expireSessions(env.SIGNAL_SESSION_TIMEOUT_MS), 1000).unref();
  const ht = setInterval(() => {
    const cutoff = Date.now() - env.SIGNAL_HEARTBEAT_MS * 2;
    for (const peer of peers) if (peer.lastSeen < cutoff) peer.socket.terminate();
  }, env.SIGNAL_HEARTBEAT_MS).unref();
  app.addHook('onRequest', (request, reply, done) => {
    for (const [name, value] of Object.entries(securityHeaders)) void reply.header(name, value);
    const origin = request.headers.origin;
    if (origin && env.SIGNAL_ALLOWED_ORIGINS.includes(origin)) {
      void reply.header('access-control-allow-origin', origin).header('vary', 'Origin');
    }
    done();
  });
  app.get('/health/live', () => ({ status: 'ok' }));
  app.get('/health/ready', (_request, reply) =>
    connections < env.SIGNAL_MAX_CONNECTIONS
      ? { status: 'ready' }
      : reply.code(503).send({ status: 'capacity' }),
  );
  app.get('/config', () => ({
    protocolVersion: 1,
    maxMessageBytes: env.SIGNAL_MAX_MESSAGE_BYTES,
    queueTimeoutMs: env.SIGNAL_QUEUE_TIMEOUT_MS,
    sessionTimeoutMs: env.SIGNAL_SESSION_TIMEOUT_MS,
    heartbeatMs: env.SIGNAL_HEARTBEAT_MS,
    turnConfigured: Boolean(env.TURN_URLS),
    iceServers: publicIceServers(env),
  }));
  app.get('/signal', { websocket: true }, (socket: WebSocket, request) => {
    const origin = request.headers.origin;
    if (
      !origin ||
      !env.SIGNAL_ALLOWED_ORIGINS.includes(origin) ||
      connections >= env.SIGNAL_MAX_CONNECTIONS
    ) {
      socket.close(1008, 'policy');
      return;
    }
    connections += 1;
    const peer = { socket, lastSeen: Date.now() };
    peers.add(peer);
    let closed = false;
    let started = Date.now();
    let count = 0;
    const client: Client = {
      id: randomBytes(24).toString('base64url'),
      send(message) {
        if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(message));
      },
    };
    const cleanup = () => {
      if (closed) return;
      closed = true;
      connections -= 1;
      peers.delete(peer);
      matcher.disconnect(client);
    };
    socket.on('message', (data, isBinary) => {
      peer.lastSeen = Date.now();
      if (isBinary || dataSize(data) > env.SIGNAL_MAX_MESSAGE_BYTES) {
        socket.close(1009, 'message too large');
        return;
      }
      if (Date.now() - started >= 10_000) {
        started = Date.now();
        count = 0;
      }
      count += 1;
      if (count > 100) {
        client.send({ v: 1, type: 'error', code: 'rate-limit' });
        return;
      }
      let raw: unknown;
      try {
        raw = JSON.parse(decode(data));
      } catch {
        client.send({ v: 1, type: 'error', code: 'invalid-message' });
        return;
      }
      const parsed = clientSignalSchema.safeParse(raw);
      if (!parsed.success) {
        client.send({ v: 1, type: 'error', code: 'invalid-message' });
        return;
      }
      const message = parsed.data;
      if (message.type === 'queue.join') matcher.join(client, message.requestId);
      else if (message.type === 'queue.leave') matcher.leave(client, message.requestId);
      else if (message.type === 'heartbeat')
        client.send({ v: 1, type: 'heartbeat.ack', nonce: message.nonce });
      else if (message.type === 'session.cancel') matcher.disconnect(client, 'cancelled');
      else if (!matcher.relay(client, message.sessionId, { ...message, v: 1 }))
        client.send({ v: 1, type: 'error', code: 'unauthorized' });
    });
    socket.on('close', cleanup);
    socket.on('error', cleanup);
  });
  app.addHook('onClose', () => {
    clearInterval(qt);
    clearInterval(st);
    clearInterval(ht);
    matcher.clear();
    return Promise.resolve();
  });
  return app;
}
