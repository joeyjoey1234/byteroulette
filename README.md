# ByteRoulette

ByteRoulette is a privacy-conscious, consent-based browser file exchange. Randomly paired users negotiate an encrypted WebRTC DataChannel and each reviews the peer file metadata before either side sends file bytes.

ByteRoulette is licensed under the [Apache License 2.0](LICENSE).

Phase status and verified commands are recorded in [PHASES.md](PHASES.md); the technical design is in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

The malicious-peer analysis and explicit non-guarantees are documented in [docs/THREAT_MODEL.md](docs/THREAT_MODEL.md).

## Local setup

Requirements: Node.js 20+ and pnpm 10.15.1. Copy `.env.example` to an untracked `.env`, replace local-only values, then:

```sh
pnpm install
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Start both development applications with:

```sh
pnpm dev
```

The web app defaults to `http://localhost:5173`; signaling defaults to `http://localhost:3001`. Set matching public/allowed origins as shown in `.env.example` when testing from another device.

## Testing

```sh
pnpm test
pnpm exec playwright install chromium
pnpm test:e2e
pnpm audit
```

The end-to-end suite uses real browser contexts and a genuine WebRTC DataChannel. It does not prove TURN fallback from a restrictive network; that requires a separate relay-only network test.

## Docker Compose

Create an untracked TURN secret without putting it in shell history, copy `.env.compose.example` to an untracked environment file, and set the host's externally reachable IP:

```sh
umask 077
openssl rand -hex 32 > /tmp/byteroulette-turn-secret
cp .env.compose.example .env.compose
```

Update `.env.compose`, then run:

```sh
docker compose --env-file .env.compose config --quiet
docker compose --env-file .env.compose build web signaling
docker compose --env-file .env.compose up -d
docker compose --env-file .env.compose ps
pnpm test:e2e:compose
docker compose --env-file .env.compose down
```

The reverse proxy listens on port 8080 by default. The included proxy configuration is HTTP-only for local validation; use the TLS-ready example and valid certificates for a public deployment. TURN needs direct UDP/TCP exposure and cannot be routed through a normal HTTP reverse proxy.

No application file volume exists. Restarting signaling deliberately clears its in-memory queue and sessions. Deploy exactly one signaling replica unless a separately approved coordination design is introduced.

## Container images

The Dockerfiles accept `VERSION`, `REVISION`, `SOURCE_URL`, and `LICENSES` build arguments for OCI metadata. Tagged GitHub releases build and publish:

- `ghcr.io/<owner>/byteroulette-web:<version>`
- `ghcr.io/<owner>/byteroulette-signaling:<version>`

The release workflow also emits commit-SHA tags, BuildKit provenance, SBOM attestations, and GitHub build provenance. No image is currently claimed as published; see `PHASES.md` for verified local image IDs and remaining release blockers.

## Tailscale preview

For private cross-device testing, bind the development services to the tailnet address and use Tailscale Serve for HTTPS. This is a test surface, not production hosting. Keep origin validation aligned with the exact HTTPS hostname, never expose the TURN shared secret, and verify the app from a second tailnet device.

## Browser support

ByteRoulette requires WebSocket, WebRTC DataChannel, Web Workers, Web Crypto, Blob slicing, and modern JavaScript modules. File System Access is used when available; other supported browsers use an explicit Blob download fallback limited to 256 MiB. The product-wide offered-file limit is 512 MiB.

## Privacy model

The signaling service is ephemeral and must never receive filenames, exact file sizes, file hashes, or file bytes. WebRTC may be direct or TURN-relayed. See [PRIVACY.md](PRIVACY.md) and [SECURITY.md](SECURITY.md) before use.

ByteRoulette does not scan files, guarantee safety or anonymity, or guarantee a direct connection. Treat peer files as untrusted.
