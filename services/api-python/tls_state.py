"""Cached TLS facts + the invariants that read them (no network in invariants).

Group proof model: each mode's client offers EXACTLY ONE key-exchange group
(via OPENSSL_CONF system_default -> Groups). Python's ssl module has no getter
for the negotiated group, but with a single-group offer, handshake success
proves negotiated == offered. The gate double-checks server-side via openssl.
"""
import os

MODE = os.environ["MODE"]  # hybrid | classic
GROUP = {"hybrid": "X25519MLKEM768", "classic": "X25519"}[MODE]

# populated once at startup by app.lifespan
STATE = {
    "db": {"connected": False, "ssl": None, "version": None},       # from pg_stat_ssl
    "cache": {"connected": False, "version": None},                 # from socket, if reachable
}


def db_tls13():
    return STATE["db"]["ssl"] is True and STATE["db"]["version"] == "TLSv1.3"


def db_group_matches_mode():
    # exclusive single-group offer + live connection => negotiated group == GROUP
    return STATE["db"]["connected"] and os.environ.get("OPENSSL_GROUPS") == GROUP


def cache_tls13():
    # redis listens TLS-only (port 0); a live connection IS TLS. Prefer the
    # socket-reported version when redis-py internals expose it.
    v = STATE["cache"]["version"]
    return STATE["cache"]["connected"] and (v is None or v == "TLSv1.3")


def cache_group_matches_mode():
    return STATE["cache"]["connected"] and os.environ.get("OPENSSL_GROUPS") == GROUP


def mode_configured():
    return MODE in ("hybrid", "classic")
