import { describe, expect, it } from 'vitest';
import {
  binaryChunkHeaderSchema,
  canTransition,
  clientSignalSchema,
  peerMessageSchema,
  serverSignalSchema,
} from './index.js';

const id = 'abcdefghijklmnop';
describe('signaling protocol', () => {
  it('accepts a versioned queue request', () =>
    expect(clientSignalSchema.safeParse({ v: 1, type: 'queue.join', requestId: id }).success).toBe(
      true,
    ));
  it('rejects unknown versions and extra fields', () => {
    expect(clientSignalSchema.safeParse({ v: 2, type: 'queue.join', requestId: id }).success).toBe(
      false,
    );
    expect(
      clientSignalSchema.safeParse({ v: 1, type: 'queue.join', requestId: id, filename: 'secret' })
        .success,
    ).toBe(false);
  });
  it('validates server messages', () =>
    expect(
      serverSignalSchema.safeParse({
        v: 1,
        type: 'session.matched',
        sessionId: id,
        role: 'offerer',
      }).success,
    ).toBe(true));
});
describe('peer protocol', () => {
  it('accepts metadata and rejects invalid sizes', () => {
    const base = {
      v: 1,
      type: 'metadata',
      transferId: '550e8400-e29b-41d4-a716-446655440000',
      name: '雪.bin',
      size: 0,
      mime: '',
    };
    expect(peerMessageSchema.safeParse(base).success).toBe(true);
    expect(peerMessageSchema.safeParse({ ...base, size: -1 }).success).toBe(false);
  });
  it('bounds binary chunk headers', () =>
    expect(
      binaryChunkHeaderSchema.safeParse({
        transferId: '550e8400-e29b-41d4-a716-446655440000',
        sequence: 0,
        byteLength: 262145,
      }).success,
    ).toBe(false));
});
describe('workflow state machine', () => {
  it('allows intended transitions only', () => {
    expect(canTransition('searching', 'matched')).toBe(true);
    expect(canTransition('searching', 'complete')).toBe(false);
  });
});
