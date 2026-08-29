# Contributing to ByteRoulette

ByteRoulette handles untrusted peer input and intentionally keeps file information out of signaling. Changes must preserve those boundaries.

## Development

Use Node.js 20 and pnpm 10.15.1, then run:

```sh
pnpm install --frozen-lockfile
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e
```

Never commit credentials, `.env` files, TURN shared secrets, certificates, downloaded test files, or Playwright reports. Do not add databases, analytics, trackers, persistent matchmaking, or file storage without explicit project approval.

## Pull requests

- Keep changes focused and describe security/privacy effects.
- Add or update tests for changed behavior.
- Update `PHASES.md` when work changes phase-gate evidence or known limitations.
- Do not weaken mutual consent, protocol validation, origin checks, resource bounds, or log redaction.
- Report vulnerabilities privately as described in `SECURITY.md`.
