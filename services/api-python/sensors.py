"""Sensor layer — the 'measurement instruments' of the control loop.
@sensor(scope="db", invariants=[...]) wraps an async function so every call emits:
  {"ts":...,"fn":...,"scope":...,"ok":...,"ms":...,"invariant_results":[{"name":..,"pass":..}]}
as ONE compact JSON line to stdout (same byte shape as the Node sensors) and attaches
the same fields as OTel span attributes. LOG_SENSORS=1 -> also dump args/result
summaries (automated breakpoint mode).

Invariants are cheap zero-arg callables over CACHED state (no network) declared in
tls_state.py — e.g. db TLS version recorded once at pool init.
Overhead: one time.perf_counter pair + json.dumps of a tiny dict (<0.05 ms).
"""
import contextvars
import functools
import json
import os
import time

try:
    from opentelemetry import trace as _otel_trace
except ImportError:  # sensors must work even without OTel installed
    _otel_trace = None

LOG_SENSORS = os.environ.get("LOG_SENSORS") == "1"

# Call-graph aggregation: which sensored fn called which (the "mesh view"
# without a mesh). Cardinality is bounded by the code's fixed function set;
# cost is one dict increment per call. Window: since process start.
_parent: contextvars.ContextVar = contextvars.ContextVar("sensor_parent", default=None)
NODES: dict = {}   # fn -> {scope, count, err, ms_sum}
EDGES: dict = {}   # (parent_fn, child_fn) -> count


def _record(fn_name: str, scope: str, ok: bool, ms: float, parent: str | None) -> None:
    n = NODES.setdefault(fn_name, {"scope": scope, "count": 0, "err": 0, "ms_sum": 0.0})
    n["count"] += 1
    n["ms_sum"] += ms
    if not ok:
        n["err"] += 1
    if parent is not None:
        EDGES[(parent, fn_name)] = EDGES.get((parent, fn_name), 0) + 1


def graph_snapshot() -> dict:
    return {
        "nodes": [
            {"fn": fn, "scope": n["scope"], "count": n["count"], "err": n["err"],
             "ms_avg": round(n["ms_sum"] / n["count"], 3) if n["count"] else 0.0}
            for fn, n in NODES.items()
        ],
        "edges": [
            {"from": p, "to": c, "count": count} for (p, c), count in EDGES.items()
        ],
    }


def _emit(line: dict, fn_name: str, args_repr: str, result_repr: str) -> None:
    print(json.dumps(line, separators=(",", ":"), default=str), flush=True)
    if LOG_SENSORS:
        print(f"[sensor:{fn_name}] args={args_repr} result={result_repr}", flush=True)
    if _otel_trace is not None:
        span = _otel_trace.get_current_span()
        if span.is_recording():
            span.set_attribute("sensor.scope", line["scope"])
            span.set_attribute("sensor.fn", line["fn"])
            span.set_attribute("sensor.ok", line["ok"])
            span.set_attribute("sensor.ms", line["ms"])
            span.set_attribute(
                "sensor.invariants_passed",
                all(r["pass"] for r in line["invariant_results"]),
            )


def sensor(scope: str, invariants=()):
    """Decorator for async functions crossing a boundary (TLS connect, DB query,
    cache op, handler). Invariants: zero-arg callables -> truthy = pass."""

    def deco(fn):
        @functools.wraps(fn)
        async def wrapper(*args, **kwargs):
            t0 = time.perf_counter()
            ok = True
            result = None
            parent = _parent.get()
            token = _parent.set(fn.__name__)
            try:
                result = await fn(*args, **kwargs)
                return result
            except Exception:
                ok = False
                raise
            finally:
                _parent.reset(token)
                ms = round((time.perf_counter() - t0) * 1000, 3)
                _record(fn.__name__, scope, ok, ms, parent)
                inv = []
                for iv in invariants:
                    try:
                        passed = bool(iv())
                    except Exception:
                        passed = False
                    inv.append({"name": getattr(iv, "__name__", str(iv)), "pass": passed})
                _emit(
                    {
                        "ts": round(time.time(), 3),
                        "fn": fn.__name__,
                        "scope": scope,
                        "ok": ok,
                        "ms": ms,
                        "invariant_results": inv,
                    },
                    fn.__name__,
                    repr(args)[:200] if LOG_SENSORS else "",
                    repr(result)[:200] if LOG_SENSORS else "",
                )

        return wrapper

    return deco
