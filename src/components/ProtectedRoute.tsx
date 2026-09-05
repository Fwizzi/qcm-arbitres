import { type ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth, type AppRole } from '../hooks/useAuth';

interface ProtectedRouteProps {
  role: AppRole;
  children: ReactNode;
}

/**
 * Autorise l'accès uniquement si la personne connectée possède le rôle
 * demandé (parmi les rôles qui lui ont été attribués par l'administrateur).
 * Redirige vers la connexion si non connecté, ou vers son propre espace
 * si elle est connectée mais n'a pas ce rôle-là.
 */
export default function ProtectedRoute({ role, children }: ProtectedRouteProps) {
  const { loading, session, roles } = useAuth();

  if (loading) {
    return <p className="p-6 text-sm text-muted">Chargement…</p>;
  }

  if (!session) {
    return <Navigate to="/login" replace />;
  }

  if (!roles.includes(role)) {
    const repli = roles[0];
    return <Navigate to={repli ? `/${repli}` : '/login'} replace />;
  }

  return <>{children}</>;
}
