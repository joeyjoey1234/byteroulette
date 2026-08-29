import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';

const hashers = new Map<string, ReturnType<typeof sha256.create>>();
self.addEventListener(
  'message',
  (
    event: MessageEvent<{
      id: string;
      operation: 'update' | 'digest' | 'cancel';
      bytes?: ArrayBuffer;
    }>,
  ) => {
    const { id, operation, bytes } = event.data;
    if (operation === 'update' && bytes) {
      const hasher = hashers.get(id) ?? sha256.create();
      hasher.update(new Uint8Array(bytes));
      hashers.set(id, hasher);
      self.postMessage({ id, operation, ok: true });
    } else if (operation === 'digest') {
      const hasher = hashers.get(id) ?? sha256.create();
      hashers.delete(id);
      self.postMessage({ id, operation, hex: bytesToHex(hasher.digest()) });
    } else {
      hashers.delete(id);
      self.postMessage({ id, operation, ok: true });
    }
  },
);
