/** The provenance contract made visible: which API served the response, which
 * TLS group the edge negotiated, cache hit/miss. Same semantics as the old
 * chips() helper — this is the "database call / UI response" story. */
import type { Meta } from '../api';

export default function MetaChips({ meta }: { meta: Meta | null }) {
  if (!meta) return null;
  const g = meta.tls_group_edge ?? 'không rõ';
  const gClass = g.includes('MLKEM') ? 'g-hybrid' : 'g-classic';
  return (
    <span data-testid="meta-chips">
      <span className={`chip api-${meta.served_by}`}>api: {meta.served_by}</span>
      <span className={`chip ${gClass}`}>tls: {g}</span>
      <span className="chip">mode: {meta.mode}</span>
      {meta.cache && <span className={`chip ${meta.cache === 'hit' ? 'cache-hit' : ''}`}>cache: {meta.cache}</span>}
    </span>
  );
}
