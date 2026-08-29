import { z } from 'zod';

const publicEnvSchema = z
  .object({
    VITE_PUBLIC_SIGNAL_URL: z
      .url()
      .refine((url) => url.startsWith('ws://') || url.startsWith('wss://')),
    VITE_PUBLIC_MAX_FILE_BYTES: z.coerce
      .number()
      .int()
      .positive()
      .max(10 * 1024 ** 3)
      .default(512 * 1024 ** 2),
  })
  .strict();

export function parsePublicEnv(input: unknown) {
  return publicEnvSchema.parse(input);
}
