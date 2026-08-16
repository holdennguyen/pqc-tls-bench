import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { listRecords, type Meta, type Rec } from '../api';
import MetaChips from '../components/MetaChips';

export default function Records() {
  const [records, setRecords] = useState<Rec[]>([]);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    listRecords()
      .then((r) => {
        setRecords(r.records);
        setMeta(r.meta);
        setError(null);
      })
      .catch((e) => setError(e.message));
  }, []);

  return (
    <div className="panel">
      <div className="row" style={{ marginBottom: 12 }}>
        <h2 style={{ margin: 0 }} className="grow">Danh sách hồ sơ</h2>
        <MetaChips meta={meta} />
      </div>
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
      {records.length === 0 && !error && <div className="empty">Chưa có hồ sơ nào.</div>}
    </div>
  );
}
