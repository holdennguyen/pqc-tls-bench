#!/bin/sh
# Restrict this process's key-exchange groups to EXACTLY the mode's group.
# OPENSSL_CONF system_default applies to every SSL context in the process:
# uvicorn's server side (H2a) AND asyncpg/redis client sides (H3, H4).
set -e
case "$MODE" in
  hybrid)  GROUPS_LIST=X25519MLKEM768 ;;
  classic) GROUPS_LIST=X25519 ;;
  *) echo "MODE must be hybrid|classic, got: '$MODE'" >&2; exit 1 ;;
esac

cat > /tmp/openssl-mode.cnf <<EOF
openssl_conf = openssl_init
[openssl_init]
ssl_conf = ssl_sect
[ssl_sect]
system_default = system_default_sect
[system_default_sect]
Groups = $GROUPS_LIST
EOF
export OPENSSL_CONF=/tmp/openssl-mode.cnf
export OPENSSL_GROUPS=$GROUPS_LIST   # read by tls_state invariants

exec opentelemetry-instrument uvicorn app:app \
  --host 0.0.0.0 --port 8000 \
  --ssl-keyfile /certs/server.key --ssl-certfile /certs/server.crt
