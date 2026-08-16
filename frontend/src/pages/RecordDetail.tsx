import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { deleteRecord, getRecord, type Meta, type Rec } from '../api';
import MetaChips from '../components/MetaChips';

export default function RecordDetail() {
  const { id } = useParams();
  const rid = Number(id);
  const [rec, setRec] = useState<Rec | null>(null);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  const load = useCallback(() => {
    getRecord(rid)
      .then((r) => {
        setRec(r.record);
        setMeta(r.meta);
        setError(null);
      })
      .catch((e) => setError(e.status === 404 ? 'Hồ sơ không tồn tại hoặc đã bị xóa.' : e.message));
  }, [rid]);

  useEffect(load, [load]);

  async function onDelete() {
    if (!window.confirm(`Xóa hồ sơ #${rid}? Hành động này không thể hoàn tác.`)) return;
    await deleteRecord(rid);
    navigate('/records');
  }

  if (error) return <div className="error-box">{error}</div>;
  if (!rec) return <div className="empty">Đang tải hồ sơ…</div>;

  return (
    <div className="panel" data-testid="record-detail">
      <div className="row" style={{ marginBottom: 14 }}>
        <h2 style={{ margin: 0 }} className="grow">
          Hồ sơ <span className="mono">#{rec.id}</span>
        </h2>
        <MetaChips meta={meta} />
      </div>
      <table>
        <tbody>
          <tr><td style={{ color: 'var(--muted)', width: 140 }}>Họ tên</td><td data-testid="d-name">{rec.patient_name}</td></tr>
          <tr><td style={{ color: 'var(--muted)' }}>Ngày sinh</td><td className="mono">{rec.dob}</td></tr>
          <tr><td style={{ color: 'var(--muted)' }}>Chẩn đoán</td><td data-testid="d-diagnosis">{rec.diagnosis}</td></tr>
          <tr><td style={{ color: 'var(--muted)' }}>Ghi chú</td><td>{rec.notes || '—'}</td></tr>
          <tr><td style={{ color: 'var(--muted)' }}>Tạo lúc</td><td className="mono">{rec.created_at}</td></tr>
        </tbody>
      </table>
      <div className="row" style={{ marginTop: 16 }}>
        <button className="btn" onClick={load} data-testid="btn-reload">
          Tải lại (xem cache)
        </button>
        <span className="grow" />
        <Link className="btn" to={`/records/${rec.id}/edit`} data-testid="btn-edit">Sửa hồ sơ</Link>
        <button className="btn danger" onClick={onDelete} data-testid="btn-delete">Xóa hồ sơ</button>
      </div>
    </div>
  );
}
