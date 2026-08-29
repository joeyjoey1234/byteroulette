import { describe, expect, it } from 'vitest';
import { signalingEnvSchema } from './env.js';
describe('signaling environment', () => {
  it('parses safe development defaults', () =>
    expect(
      signalingEnvSchema.safeParse({ SIGNAL_ALLOWED_ORIGINS: 'http://localhost:5173' }).success,
    ).toBe(true));
  it('requires TURN secrets in production', () =>
    expect(
      signalingEnvSchema.safeParse({
        NODE_ENV: 'production',
        SIGNAL_ALLOWED_ORIGINS: 'https://example.test',
      }).success,
    ).toBe(false));
});

describe('file-backed TURN secret', () => {
  it('accepts a protected secret file for production configuration', () => {
    expect(
      signalingEnvSchema.safeParse({
        NODE_ENV: 'production',
        SIGNAL_ALLOWED_ORIGINS: 'https://allowed.test',
        TURN_URLS: 'turn:turn.test:3478',
        TURN_SHARED_SECRET_FILE: '/tmp/byteroulette-turn-secret',
      }).success,
    ).toBe(true);
  });
});
