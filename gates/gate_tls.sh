#!/bin/sh
# GATE: key-exchange negotiation. Pass = hybrid negotiates X25519MLKEM768 AND classic negotiates X25519.
# OpenSSL -brief prints hybrid groups as "Negotiated TLS1.3 group: X25519MLKEM768"
# but classical curves as "Peer Temp Key: X25519, 253 bits".
set -e
h=$(docker compose exec -T openssl-client sh -c "echo | openssl s_client -connect nginx-hybrid:443 -brief 2>&1" | grep -iE 'Negotiated TLS1.3 group|Peer Temp Key' || true)
c=$(docker compose exec -T openssl-client sh -c "echo | openssl s_client -connect nginx-classic:443 -brief 2>&1" | grep -iE 'Negotiated TLS1.3 group|Peer Temp Key' || true)
echo "hybrid : $h"; echo "classic: $c"
if echo "$h" | grep -q 'MLKEM768' && echo "$c" | grep -q 'X25519' && ! echo "$c" | grep -q 'MLKEM'; then
  echo "GATE_TLS: PASS"
else
  echo "GATE_TLS: FAIL"; exit 1
fi
