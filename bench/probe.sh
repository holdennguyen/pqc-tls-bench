#!/bin/sh
# Handshake latency probe: N full TLS handshakes against $1 with group list $2.
# Usage: probe.sh nginx-hybrid:443 X25519MLKEM768 200 > results/h1-hybrid-rep1.csv
HOST=$1; GROUPS=$2; N=${3:-200}
echo "seq,handshake_ms"
i=0; while [ $i -lt $N ]; do
  t0=$(date +%s%N)
  echo | openssl s_client -connect "$HOST" -groups "$GROUPS" -brief 2>/dev/null >/dev/null
  t1=$(date +%s%N)
  echo "$i,$(( (t1 - t0) / 1000000 ))"
  i=$((i+1))
done
