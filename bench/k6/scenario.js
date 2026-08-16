// Clinic traffic against one edge. Open model (constant-arrival-rate) so the
// request rate is held even if the system slows (no coordinated omission).
// PROFILE=churn  -> new TCP+TLS connection per request (handshake cost visible)
// PROFILE=pooled -> connections reused (handshake amortized: the hypothesis)
import http from 'k6/http';
import { check, fail } from 'k6';

const MODE = __ENV.MODE;                       // hybrid | classic
const PROFILE = __ENV.PROFILE;                 // churn | pooled
const RATE = parseInt(__ENV.RATE || '15', 10); // requests/second
const DURATION = __ENV.DURATION || '30s';
const RTT = __ENV.RTT || '0';                  // netem-added delay label (ms)
const REP = __ENV.REP || '0';
// Writing into results/ (the OFFICIAL thesis dataset) is opt-in: only run_all.sh
// sets OFFICIAL=1. Warmups, demos, and ad-hoc runs stream metrics to Grafana but
// leave no file behind — a stray file would poison gate_bench's completeness check.
const OFFICIAL = __ENV.OFFICIAL === '1';
const BASE = `https://nginx-${MODE}`;
const EXPECT_GROUP = MODE === 'hybrid' ? 'X25519MLKEM768' : 'X25519';

export const options = {
  insecureSkipTLSVerify: true, // self-signed testbed cert
  noConnectionReuse: PROFILE === 'churn',
  noVUConnectionReuse: PROFILE === 'churn',
  summaryTrendStats: ['avg', 'min', 'med', 'p(90)', 'p(95)', 'p(99)', 'max', 'count'],
  // NOTE: do NOT put run metadata in options.tags — those tags never reach the
  // prometheus remote-write output (verified 2026-08-16). Pass them on the CLI:
  //   --tag testid=... --tag mode=... --tag profile=... (see run_all.sh / DEMO.md)
  scenarios: {
    clinic: {
      executor: 'constant-arrival-rate',
      rate: RATE,
      timeUnit: '1s',
      duration: DURATION,
      preAllocatedVUs: Math.max(20, RATE * 2),
      maxVUs: RATE * 6,
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.05'],
    checks: ['rate>0.99'],
  },
};

export function setup() {
  // k6 (Go 1.26) offers X25519MLKEM768 by default; the edge echoes what THIS
  // connection negotiated. Abort the run if the mode's group is not negotiated.
  const info = http.get(`${BASE}/api/tls-info`);
  const group = info.json('edge_group');
  if (group !== EXPECT_GROUP) fail(`edge negotiated ${group}, expected ${EXPECT_GROUP}`);
}

export default function () {
  const api = Math.random() < 0.5 ? 'py' : 'node';
  if (Math.random() < 0.8) {
    const id = 1 + Math.floor(Math.random() * 50);
    const r = http.get(`${BASE}/${api}/records/${id}`, { tags: { name: 'GetRecord', api } });
    check(r, { 'get 200': (x) => x.status === 200 });
  } else {
    const r = http.post(
      `${BASE}/${api}/records`,
      JSON.stringify({
        patient_name: `k6 ${MODE} ${PROFILE}`,
        dob: '1990-01-01',
        diagnosis: 'k6 synthetic load',
        notes: `rate=${RATE} rtt=${RTT} rep=${REP}`,
      }),
      { headers: { 'Content-Type': 'application/json' }, tags: { name: 'CreateRecord', api } },
    );
    check(r, { 'post 201': (x) => x.status === 201 });
  }
}

export function handleSummary(data) {
  if (!OFFICIAL) return {}; // only run_all.sh writes the thesis dataset
  const name = `/results/k6-${MODE}-${PROFILE}-r${RATE}-rtt${RTT}-rep${REP}.json`;
  const out = {
    meta: { mode: MODE, profile: PROFILE, rate: RATE, rtt: parseInt(RTT, 10), rep: parseInt(REP, 10) },
    metrics: data.metrics,
  };
  return { [name]: JSON.stringify(out, null, 1) };
}
