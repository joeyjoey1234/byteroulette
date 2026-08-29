import { peerMessageSchema } from '@byteroulette/protocol';
import { IncrementalHash } from './incremental-hash.js';

const HEADER_BYTES = 20;
const CHUNK_SIZE = 64 * 1024;
const HIGH_WATER = 1024 * 1024;
export const BLOB_FALLBACK_LIMIT = 256 * 1024 * 1024;
export interface TransferOffer {
  id: string;
  name: string;
  size: number;
  type: string;
}
export interface TransferSink {
  write(bytes: ArrayBuffer): Promise<void>;
  close(): Promise<void>;
  abort(): Promise<void>;
}
export type TransferEvent =
  | {
      type: 'progress';
      direction: 'sending' | 'receiving';
      bytes: number;
      total: number;
      bytesPerSecond: number;
      estimatedSeconds: number | null;
    }
  | { type: 'received'; name: string; mime: string; blob?: Blob; sha256: string }
  | { type: 'sent'; sha256: string }
  | { type: 'peer-verified'; sha256: string }
  | { type: 'integrity-failure'; message: string }
  | { type: 'failure'; message: string };

function uuidBytes(uuid: string): Uint8Array {
  return Uint8Array.from(uuid.replaceAll('-', '').match(/.{2}/g) ?? [], (value) =>
    Number.parseInt(value, 16),
  );
}
function bytesUuid(bytes: Uint8Array): string {
  const hex = [...bytes].map((value) => value.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
function frame(id: string, sequence: number, payload: ArrayBuffer): ArrayBuffer {
  const output = new Uint8Array(HEADER_BYTES + payload.byteLength);
  output.set(uuidBytes(id));
  new DataView(output.buffer).setUint32(16, sequence);
  output.set(new Uint8Array(payload), HEADER_BYTES);
  return output.buffer;
}

export class FileTransfer {
  private readonly hash = new IncrementalHash();
  private sequence = 0;
  private bytes = 0;
  private started = 0;
  private chunks: ArrayBuffer[] = [];
  private receiving = false;
  private cancelled = false;
  private receiveChain: Promise<void> = Promise.resolve();
  private receiveRate = 0;
  private previousReceiveBytes = 0;
  private previousReceiveTime = 0;
  constructor(
    private readonly channel: RTCDataChannel,
    private readonly localId: string,
    private readonly remote: TransferOffer,
    private readonly notify: (event: TransferEvent) => void,
    private readonly sink?: TransferSink,
  ) {}
  async send(file: Blob): Promise<void> {
    if (this.cancelled) return;
    this.channel.send(
      JSON.stringify({
        v: 1,
        type: 'transfer.start',
        transferId: this.localId,
        chunkSize: CHUNK_SIZE,
      }),
    );
    let sequence = 0;
    let sent = 0;
    const started = performance.now();
    let previousTime = started;
    let previousBytes = 0;
    let smoothedRate = 0;
    for (let offset = 0; offset < file.size; offset += CHUNK_SIZE) {
      if (this.isCancelled()) throw new Error('Transfer cancelled');
      await this.backpressure();
      const bytes = await file
        .slice(offset, Math.min(file.size, offset + CHUNK_SIZE))
        .arrayBuffer();
      await this.hash.update(this.localId, bytes.slice(0));
      this.channel.send(frame(this.localId, sequence, bytes));
      sequence += 1;
      sent += bytes.byteLength;
      const now = performance.now();
      const instantaneous = (sent - previousBytes) / Math.max((now - previousTime) / 1000, 0.001);
      smoothedRate = smoothedRate === 0 ? instantaneous : smoothedRate * 0.8 + instantaneous * 0.2;
      previousTime = now;
      previousBytes = sent;
      this.notify({
        type: 'progress',
        direction: 'sending',
        bytes: sent,
        total: file.size,
        bytesPerSecond: smoothedRate,
        estimatedSeconds: smoothedRate > 0 ? (file.size - sent) / smoothedRate : null,
      });
    }
    const sha256 = await this.hash.digest(this.localId);
    this.channel.send(
      JSON.stringify({
        v: 1,
        type: 'transfer.end',
        transferId: this.localId,
        chunks: sequence,
        sha256,
      }),
    );
    this.notify({ type: 'sent', sha256 });
  }
  message(data: unknown): Promise<void> {
    this.receiveChain = this.receiveChain.then(() => this.process(data));
    return this.receiveChain;
  }
  private async process(data: unknown): Promise<void> {
    try {
      if (data instanceof ArrayBuffer) {
        await this.chunk(data);
        return;
      }
      if (typeof data !== 'string') throw new Error('Unexpected DataChannel payload');
      const parsed = peerMessageSchema.safeParse(JSON.parse(data) as unknown);
      if (!parsed.success) throw new Error('Invalid transfer control message');
      const message = parsed.data;
      if (message.type === 'transfer.start') {
        if (message.transferId !== this.remote.id || this.receiving)
          throw new Error('Unexpected transfer start');
        this.receiving = true;
        this.started = performance.now();
        return;
      }
      if (message.type === 'transfer.end') {
        await this.finish(message.transferId, message.chunks, message.sha256);
        return;
      }
      if (message.type === 'transfer.verified') {
        if (message.transferId !== this.localId) throw new Error('Unexpected verification');
        this.notify({ type: 'peer-verified', sha256: message.sha256 });
        return;
      }
      if (message.type === 'transfer.cancel') {
        this.cancelled = true;
        await this.hash.cancel(this.remote.id);
        this.cleanup();
        this.notify({ type: 'failure', message: 'Peer cancelled transfer' });
      }
    } catch (error) {
      this.fail(error instanceof Error ? error.message : 'Transfer protocol failure');
    }
  }
  cancel(): void {
    if (this.cancelled) return;
    this.cancelled = true;
    this.channel.send(
      JSON.stringify({ v: 1, type: 'transfer.cancel', transferId: this.localId, reason: 'user' }),
    );
    void this.hash.cancel(this.localId);
    void this.hash.cancel(this.remote.id);
    this.cleanup();
  }
  close(): void {
    this.cancelled = true;
    this.cleanup();
    this.hash.close();
  }
  private async chunk(data: ArrayBuffer): Promise<void> {
    if (!this.receiving) throw new Error('Chunk before transfer start');
    if (data.byteLength < HEADER_BYTES) throw new Error('Truncated chunk');
    const header = new Uint8Array(data, 0, HEADER_BYTES);
    if (bytesUuid(header.subarray(0, 16)) !== this.remote.id)
      throw new Error('Unexpected transfer identifier');
    const sequence = new DataView(data).getUint32(16);
    if (sequence !== this.sequence) throw new Error('Missing or duplicate chunk');
    const payload = data.slice(HEADER_BYTES);
    if (payload.byteLength > CHUNK_SIZE || this.bytes + payload.byteLength > this.remote.size)
      throw new Error('Oversized transfer');
    if (!this.sink && this.remote.size > BLOB_FALLBACK_LIMIT)
      throw new Error('File requires streaming save support');
    await this.hash.update(this.remote.id, payload.slice(0));
    if (this.sink) await this.sink.write(payload);
    else this.chunks.push(payload);
    this.sequence += 1;
    this.bytes += payload.byteLength;
    const now = performance.now();
    const previous = this.previousReceiveTime || this.started;
    const instantaneous =
      (this.bytes - this.previousReceiveBytes) / Math.max((now - previous) / 1000, 0.001);
    this.receiveRate =
      this.receiveRate === 0 ? instantaneous : this.receiveRate * 0.8 + instantaneous * 0.2;
    this.previousReceiveTime = now;
    this.previousReceiveBytes = this.bytes;
    this.notify({
      type: 'progress',
      direction: 'receiving',
      bytes: this.bytes,
      total: this.remote.size,
      bytesPerSecond: this.receiveRate,
      estimatedSeconds:
        this.receiveRate > 0 ? (this.remote.size - this.bytes) / this.receiveRate : null,
    });
  }
  private async finish(id: string, chunks: number, expected: string): Promise<void> {
    if (
      id !== this.remote.id ||
      !this.receiving ||
      chunks !== this.sequence ||
      this.bytes !== this.remote.size
    )
      throw new Error('Incomplete transfer');
    const actual = await this.hash.digest(id);
    if (actual !== expected) {
      this.cleanup();
      this.notify({ type: 'integrity-failure', message: 'SHA-256 mismatch' });
      return;
    }
    if (this.sink) {
      await this.sink.close();
      this.channel.send(
        JSON.stringify({ v: 1, type: 'transfer.verified', transferId: id, sha256: actual }),
      );
      this.notify({
        type: 'received',
        name: this.remote.name,
        mime: this.remote.type,
        sha256: actual,
      });
    } else {
      const blob = new Blob(this.chunks, { type: this.remote.type || 'application/octet-stream' });
      this.chunks = [];
      this.channel.send(
        JSON.stringify({ v: 1, type: 'transfer.verified', transferId: id, sha256: actual }),
      );
      this.notify({
        type: 'received',
        name: this.remote.name,
        mime: this.remote.type,
        blob,
        sha256: actual,
      });
    }
  }
  private async backpressure(): Promise<void> {
    if (this.channel.bufferedAmount <= HIGH_WATER) return;
    this.channel.bufferedAmountLowThreshold = HIGH_WATER / 2;
    await new Promise<void>((resolve) =>
      this.channel.addEventListener('bufferedamountlow', () => resolve(), { once: true }),
    );
  }
  private fail(message: string): void {
    this.cancelled = true;
    void this.sink?.abort();
    this.cleanup();
    this.notify({ type: 'failure', message });
  }
  private cleanup(): void {
    this.chunks = [];
    this.bytes = 0;
    this.sequence = 0;
  }
  private isCancelled(): boolean {
    return this.cancelled;
  }
}
