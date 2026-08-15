#!/bin/sh
# GATE: functional equivalence. All 3 endpoints correct on BOTH APIs; sensor JSON lines present in logs.
# TODO(claude-code): curl via edge for /health, /records/1, POST /records; diff python vs node responses
# (excluding timestamps); grep one sensor line per handler in each service's log.
echo "GATE_API: TODO"; exit 1
