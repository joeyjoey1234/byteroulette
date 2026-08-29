import { z } from 'zod';

export const peerMessageSchema = z.discriminatedUnion('type', [
  z
    .object({
      v: z.literal(1),
      type: z.literal('metadata'),
      transferId: z.uuid(),
      name: z.string().min(1).max(255),
      size: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
      mime: z.string().max(255),
    })
    .strict(),
  z
    .object({
      v: z.literal(1),
      type: z.literal('consent'),
      transferId: z.uuid(),
      accepted: z.boolean(),
    })
    .strict(),
  z
    .object({
      v: z.literal(1),
      type: z.literal('transfer.start'),
      transferId: z.uuid(),
      chunkSize: z.number().int().min(1).max(262_144),
    })
    .strict(),
  z
    .object({
      v: z.literal(1),
      type: z.literal('transfer.end'),
      transferId: z.uuid(),
      chunks: z.number().int().min(0),
      sha256: z.string().regex(/^[a-f0-9]{64}$/),
    })
    .strict(),
  z
    .object({
      v: z.literal(1),
      type: z.literal('transfer.verified'),
      transferId: z.uuid(),
      sha256: z.string().regex(/^[a-f0-9]{64}$/),
    })
    .strict(),
  z
    .object({
      v: z.literal(1),
      type: z.literal('transfer.cancel'),
      transferId: z.uuid(),
      reason: z.enum(['user', 'integrity', 'protocol', 'write', 'peer']),
    })
    .strict(),
]);

export const binaryChunkHeaderSchema = z
  .object({
    transferId: z.uuid(),
    sequence: z.number().int().min(0),
    byteLength: z.number().int().min(0).max(262_144),
  })
  .strict();
export type PeerMessage = z.infer<typeof peerMessageSchema>;
