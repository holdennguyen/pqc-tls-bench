#!/bin/sh
# GATE: frontend build integrity. The SPA source lives in frontend/; the built
# dist is COMMITTED at static/app/ (served by both nginx modes via bind mount —
# zero compose/topology change). This gate proves the committed dist is real
# (built artifact, not handwritten) and NOT STALE relative to frontend/ source.
# The build itself (npm ci + tsc + vite build) runs via `make ui-build`, which
# stamps static/app/.srchash with the source-tree hash this gate re-computes.
# PENDING until the SPA rebuild lands (plan: fullstack UI, Aug 2026).
[ -d frontend ] || { echo "GATE_UI_BUILD: PENDING (no frontend/ yet)"; exit 2; }
cd "$(dirname "$0")/.."
fail=0

[ -s static/app/index.html ] || { echo "missing static/app/index.html (run: make ui-build)"; fail=1; }
ls static/app/assets/*.js >/dev/null 2>&1 || { echo "missing static/app/assets/*.js bundle"; fail=1; }
# built artifact marker: vite injects hashed asset URLs under /app/assets/
grep -q '/app/assets/' static/app/index.html 2>/dev/null \
  || { echo "static/app/index.html is not a vite build artifact"; fail=1; }

want=$(sh frontend/srchash.sh 2>/dev/null)
have=$(cat static/app/.srchash 2>/dev/null)
if [ -z "$want" ]; then echo "frontend/srchash.sh missing or failed"; fail=1
elif [ "$want" != "$have" ]; then
  echo "STALE DIST: frontend/ changed after last build (src=$want dist=${have:-none}) — run: make ui-build"; fail=1
fi

[ $fail -eq 0 ] && echo "GATE_UI_BUILD: PASS" || { echo "GATE_UI_BUILD: FAIL"; exit 1; }
