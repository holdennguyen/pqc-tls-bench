import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { login } from '../auth';

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const navigate = useNavigate();

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    await login(username.trim() || 'demo');
    navigate('/');
  }

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={onSubmit} data-testid="login-form">
        <div className="wordmark">Phòng khám An Khang</div>
        <p className="sub">Hệ thống hồ sơ bệnh án — đăng nhập để tiếp tục</p>
        <label htmlFor="u">Tên đăng nhập</label>
        <input id="u" type="text" autoComplete="username" value={username}
          onChange={(e) => setUsername(e.target.value)} placeholder="bacsi.an" />
        <label htmlFor="p">Mật khẩu</label>
        <input id="p" type="password" autoComplete="current-password" value={password}
          onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
        <label />
        <button className="btn primary" type="submit" style={{ width: '100%' }}>
          Đăng nhập
        </button>
        <p className="demo-note">
          Bản demo đo đạc TLS — phiên chỉ mang tính minh họa, mọi thông tin đăng nhập
          đều được chấp nhận và không có xác thực thật.
        </p>
      </form>
    </div>
  );
}
