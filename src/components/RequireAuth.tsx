import { type ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

export default function RequireAuth({ children }: { children: ReactNode }) {
  const { loading, session } = useAuth();

  if (loading) {
    return <p className="p-6 text-sm text-muted">Chargement…</p>;
  }
  if (!session) {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
}
