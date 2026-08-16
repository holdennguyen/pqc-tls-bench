#!/bin/bash
# Rewrite pg_hba so every TCP connection MUST be TLS (hostssl). Runs during initdb;
# the real server (re)start afterwards picks it up.
set -e
cat > "$PGDATA/pg_hba.conf" <<'EOF'
# local socket: entrypoint + healthcheck only
local   all all trust
# network: TLS required, scram auth. No plain "host" lines on purpose.
hostssl all all all scram-sha-256
EOF
echo "pg_hba.conf rewritten: hostssl-only"
