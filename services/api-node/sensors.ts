/** Sensor layer — same contract as api-python/sensors.py:
 *   sensor(scope, invariants)(fn) wraps an async fn; every call emits ONE compact
 *   JSON line {ts,fn,scope,ok,ms,invariant_results:[{name,pass}]} to stdout and
 *   attaches the same fields as OTel span attributes.
 * LOG_SENSORS=1 = automated breakpoint mode (args/result summaries).
 * Invariants: zero-arg () => boolean over CACHED state (no network). */
import { trace } from '@opentelemetry/api';

const LOG_SENSORS = process.env.LOG_SENSORS === '1';

type Invariant = (() => boolean) & { invName?: string };

export function sensor(scope: string, invariants: Invariant[] = []) {
  return function <T extends (...a: any[]) => Promise<any>>(fn: T): T {
    const wrapped = async function (...args: any[]) {
      const t0 = process.hrtime.bigint();
      let ok = true;
      let result: any = null;
      try {
        result = await fn(...args);
        return result;
      } catch (e) {
        ok = false;
        throw e;
      } finally {
        const ms = Math.round(Number(process.hrtime.bigint() - t0) / 1e3) / 1e3;
        const invariant_results = invariants.map((iv) => {
          let pass = false;
          try { pass = !!iv(); } catch { pass = false; }
          return { name: iv.invName ?? iv.name, pass };
        });
        const line = { ts: Math.round(Date.now()) / 1000, fn: fn.name, scope, ok, ms, invariant_results };
        console.log(JSON.stringify(line));
        if (LOG_SENSORS) {
          console.log(`[sensor:${fn.name}] args=${JSON.stringify(args).slice(0, 200)} result=${JSON.stringify(result)?.slice(0, 200)}`);
        }
        const span = trace.getActiveSpan();
        if (span?.isRecording()) {
          span.setAttribute('sensor.scope', scope);
          span.setAttribute('sensor.fn', fn.name);
          span.setAttribute('sensor.ok', ok);
          span.setAttribute('sensor.ms', ms);
          span.setAttribute('sensor.invariants_passed', invariant_results.every((r) => r.pass));
        }
      }
    };
    return wrapped as T;
  };
}
