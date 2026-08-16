/** API client — every backend call crosses here and is sensor-wrapped (scope "api").
 * The serving API (python|node) is a user choice persisted in localStorage;
 * nginx routes /py/* and /node/* to the respective service. */
import { sense, type Invariant } from './sensors';

export type Meta = {
  served_by: 'python' | 'node';
  mode: 'hybrid' | 'classic';
  tls_group_edge: string | null;
  cache?: 'hit' | 'miss';
  total?: number;
};

export type Rec = {
  id: number;
  patient_name: string;
  dob: string;
  diagnosis: string;
  notes: string;
  created_at: string;
};

export type TlsInfo = {
  api: string;
  mode: 'hybrid' | 'classic';
  edge_group: string | null;
  client_groups_offered: string | null;
  db: Record<string, unknown>;
  cache: Record<string, unknown>;
};

export class ApiError extends Error {
  status: number;
  constructor(status: number, detail: string) {
    super(detail);
    this.status = status;
  }
}

export function apiChoice(): 'py' | 'node' {
  return localStorage.getItem('api') === 'node' ? 'node' : 'py';
}
export function setApiChoice(v: 'py' | 'node') {
  localStorage.setItem('api', v);
}

// Invariants over the response — the frontend's cheap assertions about what
// every payload must carry (the backend meta contract).
const meta_present: Invariant = {
  name: 'meta_present',
  check: (r) => !!(r as { meta?: Meta })?.meta?.served_by,
};
const edge_group_seen: Invariant = {
  name: 'edge_group_seen',
  check: (r) => (r as { meta?: Meta })?.meta?.tls_group_edge != null,
};

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    headers: { 'content-type': 'application/json' },
    ...init,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, (body as { detail?: string }).detail ?? `HTTP ${res.status}`);
  return body as T;
}

export type ListResult = { records: Rec[]; meta: Meta };
export type OneResult = { record: Rec; meta: Meta };

export const listRecords = sense('api', [meta_present, edge_group_seen], async function list_records(
  opts: { search?: string; limit?: number; offset?: number } = {},
): Promise<ListResult> {
  const q = new URLSearchParams();
  if (opts.search) q.set('search', opts.search);
  if (opts.limit != null) q.set('limit', String(opts.limit));
  if (opts.offset != null) q.set('offset', String(opts.offset));
  const qs = q.toString();
  return request(`/${apiChoice()}/records${qs ? `?${qs}` : ''}`);
});

export const getRecord = sense('api', [meta_present, edge_group_seen], async function get_record(
  id: number,
): Promise<OneResult> {
  return request(`/${apiChoice()}/records/${id}`);
});

export const createRecord = sense('api', [meta_present, edge_group_seen], async function create_record(
  data: Omit<Rec, 'id' | 'created_at'>,
): Promise<OneResult> {
  return request(`/${apiChoice()}/records`, { method: 'POST', body: JSON.stringify(data) });
});

export const updateRecord = sense('api', [meta_present, edge_group_seen], async function update_record(
  id: number,
  data: Omit<Rec, 'id' | 'created_at'>,
): Promise<OneResult> {
  return request(`/${apiChoice()}/records/${id}`, { method: 'PUT', body: JSON.stringify(data) });
});

export const deleteRecord = sense('api', [meta_present, edge_group_seen], async function delete_record(
  id: number,
): Promise<{ deleted: number; meta: Meta }> {
  return request(`/${apiChoice()}/records/${id}`, { method: 'DELETE' });
});

export type GraphNode = { fn: string; scope: string; count: number; err: number; ms_avg: number };
export type GraphEdge = { from: string; to: string; count: number };
export type GraphResult = { api: string; mode: string; nodes: GraphNode[]; edges: GraphEdge[] };

const graph_present: Invariant = {
  name: 'graph_present',
  check: (r) => Array.isArray((r as GraphResult)?.nodes),
};

export const sensorsGraph = sense('api', [graph_present], async function sensors_graph(): Promise<GraphResult> {
  return request(`/${apiChoice()}/api/sensors/graph`);
});

// /api/tls-info is edge-level (nginx routes it to the python api unrewritten);
// its shape has edge_group at top level, not under meta.
const edge_group_reported: Invariant = {
  name: 'edge_group_reported',
  check: (r) => (r as TlsInfo)?.edge_group != null,
};

export const getTlsInfo = sense('api', [edge_group_reported], async function tls_info(): Promise<TlsInfo> {
  return request('/api/tls-info');
});
