# pqc-tls-bench
Thesis testbed: cost of hybrid PQC key exchange (X25519MLKEM768) vs classical in TLS 1.3, per microservice hop.
See CLAUDE.md for the full brief, RUNBOOK.md for zero-to-demo, DEMO.md for the defense walkthrough.

## Run it
```
colima start --cpu 8 --memory 12
make up         # 14 containers, images digest-pinned, OpenSSL >= 3.5 everywhere
make ui-build   # build the medical-records SPA (frontend/ -> static/app/, pinned node image)
make verify     # prints the negotiated group per edge (X25519MLKEM768 / X25519)
make gates      # 9 deterministic gates — a feature doesn't exist until its gate passes
make bench      # official measurements -> results/*.csv (+ summary.json)
make scan       # pqscan: PQC readiness of ~100 real hosts -> results/scan.{json,html}
```
Deploys unchanged on one AWS EC2 VM (install docker-ce, clone, same targets).

## What's inside
- Two identical stacks behind two nginx edges — hybrid :8443, classic :8444; the ONLY
  config difference is the TLS key-exchange group list. Hops: browser->edge, edge->api
  (FastAPI + node:https), api->PostgreSQL, api->Redis — all TLS 1.3.
- Medical-records SPA (React+Vite, Vietnamese, fake demo login) committed as a build
  artifact in static/app/ and served by both edges; every response shows which API
  served it, the negotiated TLS group, and cache status; a telemetry strip prints
  frontend sensor lines live.
- Sensors + gates workflow: every boundary-crossing function emits one JSON checkpoint
  line ({ts, fn, scope, ok, ms, invariant_results}); gates read them back (docker logs
  for the backend, Playwright console capture for the frontend).
- Observability: OTel auto-instrumentation -> Jaeger traces; Grafana dashboard
  "pqc-vs-classic" (:3000) under live k6 load; results analysis in THESIS_RESULTS.md.
