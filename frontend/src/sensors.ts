/** Frontend sensors — same contract as the backend sensors.py / sensors.ts:
 * one JSON line per boundary crossing, {ts, fn, scope, ok, ms, invariant_results[]}.
 * Sink is the BROWSER CONSOLE: gate_frontend reads it back through Playwright,
 * closing the same control loop the backend gates use on docker logs.
 * LOG_SENSORS equivalent: localStorage.LOG_SENSORS === "1" adds a verbose line. */

export type InvariantResult = { name: string; pass: boolean };
export type Invariant = { name: string; check: (result: unknown) => boolean };

export type SensorEvent = {
  ts: number;
  fn: string;
  scope: string;
  ok: boolean;
  ms: number;
  invariant_results: InvariantResult[];
};

const listeners = new Set<(e: SensorEvent) => void>();

/** Subscribe to sensor events (the telemetry strip uses this). */
export function onSensor(cb: (e: SensorEvent) => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function emit(fn: string, scope: string, ok: boolean, ms: number, invariant_results: InvariantResult[]) {
  const line: SensorEvent = {
    ts: Math.round(Date.now()) / 1000,
    fn,
    scope,
    ok,
    ms: Math.round(ms * 1000) / 1000,
    invariant_results,
  };
  console.log(JSON.stringify(line));
  if (localStorage.getItem('LOG_SENSORS') === '1') console.log(`[sensor:${fn}]`, line);
  listeners.forEach((cb) => cb(line));
}

/** Wrap an async boundary-crossing function; mirrors the backend decorator.
 * Invariants run on the RESULT (frontend has no cached TLS state of its own —
 * what it can assert is what the response carries). A throwing invariant
 * counts as pass:false, emission happens in finally, errors re-throw. */
export function sense<A extends unknown[], R>(
  scope: string,
  invariants: Invariant[],
  fn: (...args: A) => Promise<R>,
): (...args: A) => Promise<R> {
  return async (...args: A): Promise<R> => {
    const t0 = performance.now();
    let ok = true;
    let result: R | undefined;
    try {
      result = await fn(...args);
      return result;
    } catch (e) {
      ok = false;
      throw e;
    } finally {
      const inv = invariants.map((iv) => {
        try {
          return { name: iv.name, pass: ok && iv.check(result) };
        } catch {
          return { name: iv.name, pass: false };
        }
      });
      emit(fn.name || 'anonymous', scope, ok, performance.now() - t0, inv);
    }
  };
}
