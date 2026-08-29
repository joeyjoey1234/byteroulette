import {
  clientSignalSchema,
  peerMessageSchema,
  serverSignalSchema,
  type PeerMessage,
} from '@byteroulette/protocol';
import {
  BLOB_FALLBACK_LIMIT,
  FileTransfer,
  type TransferEvent,
  type TransferOffer,
  type TransferSink,
} from './file-transfer.js';
import { sanitizeFilename } from './filename.js';
import { secureRandomUuid, secureRequestId } from './random-id.js';

declare global {
  interface Window {
    showSaveFilePicker?: (options: {
      suggestedName: string;
    }) => Promise<{ createWritable(): Promise<TransferSink> }>;
  }
}

export interface OfferedFile {
  name: string;
  size: number;
  type: string;
}
export interface PeerSessionOptions {
  signalUrl: string;
  file: OfferedFile;
  consentTimeoutMs?: number;
}
export type PeerSessionEvent =
  | {
      type: 'state';
      state:
        | 'searching'
        | 'matched'
        | 'negotiating'
        | 'connected'
        | 'waiting-consent'
        | 'ready'
        | 'queue-timeout'
        | 'peer-disconnected'
        | 'cancelled'
        | 'closed';
    }
  | { type: 'session'; sessionId: string }
  | { type: 'metadata'; metadata: OfferedFile }
  | { type: 'route'; route: 'direct' | 'relayed' | 'unknown' }
  | TransferEvent
  | { type: 'error'; message: string };

export class PeerSession {
  private static readonly MAX_FILE_BYTES = 512 * 1024 * 1024;
  private socket?: WebSocket;
  private peer?: RTCPeerConnection;
  private channel?: RTCDataChannel;
  private sessionId?: string;
  private readonly localTransferId: string = secureRandomUuid();
  private remoteTransferId?: string;
  private localAccepted = false;
  private remoteAccepted = false;
  private consentTimer?: number;
  private heartbeatTimer?: number;
  private negotiationTimer?: number;
  private recoveryAttempted = false;
  private closed = false;
  private remoteMetadataReceived = false;
  private remoteOffer?: TransferOffer;
  private transfer?: FileTransfer;
  private sink?: TransferSink;
  private readonly pendingTransferMessages: unknown[] = [];
  private readonly pendingIceCandidates: RTCIceCandidateInit[] = [];
  private readonly localName: string;
  private role?: 'offerer' | 'answerer';
  constructor(
    private readonly options: PeerSessionOptions,
    private readonly notify: (event: PeerSessionEvent) => void,
  ) {
    this.localName = sanitizeFilename(options.file.name);
  }

  async start(): Promise<void> {
    if (this.options.file.size > PeerSession.MAX_FILE_BYTES)
      throw new Error('Selected file exceeds the configured limit');
    const configUrl = this.options.signalUrl.replace(/^ws/, 'http').replace(/\/signal$/, '/config');
    const response = await fetch(configUrl);
    if (!response.ok) throw new Error('Unable to load connection configuration');
    const config = (await response.json()) as { iceServers: RTCIceServer[]; heartbeatMs: number };
    this.peer = new RTCPeerConnection({ iceServers: config.iceServers });
    this.bindPeer();
    this.socket = new WebSocket(this.options.signalUrl);
    await new Promise<void>((resolve, reject) => {
      if (!this.socket) return reject(new Error('Signaling unavailable'));
      this.socket.addEventListener('open', () => resolve(), { once: true });
      this.socket.addEventListener('error', () => reject(new Error('Signaling unavailable')), {
        once: true,
      });
    });
    this.socket.addEventListener(
      'message',
      (event) => void this.onSignal(event).catch(() => this.close('WebRTC negotiation failed')),
    );
    this.socket.addEventListener('close', () => this.close('Signaling closed'));
    this.heartbeatTimer = window.setInterval(
      () =>
        this.sendSignal({
          v: 1,
          type: 'heartbeat',
          nonce: secureRequestId(),
        }),
      Math.max(1000, Math.floor(config.heartbeatMs / 2)),
    );
    this.sendSignal({
      v: 1,
      type: 'queue.join',
      requestId: secureRequestId(),
    });
    this.notify({ type: 'state', state: 'searching' });
  }

  async accept(): Promise<void> {
    if (this.channel?.readyState !== 'open') throw new Error('Peer channel is not open');
    this.localAccepted = true;
    if (!this.remoteTransferId) throw new Error('Peer metadata is not available');
    if (
      !window.showSaveFilePicker &&
      this.remoteOffer &&
      this.remoteOffer.size > BLOB_FALLBACK_LIMIT
    )
      throw new Error(
        'This browser cannot receive a file that large without streaming save support',
      );
    if (window.showSaveFilePicker && this.remoteOffer) {
      const handle = await window.showSaveFilePicker({ suggestedName: this.remoteOffer.name });
      this.sink = await handle.createWritable();
    }
    this.sendPeer({ v: 1, type: 'consent', transferId: this.remoteTransferId, accepted: true });
    this.updateConsent();
  }
  reject(): void {
    if (this.channel?.readyState === 'open')
      this.sendPeer({
        v: 1,
        type: 'consent',
        transferId: this.remoteTransferId ?? this.localTransferId,
        accepted: false,
      });
    this.close();
  }
  canTransfer(): boolean {
    return this.localAccepted && this.remoteAccepted && this.channel?.readyState === 'open';
  }
  close(message?: string): void {
    if (this.closed) return;
    this.closed = true;
    if (this.consentTimer) clearTimeout(this.consentTimer);
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    if (this.negotiationTimer) clearTimeout(this.negotiationTimer);
    this.transfer?.close();
    this.channel?.close();
    this.peer?.close();
    this.socket?.close();
    this.notify(message ? { type: 'error', message } : { type: 'state', state: 'closed' });
  }
  cancelTransfer(): void {
    this.transfer?.cancel();
  }

  private bindPeer(): void {
    const peer = this.peer;
    if (!peer) return;
    peer.addEventListener('icecandidate', (event) => {
      if (event.candidate && this.sessionId)
        this.sendSignal({
          v: 1,
          type: 'session.ice',
          sessionId: this.sessionId,
          candidate: {
            candidate: event.candidate.candidate,
            sdpMid: event.candidate.sdpMid,
            sdpMLineIndex: event.candidate.sdpMLineIndex,
          },
        });
    });
    peer.addEventListener('datachannel', (event) => this.bindChannel(event.channel));
    peer.addEventListener('connectionstatechange', () => {
      if (peer.connectionState === 'connected') {
        if (this.negotiationTimer) clearTimeout(this.negotiationTimer);
        this.notify({ type: 'state', state: 'connected' });
        void this.detectRoute();
      } else if (peer.connectionState === 'failed' && !this.recoveryAttempted) {
        this.recoveryAttempted = true;
        void this.restartConnection();
      } else if (peer.connectionState === 'failed' || peer.connectionState === 'closed')
        this.close('Peer connection failed');
    });
  }
  private bindChannel(channel: RTCDataChannel): void {
    this.channel = channel;
    channel.binaryType = 'arraybuffer';
    channel.addEventListener('open', () => {
      if (this.negotiationTimer) clearTimeout(this.negotiationTimer);
      this.sendMetadata();
      this.notify({ type: 'state', state: 'waiting-consent' });
      this.consentTimer = window.setTimeout(
        () => this.close('Consent timed out'),
        this.options.consentTimeoutMs ?? 120_000,
      );
    });
    channel.addEventListener('message', (event) => this.onPeerMessage(event.data));
    channel.addEventListener('close', () => this.close('Peer disconnected'));
  }
  private async onSignal(event: MessageEvent): Promise<void> {
    let raw: unknown;
    try {
      raw = JSON.parse(String(event.data));
    } catch {
      return;
    }
    const parsed = serverSignalSchema.safeParse(raw);
    if (!parsed.success) return;
    const message = parsed.data;
    if (message.type === 'session.matched') {
      this.sessionId = message.sessionId;
      this.role = message.role;
      this.notify({ type: 'session', sessionId: message.sessionId });
      this.notify({ type: 'state', state: 'matched' });
      this.armNegotiationTimeout();
      if (message.role === 'offerer') {
        const channel = this.peer?.createDataChannel('byteroulette', { ordered: true });
        if (channel) this.bindChannel(channel);
        const offer = await this.peer?.createOffer();
        if (offer && this.peer) {
          await this.peer.setLocalDescription(offer);
          this.sendSignal({
            v: 1,
            type: 'session.offer',
            sessionId: message.sessionId,
            sdp: offer.sdp ?? '',
          });
        }
      }
      this.notify({ type: 'state', state: 'negotiating' });
    } else if (message.type === 'session.offer' && this.peer) {
      await this.setRemoteDescription({ type: 'offer', sdp: message.sdp });
      const answer = await this.peer.createAnswer();
      await this.peer.setLocalDescription(answer);
      this.sendSignal({
        v: 1,
        type: 'session.answer',
        sessionId: message.sessionId,
        sdp: answer.sdp ?? '',
      });
    } else if (message.type === 'session.answer' && this.peer)
      await this.setRemoteDescription({ type: 'answer', sdp: message.sdp });
    else if (message.type === 'session.ice' && this.peer) {
      if (this.peer.remoteDescription) await this.peer.addIceCandidate(message.candidate);
      else this.pendingIceCandidates.push(message.candidate);
    } else if (message.type === 'queue.left') {
      this.notify({ type: 'state', state: 'queue-timeout' });
      this.close();
    } else if (message.type === 'session.ended') {
      const state =
        message.reason === 'peer-left'
          ? 'peer-disconnected'
          : message.reason === 'cancelled'
            ? 'cancelled'
            : undefined;
      if (state) {
        this.notify({ type: 'state', state });
        this.close();
      } else this.close(message.reason === 'timeout' ? 'Session timed out' : 'Session ended');
    } else if (message.type === 'error') {
      const messages = {
        'invalid-message': 'Signaling rejected an invalid message',
        unauthorized: 'Signaling authorization failed',
        capacity: 'The matchmaking service is at capacity',
        'rate-limit': 'Signaling rate limit exceeded',
        'not-found': 'The signaling session no longer exists',
        conflict: 'This browser already has an active exchange',
        internal: 'The signaling service encountered an error',
      } as const;
      this.close(messages[message.code]);
    }
  }

  private async setRemoteDescription(description: RTCSessionDescriptionInit): Promise<void> {
    if (!this.peer) return;
    await this.peer.setRemoteDescription(description);
    for (const candidate of this.pendingIceCandidates.splice(0))
      await this.peer.addIceCandidate(candidate);
  }

  private armNegotiationTimeout(timeoutMs = 30_000): void {
    if (this.negotiationTimer) clearTimeout(this.negotiationTimer);
    this.negotiationTimer = window.setTimeout(
      () => this.close('Connection negotiation timed out'),
      timeoutMs,
    );
  }

  private async restartConnection(): Promise<void> {
    if (!this.peer || !this.sessionId) return;
    this.armNegotiationTimeout(15_000);
    this.peer.restartIce();
    if (this.role !== 'offerer') return;
    const offer = await this.peer.createOffer({ iceRestart: true });
    await this.peer.setLocalDescription(offer);
    this.sendSignal({
      v: 1,
      type: 'session.offer',
      sessionId: this.sessionId,
      sdp: offer.sdp ?? '',
    });
  }
  private onPeerMessage(raw: unknown): void {
    if (raw instanceof ArrayBuffer) {
      if (this.transfer) void this.transfer.message(raw);
      else this.pendingTransferMessages.push(raw);
      return;
    }
    if (typeof raw !== 'string') return;
    let value: unknown;
    try {
      value = JSON.parse(raw);
    } catch {
      return;
    }
    const parsed = peerMessageSchema.safeParse(value);
    if (!parsed.success) return;
    const message = parsed.data;
    if (message.type === 'metadata') {
      if (this.remoteMetadataReceived) return;
      this.remoteMetadataReceived = true;
      this.remoteTransferId = message.transferId;
      if (message.size > PeerSession.MAX_FILE_BYTES) {
        this.close('Peer file exceeds the configured limit');
        return;
      }
      const safeName = sanitizeFilename(message.name);
      this.remoteOffer = {
        id: message.transferId,
        name: safeName,
        size: message.size,
        type: message.mime,
      };
      this.notify({
        type: 'metadata',
        metadata: { name: safeName, size: message.size, type: message.mime },
      });
      this.sendMetadata();
    } else if (message.type === 'consent') {
      if (!message.accepted) {
        this.close('Peer rejected the exchange');
        return;
      }
      if (message.transferId !== this.localTransferId) return;
      this.remoteAccepted = true;
      this.updateConsent();
    } else if (this.transfer) void this.transfer.message(raw);
    else this.pendingTransferMessages.push(raw);
  }
  private updateConsent(): void {
    if (this.canTransfer()) {
      if (this.consentTimer) clearTimeout(this.consentTimer);
      this.notify({ type: 'state', state: 'ready' });
      this.startTransfer();
    } else if (this.localAccepted) this.notify({ type: 'state', state: 'waiting-consent' });
  }
  private sendSignal(message: unknown): void {
    const parsed = clientSignalSchema.parse(message);
    this.socket?.send(JSON.stringify(parsed));
  }
  private sendPeer(message: PeerMessage): void {
    this.channel?.send(JSON.stringify(message));
  }
  private sendMetadata(): void {
    this.sendPeer({
      v: 1,
      type: 'metadata',
      transferId: this.localTransferId,
      name: this.localName,
      size: this.options.file.size,
      mime: this.options.file.type,
    });
  }
  private startTransfer(): void {
    if (this.transfer || !this.channel || !this.remoteOffer) return;
    this.transfer = new FileTransfer(
      this.channel,
      this.localTransferId,
      this.remoteOffer,
      (event) => this.notify(event),
      this.sink,
    );
    for (const message of this.pendingTransferMessages.splice(0))
      void this.transfer.message(message);
    if (this.options.file instanceof Blob)
      void this.transfer.send(this.options.file).catch((error: unknown) =>
        this.notify({
          type: 'failure',
          message: error instanceof Error ? error.message : 'Send failed',
        }),
      );
  }
  private async detectRoute(): Promise<void> {
    const stats = await this.peer?.getStats();
    let route: 'direct' | 'relayed' | 'unknown' = 'unknown';
    stats?.forEach((value) => {
      const report = value as unknown as {
        type: string;
        state?: string;
        nominated?: boolean;
        localCandidateId?: string;
        remoteCandidateId?: string;
      };
      if (
        report.type === 'candidate-pair' &&
        report.state === 'succeeded' &&
        report.nominated &&
        report.localCandidateId &&
        report.remoteCandidateId
      ) {
        const local = stats.get(report.localCandidateId) as unknown as
          { candidateType?: string } | undefined;
        const remote = stats.get(report.remoteCandidateId) as unknown as
          { candidateType?: string } | undefined;
        if (local?.candidateType === 'relay' || remote?.candidateType === 'relay')
          route = 'relayed';
        else route = 'direct';
      }
    });
    this.notify({ type: 'route', route });
  }
}
