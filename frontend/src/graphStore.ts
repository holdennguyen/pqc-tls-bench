/** Browser-side half of the function-call graph: aggregates the frontend's own
 * sensor events (scopes api/route/auth) the same way the backend sensors do,
 * so the map page can draw client fns next to the server graph. */
import { onSensor } from './sensors';

export type GNode = { fn: string; scope: string; count: number; err: number; ms_avg: number };

const nodes = new Map<string, { scope: string; count: number; err: number; ms_sum: number }>();

onSensor((e) => {
  let n = nodes.get(e.fn);
  if (!n) {
    n = { scope: e.scope, count: 0, err: 0, ms_sum: 0 };
    nodes.set(e.fn, n);
  }
  n.count += 1;
  n.ms_sum += e.ms;
  if (!e.ok) n.err += 1;
});

export function clientNodes(): GNode[] {
  return [...nodes.entries()].map(([fn, n]) => ({
    fn,
    scope: n.scope,
    count: n.count,
    err: n.err,
    ms_avg: n.count ? Math.round((n.ms_sum / n.count) * 1000) / 1000 : 0,
  }));
}
