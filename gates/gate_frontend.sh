#!/bin/sh
# GATE: frontend behavior (sensor readout = Playwright, per .claude/skills/webapp-testing).
# Runs frontend/e2e/frontend.spec.mjs in the pinned Playwright image ON THE COMPOSE
# NETWORK (host browsers can't be assumed; localhost isn't reachable from the
# container), against BOTH edges. The spec asserts, per edge:
#   a) zero pageerror / console.error events on every visited route
#   b) >=1 sensor JSON line ({"scope":"api"|"route"|"auth",...}) per scope in console
#      — the frontend mirror of the backend sensor contract — and no failed invariants
#   c) full user journey: login -> dashboard -> records -> create -> cache-hit
#      reload -> search -> edit -> delete -> logout (against the live APIs)
#   d) TLS badge non-empty; on nginx-classic it must equal X25519 exactly
#      (chromium may itself negotiate ML-KEM on the hybrid edge, so only the
#      classic edge's group is deterministic from a browser)
[ -d frontend ] || { echo "GATE_FRONTEND: PENDING (no frontend/ yet)"; exit 2; }
cd "$(dirname "$0")/.."
[ -s frontend/e2e/frontend.spec.mjs ] || { echo "GATE_FRONTEND: PENDING (no spec yet)"; exit 2; }

# Browsers live in this image; the playwright LIB resolves from frontend/node_modules
# and its version (package.json: 1.62.1) must match this image tag.
PW_IMAGE="${PW_IMAGE:-mcr.microsoft.com/playwright@sha256:dcc5531e97840b9b5e794f2814476b21571c5124a3fca2267d73041f56e7580e}"
[ -d frontend/node_modules/playwright ] \
  || { echo "GATE_FRONTEND: FAIL (frontend/node_modules missing — run: make ui-build)"; exit 1; }
NET=$(docker network ls --format '{{.Name}}' | grep -m1 'pqc-tls-bench_default') \
  || { echo "GATE_FRONTEND: FAIL (compose network not up)"; exit 1; }

docker run --rm --network "$NET" -v "$(pwd)/frontend:/repo/frontend:ro" \
  -w /repo/frontend "$PW_IMAGE" node e2e/frontend.spec.mjs \
  && echo "GATE_FRONTEND: PASS" \
  || { echo "GATE_FRONTEND: FAIL"; exit 1; }
