/** Sơ đồ chức năng — the function-level "mesh view", drawn from real sensors:
 * browser fns (frontend sensor aggregate) → API handlers → db/cache fns
 * (observed parent→child edges from /api/sensors/graph) → data stores.
 * Layout is a fixed 4-column DAG in hand-rolled SVG — the node set is small
 * and bounded by the code, no graph library needed (offline rule). */
import { useEffect, useRef, useState } from 'react';
import { getTlsInfo, sensorsGraph, type GraphResult, type TlsInfo } from '../api';
import { clientNodes, type GNode } from '../graphStore';

const NODE_W = 200;
const NODE_H = 42;
const GAP_Y = 14;
const COL_X = [16, 286, 556, 826];
const TOP = 46;
const POLL_MS = 3000;

type LNode = GNode & { id: string; col: number; y: number };
type LEdge = { id: string; from: string; to: string; count: number };

function layout(client: GNode[], server: GraphResult | null, tls: TlsInfo | null) {
  const nodes: LNode[] = [];
  const cols: LNode[][] = [[], [], [], []];
  const push = (col: number, id: string, g: GNode) => {
    const n = { ...g, id, col, y: 0 };
    cols[col].push(n);
    nodes.push(n);
  };
  const byName = (a: GNode, b: GNode) => a.fn.localeCompare(b.fn); // stable across polls

  [...client].sort(byName).forEach((g) => push(0, `c:${g.fn}`, g));
  const sNodes = [...(server?.nodes ?? [])].sort(byName);
  sNodes.filter((g) => g.scope === 'handler').forEach((g) => push(1, `b:${g.fn}`, g));
  sNodes.filter((g) => g.scope === 'db' || g.scope === 'cache').forEach((g) => push(2, `b:${g.fn}`, g));
  const group = tls?.mode === 'hybrid' ? 'X25519MLKEM768' : 'X25519';
  push(3, 's:pg', { fn: 'PostgreSQL · TLS 1.3', scope: group, count: 0, err: 0, ms_avg: 0 });
  push(3, 's:redis', { fn: 'Redis · TLS 1.3', scope: group, count: 0, err: 0, ms_avg: 0 });

  cols.forEach((c) => c.forEach((n, i) => { n.y = TOP + i * (NODE_H + GAP_Y); }));

  const ids = new Set(nodes.map((n) => n.id));
  const edges: LEdge[] = [];
  // browser → handler: frontend api fns are deliberately named like the handlers
  client.filter((g) => g.scope === 'api' && ids.has(`b:${g.fn}`)).forEach((g) =>
    edges.push({ id: `c:${g.fn}>b:${g.fn}`, from: `c:${g.fn}`, to: `b:${g.fn}`, count: g.count }));
  // observed server-side edges
  (server?.edges ?? []).forEach((e) => {
    if (ids.has(`b:${e.from}`) && ids.has(`b:${e.to}`)) {
      edges.push({ id: `b:${e.from}>b:${e.to}`, from: `b:${e.from}`, to: `b:${e.to}`, count: e.count });
    }
  });
  // data fns → stores (static by scope)
  sNodes.filter((g) => g.scope === 'db').forEach((g) =>
    edges.push({ id: `b:${g.fn}>s:pg`, from: `b:${g.fn}`, to: 's:pg', count: g.count }));
  sNodes.filter((g) => g.scope === 'cache').forEach((g) =>
    edges.push({ id: `b:${g.fn}>s:redis`, from: `b:${g.fn}`, to: 's:redis', count: g.count }));

  const height = TOP + Math.max(...cols.map((c) => c.length), 1) * (NODE_H + GAP_Y) + 16;
  return { nodes, edges, height };
}

export default function FunctionMap() {
  const [server, setServer] = useState<GraphResult | null>(null);
  const [tls, setTls] = useState<TlsInfo | null>(null);
  const [, setTick] = useState(0);
  const prev = useRef<Map<string, number>>(new Map());
  const active = useRef<Set<string>>(new Set());

  useEffect(() => {
    getTlsInfo().then(setTls).catch(() => setTls(null));
    let stop = false;
    const poll = () =>
      sensorsGraph()
        .then((g) => { if (!stop) setServer(g); })
        .catch(() => {});
    poll();
    const t = setInterval(() => { poll(); setTick((n) => n + 1); }, POLL_MS);
    return () => { stop = true; clearInterval(t); };
  }, []);

  const { nodes, edges, height } = layout(clientNodes(), server, tls);

  // an edge whose count grew since the last poll pulses in the mode color
  const nowActive = new Set<string>();
  edges.forEach((e) => {
    const before = prev.current.get(e.id);
    if (before !== undefined && e.count > before) nowActive.add(e.id);
    prev.current.set(e.id, e.count);
  });
  if (nowActive.size) active.current = nowActive;

  const pos = new Map(nodes.map((n) => [n.id, n]));
  const path = (e: LEdge) => {
    const a = pos.get(e.from)!;
    const b = pos.get(e.to)!;
    const x1 = COL_X[a.col] + NODE_W;
    const y1 = a.y + NODE_H / 2;
    const x2 = COL_X[b.col];
    const y2 = b.y + NODE_H / 2;
    const mx = (x1 + x2) / 2;
    return `M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`;
  };

  return (
    <div className="panel">
      <div className="row" style={{ marginBottom: 4 }}>
        <h2 style={{ margin: 0 }} className="grow">Sơ đồ chức năng — quan sát trực tiếp từ sensor</h2>
        <span className="chip">cửa sổ: từ khi khởi động · làm mới 3s</span>
      </div>
      <p style={{ color: 'var(--muted)', fontSize: 12.5, margin: '0 0 12px' }}>
        Mỗi nút là một hàm có sensor; mỗi cạnh là quan hệ gọi cha→con THẬT đã quan sát
        (không khai báo tay). Đây là góc nhìn "service mesh" — nhưng vẽ từ sensor của chính
        ứng dụng, không cần mesh, nên biến số TLS của thí nghiệm không bị che.
      </p>
      <div style={{ overflowX: 'auto' }}>
        <svg data-testid="fn-graph" width={COL_X[3] + NODE_W + 16} height={height}
          role="img" aria-label="Sơ đồ gọi hàm">
          {['Trình duyệt', `API (${server?.api ?? '…'})`, 'Dữ liệu', 'Kho lưu trữ'].map((t, i) => (
            <text key={t} x={COL_X[i]} y={20} fill="var(--muted)" fontSize="11"
              style={{ textTransform: 'uppercase', letterSpacing: '0.08em' }}>{t}</text>
          ))}
          {edges.map((e) => (
            <path key={e.id} d={path(e)} fill="none" className="edge"
              stroke={active.current.has(e.id) ? 'var(--mode)' : 'var(--line-strong)'}
              strokeWidth={1 + Math.min(3, Math.log10(e.count + 1) * 1.4)}
              strokeDasharray={active.current.has(e.id) ? '6 4' : undefined}>
              {active.current.has(e.id) && (
                <animate attributeName="stroke-dashoffset" from="20" to="0" dur="0.8s" repeatCount="2" />
              )}
            </path>
          ))}
          {nodes.map((n) => (
            <g key={n.id} data-node={n.id} className="fn-node">
              <rect x={COL_X[n.col]} y={n.y} width={NODE_W} height={NODE_H} rx="2"
                fill="var(--panel2)"
                stroke={n.err > 0 ? 'var(--hybrid)' : n.col === 3 ? 'var(--mode)' : 'var(--line-strong)'}
                strokeDasharray={n.col === 3 ? '4 3' : undefined} />
              <text x={COL_X[n.col] + 10} y={n.y + 17} fill="var(--text)" fontSize="12"
                fontFamily="var(--font-mono)">{n.fn}</text>
              <text x={COL_X[n.col] + 10} y={n.y + 33} fill="var(--muted)" fontSize="10.5"
                fontFamily="var(--font-mono)">
                {n.col === 3 ? n.scope : `${n.scope} · ${n.count}× · ${n.ms_avg}ms${n.err ? ` · ⚠${n.err}` : ''}`}
              </text>
            </g>
          ))}
        </svg>
      </div>
      <p style={{ color: 'var(--muted)', fontSize: 11.5, margin: '10px 0 0' }}>
        Ghi chú: chính trang này cũng xuất hiện trong sơ đồ (sensors_graph) — hệ thống
        quan sát được cả người quan sát. Bộ đếm đặt lại khi container khởi động lại.
      </p>
    </div>
  );
}
