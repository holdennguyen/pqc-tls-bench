# pqc-tls-bench
Thesis testbed: cost of hybrid PQC key exchange (X25519MLKEM768) vs classical in TLS 1.3, per microservice hop.
`make up` → `make verify` → `make bench`. See CLAUDE.md for the full brief. Results land in results/ as CSV.
Deploys unchanged on one AWS EC2 VM (install docker, clone, make up).
