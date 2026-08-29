# Privacy

ByteRoulette is designed without accounts, a database, persistent file storage, analytics, advertising, or trackers. The signaling process holds queue and session identifiers in memory and discards them after disconnect, timeout, or restart.

Files and their metadata travel between peers over an encrypted WebRTC DataChannel after both peers consent. A TURN server may relay encrypted packets when a direct route fails. Signaling and TURN operators can observe network metadata such as IP addresses, timestamps, and traffic volume. The paired peer learns the offered filename, size, MIME type, and file contents and may retain them.

Operational logs must not contain filenames, exact file sizes, hashes, file contents, SDP, ICE candidates, TURN secrets, or file chunks. This design reduces collection; it does not promise anonymity or safety.
