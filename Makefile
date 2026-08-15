.PHONY: up down verify gates bench scan clean
# Prereq (once): brew install colima docker docker-compose && colima start --cpu 8 --memory 12
up:
	docker compose up -d --build
down:
	docker compose down -v
verify:
	@echo "--- hybrid (expect X25519MLKEM768)"
	@docker compose exec -T openssl-client sh -c \
	 "echo | openssl s_client -connect nginx-hybrid:443 -groups X25519MLKEM768 2>/dev/null | grep -E 'Negotiated|Cipher'"
	@echo "--- classic (expect X25519)"
	@docker compose exec -T openssl-client sh -c \
	 "echo | openssl s_client -connect nginx-classic:443 2>/dev/null | grep -E 'Negotiated|Cipher'"
gates:
	@for g in gates/gate_*.sh; do echo "== $$g"; sh $$g || exit 1; done
bench:
	bash bench/run_all.sh
scan:
	python3 pqscan/pqscan.py pqscan/hosts.txt -o results/scan.json
