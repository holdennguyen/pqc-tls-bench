#!/bin/sh
# Handshake probe: 2 modes x 5 hops x 3 reps x (10 warmup + 100 measured) handshakes.
# -> results/handshake_probe.csv   (columns: hop,mode,rep,i,warmup,ms,bytes_out,bytes_in)
set -e
cd "$(dirname "$0")/.."
mkdir -p results
OUT=results/handshake_probe.csv
PYIMG="python:3.13-slim-trixie@sha256:ffb752e139c0a19692a43af8d8523b274222dd68eebad5d583b45c2201c6e30a"
N=${N:-100}

echo "hop,mode,rep,i,warmup,ms,bytes_out,bytes_in" > "$OUT"
for mode in hybrid classic; do
  [ "$mode" = hybrid ] && groups=X25519MLKEM768 || groups=X25519
  for rep in 1 2 3; do
    echo "probe: mode=$mode rep=$rep (exclusive group: $groups)" >&2
    docker run --rm --network pqc-tls-bench_default \
      -v "$PWD/bench:/bench:ro" -v "$PWD/certs:/certs:ro" \
      -e MODE="$mode" "$PYIMG" sh -c "
        printf 'openssl_conf = openssl_init\n[openssl_init]\nssl_conf = ssl_sect\n[ssl_sect]\nsystem_default = system_default_sect\n[system_default_sect]\nGroups = $groups\n' > /tmp/g.cnf
        OPENSSL_CONF=/tmp/g.cnf python3 /bench/probe.py $N $rep" >> "$OUT"
  done
done
echo "probe done: $(wc -l < "$OUT") rows -> $OUT" >&2
