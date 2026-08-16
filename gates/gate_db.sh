#!/bin/sh
# GATE: H3 — Postgres connections from ALL FOUR API instances are TLS 1.3, and the
# negotiated group per mode is proven two ways:
#   (1) pg_stat_ssl: ssl=t + TLSv1.3 per application_name (server-side truth)
#   (2) openssl probe: postgres accepts an EXCLUSIVE hybrid offer and an exclusive
#       classic offer (server capability), while each API client offers exactly one
#       group (compose/entrypoint config) -> negotiated group == mode's group.
fail=0

rows=$(docker compose exec -T postgres psql -U postgres -tA -c \
  "SELECT a.application_name, s.ssl, s.version FROM pg_stat_ssl s
   JOIN pg_stat_activity a USING(pid)
   WHERE a.application_name LIKE 'api-%' ORDER BY 1")
echo "$rows"

for app in api-python-hybrid api-python-classic api-node-hybrid api-node-classic; do
  echo "$rows" | grep -q "^$app|t|TLSv1.3$" || { echo "MISSING/NOT-TLS1.3: $app"; fail=1; }
done

# server accepts each group offered exclusively (-starttls postgres, OpenSSL 3.5 client)
for g in X25519MLKEM768 X25519; do
  out=$(docker compose exec -T openssl-client sh -c \
    "echo | openssl s_client -starttls postgres -connect postgres:5432 -groups $g -brief 2>&1" | grep -E 'Protocol|Negotiated|Temp Key')
  echo "probe groups=$g -> $out"
  echo "$out" | grep -q 'TLSv1.3' || { echo "PROBE FAIL for $g"; fail=1; }
done

# each API's own sensor asserts group_matches_mode on live traffic
for svc in api-python-hybrid api-python-classic api-node-hybrid api-node-classic; do
  docker compose logs --no-log-prefix "$svc" 2>/dev/null \
    | grep '"scope":"db"' | tail -1 \
    | grep -q '"name":"db_group_matches_mode","pass":true' \
    || { echo "NO PASSING db sensor line in $svc (hit an endpoint first?)"; fail=1; }
done

[ $fail -eq 0 ] && echo "GATE_DB: PASS" || { echo "GATE_DB: FAIL"; exit 1; }
