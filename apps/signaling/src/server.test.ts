import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import WebSocket, { type RawData } from 'ws';
import { z } from 'zod';
import { signalingEnvSchema } from './env.js';
import { buildServer } from './server.js';

const apps: Awaited<ReturnType<typeof buildServer>>[] = [];
const inboxes = new WeakMap<
  WebSocket,
  { messages: RawData[]; waiters: ((data: RawData) => void)[] }
>();
const requestId = 'abcdefghijklmnop';
async function setup() {
  const env = signalingEnvSchema.parse({
    NODE_ENV: 'test',
    SIGNAL_ALLOWED_ORIGINS: 'https://allowed.test',
    SIGNAL_QUEUE_TIMEOUT_MS: 60_000,
    SIGNAL_SESSION_TIMEOUT_MS: 60_000,
  });
  const app = await buildServer(env);
  apps.push(app);
  await app.listen({ host: '127.0.0.1', port: 0 });
  const port = (app.server.address() as AddressInfo).port;
  return { app, url: `ws://127.0.0.1:${String(port)}/signal` };
}
async function connect(url: string, origin = 'https://allowed.test') {
  const ws = new WebSocket(url, { origin });
  const inbox = { messages: [] as RawData[], waiters: [] as ((data: RawData) => void)[] };
  inboxes.set(ws, inbox);
  ws.on('message', (data) => {
    const waiter = inbox.waiters.shift();
    if (waiter) waiter(data);
    else inbox.messages.push(data);
  });
  await once(ws, 'open');
  return ws;
}
async function receive(ws: WebSocket): Promise<Record<string, unknown>> {
  const inbox = inboxes.get(ws);
  if (!inbox) throw new Error('Socket inbox missing');
  const data =
    inbox.messages.shift() ??
    (await new Promise<RawData>((resolve) => inbox.waiters.push(resolve)));
  const text = Array.isArray(data)
    ? Buffer.concat(data).toString()
    : data instanceof ArrayBuffer
      ? Buffer.from(data).toString()
      : data.toString();
  return JSON.parse(text) as Record<string, unknown>;
}
afterEach(async () => {
  await Promise.all(apps.splice(0).map(async (app) => app.close()));
});

describe('signaling service', () => {
  it('reports health and exposes only safe configuration', async () => {
    const { app } = await setup();
    expect((await app.inject('/health/live')).statusCode).toBe(200);
    expect((await app.inject('/health/live')).headers['x-content-type-options']).toBe('nosniff');
    const response = await app.inject('/config');
    expect(response.statusCode).toBe(200);
    expect(response.body).not.toContain('secret');
    expect(response.json()).toMatchObject({ protocolVersion: 1, turnConfigured: false });
    expect(response.json()).toMatchObject({
      iceServers: [{ urls: ['stun:stun.l.google.com:19302'] }],
    });
  });

  it('mints short-lived TURN REST credentials without revealing the secret', async () => {
    const env = signalingEnvSchema.parse({
      NODE_ENV: 'test',
      SIGNAL_ALLOWED_ORIGINS: 'https://allowed.test',
      TURN_URLS: 'turn:turn.test:3478',
      TURN_SHARED_SECRET: 'a-secure-test-secret-that-is-long-enough',
    });
    const app = await buildServer(env);
    apps.push(app);
    const response = await app.inject('/config');
    expect(response.body).not.toContain(env.TURN_SHARED_SECRET);
    const body = z
      .object({
        turnConfigured: z.boolean(),
        iceServers: z.array(
          z.object({
            urls: z.array(z.string()),
            username: z.string().optional(),
            credential: z.string().optional(),
          }),
        ),
      })
      .parse(JSON.parse(response.body) as unknown);
    expect(body.turnConfigured).toBe(true);
    expect(body.iceServers[1]?.urls).toEqual(['turn:turn.test:3478']);
    expect(body.iceServers[1]?.username).toBeTruthy();
    expect(body.iceServers[1]?.credential).toBeTruthy();
  });

  it('matches two clients and rejects cross-session injection', async () => {
    const { url } = await setup();
    const first = await connect(url);
    const second = await connect(url);
    const third = await connect(url);
    first.send(JSON.stringify({ v: 1, type: 'queue.join', requestId }));
    expect((await receive(first))['type']).toBe('queue.joined');
    second.send(JSON.stringify({ v: 1, type: 'queue.join', requestId }));
    expect((await receive(second))['type']).toBe('queue.joined');
    const matchedA = await receive(first);
    const matchedB = await receive(second);
    expect(matchedA['sessionId']).toBe(matchedB['sessionId']);
    third.send(
      JSON.stringify({
        v: 1,
        type: 'session.offer',
        sessionId: matchedA['sessionId'],
        sdp: 'injected',
      }),
    );
    expect(await receive(third)).toMatchObject({ type: 'error', code: 'unauthorized' });
    first.close();
    second.close();
    third.close();
  });

  it('destroys a session when either client disconnects', async () => {
    const { url } = await setup();
    const first = await connect(url);
    const second = await connect(url);
    first.send(JSON.stringify({ v: 1, type: 'queue.join', requestId }));
    await receive(first);
    second.send(JSON.stringify({ v: 1, type: 'queue.join', requestId }));
    await receive(second);
    await receive(first);
    const matched = await receive(second);
    first.close();
    expect(await receive(second)).toMatchObject({
      type: 'session.ended',
      sessionId: matched['sessionId'],
      reason: 'peer-left',
    });
    second.close();
  });

  it('rejects malformed messages and forbidden origins', async () => {
    const { url } = await setup();
    const allowed = await connect(url);
    allowed.send('{bad');
    expect(await receive(allowed)).toMatchObject({ type: 'error', code: 'invalid-message' });
    allowed.close();
    const denied = await connect(url, 'https://denied.test');
    const [code] = (await once(denied, 'close')) as [number];
    expect(code).toBe(1008);
  });

  it('closes an oversized signaling frame', async () => {
    const { url } = await setup();
    const socket = await connect(url);
    socket.send('x'.repeat(65_537));
    const [code] = (await once(socket, 'close')) as [number];
    expect(code).toBe(1009);
  });
});
