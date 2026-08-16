#!/bin/sh
# GATE: frontend behavior (sensor readout = Playwright, per .claude/skills/webapp-testing).
# Runs gates/frontend.spec.mjs in the pinned Playwright image ON THE COMPOSE NETWORK
# (host browsers can't be assumed; localhost isn't reachable from the container),
# against BOTH edges. The spec must assert, per edge:
#   a) zero pageerror / console.error events on every visited route
#   b) >=1 sensor JSON line ({"scope":"api"|"route"|"auth",...}) per scope in console
#      — the frontend mirror of the backend sensor contract
#   c) full user journey: login -> dashboard -> records list/search -> create ->
#      edit -> delete (asserted against the live APIs)
#   d) TLS badge non-empty; on nginx-classic it must equal X25519 exactly
#      (chromium may itself negotiate ML-KEM on the hybrid edge, so only the
#      classic edge's group is deterministic from a browser)
# PENDING until the SPA rebuild lands (plan: fullstack UI, Aug 2026).
[ -d frontend ] || { echo "GATE_FRONTEND: PENDING (no frontend/ yet)"; exit 2; }
cd "$(dirname "$0")/.."
[ -s gates/frontend.spec.mjs ] || { echo "GATE_FRONTEND: PENDING (no spec yet)"; exit 2; }

# Pinned when the SPA scaffold lands (see plan step 4); multi-arch (ARM64 host).
PW_IMAGE="${PW_IMAGE:?PW_IMAGE digest not pinned yet — set in this file at scaffold time}"
NET=$(docker network ls --format '{{.Name}}' | grep -m1 'pqc-tls-bench_default') \
  || { echo "GATE_FRONTEND: FAIL (compose network not up)"; exit 1; }

docker run --rm --network "$NET" \
  -v "$(pwd)/gates/frontend.spec.mjs:/spec/frontend.spec.mjs:ro" \
  "$PW_IMAGE" node /spec/frontend.spec.mjs \
  && echo "GATE_FRONTEND: PASS" \
  || { echo "GATE_FRONTEND: FAIL"; exit 1; }
