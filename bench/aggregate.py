#!/usr/bin/env python3
"""Aggregate raw benchmark output into per-scenario percentiles with 95% CI.

In:  results/handshake_probe.csv, results/k6-*.json
Out: results/probe_summary.csv, results/k6_summary.csv, results/summary.json

Method: per-rep percentile first, then mean +/- CI95 across the 3 reps
(t=4.303 for n=3, two-sided 95%). Warm-up rows (warmup=1) are excluded.
Stdlib only — runs on the host python3.
"""
import csv
import glob
import json
import math
import statistics
from collections import defaultdict

T95 = {2: 12.706, 3: 4.303, 4: 3.182, 5: 2.776}


def pctl(values, p):
    vs = sorted(values)
    if not vs:
        return None
    k = (len(vs) - 1) * p / 100
    f, c = math.floor(k), math.ceil(k)
    return vs[f] if f == c else vs[f] + (vs[c] - vs[f]) * (k - f)


def ci95(per_rep_values):
    n = len(per_rep_values)
    mean = statistics.fmean(per_rep_values)
    if n < 2:
        return {"mean": round(mean, 3), "ci95": None, "n": n}
    sd = statistics.stdev(per_rep_values)
    ci = T95.get(n, 1.96) * sd / math.sqrt(n)
    return {"mean": round(mean, 3), "ci95": round(ci, 3), "n": n}


def aggregate_probe():
    rows = list(csv.DictReader(open("results/handshake_probe.csv")))
    rows = [r for r in rows if r["warmup"] == "0"]
    by_key = defaultdict(lambda: defaultdict(list))  # (hop,mode) -> rep -> [row]
    for r in rows:
        by_key[(r["hop"], r["mode"])][r["rep"]].append(r)

    summary, csv_rows = {}, []
    for (hop, mode), reps in sorted(by_key.items()):
        entry = {}
        for metric, col in [("ms", "ms"), ("bytes_out", "bytes_out"), ("bytes_in", "bytes_in")]:
            for pname, p in [("p50", 50), ("p95", 95), ("p99", 99)]:
                per_rep = [pctl([float(x[col]) for x in rws], p) for rws in reps.values()]
                entry[f"{metric}_{pname}"] = ci95(per_rep)
        summary.setdefault(hop, {})[mode] = entry
        csv_rows.append({
            "hop": hop, "mode": mode, "reps": len(reps),
            "samples_per_rep": len(next(iter(reps.values()))),
            **{k: v["mean"] for k, v in entry.items()},
            **{f"{k}_ci95": v["ci95"] for k, v in entry.items() if k.startswith("ms_")},
        })

    with open("results/probe_summary.csv", "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(csv_rows[0].keys()))
        w.writeheader()
        w.writerows(csv_rows)
    return summary


def aggregate_k6():
    by_scenario = defaultdict(dict)  # (mode,profile,rate,rtt) -> rep -> metrics
    for path in sorted(glob.glob("results/k6-*.json")):
        d = json.load(open(path))
        m = d["meta"]
        by_scenario[(m["mode"], m["profile"], m["rate"], m["rtt"])][m["rep"]] = d["metrics"]

    summary, csv_rows = {}, []
    metrics_wanted = {
        "http_req_tls_handshaking": "hs",
        "http_req_duration": "dur",
        "http_req_connecting": "conn",
    }
    for (mode, profile, rate, rtt), reps in sorted(by_scenario.items()):
        key = f"{profile}_r{rate}_rtt{rtt}"
        entry = {}
        for metric, short in metrics_wanted.items():
            for pname, k6name in [("p50", "med"), ("p95", "p(95)"), ("p99", "p(99)"), ("avg", "avg")]:
                per_rep = [reps[r][metric]["values"][k6name] for r in sorted(reps)]
                entry[f"{short}_{pname}_ms"] = ci95(per_rep)
        entry["reqs_per_s"] = ci95([reps[r]["http_reqs"]["values"]["rate"] for r in sorted(reps)])
        entry["failed_rate"] = ci95([reps[r]["http_req_failed"]["values"]["rate"] for r in sorted(reps)])
        summary.setdefault(key, {})[mode] = entry
        row = {"mode": mode, "profile": profile, "rate_rps": rate, "rtt_ms": rtt, "reps": len(reps)}
        row.update({k: v["mean"] for k, v in entry.items()})
        row.update({f"{k}_ci95": v["ci95"] for k, v in entry.items()})
        csv_rows.append(row)

    with open("results/k6_summary.csv", "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(csv_rows[0].keys()))
        w.writeheader()
        w.writerows(csv_rows)
    return summary


def main():
    out = {"probe": aggregate_probe(), "k6": aggregate_k6()}
    # headline numbers for the thesis: hybrid-vs-classic deltas
    deltas = {}
    for hop, modes in out["probe"].items():
        h, c = modes["hybrid"]["ms_p50"]["mean"], modes["classic"]["ms_p50"]["mean"]
        deltas[hop] = {"classic_p50_ms": c, "hybrid_p50_ms": h,
                       "delta_ms": round(h - c, 3),
                       "delta_pct": round(100 * (h - c) / c, 1) if c else None}
    out["headline_probe_p50_delta"] = deltas
    json.dump(out, open("results/summary.json", "w"), indent=1)
    print("aggregate: results/probe_summary.csv, results/k6_summary.csv, results/summary.json")


if __name__ == "__main__":
    main()
