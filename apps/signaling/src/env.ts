import { readFileSync } from 'node:fs';
import { z } from 'zod';

export const signalingEnvSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    SIGNAL_HOST: z.string().min(1).default('127.0.0.1'),
    SIGNAL_PORT: z.coerce.number().int().min(1).max(65535).default(3001),
    SIGNAL_ALLOWED_ORIGINS: z
      .string()
      .min(1)
      .transform((value) => value.split(',').map((origin) => origin.trim())),
    SIGNAL_MAX_CONNECTIONS: z.coerce.number().int().positive().default(1000),
    SIGNAL_MAX_QUEUE_SIZE: z.coerce.number().int().positive().default(500),
    SIGNAL_MAX_MESSAGE_BYTES: z.coerce.number().int().min(1024).max(1_048_576).default(65_536),
    SIGNAL_QUEUE_TIMEOUT_MS: z.coerce.number().int().min(1000).default(120_000),
    SIGNAL_SESSION_TIMEOUT_MS: z.coerce.number().int().min(1000).default(900_000),
    SIGNAL_HEARTBEAT_MS: z.coerce.number().int().min(1000).default(20_000),
    TURN_URLS: z.string().optional(),
    STUN_URLS: z.string().default('stun:stun.l.google.com:19302'),
    TURN_SHARED_SECRET: z.string().min(32).optional(),
    TURN_SHARED_SECRET_FILE: z.string().min(1).optional(),
    TURN_CREDENTIAL_TTL_SECONDS: z.coerce.number().int().min(60).max(86_400).default(600),
  })
  .superRefine((env, context) => {
    if (
      env.NODE_ENV === 'production' &&
      (!env.TURN_URLS || (!env.TURN_SHARED_SECRET && !env.TURN_SHARED_SECRET_FILE))
    )
      context.addIssue({
        code: 'custom',
        message: 'Production requires TURN_URLS and TURN_SHARED_SECRET',
      });
  });

export function parseSignalingEnv(input: NodeJS.ProcessEnv) {
  const secretFile = input['TURN_SHARED_SECRET_FILE'];
  const turnSecret =
    input['TURN_SHARED_SECRET'] ??
    (secretFile ? readFileSync(secretFile, 'utf8').trim() : undefined);
  return signalingEnvSchema.parse({ ...input, TURN_SHARED_SECRET: turnSecret });
}
