#!/bin/sh
# tshark byte capture of H1 handshakes (corroborates probe.py's byte counts).
# Captures 5 exclusive-group handshakes per mode into results/h1-<mode>.pcap
# (gitignored) and writes per-connection TLS handshake byte sums to
# results/h1_tshark_bytes.csv.
set -e
cd "$(dirname "$0")/.."
mkdir -p results
NETSHOOT="nicolaka/netshoot@sha256:b09d9b21381f47a79b3cbcb30da25266dc17186ea00ae65e99fdc51396f48e70"
OUT=results/h1_tshark_bytes.csv
echo "mode,tcp_stream,direction,handshake_bytes" > "$OUT"

for mode in hybrid classic; do
  [ "$mode" = hybrid ] && groups=X25519MLKEM768 || groups=X25519
  c="pqc-tls-bench-nginx-$mode-1"
  docker rm -f pqc-capture >/dev/null 2>&1 || true
  docker run -d --name pqc-capture --network "container:$c" -v "$PWD/results:/out" \
    "$NETSHOOT" tshark -i eth0 -f "tcp port 443" -w "/out/h1-$mode.pcap" -a duration:12 >/dev/null
  sleep 3
  for i in 1 2 3 4 5; do
    docker compose exec -T openssl-client sh -c \
      "echo | openssl s_client -connect nginx-$mode:443 -groups $groups -brief 2>&1" >/dev/null
  done
  sleep 10
  docker rm -f pqc-capture >/dev/null 2>&1 || true
  # sum TLS handshake-record frame bytes per TCP stream and direction
  docker run --rm -v "$PWD/results:/out" "$NETSHOOT" sh -c \
    "tshark -r /out/h1-$mode.pcap -Y 'tls.handshake' -T fields -e tcp.stream -e tcp.dstport -e frame.len 2>/dev/null" \
    | awk -v m="$mode" '{dir = ($2 == 443) ? "client_to_server" : "server_to_client"; b[$1","dir] += $3}
        END {for (k in b) print m","k","b[k]}' >> "$OUT"
done
echo "tshark capture done -> $OUT" >&2
