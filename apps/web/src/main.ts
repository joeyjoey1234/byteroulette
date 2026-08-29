import { workflowStates, type WorkflowState } from '@byteroulette/protocol';
import { PeerSession, type PeerSessionEvent } from './peer-session.js';
import './styles.css';

declare global {
  interface Window {
    ByteRoulette: { PeerSession: typeof PeerSession };
  }
}
window.ByteRoulette = { PeerSession };

interface View {
  eyebrow: string;
  title: string;
  copy: string;
  action?: string;
  tone?: string;
  progress?: number;
}
const views: Record<WorkflowState, View> = {
  landing: {
    eyebrow: 'Peer-to-peer file exchange',
    title: 'Trade a file with a stranger.',
    copy: 'A deliberate, two-way exchange. You both inspect the offer. You both consent. Then—and only then—bytes move.',
    action: 'Begin exchange',
  },
  safety: {
    eyebrow: 'Safety checkpoint',
    title: 'Treat every file as untrusted.',
    copy: 'ByteRoulette cannot scan files or identify your peer. Review the filename and size. Save only what you understand.',
    action: 'I understand',
    tone: 'warn',
  },
  'file-selected': {
    eyebrow: 'Your payload',
    title: 'signal-noise.wav',
    copy: '18.4 MB · audio/wav. Metadata stays here until a private peer channel opens.',
    action: 'Review exchange',
  },
  ready: {
    eyebrow: 'Payload armed',
    title: 'Ready to enter the queue.',
    copy: 'Your file bytes remain local. You can leave matchmaking at any time.',
    action: 'Find a peer',
  },
  searching: {
    eyebrow: 'Matchmaking / 00:18',
    title: 'Scanning the live network…',
    copy: 'Looking through a randomized FIFO window. No file details have reached signaling.',
    action: 'Leave queue',
    progress: 34,
  },
  matched: {
    eyebrow: 'Peer acquired',
    title: 'A counterpart answered.',
    copy: 'The session is ephemeral. Establishing a private transport path now.',
    progress: 46,
  },
  negotiating: {
    eyebrow: 'Transport negotiation',
    title: 'Finding a viable route…',
    copy: 'Trying direct WebRTC first. An encrypted TURN relay may be used if networks require it.',
    action: 'Cancel',
    progress: 58,
  },
  'peer-review': {
    eyebrow: 'Incoming offer',
    title: 'field-notes.txt',
    copy: '42 KB · text/plain · from your peer. The file could be harmful despite transport verification.',
    action: 'Accept this exchange',
    tone: 'warn',
  },
  'waiting-consent': {
    eyebrow: 'Your consent recorded',
    title: 'Waiting for your peer.',
    copy: 'No file bytes move until the second acceptance arrives.',
    action: 'Withdraw consent',
    progress: 66,
  },
  exchanging: {
    eyebrow: 'Encrypted peer channel',
    title: 'Exchanging both directions.',
    copy: 'Preparing live sending and receiving telemetry.',
    action: 'Cancel transfers',
    progress: 72,
  },
  verifying: {
    eyebrow: 'Integrity pass',
    title: 'Reconstructing and hashing…',
    copy: 'Checking received bytes against the peer’s SHA-256 declaration before completion.',
    progress: 94,
  },
  complete: {
    eyebrow: 'Exchange complete',
    title: 'Both payloads verified.',
    copy: 'Your received file is ready to save. The session will be destroyed when you leave.',
    action: 'Save received file',
    tone: 'ok',
    progress: 100,
  },
  rejected: {
    eyebrow: 'Consent declined',
    title: 'The exchange did not begin.',
    copy: 'One peer rejected the offer. No file bytes were transferred.',
    action: 'Return home',
    tone: 'warn',
  },
  cancelled: {
    eyebrow: 'Session cancelled',
    title: 'Transfer channels closed.',
    copy: 'In-flight work was stopped and temporary session state was released.',
    action: 'Start again',
    tone: 'warn',
  },
  'peer-disconnected': {
    eyebrow: 'Peer lost',
    title: 'The other endpoint disappeared.',
    copy: 'The session and unfinished receive data were discarded.',
    action: 'Find another peer',
    tone: 'fail',
  },
  'queue-timeout': {
    eyebrow: 'Queue timeout',
    title: 'No counterpart arrived.',
    copy: 'Your queue entry expired. Your file remained on this device.',
    action: 'Search again',
    tone: 'warn',
  },
  'connection-failure': {
    eyebrow: 'Route unavailable',
    title: 'A peer channel could not open.',
    copy: 'Direct and configured relay paths failed. Check network policy and retry.',
    action: 'Retry',
    tone: 'fail',
  },
  'transfer-failure': {
    eyebrow: 'Transfer interrupted',
    title: 'The byte stream broke.',
    copy: 'Partial receive data was discarded; this file cannot be saved.',
    action: 'Return home',
    tone: 'fail',
  },
  'integrity-failure': {
    eyebrow: 'Integrity mismatch',
    title: 'Do not use this file.',
    copy: 'The received bytes did not match the declared SHA-256 hash and were rejected.',
    action: 'Discard and close',
    tone: 'fail',
  },
  'unsupported-browser': {
    eyebrow: 'Browser unsupported',
    title: 'Required peer APIs are missing.',
    copy: 'Use a current browser with WebRTC DataChannel, Web Workers, and secure-context support.',
    tone: 'fail',
  },
};
const requested = new URLSearchParams(location.search).get('state');
const supported =
  typeof RTCPeerConnection !== 'undefined' &&
  typeof WebSocket !== 'undefined' &&
  typeof Worker !== 'undefined' &&
  typeof crypto !== 'undefined' &&
  typeof crypto.getRandomValues === 'function';
const state: WorkflowState = !supported
  ? 'unsupported-browser'
  : import.meta.env.DEV && workflowStates.includes(requested as WorkflowState)
    ? (requested as WorkflowState)
    : 'landing';
const view = views[state];
const progress = String(view.progress ?? 8);
const root = document.querySelector<HTMLElement>('#app');
if (!root) throw new Error('Application root missing');
const appRoot = root;
const information = document.querySelector<HTMLDialogElement>('#information');
root.innerHTML = `<div class="field" aria-hidden="true"><i></i><i></i><i></i><i></i></div><header class="topbar"><a class="brand" href="/" aria-label="ByteRoulette home"><img src="/logo.svg" alt=""><span>BYTE<b>ROULETTE</b></span></a><div class="status"><span></span> EPHEMERAL NETWORK</div><button class="info" type="button">PRIVACY / SAFETY</button></header><main class="shell" data-state="${state}"><section class="stage" aria-labelledby="state-title" aria-live="polite"><p class="eyebrow"><span>${view.eyebrow}</span><em>${String(workflowStates.indexOf(state) + 1).padStart(2, '0')} / 20</em></p><div class="visual ${view.tone ?? ''}" aria-hidden="true"><div class="node"><span></span><small>YOU</small></div><div class="beam"><b style="--p:${progress}%"></b><i></i><i></i><i></i></div><div class="node peer"><span></span><small>${['landing', 'safety', 'file-selected', 'ready', 'searching'].includes(state) ? 'UNKNOWN' : 'PEER'}</small></div></div><div class="copy"><h1 id="state-title">${view.title}</h1><p>${view.copy}</p></div><div class="meter" role="progressbar" aria-label="Workflow progress" aria-valuenow="${progress}" aria-valuemin="0" aria-valuemax="100" ${view.progress === undefined ? 'hidden' : ''}><span style="width:${progress}%"></span></div><div class="actions"><button class="primary" type="button" ${view.action ? '' : 'hidden'}>${view.action ?? 'Continue'}<span aria-hidden="true">↗</span></button><button class="secondary" type="button" ${state === 'safety' || state === 'peer-review' || state === 'complete' ? '' : 'hidden'}>${state === 'complete' ? 'Start another exchange' : 'Decline'}</button></div><p class="footnote">01 No accounts&nbsp;&nbsp; 02 No file storage&nbsp;&nbsp; 03 Mutual consent</p></section><aside class="rail" aria-label="Session telemetry"><div><small>SESSION</small><strong data-telemetry="session">NOT STARTED</strong></div><div><small>TRANSPORT</small><strong data-telemetry="transport">PENDING</strong></div><div><small>ROUTE</small><strong data-telemetry="route">UNRESOLVED</strong></div><div class="rule"></div><p>Files may be malicious. Encryption protects transport, not trust.</p></aside></main><footer><span>PROTOCOL V1</span><span data-footer-state>STATE / ${state.toUpperCase()}</span><span>NO TRACKERS</span></footer>`;
document.querySelector<HTMLButtonElement>('.primary')?.focus();

let runtimeState: WorkflowState = state;
let session: PeerSession | undefined;
let selectedFile: File | undefined;
let remoteFile: { name: string; size: number; type: string } | undefined;
let receivedFile: { blob: Blob; name: string } | undefined;
let receivedName: string | undefined;
let receivedVerified = false;
let sentVerified = false;
let sessionLabel = 'NOT STARTED';
let transportLabel = 'PENDING';
let routeLabel = 'UNRESOLVED';
let sendingProgress: Extract<PeerSessionEvent, { type: 'progress' }> | undefined;
let receivingProgress: Extract<PeerSessionEvent, { type: 'progress' }> | undefined;
const input = document.createElement('input');
input.type = 'file';
input.hidden = true;
appRoot.append(input);

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${String(bytes)} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function updateTelemetry(): void {
  const values = { session: sessionLabel, transport: transportLabel, route: routeLabel };
  for (const [key, value] of Object.entries(values)) {
    const element = appRoot.querySelector(`[data-telemetry="${key}"]`);
    if (element) element.textContent = value;
  }
}

function transferSummary(): string {
  const parts: string[] = [];
  if (sendingProgress)
    parts.push(
      `Sending ${formatBytes(sendingProgress.bytes)} / ${formatBytes(sendingProgress.total)}`,
    );
  if (receivingProgress)
    parts.push(
      `Receiving ${formatBytes(receivingProgress.bytes)} / ${formatBytes(receivingProgress.total)}`,
    );
  const rate = receivingProgress?.bytesPerSecond ?? sendingProgress?.bytesPerSecond;
  if (rate !== undefined) parts.push(`${formatBytes(rate)}/s`);
  const eta = receivingProgress?.estimatedSeconds ?? sendingProgress?.estimatedSeconds;
  if (eta !== undefined && eta !== null) parts.push(`about ${String(Math.ceil(eta))} sec`);
  return parts.join(' · ') || 'The encrypted byte streams are active.';
}

function applyState(next: WorkflowState): void {
  runtimeState = next;
  const nextView = views[next];
  appRoot.querySelector('main')?.setAttribute('data-state', next);
  const footerState = appRoot.querySelector('[data-footer-state]');
  if (footerState) footerState.textContent = `STATE / ${next.toUpperCase()}`;
  const heading = appRoot.querySelector('h1');
  const copy = appRoot.querySelector('.copy p');
  const eyebrow = appRoot.querySelector('.eyebrow span');
  if (heading) heading.textContent = nextView.title;
  if (copy) copy.textContent = nextView.copy;
  if (next === 'file-selected' && selectedFile) {
    if (heading) heading.textContent = selectedFile.name;
    if (copy)
      copy.textContent = `${formatBytes(selectedFile.size)} · ${selectedFile.type || 'unknown type'}. Metadata stays here until a private peer channel opens.`;
  }
  if (next === 'peer-review' && remoteFile) {
    if (heading) heading.textContent = remoteFile.name;
    if (copy)
      copy.textContent = `${formatBytes(remoteFile.size)} · ${remoteFile.type || 'unknown type'} · from your peer. The file could be harmful despite transport verification.`;
  }
  if (next === 'complete' && receivedName && copy)
    copy.textContent = receivedFile
      ? `${receivedName} remains ready on this device until you save it or start another exchange.`
      : `${receivedName} was written to the location you selected and passed SHA-256 verification.`;
  if (next === 'exchanging' && copy) copy.textContent = transferSummary();
  if (eyebrow) eyebrow.textContent = nextView.eyebrow;
  const button = appRoot.querySelector<HTMLButtonElement>('.primary');
  if (button) {
    button.hidden = !nextView.action;
    if (next === 'complete' && !receivedFile) button.hidden = true;
    button.textContent = nextView.action ?? 'Continue';
    const arrow = document.createElement('span');
    arrow.setAttribute('aria-hidden', 'true');
    arrow.textContent = '↗';
    button.append(arrow);
  }
  const secondary = appRoot.querySelector<HTMLButtonElement>('.secondary');
  if (secondary) {
    secondary.hidden = !['safety', 'peer-review', 'complete'].includes(next);
    secondary.textContent = next === 'complete' ? 'Start another exchange' : 'Decline';
  }
  const meter = appRoot.querySelector<HTMLElement>('.meter');
  if (meter) {
    meter.hidden = nextView.progress === undefined;
    const value = String(nextView.progress ?? 0);
    meter.setAttribute('aria-valuenow', value);
    meter.querySelector<HTMLElement>('span')?.style.setProperty('width', `${value}%`);
  }
}

function onSession(event: PeerSessionEvent): void {
  if (runtimeState === 'complete') return;
  if (event.type === 'metadata') {
    remoteFile = event.metadata;
    applyState('peer-review');
  } else if (event.type === 'received') {
    receivedVerified = true;
    receivedName = event.name;
    if (event.blob) receivedFile = { blob: event.blob, name: event.name };
    applyState(sentVerified ? 'complete' : 'verifying');
  } else if (event.type === 'peer-verified') {
    sentVerified = true;
    applyState(receivedVerified ? 'complete' : 'verifying');
  } else if (event.type === 'progress') {
    if (event.direction === 'sending') sendingProgress = event;
    else receivingProgress = event;
    applyState('exchanging');
  } else if (event.type === 'route') {
    routeLabel =
      event.route === 'direct' ? 'DIRECT' : event.route === 'relayed' ? 'TURN RELAY' : 'UNRESOLVED';
    updateTelemetry();
  } else if (event.type === 'session') {
    sessionLabel = event.sessionId.slice(0, 8).toUpperCase();
    updateTelemetry();
  } else if (event.type === 'integrity-failure') applyState('integrity-failure');
  else if (event.type === 'failure') applyState('transfer-failure');
  else if (event.type === 'error') {
    if (event.message.includes('rejected')) applyState('rejected');
    else {
      applyState('connection-failure');
      const copy = appRoot.querySelector('.copy p');
      if (copy) copy.textContent = event.message;
    }
  } else if (event.type === 'state') {
    const states: Partial<Record<PeerSessionEvent extends never ? never : string, WorkflowState>> =
      {
        searching: 'searching',
        matched: 'matched',
        negotiating: 'negotiating',
        connected: 'negotiating',
        'waiting-consent': 'waiting-consent',
        'queue-timeout': 'queue-timeout',
        'peer-disconnected': 'peer-disconnected',
        cancelled: 'cancelled',
      };
    if (event.state === 'searching') sessionLabel = 'QUEUED';
    if (event.state === 'connected') transportLabel = 'WEBRTC / DTLS';
    updateTelemetry();
    const next = states[event.state];
    if (next) applyState(next);
  }
}

function resetExchange(next: WorkflowState = 'landing'): void {
  session?.close();
  session = undefined;
  selectedFile = undefined;
  remoteFile = undefined;
  receivedFile = undefined;
  receivedName = undefined;
  receivedVerified = false;
  sentVerified = false;
  sendingProgress = undefined;
  receivingProgress = undefined;
  sessionLabel = 'NOT STARTED';
  transportLabel = 'PENDING';
  routeLabel = 'UNRESOLVED';
  input.value = '';
  updateTelemetry();
  applyState(next);
}

input.addEventListener('change', () => {
  const file = input.files?.[0];
  if (!file) return;
  selectedFile = file;
  applyState('file-selected');
});
appRoot.addEventListener('click', (event) => {
  const target = event.target;
  if (target instanceof Element && target.closest('.info')) {
    information?.showModal();
    return;
  }
  if (target instanceof Element && target.closest('.secondary')) {
    if (runtimeState === 'complete') {
      resetExchange();
      return;
    }
    session?.reject();
    applyState(session ? 'rejected' : 'landing');
    return;
  }
  if (!(target instanceof Element) || !target.closest('.primary')) return;
  if (runtimeState === 'landing') {
    applyState('safety');
    return;
  }
  if (runtimeState === 'safety') {
    input.click();
    return;
  }
  if (runtimeState === 'file-selected') {
    applyState('ready');
    return;
  }
  if (runtimeState === 'ready' && selectedFile) {
    const scheme = location.protocol === 'https:' ? 'wss' : 'ws';
    session = new PeerSession(
      { signalUrl: `${scheme}://${location.host}/signal`, file: selectedFile },
      onSession,
    );
    void session.start().catch(() => applyState('connection-failure'));
    return;
  }
  if (runtimeState === 'searching' || runtimeState === 'negotiating') {
    resetExchange('cancelled');
    return;
  }
  if (runtimeState === 'peer-review') {
    void session?.accept().catch((error: unknown) => {
      applyState('connection-failure');
      const copy = appRoot.querySelector('.copy p');
      if (copy)
        copy.textContent = error instanceof Error ? error.message : 'Unable to record consent';
    });
    return;
  }
  if (runtimeState === 'waiting-consent') {
    session?.reject();
    session = undefined;
    applyState('cancelled');
    return;
  }
  if (runtimeState === 'exchanging') {
    session?.cancelTransfer();
    resetExchange('cancelled');
    return;
  }
  if (runtimeState === 'complete' && receivedFile) {
    const url = URL.createObjectURL(receivedFile.blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = receivedFile.name;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
    return;
  }
  if (
    [
      'rejected',
      'cancelled',
      'peer-disconnected',
      'queue-timeout',
      'connection-failure',
      'transfer-failure',
      'integrity-failure',
    ].includes(runtimeState)
  ) {
    resetExchange();
    return;
  }
});
