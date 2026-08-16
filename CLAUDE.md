# pqc-tls-bench — Claude Code briefing

Bachelor thesis testbed. DEFENSE IS 18 AUG — today is 15/16 Aug. Owner: Holden (SRE background, crypto beginner).

## What this is
Measure the cost of hybrid post-quantum key exchange (X25519MLKEM768) vs classical
(X25519) in TLS 1.3, PER HOP of a polyglot microservices app:
  H1  k6/browser -> nginx edge
  H2a edge -> api-python (FastAPI/uvicorn)
  H2b edge -> api-node  (Node.js https)
  H3  api -> PostgreSQL (TLS required)
  H4  api -> Redis      (TLS required)
Central hypothesis: hybrid cost shows up on churned connections (H1), amortizes
to ~zero on pooled ones (H3/H4). Every hop runs BOTH modes; the only config
difference allowed between modes is the key-exchange group list.

## Business domain (deliberate choice — do not genericize)
A clinic MEDICAL RECORDS system: the exact class of long-secrecy-lifetime data
that motivates harvest-now-decrypt-later. Endpoints (identical in both languages):
  GET  /health          — no data touch (isolates pure TLS cost)
  GET  /records/{id}    — Postgres read, Redis cache-aside
  POST /records         — Postgres write (end-to-end user transaction)
Seed: ~50 FULLY SYNTHETIC patient records (VN names, diagnoses, dates — invented,
never real data). Table: records(id, patient_name, dob, diagnosis, notes, created_at).

## Hard rules
- Docker Engine via COLIMA on the Mac (never Docker Desktop — licensing parity with
  EC2 where it's plain docker-ce). Setup: brew install colima docker docker-compose
  && colima start --cpu 8 --memory 12. All make targets assume plain docker CLI.
- OpenSSL >= 3.5 everywhere (native X25519MLKEM768). Debian trixie+ bases. PIN DIGESTS.
- Never implement any crypto. Config only.
- Same hardware, same everything between modes. Warm-ups discarded. 3 reps/scenario,
  p50/p95/p99 + 95% CI. Raw data -> results/ as CSV.
- NO service mesh (Istio/Linkerd). Reason is scientific, not laziness: mesh sidecars
  terminate TLS and substitute their own mTLS, which HIDES the experiment variable
  (app-level TLS group). Observability comes from OpenTelemetry instead.
- Apple Silicon (ARM64) host — multi-arch images only.

## Observability (OpenTelemetry — yes; keep it cheap)
- Auto-instrumentation ONLY (opentelemetry-instrument for FastAPI; @opentelemetry/auto-instrumentations-node).
  No manual span plumbing beyond the sensor decorators below.
- OTLP -> otel-collector -> Jaeger all-in-one (one container each). Grafana stays for metrics.
- Value: one trace per user request spanning edge->api->db/cache, both modes side by side.
  OTel spans measure REQUEST latency; official handshake numbers still come from probe+tshark.

## Control-theory code discipline (sensors + gates) — THIS IS THE WORKFLOW
The codebase is a controlled plant. You (the agent) are the actuator. The loop:
  setpoint  = each feature's GATE (a deterministic yes/no script in gates/)
  sensor    = structured checkpoint events emitted at function boundaries
  error     = gate failure output
  actuator  = you, fixing and re-running until green
Rules:
1. A feature DOES NOT EXIST until its gate passes. Never mark work done on "it should work".
2. Write the gate BEFORE or WITH the feature, never after.
3. SENSORS: every service function that crosses a boundary (TLS connect, DB query,
   cache op, handler) is wrapped by the sensor decorator from services/*/sensors.*:
   emits one JSON line {ts, fn, scope, ok, ms, invariant_results[]} to stdout AND
   an OTel span attribute. Invariants are cheap assertions declared per function
   (e.g. db_conn: pg_stat_ssl reports ssl=true AND group matches MODE env).
4. Debug flags: LOG_SENSORS=1 turns on verbose checkpoint dumps per scope —
   the automated equivalent of clicking breakpoints; use it instead of print-debugging,
   then leave the sensors in (they are the monitoring).
Existing gates (implement to match, extend as features grow):
  gates/gate_tls.sh    — hybrid endpoint negotiates X25519MLKEM768, classic negotiates X25519
  gates/gate_db.sh     — both APIs' PG connections: pg_stat_ssl ssl=true, TLSv1.3, expected group
  gates/gate_cache.sh  — redis INFO: ssl:1, connection alive from both APIs
  gates/gate_api.sh    — full CRUD + search/pagination correct on both APIs, cross-API
                         visibility, cache invalidation on PUT/DELETE, sensor lines present
  gates/gate_trace.sh  — one POST /records produces a trace with >=3 spans in Jaeger
  gates/gate_bench.sh  — results/*.csv exist, >=3 reps, CI computable, no empty cells
  gates/gate_ui_build.sh — committed static/app dist is a real vite artifact and not
                         stale vs frontend/ source (srchash stamp from make ui-build)
  gates/gate_frontend.sh — Playwright (pinned mcr image, compose network, both edges):
                         full user journey, zero console errors, sensor lines per scope
                         api/route/auth, no failed invariants, X25519 badge exact on classic
`make gates` runs all. CI habit: run `make gates` after every feature commit.

## Day-1 gate (DO THIS FIRST, tonight)
colima start -> make up (nginx pair only is fine) -> make verify
must print "Negotiated group: X25519MLKEM768". Plan B if stock nginx OpenSSL < 3.5:
image openquantumsafe/nginx. Escalate to plan B after 1 hour of fighting, not 5.

## Milestones
- Sun 16: verify gate + gate_tls green; self-signed certs; both nginx modes up.
- Mon 17 AM: full compose (APIs + PG + Redis TLS + otel + jaeger); gates db/cache/api/trace green;
  probe.sh measuring H1–H4 both modes.
- Mon 17 PM: k6 churn+pooled, 2 load levels × 3 reps; tc netem 20ms rerun of H1;
  tshark byte capture; pqscan ~100 domains (ONE handshake/host, 5s timeout, no retries,
  no HTTP requests); gate_bench green; results/*.csv complete.
- Mon night: Grafana dashboard comparing modes + Jaeger trace for demo. Record backup video.

## Out of scope (do NOT build)
Java service (JDK 27 EA — future work), MongoDB, ML-DSA certs, service mesh,
auth/users, manual OTel spans, anything not needed for measurement.

## Vendored skills (.claude/skills/ — use them, don't reinvent)
- designing-test-scenarios + generating-api-load-tests: build the k6 churn/pooled scripts from these.
- analyzing-test-results: follow for p50/p95/p99 + CI reporting from k6 output.
- k6-load-testing: thresholds/SLA patterns.
- prometheus + promql: scrape config and the queries behind the Grafana panels.
- grafana-dashboarding: the mode-comparison dashboard (the defense demo screen).
- opentelemetry: collector config + auto-instrumentation for both APIs.
Run install-skills-global.command once if you also want these outside this repo.

## UI layer (every part visible — the committee must SEE it, not read terminals)
1. static/portal/index.html — demo portal served by BOTH nginx modes at /:
   dark, clean, Vietnamese labels; cards linking to /app, Grafana :3000, Jaeger :16686, /scan;
   header badge fetches /api/tls-info and shows the LIVE negotiated group + mode color
   (blue=X25519, red=X25519MLKEM768). nginx must expose negotiated group to the app
   (proxy_set_header X-TLS-Group $ssl_curve;) — each API echoes it at GET /api/tls-info.
2. static/app/ — medical-records SPA, a COMMITTED build artifact of frontend/
   (React+Vite+TS; `make ui-build` builds in the pinned node image — no host node).
   Login (fake, demo-labeled) -> dashboard -> records CRUD + search + pagination;
   every response shows which API served it (python|node), the TLS group and cache
   status via MetaChips; the bottom telemetry strip live-prints the last frontend
   sensor line ({ts,fn,scope,ok,ms,invariant_results} to browser console — same
   contract as backend sensors, read back by gate_frontend via Playwright).
   This is the "database call / UI response" story made visible. /app/map
   ("Sơ đồ chức năng") renders the OBSERVED function-call graph — sensors track
   parent->child calls (contextvars / AsyncLocalStorage, stdlib only) exposed at
   GET /api/sensors/graph — a function-level mesh view WITHOUT a mesh, so the
   TLS experiment variable stays visible.
3. pqscan --html results/scan.html — self-contained report: summary stat tiles
   (% PQC-ready), sortable host table with verdict badges, plain-language exposure notes
   in Vietnamese. nginx serves it at /scan.
4. Grafana dashboard "PQC vs Classic" provisioned from grafana/dashboards/*.json
   (auto-loaded, not hand-clicked): handshake latency p50/p95/p99 per hop, bytes,
   CPU, side-by-side mode comparison. This dashboard is the defense centerpiece.
Gate addition: gates/gate_ui.sh — portal returns 200 on both modes, /api/tls-info shows
the correct group per mode, scan.html exists and contains >=1 verdict badge.
