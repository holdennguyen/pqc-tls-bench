# AGENTS.md

Project overview, the sensors+gates workflow, and the full brief live in `CLAUDE.md`.
Standard commands live in the `Makefile` and `README.md` (`make up` / `ui-build` / `verify`
/ `gates` / `bench` / `scan`). Zero-to-demo steps are in `RUNBOOK.md`.

## Cursor Cloud specific instructions

This repo is a Docker Compose testbed (14 containers) whose whole point is OpenSSL >= 3.5
key-exchange negotiation. All crypto happens **inside the pinned container images**; the
host toolchain is irrelevant. A few non-obvious things about running it here:

- **Container runtime.** Docker Engine + Compose are installed in the base image, but there
  is no systemd, so the daemon does not auto-start. Start it once per pod before any
  `make`/`docker` command and wait for it to be ready:
  `sudo dockerd > /tmp/dockerd.log 2>&1 &` then poll `docker info`. The `ubuntu` user is
  already in the `docker` group (no `sudo` needed for the `docker` CLI itself). The daemon
  uses the `fuse-overlayfs` storage driver with the containerd snapshotter disabled
  (`/etc/docker/daemon.json`) — required for Docker 29 in this nested environment.

- **Compose project name MUST be `pqc-tls-bench`.** Several scripts hardcode the project's
  network (`pqc-tls-bench_default`) and container names (`pqc-tls-bench-*`): `gates/gate_frontend.sh`,
  `bench/probe.sh`, `bench/netem.sh`, `bench/capture.sh`, `frontend/e2e/shot.mjs`. Compose
  otherwise derives the project name from the checkout directory (`/workspace` -> `workspace`),
  which breaks those scripts (`gate_frontend` fails with "compose network not up"). Fix:
  `export COMPOSE_PROJECT_NAME=pqc-tls-bench` (already added to `~/.bashrc`). Non-interactive
  shells (`sh -c ...`) do not source `~/.bashrc`, so if `make up`/`make gates`/a bench script
  is invoked from one, pass it explicitly: `COMPOSE_PROJECT_NAME=pqc-tls-bench make up`.

- **TLS certs are generated locally, not committed.** `certs/server.key` is gitignored by
  design; the startup/update script regenerates a matching self-signed ECDSA P-256 key+cert
  (SANs for every service hostname) whenever the key is missing. This overwrites the committed
  `certs/server.crt` with a functionally equivalent one, so `git status` shows `certs/server.crt`
  as modified — that is expected local state; do **not** commit it.

- **`make gates` is the test suite** (9 deterministic gates; green == all features exist).
  `gate_frontend` runs the full Playwright user journey against both edges and needs
  `frontend/node_modules` (the `playwright` lib), which `make ui-build` populates. The SPA in
  `static/app/` is a committed build artifact; rerun `make ui-build` after any `frontend/`
  change (it also runs `tsc --noEmit`, the frontend typecheck) or `gate_ui_build` will flag a
  stale dist.

- **URLs / access.** Hybrid edge `https://localhost:8443`, classic edge `https://localhost:8444`
  (self-signed cert — expect a browser warning), Grafana `http://localhost:3000`, Prometheus
  `http://localhost:9090`, Jaeger `http://localhost:16686`. SPA at `/app`; demo login accepts
  any credentials (e.g. `gate` / `x`). `make verify` proves the edges negotiate
  `X25519MLKEM768` (hybrid) vs `X25519` (classic).
