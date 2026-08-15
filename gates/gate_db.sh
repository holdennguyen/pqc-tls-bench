#!/bin/sh
# GATE: Postgres connections from BOTH APIs are TLS 1.3 with the expected group for $MODE.
# TODO(claude-code): query pg_stat_ssl joined with pg_stat_activity per application_name;
# assert ssl=t, version=TLSv1.3; group check via server log or openssl probe to :5432.
echo "GATE_DB: TODO"; exit 1
