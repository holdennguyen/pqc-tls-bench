/** api-node — medical-records API (plain node:https, no framework). TLS everywhere:
 * inbound https (H2b), outbound pg TLS (H3) and redis TLS (H4).
 * Key-exchange groups restricted to exactly one per mode via ecdhCurve. */
import https from 'node:https';
import fs from 'node:fs';
import { Pool } from 'pg';
import { createClient } from 'redis';
import { sensor } from './sensors.ts';
import {
  MODE, GROUP, STATE,
  db_tls13, db_group_matches_mode, cache_tls13, cache_group_matches_mode, mode_configured,
} from './tls_state.ts';

const SERVICE = `api-node-${MODE}`;
const POOL_SIZE = parseInt(process.env.POOL || '10', 10);
const CACHE_TTL = 60;
const CA = fs.readFileSync('/certs/server.crt');
const KEY = fs.readFileSync('/certs/server.key');

const pool = new Pool({
  host: process.env.PGHOST,
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  database: process.env.PGDATABASE,
  min: POOL_SIZE,
  max: POOL_SIZE,
  application_name: SERVICE,
  ssl: { ca: CA, servername: 'postgres', ecdhCurve: GROUP },  // THE experiment variable (H3)
});
pool.on('connect', (client: any) => {
  const s = client.connection?.stream;
  if (s?.getEphemeralKeyInfo) {
    // {} for hybrid/KEM groups; {name:'X25519'} for classical — record what we see
    STATE.db.observed_group = s.getEphemeralKeyInfo()?.name ?? null;
  }
});

const cache = createClient({
  name: SERVICE,
  socket: { host: process.env.REDIS_HOST, port: 6379, tls: true, ca: CA, servername: 'redis', ecdhCurve: GROUP },  // (H4)
});
cache.on('error', (e) => console.error('[redis]', e.message));

const db_read = sensor('db', [db_tls13, db_group_matches_mode])(
  async function db_read(id: number) {
    const r = await pool.query('SELECT * FROM records WHERE id = $1', [id]);
    return r.rows[0] ?? null;
  });

const db_write = sensor('db', [db_tls13, db_group_matches_mode])(
  async function db_write(patient_name: string, dob: string, diagnosis: string, notes: string) {
    const r = await pool.query(
      'INSERT INTO records (patient_name, dob, diagnosis, notes) VALUES ($1, $2::date, $3, $4) RETURNING *',
      [patient_name, dob, diagnosis, notes]);
    return r.rows[0];
  });

const db_list = sensor('db', [db_tls13, db_group_matches_mode])(
  async function db_list(limit: number) {
    const r = await pool.query('SELECT * FROM records ORDER BY id LIMIT $1', [limit]);
    return r.rows;
  });

const cache_get = sensor('cache', [cache_tls13, cache_group_matches_mode])(
  async function cache_get(key: string) { return cache.get(key); });

const cache_set = sensor('cache', [cache_tls13, cache_group_matches_mode])(
  async function cache_set(key: string, value: string) { await cache.set(key, value, { EX: CACHE_TTL }); });

function recToDict(row: any) {
  return {
    id: row.id,
    patient_name: row.patient_name,
    dob: row.dob instanceof Date ? row.dob.toISOString().slice(0, 10) : String(row.dob),
    diagnosis: row.diagnosis,
    notes: row.notes,
    created_at: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
  };
}

function meta(req: https.IncomingMessage | any, cacheStatus?: string) {
  const m: any = { served_by: 'node', mode: MODE, tls_group_edge: req.headers['x-tls-group'] ?? null };
  if (cacheStatus !== undefined) m.cache = cacheStatus;
  return m;
}

function send(res: any, status: number, body: any) {
  const buf = JSON.stringify(body);
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(buf);
}

const health = sensor('handler', [mode_configured])(
  async function health(req: any, res: any) {
    // no data touch — isolates pure TLS cost
    send(res, 200, { status: 'ok', api: 'node', mode: MODE });
  });

const list_records = sensor('handler', [mode_configured])(
  async function list_records(req: any, res: any) {
    const url = new URL(req.url, 'https://x');
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '100', 10), 200);
    const rows = await db_list(limit);
    send(res, 200, { records: rows.map(recToDict), meta: meta(req) });
  });

const get_record = sensor('handler', [mode_configured])(
  async function get_record(req: any, res: any, id: number) {
    const key = `rec:${id}`;
    const cached = await cache_get(key);
    if (cached !== null) return send(res, 200, { record: JSON.parse(cached), meta: meta(req, 'hit') });
    const row = await db_read(id);
    if (!row) return send(res, 404, { detail: 'record not found' });
    const rec = recToDict(row);
    await cache_set(key, JSON.stringify(rec));
    send(res, 200, { record: rec, meta: meta(req, 'miss') });
  });

const create_record = sensor('handler', [mode_configured])(
  async function create_record(req: any, res: any, body: any) {
    for (const f of ['patient_name', 'dob', 'diagnosis']) {
      if (!body?.[f]) return send(res, 422, { detail: `missing field: ${f}` });
    }
    const row = await db_write(body.patient_name, body.dob, body.diagnosis, body.notes ?? '');
    send(res, 201, { record: recToDict(row), meta: meta(req) });
  });

const tls_info = sensor('handler', [mode_configured])(
  async function tls_info(req: any, res: any) {
    send(res, 200, {
      api: 'node',
      mode: MODE,
      edge_group: req.headers['x-tls-group'] ?? null,
      client_groups_offered: GROUP,
      db: STATE.db,
      cache: STATE.cache,
    });
  });

async function route(req: any, res: any) {
  const url = new URL(req.url, 'https://x');
  const recordMatch = url.pathname.match(/^\/records\/(\d+)$/);
  try {
    if (req.method === 'GET' && url.pathname === '/health') return await health(req, res);
    if (req.method === 'GET' && url.pathname === '/records') return await list_records(req, res);
    if (req.method === 'GET' && url.pathname === '/api/tls-info') return await tls_info(req, res);
    if (req.method === 'GET' && recordMatch) return await get_record(req, res, parseInt(recordMatch[1], 10));
    if (req.method === 'POST' && url.pathname === '/records') {
      let raw = '';
      for await (const chunk of req) raw += chunk;
      return await create_record(req, res, raw ? JSON.parse(raw) : {});
    }
    send(res, 404, { detail: 'not found' });
  } catch (e: any) {
    console.error('[error]', e);
    send(res, 500, { detail: e.message });
  }
}

async function main() {
  await cache.connect();
  STATE.cache = { connected: true, version: null };
  const r = await pool.query('SELECT ssl, version FROM pg_stat_ssl WHERE pid = pg_backend_pid()');
  STATE.db.connected = true;
  STATE.db.ssl = r.rows[0].ssl;
  STATE.db.version = r.rows[0].version;
  console.log(`[startup] ${SERVICE} db=${JSON.stringify(STATE.db)} cache=${JSON.stringify(STATE.cache)}`);

  // inbound H2b: server also restricted to the mode's single group (ecdhCurve)
  https.createServer({ key: KEY, cert: CA, ecdhCurve: GROUP, minVersion: 'TLSv1.3' }, route)
    .listen(8000, () => console.log(`[startup] ${SERVICE} listening :8000 group=${GROUP}`));
}

main().catch((e) => { console.error('[fatal]', e); process.exit(1); });
