# Malicious-peer threat model

## Assets and boundaries

File bytes, filenames, hashes, local filesystem handles, TURN secrets, SDP, and ICE candidates are sensitive. Browsers and their paired peer are untrusted. Signaling sees network/session metadata and negotiation messages; TURN can observe encrypted packet timing and volume but not DataChannel plaintext.

## Considered attacks and controls

| Attack                                              | Control                                                                                   | Residual risk                                               |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| Bytes sent without permission                       | Independent consent flags gate transfer startup                                           | A consenting peer can retain received data                  |
| Cross-session injection                             | Random socket identity and participant-only authorization                                 | A compromised signaling server remains privileged           |
| Oversized or malformed input                        | Strict schemas and payload, rate, capacity, filename, chunk, file, and memory bounds      | Distributed denial of service needs infrastructure controls |
| Missing, duplicate, reordered, or unexpected chunks | Transfer UUID, exact monotonic sequence, and byte/count bounds                            | A peer can waste time up to configured limits               |
| Changed bytes                                       | Incremental SHA-256 before completion                                                     | Integrity is not malware scanning or authenticity           |
| Hostile filename                                    | NFC normalization, separator/control removal, reserved-name replacement, and length bound | Users must still review the resulting name                  |
| Receiver memory exhaustion                          | File System Access streaming or 256 MiB Blob ceiling                                      | Platform overhead remains implementation-dependent          |
| Sender memory exhaustion                            | 64 KiB slices and 1 MiB DataChannel backpressure                                          | Browser WebRTC buffering varies                             |
| Secret or file data in logs                         | Logs omit bodies, SDP, ICE, file details, hashes, and secrets                             | Operators still see connection metadata                     |
| Script or framing injection                         | Text-only peer rendering, CSP, and anti-framing headers                                   | Browser vulnerabilities are out of scope                    |

## Explicit non-guarantees

ByteRoulette does not establish identity, anonymity, file safety, malware freedom, sender authenticity, or a guaranteed direct route. TURN-relayed traffic remains WebRTC-encrypted but is not direct. Treat every peer and file as hostile.
