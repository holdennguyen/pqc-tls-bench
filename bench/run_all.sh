#!/bin/sh
# Full benchmark battery -> results/*.csv + results/summary.json (gate_bench checks these).
#   1. handshake probe: 5 hops x 2 modes x 3 reps (timing + bytes)
#   2. k6: 2 modes x {churn,pooled} x {15,45} rps x 3 reps (30s each, 10s warmup discarded)
#   3. netem +20ms: churn @15 rps rerun, both modes x 3 reps
#   4. tshark H1 byte capture (corroboration)
#   5. aggregate -> percentiles + CI95
set -e
cd "$(dirname "$0")/.."
mkdir -p results

k6run() { # mode profile rate rep rtt warmup
  mode=$1 profile=$2 rate=$3 rep=$4 rtt=$5 warmup=$6
  if [ "$warmup" = 1 ]; then dur=10s out=""; else dur=30s out="-o experimental-prometheus-rw"; fi
  docker compose --profile bench run --rm -T k6 run /scripts/scenario.js \
    -e MODE="$mode" -e PROFILE="$profile" -e RATE="$rate" -e REP="$rep" \
    -e RTT="$rtt" -e WARMUP="$warmup" -e DURATION="$dur" \
    $out --tag testid="$mode-$profile-r$rate-rtt$rtt" \
    --tag mode="$mode" --tag profile="$profile" --tag rate="$rate" --tag rtt="$rtt" \
    --quiet --no-usage-report >/dev/null 2>&1 \
    || { echo "K6 RUN FAILED: $mode $profile r$rate rtt$rtt rep$rep" >&2; exit 1; }
}

echo "== [1/5] handshake probe"
sh bench/probe.sh

echo "== [2/5] k6 matrix (baseline rtt)"
for mode in hybrid classic; do
  for profile in churn pooled; do
    for rate in 15 45; do
      echo "  k6 $mode/$profile @${rate}rps: warmup"
      k6run "$mode" "$profile" "$rate" 0 0 1
      for rep in 1 2 3; do
        echo "  k6 $mode/$profile @${rate}rps rep$rep"
        k6run "$mode" "$profile" "$rate" "$rep" 0 0
      done
    done
  done
done

echo "== [3/5] netem +20ms, churn @15rps"
sh bench/netem.sh add 20ms
trap 'sh bench/netem.sh del' EXIT
for mode in hybrid classic; do
  k6run "$mode" churn 15 0 20 1
  for rep in 1 2 3; do
    echo "  k6-netem $mode/churn @15rps rep$rep"
    k6run "$mode" churn 15 "$rep" 20 0
  done
done
sh bench/netem.sh del
trap - EXIT

echo "== [4/5] tshark H1 capture"
sh bench/capture.sh

echo "== [5/5] aggregate"
python3 bench/aggregate.py

echo "BENCH DONE"
