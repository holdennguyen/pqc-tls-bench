# RUNBOOK — from zero to defense demo
Every command in order. Run Phase 0–2 TONIGHT (Sat). Phases marked 🤖 are for Claude Code; ⌨️ are you.

## Phase 0 — Tools (⌨️ ~20 min, once)
```bash
# 0.1 Homebrew present?
brew --version || /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# 0.2 Container runtime — Colima, NOT Docker Desktop
brew install colima docker docker-compose git gh jq
colima start --cpu 8 --memory 12 --disk 60

# 0.3 Verify the toolchain (all must succeed before continuing)
docker version            # Client + Server (colima context)
docker compose version
git --version
gh --version
openssl version           # host openssl version is irrelevant for the lab; containers carry 3.5

# 0.4 Claude Code up to date
claude --version || npm install -g @anthropic-ai/claude-code
```

## Phase 1 — Repo + GitHub (⌨️ ~10 min)
```bash
cd ~/Documents/Workspace/02-UNIVERSITY/capstone/code/pqc-tls-bench

# 1.1 Git init with sane ignores
git init -b main
cat > .gitignore <<'GI'
results/*.pcap
certs/*.key
node_modules/
__pycache__/
.DS_Store
_to_delete/
GI
git add -A && git commit -m "scaffold: testbed skeleton, gates, sensors, vendored skills"

# 1.2 GitHub — public repo (thesis requires a public reproducibility kit)
gh auth login          # browser flow, one time
gh repo create pqc-tls-bench --public --source=. --push \
  --description "Measuring the cost of hybrid post-quantum key exchange (X25519+ML-KEM-768) in TLS 1.3 across microservice hops — bachelor thesis reproducibility kit"

# 1.3 Confirm
gh repo view --web
```
Commit style from here: one feature per commit, gate green before commit (`make gates`).

## Phase 2 — Day-1 gate (🤖 tonight, ~1h budget then plan B)
```bash
claude   # inside the repo
```
Prompt: **"Read CLAUDE.md and RUNBOOK.md. Do the day-1 gate: self-signed certs, both nginx
modes up, make verify prints X25519MLKEM768. If stock nginx OpenSSL < 3.5 after 1 hour,
switch to openquantumsafe/nginx. Then commit and push."**

## Phase 3 — Sunday PM (🤖 after teacher signature)
Prompt: **"Build the full compose per CLAUDE.md: both APIs with sensors + OTel, Postgres/Redis
TLS, gates db/cache/api/trace green. Commit per feature, gates before commits."**

## Phase 4 — Monday: data + UI polish (🤖 + ⌨️)
1. 🤖 probe + k6 (churn/pooled × 2 loads × 3 reps) + netem 20ms + tshark + pqscan → results/*.csv, gate_bench green
2. ⌨️ OPSWAT slide block (2h, timeboxed)
3. 🤖 inject numbers → I (Cowork) fill thesis Ch.4–5 slots from results/
4. ⌨️ Record backup demo video (script in DEMO.md), rehearse ×2

## Phase 5 — SPA rebuild (🤖 done 16 Aug, after Phase 4)
The static UI was replaced by a React+Vite SPA (frontend/ → committed dist in static/app/).
Rebuild after any frontend/ change: `make ui-build` (runs in the pinned node image; gate_ui_build
fails on a stale dist). e2e behavior gate: `sh gates/gate_frontend.sh` (Playwright, both edges).
Rollback to the pre-rebuild build: `git checkout v1.0-defense`.

## The demo UI layer (all parts get a UI — see CLAUDE.md §UI)
| URL (local) | What the committee sees |
|---|---|
| https://localhost:8443  | **Demo portal** — landing page linking everything below |
| https://localhost:8443/app | Medical-records SPA (demo login → dashboard → CRUD + search) — TLS badge live, telemetry strip prints frontend sensor lines |
| http://localhost:3000   | Grafana — hybrid vs classic dashboard under live k6 load |
| http://localhost:16686  | Jaeger — one trace: edge → API → DB/cache |
| https://localhost:8443/scan | pqscan HTML report — which real websites are PQC-ready |

Hosting for presentation: localhost is the defense plan (no wifi risk). Optional flex if time
allows Monday night: `gh repo` → one EC2 t3.medium, install docker-ce, clone, `make up`,
then the portal is on a real URL — nice but NOT required; do not trade rehearsal time for it.

## If something breaks
- colima won't start → `colima delete && colima start --cpu 8 --memory 12`
- verify prints X25519 on hybrid → image's OpenSSL < 3.5 → plan B image (CLAUDE.md)
- gh push rejected → `gh auth refresh -s repo`
- Anything else → paste the error to Claude Code; two-hour rule applies (45-min version).
