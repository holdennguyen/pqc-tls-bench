#!/bin/sh
# Add/remove netem delay on BOTH nginx edges' eth0 (equal for both modes).
# Usage: netem.sh add [20ms] | netem.sh del
set -e
ACT=${1:?usage: netem.sh add|del [delay]}
DELAY=${2:-20ms}
NETSHOOT="nicolaka/netshoot@sha256:b09d9b21381f47a79b3cbcb30da25266dc17186ea00ae65e99fdc51396f48e70"
for c in pqc-tls-bench-nginx-hybrid-1 pqc-tls-bench-nginx-classic-1; do
  if [ "$ACT" = add ]; then
    docker run --rm --network "container:$c" --cap-add NET_ADMIN "$NETSHOOT" \
      tc qdisc add dev eth0 root netem delay "$DELAY"
    echo "netem: +$DELAY on $c"
  else
    docker run --rm --network "container:$c" --cap-add NET_ADMIN "$NETSHOOT" \
      tc qdisc del dev eth0 root || true
    echo "netem: cleared on $c"
  fi
done
