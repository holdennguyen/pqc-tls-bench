import { Navigate, Route, Routes } from 'react-router-dom';
import Layout from './components/Layout';
import { currentUser } from './auth';
import Dashboard from './pages/Dashboard';
import Login from './pages/Login';
import RecordDetail from './pages/RecordDetail';
import RecordForm from './pages/RecordForm';
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
        <Route path="/records/new" element={<RecordForm />} />
        <Route path="/records/:id" element={<RecordDetail />} />
        <Route path="/records/:id/edit" element={<RecordForm />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
