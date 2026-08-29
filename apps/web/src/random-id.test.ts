import { describe, expect, it } from 'vitest';
import { secureRandomUuid, secureRequestId } from './random-id.js';

const deterministicCrypto = {
  getRandomValues<T extends ArrayBufferView>(array: T): T {
    const bytes = new Uint8Array(array.buffer, array.byteOffset, array.byteLength);
    bytes.forEach((_, index) => (bytes[index] = index));
    return array;
  },
};

describe('secure random identifiers', () => {
  it('creates an RFC 4122 version 4 UUID without randomUUID()', () => {
    expect(secureRandomUuid(deterministicCrypto)).toBe('00010203-0405-4607-8809-0a0b0c0d0e0f');
  });

  it('creates a protocol-safe request identifier', () => {
    expect(secureRequestId(deterministicCrypto)).toBe('00010203_0405_4607_8809_0a0b0c0d0e0f');
  });
});
