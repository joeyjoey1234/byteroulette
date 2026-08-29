export const workflowStates = [
  'landing',
  'safety',
  'file-selected',
  'ready',
  'searching',
  'matched',
  'negotiating',
  'peer-review',
  'waiting-consent',
  'exchanging',
  'verifying',
  'complete',
  'rejected',
  'cancelled',
  'peer-disconnected',
  'queue-timeout',
  'connection-failure',
  'transfer-failure',
  'integrity-failure',
  'unsupported-browser',
] as const;
export type WorkflowState = (typeof workflowStates)[number];

export const transitions = {
  landing: ['safety', 'unsupported-browser'],
  safety: ['file-selected', 'landing'],
  'file-selected': ['ready', 'landing'],
  ready: ['searching', 'file-selected', 'cancelled'],
  searching: ['matched', 'queue-timeout', 'cancelled'],
  matched: ['negotiating', 'peer-disconnected', 'connection-failure'],
  negotiating: ['peer-review', 'peer-disconnected', 'connection-failure', 'cancelled'],
  'peer-review': ['waiting-consent', 'rejected', 'cancelled', 'peer-disconnected'],
  'waiting-consent': ['exchanging', 'rejected', 'cancelled', 'peer-disconnected'],
  exchanging: ['verifying', 'cancelled', 'peer-disconnected', 'transfer-failure'],
  verifying: ['complete', 'integrity-failure', 'transfer-failure', 'cancelled'],
  complete: ['landing'],
  rejected: ['landing'],
  cancelled: ['landing'],
  'peer-disconnected': ['landing'],
  'queue-timeout': ['ready', 'landing'],
  'connection-failure': ['ready', 'landing'],
  'transfer-failure': ['ready', 'landing'],
  'integrity-failure': ['landing'],
  'unsupported-browser': [],
} as const satisfies Record<WorkflowState, readonly WorkflowState[]>;

export function canTransition(from: WorkflowState, to: WorkflowState): boolean {
  return (transitions[from] as readonly WorkflowState[]).includes(to);
}
