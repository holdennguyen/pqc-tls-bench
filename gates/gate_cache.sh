#!/bin/sh
# GATE: H4 — Redis is TLS-only and all four API instances are connected over it.
#   (1) TLS-only: plain (non-TLS) ping fails, TLS ping works
#   (2) openssl probe: TLS1.3 with each group offered exclusively
#   (3) CLIENT LIST contains all four API client names (CLIENT SETNAME)
fail=0

docker compose exec -T redis redis-cli -p 6379 ping >/dev/null 2>&1 \
  && { echo "PLAINTEXT PING SUCCEEDED (should be TLS-only)"; fail=1; } \
  || echo "plaintext ping refused: OK"

docker compose exec -T redis redis-cli --tls --cacert /tls/server.crt -p 6379 ping | grep -q PONG \
  || { echo "TLS PING FAILED"; fail=1; }

for g in X25519MLKEM768 X25519; do
  out=$(docker compose exec -T openssl-client sh -c \
    "echo | openssl s_client -connect redis:6379 -groups $g -brief 2>&1" | grep -E 'Protocol|Negotiated|Temp Key')
  echo "probe groups=$g -> $out"
  echo "$out" | grep -q 'TLSv1.3' || { echo "PROBE FAIL for $g"; fail=1; }
done

clients=$(docker compose exec -T redis redis-cli --tls --cacert /tls/server.crt -p 6379 client list)
for name in api-python-hybrid api-python-classic api-node-hybrid api-node-classic; do
  echo "$clients" | grep -q "name=$name" || { echo "CLIENT MISSING: $name"; fail=1; }
done
echo "connected API clients: $(echo "$clients" | grep -c 'name=api-')"

[ $fail -eq 0 ] && echo "GATE_CACHE: PASS" || { echo "GATE_CACHE: FAIL"; exit 1; }
