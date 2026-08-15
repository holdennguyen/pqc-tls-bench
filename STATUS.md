# STATUS — what ran, what's next (15 Aug, evening)

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
