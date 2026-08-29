# Development phases

This file is the phase-gate evidence log. A phase is complete only after every listed acceptance criterion has passed.

## Phase 1 — Product architecture and repository setup

### Objectives

Initialize the strict pnpm TypeScript workspace, document WebRTC/signaling/TURN/privacy/security architecture, define the complete workflow state machine, and provide runtime-validated versioned protocols and test infrastructure.

### Status

Complete — all Phase 1 acceptance criteria passed on 2026-08-28.

### Completed work

- Created `apps/web`, `apps/signaling`, and `packages/protocol` workspace packages.
- Added strict shared TypeScript, ESLint, Prettier, Vitest, and Playwright configuration.
- Added runtime validation for public and signaling environment variables.
- Added exhaustive workflow states/transitions and strict signaling/peer protocol schemas.
- Documented data paths, trust boundaries, ephemeral signaling, TURN, and deployment constraints.
- Added repository, security, and privacy documentation without real credentials.

### Files changed

Initial workspace configuration; `apps/web/**`; `apps/signaling/**`; `packages/protocol/**`; `docs/ARCHITECTURE.md`; `README.md`; `SECURITY.md`; `PRIVACY.md`; `.env.example`; `.gitignore`; `PHASES.md`.

### Commands executed

- `node --version` → `v20.19.2`
- `pnpm --version` → `10.15.1`
- `pnpm install` → exit 0; 163 packages added; lockfile generated.
- `pnpm format` → exit 0.
- `pnpm format:check` → exit 0; all files matched Prettier style.
- `pnpm lint` → exit 0; no findings.
- `pnpm typecheck` → exit 0; all three workspace packages passed.
- `pnpm test` → exit 0; 2 files and 8 tests passed.
- `pnpm build` → exit 0; protocol, signaling, and web builds passed.

### Test results

Vitest: 2 files passed, 8 tests passed. Protocol coverage includes accepted and rejected signaling envelopes, forbidden extra signaling fields, server messages, metadata bounds, binary chunk bounds, and state transitions. Production build passed.

### Known limitations

- The environment-provided `.git` directory is not a valid writable Git repository; source initialization can proceed, but Git history cannot yet be created.
- Application behavior and high-fidelity UI belong to later phases.

### Decisions affecting later phases

- Signaling accepts only matchmaking, SDP, ICE, cancellation, and heartbeat messages; file details cannot match its strict schema.
- Peer metadata/consent/transfer control uses a separately versioned DataChannel protocol.
- The initial signaling deployment is a single process with deliberately ephemeral in-memory state.
- WebRTC uses an ordered reliable DataChannel; file bytes begin only after two explicit consent messages.

## Phase 2 — High-fidelity UI and design system

### Status

Complete — all Phase 2 acceptance criteria passed on 2026-08-28.

### Completed work

- Created an original SVG identity and favicon with a dark technical design system.
- Implemented all 20 required workflow/error states using the exhaustive protocol state list.
- Added state-driven node, route, packet, progress, integrity, warning, and failure visuals.
- Added responsive desktop/tablet/mobile layouts, visible focus, semantic landmarks, live-region state output, high-contrast overrides, and reduced-motion behavior.
- Captured five key states at all four required review sizes.

### Files changed

`apps/web/index.html`; `apps/web/public/logo.svg`; `apps/web/public/favicon.svg`; `apps/web/src/main.ts`; `apps/web/src/styles.css`; `e2e/ui.spec.ts`; `playwright.config.ts`; root test/type configuration; `docs/screenshots/*.png`; `PHASES.md`.

### Commands executed

- `pnpm install --offline` → exit 0 after an optional accessibility package fetch failed with `EAI_AGAIN` and the unused dependency was removed.
- Initial `pnpm test:e2e` → unable to bind the local server inside the sandbox; rerun with approved local-server permission.
- Second `pnpm test:e2e` → 27 tests could not launch because Playwright's bundled browser was absent.
- Bound Playwright to the available `/usr/bin/chromium`.
- First system-Chromium run → 26 passed, 1 failed; correctly found duplicate `main` landmarks.
- Final `pnpm format:check` → exit 0.
- Final `pnpm lint` → exit 0.
- Final `pnpm typecheck` → exit 0.
- Final `pnpm test` → exit 0; 8 passed.
- Final `pnpm build` → exit 0.
- Final `pnpm test:e2e` → exit 0; 27 passed in 23.8 seconds.

### Test results

All 20 states passed browser rendering and critical horizontal-overflow checks. Automated semantic accessibility, keyboard-focus, and reduced-motion checks passed. Screenshot capture passed at 375×812, 768×1024, 1440×900, and 1920×1080.

### Known limitations

- These are high-fidelity state views; buttons are not connected to signaling or file behavior until Phases 3–5.
- Accessibility automation covers core document semantics and interaction behavior but is not a substitute for assistive-technology manual review.
- Playwright currently uses `/usr/bin/chromium`, an environment-specific path that should become configurable before CI packaging.

### Decisions affecting later phases

- UI state comes from the shared exhaustive state vocabulary; transport code must dispatch legal state transitions rather than infer styling.
- Motion represents scanning, packets, or measured progress and becomes effectively static under reduced motion.
- The interface says TURN may relay encrypted WebRTC traffic and never promises anonymity, safety, or direct transfer.

## Phase 3 — Signaling and matchmaking

### Status

Complete — all Phase 3 acceptance criteria passed on 2026-08-28.

### Completed work

- Added Fastify HTTP and WebSocket signaling with `/health/live`, `/health/ready`, `/config`, and `/signal`.
- Added an ephemeral in-memory queue with randomized selection from a bounded FIFO window and synchronous atomic session ownership.
- Added per-socket random identities, participant-only session relay authorization, origin enforcement, connection/queue capacity, fixed-window message rate limiting, WebSocket payload limits, and strict schema validation.
- Added queue, session, and heartbeat expiry plus disconnect/session cleanup and graceful SIGINT/SIGTERM shutdown.
- Kept all file metadata, hashes, contents, and DataChannel chunks outside the signaling protocol and server.

### Files changed

`apps/signaling/package.json`; `apps/signaling/src/index.ts`; `apps/signaling/src/matchmaker.ts`; `apps/signaling/src/server.ts`; `apps/signaling/src/server.test.ts`; `pnpm-lock.yaml`; `PHASES.md`.

### Commands executed

- `pnpm install` → exit 0; Fastify, WebSocket, and type dependencies installed.
- Intermediate `pnpm test` → two integration tests timed out because the test receiver subscribed after adjacent frames; replaced it with a persistent per-socket inbox and preserved deterministic joined-before-matched ordering.
- Final `pnpm format:check` → exit 0.
- Final `pnpm lint` → exit 0.
- Final `pnpm typecheck` → exit 0.
- Final `pnpm test` → exit 0; 3 files and 13 tests passed.
- Final `pnpm build` → exit 0; all workspace builds passed.

### Test results

Real WebSocket integration tests verify safe health/config output, successful two-client queue/match, rejection of third-client cross-session injection, session destruction and peer notification on disconnect, malformed JSON rejection, forbidden-origin closure, and oversized-frame closure. Environment and shared protocol tests also pass.

### Known limitations

- Signaling state is intentionally process-local; restart ends every queue and session.
- Initial deployment must use exactly one signaling replica.
- The rate limiter is process-local and intentionally simple; distributed enforcement is out of scope without an approved coordination system.
- TURN credential issuance and browser WebRTC negotiation belong to Phase 4.

### Decisions affecting later phases

- `queue.joined` is always delivered before `session.matched` in a subsequent event-loop turn.
- Only the two random socket identities recorded in a session can relay its SDP or ICE frames.
- `/config` exposes capability flags and public limits only; it never exposes TURN secrets.

## Phase 4 — WebRTC connection and mutual consent

### Status

Complete — all locally available Phase 4 acceptance criteria passed on 2026-08-28. Real TURN relay connectivity remains explicitly unverified because no TURN deployment or credentials were provided.

### Completed work

- Implemented offerer/answerer RTCPeerConnection negotiation, trickle ICE, ordered reliable DataChannel creation, one ICE-restart recovery attempt, and candidate-pair route classification.
- Added configurable STUN plus server-generated short-lived HMAC TURN REST credentials; the shared secret never enters web configuration or bundles.
- Added idempotent bidirectional metadata exchange only after DataChannel open, separate per-direction transfer identifiers, mutual consent gating, rejection, consent timeout, cancellation/closure, and peer failure cleanup.
- Connected file selection, queueing, negotiation, peer review, and consent events to the finished interface.
- Added configured-origin-only CORS for public connection configuration.

### Files changed

`.env.example`; `apps/signaling/src/env.ts`; `apps/signaling/src/server.ts`; `apps/signaling/src/server.test.ts`; `apps/web/src/main.ts`; `apps/web/src/peer-session.ts`; `e2e/webrtc.spec.ts`; `playwright.config.ts`; `PHASES.md`.

### Commands executed

- Intermediate `pnpm test:e2e` → 27 UI tests passed; WebRTC test exposed missing configured-origin CORS.
- Targeted WebRTC rerun → exposed one-direction metadata open-event race; metadata handshake made idempotent and per-direction transfer IDs separated.
- `pnpm format:check` → exit 0.
- `pnpm lint` → exit 0.
- `pnpm typecheck` → exit 0.
- `pnpm test` → exit 0; 3 files and 14 tests passed.
- `pnpm build` → exit 0.
- `pnpm exec playwright test e2e/webrtc.spec.ts` → exit 0; 2 genuine WebRTC tests passed.
- `pnpm test:e2e` → exit 0; all 29 browser tests passed in 28.6 seconds.
- Started web on `0.0.0.0:5173` and signaling on `0.0.0.0:3001` with explicit Tailscale origins.
- Tailscale HTTP verification → web `200`; signaling `/health/ready` `200`.

### Test results

Two isolated Chromium contexts match through the real WebSocket service, negotiate a real WebRTC DataChannel, exchange both filenames/metadata, remain transfer-blocked after only one acceptance, become transfer-ready after both accept, and close without transfer permission on rejection. TURN credential tests verify short-lived public credentials and absence of the shared secret.

### Known limitations

- A real TURN server was not available, so relay fallback and the `relayed` route report are implemented but not connectivity-tested. No claim is made that TURN fallback currently works.
- The Tailscale preview uses HTTP/WS development services, not production HTTPS/WSS.
- Phase 4 authorizes bytes but does not transmit them; transfer belongs to Phase 5.

### Decisions affecting later phases

- Local and remote file offers retain different transfer IDs; consent applies to the peer's offered transfer ID.
- Metadata messages are idempotent and reply once to recover DataChannel-open ordering races.
- `canTransfer()` is true only when the channel is open and both local and remote consent flags are true.

## Phase 5 — File transfer, saving, and verification

### Status

Complete — all Phase 5 acceptance criteria passed on 2026-08-28.

### Completed work

- Added bidirectional ArrayBuffer transfers with UUID headers, monotonic 32-bit sequences, 64 KiB `Blob.slice()` reads, and a 1 MiB DataChannel high-water mark with `bufferedamountlow` backpressure.
- Added strict start/chunk/end ordering, identifier, size, count, duplicate/missing sequence, and maximum-chunk validation.
- Added incremental SHA-256 in a dedicated Web Worker using `@noble/hashes`, with deliberate corruption detection.
- Added EWMA-smoothed sending/receiving throughput and estimated remaining seconds.
- Added File System Access streaming selected through the user's consent interaction where available, plus an explicit-download Blob fallback capped at 256 MiB.
- Added cancellation, worker termination, sink abort, buffer cleanup, and connection cleanup.
- Connected exchange, failure, integrity, and complete/save states to the UI.

### Files changed

`apps/web/package.json`; `apps/web/src/file-transfer.ts`; `apps/web/src/hash.worker.ts`; `apps/web/src/incremental-hash.ts`; `apps/web/src/peer-session.ts`; `apps/web/src/main.ts`; `e2e/webrtc.spec.ts`; `pnpm-lock.yaml`; `PHASES.md`.

### Commands executed

- `pnpm install` → exit 0; installed the incremental hashing implementation.
- Intermediate transfer test → three passed and one failed, exposing transfer frames arriving before receiver initialization and async hash ordering; added pre-initialization buffering and serialized receive processing.
- Targeted transfer suite after ordering fix → 4 passed.
- File System Access test run → browser picker correctly aborted without a user gesture; test harness explicitly disabled it to exercise Blob fallback without weakening production interaction requirements.
- `pnpm format:check` → exit 0.
- `pnpm lint` → exit 0.
- `pnpm typecheck` → exit 0.
- `pnpm test` → exit 0; 3 files and 14 tests passed.
- `pnpm build` → exit 0; worker and application bundles built.
- Complete `pnpm test:e2e` → exit 0; 32 tests passed in 33.7 seconds.
- Final targeted WebRTC/transfer regression → exit 0; 5 passed in 10.1 seconds.
- Tailscale verification → web `200`; signaling readiness `200`.

### Test results

Two real Chromium contexts transfer text and arbitrary binary bytes bidirectionally without modification, including Unicode filenames and null bytes. Empty files verify. One deliberately changed byte produces an integrity-failure event. Mutual consent remains mandatory before transfer startup.

### Known limitations

- Browsers without File System Access support use a 256 MiB Blob fallback; larger received files are rejected before unbounded accumulation.
- Automated tests exercise the Blob fallback because headless browser automation cannot approve a native save picker; File System Access integration is implemented but still warrants manual browser testing.
- Current progress presentation changes workflow states; detailed numeric live telemetry polish remains in Phase 6.

### Decisions affecting later phases

- Binary frames use 16 UUID bytes plus a 4-byte big-endian sequence followed by at most 64 KiB payload.
- Receive processing is serialized even though worker hashing is asynchronous, preserving wire order.
- A receive is complete only after exact byte/count checks, SHA-256 equality, and successful sink close or Blob construction.
- Download creation occurs only from the explicit Complete-state button.

## Phase 6 — Security, privacy, and product polish

### Status

Complete — all Phase 6 source, direct-WebRTC, security, privacy, accessibility, and product-polish acceptance criteria passed on 2026-08-28. TURN connectivity remains scheduled for the required Phase 7 coturn environment and is not claimed as verified.

### Completed work

- Added a malicious-peer threat model covering trust boundaries, consent bypass, injection, malformed traffic, chunk attacks, integrity, filenames, memory exhaustion, logging, and explicit non-guarantees.
- Added CSP, anti-framing, MIME-sniffing, referrer, permissions, and opener headers to web and signaling responses.
- Added Unicode-aware filename normalization, control/path removal, reserved-name replacement, and a 180-grapheme display/save bound.
- Enforced a 512 MiB product file ceiling in addition to signaling, message, chunk, queue, and fallback-memory limits.
- Added peer `transfer.verified` acknowledgement so Complete requires successful local receive verification/writing and peer verification of the sent file.
- Added a keyboard-operable privacy, safety, and how-it-works dialog with accurate direct/relayed WebRTC and metadata language.
- Connected rejection controls and ensured peer-controlled text is rendered through `textContent`, never peer-controlled HTML.
- Reviewed logs and source for filenames, hashes, contents, SDP, ICE, secrets, unfinished markers, placeholders, and debug logging.

### Files changed

`apps/signaling/src/security.ts`; `apps/signaling/src/server.ts`; `apps/signaling/src/server.test.ts`; `apps/web/index.html`; `apps/web/vite.config.ts`; `apps/web/src/filename.ts`; `apps/web/src/filename.test.ts`; `apps/web/src/file-transfer.ts`; `apps/web/src/peer-session.ts`; `apps/web/src/main.ts`; `apps/web/src/styles.css`; `docs/THREAT_MODEL.md`; `README.md`; `e2e/ui.spec.ts`; `PHASES.md`.

### Commands executed

- `pnpm format:check` → exit 0.
- `pnpm lint` → exit 0.
- `pnpm typecheck` → exit 0.
- `pnpm test` → exit 0; 4 files and 17 tests passed.
- `pnpm build` → exit 0; web, worker, protocol, and signaling builds passed.
- `pnpm test:e2e` → exit 0; all 33 tests passed in 27.8 seconds.
- Source audit with `rg` → no TODO, FIXME, placeholder, Lorem, mock-production, console log, or debug-log findings; sensitive-term matches were intentional protocol/sanitizer/hash implementation references.
- Tailscale web verification → HTTP 200 with CSP, nosniff, DENY framing, no-referrer, and permissions headers.
- Tailscale signaling verification → HTTP 200 with CSP `default-src 'none'`, nosniff, DENY framing, no-referrer, permissions, and COOP headers.
- Post-review visual regression: the development CSP initially blocked Vite's inline development CSS injection, causing an unstyled Tailscale preview. Split development and production CSP policies, visually recaptured the hosted page, and added a computed-style browser regression.
- Final post-fix `pnpm test:e2e` → exit 0; all 34 tests passed in 33.7 seconds.

### Test results

Security header, filename normalization, runtime schema, signaling authorization, genuine WebRTC, mutual consent, rejection, binary/text/empty transfer, corruption detection, responsive, semantic accessibility, keyboard, reduced-motion, privacy-dialog, and build tests pass.

### Known limitations

- Real TURN fallback remains unverified until Phase 7 starts coturn with reachable UDP/TCP relay ports; no TURN-success claim is made.
- Development CSP permits broad HTTP(S)/WS(S) connection schemes for Tailscale and local preview flexibility. The Phase 7 production proxy must narrow `connect-src` to the deployed origins.
- File System Access native picker behavior still warrants manual testing in a supported interactive browser; automated transfer tests use the bounded Blob fallback.

### Decisions affecting later phases

- Production completion means both the local receive and remote receive have acknowledged verified writes.
- Production proxy headers must preserve or strengthen the application policies.
- Logs must remain body-free and exclude SDP, ICE, filenames, sizes, hashes, contents, and TURN secrets.

## Phase 7 — Finalization, Docker, and GitHub

### Status

In progress — production container and local orchestration work has started. GitHub, registry publication, and final release gates remain outstanding.

### Completed work

- Added initial multi-stage web and signaling Dockerfiles, an nginx web runtime, reverse-proxy and TLS-ready examples, coturn configuration, Compose orchestration, and Docker ignore/environment examples.
- Routed browser signaling and configuration through the same origin so HTTPS Tailscale and production proxy deployments use WSS without exposing a separate browser endpoint.
- Started manual mobile-to-PC validation over Tailscale HTTPS.
- Fixed a manual-test compatibility failure on a mobile browser without `crypto.randomUUID()` by generating RFC 4122 version 4 identifiers with the more widely supported cryptographic `getRandomValues()` API.
- Diagnosed both real devices stalling during ICE negotiation: matchmaking, signaling, offer/answer exchange, and the UI were operational, but the live configuration had no TURN service.
- Started a tailnet-only non-root coturn instance on UDP/TCP 3478 with a protected ephemeral shared secret, connected signaling to it, and verified that `/config` returns only short-lived TURN REST credentials.
- Confirmed authenticated coturn allocations in server logs. The same-host echo probe received no relayed payload because loopback-peer protection is enabled; the remote mobile-to-PC relay path still requires the resumed manual test.
- Fixed the manual workflow rendering static Phase 2 demo filenames instead of actual local and peer-selected metadata; runtime review now shows the sanitized peer filename, exact size, and MIME type.
- Made session close idempotent to prevent DataChannel close events recursively closing and re-reporting the same failure, extended interactive consent to 120 seconds, and stopped masking every session error behind the generic route-failure copy.
- Fixed a manual-test mutual-consent deadlock: receipt of the first peer's acceptance incorrectly moved the still-unaccepted peer away from its review screen, removing that peer's Accept control. Remote acceptance now changes the visible state only after local acceptance also exists.
- Confirmed the first real mobile-to-PC exchange completed, verified, downloaded, and preserved the selected image bytes successfully through the Tailscale-hosted application. TURN was configured, but the route selected by that exchange was not reliably recorded and is not claimed as relayed.
- Added a persistent post-exchange flow: late signaling/channel closure can no longer overwrite Complete, Blob-fallback receives remain available for repeated explicit saves, native streamed saves are identified accurately, and a separate Start another exchange action performs explicit session/file cleanup.
- Updated runtime action rendering so buttons appear only in states where they are valid, with distinct Save and Restart controls on Complete.
- Wired previously static workflow actions to real cleanup behavior: Leave Queue, negotiation Cancel, Withdraw Consent, Cancel Transfers, and terminal-state restart now close the scoped peer/signaling resources and reset file/session state.
- Implemented browser heartbeats at half the advertised server interval, eliminating forced signaling disconnects during quiet review and completed sessions.
- Added explicit handling for queue expiry, peer disconnect, peer cancellation, session timeout, capacity, conflict, rate-limit, authorization, and signaling errors.
- Added a 30-second initial negotiation timeout, early ICE candidate buffering, and a real offerer-driven ICE restart with a 15-second recovery bound.
- Replaced fabricated session, route, transport, throughput, byte-count, and ETA values with live runtime telemetry. Direct, TURN-relayed, and unresolved routes are now reported only from selected ICE candidate statistics.
- Restricted screenshot-only `?state=` overrides to Vite development builds and added genuine unsupported-browser feature detection.
- Moved the 256 MiB Blob-fallback limit check before local consent, preventing file bytes from starting when a browser cannot support the offered receive size.
- Moved TURN secrets out of Compose arguments and environment values into a file-backed Compose secret. Signaling and coturn copy the secret into private tmpfs during root bootstrap and immediately drop to the `node` and `nobody` users.
- Fixed pnpm 10 signaling image deployment, nginx read-only tmpfs requirements, proxy temp paths, and a terminal-state ordering regression that had made the post-completion Save button inert.
- Added a dedicated Compose Playwright configuration and a containerized two-browser test that verifies mutual consent, completed bidirectional exchange, download filename, and exact downloaded bytes through the reverse proxy.
- Added GitHub Actions application and Docker CI, plus tagged GHCR release builds with version/SHA tags, BuildKit provenance, SBOM generation, and GitHub build attestations.
- Added Dependabot configuration, structured privacy-aware bug reports, a pull-request checklist, and contribution guidance.
- Expanded the README with exact local, test, Compose, image, Tailscale, TURN, and browser-support instructions and explicit non-guarantees.
- Made OCI source and license labels build-time inputs so release images cannot falsely claim an owner or license before those values are confirmed.
- Corrected the Compose browser harness to use the same-origin `/signal` route exposed by the production reverse proxy instead of an unavailable host-only signaling port.
- Selected and added the canonical Apache License 2.0 after user authorization, and aligned package, Compose, CI, release, and OCI license metadata with SPDX identifier `Apache-2.0`.

### Files changed

`apps/web/Dockerfile`; `apps/web/nginx.conf`; `apps/web/vite.config.ts`; `apps/web/src/main.ts`; `apps/web/src/peer-session.ts`; `apps/web/src/random-id.ts`; `apps/web/src/random-id.test.ts`; `apps/signaling/Dockerfile`; `deploy/reverse-proxy/nginx.conf`; `deploy/reverse-proxy/tls.conf.example`; `deploy/coturn/turnserver.conf`; `compose.yaml`; `.dockerignore`; `.env.compose.example`; `.github/**`; `CONTRIBUTING.md`; `LICENSE`; `README.md`; `package.json`; `e2e/webrtc.spec.ts`; `PHASES.md`.

### Commands executed

- `tailscale serve --bg http://100.125.237.42:5173` → Serve mapping created for `https://hashbrowns.taila6a64.ts.net/`; same-node HTTPS hairpin checks return Tailscale 404, while direct tailnet-IP web and `/config` checks return HTTP 200. Remote-device verification remains authoritative.
- Manual browser attempt → exposed `TypeError: crypto.randomUUID is not a function` before matchmaking; extension-originated `contentscript.js` listener warnings were unrelated.
- Compatibility-fix `pnpm format:check` → exit 0.
- Compatibility-fix `pnpm lint` → exit 0.
- Compatibility-fix `pnpm test` → exit 0; 5 files and 19 tests passed.
- Initial compatibility-fix `pnpm typecheck` → exit 2; strict indexed-access checks identified two potentially undefined byte reads.
- Final `pnpm typecheck` → exit 0 after guarding indexed reads.
- Final `pnpm build` → exit 0; all workspace production builds passed.
- Live pre-TURN `/config` check → `turnConfigured: false`, matching the stalled real-device ICE state.
- Coturn listener check → container running; UDP and TCP listeners active on `100.125.237.42:3478`.
- Live post-TURN `/config` check → `turnConfigured: true`; STUN plus UDP/TCP TURN URLs present with short-lived username and credential fields, and no shared secret returned.
- Authenticated `turnutils_uclient` probe → five relay allocations created and observed in coturn logs; payload echo was blocked by the intentional same-host/loopback-peer restriction.
- Runtime filename workflow regression → exit 0; two real Chromium contexts each displayed the other context's actual selected filename.
- Post-fix consent and transfer regression → exit 0; mutual consent, bidirectional Unicode/binary transfer, and empty-file transfer tests all passed.
- One-sided consent UI regression → exit 0; the accepting browser waits, the unaccepted browser retains its real peer-file review and Accept control, and transfer begins only after the second explicit acceptance.
- Post-completion checks: `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, and `pnpm test` all exit 0; 19 tests passed.
- Targeted post-completion Playwright checks → one-sided consent, bidirectional Unicode/binary transfer, and separate Complete-state Save/Restart behavior all passed.
- Leave Queue browser regression → exit 0; a live queued signaling connection closes, Cancelled is shown, and Start Again returns to a clean landing state. Formatting, linting, and strict type-checking also passed.
- Lifecycle hardening gate → `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build` all exit 0; 20 unit/integration tests passed.
- Complete development E2E → exit 0; 41 passed and one Compose-only production check skipped in 55.1 seconds. Coverage includes heartbeat transmission, real telemetry, unsupported-browser detection, pre-consent fallback size rejection, exact download bytes, and all prior WebRTC/security/UI regressions.
- `docker compose config --quiet` with a protected temporary secret file → exit 0.
- Web image build → exit 0; local image ID `sha256:b460b8d9a30c092cbdc9b12f6b503ef431ea6b5f2c12c944c32d75d5266df0b6`.
- Signaling image build → exit 0; final rebuilt local image ID `sha256:3593c3f75d8eb9c15c9269a94e1356e555da8656fa8c0f1ec8f9cda9fba7e397`.
- Compose runtime → web, signaling, reverse proxy, and coturn all started and reached healthy status; `/health/live` and `/health/ready` returned healthy responses and `/config` reported TURN configured with two ICE server entries.
- Containerized two-browser workflow → exit 0; both contexts matched through the proxy, retained independent consent controls, completed verification, and downloaded the peer file with the expected name and exact bytes.
- Production-only state test → exit 0; `?state=complete` is ignored by the production image and cannot fabricate a success screen.
- Secret/runtime audit → exact TURN secret absent from signaling and coturn container metadata; signaling PID 1 runs as `node`, coturn PID 1 runs as `nobody`.
- Phase 7 application gate rerun → `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build` exit 0; 20 tests passed and all production bundles built.
- Development browser gate rerun → `pnpm test:e2e` exit 0; 41 passed and the single Compose-only production test skipped as designed.
- `pnpm audit --prod --audit-level high` → exit 0; no known vulnerabilities found. The sandboxed registry request initially failed with `EAI_AGAIN`; the approved network rerun passed.
- Final Dockerfile rebuild → exit 0; web image ID `sha256:0596f70e3a6d18717ca7f4f2bdebc4395298427fd4afb04eb2c8c0d7714c4721`; signaling image ID `sha256:07c40e622d3a3ea821286aeff68419808ae6f781368207f3732a6b366fc77146`. These are local IDs, not published registry digests.
- Recreated web, signaling, and proxy containers → all application services and coturn healthy; proxied `/health/live` returned HTTP 200.
- Initial full Compose browser rerun was invalidated by the environment's Chromium crashpad `setsockopt: Operation not permitted` sandbox failure; a focused rerun then exposed the harness's stale direct-port signaling URL.
- Corrected production-path Compose gate → production state isolation and the real bidirectional Unicode/binary transfer through `/signal` both passed (2/2); downloaded bytes are asserted by the transfer test.
- Source credential-pattern scan found only the documented fake value in `.env.example`; unfinished-marker scan found no source TODO/FIXME or owner placeholder. Image-history inspection found no project secret-bearing build arguments or layers.
- Tailscale continuity check → web and same-origin `/config` both returned HTTP 200 at `100.125.237.42:5173`; the HTTPS Serve URL remains `https://hashbrowns.taila6a64.ts.net/` for remote tailnet testing.

### Known limitations

- A real mobile-to-PC Tailscale-hosted exchange and Blob-fallback save passed. Native File System Access picker behavior remains unverified in an interactive supported desktop browser.
- TURN credential minting, authenticated allocation, service health, and availability to browsers are verified. Forced relay-only transfer from separate restrictive networks is still not verified and is not claimed.
- The current `.git` mount is not a valid writable repository (`git status` reports “not a git repository”), so the required diff review, commit, exact commit SHA, and push cannot be completed in this workspace state.
- Repository destination, GitHub publication authorization, and GHCR authorization are not confirmed. Consequently no images were published and no immutable registry digests are available.
- GitHub Actions files are locally format-validated but cannot be executed or reported green until a real GitHub repository exists.
- The full Compose suite encountered an environment-level Chromium crashpad restriction after container recreation. The two production-critical tests pass outside that restricted launch path, and the same full container transfer had already passed earlier in Phase 7; this event is retained rather than hidden.

### Decisions affecting later phases

- Client-generated identifiers depend on cryptographically secure random bytes but do not require the newer `crypto.randomUUID()` convenience API.
- Tailscale hosting remains a manual verification surface for every available phase; it does not replace Docker or production deployment gates.

## Phase 8 — Kubernetes cluster launch

Not started.
