import { Navigate, Route, Routes } from 'react-router-dom';
import Layout from './components/Layout';
import { currentUser } from './auth';
import Dashboard from './pages/Dashboard';
import Login from './pages/Login';
import Records from './pages/Records';

function RequireAuth({ children }: { children: React.ReactNode }) {
  if (!currentUser()) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        element={
          <RequireAuth>
            <Layout />
          </RequireAuth>
        }
      >
        <Route path="/" element={<Dashboard />} />
        <Route path="/records" element={<Records />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
