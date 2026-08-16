.PHONY: up down verify gates bench scan clean ui-build
# Prereq (once): brew install colima docker docker-compose && colima start --cpu 8 --memory 12
up:
	docker compose up -d --build
down:
	docker compose down -v
# OpenSSL prints hybrid groups as "Negotiated TLS1.3 group: ..." but classical
# curves as "Peer Temp Key: ..." — normalize both to "Negotiated group: <g>".
verify:
	@echo "--- hybrid (expect X25519MLKEM768)"
	@docker compose exec -T openssl-client sh -c \
	 "echo | openssl s_client -connect nginx-hybrid:443 -brief 2>&1" \
	 | grep -E 'Negotiated TLS1.3 group|Peer Temp Key|Ciphersuite' \
	 | sed -E 's/(Negotiated TLS1.3 group|Peer Temp Key): ([A-Za-z0-9]+).*/Negotiated group: \2/'
	@echo "--- classic (expect X25519)"
	@docker compose exec -T openssl-client sh -c \
	 "echo | openssl s_client -connect nginx-classic:443 -brief 2>&1" \
	 | grep -E 'Negotiated TLS1.3 group|Peer Temp Key|Ciphersuite' \
	 | sed -E 's/(Negotiated TLS1.3 group|Peer Temp Key): ([A-Za-z0-9]+).*/Negotiated group: \2/'
# exit 0 = PASS, exit 2 = PENDING (feature not built yet, phase-gated), else FAIL.
# Overall failure only on FAIL — a pending future feature must not mask a regression.
gates:
	@fail=0; summary=""; for g in gates/gate_*.sh; do \
	  echo "== $$g"; sh $$g; rc=$$?; \
	  case $$rc in 0) s=PASS;; 2) s=PENDING;; *) s=FAIL; fail=1;; esac; \
	  summary="$$summary\n$$s	$$g"; \
	done; printf "\n---- gate summary ----$$summary\n"; \
	[ $$fail -eq 0 ] && echo "GATES: GREEN (no failures)" || { echo "GATES: RED"; exit 1; }
bench:
	sh bench/run_all.sh
# Build the SPA (frontend/ -> static/app/, committed artifact) inside the same
# pinned node image the api-node service uses; stamp the source hash for
# gate_ui_build's stale-dist check. No host node required.
NODE_IMG=node:25-slim@sha256:81db02c4b671288a03915da9534dbd54f96d0e7c24d80ccc54f5b36b2e684370
# PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD: the playwright LIB installs here (for the
# e2e spec); browsers come from the pinned mcr.microsoft.com/playwright image
# in gate_frontend — lib version 1.62.1 must match that image tag.
ui-build:
	docker run --rm -e PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 -v "$(PWD):/repo" -w /repo/frontend $(NODE_IMG) \
	  sh -c "npm ci --no-audit --no-fund && npm run build"
	sh frontend/srchash.sh > static/app/.srchash
	@echo "UI BUILD DONE -> static/app/"
# scan runs in-container: needs a FULL OpenSSL 3.5 client (see pqscan.py FIELD NOTE)
scan:
	docker run --rm -v "$(PWD)/pqscan:/pqscan:ro" -v "$(PWD)/results:/results" \
	  python:3.13-slim-trixie@sha256:ffb752e139c0a19692a43af8d8523b274222dd68eebad5d583b45c2201c6e30a \
	  python3 /pqscan/pqscan.py /pqscan/hosts.txt -o /results/scan.json --html /results/scan.html
