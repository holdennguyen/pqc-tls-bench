#!/bin/sh
# GATE: measurement quality is machine-checked before RQ1 may be called done.
# Raw + aggregated benchmark artifacts must exist, be complete, and be CI-computable.
fail=0

# 1) probe raw data: 8 columns, no empty cells, 30 (hop,mode,rep) groups x >=100 measured rows
f=results/handshake_probe.csv
if [ -s "$f" ]; then
  awk -F, 'NR>1 { if (NF != 8) bad++; for (i=1; i<=NF; i++) if ($i == "") bad++ }
           END { exit bad > 0 }' "$f" || { echo "malformed/empty cells: $f"; fail=1; }
  groups=$(awk -F, 'NR>1 && $5==0 {print $1","$2","$3}' "$f" | sort -u | wc -l | tr -d ' ')
  [ "$groups" -eq 30 ] || { echo "expected 30 (hop,mode,rep) groups in $f, got $groups"; fail=1; }
  awk -F, 'NR>1 && $5==0 {n[$1","$2","$3]++}
           END {for (k in n) if (n[k] < 100) {print "  <100 samples: " k; bad=1}; exit bad}' "$f" \
    || { echo "insufficient samples per rep in $f"; fail=1; }
else echo "missing $f"; fail=1; fi

# 2) k6 summary: every scenario has >=3 reps, no empty cells
f=results/k6_summary.csv
if [ -s "$f" ]; then
  awk -F, 'NR>1 { for (i=1; i<=NF; i++) if ($i == "") bad++ } END { exit bad > 0 }' "$f" \
    || { echo "empty cells: $f"; fail=1; }
  awk -F, 'NR==1 {for (i=1; i<=NF; i++) if ($i=="reps") c=i}
           NR>1 && $c < 3 {print "  <3 reps: " $1" "$2" r"$3" rtt"$4; bad=1} END {exit bad}' "$f" \
    || { echo "scenarios with <3 reps in $f"; fail=1; }
  rows=$(tail -n +2 "$f" | wc -l | tr -d ' ')
  [ "$rows" -eq 10 ] || { echo "expected 10 scenario rows (2 modes x [2x2 + netem]), got $rows"; fail=1; }
else echo "missing $f"; fail=1; fi

# 3) aggregated summary with computable CIs
if [ -s results/summary.json ]; then
  jq -e '
    (.probe | keys | length) == 5
    and (.probe["H1-edge"].hybrid.ms_p50.ci95 | type == "number")
    and (.probe["H1-edge"].classic.ms_p50.ci95 | type == "number")
    and (.k6 | keys | length) == 5
    and ([.k6[][] | .hs_p95_ms.ci95] | all(type == "number"))
    and (.headline_probe_p50_delta | keys | length) == 5
  ' results/summary.json >/dev/null || { echo "summary.json incomplete or CI not computable"; fail=1; }
else echo "missing results/summary.json"; fail=1; fi

# 4) tshark corroboration exists with both modes
grep -q '^hybrid,' results/h1_tshark_bytes.csv 2>/dev/null \
  && grep -q '^classic,' results/h1_tshark_bytes.csv 2>/dev/null \
  || { echo "missing/incomplete results/h1_tshark_bytes.csv"; fail=1; }

[ $fail -eq 0 ] && echo "GATE_BENCH: PASS" || { echo "GATE_BENCH: FAIL"; exit 1; }
