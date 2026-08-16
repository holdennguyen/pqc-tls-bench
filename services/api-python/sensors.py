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
import functools
import json
import os
import time

try:
    from opentelemetry import trace as _otel_trace
except ImportError:  # sensors must work even without OTel installed
    _otel_trace = None

LOG_SENSORS = os.environ.get("LOG_SENSORS") == "1"


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
            try:
                result = await fn(*args, **kwargs)
                return result
            except Exception:
                ok = False
                raise
            finally:
                ms = round((time.perf_counter() - t0) * 1000, 3)
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
