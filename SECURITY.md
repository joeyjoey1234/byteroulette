# Security policy

ByteRoulette is not yet released. Report suspected vulnerabilities privately to the repository owner; do not include other people's files, credentials, SDP, ICE candidates, or personal data in a report.

## Security boundaries

Peers are untrusted. A received file may be malicious despite transport integrity. ByteRoulette does not scan files, identify users, guarantee anonymity, or guarantee a direct connection. WebRTC encrypts DataChannel traffic, including TURN-relayed traffic, but peers, infrastructure, browsers, and networks still expose metadata.

The signaling service validates all messages and authorizes every session relay. It intentionally retains queue and session state only in memory. Production deployments must use HTTPS/WSS, authenticated short-lived TURN credentials, strict origins, bounded payloads, and rate/capacity limits.

Never commit TURN shared secrets, TLS private keys, `.env` files, production values, captured SDP/ICE, or exchanged file data.
