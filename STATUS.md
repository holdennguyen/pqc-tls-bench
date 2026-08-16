# STATUS — what ran, what's next (16 Aug, night)

## Phase 3: GREEN — full stack, gates tls/db/cache/api/trace PASS (bench/ui pending phase 4)
- 11 containers: 2 nginx edges, 4 API instances (python/node × hybrid/classic),
  postgres 18.6 (TLS1.3-only, hostssl-only pg_hba), redis 8.10 (TLS-only, port 0),
  otel-collector -> jaeger. All digests pinned; every image OpenSSL >= 3.5 (verified).
- MODE design: servers accept a group superset (identical config both modes); each
  CLIENT offers EXACTLY ONE group (nginx proxy_ssl_conf_command / Python OPENSSL_CONF
  system_default / Node ecdhCurve) -> handshake success PROVES the negotiated group.
  Python needs the OPENSSL_CONF route because ssl.set_ecdh_curve rejects KEM hybrids.
- Sensors live in both APIs (same compact-JSON contract), invariants over cached TLS
  state; OTel auto-instrumentation gives 5–7 span traces per POST (edge->api->db/cache).
- 50 synthetic VN records seeded; cache-aside verified (2nd read = hit); cross-API
  read (python-created record read via node) verified through both edges.


## Day-1 gate: GREEN (16 Aug, Claude Code on the Mac)
- Self-signed ECDSA P-256 cert (SANs for all service hostnames) generated in-container.
- nginx:mainline (1.31.3, OpenSSL 3.5.6) + alpine/openssl (3.5.7) — both >= 3.5, NO plan B
  needed; digests pinned in compose.yml.
- Both nginx modes up (hybrid :8443, classic :8444); not-yet-built services parked in the
  compose "full" profile so `make up` works today.
- `make verify` prints "Negotiated group: X25519MLKEM768" (hybrid) / "X25519" (classic);
  gates/gate_tls.sh PASS. Note: OpenSSL -brief prints classical groups as "Peer Temp Key",
  hybrids as "Negotiated TLS1.3 group" — verify/gate normalize both.


## Executed from Cowork cloud (verified, real)
- OpenSSL 3.5.4 built from source → confirmed ML-KEM-512/768/1024 and hybrid groups
  X25519MLKEM768 / X448MLKEM1024 present. Validates the thesis's core infrastructure
  claim: NO oqs-provider needed on OpenSSL 3.5+.
- pqscan implemented in full (pqscan/pqscan.py) + 104 real hosts (global + VN banks,
  telcos, gov, universities, security vendors) + Vietnamese HTML report.
  Pipeline proven end-to-end: pqscan/sample-output/scan-SAMPLE-cloud.html.

## Honest limitation hit (documented, not hidden)
- The cloud box's STATIC openssl s_client lists the hybrid group but does NOT emit the
  ML-KEM key_share, so it negotiated classical X25519 with all 104 hosts -> a FALSE 0%.
  Client-build artifact, not server reality (browsers get hybrid from these CDNs).
- The SAMPLE report is labelled SAMPLE. It is NOT thesis data. The authoritative RQ2
  scan runs with a full OpenSSL 3.5 client (Homebrew openssl@3.5 or inside containers).

## Needs your Mac (RUNBOOK Phases 0-1) — cannot brew/colima/gh/docker from the cloud
1. brew install colima docker docker-compose git gh jq openssl@3.5
2. colima start --cpu 8 --memory 12 --disk 60
3. git init / gh auth login / gh repo create pqc-tls-bench --public --push
4. Sanity-check the client, then real scan:
     $(brew --prefix openssl@3.5)/bin/openssl s_client -connect pq.cloudflareresearch.com:443 \
       -groups X25519MLKEM768 -brief      # expect: Peer Temp Key: X25519MLKEM768
     OPENSSL_BIN=$(brew --prefix openssl@3.5)/bin/openssl make scan

## Then Claude Code (RUNBOOK Phase 2+) — it HAS docker + the .claude/skills
day-1 verify gate -> full compose (APIs+PG+Redis+OTel) -> benchmarks -> UI portal.
Every step behind a gate (make gates). Claude Code runs AND self-verifies.

## Why I didn't hand-write the APIs/portal from the cloud
Our discipline: a feature doesn't exist until its gate passes — and gates need docker,
which this cloud box lacks. Untested TLS code shipped blind would break the sensor/gate
contract. Claude Code on your Mac writes them and verifies them in one loop.
