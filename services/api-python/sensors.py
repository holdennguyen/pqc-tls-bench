"""Sensor layer — the 'measurement instruments' of the control loop.
@sensor(scope="db", invariants=[ssl_is_tls13]) wraps a function so every call emits:
  {"ts":..., "fn":..., "scope":..., "ok":..., "ms":..., "invariants":[{"name":..,"pass":..}]}
to stdout (one JSON line) and attaches the same as OTel span attributes.
LOG_SENSORS=1 -> also dump args/result summaries (automated breakpoint mode).
TODO(claude-code): implement decorator + invariants: ssl_is_tls13(conn), group_matches_mode(conn),
cache_hit_recorded(result). Keep total overhead < 0.1 ms/call; no network in invariants (use cached state).
"""
