import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { apiChoice, getTlsInfo, setApiChoice, type TlsInfo } from '../api';
import { currentUser, logout } from '../auth';
import { emit, onSensor, type SensorEvent } from '../sensors';

/** Telemetry strip — the last sensor event, worn like a patient monitor. */
function TelemetryStrip() {
  const [last, setLast] = useState<SensorEvent | null>(null);
  const [beat, setBeat] = useState(0);
  useEffect(
    () =>
      onSensor((e) => {
        setLast(e);
        setBeat((b) => b + 1);
      }),
    [],
  );
  return (
    <footer className="strip" data-testid="telemetry-strip" aria-live="polite">
      <span className={`pulse ${beat ? 'beat' : ''}`} key={beat} />
      <span className="lbl">đường truyền</span>
      {last ? (
        <>
          <b>{last.scope}</b>·<b>{last.fn}</b>·<span>{last.ms} ms</span>·
          <span className={last.ok ? '' : 'err'}>{last.ok ? 'ok' : 'lỗi'}</span>·
          <span>
            bất biến {last.invariant_results.filter((i) => i.pass).length}/{last.invariant_results.length}
          </span>
        </>
      ) : (
        <span>chờ sự kiện đầu tiên…</span>
      )}
    </footer>
  );
}

export default function Layout() {
  const [tls, setTls] = useState<TlsInfo | null>(null);
  const [api, setApi] = useState(apiChoice());
  const navigate = useNavigate();
  const location = useLocation();
  const routeT0 = useRef(performance.now());

  useEffect(() => {
    getTlsInfo().then(setTls).catch(() => setTls(null));
  }, []);

  // mode color tints the whole chrome (focus rings, active nav, strip pulse)
  useEffect(() => {
    if (!tls) return;
    document.documentElement.style.setProperty(
      '--mode',
      tls.mode === 'hybrid' ? 'var(--hybrid)' : 'var(--classic)',
    );
  }, [tls]);

  // sensor scope "route": one line per navigation, ms ≈ time to committed paint
  useEffect(() => {
    const t0 = routeT0.current;
    let raf = 0;
    raf = requestAnimationFrame(() =>
      requestAnimationFrame(() =>
        emit(location.pathname, 'route', true, performance.now() - t0, [
          { name: 'authenticated', pass: currentUser() != null },
        ]),
      ),
    );
    return () => {
      cancelAnimationFrame(raf);
      routeT0.current = performance.now();
    };
  }, [location.pathname]);

  const group = tls?.edge_group ?? '…';

  return (
    <div className="shell">
      <aside className="side">
        <div className="wordmark">
          Phòng khám An Khang<small>hồ sơ bệnh án · pqc-tls-bench</small>
        </div>
        <nav>
          <NavLink to="/" end>Tổng quan</NavLink>
          <NavLink to="/records">Hồ sơ bệnh án</NavLink>
          <NavLink to="/records/new">Tạo hồ sơ mới</NavLink>
        </nav>
        <div className="ext">
          <h4>Giám sát</h4>
          <nav>
            <a href="http://localhost:3000/d/pqc-vs-classic" target="_blank" rel="noreferrer">Grafana — so sánh chế độ</a>
            <a href="http://localhost:16686" target="_blank" rel="noreferrer">Jaeger — truy vết request</a>
            <a href="/scan" target="_blank">Khảo sát PQC thực tế</a>
          </nav>
        </div>
      </aside>
      <div className="main">
        <header className="topbar">
          <h1>Hồ sơ bệnh án</h1>
          <select
            aria-label="API phục vụ"
            data-testid="api-select"
            value={api}
            onChange={(e) => {
              const v = e.target.value as 'py' | 'node';
              setApiChoice(v);
              setApi(v);
            }}
          >
            <option value="py">API: Python</option>
            <option value="node">API: Node</option>
          </select>
          <span className="badge" data-testid="tls-badge">{group}</span>
          <button
            className="btn"
            onClick={async () => {
              await logout();
              navigate('/login');
            }}
          >
            Đăng xuất
          </button>
        </header>
        <div className="content">
          <Outlet />
        </div>
      </div>
      <TelemetryStrip />
    </div>
  );
}
