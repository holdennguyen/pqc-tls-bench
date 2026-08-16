#!/bin/sh
# Deterministic hash of the frontend source tree. `make ui-build` stamps it into
# static/app/.srchash; gate_ui_build recomputes and compares (stale-dist check).
cd "$(dirname "$0")"
{ find src -type f; echo index.html; echo package.json; echo package-lock.json; \
  echo vite.config.ts; echo tsconfig.json; } \
  | LC_ALL=C sort | while read -r f; do [ -f "$f" ] && cat "$f"; done \
  | shasum -a 256 | cut -d' ' -f1
