#!/usr/bin/env python3
"""Handshake probe: full TLS 1.3 handshakes per hop with precise timing AND exact
bytes-on-the-wire (MemoryBIO pump — every handshake byte passes through us).

Group selection comes from OPENSSL_CONF (system_default Groups) set by probe.sh:
the client offers EXACTLY ONE group, so handshake success proves the negotiated
group. Timing covers TLS only (TCP connect + PG STARTTLS preamble excluded).

Usage: MODE=hybrid python3 probe.py <n> <rep>   # CSV rows to stdout, no header
"""
import os
import socket
import ssl
import struct
import sys
import time

MODE = os.environ["MODE"]  # hybrid | classic
N = int(sys.argv[1]) if len(sys.argv) > 1 else 100
REP = int(sys.argv[2]) if len(sys.argv) > 2 else 1
WARMUP = 10

HOPS = [
    ("H1-edge",  f"nginx-{MODE}",      443,  "tls"),
    ("H2a-py",   f"api-python-{MODE}", 8000, "tls"),
    ("H2b-node", f"api-node-{MODE}",   8000, "tls"),
    ("H3-pg",    "postgres",           5432, "starttls-pg"),
    ("H4-redis", "redis",              6379, "tls"),
]

CTX = ssl.create_default_context(cafile="/certs/server.crt")


def handshake(host: str, port: int, kind: str):
    with socket.create_connection((host, port), timeout=5) as s:
        s.setsockopt(socket.IPPROTO_TCP, socket.TCP_NODELAY, 1)
        if kind == "starttls-pg":
            s.sendall(struct.pack("!ii", 8, 80877103))  # PG SSLRequest
            if s.recv(1) != b"S":
                raise ConnectionError("postgres refused SSLRequest")
        inbio, outbio = ssl.MemoryBIO(), ssl.MemoryBIO()
        obj = CTX.wrap_bio(inbio, outbio, server_hostname=host)
        sent = recvd = 0
        t0 = time.perf_counter()
        while True:
            try:
                obj.do_handshake()
                data = outbio.read()  # flush client Finished before stopping the clock
                if data:
                    s.sendall(data)
                    sent += len(data)
                break
            except ssl.SSLWantReadError:
                data = outbio.read()
                if data:
                    s.sendall(data)
                    sent += len(data)
                chunk = s.recv(16384)
                if not chunk:
                    raise ConnectionError("eof during handshake")
                recvd += len(chunk)
                inbio.write(chunk)
        ms = (time.perf_counter() - t0) * 1000
        return round(ms, 3), sent, recvd


def main():
    for hop, host, port, kind in HOPS:
        for i in range(WARMUP + N):
            warm = 1 if i < WARMUP else 0
            try:
                ms, bo, bi = handshake(host, port, kind)
            except Exception as e:
                print(f"probe error {hop} {MODE} i={i}: {e}", file=sys.stderr)
                sys.exit(1)  # a failed handshake in an exclusive-group probe is a red flag, not a data point
            print(f"{hop},{MODE},{REP},{i},{warm},{ms},{bo},{bi}")


if __name__ == "__main__":
    main()
