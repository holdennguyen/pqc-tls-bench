#!/bin/sh
# GATE: UI layer. Portal 200 on both modes; tls-info reports correct group per mode; scan report exists.
# TODO(claude-code): curl -k https://localhost:8443/ and :8444/ -> 200;
# curl -k https://localhost:8443/api/tls-info | jq .group == "X25519MLKEM768"; :8444 == "X25519";
# test -s results/scan.html && grep -q 'verdict' results/scan.html
echo "GATE_UI: TODO"; exit 1
