#!/bin/sh
# GATE: UI layer. Portal + app 200 on both modes; /api/tls-info reports the correct
# group per mode (probed with the in-network OpenSSL 3.5 client, exclusive group);
# scan report exists and contains verdict badges.
fail=0

for port in 8443 8444; do
  code=$(curl -sk -o /dev/null -w '%{http_code}' "https://localhost:$port/")
  [ "$code" = 200 ] || { echo "PORTAL FAIL :$port -> $code"; fail=1; }
  curl -sk "https://localhost:$port/" | grep -q "Phòng khám" || { echo "PORTAL CONTENT FAIL :$port"; fail=1; }
  code=$(curl -sk -o /dev/null -w '%{http_code}' "https://localhost:$port/app/")
  [ "$code" = 200 ] || { echo "APP FAIL :$port -> $code"; fail=1; }
done

for edge in nginx-hybrid nginx-classic; do
  [ "$edge" = nginx-hybrid ] && want=X25519MLKEM768 || want=X25519
  g=$(docker compose exec -T openssl-client sh -c \
    "printf 'GET /api/tls-info HTTP/1.1\r\nHost: $edge\r\nConnection: close\r\n\r\n' \
     | openssl s_client -quiet -connect $edge:443 -groups $want 2>/dev/null" \
    | tr -d '\r' | sed -n '/^{/p' | jq -r .edge_group)
  [ "$g" = "$want" ] || { echo "TLS-INFO FAIL $edge: expected $want got $g"; fail=1; }
done

if [ -s results/scan.html ]; then
  n=$(grep -o 'class="b ' results/scan.html | wc -l | tr -d ' ')
  [ "$n" -ge 1 ] || { echo "scan.html has no verdict badges"; fail=1; }
  code=$(curl -sk -o /dev/null -w '%{http_code}' "https://localhost:8443/scan")
  [ "$code" = 200 ] || { echo "SCAN ROUTE FAIL -> $code"; fail=1; }
else echo "missing results/scan.html"; fail=1; fi

[ $fail -eq 0 ] && echo "GATE_UI: PASS" || { echo "GATE_UI: FAIL"; exit 1; }
