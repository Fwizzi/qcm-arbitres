import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './hooks/useAuth';
import ProtectedRoute from './components/ProtectedRoute';
import Login from './pages/Login';
import AdminDashboard from './pages/admin/Dashboard';
import Comptes from './pages/admin/Comptes';
import Journal from './pages/admin/Journal';
import Reglages from './pages/admin/Reglages';
import FormateurDashboard from './pages/formateur/Dashboard';
import QuizForm from './pages/formateur/QuizForm';
import QuizQuestions from './pages/formateur/QuizQuestions';
import QuizResultats from './pages/formateur/QuizResultats';
import Groupes from './pages/formateur/Groupes';
import GroupMembers from './pages/formateur/GroupMembers';
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
            path="/admin/comptes"
            element={
              <ProtectedRoute role="admin">
                <Comptes />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/journal"
            element={
              <ProtectedRoute role="admin">
                <Journal />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/reglages"
            element={
              <ProtectedRoute role="admin">
                <Reglages />
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
            path="/formateur/qcm/nouveau"
            element={
              <ProtectedRoute role="formateur">
                <QuizForm />
              </ProtectedRoute>
            }
          />
          <Route
            path="/formateur/qcm/:id"
            element={
              <ProtectedRoute role="formateur">
                <QuizForm />
              </ProtectedRoute>
            }
          />
          <Route
            path="/formateur/qcm/:id/questions"
            element={
              <ProtectedRoute role="formateur">
                <QuizQuestions />
              </ProtectedRoute>
            }
          />
          <Route
            path="/formateur/qcm/:id/resultats"
            element={
              <ProtectedRoute role="formateur">
                <QuizResultats />
              </ProtectedRoute>
            }
          />
          <Route
            path="/formateur/groupes"
            element={
              <ProtectedRoute role="formateur">
                <Groupes />
              </ProtectedRoute>
            }
          />
          <Route
            path="/formateur/groupes/:id"
            element={
              <ProtectedRoute role="formateur">
                <GroupMembers />
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
