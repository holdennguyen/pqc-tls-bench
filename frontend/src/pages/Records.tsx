import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { listRecords, type Meta, type Rec } from '../api';
import MetaChips from '../components/MetaChips';

const PAGE = 20;

export default function Records() {
  const [records, setRecords] = useState<Rec[]>([]);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const [offset, setOffset] = useState(0);
  const navigate = useNavigate();

  const load = useCallback(() => {
    listRecords({ search: search || undefined, limit: PAGE, offset })
      .then((r) => {
        setRecords(r.records);
        setMeta(r.meta);
        setError(null);
      })
      .catch((e) => setError(e.message));
  }, [search, offset]);

  useEffect(load, [load]);

  function onSearch(e: FormEvent) {
    e.preventDefault();
    setOffset(0);
    setSearch(query.trim());
  }

  const total = meta?.total ?? 0;
  const from = total === 0 ? 0 : offset + 1;
  const to = offset + records.length;

  return (
    <div className="panel">
      <div className="row" style={{ marginBottom: 12 }}>
        <h2 style={{ margin: 0 }} className="grow">Danh sách hồ sơ</h2>
        <MetaChips meta={meta} />
      </div>
      <form className="row" style={{ marginBottom: 14 }} onSubmit={onSearch}>
        <input
          type="search"
          className="grow"
          data-testid="search-input"
          placeholder="Tìm theo tên hoặc chẩn đoán…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Tìm hồ sơ"
        />
        <button className="btn" type="submit" data-testid="btn-search">Tìm</button>
        <Link className="btn primary" to="/records/new">Tạo hồ sơ mới</Link>
      </form>
      {error && <div className="error-box">Không tải được danh sách: {error}</div>}
      <table data-testid="records-table">
        <thead>
          <tr>
            <th>#</th>
            <th>Họ tên</th>
            <th>Ngày sinh</th>
            <th>Chẩn đoán</th>
          </tr>
        </thead>
        <tbody>
          {records.map((r) => (
            <tr key={r.id} onClick={() => navigate(`/records/${r.id}`)}>
              <td className="mono">{r.id}</td>
              <td>{r.patient_name}</td>
              <td className="mono">{r.dob}</td>
              <td>{r.diagnosis}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {records.length === 0 && !error && (
        <div className="empty">
          {search ? `Không tìm thấy hồ sơ nào cho “${search}” — thử từ khóa khác.` : 'Chưa có hồ sơ nào.'}
        </div>
      )}
      <div className="row" style={{ marginTop: 14 }}>
        <span className="grow mono" style={{ fontSize: 12, color: 'var(--muted)' }} data-testid="page-info">
          {from}–{to} / {total}
        </span>
        <button className="btn" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE))}>
          ← Trang trước
        </button>
        <button className="btn" disabled={to >= total} onClick={() => setOffset(offset + PAGE)}>
          Trang sau →
        </button>
      </div>
    </div>
  );
}
