/** Sensor layer — same contract as api-python/sensors.py: sensor(scope, invariants)(fn)
 * emits one JSON line per call + OTel span attrs. LOG_SENSORS=1 = automated breakpoint mode.
 * TODO(claude-code): implement wrapper + invariants mirroring Python exactly (same JSON keys). */
