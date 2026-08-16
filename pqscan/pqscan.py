#!/usr/bin/env python3
"""pqscan — polite post-quantum readiness scanner for TLS 1.3 endpoints.

For each host: ONE TLS handshake offering hybrid groups (X25519MLKEM768) with a
classical fallback, record the negotiated group, emit a verdict. No HTTP request
is ever sent. 5s timeout, no retries. Requires an openssl binary with ML-KEM
support (OpenSSL >= 3.5) — pass it via --openssl or OPENSSL_BIN.

Usage:
  pqscan.py hosts.txt -o results/scan.json [--html results/scan.html] [--openssl /opt/ossl35/bin/openssl]
"""

# ---------------------------------------------------------------------------
# FIELD NOTE (verified 15 Aug 2026 from a Linux box, OpenSSL 3.5.4):
# A hand-built/static openssl s_client may list X25519MLKEM768 yet still
# negotiate classical X25519 with every server (and fail when the hybrid group
# is forced alone) because it does not emit the ML-KEM key_share in ClientHello.
# That yields a false 0% PQC rate. Run this scanner with a FULL OpenSSL 3.5
# client (Homebrew `openssl@3.5`, or from inside the testbed containers) — then
# CDNs like Cloudflare/Google negotiate X25519MLKEM768 as expected. Sanity check
# your client first:  openssl s_client -connect pq.cloudflareresearch.com:443 \
#   -groups X25519MLKEM768 -brief   # must show  Peer Temp Key: X25519MLKEM768
# ---------------------------------------------------------------------------
import argparse, json, subprocess, sys, os, re, datetime, html

# OpenSSL 3.5 -brief prints the negotiated group in TWO formats: hybrid/KEM groups as
# "Negotiated TLS1.3 group: X25519MLKEM768", classical curves as "Peer Temp Key: X25519".
# Matching only Temp Key silently miscounts every PQC-ready host as an error (a false 0%).
GROUP_RE = re.compile(r"(?:Negotiated TLS1\.3 group|(?:Peer|Server) Temp Key):\s*([A-Za-z0-9_]+)", re.I)
PROTO_RE = re.compile(r"Protocol version:\s*(TLSv[0-9.]+)")

def scan_host(host, openssl_bin, timeout=5):
    cmd = [openssl_bin, "s_client", "-connect", f"{host}:443", "-servername", host,
           "-groups", "X25519MLKEM768:X25519", "-brief"]
    try:
        r = subprocess.run(cmd, input=b"", capture_output=True, timeout=timeout + 3)
        out = (r.stdout + r.stderr).decode(errors="replace")
        m = GROUP_RE.search(out)
        pm = PROTO_RE.search(out)
        group = m.group(1) if m else None
        proto = pm.group(1) if pm else None
        connected = "CONNECTION ESTABLISHED" in out or proto is not None
        if group is None:
            # Connected on TLS<=1.2 with NO Temp Key line = static-RSA key exchange
            # (e.g. ciphersuite AES128-GCM-SHA256): no ephemeral group exists to parse.
            # No forward secrecy — the WORST harvest-now-decrypt-later exposure.
            if connected and proto and proto != "TLSv1.3":
                return {"host": host, "status": "ok", "protocol": proto,
                        "negotiated_group": "RSA-static", "supports_pqc": False,
                        "note": f"{proto}, trao đổi khóa RSA TĨNH — không có forward secrecy: "
                                "một khóa riêng bị lộ (hoặc bị máy tính lượng tử phá) giải mã "
                                "TOÀN BỘ lưu lượng đã ghi lại từ trước tới nay."}
            # Otherwise: distinguish "server unreachable/refused" from "TLS 1.3 worked but
            # WE failed to parse" — the latter is a scanner regression (false-0% class).
            status = "parse-error" if connected else "error"
            note = ("TLS connected but no group parsed — GROUP_RE regression? raw tail: "
                    + out.strip().splitlines()[-1][:100]) if connected else \
                   (out.strip().splitlines()[-1][:160] if out.strip() else "no response")
            return {"host": host, "status": status, "protocol": proto,
                    "negotiated_group": None, "supports_pqc": None, "note": note}
        pqc = "MLKEM" in group.upper()
        if pqc:
            note = "Đã hỗ trợ trao đổi khóa hậu lượng tử — lưu lượng hôm nay an toàn trước tấn công thu thập-giải mã sau."
        elif group.upper() == "DH" and proto != "TLSv1.3":
            note = (f"{proto} cũ, rơi về DHE trường hữu hạn (máy chủ không nhận X25519 trong "
                    "danh sách nhóm hiện đại của scanner; bình thường nó dùng ECDHE P-256). "
                    "Dù cách nào cũng CHƯA có PQC — dễ tổn thương HNDL.")
        else:
            note = "CHƯA hỗ trợ PQC: kết nối tới máy chủ này hôm nay có thể bị ghi lại và giải mã trong tương lai bởi máy tính lượng tử (HNDL)."
        return {"host": host, "status": "ok", "protocol": proto,
                "negotiated_group": group, "supports_pqc": pqc, "note": note}
    except subprocess.TimeoutExpired:
        return {"host": host, "status": "error", "negotiated_group": None, "supports_pqc": None, "note": "timeout"}
    except Exception as e:
        return {"host": host, "status": "error", "negotiated_group": None, "supports_pqc": None, "note": str(e)[:160]}

def render_html(results, meta):
    ok = [r for r in results if r["status"] == "ok"]
    pqc = [r for r in ok if r["supports_pqc"]]
    n, n_ok, n_pqc = len(results), len(ok), len(pqc)
    pct = (100.0 * n_pqc / n_ok) if n_ok else 0.0
    rows = []
    for r in sorted(results, key=lambda x: (x["status"] != "ok", not (x["supports_pqc"] or False), x["host"])):
        if r["status"] != "ok":
            badge = '<span class="b err">lỗi</span>'; grp = "—"
        elif r["supports_pqc"]:
            badge = '<span class="b yes">PQC ✓</span>'; grp = r["negotiated_group"]
        else:
            badge = '<span class="b no">cổ điển</span>'; grp = r["negotiated_group"] or "?"
        rows.append(f'<tr><td>{html.escape(r["host"])}</td><td>{badge}</td>'
                    f'<td><code>{html.escape(str(grp))}</code></td><td class="note">{html.escape(r["note"] or "")}</td></tr>')
    return f"""<!DOCTYPE html><html lang="vi"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>pqscan — mức độ sẵn sàng hậu lượng tử</title>
<style>
 body{{font-family:system-ui,-apple-system,sans-serif;background:#f9f9f7;color:#141b34;margin:0;padding:32px 20px}}
 .wrap{{max-width:960px;margin:0 auto}} h1{{font-size:22px;margin:0 0 4px}} .sub{{color:#4a5171;font-size:13px;margin-bottom:22px}}
 .tiles{{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;margin-bottom:24px}}
 .tile{{background:#fff;border:1px solid rgba(11,11,11,.1);border-radius:12px;padding:16px}}
 .tile .v{{font-size:34px;font-weight:700}} .tile .k{{font-size:12px;color:#4a5171;margin-top:2px}}
 table{{width:100%;border-collapse:collapse;background:#fff;border:1px solid rgba(11,11,11,.1);border-radius:12px;overflow:hidden;font-size:13.5px}}
 th{{text-align:left;padding:10px 12px;background:#eef1fb;font-size:12px}} td{{padding:9px 12px;border-top:1px solid #eee}}
 .b{{font-size:11px;font-weight:700;padding:3px 10px;border-radius:20px}}
 .yes{{background:#e3f4e3;color:#0a6b0a}} .no{{background:#fdeaea;color:#a02020}} .err{{background:#eee;color:#666}}
 .note{{color:#4a5171;font-size:12px;max-width:420px}} code{{font-size:12px}}
</style></head><body><div class="wrap">
<h1>pqscan — khảo sát mức độ sẵn sàng hậu lượng tử</h1>
<div class="sub">Quét {n} máy chủ · {meta['when']} · phương pháp: 1 bắt tay TLS 1.3/máy chủ, chào X25519MLKEM768:X25519, không gửi HTTP request · openssl {meta['openssl']}</div>
<div class="tiles">
 <div class="tile"><div class="v" style="color:#0a6b0a">{pct:.0f}%</div><div class="k">máy chủ trả lời đã hỗ trợ PQC</div></div>
 <div class="tile"><div class="v">{n_pqc}/{n_ok}</div><div class="k">hỗ trợ / trả lời hợp lệ</div></div>
 <div class="tile"><div class="v" style="color:#a02020">{n_ok - n_pqc}</div><div class="k">chỉ cổ điển — phơi nhiễm HNDL</div></div>
 <div class="tile"><div class="v" style="color:#666">{n - n_ok}</div><div class="k">lỗi / không kết nối được</div></div>
</div>
<table><thead><tr><th>Máy chủ</th><th>Verdict</th><th>Nhóm thương lượng</th><th>Ghi chú phơi nhiễm</th></tr></thead>
<tbody>{''.join(rows)}</tbody></table>
<p class="sub" style="margin-top:14px">Khóa luận tốt nghiệp — Nguyễn Minh Hùng, ĐH Nguyễn Tất Thành, 2026. Dữ liệu thô: scan.json.</p>
</div></body></html>"""

CANARY = "pq.cloudflareresearch.com"  # known PQC-only-friendly endpoint


def selfcheck(openssl_bin):
    """Refuse to scan with a client that can't prove hybrid capability (FIELD NOTE,
    automated). One handshake offering ONLY the hybrid group: success requires the
    client to emit an ML-KEM key_share AND our regex to parse the result."""
    cmd = [openssl_bin, "s_client", "-connect", f"{CANARY}:443", "-servername", CANARY,
           "-groups", "X25519MLKEM768", "-brief"]
    try:
        r = subprocess.run(cmd, input=b"", capture_output=True, timeout=10)
    except subprocess.TimeoutExpired:
        sys.exit(f"SELF-CHECK INCONCLUSIVE: {CANARY} unreachable (offline?). "
                 f"Refusing to scan blind — a broken client yields a false 0%.")
    out = (r.stdout + r.stderr).decode(errors="replace")
    m = GROUP_RE.search(out)
    if not m or "MLKEM" not in m.group(1).upper():
        sys.exit("SELF-CHECK FAILED: client did not negotiate X25519MLKEM768 with "
                 f"{CANARY} (got: {m.group(1) if m else 'no group parsed'}). Either this "
                 "openssl cannot emit ML-KEM key_shares (need full OpenSSL >= 3.5) or "
                 "GROUP_RE no longer matches its output. Refusing to produce a false 0%.")
    print(f"self-check OK: {m.group(1)} negotiated with {CANARY}", flush=True)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("hostsfile"); ap.add_argument("-o", "--out", default="scan.json")
    ap.add_argument("--html"); ap.add_argument("--openssl", default=os.environ.get("OPENSSL_BIN", "openssl"))
    a = ap.parse_args()
    selfcheck(a.openssl)
    hosts = [l.strip() for l in open(a.hostsfile) if l.strip() and not l.startswith("#")]
    results = []
    for i, h in enumerate(hosts, 1):
        r = scan_host(h, a.openssl)
        results.append(r)
        tick = "✓PQC" if r.get("supports_pqc") else ("classical" if r["status"] == "ok" else "err")
        print(f"[{i}/{len(hosts)}] {h}: {r.get('negotiated_group') or r['note'][:40]} ({tick})", flush=True)
    ver = subprocess.run([a.openssl, "version"], capture_output=True).stdout.decode().strip()
    meta = {"when": datetime.datetime.now().strftime("%Y-%m-%d %H:%M"), "openssl": ver,
            "method": "one TLS1.3 handshake per host offering X25519MLKEM768:X25519, no HTTP, 5s timeout, no retries"}
    os.makedirs(os.path.dirname(a.out) or ".", exist_ok=True)
    json.dump({"meta": meta, "results": results}, open(a.out, "w"), indent=1, ensure_ascii=False)
    ok = [r for r in results if r["status"] == "ok"]; pqc = [r for r in ok if r["supports_pqc"]]
    parse_errs = [r for r in results if r["status"] == "parse-error"]
    print(f"\nSummary: {len(pqc)}/{len(ok)} responding hosts negotiate PQC "
          f"({100*len(pqc)/max(1,len(ok)):.0f}%); {len(results)-len(ok)} errors. -> {a.out}")
    if a.html:
        open(a.html, "w").write(render_html(results, meta)); print(f"HTML report -> {a.html}")
    if parse_errs:
        print(f"\nWARNING: {len(parse_errs)} PARSE-ERRORS — TLS connected but no group parsed."
              f" This is a scanner regression (false-0% class), NOT host data. First: "
              f"{parse_errs[0]['host']}: {parse_errs[0]['note']}", file=sys.stderr)
        sys.exit(3)

if __name__ == "__main__":
    main()
