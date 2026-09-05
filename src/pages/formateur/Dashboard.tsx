import AppLayout from '../../components/AppLayout';
import { useAuth } from '../../hooks/useAuth';

export default function FormateurDashboard() {
  const { profile } = useAuth();

  return (
    <AppLayout>
      <h1 className="text-lg font-semibold mb-1">Mes QCM</h1>
      <p className="text-sm text-muted">
        Bonjour {profile?.full_name}. Cet écran sera complété avec la liste des QCM et leurs
        statuts, comme validé sur les maquettes.
      </p>
    </AppLayout>
  );
}
