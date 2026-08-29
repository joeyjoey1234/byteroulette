import { randomBytes } from 'node:crypto';
import type { ServerSignal } from '@byteroulette/protocol';
export interface Client {
  readonly id: string;
  send(message: ServerSignal): void;
}
interface Queued {
  client: Client;
  requestId: string;
  joinedAt: number;
}
interface Session {
  id: string;
  first: Client;
  second: Client;
  createdAt: number;
}
export class Matchmaker {
  readonly queue: Queued[] = [];
  readonly sessions = new Map<string, Session>();
  readonly clientSessions = new Map<string, string>();
  constructor(
    private readonly queueLimit: number,
    private readonly fifoWindow = 4,
  ) {}
  join(client: Client, requestId: string): void {
    if (
      this.queue.some((item) => item.client.id === client.id) ||
      this.clientSessions.has(client.id)
    ) {
      client.send({ v: 1, type: 'error', code: 'conflict', requestId });
      return;
    }
    if (this.queue.length >= this.queueLimit) {
      client.send({ v: 1, type: 'error', code: 'capacity', requestId });
      return;
    }
    client.send({ v: 1, type: 'queue.joined', requestId });
    if (this.queue.length === 0) {
      this.queue.push({ client, requestId, joinedAt: Date.now() });
      return;
    }
    const index = Math.floor(Math.random() * Math.min(this.fifoWindow, this.queue.length));
    const queued = this.queue.splice(index, 1)[0];
    if (!queued) return;
    const id = randomBytes(24).toString('base64url');
    const session = { id, first: queued.client, second: client, createdAt: Date.now() };
    this.sessions.set(id, session);
    this.clientSessions.set(session.first.id, id);
    this.clientSessions.set(session.second.id, id);
    setImmediate(() => {
      if (!this.sessions.has(id)) return;
      session.first.send({ v: 1, type: 'session.matched', sessionId: id, role: 'offerer' });
      session.second.send({ v: 1, type: 'session.matched', sessionId: id, role: 'answerer' });
    });
  }
  leave(client: Client, requestId: string): void {
    const index = this.queue.findIndex((item) => item.client.id === client.id);
    if (index >= 0) this.queue.splice(index, 1);
    client.send({ v: 1, type: 'queue.left', requestId });
  }
  relay(client: Client, sessionId: string, message: ServerSignal): boolean {
    const session = this.sessions.get(sessionId);
    if (!session || (session.first.id !== client.id && session.second.id !== client.id))
      return false;
    (session.first.id === client.id ? session.second : session.first).send(message);
    return true;
  }
  disconnect(
    client: Client,
    reason: 'peer-left' | 'timeout' | 'cancelled' | 'error' = 'peer-left',
  ): void {
    const qi = this.queue.findIndex((item) => item.client.id === client.id);
    if (qi >= 0) this.queue.splice(qi, 1);
    const id = this.clientSessions.get(client.id);
    if (!id) return;
    const session = this.sessions.get(id);
    this.sessions.delete(id);
    if (!session) return;
    this.clientSessions.delete(session.first.id);
    this.clientSessions.delete(session.second.id);
    const peer = session.first.id === client.id ? session.second : session.first;
    peer.send({ v: 1, type: 'session.ended', sessionId: id, reason });
  }
  expireQueues(maxAge: number): void {
    const cutoff = Date.now() - maxAge;
    for (const item of [...this.queue])
      if (item.joinedAt <= cutoff) this.leave(item.client, item.requestId);
  }
  expireSessions(maxAge: number): void {
    const cutoff = Date.now() - maxAge;
    for (const session of [...this.sessions.values()])
      if (session.createdAt <= cutoff) this.disconnect(session.first, 'timeout');
  }
  clear(): void {
    for (const session of [...this.sessions.values()]) this.disconnect(session.first, 'error');
    this.queue.splice(0);
  }
}
