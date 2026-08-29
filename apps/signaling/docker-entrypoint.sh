#!/bin/sh
set -eu

umask 077
IFS= read -r turn_secret < /run/secrets/turn_shared_secret
printf '%s' "$turn_secret" > /tmp/turn_shared_secret
chmod 0444 /tmp/turn_shared_secret
unset turn_secret

exec /bin/su node -s /bin/sh -c 'exec node dist/index.js'
