import { z } from 'zod';

export const protocolVersion = 1 as const;
const id = z
  .string()
  .min(16)
  .max(128)
  .regex(/^[A-Za-z0-9_-]+$/);
const envelope = z.object({ v: z.literal(protocolVersion) }).strict();

export const clientSignalSchema = z.discriminatedUnion('type', [
  envelope.extend({ type: z.literal('queue.join'), requestId: id }),
  envelope.extend({ type: z.literal('queue.leave'), requestId: id }),
  envelope.extend({
    type: z.literal('session.offer'),
    sessionId: id,
    sdp: z.string().min(1).max(32_768),
  }),
  envelope.extend({
    type: z.literal('session.answer'),
    sessionId: id,
    sdp: z.string().min(1).max(32_768),
  }),
  envelope.extend({
    type: z.literal('session.ice'),
    sessionId: id,
    candidate: z
      .object({
        candidate: z.string().max(4096),
        sdpMid: z.string().max(256).nullable(),
        sdpMLineIndex: z.number().int().min(0).max(256).nullable(),
      })
      .strict(),
  }),
  envelope.extend({
    type: z.literal('session.cancel'),
    sessionId: id,
    reason: z.enum(['user', 'timeout', 'connection']),
  }),
  envelope.extend({ type: z.literal('heartbeat'), nonce: id }),
]);

export const serverSignalSchema = z.discriminatedUnion('type', [
  envelope.extend({ type: z.literal('queue.joined'), requestId: id }),
  envelope.extend({ type: z.literal('queue.left'), requestId: id }),
  envelope.extend({
    type: z.literal('session.matched'),
    sessionId: id,
    role: z.enum(['offerer', 'answerer']),
  }),
  envelope.extend({
    type: z.literal('session.offer'),
    sessionId: id,
    sdp: z.string().min(1).max(32_768),
  }),
  envelope.extend({
    type: z.literal('session.answer'),
    sessionId: id,
    sdp: z.string().min(1).max(32_768),
  }),
  envelope.extend({
    type: z.literal('session.ice'),
    sessionId: id,
    candidate: z
      .object({
        candidate: z.string().max(4096),
        sdpMid: z.string().max(256).nullable(),
        sdpMLineIndex: z.number().int().min(0).max(256).nullable(),
      })
      .strict(),
  }),
  envelope.extend({
    type: z.literal('session.ended'),
    sessionId: id,
    reason: z.enum(['peer-left', 'timeout', 'rejected', 'cancelled', 'error']),
  }),
  envelope.extend({ type: z.literal('heartbeat.ack'), nonce: id }),
  envelope.extend({
    type: z.literal('error'),
    code: z.enum([
      'invalid-message',
      'unauthorized',
      'capacity',
      'rate-limit',
      'not-found',
      'conflict',
      'internal',
    ]),
    requestId: id.optional(),
  }),
]);

export type ClientSignal = z.infer<typeof clientSignalSchema>;
export type ServerSignal = z.infer<typeof serverSignalSchema>;
