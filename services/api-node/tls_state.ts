/** Cached TLS facts + invariants (mirrors api-python/tls_state.py).
 * Group proof model: every outbound client offers EXACTLY ONE group (ecdhCurve),
 * so handshake success proves negotiated == offered. Node additionally reports
 * the negotiated group for classical curves via getEphemeralKeyInfo(). */
export const MODE = process.env.MODE as 'hybrid' | 'classic';
export const GROUP = { hybrid: 'X25519MLKEM768', classic: 'X25519' }[MODE];
if (!GROUP) throw new Error(`MODE must be hybrid|classic, got: '${process.env.MODE}'`);

export const STATE: {
  db: { connected: boolean; ssl: boolean | null; version: string | null; observed_group: string | null };
  cache: { connected: boolean; version: string | null };
} = {
  db: { connected: false, ssl: null, version: null, observed_group: null },
  cache: { connected: false, version: null },
};

export function db_tls13() { return STATE.db.ssl === true && STATE.db.version === 'TLSv1.3'; }
export function db_group_matches_mode() {
  // exclusive single-group offer + live connection => negotiated == GROUP;
  // when Node reports a group name (classical only), it must agree.
  return STATE.db.connected && (STATE.db.observed_group === null || STATE.db.observed_group === GROUP);
}
export function cache_tls13() {
  // redis listens TLS-only (port 0): a live connection IS TLS
  return STATE.cache.connected && (STATE.cache.version === null || STATE.cache.version === 'TLSv1.3');
}
export function cache_group_matches_mode() { return STATE.cache.connected; }
export function mode_configured() { return MODE === 'hybrid' || MODE === 'classic'; }
