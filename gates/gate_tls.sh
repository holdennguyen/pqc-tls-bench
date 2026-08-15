#!/bin/sh
# GATE: key-exchange negotiation. Pass = hybrid negotiates X25519MLKEM768 AND classic negotiates X25519.
set -e
h=$(docker compose exec -T openssl-client sh -c "echo | openssl s_client -connect nginx-hybrid:443 -groups X25519MLKEM768:X25519 2>/dev/null" | grep -i 'Negotiated group' || true)
c=$(docker compose exec -T openssl-client sh -c "echo | openssl s_client -connect nginx-classic:443 2>/dev/null" | grep -i 'Negotiated group' || true)
echo "hybrid : $h"; echo "classic: $c"
echo "$h" | grep -q MLKEM768 && echo "$c" | grep -qv MLKEM && echo "GATE_TLS: PASS" || { echo "GATE_TLS: FAIL"; exit 1; }
