"""api-python — medical-records API (FastAPI). TLS everywhere:
inbound uvicorn TLS (H2a), outbound asyncpg TLS (H3) and redis TLS (H4).
Key-exchange groups restricted process-wide via OPENSSL_CONF (see entrypoint.sh).
"""
import contextlib
import datetime
import json
import os
import ssl

import asyncpg
import redis.asyncio as aioredis
from fastapi import FastAPI, HTTPException, Request

from sensors import sensor
import tls_state
from tls_state import (
    MODE,
    STATE,
    cache_group_matches_mode,
    cache_tls13,
    db_group_matches_mode,
    db_tls13,
    mode_configured,
)

SERVICE = f"api-python-{MODE}"
POOL_SIZE = int(os.environ.get("POOL", "10"))
CACHE_TTL = 60

pool: asyncpg.Pool | None = None
cache: aioredis.Redis | None = None


def _ssl_ctx(server_hostname: str) -> ssl.SSLContext:
    ctx = ssl.create_default_context(cafile="/certs/server.crt")
    ctx.check_hostname = True
    return ctx


@contextlib.asynccontextmanager
async def lifespan(app: FastAPI):
    global pool, cache
    pool = await asyncpg.create_pool(
        host=os.environ["PGHOST"],
        user=os.environ["PGUSER"],
        password=os.environ["PGPASSWORD"],
        database=os.environ["PGDATABASE"],
        min_size=POOL_SIZE,
        max_size=POOL_SIZE,
        ssl=_ssl_ctx("postgres"),
        server_settings={"application_name": SERVICE},
    )
    row = await pool.fetchrow(
        "SELECT ssl, version FROM pg_stat_ssl WHERE pid = pg_backend_pid()"
    )
    STATE["db"] = {"connected": True, "ssl": row["ssl"], "version": row["version"]}

    cache = aioredis.Redis(
        host=os.environ["REDIS_HOST"],
        port=6379,
        ssl=True,
        ssl_ca_certs="/certs/server.crt",
        client_name=SERVICE,
        decode_responses=True,
    )
    await cache.ping()
    ver = None
    try:  # best-effort: read TLS version off a pooled socket (redis-py internals)
        conn = cache.connection_pool.get_available_connection()
        sock = getattr(conn, "_sock", None)
        if sock is not None and hasattr(sock, "version"):
            ver = sock.version()
        await cache.connection_pool.release(conn)
    except Exception:
        pass
    STATE["cache"] = {"connected": True, "version": ver}
    print(f"[startup] {SERVICE} db={STATE['db']} cache={STATE['cache']}", flush=True)
    yield
    await pool.close()
    await cache.aclose()


app = FastAPI(title=SERVICE, lifespan=lifespan)


def _rec_to_dict(row) -> dict:
    return {
        "id": row["id"],
        "patient_name": row["patient_name"],
        "dob": row["dob"].isoformat(),
        "diagnosis": row["diagnosis"],
        "notes": row["notes"],
        "created_at": row["created_at"].isoformat(),
    }


@sensor(scope="db", invariants=[db_tls13, db_group_matches_mode])
async def db_read(record_id: int):
    return await pool.fetchrow("SELECT * FROM records WHERE id = $1", record_id)


@sensor(scope="db", invariants=[db_tls13, db_group_matches_mode])
async def db_write(patient_name: str, dob: str, diagnosis: str, notes: str):
    return await pool.fetchrow(
        "INSERT INTO records (patient_name, dob, diagnosis, notes)"
        " VALUES ($1, $2, $3, $4) RETURNING *",
        patient_name, datetime.date.fromisoformat(dob), diagnosis, notes,
    )


@sensor(scope="cache", invariants=[cache_tls13, cache_group_matches_mode])
async def cache_get(key: str):
    return await cache.get(key)


@sensor(scope="cache", invariants=[cache_tls13, cache_group_matches_mode])
async def cache_set(key: str, value: str):
    await cache.set(key, value, ex=CACHE_TTL)


def _meta(request: Request, cache_status: str | None = None) -> dict:
    m = {
        "served_by": "python",
        "mode": MODE,
        "tls_group_edge": request.headers.get("x-tls-group"),
    }
    if cache_status is not None:
        m["cache"] = cache_status
    return m


@app.get("/health")
@sensor(scope="handler", invariants=[mode_configured])
async def health(request: Request):
    # no data touch — isolates pure TLS cost
    return {"status": "ok", "api": "python", "mode": MODE}


@sensor(scope="db", invariants=[db_tls13, db_group_matches_mode])
async def db_list(limit: int):
    return await pool.fetch("SELECT * FROM records ORDER BY id LIMIT $1", limit)


@app.get("/records")
@sensor(scope="handler", invariants=[mode_configured])
async def list_records(request: Request, limit: int = 100):
    rows = await db_list(min(limit, 200))
    return {"records": [_rec_to_dict(r) for r in rows], "meta": _meta(request)}


@app.get("/records/{record_id}")
@sensor(scope="handler", invariants=[mode_configured])
async def get_record(record_id: int, request: Request):
    key = f"rec:{record_id}"
    cached = await cache_get(key)
    if cached is not None:
        return {"record": json.loads(cached), "meta": _meta(request, "hit")}
    row = await db_read(record_id)
    if row is None:
        raise HTTPException(status_code=404, detail="record not found")
    rec = _rec_to_dict(row)
    await cache_set(key, json.dumps(rec, separators=(",", ":")))
    return {"record": rec, "meta": _meta(request, "miss")}


@app.post("/records", status_code=201)
@sensor(scope="handler", invariants=[mode_configured])
async def create_record(request: Request):
    body = await request.json()
    for field in ("patient_name", "dob", "diagnosis"):
        if not body.get(field):
            raise HTTPException(status_code=422, detail=f"missing field: {field}")
    row = await db_write(
        body["patient_name"], body["dob"], body["diagnosis"], body.get("notes", "")
    )
    return {"record": _rec_to_dict(row), "meta": _meta(request)}


@app.get("/api/tls-info")
@sensor(scope="handler", invariants=[mode_configured])
async def tls_info(request: Request):
    return {
        "api": "python",
        "mode": MODE,
        "edge_group": request.headers.get("x-tls-group"),
        "client_groups_offered": os.environ.get("OPENSSL_GROUPS"),
        "db": STATE["db"],
        "cache": STATE["cache"],
    }
