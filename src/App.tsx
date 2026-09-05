import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './hooks/useAuth';
import ProtectedRoute from './components/ProtectedRoute';
import Login from './pages/Login';
import AdminDashboard from './pages/admin/Dashboard';
import FormateurDashboard from './pages/formateur/Dashboard';
import ArbitreAccueil from './pages/arbitre/Dashboard';

function AccueilRedirect() {
  const { loading, session, roles } = useAuth();
  if (loading) return <p className="p-6 text-sm text-muted">Chargement…</p>;
  if (!session) return <Navigate to="/login" replace />;
  return <Navigate to={roles[0] ? `/${roles[0]}` : '/login'} replace />;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter basename="/qcm-arbitres">
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route
            path="/admin"
            element={
              <ProtectedRoute role="admin">
                <AdminDashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/formateur"
            element={
              <ProtectedRoute role="formateur">
                <FormateurDashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/arbitre"
            element={
              <ProtectedRoute role="arbitre">
                <ArbitreAccueil />
              </ProtectedRoute>
            }
          />
          <Route path="/" element={<AccueilRedirect />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
