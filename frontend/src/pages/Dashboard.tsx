import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getTlsInfo, listRecords, type Meta, type TlsInfo } from '../api';
import MetaChips from '../components/MetaChips';

export default function Dashboard() {
  const [tls, setTls] = useState<TlsInfo | null>(null);
  const [total, setTotal] = useState<number | null>(null);
  const [meta, setMeta] = useState<Meta | null>(null);

  useEffect(() => {
    getTlsInfo().then(setTls).catch(() => setTls(null));
    listRecords({ limit: 1 })
      .then((r) => {
        setTotal(r.meta.total ?? r.records.length);
        setMeta(r.meta);
      })
      .catch(() => setTotal(null));
  }, []);

  const hybrid = tls?.mode === 'hybrid';

  return (
    <>
      <div className="stat-grid">
        <div className="stat" data-testid="stat-records">
          <div className="v">{total ?? '…'}</div>
          <div className="k">hồ sơ trong hệ thống</div>
        </div>
        <div className="stat">
          <div className="v mono" style={{ fontSize: 18, color: hybrid ? 'var(--hybrid)' : 'var(--classic)' }}>
            {tls?.edge_group ?? '…'}
          </div>
          <div className="k">nhóm trao đổi khóa (trình duyệt → biên)</div>
        </div>
        <div className="stat">
          <div className="v mono" style={{ fontSize: 18 }}>{tls ? (hybrid ? 'lai ghép' : 'cổ điển') : '…'}</div>
          <div className="k">chế độ của cổng này</div>
        </div>
      </div>

      <div className="panel">
        <h2>Kết nối vừa dùng</h2>
        <p style={{ color: 'var(--muted)', fontSize: 13, margin: '0 0 10px' }}>
          Mỗi phản hồi mang theo nguồn gốc của nó: API phục vụ, nhóm TLS ở biên, trạng thái cache.
        </p>
        <MetaChips meta={meta} />
      </div>

      <div className="panel">
        <h2>Bắt đầu</h2>
        <p style={{ margin: 0 }}>
          <Link to="/records">Xem danh sách hồ sơ</Link> · <Link to="/records/new">Tạo hồ sơ mới</Link>
        </p>
      </div>
    </>
  );
}
