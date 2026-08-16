.PHONY: up down verify gates bench scan clean
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
	bash bench/run_all.sh
scan:
	python3 pqscan/pqscan.py pqscan/hosts.txt -o results/scan.json
