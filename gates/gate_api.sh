#!/bin/sh
# GATE: functional equivalence. All 3 endpoints correct on BOTH APIs via BOTH edges;
# python-created record readable via node (shared DB); sensor lines present per service.
# Runs on the host: needs curl + jq.
fail=0
STAMP=$(date +%s)

for port in 8443 8444; do
  [ "$port" = 8443 ] && mode=hybrid || mode=classic
  for api in py node; do
    [ "$api" = py ] && expect=python || expect=node
    base="https://localhost:$port/$api"

    # 1) /health — no data touch
    h=$(curl -sk "$base/health")
    echo "$h" | jq -e ".status == \"ok\" and .api == \"$expect\" and .mode == \"$mode\"" >/dev/null \
      || { echo "HEALTH FAIL $mode/$api: $h"; fail=1; }

    # 2) GET /records/1 — twice: second hit must come from cache
    r=$(curl -sk "$base/records/1")
    echo "$r" | jq -e ".record.id == 1 and (.record.patient_name | length > 0)
      and .meta.served_by == \"$expect\" and .meta.mode == \"$mode\"" >/dev/null \
      || { echo "GET FAIL $mode/$api: $r"; fail=1; }
    r2=$(curl -sk "$base/records/1")
    echo "$r2" | jq -e '.meta.cache == "hit"' >/dev/null \
      || { echo "CACHE-ASIDE FAIL $mode/$api (second read not a hit): $r2"; fail=1; }

    # 2b) GET /records — list for the UI table (seeded 50 + gate-created rows)
    l=$(curl -sk "$base/records")
    echo "$l" | jq -e '(.records | length) >= 50' >/dev/null \
      || { echo "LIST FAIL $mode/$api"; fail=1; }

    # 3) POST /records — end-to-end write
    p=$(curl -sk -X POST "$base/records" -H 'content-type: application/json' \
      -d "{\"patient_name\":\"Gate Test $mode-$api-$STAMP\",\"dob\":\"1990-01-01\",\"diagnosis\":\"gate check\",\"notes\":\"synthetic\"}")
    id=$(echo "$p" | jq -r '.record.id // empty')
    [ -n "$id" ] || { echo "POST FAIL $mode/$api: $p"; fail=1; continue; }

    # 4) cross-read: record created via THIS api must be readable via the OTHER api
    [ "$api" = py ] && other=node || other=py
    x=$(curl -sk "https://localhost:$port/$other/records/$id")
    echo "$x" | jq -e ".record.diagnosis == \"gate check\"" >/dev/null \
      || { echo "CROSS-READ FAIL $mode $api->$other id=$id: $x"; fail=1; }
  done

  # 5) edge reports the negotiated H1 group to the app layer (X-TLS-Group -> edge_group).
  # Host curl can't offer ML-KEM, so probe from the in-network OpenSSL 3.5 client
  # with the mode's group forced; the echoed header must match what was negotiated.
  [ "$port" = 8443 ] && edge=nginx-hybrid want=X25519MLKEM768 || edge=nginx-classic want=X25519
  g=$(docker compose exec -T openssl-client sh -c \
    "printf 'GET /api/tls-info HTTP/1.1\r\nHost: $edge\r\nConnection: close\r\n\r\n' \
     | openssl s_client -quiet -connect $edge:443 -groups $want 2>/dev/null" \
    | tr -d '\r' | sed -n '/^{/p' | jq -r .edge_group)
  [ "$g" = "$want" ] || { echo "EDGE GROUP FAIL $edge expected $want got $g"; fail=1; }
done

# 6) sensor lines present for every scope in every service
for svc in api-python-hybrid api-python-classic api-node-hybrid api-node-classic; do
  logs=$(docker compose logs --no-log-prefix "$svc" 2>/dev/null)
  for scope in handler db cache; do
    echo "$logs" | grep -q "\"scope\":\"$scope\"" \
      || { echo "NO $scope SENSOR LINE in $svc"; fail=1; }
  done
done

[ $fail -eq 0 ] && echo "GATE_API: PASS" || { echo "GATE_API: FAIL"; exit 1; }
